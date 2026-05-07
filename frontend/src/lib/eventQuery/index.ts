/**
 * Event-sourced query helpers for the Prisma → 0G migration.
 *
 * The Tier 2 migration replaces `prisma.<model>.findMany({where: ...})` reads
 * with on-chain `client.getLogs({event, args})` reads. Two operational concerns
 * shape this module:
 *
 *   1. **Block-range pagination** — Fuji RPC caps log queries at ~2k blocks;
 *      a 30-day lookback can be ~1.5M blocks. We chunk and accumulate.
 *   2. **Read caching** — a portfolio page hitting `getMirrorTradesForUser(walletA)`
 *      three times in five seconds shouldn't issue three full block-range scans.
 *      A small TTL'd Map keyed on `(contract, event, address)` collapses
 *      duplicate queries within a short window.
 *
 * Reads stay correct on cache miss (chain is the source of truth); the cache is
 * a perf optimisation only.
 */

import type { PublicClient, Log, AbiEvent } from 'viem';

const DEFAULT_BLOCK_CHUNK = 2_000n;
const DEFAULT_LOOKBACK_BLOCKS = 50_000n; // ~12h on Fuji (2s blocks)
const CACHE_TTL_MS = 5_000; // 5s — long enough to collapse a page-load burst

interface CacheEntry {
  fetchedAt: number;
  result: Log[];
}
const cache = new Map<string, CacheEntry>();

function cacheKey(parts: Array<string | number | bigint>): string {
  return parts.map(String).join('|');
}

export interface PaginatedLogQuery {
  client: PublicClient;
  address: `0x${string}`;
  event: AbiEvent;
  args?: Record<string, unknown>;
  /** First block in the window. Defaults to (head - DEFAULT_LOOKBACK_BLOCKS). */
  fromBlock?: bigint;
  /** Last block. Defaults to current head. */
  toBlock?: bigint;
  /** Block-range chunk size. Defaults to 2000 (Fuji limit). */
  chunkSize?: bigint;
}

/**
 * Query event logs in fixed-size block-range chunks. Accumulates and returns
 * the flattened result. Caller is responsible for further filtering /
 * decoding.
 *
 * Throws on RPC failure — callers can wrap in try/catch + fall back to
 * Prisma during the dual-read rollout window (see Tier 2 routes).
 */
export async function getLogsPaginated(opts: PaginatedLogQuery): Promise<Log[]> {
  const { client, address, event, args, chunkSize = DEFAULT_BLOCK_CHUNK } = opts;
  const head = await client.getBlockNumber();
  const fromBlock = opts.fromBlock ?? (head > DEFAULT_LOOKBACK_BLOCKS ? head - DEFAULT_LOOKBACK_BLOCKS : 0n);
  const toBlock = opts.toBlock ?? head;
  if (fromBlock > toBlock) return [];

  const out: Log[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = cursor + chunkSize - 1n > toBlock ? toBlock : cursor + chunkSize - 1n;
    const logs = await client.getLogs({
      address,
      event,
      args: args as never,
      fromBlock: cursor,
      toBlock: end,
    });
    out.push(...(logs as Log[]));
    cursor = end + 1n;
  }
  return out;
}

/**
 * Cached wrapper. Returns the same `Log[]` for the same `(address, event,
 * argsKey)` within CACHE_TTL_MS. Skips the cache when called with a custom
 * fromBlock / toBlock (those queries are typically operator-driven and rare).
 */
export async function getLogsForAddressCached(
  client: PublicClient,
  contract: `0x${string}`,
  event: AbiEvent,
  argsKey: string,
  args: Record<string, unknown>
): Promise<Log[]> {
  const key = cacheKey([contract, event.name, argsKey]);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.fetchedAt < CACHE_TTL_MS) return hit.result;

  const result = await getLogsPaginated({ client, address: contract, event, args });
  cache.set(key, { fetchedAt: now, result });
  // Bound the cache so a long-running process doesn't accumulate keys.
  if (cache.size > 1_000) trimCache();
  return result;
}

function trimCache(): void {
  // Drop entries older than CACHE_TTL_MS first.
  const now = Date.now();
  for (const [k, v] of cache.entries()) {
    if (now - v.fetchedAt >= CACHE_TTL_MS) cache.delete(k);
  }
  if (cache.size <= 500) return;
  // If we're still bloated, drop oldest by fetchedAt.
  const entries = Array.from(cache.entries()).sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
  const drop = entries.length - 500;
  for (let i = 0; i < drop; i++) cache.delete(entries[i][0]);
}

// Test/inspector hooks — gated to non-production.
function assertNotProduction(name: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is unavailable in production`);
  }
}

export function __resetEventQueryCache(): void {
  assertNotProduction('__resetEventQueryCache');
  cache.clear();
}

export function __getEventQueryCacheState(): { size: number; keys: string[] } {
  assertNotProduction('__getEventQueryCacheState');
  return { size: cache.size, keys: Array.from(cache.keys()) };
}
