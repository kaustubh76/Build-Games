/**
 * /api/health/balance — server wallet CRwN balance health check.
 *
 * Hits Fuji directly. Asserts shape; doesn't enforce a specific balance
 * because the dev wallet level fluctuates with auto-create-mirror runs.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

describe('/api/health/balance', () => {
  it('returns ok flag, balance, and floor', async () => {
    const { GET } = await import('@/app/api/health/balance/route');
    const res = await GET(new NextRequest('http://test/api/health/balance'));
    // 200 if balance >= floor, 503 if below — both are valid shapes
    expect([200, 503]).toContain(res.status);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: expect.any(Boolean),
      wallet: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
      balanceCRwN: expect.any(String),
      floorCRwN: expect.any(String),
      belowFloor: expect.any(Boolean),
      durationMs: expect.any(Number),
    });
    // ok and belowFloor are inversely related
    expect(body.ok).toBe(!body.belowFloor);
  }, 30_000);

  it('always sets no-store cache control', async () => {
    const { GET } = await import('@/app/api/health/balance/route');
    const res = await GET(new NextRequest('http://test/api/health/balance'));
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  }, 30_000);
});
