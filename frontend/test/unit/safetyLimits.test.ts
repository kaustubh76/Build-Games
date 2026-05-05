/**
 * Unit tests for `lib/safetyLimits.ts`.
 *
 * The module holds in-process state (paused users, per-user spend windows),
 * so we re-import the module per-test via `vi.resetModules()` to get a clean
 * slate every time. Pure logic, zero network.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseEther } from 'viem';

// Re-imported per test inside `loadFresh`. Importing types up here keeps tsc happy.
type SafetyModule = typeof import('@/lib/safetyLimits');

const ADDR_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDR_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

async function loadFresh(): Promise<SafetyModule> {
  vi.resetModules();
  return await import('@/lib/safetyLimits');
}

describe('safetyLimits', () => {
  let mod: SafetyModule;

  beforeEach(async () => {
    mod = await loadFresh();
  });

  describe('enforceTradeLimits', () => {
    it('allows a trade within all caps', () => {
      const { allowedWei, capped } = mod.enforceTradeLimits(ADDR_A, parseEther('10'));
      expect(allowedWei).toBe(parseEther('10'));
      expect(capped).toBe(false);
    });

    it('rejects zero or negative amounts', () => {
      expect(() => mod.enforceTradeLimits(ADDR_A, 0n)).toThrow(/> 0/);
      expect(() => mod.enforceTradeLimits(ADDR_A, -1n)).toThrow(/> 0/);
    });

    it('rejects amounts above the per-trade cap', () => {
      const overCap = mod.PER_TRADE_CAP_WEI + 1n;
      expect(() => mod.enforceTradeLimits(ADDR_A, overCap)).toThrow(
        /Per-trade cap exceeded/
      );
    });

    it('allows exactly the per-trade cap', () => {
      const { allowedWei, capped } = mod.enforceTradeLimits(
        ADDR_A,
        mod.PER_TRADE_CAP_WEI
      );
      expect(allowedWei).toBe(mod.PER_TRADE_CAP_WEI);
      expect(capped).toBe(false);
    });

    it('rejects when user is paused', () => {
      mod.pauseUser(ADDR_A);
      expect(() => mod.enforceTradeLimits(ADDR_A, parseEther('1'))).toThrow(
        /Trading paused/
      );
    });

    it('caps to remaining daily budget when request exceeds it', () => {
      // Spend 4900 of the 5000 CRwN daily cap
      mod.recordSpend(ADDR_A, parseEther('4900'));
      // Request 500 (also under the per-trade cap of 1000)
      const { allowedWei, capped, reason } = mod.enforceTradeLimits(
        ADDR_A,
        parseEther('500')
      );
      expect(capped).toBe(true);
      expect(allowedWei).toBe(parseEther('100'));
      expect(reason).toMatch(/remaining daily budget/);
    });

    it('rejects after the daily cap is fully consumed', () => {
      mod.recordSpend(ADDR_A, mod.PER_USER_DAILY_CAP_WEI);
      expect(() => mod.enforceTradeLimits(ADDR_A, parseEther('1'))).toThrow(
        /Daily mirror-trade cap reached/
      );
    });

    it('treats addresses case-insensitively', () => {
      mod.pauseUser(ADDR_A.toUpperCase());
      expect(() => mod.enforceTradeLimits(ADDR_A.toLowerCase(), parseEther('1'))).toThrow(
        /Trading paused/
      );
    });

    it('isolates spend across users', () => {
      mod.recordSpend(ADDR_A, mod.PER_USER_DAILY_CAP_WEI);
      // User B is unaffected
      const { allowedWei, capped } = mod.enforceTradeLimits(ADDR_B, parseEther('100'));
      expect(allowedWei).toBe(parseEther('100'));
      expect(capped).toBe(false);
    });
  });

  describe('pause / resume / isUserPaused', () => {
    it('pauseUser flips isUserPaused to true', () => {
      expect(mod.isUserPaused(ADDR_A)).toBe(false);
      mod.pauseUser(ADDR_A);
      expect(mod.isUserPaused(ADDR_A)).toBe(true);
    });

    it('unpauseUser flips it back to false', () => {
      mod.pauseUser(ADDR_A);
      mod.unpauseUser(ADDR_A);
      expect(mod.isUserPaused(ADDR_A)).toBe(false);
    });

    it('unpause is a no-op when not paused', () => {
      expect(() => mod.unpauseUser(ADDR_A)).not.toThrow();
      expect(mod.isUserPaused(ADDR_A)).toBe(false);
    });
  });

  describe('recordSpend / getUserSpendRemaining / getUserSpendInfo', () => {
    it('starts at full budget remaining', () => {
      expect(mod.getUserSpendRemaining(ADDR_A)).toBe(mod.PER_USER_DAILY_CAP_WEI);
    });

    it('debits the daily window', () => {
      mod.recordSpend(ADDR_A, parseEther('100'));
      expect(mod.getUserSpendRemaining(ADDR_A)).toBe(
        mod.PER_USER_DAILY_CAP_WEI - parseEther('100')
      );
    });

    it('clamps remaining to zero when over-spent (defensive)', () => {
      mod.recordSpend(ADDR_A, mod.PER_USER_DAILY_CAP_WEI + parseEther('100'));
      expect(mod.getUserSpendRemaining(ADDR_A)).toBe(0n);
    });

    it('getUserSpendInfo returns full snapshot', () => {
      mod.recordSpend(ADDR_A, parseEther('25'));
      const info = mod.getUserSpendInfo(ADDR_A);
      expect(info.spentWei).toBe(parseEther('25').toString());
      expect(info.capWei).toBe(mod.PER_USER_DAILY_CAP_WEI.toString());
      expect(info.paused).toBe(false);
      expect(info.windowStart).toBeGreaterThan(0);
    });

    it('getUserSpendInfo reflects paused state', () => {
      mod.pauseUser(ADDR_A);
      expect(mod.getUserSpendInfo(ADDR_A).paused).toBe(true);
    });

    it('window resets after 24h via Date.now mock', () => {
      const realNow = Date.now;
      const t0 = realNow();
      try {
        Date.now = () => t0;
        mod.recordSpend(ADDR_A, parseEther('1000'));
        expect(mod.getUserSpendRemaining(ADDR_A)).toBe(
          mod.PER_USER_DAILY_CAP_WEI - parseEther('1000')
        );

        // Jump 25 hours forward — daily window expires
        Date.now = () => t0 + 25 * 60 * 60 * 1000;
        expect(mod.getUserSpendRemaining(ADDR_A)).toBe(mod.PER_USER_DAILY_CAP_WEI);
      } finally {
        Date.now = realNow;
      }
    });
  });

  describe('computeMinSharesOut', () => {
    it('returns 0 for non-positive expected shares', () => {
      expect(mod.computeMinSharesOut(0n)).toBe(0n);
      expect(mod.computeMinSharesOut(-100n)).toBe(0n);
    });

    it('applies the default 300 bps slippage tolerance', () => {
      // 10_000 wei * (10000-300)/10000 = 9700
      expect(mod.computeMinSharesOut(10_000n)).toBe(9_700n);
    });

    it('respects a custom slippage', () => {
      // 1000 bps = 10%
      expect(mod.computeMinSharesOut(1_000n, 1_000)).toBe(900n);
    });

    it('clamps slippageBps to [0, 10000]', () => {
      // Negative slippage → 0 (no slippage allowed)
      expect(mod.computeMinSharesOut(1_000n, -500)).toBe(1_000n);
      // >10000 → 10000 (everything is slippage; floor = 0)
      expect(mod.computeMinSharesOut(1_000n, 999_999)).toBe(0n);
    });

    it('handles large numbers without precision loss', () => {
      const huge = parseEther('1000000');
      const out = mod.computeMinSharesOut(huge, 50); // 0.5%
      expect(out).toBe((huge * 9_950n) / 10_000n);
    });
  });
});
