/**
 * Env validator unit tests. The validator is the fail-fast guard at startup,
 * so we want explicit coverage of: required-missing, pattern-mismatch,
 * chain-conditional promotion, and the aggregate-throw shape.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateEnv, assertEnvOrThrow, ENV_SPECS, CHAIN_IDS } from '@/lib/envValidator';

/** Build a minimum env that passes for Fuji. Tests pick + override from this. */
function fujiBaseEnv(): NodeJS.ProcessEnv {
  return {
    PRIVATE_KEY: '0x' + '01'.repeat(32),
    GAME_MASTER_PRIVATE_KEY: '0x' + '02'.repeat(32),
    AI_SIGNER_PRIVATE_KEY: '0x' + '03'.repeat(32),
    CRON_SECRET: 'ci-test-secret',
    SESSION_SECRET: 'this-is-a-test-secret-that-is-at-least-32-chars',
    DATABASE_URL: 'file:./dev.db',
    NEXT_PUBLIC_CHAIN_ID: '43113',
  } as NodeJS.ProcessEnv;
}

function mainnetBaseEnv(): NodeJS.ProcessEnv {
  return {
    ...fujiBaseEnv(),
    NEXT_PUBLIC_CHAIN_ID: '43114',
    NEXT_PUBLIC_CROWN_TOKEN: '0x' + 'ab'.repeat(20),
    NEXT_PUBLIC_WARRIORS_NFT: '0x' + 'cd'.repeat(20),
    NEXT_PUBLIC_ARENA_FACTORY: '0x' + 'ef'.repeat(20),
    NEXT_PUBLIC_PREDICTION_MARKET: '0x' + '12'.repeat(20),
    NEXT_PUBLIC_AI_AGENT_REGISTRY: '0x' + '34'.repeat(20),
    NEXT_PUBLIC_EXTERNAL_MARKET_MIRROR: '0x' + '56'.repeat(20),
  } as NodeJS.ProcessEnv;
}

