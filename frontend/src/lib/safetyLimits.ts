/**
 * Safety Limits — server-side guardrails for mirror-market writes.
 *
 * KV-backed (Vercel KV / Upstash) so the daily-spend tracker survives
 * Vercel cold starts and is consistent across containers. The previous
 * in-process Map worked at single-instance scale but failed under
 * serverless: two parallel mirror trades for the same user routed to
 * two containers could each pass the cap because neither saw the other's
 * spend.
 *
 * The chain is still the source of truth — the on-chain CRwN allowance
 * is the real ceiling. The cap here is a per-user UX guardrail that
 * prevents runaway client loops from draining a user's allowance in
 * minutes; brief KV inconsistency under contention is acceptable.
 */

import { parseEther } from 'viem';
import {
  getJSON as kvGet,
  setJSONWithTtl as kvSet,
  addToSet as kvAddToSet,
  removeFromSet as kvRemoveFromSet,
  isInSet as kvIsInSet,
  __resetKvMemory,
} from '@/lib/kv';

export const PER_TRADE_CAP_WEI = parseEther('1000');
export const PER_USER_DAILY_CAP_WEI = parseEther('5000');
export const MAX_SLIPPAGE_BPS = 300;

const DAY_SECONDS = 24 * 60 * 60;
const PAUSED_USERS_SET = 'safety:paused-users';
const SPEND_KEY_PREFIX = 'safety:spend:';

function key(addr: string): string {
  return addr.toLowerCase();
}

/**
 * The day bucket for a given timestamp. Aligned to UTC day boundary so
 * cap windows roll over predictably and TTLs match.
 */
function dayBucket(now: number = Date.now()): number {
  return Math.floor(now / 1000 / DAY_SECONDS);
}

function spendKey(addr: string): string {
  return `${SPEND_KEY_PREFIX}${key(addr)}:${dayBucket()}`;
}

interface SpendEntry {
  spentWei: string; // bigint serialized as decimal string for KV
}

async function getSpend(addr: string): Promise<bigint> {
  const entry = await kvGet<SpendEntry>(spendKey(addr));
  return entry ? BigInt(entry.spentWei) : 0n;
}

async function setSpend(addr: string, spentWei: bigint): Promise<void> {
  // TTL covers two day buckets to avoid edge cases right at the rollover
  // moment — we want the entry to survive until tomorrow's bucket
  // becomes authoritative.
  await kvSet(
    spendKey(addr),
    { spentWei: spentWei.toString() } satisfies SpendEntry,
    DAY_SECONDS * 2
  );
}

export async function isUserPaused(addr: string): Promise<boolean> {
  return await kvIsInSet(PAUSED_USERS_SET, key(addr));
}

export async function pauseUser(addr: string): Promise<void> {
  await kvAddToSet(PAUSED_USERS_SET, key(addr));
}

export async function unpauseUser(addr: string): Promise<void> {
  await kvRemoveFromSet(PAUSED_USERS_SET, key(addr));
}

export async function getUserSpendRemaining(addr: string): Promise<bigint> {
  const spent = await getSpend(addr);
  const remaining = PER_USER_DAILY_CAP_WEI - spent;
  return remaining > 0n ? remaining : 0n;
}

export async function getUserSpendInfo(addr: string): Promise<{
  spentWei: string;
  capWei: string;
  remainingWei: string;
  windowStart: number;
  paused: boolean;
}> {
  const [spent, paused] = await Promise.all([
    getSpend(addr),
    isUserPaused(addr),
  ]);
  const remaining = PER_USER_DAILY_CAP_WEI - spent;
  return {
    spentWei: spent.toString(),
    capWei: PER_USER_DAILY_CAP_WEI.toString(),
    remainingWei: (remaining > 0n ? remaining : 0n).toString(),
    windowStart: dayBucket() * DAY_SECONDS * 1000,
    paused,
  };
}

/**
 * Reserve daily-spend budget AND debit it. Returns the (possibly capped)
 * amount the caller may proceed with. Throws if the user is paused, the
 * per-trade cap is exceeded, or the daily cap is fully consumed.
 *
 * Race-safety note: the KV-backed read-then-write is NOT a true CAS — under
 * genuine concurrent contention from the same wallet across containers,
 * two requests CAN observe the same baseline and both debit. The on-chain
 * CRwN allowance is the real ceiling, so the worst case is the user's
 * allowance gets debited slightly faster than the soft cap intended; it
 * cannot exceed the on-chain allowance. Adding a Lua-script CAS path is
 * the proper fix; tracked as a TODO when a contention incident actually
 * surfaces in production.
 *
 * If the on-chain tx subsequently fails, the caller MUST call
 * `releaseReservation(addr, allowedWei)` to refund the daily budget.
 */
