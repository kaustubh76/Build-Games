/**
 * Bug #1: lost updates between `enforceTradeLimits` (read remaining) and
 * `recordSpend` (write spend) when two concurrent requests from the same
 * wallet straddle the cap-check + spend.
 *
 * Pre-fix: Sub-test #1 (raw recordSpend race) passes today because recordSpend
 *          itself is single-statement and JS is single-threaded — but the
 *          REAL bug surfaces in #2 (full reserve-then-write pattern with an
 *          await in between, simulating the route handler).
 *
 * Post-fix: Sub-test #2 should fail with `enforceTradeLimits + recordSpend`
 *           pair (lost update) and pass with `reserveAndSpend` (atomic).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parseEther } from 'viem';

const ADDR = '0x1234567890abcdef1234567890abcdef12345678';

beforeEach(async () => {
  // Fresh module so userDailySpend / pausedUsers reset between tests.
  // (We don't use vi.resetModules here because we want to call __resetSafetyState
  // on the same module instance across this file.)
  const mod = await import('@/lib/safetyLimits');
  mod.__resetSafetyState();
});

describe('safetyLimits race conditions', () => {
  it('recordSpend alone: 200 concurrent calls all land (single-statement is safe)', async () => {
    const { recordSpend, getUserSpendInfo } = await import('@/lib/safetyLimits');
    const N = 200;
    await Promise.all(
      Array.from({ length: N }, () => Promise.resolve().then(() => recordSpend(ADDR, parseEther('1'))))
    );
    const info = getUserSpendInfo(ADDR);
    // Bug check: if recordSpend is racy in a way that loses updates, this fails.
    // In practice, JS single-threaded execution makes this safe; the bug is in
    // the *gap between* enforceTradeLimits and recordSpend (next test).
    expect(BigInt(info.spentWei)).toBe(parseEther(String(N)));
  });

  it('PRE-FIX bug: enforceTradeLimits + recordSpend pair allows two concurrent requests to both pass the cap check before either records the spend, resulting in over-spend', async () => {
    const { enforceTradeLimits, recordSpend, PER_USER_DAILY_CAP_WEI, getUserSpendInfo } = await import(
      '@/lib/safetyLimits'
    );

    // Each request asks for 600 CRwN. Daily cap is 5000 CRwN.
    // Pre-spend: ALREADY at 4500 (90% of cap).
    recordSpend(ADDR, parseEther('4500'));

    // Now two concurrent requests both want 600 CRwN. Remaining = 500.
    // Without atomic reserve-and-spend, both pass enforceTradeLimits because
    // both see remaining=500 (since neither has called recordSpend yet), get
    // capped to 500, then both call recordSpend(500) → user spends 1000.

    const simulateRequest = async () => {
      const limit = enforceTradeLimits(ADDR, parseEther('600'));
      // Simulate the on-chain tx wait — this is the gap that opens the race.
      await new Promise((r) => setTimeout(r, 5));
      recordSpend(ADDR, limit.allowedWei);
      return limit.allowedWei;
    };

    const [a, b] = await Promise.all([simulateRequest(), simulateRequest()]);

    const info = getUserSpendInfo(ADDR);
    const totalSpent = BigInt(info.spentWei);

    // PROOF OF BUG: the user spent more than the daily cap.
    // Both requests passed and recorded; total is 4500 + 500 + 500 = 5500 > 5000.
    expect(totalSpent).toBeGreaterThan(PER_USER_DAILY_CAP_WEI);
    expect(a + b).toBeGreaterThan(parseEther('500')); // both got the full 500
  });

  it('POST-FIX: reserveAndSpend is atomic — same scenario does NOT over-spend', async () => {
    const { reserveAndSpend, recordSpend, PER_USER_DAILY_CAP_WEI, getUserSpendInfo } = await import(
      '@/lib/safetyLimits'
    );

    // Pre-spend: ALREADY at 4500.
    recordSpend(ADDR, parseEther('4500'));

    // Two concurrent requests, but using reserveAndSpend.
    const simulateRequest = async () => {
      try {
        const limit = reserveAndSpend(ADDR, parseEther('600'));
        await new Promise((r) => setTimeout(r, 5)); // simulate on-chain tx
        return { ok: true as const, allowedWei: limit.allowedWei };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : 'fail' };
      }
    };

    const [a, b] = await Promise.all([simulateRequest(), simulateRequest()]);

    const info = getUserSpendInfo(ADDR);
    const totalSpent = BigInt(info.spentWei);

    // The atomic version: first request gets 500 (capped to remaining), second
    // request finds remaining=0 → throws 'Daily mirror-trade cap reached'.
    expect(totalSpent).toBeLessThanOrEqual(PER_USER_DAILY_CAP_WEI);
    expect(totalSpent).toBe(PER_USER_DAILY_CAP_WEI); // exactly hit the cap

    // Exactly one request succeeded; one failed.
    const okCount = [a, b].filter((r) => r.ok).length;
    const failCount = [a, b].filter((r) => !r.ok).length;
    expect(okCount).toBe(1);
    expect(failCount).toBe(1);
  });

  it('releaseReservation refunds a failed tx', async () => {
    const { reserveAndSpend, releaseReservation, getUserSpendInfo } = await import(
      '@/lib/safetyLimits'
    );

    const reserved = reserveAndSpend(ADDR, parseEther('100'));
    expect(reserved.allowedWei).toBe(parseEther('100'));
    expect(BigInt(getUserSpendInfo(ADDR).spentWei)).toBe(parseEther('100'));

    // Simulate tx failure → refund
    releaseReservation(ADDR, reserved.allowedWei);
    expect(BigInt(getUserSpendInfo(ADDR).spentWei)).toBe(0n);
  });

  it('releaseReservation saturates at zero (never negative)', async () => {
    const { releaseReservation, getUserSpendInfo, recordSpend } = await import(
      '@/lib/safetyLimits'
    );

    recordSpend(ADDR, parseEther('10'));
    releaseReservation(ADDR, parseEther('100')); // refund > spent
    expect(BigInt(getUserSpendInfo(ADDR).spentWei)).toBe(0n);
  });

  it('reserveAndSpend respects per-trade cap (1000 CRwN)', async () => {
    const { reserveAndSpend } = await import('@/lib/safetyLimits');
    expect(() => reserveAndSpend(ADDR, parseEther('1001'))).toThrow(/Per-trade cap exceeded/);
  });

  it('reserveAndSpend respects pause', async () => {
    const { reserveAndSpend, pauseUser } = await import('@/lib/safetyLimits');
    pauseUser(ADDR);
    expect(() => reserveAndSpend(ADDR, parseEther('100'))).toThrow(/Trading paused/);
  });

  it('100 concurrent reserveAndSpend on the same wallet: total spent never exceeds daily cap', async () => {
    const { reserveAndSpend, PER_USER_DAILY_CAP_WEI, getUserSpendInfo } = await import(
      '@/lib/safetyLimits'
    );
    const N = 100;
    const PER_REQ = parseEther('100'); // 100 × 100 = 10_000 CRwN, 2× the cap

    const simulateRequest = async () => {
      try {
        return reserveAndSpend(ADDR, PER_REQ);
      } catch {
        return null;
      }
    };

    await Promise.all(Array.from({ length: N }, () => simulateRequest()));

    const totalSpent = BigInt(getUserSpendInfo(ADDR).spentWei);
    expect(totalSpent).toBeLessThanOrEqual(PER_USER_DAILY_CAP_WEI);
    // Should be exactly at the cap (50 successful 100-CRwN trades)
    expect(totalSpent).toBe(PER_USER_DAILY_CAP_WEI);
  });
});
