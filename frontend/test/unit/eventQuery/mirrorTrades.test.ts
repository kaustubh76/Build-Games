/**
 * Unit tests for decodeMirrorTradeLog. Verifies that the event-sourced rows
 * match the Prisma row shape closely enough that downstream consumers
 * (e.g. /api/portfolio/mirror) can swap reads without touching JSX.
 */

import { describe, it, expect, vi } from 'vitest';
import { encodeEventTopics, encodeAbiParameters, parseAbiItem } from 'viem';
import type { PublicClient } from 'viem';
import { decodeMirrorTradeLog, getMirrorTradesForTrader } from '@/lib/eventQuery/mirrorTrades';
import { __resetEventQueryCache } from '@/lib/eventQuery';

const EVENT = parseAbiItem(
  'event MirrorTradeExecuted(bytes32 indexed mirrorKey, address indexed trader, bool isYes, uint256 amount, uint256 tokensReceived)'
);

function makeLog(args: {
  mirrorKey: `0x${string}`;
  trader: `0x${string}`;
  isYes: boolean;
  amount: bigint;
  tokensReceived: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
  logIndex: number;
}) {
  const topics = encodeEventTopics({
    abi: [EVENT],
    eventName: 'MirrorTradeExecuted',
    args: { mirrorKey: args.mirrorKey, trader: args.trader },
  });
  const data = encodeAbiParameters(
    [
      { name: 'isYes', type: 'bool' },
      { name: 'amount', type: 'uint256' },
      { name: 'tokensReceived', type: 'uint256' },
    ],
    [args.isYes, args.amount, args.tokensReceived]
  );
  return {
    address: ('0x' + 'cc'.repeat(20)) as `0x${string}`,
    blockNumber: args.blockNumber,
    blockHash: ('0x' + '00'.repeat(32)) as `0x${string}`,
    transactionHash: args.txHash,
    transactionIndex: 0,
    logIndex: args.logIndex,
    removed: false,
    data,
    topics,
  };
}

const MK = ('0x' + 'aa'.repeat(32)) as `0x${string}`;
const TRADER = ('0x' + 'bb'.repeat(20)) as `0x${string}`;
const TX = ('0x' + 'dd'.repeat(32)) as `0x${string}`;

describe('decodeMirrorTradeLog', () => {
  it('decodes a valid MirrorTradeExecuted log into Prisma-shaped row', () => {
    const log = makeLog({
      mirrorKey: MK,
      trader: TRADER,
      isYes: true,
      amount: 1_000_000_000_000_000_000n,
      tokensReceived: 500_000_000_000_000_000n,
      blockNumber: 42_000n,
      txHash: TX,
      logIndex: 3,
    });
    const row = decodeMirrorTradeLog(log as never);
    expect(row).not.toBeNull();
    expect(row!.mirrorKey).toBe(MK);
    expect(row!.traderAddress).toBe(TRADER.toLowerCase());
    expect(row!.isYes).toBe(true);
    expect(row!.amount).toBe('1000000000000000000');
    expect(row!.sharesReceived).toBe('500000000000000000');
    expect(row!.blockNumber).toBe(42_000);
    expect(row!.txHash).toBe(TX);
    // ID is stable: ${txHash}:${logIndex}
    expect(row!.id).toBe(`${TX}:3`);
  });

  it('populates safe defaults for fields the event does not carry', () => {
    const log = makeLog({
      mirrorKey: MK,
      trader: TRADER,
      isYes: false,
      amount: 1n,
      tokensReceived: 1n,
      blockNumber: 1n,
      txHash: TX,
      logIndex: 0,
    });
    const row = decodeMirrorTradeLog(log as never)!;
    expect(row.agentId).toBeNull();
    expect(row.predictionId).toBeNull();
    expect(row.predictionHash).toBeNull();
    expect(row.usedVRF).toBe(false);
    expect(row.isVRFTrade).toBe(false);
    expect(row.completed).toBe(true);
    expect(row.completedAt).toBeNull();
    expect(row.resolved).toBe(false);
    expect(row.yesWon).toBeNull();
    expect(row.price).toBe(0);
  });

  it('returns null on a log with the wrong event signature', () => {
    const log = {
      address: ('0x' + 'cc'.repeat(20)) as `0x${string}`,
      blockNumber: 1n,
      blockHash: ('0x' + '00'.repeat(32)) as `0x${string}`,
      transactionHash: TX,
      transactionIndex: 0,
      logIndex: 0,
      removed: false,
      // Garbage data + topics → decode throws → helper returns null.
      data: '0x' as `0x${string}`,
      topics: [('0x' + '00'.repeat(32)) as `0x${string}`],
    };
    const row = decodeMirrorTradeLog(log as never);
    expect(row).toBeNull();
  });

  it('returns lowercase trader address (chain logs come back lowercase; helper preserves)', () => {
    const log = makeLog({
      mirrorKey: MK,
      trader: TRADER, // already lowercase test fixture
      isYes: true,
      amount: 1n,
      tokensReceived: 1n,
      blockNumber: 1n,
      txHash: TX,
      logIndex: 0,
    });
    const row = decodeMirrorTradeLog(log as never)!;
    // The contract returns lowercase by EIP-55 convention from indexed
    // address topics; the helper toLowerCases for safety regardless.
    expect(row.traderAddress).toBe(TRADER.toLowerCase());
    expect(row.traderAddress).toMatch(/^0x[0-9a-f]{40}$/);
  });
});

