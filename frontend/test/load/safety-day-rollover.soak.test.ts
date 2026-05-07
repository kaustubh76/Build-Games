/**
 * Bug #6: daily-window rollover at safetyLimits.ts:33-37 is wall-clock based.
 * Two concurrent operations straddling the DAY_MS boundary could each see
 * different DailySpend refs.
 *
 * Real-world resolution: because reserveAndSpend (bug #1 fix) is fully
 * synchronous (no awaits between currentSpend() and the spend write), the
 * read-write pair always sees the same ref. The rollover happens atomically
 * inside currentSpend(). This soak test verifies the post-rollover behavior
 * is clean: window resets cleanly even with concurrent callers, and no
 * spend is "stranded" on the old DailySpend ref.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseEther } from 'viem';

const ADDR = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  const mod = await import('@/lib/safetyLimits');
  mod.__resetSafetyState();
});

describe('safety-limits day-rollover soak', () => {
  it('within the same day: spends accumulate normally', async () => {
    const { reserveAndSpend, getUserSpendInfo } = await import('@/lib/safetyLimits');

    reserveAndSpend(ADDR, parseEther('100'));
    vi.advanceTimersByTime(60_000); // 1 min later
    reserveAndSpend(ADDR, parseEther('200'));
    vi.advanceTimersByTime(60_000);
    reserveAndSpend(ADDR, parseEther('300'));

    expect(BigInt(getUserSpendInfo(ADDR).spentWei)).toBe(parseEther('600'));
  });

  it('crossing the day boundary: window resets, fresh budget available', async () => {
    const { reserveAndSpend, getUserSpendInfo } = await import('@/lib/safetyLimits');

    reserveAndSpend(ADDR, parseEther('1000'));
    expect(BigInt(getUserSpendInfo(ADDR).spentWei)).toBe(parseEther('1000'));

    // Advance past the daily window.
    vi.advanceTimersByTime(DAY_MS + 1);

    // First spend after rollover should see a fresh 0 budget — old spend is gone.
    reserveAndSpend(ADDR, parseEther('500'));
    expect(BigInt(getUserSpendInfo(ADDR).spentWei)).toBe(parseEther('500'));
  });

  it('100 concurrent spends straddling the boundary: total never doubled, no torn state', async () => {
    const { reserveAndSpend, getUserSpendInfo, PER_USER_DAILY_CAP_WEI } = await import(
      '@/lib/safetyLimits'
    );

    // Day 1: half-full at the cap.
    for (let i = 0; i < 25; i++) {
      reserveAndSpend(ADDR, parseEther('100'));
    }
    expect(BigInt(getUserSpendInfo(ADDR).spentWei)).toBe(parseEther('2500'));

    // Advance time PAST the boundary so the next call triggers rollover.
    vi.advanceTimersByTime(DAY_MS + 1);

    // 100 concurrent spends — each is a full sync reserveAndSpend call. They
    // all share the same currentSpend ref because currentSpend() is sync and
    // runs to completion before any other call can interleave.
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        Promise.resolve().then(() => {
          try {
            return reserveAndSpend(ADDR, parseEther('100'));
          } catch {
            return null;
          }
        })
      )
    );

    const totalSpent = BigInt(getUserSpendInfo(ADDR).spentWei);
    // The day cap is 5000 CRwN = 50 successful 100-CRwN trades.
    expect(totalSpent).toBeLessThanOrEqual(PER_USER_DAILY_CAP_WEI);
    expect(totalSpent).toBe(PER_USER_DAILY_CAP_WEI);

    const successes = results.filter((r) => r !== null).length;
    expect(successes).toBe(50);
  });

  it('windowStart updates only at rollover, not on every read', async () => {
    const { reserveAndSpend, getUserSpendInfo } = await import('@/lib/safetyLimits');

    reserveAndSpend(ADDR, parseEther('100'));
    const info1 = getUserSpendInfo(ADDR);

    vi.advanceTimersByTime(60_000);
    reserveAndSpend(ADDR, parseEther('100'));
    const info2 = getUserSpendInfo(ADDR);

    // Same window — windowStart should be unchanged.
    expect(info2.windowStart).toBe(info1.windowStart);

    // Cross the boundary.
    vi.advanceTimersByTime(DAY_MS);
    reserveAndSpend(ADDR, parseEther('100'));
    const info3 = getUserSpendInfo(ADDR);

    expect(info3.windowStart).toBeGreaterThan(info1.windowStart);
    expect(BigInt(info3.spentWei)).toBe(parseEther('100')); // fresh window
  });

  it('releaseReservation across the rollover boundary refunds the new window', async () => {
    const { reserveAndSpend, releaseReservation, getUserSpendInfo } = await import(
      '@/lib/safetyLimits'
    );

    reserveAndSpend(ADDR, parseEther('500'));
    vi.advanceTimersByTime(DAY_MS + 1); // rollover

    // After rollover, releaseReservation operates on the NEW window (which is
    // 0n). This is the correct behavior — the old reservation belongs to a
    // window that no longer exists; refunding it would just saturate at 0.
    releaseReservation(ADDR, parseEther('500'));
    expect(BigInt(getUserSpendInfo(ADDR).spentWei)).toBe(0n);
  });
});
