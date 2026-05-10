/**
 * API Route: Get external trade history for an agent
 * Returns trades executed on external markets (Polymarket, Kalshi)
 */

import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MarketSource } from '@/types/externalMarket';
import { handleAPIError, applyRateLimit, parsePagination } from '@/lib/api';
import { isTier2EventSourced } from '@/lib/storage/featureFlags';
import { getResilientPublicClient } from '@/lib/viemClient';
import { getAgentTradesForAgent } from '@/lib/eventQuery/agentTrades';
import { chainsToContracts, getChainId } from '@/constants';
import { log } from '@/lib/api/logger';

/**
 * Tier-2 read switch for agent external trades. Reads `AgentTradeExecuted`
 * logs filtered by indexed `agentId` when ENABLE_0G_TIER2=1, otherwise
 * Prisma. Falls back to Prisma on any RPC error so the trade history
 * never goes blank during rollout.
 */
async function readAgentTrades(agentId: string, limit: number, offset: number) {
  const prismaRead = async () => {
    const where = {
      agentId,
      mirrorKey: { not: undefined as unknown as string },
      NOT: { mirrorKey: '' },
    };
    const [totalCount, trades] = await Promise.all([
      prisma.mirrorTrade.count({ where }),
      prisma.mirrorTrade.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);
    return { totalCount, trades };
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
    log.warn('[agents/external-trades] no externalMarketMirror; using Prisma');
    return prismaRead();
  }

  try {
    const client = getResilientPublicClient();
    const events = await getAgentTradesForAgent(
      client,
      externalMarketMirrorAddress,
      agentId
    );
    // mirrorKey is non-empty by construction (every AgentTradeExecuted has
    // an indexed mirrorKey). Sort by blockNumber desc to match the legacy
    // `orderBy: timestamp desc` semantics, then paginate in memory.
    const sorted = [...events].sort((a, b) => b.blockNumber - a.blockNumber);
    return {
      totalCount: sorted.length,
      trades: sorted.slice(offset, offset + limit),
    };
  } catch (err) {
    log.warn('[agents/external-trades] event-sourced read failed; falling back to Prisma', {
      error: err instanceof Error ? err.message : String(err),
    });
    return prismaRead();
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Apply rate limiting
    await applyRateLimit(request, {
      prefix: 'agent-external-trades',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { id } = await params;
    const agentId = id;

    const { searchParams } = new URL(request.url);
    const { limit, offset } = parsePagination(searchParams);
    const source = searchParams.get('source') as 'polymarket' | 'kalshi' | null;

    const { totalCount, trades } = await readAgentTrades(agentId, limit, offset);

    // Get mirror market metadata for these trades
    const mirrorKeys = [...new Set(trades.map((t) => t.mirrorKey).filter(Boolean))];
    const mirrorMarkets = await prisma.mirrorMarket.findMany({
      where: {
        mirrorKey: { in: mirrorKeys as string[] },
      },
    });

    const mirrorMarketMap = new Map(
      mirrorMarkets.map((m) => [m.mirrorKey, m])
    );

    // Format trades with market metadata
    let formattedTrades = trades.map((trade) => {
      const mirrorMarket = trade.mirrorKey
        ? mirrorMarketMap.get(trade.mirrorKey)
        : null;

      const tradeSource =
        mirrorMarket?.source === 'polymarket'
          ? MarketSource.POLYMARKET
          : mirrorMarket?.source === 'kalshi'
          ? MarketSource.KALSHI
          : MarketSource.NATIVE;

      return {
        id: trade.id,
        marketId: trade.onChainMarketId?.toString() || '',
        mirrorKey: trade.mirrorKey,
        source: tradeSource,
        marketQuestion: mirrorMarket?.question || 'Unknown Market',
        externalId: mirrorMarket?.externalId || null,
        isYes: trade.isYes,
        amount: trade.amount,
        sharesReceived: trade.sharesReceived,
        pnl: trade.pnl || '0',
        won: trade.pnl ? BigInt(trade.pnl) > 0n : null,
        txHash: trade.txHash,
        timestamp: trade.timestamp,
        resolvedAt: trade.resolvedAt,
      };
    });

    // Filter by source if specified
    if (source) {
      const filterSource =
        source === 'polymarket'
          ? MarketSource.POLYMARKET
          : MarketSource.KALSHI;
      formattedTrades = formattedTrades.filter((t) => t.source === filterSource);
    }

    // Calculate summary stats
    const totalPnL = formattedTrades.reduce(
      (sum, t) => sum + BigInt(t.pnl || '0'),
      0n
    );
    const wins = formattedTrades.filter((t) => t.won === true).length;
    const losses = formattedTrades.filter((t) => t.won === false).length;

    return NextResponse.json({
      success: true,
      agentId,
      trades: formattedTrades,
      total: totalCount,
      limit,
      offset,
      hasMore: offset + trades.length < totalCount,
      summary: {
        totalTrades: formattedTrades.length,
        totalPnL: totalPnL.toString(),
        wins,
        losses,
        winRate: formattedTrades.length > 0
          ? ((wins / formattedTrades.length) * 100).toFixed(1)
          : '0',
        bySource: {
          polymarket: formattedTrades.filter(
            (t) => t.source === MarketSource.POLYMARKET
          ).length,
          kalshi: formattedTrades.filter(
            (t) => t.source === MarketSource.KALSHI
          ).length,
        },
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Agents:ExternalTrades:GET');
  }
}