describe('envValidator', () => {
  describe('validateEnv', () => {
    it('passes on a fully-populated Fuji env', () => {
      const result = validateEnv(fujiBaseEnv());
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.chainId).toBe(CHAIN_IDS.FUJI);
    });

    it('fails when PRIVATE_KEY is missing', () => {
      const env = fujiBaseEnv();
      delete env.PRIVATE_KEY;
      const result = validateEnv(env);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('PRIVATE_KEY'))).toBe(true);
    });

    it('fails when CRON_SECRET is empty string', () => {
      const env = fujiBaseEnv();
      env.CRON_SECRET = '';
      const result = validateEnv(env);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('CRON_SECRET'))).toBe(true);
    });

    it('fails when NEXT_PUBLIC_CHAIN_ID is not a supported chain', () => {
      const env = fujiBaseEnv();
      env.NEXT_PUBLIC_CHAIN_ID = '12345';
      const result = validateEnv(env);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('not a supported chain'))).toBe(true);
    });

    it('fails when PRIVATE_KEY does not match hex pattern', () => {
      const env = fujiBaseEnv();
      env.PRIVATE_KEY = 'not-a-hex-key';
      const result = validateEnv(env);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('PRIVATE_KEY') && e.includes('pattern'))).toBe(
        true
      );
    });

    it('warns (not errors) on missing recommended OPENAI_API_KEY', () => {
      const env = fujiBaseEnv();
      const result = validateEnv(env);
      expect(result.ok).toBe(true); // not blocking
      expect(result.warnings.some((w) => w.includes('OPENAI_API_KEY'))).toBe(true);
    });

    describe('mainnet (43114) chain-conditional vars', () => {
      it('FAILS when chainId=43114 and per-contract overrides are missing', () => {
        // mainnet-only base: required service vars set, but no per-contract overrides
        const env = fujiBaseEnv();
        env.NEXT_PUBLIC_CHAIN_ID = '43114';
        const result = validateEnv(env);
        expect(result.ok).toBe(false);
        // Each chain-conditional var should now appear as an ERROR, not a warning.
        expect(result.errors.some((e) => e.includes('NEXT_PUBLIC_CROWN_TOKEN'))).toBe(true);
        expect(result.errors.some((e) => e.includes('NEXT_PUBLIC_WARRIORS_NFT'))).toBe(true);
        expect(result.errors.some((e) => e.includes('NEXT_PUBLIC_ARENA_FACTORY'))).toBe(true);
        expect(result.errors.some((e) => e.includes('NEXT_PUBLIC_PREDICTION_MARKET'))).toBe(true);
        expect(result.errors.some((e) => e.includes('NEXT_PUBLIC_EXTERNAL_MARKET_MIRROR'))).toBe(
          true
        );
      });

      it('passes when all mainnet contract overrides are set', () => {
        const result = validateEnv(mainnetBaseEnv());
        expect(result.ok).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('rejects an obviously-invalid mainnet contract address (regex)', () => {
        const env = mainnetBaseEnv();
        env.NEXT_PUBLIC_CROWN_TOKEN = 'not-an-address';
        const result = validateEnv(env);
        expect(result.ok).toBe(false);
        expect(
          result.errors.some(
            (e) => e.includes('NEXT_PUBLIC_CROWN_TOKEN') && e.includes('pattern')
          )
        ).toBe(true);
      });

      it('treats mainnet contracts as merely recommended on Fuji (chainId=43113)', () => {
        const env = fujiBaseEnv();
        // Fuji defaults — no NEXT_PUBLIC_CROWN_TOKEN set
        const result = validateEnv(env);
        expect(result.ok).toBe(true);
        // The mainnet-conditional vars should appear as warnings on Fuji.
        const all = [...result.errors, ...result.warnings];
        expect(all.some((m) => m.includes('NEXT_PUBLIC_CROWN_TOKEN'))).toBe(true);
        // ...and must NOT appear in errors.
        expect(result.errors.some((e) => e.includes('NEXT_PUBLIC_CROWN_TOKEN'))).toBe(false);
      });
    });

    it('aggregates multiple errors in a single result', () => {
      const env: NodeJS.ProcessEnv = {
        NEXT_PUBLIC_CHAIN_ID: '43113',
      } as NodeJS.ProcessEnv;
      const result = validateEnv(env);
      expect(result.ok).toBe(false);
      // Each of the 6 always-required vars (PRIVATE_KEY, GAME_MASTER_,
      // AI_SIGNER_, CRON_SECRET, SESSION_SECRET, DATABASE_URL) → error.
      expect(result.errors.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('assertEnvOrThrow', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('does not throw on a healthy Fuji env', () => {
      expect(() => assertEnvOrThrow(fujiBaseEnv())).not.toThrow();
    });

    it('throws an aggregated error listing every missing var', () => {
      const env: NodeJS.ProcessEnv = {
        NEXT_PUBLIC_CHAIN_ID: '43113',
      } as NodeJS.ProcessEnv;
      let caught: Error | null = null;
      try {
        assertEnvOrThrow(env);
      } catch (e) {
        caught = e as Error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught!.message).toMatch(/Environment validation failed/);
      // Must list each missing required var.
      expect(caught!.message).toContain('PRIVATE_KEY');
      expect(caught!.message).toContain('CRON_SECRET');
      expect(caught!.message).toContain('DATABASE_URL');
    });

    it('does not throw on warnings alone (recommended-only failures)', () => {
      // Healthy env, but missing OPENAI_API_KEY (recommended).
      expect(() => assertEnvOrThrow(fujiBaseEnv())).not.toThrow();
      // The warning should have been logged.
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('ENV_SPECS table', () => {
    it('has no duplicate var names', () => {
      const names = ENV_SPECS.map((s) => s.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });

    it('has at least one required var (sanity)', () => {
      expect(ENV_SPECS.some((s) => s.severity === 'required')).toBe(true);
    });

    it('all chain-conditional vars target known chain IDs', () => {
      const known = new Set(Object.values(CHAIN_IDS) as number[]);
      for (const spec of ENV_SPECS) {
        if (spec.requiredFor) {
          for (const id of spec.requiredFor) {
            expect(known.has(id)).toBe(true);
          }
        }
      }
    });
  });
});
