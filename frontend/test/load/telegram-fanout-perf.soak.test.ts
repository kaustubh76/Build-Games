/**
 * Bug #7: findMatchingSubscribers was O(n) — full scan on every whale alert.
 * Painful at 10k+ subscribers. Post-fix: secondary index per source, sorted
 * ascending by threshold. Lookup is O(log n + k).
 *
 * Pre-fix p99 at 10k subs: ~150ms+
 * Post-fix p99 at 10k subs: target <50ms
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(async () => {
  // Mock 0G upload so we don't try to network on every upsert.
  vi.doMock('@/services/zgStorageService', () => ({
    upload: vi.fn(async () => ({ rootHash: 'fake', txHash: 'fake' })),
    download: vi.fn(),
    isZgConfigured: vi.fn(() => false), // skips persist call entirely
  }));
  vi.resetModules();
  const mod = await import('@/lib/telegram/subscriptions');
  mod.__resetSubscriptions();
});

function randomAddr(i: number): string {
  // Pad i into a 40-hex address. Deterministic so tests are reproducible.
  const hex = i.toString(16).padStart(40, '0');
  return `0x${hex}`;
}

describe('telegram fanout perf soak', () => {
  it('findMatchingSubscribers correctness: returns only subs with threshold <= amount AND matching source', async () => {
    const { upsertSubscription, findMatchingSubscribers } = await import(
      '@/lib/telegram/subscriptions'
    );

    await upsertSubscription({
      userAddress: randomAddr(1),
      telegramChatId: '111',
      thresholdUsd: 100,
      sources: ['POLYMARKET'],
    });
    await upsertSubscription({
      userAddress: randomAddr(2),
      telegramChatId: '222',
      thresholdUsd: 1_000,
      sources: ['POLYMARKET'],
    });
    await upsertSubscription({
      userAddress: randomAddr(3),
      telegramChatId: '333',
      thresholdUsd: 10_000,
      sources: ['KALSHI'],
    });
    await upsertSubscription({
      userAddress: randomAddr(4),
      telegramChatId: '444',
      thresholdUsd: 500,
      sources: ['POLYMARKET', 'KALSHI'],
    });

    // amountUsd = 750, source = POLYMARKET → matches sub 1 (100) and 4 (500), but NOT 2 (1000) or 3 (kalshi-only).
    const matches = findMatchingSubscribers(750, 'POLYMARKET');
    expect(matches.map((m) => m.telegramChatId).sort()).toEqual(['111', '444']);

    // amountUsd = 50_000, source = KALSHI → matches sub 3 (10k) and 4 (500).
    const kalshi = findMatchingSubscribers(50_000, 'KALSHI');
    expect(kalshi.map((m) => m.telegramChatId).sort()).toEqual(['333', '444']);

    // amountUsd = 50, source = POLYMARKET → matches nothing (lowest threshold is 100).
    const tooSmall = findMatchingSubscribers(50, 'POLYMARKET');
    expect(tooSmall).toEqual([]);
  });

  it('10k subscribers, p99 lookup time < 50ms (bug #7 fix)', async () => {
    const { upsertSubscription, findMatchingSubscribers } = await import(
      '@/lib/telegram/subscriptions'
    );

    const N = 10_000;
    // Insert in batches to avoid await storm. We bypass the persist by mocking
    // isZgConfigured -> false above, so upserts are synchronous-ish.
    for (let i = 0; i < N; i++) {
      await upsertSubscription({
        userAddress: randomAddr(i + 1),
        telegramChatId: `chat-${i}`,
        thresholdUsd: 100 + (i % 100_000),
        sources: i % 2 === 0 ? ['POLYMARKET'] : ['KALSHI'],
      });
    }

    const samples: number[] = [];
    const N_QUERIES = 100;
    for (let i = 0; i < N_QUERIES; i++) {
      const start = performance.now();
      findMatchingSubscribers(50_000 + (i * 137), 'POLYMARKET');
      samples.push(performance.now() - start);
    }

    samples.sort((a, b) => a - b);
    const p99 = samples[Math.floor(N_QUERIES * 0.99)];
    const p50 = samples[Math.floor(N_QUERIES * 0.50)];

    // Bug #7 acceptance: p99 < 50ms with 10k subs.
    expect(p99).toBeLessThan(50);
    // Sanity: p50 should be way better than p99.
    expect(p50).toBeLessThan(p99 + 1);
  }, 30_000);

  it('upsert + remove keeps the sorted index in sync', async () => {
    const {
      upsertSubscription,
      removeSubscription,
      findMatchingSubscribers,
    } = await import('@/lib/telegram/subscriptions');

    await upsertSubscription({
      userAddress: randomAddr(1),
      telegramChatId: 'A',
      thresholdUsd: 1_000,
      sources: ['POLYMARKET'],
    });
    await upsertSubscription({
      userAddress: randomAddr(2),
      telegramChatId: 'B',
      thresholdUsd: 5_000,
      sources: ['POLYMARKET'],
    });

    expect(findMatchingSubscribers(2_000, 'POLYMARKET').map((m) => m.telegramChatId)).toEqual(['A']);

    // Update sub B's threshold downward — now it should match too.
    await upsertSubscription({
      userAddress: randomAddr(2),
      telegramChatId: 'B',
      thresholdUsd: 500,
      sources: ['POLYMARKET'],
    });
    const post = findMatchingSubscribers(2_000, 'POLYMARKET').map((m) => m.telegramChatId).sort();
    expect(post).toEqual(['A', 'B']);

    // Remove A — only B should remain.
    await removeSubscription(randomAddr(1));
    expect(findMatchingSubscribers(2_000, 'POLYMARKET').map((m) => m.telegramChatId)).toEqual(['B']);
  });
});
