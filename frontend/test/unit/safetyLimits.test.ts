/**
 * Unit tests for `lib/safetyLimits.ts`.
 *
 * The module is now KV-backed (in-memory shim in dev/test). Tests reset
 * the shared shim between cases so spend / pause state from one test
 * doesn't bleed into the next. Pure logic, zero network — the in-memory
 * KV shim is exercised, not the real Vercel KV.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parseEther } from 'viem';

type SafetyModule = typeof import('@/lib/safetyLimits');

const ADDR_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDR_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

let mod: SafetyModule;

beforeEach(async () => {
  mod = await import('@/lib/safetyLimits');
  mod.__resetSafetyState();
});

describe('safetyLimits', () => {
  describe('enforceTradeLimits', () => {
    it('allows a trade within all caps', async () => {
      const { allowedWei, capped } = await mod.enforceTradeLimits(ADDR_A, parseEther('10'));
      expect(allowedWei).toBe(parseEther('10'));
      expect(capped).toBe(false);
    });

    it('rejects zero or negative amounts', async () => {
      await expect(mod.enforceTradeLimits(ADDR_A, 0n)).rejects.toThrow(/> 0/);
      await expect(mod.enforceTradeLimits(ADDR_A, -1n)).rejects.toThrow(/> 0/);
    });

    it('rejects amounts above the per-trade cap', async () => {
      const overCap = mod.PER_TRADE_CAP_WEI + 1n;
      await expect(mod.enforceTradeLimits(ADDR_A, overCap)).rejects.toThrow(
        /Per-trade cap exceeded/
      );
    });

    it('allows exactly the per-trade cap', async () => {
      const { allowedWei, capped } = await mod.enforceTradeLimits(
        ADDR_A,
        mod.PER_TRADE_CAP_WEI
      );
      expect(allowedWei).toBe(mod.PER_TRADE_CAP_WEI);
      expect(capped).toBe(false);
    });

    it('rejects when user is paused', async () => {
      await mod.pauseUser(ADDR_A);
      await expect(mod.enforceTradeLimits(ADDR_A, parseEther('1'))).rejects.toThrow(
        /Trading paused/
      );
    });

    it('caps to remaining daily budget when request exceeds it', async () => {
      await mod.recordSpend(ADDR_A, parseEther('4900'));
      const { allowedWei, capped, reason } = await mod.enforceTradeLimits(
        ADDR_A,
        parseEther('500')
      );
      expect(capped).toBe(true);
      expect(allowedWei).toBe(parseEther('100'));
      expect(reason).toMatch(/remaining daily budget/);
    });

    it('rejects after the daily cap is fully consumed', async () => {
      await mod.recordSpend(ADDR_A, mod.PER_USER_DAILY_CAP_WEI);
      await expect(mod.enforceTradeLimits(ADDR_A, parseEther('1'))).rejects.toThrow(
        /Daily mirror-trade cap reached/
      );
    });

    it('treats addresses case-insensitively', async () => {
      await mod.pauseUser(ADDR_A.toUpperCase());
      await expect(
        mod.enforceTradeLimits(ADDR_A.toLowerCase(), parseEther('1'))
      ).rejects.toThrow(/Trading paused/);
    });

    it('isolates spend across users', async () => {
      await mod.recordSpend(ADDR_A, mod.PER_USER_DAILY_CAP_WEI);
      const { allowedWei, capped } = await mod.enforceTradeLimits(
        ADDR_B,
        parseEther('100')
      );
      expect(allowedWei).toBe(parseEther('100'));
      expect(capped).toBe(false);
    });
  });

  describe('pause / resume / isUserPaused', () => {
    it('pauseUser flips isUserPaused to true', async () => {
      expect(await mod.isUserPaused(ADDR_A)).toBe(false);
      await mod.pauseUser(ADDR_A);
      expect(await mod.isUserPaused(ADDR_A)).toBe(true);
    });

    it('unpauseUser flips it back to false', async () => {
      await mod.pauseUser(ADDR_A);
      await mod.unpauseUser(ADDR_A);
      expect(await mod.isUserPaused(ADDR_A)).toBe(false);
    });

    it('unpause is a no-op when not paused', async () => {
      await mod.unpauseUser(ADDR_A);
      expect(await mod.isUserPaused(ADDR_A)).toBe(false);
    });
  });

  describe('recordSpend / getUserSpendRemaining / getUserSpendInfo', () => {
    it('starts at full budget remaining', async () => {
      expect(await mod.getUserSpendRemaining(ADDR_A)).toBe(mod.PER_USER_DAILY_CAP_WEI);
    });

    it('debits the daily window', async () => {
      await mod.recordSpend(ADDR_A, parseEther('100'));
      expect(await mod.getUserSpendRemaining(ADDR_A)).toBe(
        mod.PER_USER_DAILY_CAP_WEI - parseEther('100')
      );
    });

    it('clamps remaining to zero when over-spent (defensive)', async () => {
      await mod.recordSpend(ADDR_A, mod.PER_USER_DAILY_CAP_WEI + parseEther('100'));
      expect(await mod.getUserSpendRemaining(ADDR_A)).toBe(0n);
    });

    it('getUserSpendInfo returns full snapshot', async () => {
      await mod.recordSpend(ADDR_A, parseEther('25'));
      const info = await mod.getUserSpendInfo(ADDR_A);
      expect(info.spentWei).toBe(parseEther('25').toString());
      expect(info.capWei).toBe(mod.PER_USER_DAILY_CAP_WEI.toString());
      expect(info.paused).toBe(false);
      expect(info.windowStart).toBeGreaterThan(0);
    });

    it('getUserSpendInfo reflects paused state', async () => {
      await mod.pauseUser(ADDR_A);
      expect((await mod.getUserSpendInfo(ADDR_A)).paused).toBe(true);
    });

    // Note: the previous test that used `Date.now` mocks to verify 24h
    // window rollover doesn't apply to the KV-backed implementation —
    // the bucket is keyed by `Math.floor(Date.now()/1000/86400)` and the
    // KV TTL is 48h, so a Date.now mock would change the bucket key
    // (creating a fresh entry) rather than expiring the old one. The
    // soak suite covers UTC-rollover behavior end-to-end.
  });

  describe('reserveAndSpend (atomic check + debit)', () => {
    it('debits the daily window and returns allowedWei', async () => {
      const { allowedWei, capped } = await mod.reserveAndSpend(ADDR_A, parseEther('100'));
      expect(allowedWei).toBe(parseEther('100'));
      expect(capped).toBe(false);
      expect(await mod.getUserSpendRemaining(ADDR_A)).toBe(
        mod.PER_USER_DAILY_CAP_WEI - parseEther('100')
      );
    });

    it('caps to remaining when request exceeds it AND debits the capped amount', async () => {
      await mod.recordSpend(ADDR_A, parseEther('4900'));
      const { allowedWei, capped } = await mod.reserveAndSpend(ADDR_A, parseEther('500'));
      expect(capped).toBe(true);
      expect(allowedWei).toBe(parseEther('100'));
      expect(await mod.getUserSpendRemaining(ADDR_A)).toBe(0n);
    });

    it('rejects when paused', async () => {
      await mod.pauseUser(ADDR_A);
      await expect(mod.reserveAndSpend(ADDR_A, parseEther('1'))).rejects.toThrow(
        /Trading paused/
      );
    });
  });

  describe('releaseReservation (refund on tx failure)', () => {
    it('refunds a previously reserved amount', async () => {
      const { allowedWei } = await mod.reserveAndSpend(ADDR_A, parseEther('100'));
      await mod.releaseReservation(ADDR_A, allowedWei);
      expect(await mod.getUserSpendRemaining(ADDR_A)).toBe(mod.PER_USER_DAILY_CAP_WEI);
    });

    it('saturates at zero — refund larger than spent does not go negative', async () => {
      await mod.recordSpend(ADDR_A, parseEther('10'));
      await mod.releaseReservation(ADDR_A, parseEther('100'));
      expect(await mod.getUserSpendRemaining(ADDR_A)).toBe(mod.PER_USER_DAILY_CAP_WEI);
    });

    it('is a no-op for zero or negative refund', async () => {
      await mod.recordSpend(ADDR_A, parseEther('10'));
      await mod.releaseReservation(ADDR_A, 0n);
      await mod.releaseReservation(ADDR_A, -1n);
      expect(await mod.getUserSpendRemaining(ADDR_A)).toBe(
        mod.PER_USER_DAILY_CAP_WEI - parseEther('10')
      );
    });
  });

  describe('computeMinSharesOut', () => {
    it('returns 0 for non-positive expected shares', () => {
      expect(mod.computeMinSharesOut(0n)).toBe(0n);
      expect(mod.computeMinSharesOut(-100n)).toBe(0n);
    });

    it('applies the default 300 bps slippage tolerance', () => {
      expect(mod.computeMinSharesOut(10_000n)).toBe(9_700n);
    });

    it('respects a custom slippage', () => {
      expect(mod.computeMinSharesOut(1_000n, 1_000)).toBe(900n);
    });

    it('clamps slippageBps to [0, 10000]', () => {
      expect(mod.computeMinSharesOut(1_000n, -500)).toBe(1_000n);
      expect(mod.computeMinSharesOut(1_000n, 999_999)).toBe(0n);
    });

    it('handles large numbers without precision loss', () => {
      const huge = parseEther('1000000');
      const out = mod.computeMinSharesOut(huge, 50);
      expect(out).toBe((huge * 9_950n) / 10_000n);
    });
  });
});
