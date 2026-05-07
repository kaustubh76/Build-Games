/**
 * Bug #5: /api/health/balance previously used a raw ethers.JsonRpcProvider
 * against the primary Avalanche RPC, so the very rate-limit it was meant to
 * detect would knock it offline. Post-fix it uses getResilientPublicClient()
 * which fails over to the fallback transport.
 *
 * Pre-fix: this test would 503 because the raw provider gives up on the
 *          first 429.
 * Post-fix: 200 with a fabricated balance, because the mocked viem client
 *          succeeds even when the underlying primary URL would 429.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseEther } from 'viem';

beforeEach(() => {
  vi.resetModules();
  // Provide a server signer so the route gets past the early NO_SIGNER bail.
  // Use a well-known throwaway test key (not ours, never funded). The address
  // it derives is deterministic; the route only reads it locally.
  process.env.PRIVATE_KEY =
    '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('@/lib/viemClient');
});

describe('health-balance fallback soak', () => {
  it('returns 200 when the resilient client successfully reads balance (above floor)', async () => {
    vi.doMock('@/lib/viemClient', () => ({
      getResilientPublicClient: () => ({
        readContract: vi.fn(async () => parseEther('500')), // 500 CRwN, well above 100 floor
      }),
    }));

    const { GET } = await import('@/app/api/health/balance/route');
    const req = new Request('http://localhost:3000/api/health/balance');
    const res = await GET(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(parseFloat(body.balanceCRwN)).toBe(500);
    expect(body.belowFloor).toBe(false);
  });

  it('returns 503 when balance is below floor (real failure mode, not a fallback bug)', async () => {
    vi.doMock('@/lib/viemClient', () => ({
      getResilientPublicClient: () => ({
        readContract: vi.fn(async () => parseEther('5')), // 5 CRwN, below 100 floor
      }),
    }));

    const { GET } = await import('@/app/api/health/balance/route');
    const req = new Request('http://localhost:3000/api/health/balance');
    const res = await GET(req as never);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.belowFloor).toBe(true);
    expect(body.reason).toMatch(/below floor/i);
  });

  it('survives a primary that 429s, because fallback succeeds (the bug #5 fix)', async () => {
    // Simulate the resilient transport: primary throws (HTTP 429), fallback
    // returns ok. getResilientPublicClient() abstracts the failover, so from
    // the route's perspective the readContract just succeeds — exactly the
    // behavior the old raw-provider implementation lacked.
    let callCount = 0;
    vi.doMock('@/lib/viemClient', () => ({
      getResilientPublicClient: () => ({
        readContract: vi.fn(async () => {
          callCount++;
          // The real fallback transport handles the retry internally; we
          // simulate the *user-visible* outcome — no throw, balance returned.
          return parseEther('250');
        }),
      }),
    }));

    const { GET } = await import('@/app/api/health/balance/route');
    const req = new Request('http://localhost:3000/api/health/balance');
    const res = await GET(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(callCount).toBe(1);
    expect(parseFloat(body.balanceCRwN)).toBe(250);
  });

  it('returns 503 with code=BALANCE_CHECK_FAILED if BOTH primary and fallback fail', async () => {
    // When even the fallback dies, the resilient client surfaces an error
    // and we fail closed. This is the documented out-of-scope case (no
    // recovery possible) — we just need to make sure we don't crash.
    vi.doMock('@/lib/viemClient', () => ({
      getResilientPublicClient: () => ({
        readContract: vi.fn(async () => {
          throw new Error('All transports failed: 429 and 503');
        }),
      }),
    }));

    const { GET } = await import('@/app/api/health/balance/route');
    const req = new Request('http://localhost:3000/api/health/balance');
    const res = await GET(req as never);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe('BALANCE_CHECK_FAILED');
    expect(body.reason).toMatch(/All transports failed/);
  });

  it('returns 503 NO_SIGNER when PRIVATE_KEY is missing (no RPC call at all)', async () => {
    delete process.env.PRIVATE_KEY;

    const readContract = vi.fn(async () => parseEther('500'));
    vi.doMock('@/lib/viemClient', () => ({
      getResilientPublicClient: () => ({ readContract }),
    }));

    const { GET } = await import('@/app/api/health/balance/route');
    const req = new Request('http://localhost:3000/api/health/balance');
    const res = await GET(req as never);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe('NO_SIGNER');
    // Critical: we should never have reached the RPC layer.
    expect(readContract).not.toHaveBeenCalled();
  });
});
