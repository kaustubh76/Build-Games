/**
 * Unit tests for the KV-backed rate limiter. Covers the in-memory shim
 * (the dev/test default — production uses Vercel KV / Upstash Redis).
 *
 * Cross-container behavior is the whole point of the migration but can't
 * be tested locally without mocking @vercel/kv at the network boundary.
 * What we DO pin here:
 *   - Counter increments correctly within a window.
 *   - The (N+1)th request in a window is rejected.
 *   - Different keys / IPs are isolated.
 *   - The TTL expires the counter and a fresh window opens.
 *   - applyRateLimit's throw-on-exceed contract.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  getRateLimitKey,
  getRateLimitKeyWithWallet,
  applyRateLimit,
  __resetRateLimitState,
} from '@/lib/api/rateLimit';

beforeEach(() => {
  __resetRateLimitState();
});

describe('checkRateLimit', () => {
  it('allows the first request and returns max-1 remaining', async () => {
    const r = await checkRateLimit('test:127.0.0.1', 5, 60_000);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
    expect(r.limit).toBe(5);
  });

  it('blocks the (N+1)th request in a window', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimit('blocked:1', 3, 60_000);
      expect(r.allowed).toBe(true);
    }
    const r = await checkRateLimit('blocked:1', 3, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('decrements `remaining` on each call', async () => {
    const a = await checkRateLimit('decr:1', 4, 60_000);
    const b = await checkRateLimit('decr:1', 4, 60_000);
    const c = await checkRateLimit('decr:1', 4, 60_000);
    expect(a.remaining).toBe(3);
    expect(b.remaining).toBe(2);
    expect(c.remaining).toBe(1);
  });

  it('resets the window after the TTL elapses', async () => {
    // The KV TTL is rounded up to whole seconds; the smallest meaningful
    // window for this test is 1 second (any sub-second windowMs rounds up).
    const r1 = await checkRateLimit('window-reset:1', 1, 1);
    expect(r1.allowed).toBe(true);
    // Wait just over 1s for the KV TTL to expire.
    await new Promise((res) => setTimeout(res, 1100));
    const r2 = await checkRateLimit('window-reset:1', 1, 1);
    expect(r2.allowed).toBe(true);
  }, 5_000);

  it('different keys are independent buckets', async () => {
    await checkRateLimit('a', 1, 60_000);
    await checkRateLimit('a', 1, 60_000); // a is now full
    const b = await checkRateLimit('b', 1, 60_000);
    expect(b.allowed).toBe(true);
    expect(b.remaining).toBe(0);
  });

  it('maxRequests=0 denies every request (counter ≥ 1 > 0)', async () => {
    // Behavior change vs the previous in-memory limiter: the KV pattern
    // increments first then compares (count > maxRequests). With
    // maxRequests=0, the very first request's count of 1 exceeds 0
    // → rejected. Previously the in-memory code accepted the first call
    // because it set count=1 without checking. The new behavior is more
    // correct: a misconfigured route with maxRequests=0 should reject
    // ALL traffic, not allow one through.
    const r = await checkRateLimit('zero:1', 0, 60_000);
    expect(r.allowed).toBe(false);
  });
});

describe('getRateLimitKey', () => {
  function reqWith(headers: Record<string, string>): Request {
    return new Request('http://example.test/foo', { headers });
  }

  it('uses x-forwarded-for first, splitting on comma', () => {
    const k = getRateLimitKey(reqWith({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }), 'p');
    expect(k).toBe('p:1.2.3.4');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const k = getRateLimitKey(reqWith({ 'x-real-ip': '9.9.9.9' }), 'p');
    expect(k).toBe('p:9.9.9.9');
  });

  it('falls back to cf-connecting-ip when both above are absent', () => {
    const k = getRateLimitKey(reqWith({ 'cf-connecting-ip': '8.8.8.8' }), 'p');
    expect(k).toBe('p:8.8.8.8');
  });

  it('returns "unknown" suffix when no IP header is present', () => {
    const k = getRateLimitKey(reqWith({}), 'p');
    expect(k).toBe('p:unknown');
  });
});

describe('getRateLimitKeyWithWallet', () => {
  it('lowercases the wallet address into the key', () => {
    const req = new Request('http://x.test/y', { headers: {} });
    const k = getRateLimitKeyWithWallet(
      req,
      'auth',
      '0xABCDef0123456789ABCDef0123456789ABCDef01'
    );
    expect(k).toBe('auth:wallet:0xabcdef0123456789abcdef0123456789abcdef01');
  });

  it('returns the IP-only key when wallet is absent', () => {
    const req = new Request('http://x.test/y', {
      headers: { 'x-forwarded-for': '7.7.7.7' },
    });
    const k = getRateLimitKeyWithWallet(req, 'auth');
    expect(k).toBe('auth:7.7.7.7');
  });
});

describe('applyRateLimit (throw on exceed)', () => {
  function req(): Request {
    return new Request('http://x.test/y', { headers: { 'x-forwarded-for': '1.1.1.1' } });
  }

  it('does NOT throw when within budget', async () => {
    await expect(
      applyRateLimit(req(), { prefix: 'apply', maxRequests: 3, windowMs: 60_000 })
    ).resolves.toBeUndefined();
  });

  it('throws when budget is exceeded', async () => {
    for (let i = 0; i < 3; i++) {
      await applyRateLimit(req(), { prefix: 'apply2', maxRequests: 3, windowMs: 60_000 });
    }
    await expect(
      applyRateLimit(req(), { prefix: 'apply2', maxRequests: 3, windowMs: 60_000 })
    ).rejects.toThrow();
  });
});
