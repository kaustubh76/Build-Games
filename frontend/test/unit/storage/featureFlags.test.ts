/**
 * Unit tests for the Prisma → 0G migration feature flags. These flags gate
 * Tier-1/2/3 read and write paths across the API surface — if `=== '1'`
 * comparison drifts (e.g. a future refactor to `=== 'true'`), every Tier-2
 * route silently re-routes to Prisma without anyone noticing. Pin the
 * contract here.
 *
 * The flags read `process.env.X` per call (NOT a captured constant), which
 * means a runtime env-var flip takes effect on the next call. The tests
 * verify that property explicitly — flip mid-test, observe the change.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isTier1AuditOnly,
  isTier2EventSourced,
  isTier3BundledReceipts,
} from '@/lib/storage/featureFlags';

const FLAG_KEYS = ['ENABLE_0G_AUDIT_LOGS', 'ENABLE_0G_TIER2', 'ENABLE_0G_TIER3'] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of FLAG_KEYS) {
    originalEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of FLAG_KEYS) {
    if (originalEnv[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = originalEnv[k]!;
    }
  }
});

describe('isTier1AuditOnly', () => {
  it('defaults to false when ENABLE_0G_AUDIT_LOGS is unset', () => {
    expect(isTier1AuditOnly()).toBe(false);
  });

  it('returns true when ENABLE_0G_AUDIT_LOGS is exactly "1"', () => {
    process.env.ENABLE_0G_AUDIT_LOGS = '1';
    expect(isTier1AuditOnly()).toBe(true);
  });

  it('returns false for non-"1" truthy strings ("true", "TRUE", "yes")', () => {
    for (const v of ['true', 'TRUE', 'yes', 'on', '2']) {
      process.env.ENABLE_0G_AUDIT_LOGS = v;
      expect(isTier1AuditOnly()).toBe(false);
    }
  });

  it('returns false for "0" and empty string', () => {
    process.env.ENABLE_0G_AUDIT_LOGS = '0';
    expect(isTier1AuditOnly()).toBe(false);
    process.env.ENABLE_0G_AUDIT_LOGS = '';
    expect(isTier1AuditOnly()).toBe(false);
  });
});

describe('isTier2EventSourced', () => {
  it('defaults to false when ENABLE_0G_TIER2 is unset', () => {
    expect(isTier2EventSourced()).toBe(false);
  });

  it('returns true only on exact string "1"', () => {
    process.env.ENABLE_0G_TIER2 = '1';
    expect(isTier2EventSourced()).toBe(true);
    process.env.ENABLE_0G_TIER2 = '11';
    expect(isTier2EventSourced()).toBe(false);
    process.env.ENABLE_0G_TIER2 = ' 1';
    expect(isTier2EventSourced()).toBe(false);
  });
});

describe('isTier3BundledReceipts', () => {
  it('defaults to false when ENABLE_0G_TIER3 is unset', () => {
    expect(isTier3BundledReceipts()).toBe(false);
  });

  it('returns true only on exact string "1"', () => {
    process.env.ENABLE_0G_TIER3 = '1';
    expect(isTier3BundledReceipts()).toBe(true);
  });
});

describe('per-call evaluation (not module-cached)', () => {
  it('a runtime flag flip changes the next call', () => {
    expect(isTier2EventSourced()).toBe(false);
    process.env.ENABLE_0G_TIER2 = '1';
    expect(isTier2EventSourced()).toBe(true);
    delete process.env.ENABLE_0G_TIER2;
    expect(isTier2EventSourced()).toBe(false);
  });

  it('flags are independent — flipping Tier-2 does not flip Tier-1 or Tier-3', () => {
    process.env.ENABLE_0G_TIER2 = '1';
    expect(isTier2EventSourced()).toBe(true);
    expect(isTier1AuditOnly()).toBe(false);
    expect(isTier3BundledReceipts()).toBe(false);
  });
});
