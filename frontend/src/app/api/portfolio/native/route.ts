/**
 * Native Portfolio API Route
 * GET: Get user's native market positions
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAddress, createPublicClient, http } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { chainsToContracts, getAvalancheRpcUrl, getAvalancheFallbackRpcUrl, getChainId } from '@/constants';
import { MarketSource } from '@/types/externalMarket';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { isTier2EventSourced } from '@/lib/storage/featureFlags';
import { getResilientPublicClient } from '@/lib/viemClient';
import { getNativeTradesForTrader } from '@/lib/eventQuery/nativeTrades';
import { log } from '@/lib/api/logger';

const RPC_TIMEOUT = 60000;

// Simplified ABI for PredictionMarketAMM
const predictionMarketAbi = [
  {
    type: 'function',
    name: 'getMarket',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'question', type: 'string' },
          { name: 'yesPrice', type: 'uint256' },
          { name: 'noPrice', type: 'uint256' },
          { name: 'endTime', type: 'uint256' },
          { name: 'resolved', type: 'bool' },
          { name: 'outcome', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

const avalancheClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(getAvalancheRpcUrl(), { timeout: RPC_TIMEOUT }),
});

const avalancheFallbackClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(getAvalancheFallbackRpcUrl(), { timeout: RPC_TIMEOUT }),
});

async function executeWithFallback<T>(
  operation: (client: typeof avalancheClient) => Promise<T>
): Promise<T> {
  try {
    return await operation(avalancheClient);
  } catch (error) {
    const errMsg = (error as Error).message || '';
    if (errMsg.includes('timeout') || errMsg.includes('timed out')) {
      return await operation(avalancheFallbackClient);
    }
    throw error;
  }
}

/**
 * Tier-2 read switch: event-sourced when ENABLE_0G_TIER2=1, Prisma otherwise.
 * On any failure (RPC down, range too large, missing contract address), falls
 * back to Prisma with a logged warning so the page never goes blank during
 * rollout.
 *
 * Note: nothing in the indexer writes native trades into `mirrorTrade` with
 * an empty mirrorKey, so the Prisma branch here returns zero rows in
 * practice; the event-sourced branch is the corrected path.
 */
async function readNativeTrades(traderAddress: `0x${string}`) {
  const prismaRead = () =>
    prisma.mirrorTrade.findMany({
      where: {
        traderAddress,
        mirrorKey: '',
      },
      orderBy: { timestamp: 'desc' },
    });

  if (!isTier2EventSourced()) return prismaRead();

  const contracts = chainsToContracts[getChainId()];
  const predictionMarketAddress = contracts?.predictionMarketAMM as
    | `0x${string}`
    | undefined;
  if (
    !predictionMarketAddress ||
    predictionMarketAddress === '0x0000000000000000000000000000000000000000'
  ) {
    log.warn('[portfolio/native] no predictionMarketAMM contract for chain; using Prisma');
    return prismaRead();
  }

  try {
    const client = getResilientPublicClient();
    const events = await getNativeTradesForTrader(
      client,
      predictionMarketAddress,
      traderAddress
    );
    return events.sort((a, b) => b.blockNumber - a.blockNumber);
  } catch (err) {
    log.warn('[portfolio/native] event-sourced read failed; falling back to Prisma', {
      error: err instanceof Error ? err.message : String(err),
    });
    return prismaRead();
  }
}

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'portfolio-native',
      maxRequests: 30,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    // Validate address
    if (!address || !isAddress(address)) {
      throw ErrorResponses.badRequest('Invalid or missing address parameter');
    }

    const trades = await readNativeTrades(address.toLowerCase() as `0x${string}`);

    // Group trades by market. `trades` is a union of Prisma rows and
    // event-sourced rows — the downstream loop only reads fields common to
    // both, but the .push() call below would otherwise have to be the
    // intersection. Widen to the element type explicitly.
    type Trade = (typeof trades)[number];
    const marketPositions = new Map<
      string,
      {
        marketId: string;
        trades: Trade[];
        totalShares: bigint;
        totalCost: bigint;
        isYes: boolean;
      }
    >();

    for (const trade of trades) {
      const key = `${trade.onChainMarketId}-${trade.isYes}`;
      if (!marketPositions.has(key)) {
        marketPositions.set(key, {
          marketId: trade.onChainMarketId?.toString() || '',
          trades: [],
          totalShares: 0n,
          totalCost: 0n,
          isYes: trade.isYes,
        });
      }
      const pos = marketPositions.get(key)!;
      pos.trades.push(trade);
      pos.totalShares += BigInt(trade.sharesReceived || '0');
      pos.totalCost += BigInt(trade.amount || '0');
    }

    // Get contract address
    const contracts = chainsToContracts[getChainId()];
    const predictionMarketAddress = contracts?.predictionMarketAMM as `0x${string}`;

    // Fetch current market data for each position
    const positions = [];
    for (const [, pos] of marketPositions) {
      if (!pos.marketId || pos.totalShares === 0n) continue;

      let marketData = null;
      try {
        if (predictionMarketAddress) {
          marketData = await executeWithFallback((client) =>
            client.readContract({
              address: predictionMarketAddress,
              abi: predictionMarketAbi,
              functionName: 'getMarket',
              args: [BigInt(pos.marketId)],
            })
          );
        }
      } catch (e) {
        console.warn(`Failed to fetch market ${pos.marketId}:`, e);
      }

      const currentPrice = marketData
        ? Number(pos.isYes ? marketData.yesPrice : marketData.noPrice) / 100
        : 50;
      const avgPrice =
        pos.totalShares > 0n
          ? Number((pos.totalCost * 100n) / pos.totalShares) / 100
          : 50;

      // Calculate unrealized PnL
      const currentValue = (pos.totalShares * BigInt(Math.floor(currentPrice * 100))) / 100n;
      const unrealizedPnL = currentValue - pos.totalCost;

      positions.push({
        id: `native-${pos.marketId}-${pos.isYes ? 'yes' : 'no'}`,
        marketId: pos.marketId,
        marketQuestion: marketData?.question || 'Unknown Market',
        source: MarketSource.NATIVE,
        isYes: pos.isYes,
        shares: pos.totalShares.toString(),
        avgPrice,
        currentPrice,
        unrealizedPnL: unrealizedPnL.toString(),
        realizedPnL: '0', // Would need resolution data
        entryTimestamp: pos.trades[0]?.timestamp || 0,
        resolved: marketData?.resolved || false,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        positions,
        count: positions.length,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Portfolio:Native:GET');
  }
}
