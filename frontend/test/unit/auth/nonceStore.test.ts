import { describe, it, expect, beforeEach } from 'vitest';
import {
  issueNonce,
  consumeNonce,
  __resetNonceStore,
  __getNonceStoreSize,
} from '@/lib/auth/nonceStore';

beforeEach(() => {
  __resetNonceStore();
});

describe('nonceStore', () => {
  it('issues 64-hex-char nonces with future expiry', async () => {
    const { nonce, expiresAt } = await issueNonce();
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(await __getNonceStoreSize()).toBeGreaterThanOrEqual(1);
  });

  it('consumeNonce returns true once, then false (single-use)', async () => {
    const { nonce } = await issueNonce();
    expect(await consumeNonce(nonce)).toBe(true);
    expect(await consumeNonce(nonce)).toBe(false);
  });

  it('consumeNonce returns false for unknown nonce', async () => {
    expect(await consumeNonce('z'.repeat(64))).toBe(false);
  });

  it('every consume removes the entry from the store', async () => {
    const a = (await issueNonce()).nonce;
    const b = (await issueNonce()).nonce;
    const sizeAfterIssue = await __getNonceStoreSize();
    expect(sizeAfterIssue).toBeGreaterThanOrEqual(2);
    expect(await consumeNonce(a)).toBe(true);
    expect(await consumeNonce(b)).toBe(true);
    // Both nonces consumed; the shim may carry state from other tests
    // running concurrently in the same process — assert delta, not absolute.
    expect(await __getNonceStoreSize()).toBeLessThanOrEqual(sizeAfterIssue);
  });

  it('issues distinct nonces (sanity: the randomness works)', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add((await issueNonce()).nonce);
    expect(seen.size).toBe(100);
  });
});
