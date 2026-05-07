/**
 * Integration tests for /api/agents/[id]/verify-hash.
 *
 * The route reads two view-only chain calls then optionally downloads from 0G.
 * Tests assert the response shape across all four states the route returns:
 *   - validation rejection (bad id)
 *   - chain timeout (rate-limit / RPC unavailable) → 503 + CHAIN_TIMEOUT
 *   - storage unavailable (no ZG_PRIVATE_KEY) → 503 + STORAGE_UNAVAILABLE
 *   - happy paths (match / mismatch) — only when 0G is configured
 *
 * Tolerant of Fuji rate-limit by accepting any of the documented error codes.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

const ROUTE_PATH = '@/app/api/agents/[id]/verify-hash/route';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/agents/1/verify-hash', { method: 'GET' });
}

describe('/api/agents/[id]/verify-hash', () => {
  it('rejects non-numeric id', async () => {
    const { GET } = await import(ROUTE_PATH);
    const res = await GET(makeReq(), { params: Promise.resolve({ id: 'banana' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('rejects negative id', async () => {
    const { GET } = await import(ROUTE_PATH);
    const res = await GET(makeReq(), { params: Promise.resolve({ id: '-5' }) });
    expect(res.status).toBe(400);
  });

  it('returns one of the documented response shapes for a valid id', async () => {
    const { GET } = await import(ROUTE_PATH);
    const res = await GET(makeReq(), { params: Promise.resolve({ id: '1' }) });

    // Acceptable outcomes:
    //   200 + { match: true | false, onChainHash, ... }
    //   404 + agent-not-found
    //   503 + CHAIN_TIMEOUT (rate-limited Fuji)
    //   503 + STORAGE_UNAVAILABLE (no ZG_PRIVATE_KEY)
    expect([200, 404, 503]).toContain(res.status);
    const body = await res.json();

    if (res.status === 200) {
      expect(body).toMatchObject({
        match: expect.any(Boolean),
        onChainHash: expect.any(String),
        message: expect.any(String),
      });
    } else if (res.status === 404) {
      expect(body.code).toBe('NOT_FOUND');
    } else if (res.status === 503) {
      expect(['CHAIN_TIMEOUT', 'STORAGE_UNAVAILABLE']).toContain(body.code);
    }
  }, 60_000);

  it('chain timeout (when triggered) returns the structured CHAIN_TIMEOUT code', async () => {
    // We can't deterministically force the timeout without mocking, but if it
    // happens organically the response should be machine-readable.
    const { GET } = await import(ROUTE_PATH);
    const res = await GET(makeReq(), { params: Promise.resolve({ id: '999999' }) });
    expect([200, 404, 503]).toContain(res.status);
    if (res.status === 503) {
      const body = await res.json();
      expect(body.code).toMatch(/CHAIN_TIMEOUT|STORAGE_UNAVAILABLE/);
      expect(body.match).toBe(false);
      expect(body.message).toBeDefined();
    }
  }, 60_000);
});
