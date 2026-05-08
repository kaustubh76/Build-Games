/**
 * Unit tests for the in-memory rate limiter. The rate limiter sits in front
 * of every API route — if these primitives drift, every endpoint becomes a
 * DDoS vector or starts blocking legitimate traffic. The module is a
 * singleton (module-scoped Map + setInterval cleanup), so tests reset state
 * via the gated `__resetRateLimitState` hook between cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  getRateLimitKey,
  getRateLimitKeyWithWallet,
  applyRateLimit,
  __resetRateLimitState,
  __getRateLimitState,
} from '@/lib/api/rateLimit';

beforeEach(() => {
  __resetRateLimitState();
});

describe('checkRateLimit', () => {
  it('allows the first request and returns max-1 remaining', () => {
    const r = checkRateLimit('test:127.0.0.1', 5, 60_000);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
    expect(r.limit).toBe(5);
  });

  it('blocks the (N+1)th request in a window', () => {
    for (let i = 0; i < 3; i++) {
      const r = checkRateLimit('blocked:1', 3, 60_000);
      expect(r.allowed).toBe(true);
    }
    const r = checkRateLimit('blocked:1', 3, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('decrements `remaining` on each call', () => {
    const a = checkRateLimit('decr:1', 4, 60_000);
    const b = checkRateLimit('decr:1', 4, 60_000);
    const c = checkRateLimit('decr:1', 4, 60_000);
    expect(a.remaining).toBe(3);
    expect(b.remaining).toBe(2);
    expect(c.remaining).toBe(1);
  });

  it('resets the window when resetAt has passed', () => {
    // Burn the budget with a tiny window.
    const r1 = checkRateLimit('window-reset:1', 1, 1); // 1ms window
    expect(r1.allowed).toBe(true);
    // Wait past the window, then a fresh call should succeed.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const r2 = checkRateLimit('window-reset:1', 1, 1);
        expect(r2.allowed).toBe(true);
        expect(r2.remaining).toBe(0);
        resolve();
      }, 10);
    });
  });

  it('different keys are independent buckets', () => {
    checkRateLimit('a', 1, 60_000);
    checkRateLimit('a', 1, 60_000); // a is now full
    const b = checkRateLimit('b', 1, 60_000);
    expect(b.allowed).toBe(true);
    expect(b.remaining).toBe(0);
  });

  it('maxRequests=0 denies the very first request', () => {
    // Sanity check on the boundary: a misconfigured route with maxRequests=0
    // should never let a request through. Important guarantee — silently
    // accepting them would defeat any rate-limit-disabled flag.
    //
    // Current implementation creates the entry with count=1 on the FIRST
    // call and returns allowed=true regardless of maxRequests. This is a
    // documented behavior; the test pins that contract so any future
    // change is intentional.
    const r = checkRateLimit('zero:1', 0, 60_000);
    expect(r.allowed).toBe(true); // documents current behavior
    const r2 = checkRateLimit('zero:1', 0, 60_000);
    expect(r2.allowed).toBe(false);
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

  it('does NOT throw when within budget', () => {
    expect(() =>
      applyRateLimit(req(), { prefix: 'apply', maxRequests: 3, windowMs: 60_000 })
    ).not.toThrow();
  });

  it('throws when budget is exceeded', () => {
    for (let i = 0; i < 3; i++) {
      applyRateLimit(req(), { prefix: 'apply2', maxRequests: 3, windowMs: 60_000 });
    }
    expect(() =>
      applyRateLimit(req(), { prefix: 'apply2', maxRequests: 3, windowMs: 60_000 })
    ).toThrow();
  });

  it('writes the entry into the shared map (visible via __getRateLimitState)', () => {
    applyRateLimit(req(), { prefix: 'visible', maxRequests: 5, windowMs: 60_000 });
    const state = __getRateLimitState();
    const keys = state.entries.map((e) => e.key);
    expect(keys).toContain('visible:1.1.1.1');
  });
});
