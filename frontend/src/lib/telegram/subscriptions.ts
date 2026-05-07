/**
 * Telegram subscription registry — in-process map with best-effort 0G persistence.
 *
 * Trade-offs:
 *  - In-process Map → fast, simple, but cold starts wipe state.
 *  - Best-effort 0G upload after every change → persists the snapshot to a
 *    content-addressed blob; the latest rootHash is held in memory (so cold
 *    start can't actually rehydrate without an out-of-band registry, BUT the
 *    blob is recoverable manually if needed).
 *
 * This is a deliberate stepping stone — proper persistence wants the
 * subscriber registry indexed by an on-chain event (out of scope for this
 * iteration). For testnet/demo, the cold-start gap is acceptable.
 */

import {
  upload as zgUpload,
  download as zgDownload,
  isZgConfigured,
} from '@/services/zgStorageService';

export interface TelegramSubscription {
  userAddress: string;
  telegramChatId: string;
  thresholdUsd: number;
  sources: ('POLYMARKET' | 'KALSHI')[];
  createdAt: number;
  updatedAt: number;
}

const subs = new Map<string, TelegramSubscription>();
let snapshotRootHash: string | null = null;

/**
 * Bug #7 fix: secondary index per source, sorted ascending by threshold. Used
 * by `findMatchingSubscribers` to do a binary upper-bound search instead of an
 * O(n) linear scan over every subscriber. Rebuilt on every upsert/remove —
 * mutations are rare relative to fan-out reads, so the rebuild cost is well
 * below the saved scan cost at scale.
 */
const sortedBySource = new Map<'POLYMARKET' | 'KALSHI', TelegramSubscription[]>();

function key(addr: string): string {
  return addr.toLowerCase();
}

function rebuildSortedIndex(): void {
  sortedBySource.clear();
  for (const s of subs.values()) {
    for (const src of s.sources) {
      const arr = sortedBySource.get(src) ?? [];
      arr.push(s);
      sortedBySource.set(src, arr);
    }
  }
  for (const arr of sortedBySource.values()) {
    arr.sort((a, b) => a.thresholdUsd - b.thresholdUsd);
  }
}

/**
 * Binary upper-bound: index of first element where `predicate` is false. If
 * predicate is true for all elements, returns arr.length.
 */
function upperBound<T>(arr: T[], predicate: (t: T) => boolean): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (predicate(arr[mid])) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function getSubscription(addr: string): TelegramSubscription | null {
  return subs.get(key(addr)) ?? null;
}

export function listSubscriptions(): TelegramSubscription[] {
  return Array.from(subs.values());
}

export async function upsertSubscription(
  input: Omit<TelegramSubscription, 'createdAt' | 'updatedAt'>
): Promise<TelegramSubscription> {
  const now = Date.now();
  const k = key(input.userAddress);
  const existing = subs.get(k);
  const next: TelegramSubscription = {
    ...input,
    userAddress: input.userAddress,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  subs.set(k, next);
  rebuildSortedIndex();
  await persistSnapshot().catch(() => {
    // best-effort
  });
  return next;
}

export async function removeSubscription(addr: string): Promise<boolean> {
  const removed = subs.delete(key(addr));
  if (removed) {
    rebuildSortedIndex();
    await persistSnapshot().catch(() => {
      // best-effort
    });
  }
  return removed;
}

export function getSnapshotRootHash(): string | null {
  return snapshotRootHash;
}

/**
 * Find subscribers whose threshold + sources match a given whale trade. Used
 * by the bot worker to fan out alerts. O(log n + k) where k is the matching
 * subset, vs. the previous O(n) full scan.
 */
export function findMatchingSubscribers(
  amountUsd: number,
  source: 'POLYMARKET' | 'KALSHI'
): TelegramSubscription[] {
  const sorted = sortedBySource.get(source);
  if (!sorted || sorted.length === 0) return [];
  // Binary upper-bound: largest prefix where threshold <= amountUsd.
  const cut = upperBound(sorted, (s) => s.thresholdUsd <= amountUsd);
  // Return a fresh array so the caller can't mutate the index.
  return sorted.slice(0, cut);
}

async function persistSnapshot(): Promise<void> {
  if (!isZgConfigured()) return;
  const blob = JSON.stringify({
    version: '1.0.0',
    ts: Date.now(),
    subscriptions: Array.from(subs.values()),
  });
  try {
    const result = await zgUpload(Buffer.from(blob), `telegram-subs-${Date.now()}.json`);
    snapshotRootHash = result.rootHash;
  } catch {
    // ignore — snapshot is best-effort
  }
}

/**
 * Rehydrate the in-process subscription registry from a known 0G snapshot.
 *
 * Designed to be called once after cold-start by an operator who has the
 * latest rootHash from logs / monitoring. The blob is content-validated
 * (must be JSON with the expected `version` + `subscriptions[]` shape) so a
 * malicious or corrupted ref can't poison the registry.
 *
 * Returns the count of restored subscriptions, or throws on validation failure.
 */
export async function restoreFromSnapshot(rootHash: string): Promise<{
  restored: number;
  skippedExisting: number;
  ts: number;
  rootHash: string;
}> {
  if (!isZgConfigured()) {
    throw new Error('0G Storage not configured (ZG_PRIVATE_KEY missing)');
  }
  const cleanRef = rootHash.replace(/^(storage|0g|ipfs):\/\//, '');
  const bytes = await zgDownload(cleanRef);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString());
  } catch (e) {
    throw new Error(`Snapshot is not valid JSON: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    !('subscriptions' in parsed) ||
    !Array.isArray((parsed as { subscriptions: unknown }).subscriptions)
  ) {
    throw new Error('Snapshot shape invalid — expected { version, ts, subscriptions[] }');
  }
  const arr = (parsed as { subscriptions: unknown[] }).subscriptions;

  let restored = 0;
  let skippedExisting = 0;
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue;
    const s = item as Partial<TelegramSubscription>;
    if (
      typeof s.userAddress !== 'string' ||
      !/^0[xX][0-9a-fA-F]{40}$/.test(s.userAddress) ||
      typeof s.telegramChatId !== 'string' ||
      typeof s.thresholdUsd !== 'number' ||
      !Array.isArray(s.sources)
    ) {
      continue;
    }
    const k = key(s.userAddress);
    if (subs.has(k)) {
      skippedExisting += 1;
      continue;
    }
    subs.set(k, {
      userAddress: s.userAddress,
      telegramChatId: s.telegramChatId,
      thresholdUsd: s.thresholdUsd,
      sources: s.sources as ('POLYMARKET' | 'KALSHI')[],
      createdAt: s.createdAt ?? Date.now(),
      updatedAt: s.updatedAt ?? Date.now(),
    });
    restored += 1;
  }
  if (restored > 0) rebuildSortedIndex();
  snapshotRootHash = cleanRef;
  return {
    restored,
    skippedExisting,
    ts: Date.now(),
    rootHash: cleanRef,
  };
}

// Test/soak inspector — gated.
function assertNotProduction(name: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is unavailable in production`);
  }
}

export function __resetSubscriptions(): void {
  assertNotProduction('__resetSubscriptions');
  subs.clear();
  sortedBySource.clear();
  snapshotRootHash = null;
}
