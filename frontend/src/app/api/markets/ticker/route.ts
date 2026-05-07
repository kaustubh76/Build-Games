import { NextRequest, NextResponse } from 'next/server';
import { parseAbiItem } from 'viem';
import { AVALANCHE_CONTRACTS } from '@/lib/apiConfig';
import { getResilientPublicClient } from '@/lib/viemClient';
import { EXTERNAL_MARKET_MIRROR_ABI } from '@/constants/abis/externalMarketMirrorAbi';
import { handleAPIError, applyRateLimit } from '@/lib/api';
import { getMirrorCacheVersion } from '@/lib/mirrorCacheVersion';

/**
 * GET /api/markets/ticker?limit=8
 *
 * Live mirror-market ticker: returns the latest YES price + recent activity
 * for active mirror markets, sourced ONLY from on-chain reads (no DB).
 *
 * Strategy:
 *  1. Scan recent `MirrorMarketCreated` events to discover mirror keys
 *  2. For each, call `getMirrorMarket(mirrorKey)` for the live struct
 *  3. Filter to active markets, return as ticker rows
 *
 * Cached 10s in-process to bound RPC cost while still feeling live.
 */

const LOOKBACK_BLOCKS = 200_000;
const RPC_LOG_CHUNK = 2_000;
const RPC_LOG_PARALLEL = 8;
const CACHE_TTL_MS = 10_000;

const MIRROR_CREATED = parseAbiItem(
  'event MirrorMarketCreated(bytes32 indexed mirrorKey, uint256 marketId, string externalId, uint8 source, uint256 adjustedPrice)'
);

interface TickerRow {
  mirrorKey: string;
  marketId: string;
  externalId: string;
  source: 'POLYMARKET' | 'KALSHI';
  yesBps: number;
  noBps: number;
  totalVolume: string;
  isActive: boolean;
  createdAt: number;
}

let cache: { ts: number; version: number; rows: TickerRow[] } | null = null;

export async function GET(request: NextRequest) {
  try {
    applyRateLimit(request, {
      prefix: 'markets-ticker',
      maxRequests: 120,
      windowMs: 60_000,
    });

    const limitRaw = parseInt(request.nextUrl.searchParams.get('limit') || '8', 10);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 8, 1), 32);

    const currentVersion = getMirrorCacheVersion();
    if (
      cache &&
      cache.version === currentVersion &&
      Date.now() - cache.ts < CACHE_TTL_MS
    ) {
      return NextResponse.json({ rows: cache.rows.slice(0, limit), cached: true });
    }

    const client = getResilientPublicClient();
    const mirrorAddress = AVALANCHE_CONTRACTS.externalMarketMirror as `0x${string}`;

    const head = await client.getBlockNumber();
    const fromBlock = head > BigInt(LOOKBACK_BLOCKS) ? head - BigInt(LOOKBACK_BLOCKS) : 0n;

    const ranges: Array<{ from: bigint; to: bigint }> = [];
    for (let cursor = fromBlock; cursor <= head; cursor += BigInt(RPC_LOG_CHUNK)) {
      const to = cursor + BigInt(RPC_LOG_CHUNK) - 1n;
      ranges.push({ from: cursor, to: to > head ? head : to });
    }

    const allLogs: unknown[] = [];
    for (let i = 0; i < ranges.length; i += RPC_LOG_PARALLEL) {
      const slice = ranges.slice(i, i + RPC_LOG_PARALLEL);
      const batch = await Promise.all(
        slice.map((r) =>
          client.getLogs({
            address: mirrorAddress,
            event: MIRROR_CREATED,
            fromBlock: r.from,
            toBlock: r.to,
          })
        )
      );
      for (const logs of batch) allLogs.push(...logs);
    }

    type CreatedLog = {
      args?: {
        mirrorKey?: string;
        marketId?: bigint;
        externalId?: string;
        source?: number;
      };
      blockNumber: bigint | null;
    };
    const seen = new Map<string, CreatedLog>();
    for (const log of allLogs as CreatedLog[]) {
      const k = log.args?.mirrorKey;
      if (k && !seen.has(k)) seen.set(k, log);
    }

    const states = await Promise.all(
      Array.from(seen.entries()).map(async ([mirrorKey]) => {
        try {
          const data = (await client.readContract({
            address: mirrorAddress,
            abi: EXTERNAL_MARKET_MIRROR_ABI,
            functionName: 'getMirrorMarket',
            args: [mirrorKey as `0x${string}`],
          })) as {
            marketId: bigint;
            externalLink: {
              externalId: string;
              source: number;
              lastSyncPrice: bigint;
              isActive: boolean;
            };
            totalMirrorVolume: bigint;
            createdAt: bigint;
          };
          if (!data.externalLink.isActive) return null;
          const yesBps = Number(data.externalLink.lastSyncPrice);
          const row: TickerRow = {
            mirrorKey,
            marketId: data.marketId.toString(),
            externalId: data.externalLink.externalId,
            source: Number(data.externalLink.source) === 0 ? 'POLYMARKET' : 'KALSHI',
            yesBps,
            noBps: 10_000 - yesBps,
            totalVolume: data.totalMirrorVolume.toString(),
            isActive: data.externalLink.isActive,
            createdAt: Number(data.createdAt),
          };
          return row;
        } catch {
          return null;
        }
      })
    );

    const rows = states.filter((r): r is TickerRow => r !== null);
    rows.sort((a, b) => {
      try {
        return BigInt(b.totalVolume) > BigInt(a.totalVolume) ? 1 : -1;
      } catch {
        return 0;
      }
    });

    cache = { ts: Date.now(), version: getMirrorCacheVersion(), rows };
    return NextResponse.json({ rows: rows.slice(0, limit), total: rows.length });
  } catch (error) {
    return handleAPIError(error, 'API:Markets:Ticker:GET');
  }
}
