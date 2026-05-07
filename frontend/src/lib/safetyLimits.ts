/**
 * Safety Limits — server-side guardrails for mirror-market writes.
 *
 * 0G-native: all state is in-process memory. Cold starts reset the daily-spend
 * tracker, which is acceptable for the trading-pause pattern (the on-chain
 * CRwN allowance is the real ceiling). The chain is the source of truth.
 */

import { parseEther } from 'viem';

export const PER_TRADE_CAP_WEI = parseEther('1000'); // 1000 CRwN max per single mirror trade
export const PER_USER_DAILY_CAP_WEI = parseEther('5000'); // 5000 CRwN per UTC day
export const MAX_SLIPPAGE_BPS = 300; // 3% default slippage tolerance

const DAY_MS = 24 * 60 * 60 * 1000;

interface DailySpend {
  spentWei: bigint;
  windowStart: number;
}

const userDailySpend = new Map<string, DailySpend>();
const pausedUsers = new Set<string>();

function key(addr: string) {
  return addr.toLowerCase();
}

function currentSpend(addr: string): DailySpend {
  const k = key(addr);
  const now = Date.now();
  const existing = userDailySpend.get(k);
  if (!existing || now - existing.windowStart > DAY_MS) {
    const fresh: DailySpend = { spentWei: 0n, windowStart: now };
    userDailySpend.set(k, fresh);
    return fresh;
  }
  return existing;
}

export function isUserPaused(addr: string): boolean {
  return pausedUsers.has(key(addr));
}

export function pauseUser(addr: string) {
  pausedUsers.add(key(addr));
}

export function unpauseUser(addr: string) {
  pausedUsers.delete(key(addr));
}

export function getUserSpendRemaining(addr: string): bigint {
  const s = currentSpend(addr);
  const remaining = PER_USER_DAILY_CAP_WEI - s.spentWei;
  return remaining > 0n ? remaining : 0n;
}

export function getUserSpendInfo(addr: string) {
  const s = currentSpend(addr);
  return {
    spentWei: s.spentWei.toString(),
    capWei: PER_USER_DAILY_CAP_WEI.toString(),
    remainingWei: getUserSpendRemaining(addr).toString(),
    windowStart: s.windowStart,
    paused: isUserPaused(addr),
  };
}

/**
 * Enforce per-trade and per-user-per-day caps. Returns the *capped* amount
 * if the request was within limits but exceeded the user's remaining daily
 * budget — the caller can choose to proceed with the capped amount or reject.
 *
 * Throws an Error with a helpful message if the trade is fully blocked
 * (paused user, or per-trade cap exceeded with no fallback).
 */
export function enforceTradeLimits(
  addr: string,
  requestedWei: bigint
): { allowedWei: bigint; capped: boolean; reason?: string } {
  if (isUserPaused(addr)) {
    throw new Error('Trading paused for this user. Resume to continue.');
  }
  if (requestedWei <= 0n) {
    throw new Error('Trade amount must be > 0');
  }
  if (requestedWei > PER_TRADE_CAP_WEI) {
    throw new Error(`Per-trade cap exceeded: max ${PER_TRADE_CAP_WEI.toString()} wei`);
  }
  const remaining = getUserSpendRemaining(addr);
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

/**
 * Record a successful mirror-trade spend against the daily budget.
 * Call AFTER the on-chain tx confirms; failed txs should NOT debit.
 */
export function recordSpend(addr: string, amountWei: bigint) {
  const s = currentSpend(addr);
  s.spentWei += amountWei;
}

/**
 * Compute a minSharesOut floor enforcing the configured slippage tolerance,
 * given an expected sharesOut. If the AMM/oracle returns sharesOut < floor,
 * the on-chain trade would revert, protecting the user from sandwiches and
 * stale-price front-running.
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

/**
 * Bug #1 fix: atomically reserve daily-spend budget AND debit it in a single
 * synchronous block. Use this instead of `enforceTradeLimits` + `recordSpend`
 * pairs at route-handler call sites where two concurrent requests from the
 * same wallet could both pass the cap check before either writes the spend.
 *
 * If the on-chain tx subsequently fails, the caller MUST call
 * `releaseReservation(addr, allowedWei)` to refund the daily budget.
 *
 * Race-safety note: JavaScript single-threaded execution + no awaits in this
 * function = no other handler can interleave between the read and write.
 * That's the entire fix.
 */
export function reserveAndSpend(
  addr: string,
  requestedWei: bigint
): { allowedWei: bigint; capped: boolean; reason?: string } {
  if (isUserPaused(addr)) {
    throw new Error('Trading paused for this user. Resume to continue.');
  }
  if (requestedWei <= 0n) {
    throw new Error('Trade amount must be > 0');
  }
  if (requestedWei > PER_TRADE_CAP_WEI) {
    throw new Error(`Per-trade cap exceeded: max ${PER_TRADE_CAP_WEI.toString()} wei`);
  }

  // Single synchronous read-modify-write — no awaits, no other handler can
  // interleave. `currentSpend()` reads-or-creates the live ref; we mutate
  // the ref's `spentWei` field by exactly the amount we're about to commit.
  const s = currentSpend(addr);
  const remainingNow = PER_USER_DAILY_CAP_WEI - s.spentWei;
  if (remainingNow <= 0n) {
    throw new Error('Daily mirror-trade cap reached. Try again tomorrow or pause + resume.');
  }
  const capped = requestedWei > remainingNow;
  const allowedWei = capped ? remainingNow : requestedWei;
  s.spentWei += allowedWei;
  return capped
    ? {
        allowedWei,
        capped: true,
        reason: `Capped to remaining daily budget (${remainingNow.toString()} wei)`,
      }
    : { allowedWei, capped: false };
}

/**
 * Refund a reservation previously granted by `reserveAndSpend`. Use this in
 * the catch path of route handlers when the on-chain tx fails after the
 * reservation succeeded — otherwise the user is debited for trades that
 * never executed.
 *
 * Idempotent in the sense that calling with 0n is a no-op. Saturates at 0n
 * (never goes negative).
 */
export function releaseReservation(addr: string, refundWei: bigint): void {
  if (refundWei <= 0n) return;
  const k = key(addr);
  const existing = userDailySpend.get(k);
  if (!existing) return;
  existing.spentWei =
    existing.spentWei > refundWei ? existing.spentWei - refundWei : 0n;
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
  userDailySpend.clear();
  pausedUsers.clear();
}

export function __getSafetyState(): {
  userDailySpend: Array<{ key: string; spentWei: string; windowStart: number }>;
  pausedUsers: string[];
} {
  assertNotProduction('__getSafetyState');
  return {
    userDailySpend: Array.from(userDailySpend.entries()).map(([k, v]) => ({
      key: k,
      spentWei: v.spentWei.toString(),
      windowStart: v.windowStart,
    })),
    pausedUsers: Array.from(pausedUsers),
  };
}
