/**
 * Light coverage for /api/copy-trade/audit and /api/whale-alerts/stream.
 *
 * Audit: just the validation + cache happy paths against a real wallet.
 * Stream: minimal — verify it returns an SSE Response with the right headers.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

describe('/api/copy-trade/audit', () => {
  it('rejects missing address', async () => {
    const { GET } = await import('@/app/api/copy-trade/audit/route');
    const res = await GET(new NextRequest('http://test/api/copy-trade/audit'));
    expect(res.status).toBe(400);
  });

  it('rejects malformed address', async () => {
    const { GET } = await import('@/app/api/copy-trade/audit/route');
    const res = await GET(
      new NextRequest('http://test/api/copy-trade/audit?address=0xnope')
    );
    expect(res.status).toBe(400);
  });

  it('returns { entries, stats } shape for an empty wallet', async () => {
    const { GET } = await import('@/app/api/copy-trade/audit/route');
    const res = await GET(
      new NextRequest(`http://test/api/copy-trade/audit?address=${ZERO_ADDR}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      entries: expect.any(Array),
      stats: { total: expect.any(Number), pending: expect.any(Number), completed: expect.any(Number) },
    });
  }, 60_000);

  it('caches per-address (subsequent call returns cached: true)', async () => {
    const { GET } = await import('@/app/api/copy-trade/audit/route');
    await GET(new NextRequest(`http://test/api/copy-trade/audit?address=${ZERO_ADDR}`));
    const res = await GET(
      new NextRequest(`http://test/api/copy-trade/audit?address=${ZERO_ADDR}`)
    );
    const body = await res.json();
    expect(body.cached).toBe(true);
  }, 90_000);
});

describe('/api/whale-alerts/stream', () => {
  it('returns text/event-stream with the right headers', async () => {
    const { GET } = await import('@/app/api/whale-alerts/stream/route');
    const req = new NextRequest('http://test/api/whale-alerts/stream', { method: 'GET' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
  });

  it('first chunk contains a `ready` event', async () => {
    const { GET } = await import('@/app/api/whale-alerts/stream/route');
    const req = new NextRequest('http://test/api/whale-alerts/stream', { method: 'GET' });
    const res = await GET(req);

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value);
    expect(chunk).toMatch(/event: ready/);
    expect(chunk).toMatch(/data: \{.*"threshold"/);
    await reader.cancel();
  });
});
