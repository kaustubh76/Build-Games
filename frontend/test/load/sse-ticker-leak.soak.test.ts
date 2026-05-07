/**
 * Bug #2 mirror: SSE counter leak on /api/markets/ticker/stream when
 * `start()` throws (e.g. viem `client.watchEvent` setup fails). Same shape
 * as sse-counter-leak.soak.test.ts but against the ticker route.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeSseRequest, flushMicrotasks, closeAllStreams, type OpenedStream } from './_helpers';

const URL = 'http://localhost:3000/api/markets/ticker/stream';
const IP_A = '198.51.100.10';
const IP_B = '198.51.100.11';

const opened: OpenedStream[] = [];

beforeEach(async () => {
  // Clear any cross-file mock registrations (singleFork preserves them).
  vi.unmock('@/lib/viemClient');
  vi.resetModules();
  // Mock the resilient viem client so watchEvent doesn't hit Fuji RPC.
  // Returns a sync unsub fn — tests verify the lifecycle, not the real chain.
  vi.doMock('@/lib/viemClient', () => ({
    getResilientPublicClient: () => ({
      watchEvent: vi.fn(() => () => {
        // unsubscribe noop
      }),
      readContract: vi.fn(async () => 0n),
    }),
  }));
  const mod = await import('@/lib/streams/tickerState');
  mod.__resetTickerStreamState();
});

afterEach(async () => {
  await closeAllStreams(opened);
  vi.restoreAllMocks();
  vi.doUnmock('@/lib/viemClient');
});

async function openConnection(ip: string): Promise<OpenedStream> {
  const { GET } = await import('@/app/api/markets/ticker/stream/route');
  const { req, controller } = makeSseRequest(URL, ip);
  const res = await GET(req);
  const stream: OpenedStream = { controller, res, ip };
  opened.push(stream);
  return stream;
}

describe('SSE ticker counter-leak soak', () => {
  it('abrupt-disconnect: 4 connections aborted via signal — counter returns to 0', async () => {
    const stateMod = await import('@/lib/streams/tickerState');
    const { __getTickerStreamState } = stateMod;

    for (let i = 0; i < 4; i++) await openConnection(IP_A);
    expect(__getTickerStreamState().totalSubscribers).toBe(4);

    while (opened.length) {
      const s = opened.pop()!;
      s.controller.abort();
    }
    await flushMicrotasks();
    await flushMicrotasks();

    expect(__getTickerStreamState().totalSubscribers).toBe(0);
    expect(__getTickerStreamState().perIpEntries).toEqual([]);
  });

  it('cancel-without-abort: res.body.cancel() releases the slot', async () => {
    const stateMod = await import('@/lib/streams/tickerState');

    for (let i = 0; i < 4; i++) await openConnection(IP_A);
    expect(stateMod.__getTickerStreamState().totalSubscribers).toBe(4);

    while (opened.length) {
      const s = opened.pop()!;
      await s.res.body?.cancel();
    }
    await flushMicrotasks();

    expect(stateMod.__getTickerStreamState().totalSubscribers).toBe(0);
  });

  it('flap-storm: 50 cycles of (connect 4, abort 4) — no monotonic growth', async () => {
    const stateMod = await import('@/lib/streams/tickerState');

    const start = Date.now();
    for (let cycle = 0; cycle < 50; cycle++) {
      if (Date.now() - start > 18_000) break;

      const cycleStreams: OpenedStream[] = [];
      for (let i = 0; i < 4; i++) cycleStreams.push(await openConnection(IP_B));

      while (cycleStreams.length) {
        const s = cycleStreams.pop()!;
        s.controller.abort();
        const idx = opened.indexOf(s);
        if (idx >= 0) opened.splice(idx, 1);
      }
      await flushMicrotasks();
    }
    await flushMicrotasks();
    await flushMicrotasks();

    expect(stateMod.__getTickerStreamState().totalSubscribers).toBe(0);
  }, 25_000);

  it('multi-ip: per-IP cap enforced + clean teardown across 2 IPs', async () => {
    const stateMod = await import('@/lib/streams/tickerState');
    const { MAX_PER_IP, __getTickerStreamState } = stateMod;

    for (let i = 0; i < MAX_PER_IP; i++) await openConnection(IP_A);
    for (let i = 0; i < MAX_PER_IP; i++) await openConnection(IP_B);
    expect(__getTickerStreamState().totalSubscribers).toBe(MAX_PER_IP * 2);

    // 5th connection from IP_A should be rejected with 429.
    const { GET } = await import('@/app/api/markets/ticker/stream/route');
    const { req } = makeSseRequest(URL, IP_A);
    const rejection = await GET(req);
    expect(rejection.status).toBe(429);

    while (opened.length) {
      const s = opened.pop()!;
      s.controller.abort();
    }
    await flushMicrotasks();
    await flushMicrotasks();

    expect(__getTickerStreamState().totalSubscribers).toBe(0);
  });
});
