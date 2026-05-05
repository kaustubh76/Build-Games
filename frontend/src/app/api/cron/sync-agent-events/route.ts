import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem, type Log } from 'viem';
import { avalancheFuji, avalanche } from 'viem/chains';
import { AVALANCHE_CONTRACTS } from '@/lib/apiConfig';
import { getAvalancheRpcUrl, getChainId } from '@/constants';
import { chainMetrics } from '@/lib/metrics';

/**
 * GET /api/cron/sync-agent-events
 *
 * Scans recent AIAgentINFT events to update operational metrics.
 *
 * 0G-native design: this route writes NO database rows. Chain logs are the
 * source of truth, and consumers that need a list of trades for an agent or
 * follower call `client.getLogs({ event, args: {...} })` directly.
 *
 * Persisted state lives in-process (resets on cold start, fine for metrics).
 *
 * Auth: Vercel cron sets `Authorization: Bearer ${CRON_SECRET}`.
 */

const MAX_BLOCK_RANGE = 2_000;

// In-memory checkpoint. Cold-starts re-sync the last `INITIAL_LOOKBACK_BLOCKS`.
const INITIAL_LOOKBACK_BLOCKS = 200;
let lastSyncedBlock = 0;
let lastRunMetrics = {
  ranAt: 0,
  durationMs: 0,
  logsProcessed: 0,
  counts: { mints: 0, trades: 0, externalTrades: 0, copyStarts: 0, copyStops: 0 },
};

const EVENTS = [
  parseAbiItem(
    'event INFTMinted(uint256 indexed tokenId, address indexed owner, bytes32 metadataHash, string encryptedMetadataRef, uint256 stakedAmount)'
  ),
  parseAbiItem('event TradeRecorded(uint256 indexed tokenId, bool won, int256 pnl)'),
  parseAbiItem(
    'event ExternalTradeRecorded(uint256 indexed tokenId, bool isYes, string mirrorKey, bool won, int256 pnl)'
  ),
  parseAbiItem(
    'event CopyTradeStarted(address indexed user, uint256 indexed tokenId, uint256 maxAmountPerTrade)'
  ),
  parseAbiItem('event CopyTradeStopped(address indexed user, uint256 indexed tokenId)'),
] as const;

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const isDev = process.env.NODE_ENV !== 'production';
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  const forced = request.nextUrl.searchParams.get('force') === '1';
  if (cronSecret) {
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (!isDev && !forced) {
    return NextResponse.json({ error: 'CRON_SECRET unset' }, { status: 401 });
  }

  try {
    const chainId = getChainId();
    const chain = chainId === 43114 ? avalanche : avalancheFuji;
    const client = createPublicClient({ chain, transport: http(getAvalancheRpcUrl()) });

    const inftAddress = AVALANCHE_CONTRACTS.aiAgentINFT as `0x${string}`;
    const head = Number(await client.getBlockNumber());
    const fromBlock = lastSyncedBlock > 0 ? lastSyncedBlock + 1 : Math.max(0, head - INITIAL_LOOKBACK_BLOCKS);
    const toBlock = Math.min(head, fromBlock + MAX_BLOCK_RANGE - 1);

    if (fromBlock > head) {
      lastSyncedBlock = head;
      chainMetrics.setGauge('inft_events_synced_block', head);
      chainMetrics.setGauge('inft_events_blocks_behind', 0);
      return NextResponse.json({ success: true, message: 'Already at head', head, synced: head });
    }

    const allLogs: Log[] = [];
    for (const event of EVENTS) {
      const logs = await client.getLogs({
        address: inftAddress,
        event,
        fromBlock: BigInt(fromBlock),
        toBlock: BigInt(toBlock),
      });
      allLogs.push(...logs);
    }

    let mintCount = 0;
    let tradeCount = 0;
    let externalTradeCount = 0;
    let copyStarts = 0;
    let copyStops = 0;

    for (const log of allLogs) {
      const eventName = (log as unknown as { eventName?: string }).eventName;
      if (eventName === 'INFTMinted') mintCount++;
      else if (eventName === 'TradeRecorded') tradeCount++;
      else if (eventName === 'ExternalTradeRecorded') externalTradeCount++;
      else if (eventName === 'CopyTradeStarted') copyStarts++;
      else if (eventName === 'CopyTradeStopped') copyStops++;

      if (eventName) {
        chainMetrics.incrementCounter('inft_events_total', 1, { event: eventName });
      }
    }

    lastSyncedBlock = toBlock;
    chainMetrics.setGauge('inft_events_synced_block', toBlock);
    chainMetrics.setGauge('inft_events_blocks_behind', Math.max(0, head - toBlock));
    chainMetrics.setGauge('inft_mints_total', mintCount, { window: 'last-batch' });
    chainMetrics.setGauge('inft_trades_total', tradeCount, { window: 'last-batch' });
    chainMetrics.setGauge('inft_external_trades_total', externalTradeCount, { window: 'last-batch' });

    lastRunMetrics = {
      ranAt: Date.now(),
      durationMs: Date.now() - startedAt,
      logsProcessed: allLogs.length,
      counts: {
        mints: mintCount,
        trades: tradeCount,
        externalTrades: externalTradeCount,
        copyStarts,
        copyStops,
      },
    };

    return NextResponse.json({
      success: true,
      head,
      fromBlock,
      toBlock,
      logsProcessed: allLogs.length,
      counts: lastRunMetrics.counts,
      blocksBehind: Math.max(0, head - toBlock),
      durationMs: lastRunMetrics.durationMs,
      checkpointStorage: 'in-memory (no centralized DB)',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    chainMetrics.incrementCounter('inft_indexer_errors_total', 1);
    console.error('[sync-agent-events] error', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
