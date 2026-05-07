/**
 * Bug #4: idempotency cache eviction was post-set, allowing the cache to
 * transiently exceed its size cap under concurrent insertion floods. The fix
 * is in `BoundedIdempotencyCache.set()`: trim BEFORE inserting at capacity.
 *
 * Pre-fix simulation (the route-level cleanup() pattern): after 12k inserts,
 *           size briefly hits 12k before any cleanup() runs.
 * Post-fix: size NEVER exceeds the configured maxSize, even at peak, because
 *           every set() is preceded by a synchronous trim when size==max.
 */

import { describe, it, expect } from 'vitest';
import { BoundedIdempotencyCache } from '@/lib/cache/boundedIdempotencyCache';

describe('BoundedIdempotencyCache flood soak', () => {
  it('size never exceeds maxSize under sequential inserts', () => {
    const cache = new BoundedIdempotencyCache({
      maxSize: 1_000,
      trimTarget: 500,
      windowMs: 60_000,
    });

    const sizes: number[] = [];
    for (let i = 0; i < 12_000; i++) {
      cache.set(`key-${i}`, { timestamp: Date.now() + i, result: i });
      sizes.push(cache.size);
    }

    const max = Math.max(...sizes);
    expect(max).toBeLessThanOrEqual(1_000);
    expect(cache.size).toBeLessThanOrEqual(1_000);
  });

  it('size never exceeds maxSize under concurrent (Promise.all) inserts', async () => {
    const cache = new BoundedIdempotencyCache({
      maxSize: 1_000,
      trimTarget: 500,
      windowMs: 60_000,
    });

    const sizes: number[] = [];
    await Promise.all(
      Array.from({ length: 12_000 }, (_, i) =>
        Promise.resolve().then(() => {
          cache.set(`key-${i}`, { timestamp: Date.now() + i, result: i });
          sizes.push(cache.size);
        })
      )
    );

    const max = Math.max(...sizes);
    expect(max).toBeLessThanOrEqual(1_000);
    expect(cache.size).toBeLessThanOrEqual(1_000);
  });

  it('trim preserves the newest entries by timestamp', () => {
    const cache = new BoundedIdempotencyCache({
      maxSize: 100,
      trimTarget: 50,
      windowMs: 60_000,
    });

    for (let i = 0; i < 200; i++) {
      cache.set(`key-${i}`, { timestamp: 1000 + i, result: i });
    }

    // After overflow + trim, only the newest 50 (or so) entries survive.
    expect(cache.size).toBeLessThanOrEqual(100);

    // Spot check: the most recent insertions should still be present.
    expect(cache.get('key-199')).toBeDefined();
    expect(cache.get('key-198')).toBeDefined();
    // The oldest entries should have been evicted.
    expect(cache.get('key-0')).toBeUndefined();
    expect(cache.get('key-1')).toBeUndefined();
  });

  it('cleanup() drops expired entries (TTL-based eviction)', () => {
    const cache = new BoundedIdempotencyCache({
      maxSize: 1_000,
      trimTarget: 500,
      windowMs: 1_000, // 1s window
    });

    const now = Date.now();
    // Insert 50 entries with old timestamps (well past 2 * windowMs ago).
    for (let i = 0; i < 50; i++) {
      cache.set(`old-${i}`, { timestamp: now - 10_000, result: i });
    }
    // Insert 50 entries with fresh timestamps.
    for (let i = 0; i < 50; i++) {
      cache.set(`new-${i}`, { timestamp: now, result: i });
    }
    expect(cache.size).toBe(100);

    cache.cleanup();

    expect(cache.size).toBe(50);
    expect(cache.get('old-0')).toBeUndefined();
    expect(cache.get('new-0')).toBeDefined();
  });

  it('inspector __getState returns the current size and config', () => {
    const cache = new BoundedIdempotencyCache({
      maxSize: 5_000,
      trimTarget: 2_500,
      windowMs: 300_000,
    });
    cache.set('a', { timestamp: Date.now(), result: 1 });
    cache.set('b', { timestamp: Date.now(), result: 2 });
    const state = cache.__getState();
    expect(state.size).toBe(2);
    expect(state.max).toBe(5_000);
    expect(state.trimTarget).toBe(2_500);
  });

  it('rejects invalid configuration (trimTarget >= maxSize)', () => {
    expect(
      () =>
        new BoundedIdempotencyCache({
          maxSize: 100,
          trimTarget: 100,
          windowMs: 60_000,
        })
    ).toThrow(/trimTarget must be < maxSize/);
  });
});
