import { NextRequest, NextResponse } from 'next/server';
import { parseAbiItem } from 'viem';
import { getChainId, chainsToContracts } from '@/constants';
import { getResilientPublicClient } from '@/lib/viemClient';
import { handleAPIError, applyRateLimit } from '@/lib/api';

/**
 * GET /api/arena/replays?limit=20
 *
 * Returns the most recent battle replay hashes by scanning the on-chain
 * `BattleDataStored(battleId, dataHash)` event emitted by PredictionArena.
 *
 * 0G-native: chain is the canonical record. Each `dataHash` is the 0G root
 * hash that resolves to the verifiable battle artifact at /arena/replay/[hash].
 */

const LOOKBACK_BLOCKS = 200_000;
const RPC_LOG_CHUNK = 2_000;
const RPC_LOG_PARALLEL = 8;
const CACHE_TTL_MS = 60_000;

const BATTLE_DATA_STORED = parseAbiItem(
  'event BattleDataStored(uint256 indexed battleId, bytes32 dataHash)'
);

interface ReplayEntry {
  battleId: string;
  dataHash: string;
  blockNumber: number;
  txHash: string;
}

let cache: { ts: number; entries: ReplayEntry[] } | null = null;

export async function GET(request: NextRequest) {
  try {
    await applyRateLimit(request, {
      prefix: 'arena-replays',
      maxRequests: 60,
      windowMs: 60_000,
    });

    const limitRaw = parseInt(request.nextUrl.searchParams.get('limit') || '20', 10);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 20, 1), 100);

    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return NextResponse.json({
        entries: cache.entries.slice(0, limit),
        cached: true,
      });
    }

    const chainId = getChainId();
    const client = getResilientPublicClient();

    const contracts = chainsToContracts[chainId] ?? chainsToContracts[43113];
    const arenaAddress = (contracts as Record<string, string> | undefined)?.PredictionArena ??
      (contracts as Record<string, string> | undefined)?.predictionArena;
    if (!arenaAddress) {
      return NextResponse.json({ entries: [], note: 'PredictionArena not configured' });
    }

    const head = await client.getBlockNumber();
    const fromBlock = head > BigInt(LOOKBACK_BLOCKS) ? head - BigInt(LOOKBACK_BLOCKS) : 0n;

    const ranges: Array<{ from: bigint; to: bigint }> = [];
    for (let cursor = fromBlock; cursor <= head; cursor += BigInt(RPC_LOG_CHUNK)) {
      const to = cursor + BigInt(RPC_LOG_CHUNK) - 1n;
      ranges.push({ from: cursor, to: to > head ? head : to });
    }

    const allLogs: unknown[] = [];
    for (let i = 0; i < ranges.length; i += RPC_LOG_PARALLEL) {
      const slice = ranges.slice(i, i + RPC_LOG_PARALLEL);
      const batch = await Promise.all(
        slice.map((r) =>
          client.getLogs({
            address: arenaAddress as `0x${string}`,
            event: BATTLE_DATA_STORED,
            fromBlock: r.from,
            toBlock: r.to,
          })
        )
      );
      for (const logs of batch) allLogs.push(...logs);
    }

    const entries: ReplayEntry[] = (allLogs as Array<{
      args?: { battleId?: bigint; dataHash?: string };
      transactionHash: `0x${string}` | null;
      blockNumber: bigint | null;
    }>)
      .filter((log) => log.args?.dataHash && log.args.dataHash !== '0x' + '0'.repeat(64))
      .map((log) => ({
        battleId: (log.args?.battleId ?? 0n).toString(),
        dataHash: log.args?.dataHash ?? '0x',
        blockNumber: Number(log.blockNumber ?? 0n),
        txHash: log.transactionHash ?? '0x',
      }));

    entries.sort((a, b) => b.blockNumber - a.blockNumber);
    cache = { ts: Date.now(), entries };

    return NextResponse.json({
      entries: entries.slice(0, limit),
      total: entries.length,
    });
  } catch (error) {
    return handleAPIError(error, 'API:Arena:Replays:GET');
  }
}
