import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { avalancheFuji, avalanche } from 'viem/chains';
import { AVALANCHE_CONTRACTS } from '@/lib/apiConfig';
import { getAvalancheRpcUrl, getChainId } from '@/constants';
import { EXTERNAL_MARKET_MIRROR_ABI } from '@/constants/abis/externalMarketMirrorAbi';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { getMirrorCacheVersion } from '@/lib/mirrorCacheVersion';

/**
 * GET /api/mirror/positions?walletAddress=0x...
 *
 * Returns aggregated mirror-market positions for a user.
 *
 * Avalanche-only. No DB. Positions computed on every call by scanning
 * `MirrorTradeExecuted(mirrorKey indexed, trader indexed, isYes, amount, tokensReceived)`
 * events from the ExternalMarketMirror contract on Avalanche.
 *
 * Current YES price comes from `getMirrorMarket(mirrorKey).externalLink.lastSyncPrice` (bps).
 * `usedVRF` flag is derived from joining `VRFCopyTradeExecuted(requestId, mirrorKey, follower, amount)`.
 *
 * Cached per-address in process memory for 30s.
 */

const LOOKBACK_BLOCKS = 200_000;
const RPC_LOG_CHUNK = 2_000;
const RPC_LOG_PARALLEL = 8;
const CACHE_TTL_MS = 30_000;

type Position = {
  marketId: string;
  market: {
    externalId: string;
    source: string;
    question: string;
    yesPrice: number;
    noPrice: number;
    endTime: number;
    isActive: boolean;
  } | null;
  outcome: 'yes' | 'no';
  shares: string;
  avgPrice: number;
  currentPrice: number;
  value: string;
  pnl: string;
  pnlPercent: number;
  mirrorKey: string;
  usedVRF: boolean;
  agentId?: string;
};

const cache = new Map<string, { ts: number; version: number; positions: Position[] }>();

function safeBig(s: string | bigint | undefined): bigint {
  if (s === undefined || s === null) return 0n;
  if (typeof s === 'bigint') return s;
  try {
    return BigInt(String(s).split('.')[0]);
  } catch {
    return 0n;
  }
}

const MIRROR_TRADE_EVENT = parseAbiItem(
  'event MirrorTradeExecuted(bytes32 indexed mirrorKey, address indexed trader, bool isYes, uint256 amount, uint256 tokensReceived)'
);
const VRF_EXEC_EVENT = parseAbiItem(
  'event VRFCopyTradeExecuted(uint256 indexed requestId, bytes32 indexed mirrorKey, address indexed follower, uint256 amount)'
);

