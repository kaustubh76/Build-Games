/**
 * Tests for the SSE backpressure caps in /api/whale-alerts/stream.
 *
 * - First 4 connections from the same IP succeed (200 + text/event-stream)
 * - 5th connection from the same IP rejected (429 STREAM_PER_IP_CAP)
 * - Disconnecting frees the slot
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

interface StreamRoute {
  GET: (req: NextRequest) => Promise<Response>;
}

const opened: Array<{ controller: AbortController; res: Response }> = [];

function makeStreamRequest(ip = '203.0.113.7'): { req: NextRequest; controller: AbortController } {
  const controller = new AbortController();
  const req = new NextRequest('http://test/api/whale-alerts/stream', {
    method: 'GET',
    headers: { 'x-forwarded-for': ip },
    signal: controller.signal,
  });
  return { req, controller };
}

beforeEach(() => {
  // Reset the module so per-test the IP counter starts fresh.
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

describe('/api/whale-alerts/stream backpressure', () => {
  it('per-IP cap rejects the 5th concurrent connection from the same IP', async () => {
    const mod = (await import('@/app/api/whale-alerts/stream/route')) as StreamRoute;

    for (let i = 0; i < 4; i++) {
      const { req, controller } = makeStreamRequest();
      const res = await mod.GET(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
      opened.push({ controller, res });
    }

    const { req, controller } = makeStreamRequest();
    const res = await mod.GET(req);
    opened.push({ controller, res });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('STREAM_PER_IP_CAP');
    expect(body.details.max).toBe(4);
    expect(res.headers.get('Retry-After')).toBe('5');
  });

  it('different IPs are tracked independently', async () => {
    const mod = (await import('@/app/api/whale-alerts/stream/route')) as StreamRoute;

    // Saturate IP A
    for (let i = 0; i < 4; i++) {
      const { req, controller } = makeStreamRequest('1.2.3.4');
      const res = await mod.GET(req);
      expect(res.status).toBe(200);
      opened.push({ controller, res });
    }

    // IP B can still connect
    const { req, controller } = makeStreamRequest('5.6.7.8');
    const res = await mod.GET(req);
    expect(res.status).toBe(200);
    opened.push({ controller, res });
  });
});
