/**
 * Event-sourced read for native PredictionMarketAMM trades. Reads
 * `TokensPurchased` logs from the on-chain AMM and shapes them to match the
 * subset of `Prisma.MirrorTrade` columns the `/api/portfolio/native` route
 * actually consumes — see `app/api/portfolio/native/route.ts:104-119`.
 *
 * The native portfolio route filters Prisma rows by `mirrorKey: ''` to
 * isolate native (non-mirror) trades. The on-chain source of truth for
 * native trades is the `TokensPurchased` event on `PredictionMarketAMM` —
 * the indexer never writes these into the `mirrorTrade` table, which is
 * why the legacy Prisma read silently returned zero rows in practice. The
 * event-sourced switch is the corrected path; the Prisma branch is kept
 * only as a safety net during rollout.
 *
 * Fields the event doesn't carry (see header of mirrorTrades.ts for the
 * same pattern):
 *   - `mirrorKey` — always `''` (this is a NATIVE trade)
 *   - `agentId`, `predictionId`, `predictionHash`, `usedVRF`, `isVRFTrade`,
 *     `resolved`, `yesWon`, `completedAt`, `price` — null/false/0 defaults
 *   - `timestamp` — block timestamp (filled in a deduped batch below)
 */

import type { PublicClient, Log } from 'viem';
import { parseAbiItem, decodeEventLog } from 'viem';
import { getLogsForAddressCached } from './index';

const TOKENS_PURCHASED = parseAbiItem(
  'event TokensPurchased(uint256 indexed marketId, address indexed buyer, bool isYes, uint256 collateralAmount, uint256 tokensReceived)'
);

const TOKENS_PURCHASED_ABI = [TOKENS_PURCHASED] as const;

/**
 * Shape-compatible subset of `Prisma.MirrorTrade` for the native flow.
 * `mirrorKey` is always empty string (matches the legacy filter).
 */
export interface NativeTradeFromEvent {
  id: string;
  mirrorKey: string;
  mirrorMarketId: string | null;
  onChainMarketId: string;
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
  timestamp: Date;
}

/**
 * Fetch a trader's native trades from on-chain `TokensPurchased` events.
 * Resolves real block timestamps via a deduped batch (one getBlock per
 * unique blockNumber) so the portfolio UI can show "5 min ago" correctly.
 */
export async function getNativeTradesForTrader(
  client: PublicClient,
  predictionMarketAddress: `0x${string}`,
  traderAddress: `0x${string}`
): Promise<NativeTradeFromEvent[]> {
  const logs = await getLogsForAddressCached(
    client,
    predictionMarketAddress,
    TOKENS_PURCHASED,
    traderAddress.toLowerCase(),
    { buyer: traderAddress }
  );

  const rows = logs
    .map(decodeNativeTradeLog)
    .filter((row): row is NativeTradeFromEvent => row !== null);

  await fillBlockTimestamps(client, rows);

  return rows;
}

async function fillBlockTimestamps(
  client: PublicClient,
  rows: NativeTradeFromEvent[]
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
 * Decode a single TokensPurchased log into a Prisma-shaped row. Returns
 * null if the log can't be decoded.
 */
export function decodeNativeTradeLog(log: Log): NativeTradeFromEvent | null {
  try {
    const decoded = decodeEventLog({
      abi: TOKENS_PURCHASED_ABI,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== 'TokensPurchased') return null;
    const args = decoded.args as {
      marketId: bigint;
      buyer: `0x${string}`;
      isYes: boolean;
      collateralAmount: bigint;
      tokensReceived: bigint;
    };
    const blockNumber = Number(log.blockNumber ?? 0n);
    const txHash = log.transactionHash ?? '';
    const logIndex = log.logIndex ?? 0;
    return {
      id: `${txHash}:${logIndex}`,
      mirrorKey: '',
      mirrorMarketId: null,
      onChainMarketId: args.marketId.toString(),
      traderAddress: args.buyer.toLowerCase(),
      agentId: null,
      isYes: args.isYes,
      amount: args.collateralAmount.toString(),
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
      timestamp: new Date(blockNumber * 1000),
    };
  } catch {
    return null;
  }
}
