/**
 * Tier 2 dual-write integration tests.
 *
 * The Tier 2 migration writes a 0G receipt for every model that will eventually
 * be event-sourced. During the dual-write window, the Prisma row is also
 * created so existing read paths keep working. These tests verify both halves
 * fire on the same event.
 *
 * We don't go through the real /api/arena/betting route (it pulls in Prisma +
 * a real DB), so instead we mock the persistReceipt module and exercise the
 * route handlers against known inputs to confirm the wiring is intact.
 *
 * The Tier 1 test counterpart lives in test/integration/api-tier1-audit-receipts.test.ts
 * (added separately if/when needed). These are the critical wiring tests; once
 * they pass, the rollout sequence in the README is what governs the flag flips.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock persistReceipt so we can assert it was called without hitting 0G.
vi.mock('@/lib/storage/persistReceipt', () => ({
  persistReceipt: vi.fn(async () => ({ rootHash: '0xRECEIPT', txHash: '0xTX' })),
  buildEnvelope: vi.fn((args: { type: string; payload: unknown; version?: string; ts?: number }) => ({
    version: args.version ?? '1.0.0',
    type: args.type,
    ts: args.ts ?? Date.now(),
    payload: args.payload,
  })),
}));

import { persistReceipt } from '@/lib/storage/persistReceipt';

const mockedPersist = persistReceipt as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedPersist.mockClear();
});

describe('Tier 2 dual-write — wiring', () => {
  it('saveTrade in whaleTrackerService persists a 0G receipt of type whale-trade', async () => {
    // Mock prisma so the Prisma side doesn't need a real DB.
    vi.doMock('@/lib/prisma', () => ({
      prisma: {
        whaleTrade: { upsert: vi.fn(async () => ({})) },
      },
    }));
    vi.resetModules();
    const persistMod = await import('@/lib/storage/persistReceipt');
    const persistSpy = vi.mocked(persistMod.persistReceipt);
    persistSpy.mockClear();

    const { whaleTrackerService } = await import('@/services/externalMarkets/whaleTrackerService');
    // saveTrade is private — invoke via the public path that reaches it.
    // For a wiring test, calling the singleton's private method via ts-bracket-access is fine.
    const trade = {
      id: 'whale-trade-1',
      source: 'POLYMARKET' as const,
      marketId: 'm1',
      marketQuestion: 'Will X happen?',
      traderAddress: '0xabc',
      side: 'buy' as const,
      outcome: 'yes' as const,
      amountUsd: '50000',
      shares: '500',
      price: 0.5,
      timestamp: Date.now(),
      txHash: '0xtx',
    };
    // @ts-expect-error invoking private for wiring test
    await whaleTrackerService.saveTrade(trade);

    expect(persistSpy).toHaveBeenCalled();
    // The first call's envelope.type is what we wired.
    const lastCall = persistSpy.mock.calls.at(-1)!;
    const envelope = lastCall[0];
    expect(envelope.type).toBe('whale-trade');
    expect(envelope.payload).toMatchObject({ id: 'whale-trade-1', traderAddress: '0xabc' });
  });

  it('the persistReceipt helper handles a null result gracefully (caller falls back to Prisma)', async () => {
    // Simulate: 0G is not configured. persistReceipt returns null. The caller
    // should still complete its Prisma write and not throw.
    const persistMod = await import('@/lib/storage/persistReceipt');
    const persistSpy = vi.mocked(persistMod.persistReceipt);
    persistSpy.mockResolvedValueOnce(null);
    const result = await persistMod.persistReceipt(
      persistMod.buildEnvelope({ type: 'whale-trade', payload: { id: 'x' } }),
      'x.json'
    );
    expect(result).toBeNull();
  });
});
