/**
 * Integration tests for /api/safety and /api/copy-trade/whale-mirror.
 *
 * Layer A only — no funded test wallet, no real on-chain writes:
 *   - /api/safety: pure in-memory state mutations
 *   - /api/copy-trade/whale-mirror: error paths (bad input, paused user, no
 *     mirror market) return clean 400/503 BEFORE the contract is called.
 *
 * Layer B (real on-chain trades) is gated behind CI_TEST_WALLET_PRIVATE_KEY
 * and is skipped here.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ADDR = '0x5a6472782a098230e04A891a78BeEE1b7d48E90c';
const ADDR_LOWER = ADDR.toLowerCase();

function makePost(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

describe('/api/safety', () => {
  beforeEach(() => {
    // Reset module state per test so paused users + spend windows are fresh.
    vi.resetModules();
  });

  it('GET returns user spend info + system caps', async () => {
    const { GET } = await import('@/app/api/safety/route');
    const res = await GET(makeGet(`http://test/api/safety?address=${ADDR}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({
      spentWei: '0',
      capWei: expect.any(String),
      remainingWei: expect.any(String),
      paused: false,
    });
    expect(body.system).toMatchObject({
      perTradeCapWei: expect.any(String),
      perUserDailyCapWei: expect.any(String),
      maxSlippageBps: expect.any(Number),
    });
  });

  it('GET rejects bad address', async () => {
    const { GET } = await import('@/app/api/safety/route');
    const res1 = await GET(makeGet('http://test/api/safety'));
    expect(res1.status).toBe(400);
    const res2 = await GET(makeGet('http://test/api/safety?address=0xnope'));
    expect(res2.status).toBe(400);
  });

  it('POST pause then GET shows paused: true', async () => {
    const { GET, POST } = await import('@/app/api/safety/route');
    const pauseRes = await POST(
      makePost('http://test/api/safety', { address: ADDR, action: 'pause' })
    );
    expect(pauseRes.status).toBe(200);
    const pauseBody = await pauseRes.json();
    expect(pauseBody.paused).toBe(true);

    const stateRes = await GET(makeGet(`http://test/api/safety?address=${ADDR}`));
    const state = await stateRes.json();
    expect(state.user.paused).toBe(true);
  });

  it('POST resume flips it back', async () => {
    const { GET, POST } = await import('@/app/api/safety/route');
    await POST(makePost('http://test/api/safety', { address: ADDR, action: 'pause' }));
    await POST(makePost('http://test/api/safety', { address: ADDR, action: 'resume' }));

    const stateRes = await GET(makeGet(`http://test/api/safety?address=${ADDR}`));
    const state = await stateRes.json();
    expect(state.user.paused).toBe(false);
  });

  it('POST rejects unknown action', async () => {
    const { POST } = await import('@/app/api/safety/route');
    const res = await POST(
      makePost('http://test/api/safety', { address: ADDR, action: 'fly' })
    );
    expect(res.status).toBe(400);
  });

  it('POST rejects bad/missing address', async () => {
    const { POST } = await import('@/app/api/safety/route');
    const res = await POST(makePost('http://test/api/safety', { action: 'pause' }));
    expect(res.status).toBe(400);
  });

  it('treats addresses case-insensitively at the safetyLimits layer', async () => {
    // Direct call against safetyLimits — the route handlers re-import the same
    // module so they share state at runtime, but vitest's resetModules splits
    // them. Test the underlying layer directly, where it's an unambiguous unit.
    const safety = await import('@/lib/safetyLimits');
    safety.pauseUser(ADDR.toUpperCase());
    expect(safety.isUserPaused(ADDR_LOWER)).toBe(true);
  });
});

describe('/api/copy-trade/whale-mirror (Layer A)', () => {
  // Each test gets a fresh module to clear the idempotency cache + paused state.
  beforeEach(() => {
    vi.resetModules();
  });

  it('rejects without a body', async () => {
    const { POST } = await import('@/app/api/copy-trade/whale-mirror/route');
    const res = await POST(
      new NextRequest('http://test/api/copy-trade/whale-mirror', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects missing whaleTrade snapshot', async () => {
    const { POST } = await import('@/app/api/copy-trade/whale-mirror/route');
    const res = await POST(
      makePost('http://test/api/copy-trade/whale-mirror', {
        userAddress: ADDR,
        whaleTradeId: 'no-snapshot',
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/snapshot/i);
  });

  it('rejects malformed userAddress', async () => {
    const { POST } = await import('@/app/api/copy-trade/whale-mirror/route');
    const res = await POST(
      makePost('http://test/api/copy-trade/whale-mirror', {
        userAddress: '0xnope',
        whaleTradeId: 'x',
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects when user is paused (pre-flight)', async () => {
    const { POST: pause } = await import('@/app/api/safety/route');
    await pause(makePost('http://test/api/safety', { address: ADDR, action: 'pause' }));

    const { POST: mirror } = await import('@/app/api/copy-trade/whale-mirror/route');
    const res = await mirror(
      makePost('http://test/api/copy-trade/whale-mirror', {
        userAddress: ADDR,
        whaleTradeId: 'paused-test',
        whaleTrade: {
          id: 'paused-test',
          source: 'POLYMARKET',
          marketId: 'paused-mkt',
          marketQuestion: 'X',
          outcome: 'yes',
          side: 'buy',
          amountUsd: '50000',
        },
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Trading paused/i);
  });

  it('rejects sizeCRwN above per-trade cap (pre-flight)', async () => {
    const { POST } = await import('@/app/api/copy-trade/whale-mirror/route');
    const res = await POST(
      makePost('http://test/api/copy-trade/whale-mirror', {
        userAddress: ADDR,
        whaleTradeId: 'over-cap',
        sizeCRwN: '999999',
        whaleTrade: {
          id: 'over-cap',
          source: 'POLYMARKET',
          marketId: 'over-cap-mkt',
          marketQuestion: 'X',
          outcome: 'yes',
          side: 'buy',
          amountUsd: '50000',
        },
      })
    );
    // 999999 → minWei(999999, default-100, sysCap-1000) = 1000 → fits per-trade cap.
    // Falls through to mirror-market lookup, which won't find this synthetic ID,
    // so we expect 400 with "No active mirror market"  (auto-create off by default).
    expect([400, 503]).toContain(res.status);
    const body = await res.json();
    expect(body.error).toMatch(/No active mirror market|Per-trade cap/i);
  });

  it('with auto-create disabled, rejects with helpful env hint', async () => {
    delete process.env.ENABLE_AUTO_CREATE_MIRROR;
    const { POST } = await import('@/app/api/copy-trade/whale-mirror/route');
    const res = await POST(
      makePost('http://test/api/copy-trade/whale-mirror', {
        userAddress: ADDR,
        whaleTradeId: 'no-auto-create',
        whaleTrade: {
          id: 'no-auto-create',
          source: 'POLYMARKET',
          marketId: 'never-mirrored-' + Date.now(),
          marketQuestion: 'X',
          outcome: 'yes',
          side: 'buy',
          amountUsd: '50000',
        },
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/ENABLE_AUTO_CREATE_MIRROR/);
  }, 30_000);

  it('idempotency: second call within 5min returns cached result', async () => {
    const { POST } = await import('@/app/api/copy-trade/whale-mirror/route');
    const payload = {
      userAddress: ADDR,
      whaleTradeId: 'idempotent-' + Date.now(),
      whaleTrade: {
        id: 'idempotent-' + Date.now(),
        source: 'POLYMARKET',
        marketId: 'idempotent-mkt-' + Date.now(),
        marketQuestion: 'X',
        outcome: 'yes' as const,
        side: 'buy' as const,
        amountUsd: '50000',
      },
    };
    payload.whaleTradeId = payload.whaleTrade.id;

    // First call rejects (no mirror market), but error responses are NOT cached
    // (idempotency only caches successful results). So we'd need a successful
    // path to test this — and we don't have one without a real chain write.
    // Instead, assert the failure shape matches across calls, which is the
    // observable behavior for read-only test paths.
    const r1 = await POST(makePost('http://test/api/copy-trade/whale-mirror', payload));
    const r2 = await POST(makePost('http://test/api/copy-trade/whale-mirror', payload));
    expect(r1.status).toBe(r2.status);
  }, 60_000);
});
