/**
 * Whale Stats API Route
 * GET: Fetch aggregated whale trading statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleAPIError, applyRateLimit } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    await applyRateLimit(request, {
      prefix: 'whale-stats',
      maxRequests: 60,
      windowMs: 60000,
    });

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Cap on rows pulled for the volume sum. Even at 10k whale trades per
    // 24h window (well above realistic), this keeps the response fast and
    // bounds memory. `amountUsd` is stored as a String, so we can't push
    // the SUM down to Postgres via Prisma's aggregate API — fetch the
    // strings and sum in JS, but with a take() ceiling.
    const ROW_CEILING = 10_000;

    // Get 24h trades
    const [trades24h, tradesPrev24h, trackedTraderCount] = await Promise.all([
      prisma.whaleTrade.findMany({
        where: { timestamp: { gte: twentyFourHoursAgo } },
        select: { amountUsd: true },
        orderBy: { timestamp: 'desc' },
        take: ROW_CEILING,
      }),
      prisma.whaleTrade.findMany({
        where: {
          timestamp: { gte: fortyEightHoursAgo, lt: twentyFourHoursAgo },
        },
        select: { amountUsd: true },
        orderBy: { timestamp: 'desc' },
        take: ROW_CEILING,
      }),
      prisma.trackedTrader.count(),
    ]);

    // Calculate current 24h stats
    const totalVolume24h = trades24h.reduce(
      (sum, t) => sum + parseFloat(t.amountUsd),
      0
    );
    const tradeCount24h = trades24h.length;
    const avgTradeSize = tradeCount24h > 0 ? totalVolume24h / tradeCount24h : 0;

    // Calculate previous 24h stats for change comparison
    const prevVolume = tradesPrev24h.reduce(
      (sum, t) => sum + parseFloat(t.amountUsd),
      0
    );
    const prevTradeCount = tradesPrev24h.length;
    const prevAvgTradeSize =
      prevTradeCount > 0 ? prevVolume / prevTradeCount : 0;

    // Calculate percentage changes
    const volumeChange24h =
      prevVolume > 0 ? ((totalVolume24h - prevVolume) / prevVolume) * 100 : 0;
    const tradeCountChange =
      prevTradeCount > 0
        ? ((tradeCount24h - prevTradeCount) / prevTradeCount) * 100
        : 0;
    const avgTradeSizeChange =
      prevAvgTradeSize > 0
        ? ((avgTradeSize - prevAvgTradeSize) / prevAvgTradeSize) * 100
        : 0;

    return NextResponse.json({
      success: true,
      data: {
        totalVolume24h,
        tradeCount24h,
        avgTradeSize,
        volumeChange24h,
        tradeCountChange,
        avgTradeSizeChange,
        trackedTraderCount,
      },
    });
  } catch (error) {
    // Return default values if database tables don't exist yet
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('does not exist') || errorMessage.includes('no such table')) {
      return NextResponse.json({
        success: true,
        data: {
          totalVolume24h: 0,
          tradeCount24h: 0,
          avgTradeSize: 0,
          volumeChange24h: 0,
          tradeCountChange: 0,
          avgTradeSizeChange: 0,
          trackedTraderCount: 0,
        },
      });
    }

    return handleAPIError(error, 'API:WhaleStats:GET');
  }
}
