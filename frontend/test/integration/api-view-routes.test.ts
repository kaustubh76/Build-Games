/**
 * Integration tests for view-only API routes.
 *
 * Imports route handlers directly and invokes them with NextRequest. No need
 * to spin up the Next dev server. View-only → free, low flake risk.
 *
 *  - /api/mirror/execute (read actions: getMirrorKey, getMirrorMarket, query)
 *  - /api/mirror/positions
 *  - /api/arena/replays
 *  - /api/markets/ticker
 *  - /api/cron/sync-agent-events (cron-secret gated)
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

const VALID_ADDR = '0x5a6472782a098230e04A891a78BeEE1b7d48E90c';
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

function makePost(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function makeGet(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { method: 'GET', headers });
}

describe('/api/mirror/execute (read actions)', () => {
  it('getMirrorKey returns a valid bytes32', async () => {
    const { POST } = await import('@/app/api/mirror/execute/route');
    const res = await POST(
      makePost('http://test/api/mirror/execute', {
        action: 'getMirrorKey',
        source: 'POLYMARKET',
        externalId: 'integration-test-1',
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mirrorKey).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('getMirrorKey is deterministic across calls', async () => {
    const { POST } = await import('@/app/api/mirror/execute/route');
    const r1 = await POST(
      makePost('http://test/api/mirror/execute', {
        action: 'getMirrorKey',
        source: 'POLYMARKET',
        externalId: 'integration-test-determinism',
      })
    );
    const r2 = await POST(
      makePost('http://test/api/mirror/execute', {
        action: 'getMirrorKey',
        source: 'POLYMARKET',
        externalId: 'integration-test-determinism',
      })
    );
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.mirrorKey).toBe(b2.mirrorKey);
  });

  it('getMirrorMarket returns the struct shape (even for inactive keys)', async () => {
    const { POST } = await import('@/app/api/mirror/execute/route');
    // Use a deterministic key (zero) — guaranteed non-active
    const res = await POST(
      makePost('http://test/api/mirror/execute', {
        action: 'getMirrorMarket',
        mirrorKey: '0x' + '0'.repeat(64),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      mirrorKey: '0x' + '0'.repeat(64),
      onChainMarketId: expect.any(String),
      isActive: false,
      externalLink: expect.objectContaining({ isActive: false }),
    });
  });

  it('alias query is treated identically to getMirrorMarket', async () => {
    const { POST } = await import('@/app/api/mirror/execute/route');
    const res = await POST(
      makePost('http://test/api/mirror/execute', {
        action: 'query',
        mirrorKey: '0x' + '0'.repeat(64),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mirrorKey).toBe('0x' + '0'.repeat(64));
  });

  it('rejects an invalid action with 400', async () => {
    const { POST } = await import('@/app/api/mirror/execute/route');
    const res = await POST(
      makePost('http://test/api/mirror/execute', { action: 'banana' })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.error).toMatch(/Invalid action payload/);
  });

  it('rejects an unknown source string', async () => {
    const { POST } = await import('@/app/api/mirror/execute/route');
    const res = await POST(
      makePost('http://test/api/mirror/execute', {
        action: 'getMirrorKey',
        source: 'NASDAQ',
        externalId: 'whatever',
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('rejects malformed mirrorKey', async () => {
    const { POST } = await import('@/app/api/mirror/execute/route');
    const res = await POST(
      makePost('http://test/api/mirror/execute', {
        action: 'getMirrorMarket',
        mirrorKey: '0xnope',
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects an empty body', async () => {
    const { POST } = await import('@/app/api/mirror/execute/route');
    const res = await POST(
      new NextRequest('http://test/api/mirror/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );
    expect(res.status).toBe(400);
  });
});

describe('/api/mirror/positions', () => {
  it('returns { positions: [] } for an empty wallet', async () => {
    const { GET } = await import('@/app/api/mirror/positions/route');
    const res = await GET(
      makeGet(`http://test/api/mirror/positions?walletAddress=${ZERO_ADDR}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ positions: [] });
  }, 120_000);

  it('rejects a missing walletAddress', async () => {
    const { GET } = await import('@/app/api/mirror/positions/route');
    const res = await GET(makeGet('http://test/api/mirror/positions'));
    expect(res.status).toBe(400);
  });

  it('rejects a malformed walletAddress', async () => {
    const { GET } = await import('@/app/api/mirror/positions/route');
    const res = await GET(
      makeGet('http://test/api/mirror/positions?walletAddress=0xnotvalid')
    );
    expect(res.status).toBe(400);
  });

  it('caches per-address (subsequent call returns cached: true)', async () => {
    const { GET } = await import('@/app/api/mirror/positions/route');
    await GET(makeGet(`http://test/api/mirror/positions?walletAddress=${VALID_ADDR}`));
    const res = await GET(
      makeGet(`http://test/api/mirror/positions?walletAddress=${VALID_ADDR}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(true);
  }, 90_000);
});

describe('/api/arena/replays', () => {
  it('returns { entries, total } shape', async () => {
    const { GET } = await import('@/app/api/arena/replays/route');
    const res = await GET(makeGet('http://test/api/arena/replays?limit=5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('entries');
    expect(Array.isArray(body.entries)).toBe(true);
    // Either total or note is present (note appears if PredictionArena isn't configured)
    expect(body.total !== undefined || body.note !== undefined).toBe(true);
  }, 30_000);

  it('clamps limit to [1, 100]', async () => {
    const { GET } = await import('@/app/api/arena/replays/route');
    const res = await GET(makeGet('http://test/api/arena/replays?limit=999'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.length).toBeLessThanOrEqual(100);
  }, 30_000);
});

describe('/api/markets/ticker', () => {
  it('returns { rows } shape', async () => {
    const { GET } = await import('@/app/api/markets/ticker/route');
    const res = await GET(makeGet('http://test/api/markets/ticker?limit=4'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('rows');
    expect(Array.isArray(body.rows)).toBe(true);
    if (body.rows.length > 0) {
      const row = body.rows[0];
      expect(row).toMatchObject({
        mirrorKey: expect.stringMatching(/^0x[0-9a-f]{64}$/),
        source: expect.stringMatching(/^(POLYMARKET|KALSHI)$/),
        yesBps: expect.any(Number),
        noBps: expect.any(Number),
        isActive: expect.any(Boolean),
      });
    }
  }, 30_000);

  it('serves cached results within TTL', async () => {
    const { GET } = await import('@/app/api/markets/ticker/route');
    await GET(makeGet('http://test/api/markets/ticker?limit=4'));
    const res = await GET(makeGet('http://test/api/markets/ticker?limit=4'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(true);
  }, 30_000);
});

describe('/api/cron/sync-agent-events', () => {
  it('rejects without authorization', async () => {
    const { GET } = await import('@/app/api/cron/sync-agent-events/route');
    const res = await GET(makeGet('http://test/api/cron/sync-agent-events'));
    expect(res.status).toBe(401);
  });

  it('rejects with the wrong bearer', async () => {
    const { GET } = await import('@/app/api/cron/sync-agent-events/route');
    const res = await GET(
      makeGet('http://test/api/cron/sync-agent-events', {
        Authorization: 'Bearer wrong-secret',
      })
    );
    expect(res.status).toBe(401);
  });

  it('runs end-to-end with the right bearer', async () => {
    const { GET } = await import('@/app/api/cron/sync-agent-events/route');
    const res = await GET(
      makeGet('http://test/api/cron/sync-agent-events', {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.head).toBeGreaterThan(0);
    expect(body.checkpointStorage).toBe('in-memory (no centralized DB)');
  }, 60_000);
});
