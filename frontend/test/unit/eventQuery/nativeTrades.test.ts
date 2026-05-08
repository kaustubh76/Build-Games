/**
 * Unit tests for decodeNativeTradeLog + getNativeTradesForTrader. Mirrors
 * the mirrorTrades test shape so the two helpers stay paired in maintenance.
 */

import { describe, it, expect, vi } from 'vitest';
import { encodeEventTopics, encodeAbiParameters, parseAbiItem } from 'viem';
import type { PublicClient } from 'viem';
import { decodeNativeTradeLog, getNativeTradesForTrader } from '@/lib/eventQuery/nativeTrades';
import { __resetEventQueryCache } from '@/lib/eventQuery';

const EVENT = parseAbiItem(
  'event TokensPurchased(uint256 indexed marketId, address indexed buyer, bool isYes, uint256 collateralAmount, uint256 tokensReceived)'
);

function makeLog(args: {
  marketId: bigint;
  buyer: `0x${string}`;
  isYes: boolean;
  collateralAmount: bigint;
  tokensReceived: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
  logIndex: number;
}) {
  const topics = encodeEventTopics({
    abi: [EVENT],
    eventName: 'TokensPurchased',
    args: { marketId: args.marketId, buyer: args.buyer },
  });
  const data = encodeAbiParameters(
    [
      { name: 'isYes', type: 'bool' },
      { name: 'collateralAmount', type: 'uint256' },
      { name: 'tokensReceived', type: 'uint256' },
    ],
    [args.isYes, args.collateralAmount, args.tokensReceived]
  );
  return {
    address: ('0x' + 'aa'.repeat(20)) as `0x${string}`,
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

const TRADER = ('0x' + 'bb'.repeat(20)) as `0x${string}`;
const TX = ('0x' + 'dd'.repeat(32)) as `0x${string}`;
const AMM = ('0x' + 'cc'.repeat(20)) as `0x${string}`;

describe('decodeNativeTradeLog', () => {
  it('decodes a valid TokensPurchased log into Prisma-shaped row', () => {
    const log = makeLog({
      marketId: 7n,
      buyer: TRADER,
      isYes: true,
      collateralAmount: 1_000_000_000_000_000_000n,
      tokensReceived: 500_000_000_000_000_000n,
      blockNumber: 42_000n,
      txHash: TX,
      logIndex: 3,
    });
    const row = decodeNativeTradeLog(log as never);
    expect(row).not.toBeNull();
    expect(row!.onChainMarketId).toBe('7');
    expect(row!.traderAddress).toBe(TRADER.toLowerCase());
    expect(row!.isYes).toBe(true);
    expect(row!.amount).toBe('1000000000000000000');
    expect(row!.sharesReceived).toBe('500000000000000000');
    expect(row!.blockNumber).toBe(42_000);
    expect(row!.txHash).toBe(TX);
    expect(row!.id).toBe(`${TX}:3`);
    // Native trades always carry empty mirrorKey so the legacy filter applies.
    expect(row!.mirrorKey).toBe('');
  });

  it('populates safe defaults for fields the event does not carry', () => {
    const log = makeLog({
      marketId: 1n,
      buyer: TRADER,
      isYes: false,
      collateralAmount: 1n,
      tokensReceived: 1n,
      blockNumber: 1n,
      txHash: TX,
      logIndex: 0,
    });
    const row = decodeNativeTradeLog(log as never)!;
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
    expect(row.mirrorMarketId).toBeNull();
  });

  it('returns null on a log with the wrong event signature', () => {
    const log = {
      address: ('0x' + 'aa'.repeat(20)) as `0x${string}`,
      blockNumber: 1n,
      blockHash: ('0x' + '00'.repeat(32)) as `0x${string}`,
      transactionHash: TX,
      transactionIndex: 0,
      logIndex: 0,
      removed: false,
      data: '0x' as `0x${string}`,
      topics: [('0x' + '00'.repeat(32)) as `0x${string}`],
    };
    expect(decodeNativeTradeLog(log as never)).toBeNull();
  });

  it('lowercases the trader address (matches Prisma where-clause shape)', () => {
    const log = makeLog({
      marketId: 1n,
      buyer: TRADER,
      isYes: true,
      collateralAmount: 1n,
      tokensReceived: 1n,
      blockNumber: 1n,
      txHash: TX,
      logIndex: 0,
    });
    const row = decodeNativeTradeLog(log as never)!;
    expect(row.traderAddress).toBe(TRADER.toLowerCase());
    expect(row.traderAddress).toMatch(/^0x[0-9a-f]{40}$/);
  });
});

describe('getNativeTradesForTrader (block timestamp fill)', () => {
  it('replaces synthetic timestamps with real block timestamps from chain', async () => {
    __resetEventQueryCache();
    const log1 = makeLog({
      marketId: 1n,
      buyer: TRADER,
      isYes: true,
      collateralAmount: 1n,
      tokensReceived: 1n,
      blockNumber: 100n,
      txHash: TX,
      logIndex: 0,
    });
    const log2 = makeLog({
      marketId: 2n,
      buyer: TRADER,
      isYes: false,
      collateralAmount: 2n,
      tokensReceived: 2n,
      blockNumber: 200n,
      txHash: ('0x' + 'ee'.repeat(32)) as `0x${string}`,
      logIndex: 1,
    });

    const getBlockMock = vi.fn(async ({ blockNumber }: { blockNumber: bigint }) => {
      const ts = blockNumber === 100n ? 1767225600 : 1769904000;
      return { timestamp: BigInt(ts) };
    });

    const mockClient = {
      getBlockNumber: vi.fn().mockResolvedValue(300n),
      getLogs: vi.fn().mockResolvedValue([log1, log2]),
      getBlock: getBlockMock,
    } as unknown as PublicClient;

    const rows = await getNativeTradesForTrader(mockClient, AMM, TRADER);

    expect(rows).toHaveLength(2);
    expect(rows[0].timestamp.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(rows[1].timestamp.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(getBlockMock).toHaveBeenCalledTimes(2);
  });

  it('dedupes blockNumber lookups (3 logs, 2 unique blocks → 2 getBlock calls)', async () => {
    __resetEventQueryCache();
    const logs = [
      makeLog({
        marketId: 1n, buyer: TRADER, isYes: true, collateralAmount: 1n, tokensReceived: 1n,
        blockNumber: 500n, txHash: ('0x' + '11'.repeat(32)) as `0x${string}`, logIndex: 0,
      }),
      makeLog({
        marketId: 2n, buyer: TRADER, isYes: false, collateralAmount: 2n, tokensReceived: 2n,
        blockNumber: 500n, txHash: ('0x' + '22'.repeat(32)) as `0x${string}`, logIndex: 0,
      }),
      makeLog({
        marketId: 3n, buyer: TRADER, isYes: true, collateralAmount: 3n, tokensReceived: 3n,
        blockNumber: 600n, txHash: ('0x' + '33'.repeat(32)) as `0x${string}`, logIndex: 0,
      }),
    ];
    const getBlockMock = vi.fn(async () => ({ timestamp: 1700000000n }));
    const mockClient = {
      getBlockNumber: vi.fn().mockResolvedValue(700n),
      getLogs: vi.fn().mockResolvedValue(logs),
      getBlock: getBlockMock,
    } as unknown as PublicClient;

    await getNativeTradesForTrader(mockClient, AMM, TRADER);
    expect(getBlockMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the synthetic placeholder when getBlock fails (does not crash)', async () => {
    __resetEventQueryCache();
    const log = makeLog({
      marketId: 1n, buyer: TRADER, isYes: true, collateralAmount: 1n, tokensReceived: 1n,
      blockNumber: 999n, txHash: TX, logIndex: 0,
    });
    const mockClient = {
      getBlockNumber: vi.fn().mockResolvedValue(1000n),
      getLogs: vi.fn().mockResolvedValue([log]),
      getBlock: vi.fn().mockRejectedValue(new Error('rpc down')),
    } as unknown as PublicClient;

    const rows = await getNativeTradesForTrader(mockClient, AMM, TRADER);
    expect(rows).toHaveLength(1);
    expect(rows[0].timestamp.getTime()).toBe(999 * 1000);
  });
});