export async function reserveAndSpend(
  addr: string,
  requestedWei: bigint
): Promise<{ allowedWei: bigint; capped: boolean; reason?: string }> {
  if (await isUserPaused(addr)) {
    throw new Error('Trading paused for this user. Resume to continue.');
  }
  if (requestedWei <= 0n) {
    throw new Error('Trade amount must be > 0');
  }
  if (requestedWei > PER_TRADE_CAP_WEI) {
    throw new Error(`Per-trade cap exceeded: max ${PER_TRADE_CAP_WEI.toString()} wei`);
  }

  const current = await getSpend(addr);
  const remainingNow = PER_USER_DAILY_CAP_WEI - current;
  if (remainingNow <= 0n) {
    throw new Error('Daily mirror-trade cap reached. Try again tomorrow or pause + resume.');
  }
  const capped = requestedWei > remainingNow;
  const allowedWei = capped ? remainingNow : requestedWei;
  await setSpend(addr, current + allowedWei);
  return capped
    ? {
        allowedWei,
        capped: true,
        reason: `Capped to remaining daily budget (${remainingNow.toString()} wei)`,
      }
    : { allowedWei, capped: false };
}

/**
 * Refund a reservation previously granted by `reserveAndSpend`. Saturates
 * at 0n (never goes negative).
 */
export async function releaseReservation(addr: string, refundWei: bigint): Promise<void> {
  if (refundWei <= 0n) return;
  const current = await getSpend(addr);
  const next = current > refundWei ? current - refundWei : 0n;
  await setSpend(addr, next);
}

/**
 * Legacy split-version API kept for callers that need to enforce limits
 * without committing the spend (planning paths). New code should prefer
 * `reserveAndSpend` to avoid the lost-update window between check and
 * commit.
 */
export async function enforceTradeLimits(
  addr: string,
  requestedWei: bigint
): Promise<{ allowedWei: bigint; capped: boolean; reason?: string }> {
  if (await isUserPaused(addr)) {
    throw new Error('Trading paused for this user. Resume to continue.');
  }
  if (requestedWei <= 0n) {
    throw new Error('Trade amount must be > 0');
  }
  if (requestedWei > PER_TRADE_CAP_WEI) {
    throw new Error(`Per-trade cap exceeded: max ${PER_TRADE_CAP_WEI.toString()} wei`);
  }
  const remaining = await getUserSpendRemaining(addr);
  if (remaining === 0n) {
    throw new Error('Daily mirror-trade cap reached. Try again tomorrow or pause + resume.');
  }
  if (requestedWei > remaining) {
    return {
      allowedWei: remaining,
      capped: true,
      reason: `Capped to remaining daily budget (${remaining.toString()} wei)`,
    };
  }
  return { allowedWei: requestedWei, capped: false };
}

export async function recordSpend(addr: string, amountWei: bigint): Promise<void> {
  const current = await getSpend(addr);
  await setSpend(addr, current + amountWei);
}

/**
 * Compute a minSharesOut floor enforcing the configured slippage tolerance.
 *
 * floor = expectedShares * (10_000 - maxSlippageBps) / 10_000
 */
export function computeMinSharesOut(
  expectedSharesWei: bigint,
  maxSlippageBps: number = MAX_SLIPPAGE_BPS
): bigint {
  if (expectedSharesWei <= 0n) return 0n;
  const bps = BigInt(Math.max(0, Math.min(10_000, maxSlippageBps)));
  return (expectedSharesWei * (10_000n - bps)) / 10_000n;
}

// ============================================================================
// Test/soak inspectors — gated to non-production environments.
// ============================================================================

function assertNotProduction(name: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is unavailable in production`);
  }
}

export function __resetSafetyState(): void {
  assertNotProduction('__resetSafetyState');
  __resetKvMemory();
}

/**
 * Diagnostic snapshot. With KV-backed storage we can't enumerate all keys
 * cheaply, so the entries array is empty by default. Soak suites that
 * previously scanned individual entries should switch to per-address
 * `getUserSpendInfo` calls.
 */
export function __getSafetyState(): {
  userDailySpend: Array<{ key: string; spentWei: string; windowStart: number }>;
  pausedUsers: string[];
} {
  assertNotProduction('__getSafetyState');
  return { userDailySpend: [], pausedUsers: [] };
}
