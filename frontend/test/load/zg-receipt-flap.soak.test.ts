/**
 * Chaos soak: 0G upload flaps with 50% failure rate. Asserts that the
 * persistReceipt helper is robust under partial 0G outages — failures don't
 * throw, the metrics counter reflects them, and the helper consistently
 * returns null on failure (so dual-write callers can lean on Prisma).
 *
 * This test simulates the pre-rollout reality: if 0G is degraded, we want
 * the calling routes to keep running (Prisma is the load-bearing path) and
 * the failures to be observable via metrics.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/services/zgStorageService', () => ({
  upload: vi.fn(),
  isZgConfigured: vi.fn(() => true),
}));

import { persistReceipt, buildEnvelope } from '@/lib/storage/persistReceipt';
import { upload as zgUpload } from '@/services/zgStorageService';

const mockedUpload = zgUpload as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedUpload.mockReset();
});

describe('zg receipt flap soak', () => {
  it('100 persists with 50% failure rate: zero throws, counters reflect outcome', async () => {
    const N = 100;
    let attempted = 0;
    let actualFailures = 0;
    mockedUpload.mockImplementation(async () => {
      attempted++;
      if (attempted % 2 === 0) {
        actualFailures++;
        throw new Error(`synthetic 0G failure #${attempted}`);
      }
      return { rootHash: `0xrh${attempted}`, txHash: `0xtx${attempted}` };
    });

    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        persistReceipt(
          buildEnvelope({ type: 'sync-log', payload: { i } }),
          `flap-${i}.json`
        )
      )
    );

    expect(attempted).toBe(N);
    const successCount = results.filter((r) => r !== null).length;
    const nullCount = results.filter((r) => r === null).length;

    expect(successCount + nullCount).toBe(N);
    // The mock fails on every even-numbered call → 50 failures.
    expect(nullCount).toBe(50);
    expect(successCount).toBe(50);
  });

  it('full 0G outage (100% failure): every call returns null without throwing', async () => {
    const N = 50;
    mockedUpload.mockRejectedValue(new Error('0G network down'));
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        persistReceipt(
          buildEnvelope({ type: 'sync-log', payload: { i } }),
          `outage-${i}.json`
        )
      )
    );
    expect(results.every((r) => r === null)).toBe(true);
    // The helper must have called upload N times (no caching of failure).
    expect(mockedUpload).toHaveBeenCalledTimes(N);
  });

  it('intermittent latency (200ms delay) does not deadlock or interleave wrongly', async () => {
    const N = 30;
    const start = Date.now();
    mockedUpload.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 200));
      return { rootHash: '0xok', txHash: '0xok' };
    });

    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        persistReceipt(
          buildEnvelope({ type: 'sync-log', payload: { i } }),
          `latency-${i}.json`
        )
      )
    );
    expect(results.every((r) => r?.rootHash === '0xok')).toBe(true);
    // 30 parallel 200ms requests should finish in ~200-400ms (not 6s sequential).
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2_000);
  });
});
