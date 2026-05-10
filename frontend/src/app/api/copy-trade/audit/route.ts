import { NextRequest, NextResponse } from 'next/server';
import { parseAbiItem } from 'viem';
import { AVALANCHE_CONTRACTS } from '@/lib/apiConfig';
import { getResilientPublicClient } from '@/lib/viemClient';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

/**
 * GET /api/copy-trade/audit?address=0x...
 *
 * Returns the user's mirror-trade audit trail by scanning on-chain events
 * `VRFCopyTradeRequested(requestId, mirrorKey, agentId, follower)` and
 * `VRFCopyTradeExecuted(requestId, mirrorKey, follower, amount)` filtered by
 * `follower = address`. Pure 0G-native: no DB, chain is the source of truth.
 *
 * Status comes from whether a Requested event has a matching Executed:
 *   - executed: VRFCopyTradeExecuted observed → status 'completed'
 *   - else:                                    → status 'pending'
 */

const LOOKBACK_BLOCKS = 200_000;
const RPC_LOG_CHUNK = 2_000;
const RPC_LOG_PARALLEL = 8;
const CACHE_TTL_MS = 30_000;

const REQ_EVENT = parseAbiItem(
  'event VRFCopyTradeRequested(uint256 indexed requestId, bytes32 mirrorKey, uint256 agentId, address indexed follower)'
);
const EXEC_EVENT = parseAbiItem(
  'event VRFCopyTradeExecuted(uint256 indexed requestId, bytes32 indexed mirrorKey, address indexed follower, uint256 amount)'
);

interface AuditEntry {
  requestId: string;
  mirrorKey: string;
  agentId: string;
  status: 'pending' | 'completed';
  amountWei?: string;
  blockNumber: number;
  txHash: string;
  executedTxHash?: string;
}

const cache = new Map<string, { ts: number; entries: AuditEntry[] }>();

export async function GET(request: NextRequest) {
  try {
    await applyRateLimit(request, {
      prefix: 'copy-trade-audit',
      maxRequests: 60,
      windowMs: 60_000,
    });

    const address = request.nextUrl.searchParams.get('address');
    if (!address || !/^0[xX][0-9a-fA-F]{40}$/.test(address)) {
      throw ErrorResponses.badRequest('Missing or invalid address');
    }
    const key = address.toLowerCase();
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json({ entries: cached.entries, cached: true });
    }

    const client = getResilientPublicClient();
    const head = await client.getBlockNumber();
    const fromBlock = head > BigInt(LOOKBACK_BLOCKS) ? head - BigInt(LOOKBACK_BLOCKS) : 0n;
    const mirrorAddress = AVALANCHE_CONTRACTS.externalMarketMirror as `0x${string}`;

    const ranges: Array<{ from: bigint; to: bigint }> = [];
    for (let cursor = fromBlock; cursor <= head; cursor += BigInt(RPC_LOG_CHUNK)) {
      const to = cursor + BigInt(RPC_LOG_CHUNK) - 1n;
      ranges.push({ from: cursor, to: to > head ? head : to });
    }

    async function pull(event: typeof REQ_EVENT | typeof EXEC_EVENT, args: Record<string, `0x${string}`>) {
      const out: unknown[] = [];
      for (let i = 0; i < ranges.length; i += RPC_LOG_PARALLEL) {
        const slice = ranges.slice(i, i + RPC_LOG_PARALLEL);
        const batch = await Promise.all(
          slice.map((r) =>
            client.getLogs({
              address: mirrorAddress,
              event,
              args,
              fromBlock: r.from,
              toBlock: r.to,
            })
          )
        );
        for (const logs of batch) out.push(...logs);
      }
      return out;
    }

    const [reqLogs, execLogs] = await Promise.all([
      pull(REQ_EVENT, { follower: address as `0x${string}` }),
      pull(EXEC_EVENT, { follower: address as `0x${string}` }),
    ]);

    const execMap = new Map<string, { amount: bigint; txHash: string; blockNumber: number }>();
    for (const log of execLogs as Array<{
      args?: { requestId?: bigint; amount?: bigint };
      transactionHash: `0x${string}` | null;
      blockNumber: bigint | null;
    }>) {
      const id = (log.args?.requestId ?? 0n).toString();
      execMap.set(id, {
        amount: log.args?.amount ?? 0n,
        txHash: log.transactionHash ?? '0x',
        blockNumber: Number(log.blockNumber ?? 0n),
      });
    }

    const entries: AuditEntry[] = (reqLogs as Array<{
      args?: { requestId?: bigint; mirrorKey?: string; agentId?: bigint };
      transactionHash: `0x${string}` | null;
      blockNumber: bigint | null;
    }>).map((log) => {
      const requestId = (log.args?.requestId ?? 0n).toString();
      const mirrorKey = log.args?.mirrorKey ?? '0x';
      const agentId = (log.args?.agentId ?? 0n).toString();
      const exec = execMap.get(requestId);
      const e: AuditEntry = {
        requestId,
        mirrorKey,
        agentId,
        status: exec ? 'completed' : 'pending',
        blockNumber: Number(log.blockNumber ?? 0n),
        txHash: log.transactionHash ?? '0x',
      };
      if (exec) {
        e.amountWei = exec.amount.toString();
        e.executedTxHash = exec.txHash;
      }
      return e;
    });

    entries.sort((a, b) => b.blockNumber - a.blockNumber);
    cache.set(key, { ts: Date.now(), entries });
    return NextResponse.json({
      entries,
      stats: {
        total: entries.length,
        pending: entries.filter((e) => e.status === 'pending').length,
        completed: entries.filter((e) => e.status === 'completed').length,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:CopyTrade:Audit:GET');
  }
}
