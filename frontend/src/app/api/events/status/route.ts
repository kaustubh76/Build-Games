/**
 * API Route: Event Listener Status
 * Get detailed status of event tracking system
 *
 * GET /api/events/status
 *
 * Returns:
 * - Last synced block
 * - Total events processed
 * - Event breakdown by type
 * - Recent events
 * - System health
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleAPIError, applyRateLimit } from '@/lib/api';
import { getLastSyncedBlock } from '@/lib/eventListeners';
import { createPublicClient, http } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { prisma } from '@/lib/prisma';
import { chainsToContracts, getAvalancheRpcUrl, getChainId } from '@/constants';
import { isTier2EventSourced } from '@/lib/storage/featureFlags';
import { getResilientPublicClient } from '@/lib/viemClient';
import { getAllMirrorTrades, type MirrorTradeFromEvent } from '@/lib/eventQuery/mirrorTrades';
import { log } from '@/lib/api/logger';

// Create Avalanche public client
function createAvalanchePublicClient() {
  return createPublicClient({
    chain: avalancheFuji,
    transport: http(getAvalancheRpcUrl()),
  });
}

interface RecentTradeView {
  mirrorKey: string;
  traderAddress: string;
  isYes: boolean;
  amount: string;
  txHash: string;
  blockNumber: number;
  timestamp: Date;
}

/**
 * Tier-2 read switch for the trade-count + recent-trades stats. Returns the
 * fields the response body actually formats. Falls back to Prisma on RPC
 * error so the status endpoint never goes blank during rollout.
 */
async function readTradesView(): Promise<{
  totalTrades: number;
  recentTrades: RecentTradeView[];
}> {
  const prismaRead = async () => {
    const [totalTrades, recentTrades] = await Promise.all([
      prisma.mirrorTrade.count(),
      prisma.mirrorTrade.findMany({
        take: 10,
        orderBy: { timestamp: 'desc' },
        select: {
          mirrorKey: true,
          traderAddress: true,
          isYes: true,
          amount: true,
          txHash: true,
          blockNumber: true,
          timestamp: true,
        },
      }),
    ]);
    return { totalTrades, recentTrades };
  };

  if (!isTier2EventSourced()) return prismaRead();

  const contracts = chainsToContracts[getChainId()];
  const externalMarketMirrorAddress = contracts?.externalMarketMirror as
    | `0x${string}`
    | undefined;
  if (
    !externalMarketMirrorAddress ||
    externalMarketMirrorAddress === '0x0000000000000000000000000000000000000000'
  ) {
    log.warn('[events/status] no externalMarketMirror contract; using Prisma');
    return prismaRead();
  }

  try {
    const client = getResilientPublicClient();
    const events = await getAllMirrorTrades(client, externalMarketMirrorAddress);
    const sorted = [...events].sort((a, b) => b.blockNumber - a.blockNumber);
    return {
      totalTrades: events.length,
      recentTrades: sorted.slice(0, 10).map(eventToRecentTradeView),
    };
  } catch (err) {
    log.warn('[events/status] event-sourced read failed; falling back to Prisma', {
      error: err instanceof Error ? err.message : String(err),
    });
    return prismaRead();
  }
}

function eventToRecentTradeView(t: MirrorTradeFromEvent): RecentTradeView {
  return {
    mirrorKey: t.mirrorKey,
    traderAddress: t.traderAddress,
    isYes: t.isYes,
    amount: t.amount,
    txHash: t.txHash,
    blockNumber: t.blockNumber,
    timestamp: t.timestamp,
  };
}

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'events-status',
      maxRequests: 60,
      windowMs: 60000,
    });

    const client = createAvalanchePublicClient();

    // Get blockchain data
    const [currentBlock, lastSyncedBlock] = await Promise.all([
      client.getBlockNumber(),
      getLastSyncedBlock(),
    ]);

    // Get database statistics. Trade count + recent trades are switched to
    // event-sourced reads when ENABLE_0G_TIER2=1 (with Prisma fallback);
    // mirrorMarket aggregates stay on Prisma — those don't have an event
    // helper yet and aren't a Tier-2 candidate this pass.
    const [
      tradesView,
      totalMarkets,
      totalVolume,
      resolvedMarkets,
    ] = await Promise.all([
      readTradesView(),
      prisma.mirrorMarket.count(),
      prisma.mirrorMarket.aggregate({
        _sum: { tradeCount: true },
      }),
      prisma.mirrorMarket.count({
        where: { resolved: true },
      }),
    ]);
    const { totalTrades, recentTrades } = tradesView;

    // Calculate sync status
    const blocksBehind = Number(currentBlock - lastSyncedBlock);
    const isSynced = blocksBehind <= 10; // Within 10 blocks is considered synced
    const syncPercentage = lastSyncedBlock > 0n
      ? ((Number(lastSyncedBlock) / Number(currentBlock)) * 100).toFixed(2)
      : '0.00';

    return NextResponse.json({
      success: true,
      blockchain: {
        currentBlock: currentBlock.toString(),
        lastSyncedBlock: lastSyncedBlock.toString(),
        blocksBehind,
        isSynced,
        syncPercentage: `${syncPercentage}%`,
      },
      statistics: {
        totalMarkets,
        totalTrades,
        resolvedMarkets,
        activeMarkets: totalMarkets - resolvedMarkets,
        totalVolume: String(totalVolume._sum.tradeCount || 0),
      },
      recentActivity: recentTrades.map(trade => ({
        mirrorKey: trade.mirrorKey.slice(0, 10) + '...',
        trader: trade.traderAddress.slice(0, 10) + '...',
        direction: trade.isYes ? 'YES' : 'NO',
        amount: trade.amount,
        blockNumber: trade.blockNumber,
        txHash: trade.txHash.slice(0, 10) + '...',
        timestamp: trade.timestamp.toISOString(),
      })),
      health: {
        status: isSynced ? 'healthy' : 'syncing',
        message: isSynced
          ? 'Event tracking is up to date'
          : `Behind by ${blocksBehind} blocks`,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return handleAPIError(error, 'API:Events:Status');
  }
}
