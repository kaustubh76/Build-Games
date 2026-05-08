/**
 * Event-sourced read for MirrorTrade rows. Reads `MirrorTradeExecuted` logs
 * from the externalMarketMirror contract and shapes them into a
 * Prisma-compatible array so existing callers don't need refactoring.
 *
 * The shape is a SUBSET of the Prisma `MirrorTrade` row — the on-chain event
 * doesn't carry every column. Fields that are NOT in the event:
 *   - `id` — synthesized as `${txHash}:${logIndex}` (stable + unique)
 *   - `agentId` — null (not in MirrorTradeExecuted; agent flow uses a
 *      separate event handler, which we don't switch here)
 *   - `mirrorMarketId`, `onChainMarketId`, `predictionId`, `predictionHash`,
 *      `usedVRF`, `isVRFTrade`, `completed`, `completedAt`, `resolved`,
 *      `yesWon` — all set to defaults that match the event semantics.
 *   - `price` — 0 (the event doesn't expose it; downstream computes price
 *      from `lastSyncPrice` separately).
 *   - `timestamp` — the block timestamp (fetched separately if needed).
 *      We use a synthetic Date based on logIndex order until we add a
 *      block-timestamp lookup pass — acceptable because the consumer
 *      orderBy timestamp desc is dominated by blockNumber within a block.
 *
 * The plan's Prisma fallback covers the gaps: if the helper returns rows
 * that don't have a field a downstream consumer needs, the consumer
 * checks for it and falls back to the Prisma path.
 */

import type { PublicClient, Log } from 'viem';
import { parseAbiItem, decodeEventLog } from 'viem';
import { getLogsForAddressCached, getLogsPaginated } from './index';

const MIRROR_TRADE_EXECUTED = parseAbiItem(
  'event MirrorTradeExecuted(bytes32 indexed mirrorKey, address indexed trader, bool isYes, uint256 amount, uint256 tokensReceived)'
);

const MIRROR_TRADE_ABI = [MIRROR_TRADE_EXECUTED] as const;

/**
 * Shape-compatible with `Prisma.MirrorTrade`. Fields the event doesn't carry
 * are populated with safe defaults — see file header for the gap list.
 */
export interface MirrorTradeFromEvent {
  id: string;
  mirrorKey: string;
  mirrorMarketId: string | null;
  onChainMarketId: string | null;
  traderAddress: string;
  agentId: string | null;
  isYes: boolean;
  amount: string;
  sharesReceived: string;
  price: number;
  txHash: string;
  blockNumber: number;
  usedVRF: boolean;
  isVRFTrade: boolean;
  completed: boolean;
  completedAt: Date | null;
  predictionId: string | null;
  predictionHash: string | null;
  resolved: boolean;
  yesWon: boolean | null;
  /** Best-effort timestamp; see file header for caveat. */
  timestamp: Date;
}

/**
 * Fetch a trader's mirror trades from on-chain events. Uses the cached
 * paginated getLogs helper from `lib/eventQuery`. Resolves real block
 * timestamps via a deduped batch (one getBlock per unique blockNumber)
 * so downstream UI can display "5 min ago" correctly.
 */
export async function getMirrorTradesForTrader(
  client: PublicClient,
  externalMarketMirrorAddress: `0x${string}`,
  traderAddress: `0x${string}`
): Promise<MirrorTradeFromEvent[]> {
  const logs = await getLogsForAddressCached(
    client,
    externalMarketMirrorAddress,
    MIRROR_TRADE_EXECUTED,
    traderAddress.toLowerCase(),
    { trader: traderAddress }
  );

  const rows = logs
    .map(decodeMirrorTradeLog)
    .filter((row): row is MirrorTradeFromEvent => row !== null);

  // Resolve real block timestamps in a deduped batch. 100 trades across
  // 30 unique blocks → 30 getBlock calls instead of 100.
  await fillBlockTimestamps(client, rows);

  return rows;
}

/**
 * Fetch ALL `MirrorTradeExecuted` logs on the contract within the helper's
 * default lookback window. Used by status/metrics endpoints that need
 * counts + recent trades rather than per-trader filtering. NOT cached
 * (status/metrics callers want fresh numbers).
 */
export async function getAllMirrorTrades(
  client: PublicClient,
  externalMarketMirrorAddress: `0x${string}`
): Promise<MirrorTradeFromEvent[]> {
  const logs = await getLogsPaginated({
    client,
    address: externalMarketMirrorAddress,
    event: MIRROR_TRADE_EXECUTED,
  });

  const rows = logs
    .map(decodeMirrorTradeLog)
    .filter((row): row is MirrorTradeFromEvent => row !== null);

  await fillBlockTimestamps(client, rows);

  return rows;
}

/**
 * Replace the synthetic `new Date(blockNumber * 1000)` placeholder with the
 * actual block timestamp. Mutates the rows in place. Errors per-block are
 * swallowed — the row keeps its placeholder, downstream UI shows "earlier"
 * rather than crashing.
 */
async function fillBlockTimestamps(
  client: PublicClient,
  rows: MirrorTradeFromEvent[]
): Promise<void> {
  if (rows.length === 0) return;
  const uniqueBlocks = Array.from(new Set(rows.map((r) => r.blockNumber)));
  const timestamps = new Map<number, number>();
  await Promise.all(
    uniqueBlocks.map(async (blockNumber) => {
      try {
        const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
        timestamps.set(blockNumber, Number(block.timestamp));
      } catch {
        // Leave the placeholder; row will display the synthetic date.
      }
    })
  );
  for (const row of rows) {
    const ts = timestamps.get(row.blockNumber);
    if (ts !== undefined) {
      row.timestamp = new Date(ts * 1000);
    }
  }
}

/**
 * Decode a single MirrorTradeExecuted log into a Prisma-shaped row. Returns
 * null if the log can't be decoded (caller filters those out).
 */
export function decodeMirrorTradeLog(log: Log): MirrorTradeFromEvent | null {
  try {
    const decoded = decodeEventLog({
      abi: MIRROR_TRADE_ABI,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== 'MirrorTradeExecuted') return null;
    const args = decoded.args as {
      mirrorKey: `0x${string}`;
      trader: `0x${string}`;
      isYes: boolean;
      amount: bigint;
      tokensReceived: bigint;
    };
    const blockNumber = Number(log.blockNumber ?? 0n);
    const txHash = log.transactionHash ?? '';
    const logIndex = log.logIndex ?? 0;
    return {
      id: `${txHash}:${logIndex}`,
      mirrorKey: args.mirrorKey,
      mirrorMarketId: null,
      onChainMarketId: null,
      traderAddress: args.trader.toLowerCase(),
      agentId: null,
      isYes: args.isYes,
      amount: args.amount.toString(),
      sharesReceived: args.tokensReceived.toString(),
      price: 0,
      txHash,
      blockNumber,
      usedVRF: false,
      isVRFTrade: false,
      completed: true,
      completedAt: null,
      predictionId: null,
      predictionHash: null,
      resolved: false,
      yesWon: null,
      // Block timestamp would require a follow-up RPC call per unique block.
      // Use blockNumber as a coarse proxy for sort order — consumers that
      // need a real timestamp can layer it on later.
      timestamp: new Date(blockNumber * 1000),
    };
  } catch {
    return null;
  }
}
