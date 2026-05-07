import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  issueNonce,
  consumeNonce,
  __resetNonceStore,
  __getNonceStoreSize,
} from '@/lib/auth/nonceStore';

beforeEach(() => {
  __resetNonceStore();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('nonceStore', () => {
  it('issues 64-hex-char nonces with future expiry', () => {
    const { nonce, expiresAt } = issueNonce();
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(__getNonceStoreSize()).toBe(1);
  });

  it('consumeNonce returns true once, then false (single-use)', () => {
    const { nonce } = issueNonce();
    expect(consumeNonce(nonce)).toBe(true);
    expect(consumeNonce(nonce)).toBe(false);
  });

  it('consumeNonce returns false for unknown nonce', () => {
    expect(consumeNonce('z'.repeat(64))).toBe(false);
  });

  it('consumeNonce returns false for expired nonce', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T12:00:00Z'));
    const { nonce } = issueNonce();
    vi.advanceTimersByTime(6 * 60 * 1000); // 6 min — past 5-min TTL
    expect(consumeNonce(nonce)).toBe(false);
  });

  it('every consume removes the entry from the store', () => {
    const a = issueNonce().nonce;
    const b = issueNonce().nonce;
    expect(__getNonceStoreSize()).toBe(2);
    expect(consumeNonce(a)).toBe(true);
    expect(__getNonceStoreSize()).toBe(1);
    expect(consumeNonce(b)).toBe(true);
    expect(__getNonceStoreSize()).toBe(0);
  });

  it('issues distinct nonces (sanity: the randomness works)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(issueNonce().nonce);
    expect(seen.size).toBe(100);
  });
});
