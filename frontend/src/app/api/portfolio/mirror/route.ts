/**
 * Mirror Portfolio API Route
 * GET: Get user's mirror market positions (Polymarket/Kalshi)
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
import { getMirrorTradesForTrader } from '@/lib/eventQuery/mirrorTrades';
import { log } from '@/lib/api/logger';

const RPC_TIMEOUT = 60000;

// Simplified ABI for ExternalMarketMirror
const externalMarketMirrorAbi = [
  {
    type: 'function',
    name: 'getMirrorMarket',
    inputs: [{ name: 'mirrorKey', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'marketId', type: 'uint256' },
          {
            name: 'externalLink',
            type: 'tuple',
            components: [
              { name: 'externalId', type: 'string' },
              { name: 'source', type: 'uint8' },
              { name: 'lastSyncPrice', type: 'uint256' },
              { name: 'lastSyncTime', type: 'uint256' },
              { name: 'isActive', type: 'bool' },
            ],
          },
          { name: 'totalMirrorVolume', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'creator', type: 'address' },
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
 * On event-sourced read failure (RPC down, range too large), falls back to
 * Prisma with a logged warning — the page never goes blank during rollout.
 */
async function readMirrorTrades(traderAddress: `0x${string}`) {
  const prismaRead = () =>
    prisma.mirrorTrade.findMany({
      where: {
        traderAddress,
        mirrorKey: { not: undefined },
        NOT: { mirrorKey: '' },
      },
      orderBy: { timestamp: 'desc' },
    });

  if (!isTier2EventSourced()) return prismaRead();

  const contracts = chainsToContracts[getChainId()];
  const externalMarketMirrorAddress = contracts?.externalMarketMirror as
    | `0x${string}`
    | undefined;
  if (!externalMarketMirrorAddress) {
    log.warn('[portfolio/mirror] no externalMarketMirror contract for chain; using Prisma');
    return prismaRead();
  }

  try {
    const client = getResilientPublicClient();
    const events = await getMirrorTradesForTrader(
      client,
      externalMarketMirrorAddress,
      traderAddress
    );
    // Filter out empty mirrorKey to match the prisma where-clause.
    return events
      .filter((t) => t.mirrorKey && t.mirrorKey !== '')
      .sort((a, b) => b.blockNumber - a.blockNumber);
  } catch (err) {
    log.warn('[portfolio/mirror] event-sourced read failed; falling back to Prisma', {
      error: err instanceof Error ? err.message : String(err),
    });
    return prismaRead();
  }
}

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'portfolio-mirror',
      maxRequests: 30,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    // Validate address
    if (!address || !isAddress(address)) {
      throw ErrorResponses.badRequest('Invalid or missing address parameter');
    }

    // Get mirror trades. When ENABLE_0G_TIER2=1, we read from on-chain
    // MirrorTradeExecuted logs; otherwise we read from Prisma. On any
    // event-sourced read failure we fall back to Prisma so the page never
    // breaks during the rollout window.
    const trades = await readMirrorTrades(address.toLowerCase() as `0x${string}`);

    // Get mirror market metadata
    const mirrorKeys = [...new Set(trades.map((t) => t.mirrorKey).filter(Boolean))];
    const mirrorMarkets = await prisma.mirrorMarket.findMany({
      where: {
        mirrorKey: { in: mirrorKeys as string[] },
      },
    });

    const mirrorMarketMap = new Map(
      mirrorMarkets.map((m) => [m.mirrorKey, m])
    );

    // Group trades by mirror market and outcome
    const marketPositions = new Map<
      string,
      {
        mirrorKey: string;
        trades: typeof trades;
        totalShares: bigint;
        totalCost: bigint;
        isYes: boolean;
        source: MarketSource;
      }
    >();

    for (const trade of trades) {
      if (!trade.mirrorKey) continue;
      const mirrorMarket = mirrorMarketMap.get(trade.mirrorKey);
      const source = mirrorMarket?.source === 'polymarket'
        ? MarketSource.POLYMARKET
        : mirrorMarket?.source === 'kalshi'
        ? MarketSource.KALSHI
        : MarketSource.NATIVE;

      const key = `${trade.mirrorKey}-${trade.isYes}`;
      if (!marketPositions.has(key)) {
        marketPositions.set(key, {
          mirrorKey: trade.mirrorKey,
          trades: [],
          totalShares: 0n,
          totalCost: 0n,
          isYes: trade.isYes,
          source,
        });
      }
      const pos = marketPositions.get(key)!;
      pos.trades.push(trade);
      pos.totalShares += BigInt(trade.sharesReceived || '0');
      pos.totalCost += BigInt(trade.amount || '0');
    }

    // Get contract address
    const contracts = chainsToContracts[getChainId()];
    const externalMarketMirrorAddress = contracts?.externalMarketMirror as `0x${string}`;

    // Fetch current market data for each position
    const positions = [];
    for (const [, pos] of marketPositions) {
      if (pos.totalShares === 0n) continue;

      const mirrorMarket = mirrorMarketMap.get(pos.mirrorKey);

      let onChainData = null;
      try {
        if (externalMarketMirrorAddress) {
          onChainData = await executeWithFallback((client) =>
            client.readContract({
              address: externalMarketMirrorAddress,
              abi: externalMarketMirrorAbi,
              functionName: 'getMirrorMarket',
              args: [pos.mirrorKey as `0x${string}`],
            })
          );
        }
      } catch (e) {
        console.warn(`Failed to fetch mirror market ${pos.mirrorKey}:`, e);
      }

      const currentPrice = onChainData?.externalLink
        ? Number(onChainData.externalLink.lastSyncPrice) / 100
        : 50;
      const avgPrice =
        pos.totalShares > 0n
          ? Number((pos.totalCost * 100n) / pos.totalShares) / 100
          : 50;

      // Calculate unrealized PnL
      const currentValue = (pos.totalShares * BigInt(Math.floor(currentPrice * 100))) / 100n;
      const unrealizedPnL = currentValue - pos.totalCost;

      positions.push({
        id: `mirror-${pos.mirrorKey}-${pos.isYes ? 'yes' : 'no'}`,
        marketId: pos.mirrorKey,
        marketQuestion: mirrorMarket?.question || 'Unknown Market',
        source: pos.source,
        isYes: pos.isYes,
        shares: pos.totalShares.toString(),
        avgPrice,
        currentPrice,
        unrealizedPnL: unrealizedPnL.toString(),
        realizedPnL: '0', // Would need resolution data
        entryTimestamp: pos.trades[0]?.timestamp || 0,
        externalId: mirrorMarket?.externalId || onChainData?.externalLink?.externalId,
        isActive: onChainData?.externalLink?.isActive ?? true,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        positions,
        count: positions.length,
        bySource: {
          polymarket: positions.filter((p) => p.source === MarketSource.POLYMARKET).length,
          kalshi: positions.filter((p) => p.source === MarketSource.KALSHI).length,
        },
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Portfolio:Mirror:GET');
  }
}