export async function GET(request: NextRequest) {
  try {
    applyRateLimit(request, {
      prefix: 'mirror-positions',
      maxRequests: 60,
      windowMs: 60_000,
    });

    const walletAddress = request.nextUrl.searchParams.get('walletAddress');
    if (!walletAddress || !/^0[xX][0-9a-fA-F]{40}$/.test(walletAddress)) {
      throw ErrorResponses.badRequest('Missing or invalid walletAddress');
    }
    const trader = walletAddress.toLowerCase();
    const currentVersion = getMirrorCacheVersion();
    const cached = cache.get(trader);
    if (
      cached &&
      cached.version === currentVersion &&
      Date.now() - cached.ts < CACHE_TTL_MS
    ) {
      return NextResponse.json({ positions: cached.positions, cached: true });
    }

    const chainId = getChainId();
    const chain = chainId === 43114 ? avalanche : avalancheFuji;
    const client = createPublicClient({ chain, transport: http(getAvalancheRpcUrl()) });

    const head = await client.getBlockNumber();
    const fromBlock = head > BigInt(LOOKBACK_BLOCKS) ? head - BigInt(LOOKBACK_BLOCKS) : 0n;
    const mirrorAddress = AVALANCHE_CONTRACTS.externalMarketMirror as `0x${string}`;

    const ranges: Array<{ from: bigint; to: bigint }> = [];
    for (let cursor = fromBlock; cursor <= head; cursor += BigInt(RPC_LOG_CHUNK)) {
      const to = cursor + BigInt(RPC_LOG_CHUNK) - 1n;
      ranges.push({ from: cursor, to: to > head ? head : to });
    }

    async function pullRange<T>(
      event: typeof MIRROR_TRADE_EVENT | typeof VRF_EXEC_EVENT,
      args: Record<string, `0x${string}`>
    ): Promise<T[]> {
      const out: T[] = [];
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
        for (const logs of batch) out.push(...(logs as unknown as T[]));
      }
      return out;
    }

    const [tradeLogs, vrfLogs] = await Promise.all([
      pullRange<unknown>(MIRROR_TRADE_EVENT, { trader: walletAddress as `0x${string}` }),
      pullRange<unknown>(VRF_EXEC_EVENT, { follower: walletAddress as `0x${string}` }),
    ]);

    const vrfHints = new Set<string>(
      vrfLogs.map((l) => {
        const args = (l as unknown as { args?: { mirrorKey?: string; amount?: bigint } }).args ?? {};
        return `${args.mirrorKey ?? ''}|${(args.amount ?? 0n).toString()}`;
      })
    );

    type Bucket = {
      mirrorKey: string;
      sharesYes: bigint;
      sharesNo: bigint;
      costYes: bigint;
      costNo: bigint;
      usedVRF: boolean;
    };
    const buckets = new Map<string, Bucket>();

    for (const log of tradeLogs) {
      const args =
        (log as unknown as {
          args?: { mirrorKey?: string; isYes?: boolean; amount?: bigint; tokensReceived?: bigint };
        }).args ?? {};
      const mirrorKey = args.mirrorKey ?? '0x';
      const isYes = Boolean(args.isYes);
      const cost = safeBig(args.amount);
      const shares = safeBig(args.tokensReceived);
      const vrfKey = `${mirrorKey}|${cost.toString()}`;
      const bucket =
        buckets.get(mirrorKey) ?? {
          mirrorKey,
          sharesYes: 0n,
          sharesNo: 0n,
          costYes: 0n,
          costNo: 0n,
          usedVRF: false,
        };
      if (isYes) {
        bucket.sharesYes += shares;
        bucket.costYes += cost;
      } else {
        bucket.sharesNo += shares;
        bucket.costNo += cost;
      }
      if (vrfHints.has(vrfKey)) bucket.usedVRF = true;
      buckets.set(mirrorKey, bucket);
    }

    const mirrorKeys = Array.from(buckets.keys()).filter((k) => k && k !== '0x');
    const mirrorStates = await Promise.all(
      mirrorKeys.map(async (mirrorKey) => {
        try {
          const data = await client.readContract({
            address: mirrorAddress,
            abi: EXTERNAL_MARKET_MIRROR_ABI,
            functionName: 'getMirrorMarket',
            args: [mirrorKey as `0x${string}`],
          });
          return { mirrorKey, data };
        } catch {
          return { mirrorKey, data: null };
        }
      })
    );
    const stateByKey = new Map(mirrorStates.map((s) => [s.mirrorKey, s.data]));

    const positions: Position[] = [];
    for (const bucket of buckets.values()) {
      const state = stateByKey.get(bucket.mirrorKey) as
        | {
            marketId: bigint;
            externalLink: {
              externalId: string;
              source: number;
              lastSyncPrice: bigint;
              lastSyncTime: bigint;
              isActive: boolean;
            };
            totalMirrorVolume: bigint;
            createdAt: bigint;
            creator: string;
          }
        | null
        | undefined;
      const yesBps = state ? Number(state.externalLink.lastSyncPrice) : 5_000;
      const market = state
        ? {
            externalId: state.externalLink.externalId,
            source: state.externalLink.source === 0 ? 'POLYMARKET' : 'KALSHI',
            question: '',
            yesPrice: yesBps / 100,
            noPrice: (10_000 - yesBps) / 100,
            endTime: 0,
            isActive: state.externalLink.isActive,
          }
        : null;
      const onChainMarketId = state ? state.marketId.toString() : bucket.mirrorKey;

      const buildSide = (outcome: 'yes' | 'no') => {
        const shares = outcome === 'yes' ? bucket.sharesYes : bucket.sharesNo;
        const cost = outcome === 'yes' ? bucket.costYes : bucket.costNo;
        if (shares <= 0n) return null;
        const priceBps = outcome === 'yes' ? yesBps : 10_000 - yesBps;
        const value = (shares * BigInt(priceBps)) / 10_000n;
        const pnl = value - cost;
        const pnlPercent = cost > 0n ? Number((pnl * 10_000n) / cost) / 100 : 0;
        const avgPrice = shares > 0n ? Number((cost * 10_000n) / shares) / 10_000 : 0;
        const pos: Position = {
          marketId: onChainMarketId,
          market,
          outcome,
          shares: shares.toString(),
          avgPrice,
          currentPrice: priceBps / 10_000,
          value: value.toString(),
          pnl: pnl.toString(),
          pnlPercent,
          mirrorKey: bucket.mirrorKey,
          usedVRF: bucket.usedVRF,
        };
        return pos;
      };

      const yesPos = buildSide('yes');
      const noPos = buildSide('no');
      if (yesPos) positions.push(yesPos);
      if (noPos) positions.push(noPos);
    }

    cache.set(trader, { ts: Date.now(), version: getMirrorCacheVersion(), positions });
    return NextResponse.json({ positions });
  } catch (error) {
    return handleAPIError(error, 'API:Mirror:Positions:GET');
  }
}