describe('getMirrorTradesForTrader (block timestamp fill)', () => {
  it('replaces synthetic timestamps with real block timestamps from chain', async () => {
    __resetEventQueryCache();
    const log1 = makeLog({
      mirrorKey: MK,
      trader: TRADER,
      isYes: true,
      amount: 1n,
      tokensReceived: 1n,
      blockNumber: 100n,
      txHash: TX,
      logIndex: 0,
    });
    const log2 = makeLog({
      mirrorKey: MK,
      trader: TRADER,
      isYes: false,
      amount: 2n,
      tokensReceived: 2n,
      blockNumber: 200n,
      txHash: ('0x' + 'ee'.repeat(32)) as `0x${string}`,
      logIndex: 1,
    });

    const getBlockMock = vi.fn(async ({ blockNumber }: { blockNumber: bigint }) => {
      // Real timestamps: block 100 = 2026-01-01, block 200 = 2026-02-01
      const ts = blockNumber === 100n ? 1767225600 : 1769904000;
      return { timestamp: BigInt(ts) };
    });

    const mockClient = {
      getBlockNumber: vi.fn().mockResolvedValue(300n),
      getLogs: vi.fn().mockResolvedValue([log1, log2]),
      getBlock: getBlockMock,
    } as unknown as PublicClient;

    const rows = await getMirrorTradesForTrader(
      mockClient,
      ('0x' + 'cc'.repeat(20)) as `0x${string}`,
      TRADER
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].timestamp.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(rows[1].timestamp.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    // Should have called getBlock once per unique blockNumber (2), not per log.
    expect(getBlockMock).toHaveBeenCalledTimes(2);
  });

  it('dedupes blockNumber lookups (3 logs, 2 unique blocks → 2 getBlock calls)', async () => {
    __resetEventQueryCache();
    const logs = [
      makeLog({
        mirrorKey: MK, trader: TRADER, isYes: true, amount: 1n, tokensReceived: 1n,
        blockNumber: 500n, txHash: ('0x' + '11'.repeat(32)) as `0x${string}`, logIndex: 0,
      }),
      makeLog({
        mirrorKey: MK, trader: TRADER, isYes: false, amount: 2n, tokensReceived: 2n,
        blockNumber: 500n, txHash: ('0x' + '22'.repeat(32)) as `0x${string}`, logIndex: 0,
      }),
      makeLog({
        mirrorKey: MK, trader: TRADER, isYes: true, amount: 3n, tokensReceived: 3n,
        blockNumber: 600n, txHash: ('0x' + '33'.repeat(32)) as `0x${string}`, logIndex: 0,
      }),
    ];
    const getBlockMock = vi.fn(async () => ({ timestamp: 1700000000n }));
    const mockClient = {
      getBlockNumber: vi.fn().mockResolvedValue(700n),
      getLogs: vi.fn().mockResolvedValue(logs),
      getBlock: getBlockMock,
    } as unknown as PublicClient;

    await getMirrorTradesForTrader(
      mockClient,
      ('0x' + 'cc'.repeat(20)) as `0x${string}`,
      TRADER
    );
    expect(getBlockMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the synthetic placeholder when getBlock fails (does not crash)', async () => {
    __resetEventQueryCache();
    const log = makeLog({
      mirrorKey: MK, trader: TRADER, isYes: true, amount: 1n, tokensReceived: 1n,
      blockNumber: 999n, txHash: TX, logIndex: 0,
    });
    const mockClient = {
      getBlockNumber: vi.fn().mockResolvedValue(1000n),
      getLogs: vi.fn().mockResolvedValue([log]),
      getBlock: vi.fn().mockRejectedValue(new Error('rpc down')),
    } as unknown as PublicClient;

    const rows = await getMirrorTradesForTrader(
      mockClient,
      ('0x' + 'cc'.repeat(20)) as `0x${string}`,
      TRADER
    );
    expect(rows).toHaveLength(1);
    // Falls back to the synthetic blockNumber * 1000 placeholder.
    expect(rows[0].timestamp.getTime()).toBe(999 * 1000);
  });
});
