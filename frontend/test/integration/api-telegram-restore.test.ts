/**
 * Tests for /api/whale-alerts/subscribe-telegram/restore.
 *
 * The route requires CRON_SECRET. We don't actually exercise the 0G download
 * path (no real rootHash to point at + needs ZG_PRIVATE_KEY); just verify the
 * auth + validation gates work and that the underlying restore function
 * validates input shape.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

const ROUTE_PATH = '@/app/api/whale-alerts/subscribe-telegram/restore/route';

function makeReq(body: unknown, withAuth = true): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (withAuth) headers['Authorization'] = `Bearer ${process.env.CRON_SECRET ?? 'test-cron-secret'}`;
  return new NextRequest(
    'http://test/api/whale-alerts/subscribe-telegram/restore',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }
  );
}

describe('/api/whale-alerts/subscribe-telegram/restore', () => {
  it('rejects missing auth (401)', async () => {
    const { POST } = await import(ROUTE_PATH);
    const res = await POST(makeReq({ rootHash: 'abc12345' }, false));
    expect(res.status).toBe(401);
  });

  it('rejects bad body (400)', async () => {
    const { POST } = await import(ROUTE_PATH);
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('rejects rootHash that is too short', async () => {
    const { POST } = await import(ROUTE_PATH);
    const res = await POST(makeReq({ rootHash: 'x' }));
    expect(res.status).toBe(400);
  });

  it('with valid auth + body but unreachable rootHash, returns 503 or 400', async () => {
    const { POST } = await import(ROUTE_PATH);
    const res = await POST(makeReq({ rootHash: '0xdeadbeef'.padEnd(70, '0') }));
    expect([400, 503]).toContain(res.status);
    const body = await res.json();
    expect(['STORAGE_UNAVAILABLE', 'INVALID_SNAPSHOT', 'BAD_REQUEST']).toContain(body.code);
  }, 60_000);
});
