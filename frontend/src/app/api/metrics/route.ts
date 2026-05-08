/**
 * API Route: Metrics Endpoint
 *
 * Exports Prometheus-compatible metrics for monitoring
 *
 * GET /api/metrics
 * GET /api/metrics?format=json
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChainMetrics } from '@/lib/metrics';
import { globalErrorHandler } from '@/lib/errorRecovery';
import { prisma } from '@/lib/prisma';
import { createPublicClient, http } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { chainsToContracts, getAvalancheRpcUrl, getChainId } from '@/constants';
import { isTier2EventSourced } from '@/lib/storage/featureFlags';
import { getResilientPublicClient } from '@/lib/viemClient';
import { getAllMirrorTrades } from '@/lib/eventQuery/mirrorTrades';
import { log } from '@/lib/api/logger';

// Create Avalanche public client
function createAvalanchePublicClient() {
  return createPublicClient({
    chain: avalancheFuji,
    transport: http(getAvalancheRpcUrl()),
  });
}

/**
 * Tier-2 read switch: when ENABLE_0G_TIER2=1, derive `lastSyncedBlock` and
 * `tradeCount` from on-chain `MirrorTradeExecuted` logs. Falls back to
 * Prisma on RPC error or missing contract address so metrics never break.
 */
async function readTradeMetrics(): Promise<{
  lastSyncedBlock: bigint;
  tradeCount: number;
}> {
  const prismaRead = async () => {
    const [lastTrade, tradeCount] = await Promise.all([
      prisma.mirrorTrade.findFirst({
        orderBy: { blockNumber: 'desc' },
        select: { blockNumber: true },
      }),
      prisma.mirrorTrade.count(),
    ]);
    return {
      lastSyncedBlock: lastTrade ? BigInt(lastTrade.blockNumber) : 0n,
      tradeCount,
    };
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
    log.warn('[metrics] no externalMarketMirror contract; using Prisma');
    return prismaRead();
  }

  try {
    const client = getResilientPublicClient();
    const events = await getAllMirrorTrades(client, externalMarketMirrorAddress);
    const maxBlock = events.length === 0
      ? 0n
      : BigInt(Math.max(...events.map((e) => e.blockNumber)));
    return { lastSyncedBlock: maxBlock, tradeCount: events.length };
  } catch (err) {
    log.warn('[metrics] event-sourced read failed; falling back to Prisma', {
      error: err instanceof Error ? err.message : String(err),
    });
    return prismaRead();
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'prometheus';

    // Update real-time metrics before export
    await updateRealTimeMetrics();

    if (format === 'json') {
      return NextResponse.json({
        success: true,
        metrics: ChainMetrics.exportJSON(),
        timestamp: new Date().toISOString(),
      });
    }

    // Prometheus format
    const prometheusData = ChainMetrics.exportPrometheus();

    return new NextResponse(prometheusData, {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4',
      },
    });

  } catch (error: any) {
    console.error('[Metrics] Error generating metrics:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate metrics',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

async function updateRealTimeMetrics() {
  try {
    // Update circuit breaker metrics
    const circuitMetrics = globalErrorHandler.getCircuitBreakerMetrics();
    ChainMetrics.setRPCCircuitBreakerState('rpc', circuitMetrics.rpc.state);

    // Update blockchain sync metrics
    const client = createAvalanchePublicClient();
    const currentBlock = await client.getBlockNumber();

    const { lastSyncedBlock, tradeCount } = await readTradeMetrics();
    const blocksBehind = Number(currentBlock - lastSyncedBlock);

    ChainMetrics.setEventsSynced(Number(lastSyncedBlock));
    ChainMetrics.setBlocksBehind(blocksBehind);

    // Market metrics stay on Prisma — no event-sourced helper for mirrorMarket
    // and not in scope for this pass.
    const [marketCount, activeMarkets] = await Promise.all([
      prisma.mirrorMarket.count(),
      prisma.mirrorMarket.count({ where: { isActive: true } }),
    ]);

    ChainMetrics.setTotalMarkets(marketCount);
    ChainMetrics.setActiveMarkets(activeMarkets);
    ChainMetrics.setTotalTrades(tradeCount);

  } catch (error) {
    console.error('[Metrics] Error updating real-time metrics:', error);
  }
}
