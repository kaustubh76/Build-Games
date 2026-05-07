/**
 * Chaos smoke test: exercises the WORST-case end-to-end scenario in a single
 * test budget. Combines several pressure points that previously had their
 * own bugs:
 *
 *   - SSE counter saturation + flap (bug #2)
 *   - Concurrent recordSpend / reserveAndSpend (bug #1, bug #6)
 *   - Idempotency cache flooding (bug #4)
 *   - Telegram fan-out at scale (bug #7)
 *
 * Acceptance: zero counter leaks, zero double-spends, zero idem cache overflow,
 * no unhandled promise rejections, finishes within the 30s test budget.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseEther } from 'viem';
import { makeSseRequest, flushMicrotasks, type OpenedStream } from './_helpers';

const ADDR_A = '0xaaaa00000000000000000000000000000000aaaa';
const ADDR_B = '0xbbbb00000000000000000000000000000000bbbb';

beforeEach(async () => {
  vi.unmock('@/lib/viemClient');
  vi.resetModules();
  vi.doMock('@/lib/viemClient', () => ({
    getResilientPublicClient: () => ({
      watchEvent: vi.fn(() => () => {}),
      readContract: vi.fn(async () => 0n),
    }),
  }));
  vi.doMock('@/services/zgStorageService', () => ({
    upload: vi.fn(async () => ({ rootHash: 'fake', txHash: 'fake' })),
    download: vi.fn(),
    isZgConfigured: vi.fn(() => false),
  }));

  const safety = await import('@/lib/safetyLimits');
  safety.__resetSafetyState();
  const whaleState = await import('@/lib/streams/whaleAlertsState');
  whaleState.__resetWhaleStreamState();
  const telegram = await import('@/lib/telegram/subscriptions');
  telegram.__resetSubscriptions();
  const idem = await import('@/lib/cache/boundedIdempotencyCache');
  // No singleton to reset for the bounded cache — each test creates its own.
  void idem;
});

describe('chaos smoke: worst-case end-to-end', () => {
  it('5s of mixed pressure on SSE, safetyLimits, idem cache, telegram fanout — zero leaks, zero overflow', async () => {
    const safety = await import('@/lib/safetyLimits');
    const whaleState = await import('@/lib/streams/whaleAlertsState');
    const telegram = await import('@/lib/telegram/subscriptions');
    const { BoundedIdempotencyCache } = await import('@/lib/cache/boundedIdempotencyCache');
    const { GET: whaleGet } = await import('@/app/api/whale-alerts/stream/route');

    // Set up 1k subscribers (representative scale).
    for (let i = 0; i < 1000; i++) {
      await telegram.upsertSubscription({
        userAddress: `0x${i.toString(16).padStart(40, '0')}`,
        telegramChatId: `chat-${i}`,
        thresholdUsd: 100 + i,
        sources: i % 2 === 0 ? ['POLYMARKET'] : ['KALSHI'],
      });
    }

    const idemCache = new BoundedIdempotencyCache({
      maxSize: 1000,
      trimTarget: 500,
      windowMs: 60_000,
    });

    const start = Date.now();
    const DEADLINE_MS = 5_000;
    const streams: OpenedStream[] = [];

    let recordSpendCalls = 0;
    let recordSpendSucceeded = 0;
    let idemInsertCount = 0;
    let fanoutCount = 0;
    const errors: unknown[] = [];

    process.on('unhandledRejection', (e) => errors.push(e));

    const tick = async () => {
      // 1. SSE flap: open + close 4 connections from a rotating IP.
      const ip = `198.51.100.${Math.floor(Math.random() * 100)}`;
      for (let i = 0; i < 4; i++) {
        try {
          const { req, controller } = makeSseRequest('http://x/api/whale-alerts/stream', ip);
          const res = await whaleGet(req);
          streams.push({ controller, res, ip });
        } catch (e) {
          errors.push(e);
        }
      }
      // Abort half of them immediately.
      while (streams.length > 2) {
        const s = streams.pop()!;
        try {
          s.controller.abort();
        } catch (e) {
          errors.push(e);
        }
      }
      await flushMicrotasks();

      // 2. Concurrent reserveAndSpend on two addresses.
      const promises = [];
      for (let i = 0; i < 20; i++) {
        recordSpendCalls += 2;
        promises.push(
          Promise.resolve().then(() => {
            try {
              safety.reserveAndSpend(ADDR_A, parseEther('10'));
              recordSpendSucceeded += 1;
            } catch {
              // cap reached — expected
            }
          }),
          Promise.resolve().then(() => {
            try {
              safety.reserveAndSpend(ADDR_B, parseEther('10'));
              recordSpendSucceeded += 1;
            } catch {
              // cap reached — expected
            }
          })
        );
      }
      await Promise.all(promises);

      // 3. Idem cache flood.
      for (let i = 0; i < 100; i++) {
        idemCache.set(`key-${idemInsertCount++}`, {
          timestamp: Date.now(),
          result: i,
        });
      }
      // Invariant: cache size NEVER exceeds maxSize.
      if (idemCache.size > 1000) {
        errors.push(new Error(`idem cache overflowed: size=${idemCache.size}`));
      }

      // 4. Telegram fan-out.
      const matches = telegram.findMatchingSubscribers(50_000, 'POLYMARKET');
      fanoutCount += matches.length;
    };

    while (Date.now() - start < DEADLINE_MS) {
      await tick();
    }

    // Final teardown of any remaining SSE connections.
    while (streams.length) {
      const s = streams.pop()!;
      try {
        s.controller.abort();
      } catch {
        // ignore
      }
    }
    await flushMicrotasks();
    await flushMicrotasks();

    // Acceptance criteria:
    // 1. No unhandled errors.
    expect(errors).toEqual([]);

    // 2. SSE counter returned to 0.
    expect(whaleState.__getWhaleStreamState().totalSubscribers).toBe(0);

    // 3. Daily-spend never exceeded the cap (5000 CRwN per address).
    const cap = safety.PER_USER_DAILY_CAP_WEI;
    expect(BigInt(safety.getUserSpendInfo(ADDR_A).spentWei)).toBeLessThanOrEqual(cap);
    expect(BigInt(safety.getUserSpendInfo(ADDR_B).spentWei)).toBeLessThanOrEqual(cap);

    // 4. Idem cache size stayed within bounds.
    expect(idemCache.size).toBeLessThanOrEqual(1000);

    // 5. Some real work happened (this isn't a no-op test).
    expect(recordSpendCalls).toBeGreaterThan(0);
    expect(recordSpendSucceeded).toBeGreaterThan(0);
    expect(idemInsertCount).toBeGreaterThan(0);
    expect(fanoutCount).toBeGreaterThan(0);
  }, 30_000);
});
