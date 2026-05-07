/**
 * Integration tests for /api/markets/ticker/stream — the SSE source for live
 * MirrorTradeExecuted events. Mirror of api-stream-backpressure.test.ts but
 * for the ticker variant.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ROUTE_PATH = '@/app/api/markets/ticker/stream/route';

const opened: Array<{ controller: AbortController; res: Response }> = [];

function makeReq(ip = '198.51.100.7'): { req: NextRequest; controller: AbortController } {
  const controller = new AbortController();
  const req = new NextRequest('http://test/api/markets/ticker/stream', {
    method: 'GET',
    headers: { 'x-forwarded-for': ip },
    signal: controller.signal,
  });
  return { req, controller };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(async () => {
  while (opened.length) {
    const { controller, res } = opened.pop()!;
    controller.abort();
    try {
      await res.body?.cancel();
    } catch {
      // ignore
    }
  }
});

describe('/api/markets/ticker/stream', () => {
  it('first connection returns text/event-stream', async () => {
    const { GET } = await import(ROUTE_PATH);
    const { req, controller } = makeReq();
    const res = await GET(req);
    opened.push({ controller, res });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(res.headers.get('x-accel-buffering')).toBe('no');
  });

  it('first chunk delivers a `ready` event', async () => {
    const { GET } = await import(ROUTE_PATH);
    const { req, controller } = makeReq();
    const res = await GET(req);
    opened.push({ controller, res });
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value);
    expect(chunk).toMatch(/event: ready/);
    expect(chunk).toMatch(/"subscribers":/);
    await reader.cancel();
  });

  it('per-IP cap rejects the 5th concurrent connection', async () => {
    const { GET } = await import(ROUTE_PATH);
    for (let i = 0; i < 4; i++) {
      const { req, controller } = makeReq();
      const res = await GET(req);
      expect(res.status).toBe(200);
      opened.push({ controller, res });
    }
    const { req, controller } = makeReq();
    const res = await GET(req);
    opened.push({ controller, res });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('STREAM_PER_IP_CAP');
    expect(res.headers.get('Retry-After')).toBe('5');
  });
});
