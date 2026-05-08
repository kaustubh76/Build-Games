/**
 * Unit tests for decodeAgentTradeLog + getAgentTradesForAgent. Mirrors the
 * mirrorTrades / nativeTrades shape so the three helpers stay paired in
 * maintenance.
 */

import { describe, it, expect, vi } from 'vitest';
import { encodeEventTopics, encodeAbiParameters, parseAbiItem } from 'viem';
import type { PublicClient } from 'viem';
import { decodeAgentTradeLog, getAgentTradesForAgent } from '@/lib/eventQuery/agentTrades';
import { __resetEventQueryCache } from '@/lib/eventQuery';

const EVENT = parseAbiItem(
  'event AgentTradeExecuted(uint256 indexed agentId, bytes32 indexed mirrorKey, bool isYes, uint256 amount, uint256 sharesOut, bytes32 predictionHash)'
);

function makeLog(args: {
  agentId: bigint;
  mirrorKey: `0x${string}`;
  isYes: boolean;
  amount: bigint;
  sharesOut: bigint;
  predictionHash: `0x${string}`;
  blockNumber: bigint;
  txHash: `0x${string}`;
  logIndex: number;
}) {
  const topics = encodeEventTopics({
    abi: [EVENT],
    eventName: 'AgentTradeExecuted',
    args: { agentId: args.agentId, mirrorKey: args.mirrorKey },
  });
  const data = encodeAbiParameters(
    [
      { name: 'isYes', type: 'bool' },
      { name: 'amount', type: 'uint256' },
      { name: 'sharesOut', type: 'uint256' },
      { name: 'predictionHash', type: 'bytes32' },
    ],
    [args.isYes, args.amount, args.sharesOut, args.predictionHash]
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

const MK = ('0x' + 'aa'.repeat(32)) as `0x${string}`;
const PH = ('0x' + 'cd'.repeat(32)) as `0x${string}`;
const TX = ('0x' + 'dd'.repeat(32)) as `0x${string}`;
const MIRROR = ('0x' + 'cc'.repeat(20)) as `0x${string}`;

describe('decodeAgentTradeLog', () => {
  it('decodes a valid AgentTradeExecuted log into Prisma-shaped row', () => {
    const log = makeLog({
      agentId: 42n,
      mirrorKey: MK,
      isYes: true,
      amount: 1_000_000_000_000_000_000n,
      sharesOut: 500_000_000_000_000_000n,
      predictionHash: PH,
      blockNumber: 42_000n,
      txHash: TX,
      logIndex: 3,
    });
    const row = decodeAgentTradeLog(log as never);
    expect(row).not.toBeNull();
    expect(row!.agentId).toBe('42');
    expect(row!.mirrorKey).toBe(MK);
    expect(row!.isYes).toBe(true);
    expect(row!.amount).toBe('1000000000000000000');
    expect(row!.sharesReceived).toBe('500000000000000000');
    expect(row!.predictionHash).toBe(PH);
    expect(row!.blockNumber).toBe(42_000);
    expect(row!.txHash).toBe(TX);
    expect(row!.id).toBe(`${TX}:3`);
  });

  it('populates safe defaults for fields the event does not carry', () => {
    const log = makeLog({
      agentId: 1n,
      mirrorKey: MK,
      isYes: false,
      amount: 1n,
      sharesOut: 1n,
      predictionHash: PH,
      blockNumber: 1n,
      txHash: TX,
      logIndex: 0,
    });
    const row = decodeAgentTradeLog(log as never)!;
    expect(row.traderAddress).toBeNull();
    expect(row.predictionId).toBeNull();
    expect(row.usedVRF).toBe(false);
    expect(row.isVRFTrade).toBe(false);
    expect(row.completed).toBe(true);
    expect(row.completedAt).toBeNull();
    expect(row.resolved).toBe(false);
    expect(row.yesWon).toBeNull();
    expect(row.resolvedAt).toBeNull();
    expect(row.pnl).toBeNull();
    expect(row.price).toBe(0);
    expect(row.mirrorMarketId).toBeNull();
    expect(row.onChainMarketId).toBeNull();
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
    expect(decodeAgentTradeLog(log as never)).toBeNull();
  });

  it('preserves agentId as a string (matches Prisma column shape)', () => {
    const log = makeLog({
      agentId: 999_999_999_999n,
      mirrorKey: MK,
      isYes: true,
      amount: 1n,
      sharesOut: 1n,
      predictionHash: PH,
      blockNumber: 1n,
      txHash: TX,
      logIndex: 0,
    });
    const row = decodeAgentTradeLog(log as never)!;
    expect(row.agentId).toBe('999999999999');
    expect(typeof row.agentId).toBe('string');
  });
});

describe('getAgentTradesForAgent (block timestamp fill)', () => {
  it('replaces synthetic timestamps with real block timestamps from chain', async () => {
    __resetEventQueryCache();
    const log1 = makeLog({
      agentId: 1n,
      mirrorKey: MK,
      isYes: true,
      amount: 1n,
      sharesOut: 1n,
      predictionHash: PH,
      blockNumber: 100n,
      txHash: TX,
      logIndex: 0,
    });
    const log2 = makeLog({
      agentId: 1n,
      mirrorKey: MK,
      isYes: false,
      amount: 2n,
      sharesOut: 2n,
      predictionHash: PH,
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

    const rows = await getAgentTradesForAgent(mockClient, MIRROR, '1');

    expect(rows).toHaveLength(2);
    expect(rows[0].timestamp.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(rows[1].timestamp.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(getBlockMock).toHaveBeenCalledTimes(2);
  });

  it('dedupes blockNumber lookups (3 logs, 2 unique blocks → 2 getBlock calls)', async () => {
    __resetEventQueryCache();
    const logs = [
      makeLog({
        agentId: 1n, mirrorKey: MK, isYes: true, amount: 1n, sharesOut: 1n, predictionHash: PH,
        blockNumber: 500n, txHash: ('0x' + '11'.repeat(32)) as `0x${string}`, logIndex: 0,
      }),
      makeLog({
        agentId: 1n, mirrorKey: MK, isYes: false, amount: 2n, sharesOut: 2n, predictionHash: PH,
        blockNumber: 500n, txHash: ('0x' + '22'.repeat(32)) as `0x${string}`, logIndex: 0,
      }),
      makeLog({
        agentId: 1n, mirrorKey: MK, isYes: true, amount: 3n, sharesOut: 3n, predictionHash: PH,
        blockNumber: 600n, txHash: ('0x' + '33'.repeat(32)) as `0x${string}`, logIndex: 0,
      }),
    ];
    const getBlockMock = vi.fn(async () => ({ timestamp: 1700000000n }));
    const mockClient = {
      getBlockNumber: vi.fn().mockResolvedValue(700n),
      getLogs: vi.fn().mockResolvedValue(logs),
      getBlock: getBlockMock,
    } as unknown as PublicClient;

    await getAgentTradesForAgent(mockClient, MIRROR, '1');
    expect(getBlockMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the synthetic placeholder when getBlock fails (does not crash)', async () => {
    __resetEventQueryCache();
    const log = makeLog({
      agentId: 1n, mirrorKey: MK, isYes: true, amount: 1n, sharesOut: 1n, predictionHash: PH,
      blockNumber: 999n, txHash: TX, logIndex: 0,
    });
    const mockClient = {
      getBlockNumber: vi.fn().mockResolvedValue(1000n),
      getLogs: vi.fn().mockResolvedValue([log]),
      getBlock: vi.fn().mockRejectedValue(new Error('rpc down')),
    } as unknown as PublicClient;

    const rows = await getAgentTradesForAgent(mockClient, MIRROR, '1');
    expect(rows).toHaveLength(1);
    expect(rows[0].timestamp.getTime()).toBe(999 * 1000);
  });
});
