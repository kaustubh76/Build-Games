/**
 * Bug #2: SSE counter release leaks if `controller.error()` fires from inside
 * `start()` — neither `request.signal.abort` nor `cancel()` will run, leaving
 * the per-IP and total subscriber counters monotonically growing across
 * connection failures.
 *
 * Pre-fix: `controller-already-closed` sub-test reports `totalSubscribers > 0`
 *          after the consumer has already failed.
 * Post-fix (try/catch wrapping start()): all 4 sub-tests show 0 leaks across
 *          repeated connect/abort cycles.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeSseRequest, flushMicrotasks, closeAllStreams, type OpenedStream } from './_helpers';

const URL = 'http://localhost:3000/api/whale-alerts/stream';
const IP_A = '198.51.100.1';
const IP_B = '198.51.100.2';

const opened: OpenedStream[] = [];

beforeEach(async () => {
  // Reset module graph so each test gets a clean import chain. Counters and
  // mocks are per-test. The state module is a sibling of the route (both
  // dynamic-imported in each test), so they share the same fresh instance
  // within a single test as long as the test imports state BEFORE opening
  // connections (which dynamic-import the route).
  vi.resetModules();
  vi.doUnmock('@/services/externalMarkets/whaleTrackerService');
  const mod = await import('@/lib/streams/whaleAlertsState');
  mod.__resetWhaleStreamState();
});

afterEach(async () => {
  await closeAllStreams(opened);
  vi.restoreAllMocks();
});

async function openConnection(ip: string): Promise<OpenedStream> {
  const { GET } = await import('@/app/api/whale-alerts/stream/route');
  const { req, controller } = makeSseRequest(URL, ip);
  const res = await GET(req);
  const stream: OpenedStream = { controller, res, ip };
  opened.push(stream);
  return stream;
}

describe('SSE whale-alerts counter-leak soak', () => {
  it('abrupt-disconnect: 4 connections aborted via signal — counter returns to 0', async () => {
    const { __getWhaleStreamState } = await import('@/lib/streams/whaleAlertsState');

    for (let i = 0; i < 4; i++) await openConnection(IP_A);
    expect(__getWhaleStreamState().totalSubscribers).toBe(4);

    while (opened.length) {
      const s = opened.pop()!;
      s.controller.abort();
    }
    await flushMicrotasks();
    await flushMicrotasks();

    expect(__getWhaleStreamState().totalSubscribers).toBe(0);
    expect(__getWhaleStreamState().perIpEntries).toEqual([]);
  });

  it('cancel-without-abort: res.body.cancel() releases the slot', async () => {
    const { __getWhaleStreamState } = await import('@/lib/streams/whaleAlertsState');

    for (let i = 0; i < 4; i++) await openConnection(IP_A);
    expect(__getWhaleStreamState().totalSubscribers).toBe(4);

    while (opened.length) {
      const s = opened.pop()!;
      await s.res.body?.cancel();
    }
    await flushMicrotasks();

    expect(__getWhaleStreamState().totalSubscribers).toBe(0);
  });

  it('controller-already-closed: start() throw triggers release (bug #2)', async () => {
    // This test needs a freshly-mocked whaleTrackerService so onWhaleAlert
    // throws synchronously inside start(). Reset modules + re-mock + re-import
    // so the route picks up the throwing mock. Pre-fix: nothing catches this,
    // the slot leaks. Post-fix: the try/catch in start() calls release()
    // before propagating the error.
    vi.resetModules();
    vi.doMock('@/services/externalMarkets/whaleTrackerService', () => ({
      whaleTrackerService: {
        getThreshold: () => 50_000,
        onWhaleAlert: () => {
          throw new Error('synthetic: subscriber registration failed');
        },
      },
    }));

    const stateMod = await import('@/lib/streams/whaleAlertsState');
    stateMod.__resetWhaleStreamState();
    const { GET } = await import('@/app/api/whale-alerts/stream/route');

    const { req } = makeSseRequest(URL, IP_A);
    const res = await GET(req);
    // Reading the body forces the start() to run; the controller.error inside
    // start() will surface as a stream error here.
    try {
      await res.body?.getReader().read();
    } catch {
      // expected — the synthetic throw propagates out of read()
    }
    await flushMicrotasks();
    await flushMicrotasks();

    // Post-fix: counter was reserved (1) then released (0).
    expect(stateMod.__getWhaleStreamState().totalSubscribers).toBe(0);

    vi.doUnmock('@/services/externalMarkets/whaleTrackerService');
  });

  it('flap-storm: 50 cycles of (connect 4, abort 4) on same IP — no monotonic growth', async () => {
    const { __getWhaleStreamState } = await import('@/lib/streams/whaleAlertsState');

    const start = Date.now();
    for (let cycle = 0; cycle < 50; cycle++) {
      // Stop early if we're approaching the 20s budget.
      if (Date.now() - start > 18_000) break;

      const cycleStreams: OpenedStream[] = [];
      for (let i = 0; i < 4; i++) cycleStreams.push(await openConnection(IP_B));

      while (cycleStreams.length) {
        const s = cycleStreams.pop()!;
        s.controller.abort();
        // Mirror it out of `opened` since we're cleaning up here.
        const idx = opened.indexOf(s);
        if (idx >= 0) opened.splice(idx, 1);
      }
      await flushMicrotasks();
    }
    await flushMicrotasks();
    await flushMicrotasks();

    const state = __getWhaleStreamState();
    expect(state.totalSubscribers).toBe(0);
    expect(state.perIpEntries).toEqual([]);
  }, 25_000);

  it('multi-ip flap: 2 IPs each saturating per-IP cap, all released cleanly', async () => {
    // Import state module BEFORE openConnection so we share the same module
    // instance across the test (dynamic-import order matters under resetModules).
    const stateMod = await import('@/lib/streams/whaleAlertsState');
    const { __getWhaleStreamState, MAX_PER_IP } = stateMod;

    for (let i = 0; i < MAX_PER_IP; i++) await openConnection(IP_A);
    for (let i = 0; i < MAX_PER_IP; i++) await openConnection(IP_B);
    expect(__getWhaleStreamState().totalSubscribers).toBe(MAX_PER_IP * 2);

    while (opened.length) {
      const s = opened.pop()!;
      s.controller.abort();
    }
    await flushMicrotasks();
    await flushMicrotasks();

    expect(__getWhaleStreamState().totalSubscribers).toBe(0);
    expect(__getWhaleStreamState().perIpEntries).toEqual([]);
  });
});
