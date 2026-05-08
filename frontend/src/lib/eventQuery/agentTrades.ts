/**
 * Event-sourced read for `AgentTradeExecuted` logs from the
 * externalMarketMirror contract. Used by `/api/agents/[id]/external-trades`
 * to list an agent's external-market trade history.
 *
 * Why a separate helper from `mirrorTrades.ts`: `MirrorTradeExecuted` is
 * indexed by `(mirrorKey, trader)` and doesn't carry `agentId`. Agent-flow
 * trades emit a parallel `AgentTradeExecuted(agentId, mirrorKey, isYes,
 * amount, sharesOut, predictionHash)` event with `agentId` indexed — that's
 * the right source for an agent-filtered view.
 *
 * Shape: subset of `Prisma.MirrorTrade` matching the fields the route
 * formatter at `app/api/agents/[id]/external-trades/route.ts:80-96` reads
 * (id, onChainMarketId, mirrorKey, isYes, amount, sharesReceived, pnl,
 * txHash, timestamp, resolvedAt). Non-event fields default to safe values
 * documented in the same pattern as `mirrorTrades.ts` / `nativeTrades.ts`.
 */

import type { PublicClient, Log } from 'viem';
import { parseAbiItem, decodeEventLog } from 'viem';
import { getLogsForAddressCached } from './index';

const AGENT_TRADE_EXECUTED = parseAbiItem(
  'event AgentTradeExecuted(uint256 indexed agentId, bytes32 indexed mirrorKey, bool isYes, uint256 amount, uint256 sharesOut, bytes32 predictionHash)'
);

const AGENT_TRADE_ABI = [AGENT_TRADE_EXECUTED] as const;

/**
 * Shape-compatible subset of `Prisma.MirrorTrade` for the agent flow.
 * `agentId` is the on-chain uint256 stringified to match the Prisma column.
 */
export interface AgentTradeFromEvent {
  id: string;
  mirrorKey: string;
  mirrorMarketId: string | null;
  onChainMarketId: string | null;
  traderAddress: string | null;
  agentId: string;
  isYes: boolean;
  amount: string;
  sharesReceived: string;
  pnl: string | null;
  price: number;
  txHash: string;
  blockNumber: number;
  usedVRF: boolean;
  isVRFTrade: boolean;
  completed: boolean;
  completedAt: Date | null;
  predictionId: string | null;
  predictionHash: string;
  resolved: boolean;
  yesWon: boolean | null;
  resolvedAt: Date | null;
  timestamp: Date;
}

/**
 * Fetch an agent's external-market trades from on-chain events. Uses the
 * cached paginated getLogs helper. Resolves real block timestamps via a
 * deduped batch (one getBlock per unique blockNumber).
 */
export async function getAgentTradesForAgent(
  client: PublicClient,
  externalMarketMirrorAddress: `0x${string}`,
  agentId: string
): Promise<AgentTradeFromEvent[]> {
  const logs = await getLogsForAddressCached(
    client,
    externalMarketMirrorAddress,
    AGENT_TRADE_EXECUTED,
    agentId,
    { agentId: BigInt(agentId) }
  );

  const rows = logs
    .map(decodeAgentTradeLog)
    .filter((row): row is AgentTradeFromEvent => row !== null);

  await fillBlockTimestamps(client, rows);

  return rows;
}

async function fillBlockTimestamps(
  client: PublicClient,
  rows: AgentTradeFromEvent[]
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
 * Decode a single AgentTradeExecuted log into a Prisma-shaped row. Returns
 * null if the log can't be decoded.
 */
export function decodeAgentTradeLog(log: Log): AgentTradeFromEvent | null {
  try {
    const decoded = decodeEventLog({
      abi: AGENT_TRADE_ABI,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== 'AgentTradeExecuted') return null;
    const args = decoded.args as {
      agentId: bigint;
      mirrorKey: `0x${string}`;
      isYes: boolean;
      amount: bigint;
      sharesOut: bigint;
      predictionHash: `0x${string}`;
    };
    const blockNumber = Number(log.blockNumber ?? 0n);
    const txHash = log.transactionHash ?? '';
    const logIndex = log.logIndex ?? 0;
    return {
      id: `${txHash}:${logIndex}`,
      mirrorKey: args.mirrorKey,
      mirrorMarketId: null,
      onChainMarketId: null,
      traderAddress: null,
      agentId: args.agentId.toString(),
      isYes: args.isYes,
      amount: args.amount.toString(),
      sharesReceived: args.sharesOut.toString(),
      pnl: null,
      price: 0,
      txHash,
      blockNumber,
      usedVRF: false,
      isVRFTrade: false,
      completed: true,
      completedAt: null,
      predictionId: null,
      predictionHash: args.predictionHash,
      resolved: false,
      yesWon: null,
      resolvedAt: null,
      timestamp: new Date(blockNumber * 1000),
    };
  } catch {
    return null;
  }
}
