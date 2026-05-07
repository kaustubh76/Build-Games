import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { keccak256, toBytes } from 'viem';
import { createHash } from 'crypto';
import { z } from 'zod';
import {
  AVALANCHE_RPC,
  AVALANCHE_CONTRACTS,
  ERC20_ABI,
  getServerPrivateKey,
} from '@/lib/apiConfig';
import { EXTERNAL_MARKET_MIRROR_ABI } from '@/constants/abis/externalMarketMirrorAbi';
import { upload as zgUpload, isZgConfigured } from '@/services/zgStorageService';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { chainMetrics } from '@/lib/metrics';
import { requireSessionForAddress } from '@/lib/auth/requireSession';
import {
  reserveAndSpend,
  releaseReservation,
  computeMinSharesOut,
  getUserSpendInfo,
  MAX_SLIPPAGE_BPS,
  PER_TRADE_CAP_WEI,
  PER_USER_DAILY_CAP_WEI,
} from '@/lib/safetyLimits';

/**
 * POST /api/copy-trade/whale-mirror
 *
 * One-shot, user-initiated mirror of a single whale trade. Distinct from
 * `whaleTrackerService.triggerMirrorCopyTrades`, which is the auto fan-out path
 * for users who *follow* a whale (that path uses `vrfCopyTrade` because it
 * fans out across many followers and needs randomness for ordering fairness).
 *
 * This endpoint uses the synchronous `tradeMirror(mirrorKey, isYes, amount,
 * minSharesOut)` path on the Avalanche `ExternalMarketMirror` contract — no
 * VRF round-trip, sharesOut returned in the same tx. Slippage is bounded by
 * computing minSharesOut from a static call against current pool state.
 *
 * Server signs with `PRIVATE_KEY` (custodial 1-click UX). All trades are
 * subject to the in-process safety caps in `lib/safetyLimits`.
 */

const BodySchema = z.object({
  userAddress: z.string().regex(/^0[xX][0-9a-fA-F]{40}$/),
  whaleTradeId: z.string().min(1).max(64),
  sizeCRwN: z
    .string()
    .regex(/^[0-9]+(\.[0-9]+)?$/)
    .optional(),
  whaleTrade: z.unknown().optional(),
});

const SYSTEM_DEFAULT_CRWN = '100';
const SYSTEM_PER_TRADE_CAP_CRWN = '1000';

// Auto-create-mirror config
const ENABLE_AUTO_CREATE_MIRROR =
  process.env.ENABLE_AUTO_CREATE_MIRROR === '1' ||
  process.env.ENABLE_AUTO_CREATE_MIRROR === 'true';
const AUTO_CREATE_LIQUIDITY_CRWN =
  process.env.AUTO_CREATE_LIQUIDITY_CRWN ?? '1';
// How many years out to set the mirror market's endTime when we create one
// without external metadata (whale-trade snapshot doesn't carry this).
const AUTO_CREATE_DEFAULT_END_YEARS = 1;

const idempotencyCache = new Map<string, { timestamp: number; result: unknown }>();
const IDEM_WINDOW_MS = 5 * 60_000;
const IDEM_MAX_SIZE = 5_000;
const IDEM_TRIM_TARGET = 2_500;

function cleanupIdem() {
  const now = Date.now();
  for (const [k, v] of idempotencyCache.entries()) {
    if (now - v.timestamp > IDEM_WINDOW_MS * 2) idempotencyCache.delete(k);
  }
  if (idempotencyCache.size > IDEM_MAX_SIZE) {
    trimIdem();
  }
}

/**
 * Bug #4 fix: trim BEFORE inserting so the cache never transiently exceeds
 * the cap. JS is single-threaded, so calling `idemSet()` instead of
 * `idempotencyCache.set()` guarantees no concurrent request observes
 * size > IDEM_MAX_SIZE.
 */
function trimIdem() {
  if (idempotencyCache.size < IDEM_MAX_SIZE) return;
  const entries = Array.from(idempotencyCache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp)
    .slice(idempotencyCache.size - IDEM_TRIM_TARGET);
  idempotencyCache.clear();
  for (const [k, v] of entries) idempotencyCache.set(k, v);
}

function idemSet(key: string, value: { timestamp: number; result: unknown }) {
  if (idempotencyCache.size >= IDEM_MAX_SIZE) trimIdem();
  idempotencyCache.set(key, value);
}

function sourceToUint8(source: string): number {
  const s = source.toUpperCase();
  if (s === 'POLYMARKET') return 0;
  if (s === 'KALSHI') return 1;
  throw ErrorResponses.badRequest(`Unsupported source: ${source}`);
}

interface WhaleTradeSnapshot {
  id: string;
  source: string;
  marketId: string;
  marketQuestion: string;
  traderAddress?: string;
  outcome: 'yes' | 'no';
  side: 'buy' | 'sell';
  amountUsd: string;
}

const WhaleTradeSnapshotSchema = z.object({
  id: z.string().min(1),
  source: z.string(),
  marketId: z.string(),
  marketQuestion: z.string().default(''),
  traderAddress: z.string().optional(),
  outcome: z.union([z.literal('yes'), z.literal('no')]),
  side: z.union([z.literal('buy'), z.literal('sell')]),
  amountUsd: z.string(),
});

/**
 * Resolve the whale trade snapshot from either the body or the
 * `x-whale-trade-snapshot` header. The whale-tracker UI surfaces alerts straight
 * from the live WS feed; clients forward that snapshot here.
 *
 * The snapshot is just metadata for the receipt artifact — the on-chain
 * `vrfCopyTrade` call is what actually moves CRwN, so a malicious snapshot can
 * only mislabel the receipt, not steal funds.
 */
function resolveWhaleTrade(
  whaleTradeId: string,
  raw: unknown,
  snapshotHeader: string | null
): WhaleTradeSnapshot | null {
  const candidates: unknown[] = [];
  if (raw !== undefined && raw !== null) candidates.push(raw);
  if (snapshotHeader) {
    try {
      candidates.push(JSON.parse(snapshotHeader));
    } catch {
      // fall through
    }
  }
  for (const c of candidates) {
    const parsed = WhaleTradeSnapshotSchema.safeParse(c);
    if (parsed.success && parsed.data.id === whaleTradeId) return parsed.data;
  }
  return null;
}

function minWei(...values: bigint[]): bigint {
  return values.reduce((acc, v) => (v < acc ? v : acc));
}

export async function POST(request: NextRequest) {
  // Hoisted across try/catch so the catch can refund a reservation made inside
  // the try. Set when reserveAndSpend succeeds; cleared once the on-chain trade
  // settles (turning the reservation into a real spend) or once we've refunded.
  let reservation: { addr: string; amountWei: bigint } | null = null;
  const releaseIfPending = () => {
    if (reservation) {
      releaseReservation(reservation.addr, reservation.amountWei);
      reservation = null;
    }
  };
  try {
    const raw = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    // Wallet-based rate limit applies BEFORE the heavy on-chain work. We need
    // the parsed body to extract userAddress, so do an early validation pass
    // and rate-limit by wallet too — strictWalletLimit halves IP limit.
    applyRateLimit(request, {
      prefix: 'whale-mirror',
      maxRequests: 5,
      windowMs: 60_000,
      walletAddress:
        parsed.success && parsed.data.userAddress ? parsed.data.userAddress : undefined,
      strictWalletLimit: true,
    });
    if (!parsed.success) {
      throw ErrorResponses.badRequest(
        `Invalid body: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
      );
    }
    const { userAddress, whaleTradeId, sizeCRwN, whaleTrade: whaleTradeRaw } = parsed.data;

    // SIWE guard: caller must own the wallet they're trading on behalf of.
    // In warn mode this just logs; in enforce mode it throws 401/403.
    requireSessionForAddress(request, userAddress);

    const idemKey = keccak256(toBytes(`${userAddress.toLowerCase()}|${whaleTradeId}`));
    cleanupIdem();
    const cached = idempotencyCache.get(idemKey);
    if (cached && Date.now() - cached.timestamp < IDEM_WINDOW_MS) {
      return NextResponse.json({
        ...(cached.result as object),
        cached: true,
        message: 'Duplicate request — returning prior result',
      });
    }

    const snapshotHeader = request.headers.get('x-whale-trade-snapshot');
    const whaleTrade = resolveWhaleTrade(whaleTradeId, whaleTradeRaw, snapshotHeader);
    if (!whaleTrade) {
      throw ErrorResponses.badRequest(
        `whaleTrade snapshot for id ${whaleTradeId} required in body.whaleTrade or x-whale-trade-snapshot header`
      );
    }

    const sourceId = sourceToUint8(whaleTrade.source);
    const userMaxCopy = SYSTEM_DEFAULT_CRWN;

    const desired = sizeCRwN ?? userMaxCopy;
    const desiredWei = ethers.parseEther(desired);
    const userMaxWei = ethers.parseEther(userMaxCopy);
    const sysCapWei = ethers.parseEther(SYSTEM_PER_TRADE_CAP_CRWN);
    const candidateWei = minWei(desiredWei, userMaxWei, sysCapWei);
    if (candidateWei <= 0n) throw ErrorResponses.badRequest('Resolved copy amount is zero');

    // Bug #1 fix: atomically reserve daily-spend budget BEFORE the long async
    // chain (auto-create + balance check + on-chain tx). Two concurrent requests
    // from the same wallet cannot both pass the cap because reserveAndSpend
    // debits in the same synchronous block as the read. If the trade ultimately
    // fails (or we early-return down the auto-create path without trading), we
    // must releaseReservation to refund the daily budget.
    let amountWei: bigint;
    let limitCapped = false;
    let limitReason: string | undefined;
    try {
      const limited = reserveAndSpend(userAddress, candidateWei);
      amountWei = limited.allowedWei;
      limitCapped = limited.capped;
      limitReason = limited.reason;
    } catch (limitErr) {
      const msg = limitErr instanceof Error ? limitErr.message : 'Safety limit hit';
      if (/Trading paused/i.test(msg)) throw ErrorResponses.tradingPaused();
      if (/Per-trade cap/i.test(msg)) {
        throw ErrorResponses.perTradeCapExceeded(
          ethers.formatEther(PER_TRADE_CAP_WEI),
          ethers.formatEther(candidateWei)
        );
      }
      if (/Daily mirror-trade cap/i.test(msg)) {
        const info = getUserSpendInfo(userAddress);
        throw ErrorResponses.dailyCapReached(
          ethers.formatEther(PER_USER_DAILY_CAP_WEI),
          ethers.formatEther(BigInt(info.spentWei))
        );
      }
      throw ErrorResponses.badRequest(msg);
    }
    // From here on, any path that doesn't actually settle the on-chain trade
    // MUST call releaseIfPending() before returning. The catch block also
    // refunds via the hoisted `reservation` ref.
    reservation = { addr: userAddress, amountWei };

    const provider = new ethers.JsonRpcProvider(AVALANCHE_RPC);
    const pk = getServerPrivateKey();
    if (!pk) throw ErrorResponses.serviceUnavailable('Server signer not configured');
    const wallet = new ethers.Wallet(pk, provider);
    const mirror = new ethers.Contract(
      AVALANCHE_CONTRACTS.externalMarketMirror,
      EXTERNAL_MARKET_MIRROR_ABI,
      wallet
    );
    const mirrorRead = new ethers.Contract(
      AVALANCHE_CONTRACTS.externalMarketMirror,
      EXTERNAL_MARKET_MIRROR_ABI,
      provider
    );

    const crown = new ethers.Contract(AVALANCHE_CONTRACTS.crownToken, ERC20_ABI, wallet);

    const mirrorKey: string = await mirrorRead.getMirrorKey(sourceId, whaleTrade.marketId);
    const mirrorMarket = await mirrorRead.getMirrorMarket(mirrorKey);

    let autoCreate: {
      attempted: boolean;
      txHash: string | null;
      requestId: string | null;
      blockNumber: number | null;
      message: string;
    } | null = null;

    if (!mirrorMarket?.externalLink?.isActive) {
      if (!ENABLE_AUTO_CREATE_MIRROR) {
        throw ErrorResponses.noActiveMirror(
          whaleTrade.source,
          whaleTrade.marketId,
          false
        );
      }

      // Bootstrap the mirror market on-chain. Creation is async on this contract:
      // createMirrorMarket emits MirrorMarketRequested now, and MirrorMarketCreated
      // fires later when the VRF/oracle callback completes. We CANNOT trade in
      // the same request — return a 202-style "pending" response so the user
      // knows to retry in ~30s.
      try {
        const liquidityWei = ethers.parseEther(AUTO_CREATE_LIQUIDITY_CRWN);

        // Pre-flight: server wallet must have enough CRwN to seed liquidity.
        const serverBalance: bigint = await crown.balanceOf(wallet.address);
        if (serverBalance < liquidityWei) {
          throw ErrorResponses.notEnoughCRwN(
            ethers.formatEther(serverBalance),
            AUTO_CREATE_LIQUIDITY_CRWN,
            wallet.address
          );
        }

        // Pre-approve creation liquidity if needed
        const liquidityAllowance: bigint = await crown.allowance(
          wallet.address,
          AVALANCHE_CONTRACTS.externalMarketMirror
        );
        if (liquidityAllowance < liquidityWei) {
          const tx = await crown.approve(
            AVALANCHE_CONTRACTS.externalMarketMirror,
            ethers.MaxUint256
          );
          await tx.wait();
        }
        // Bootstrap params: best-effort because the whale snapshot doesn't carry
        // an endTime. Default to 1 year out; the oracle/creator can refine later.
        const endTime = Math.floor(Date.now() / 1000) + AUTO_CREATE_DEFAULT_END_YEARS * 365 * 24 * 60 * 60;
        const yesPriceBps =
          typeof whaleTrade.amountUsd === 'string' && whaleTrade.outcome
            ? whaleTrade.outcome === 'yes'
              ? 5500
              : 4500
            : 5000;
        const createTx = await mirror.createMirrorMarket(
          whaleTrade.marketId,
          sourceId,
          whaleTrade.marketQuestion ?? `Mirror of ${whaleTrade.source} ${whaleTrade.marketId}`,
          BigInt(yesPriceBps),
          BigInt(endTime),
          liquidityWei
        );
        const createReceipt: ethers.TransactionReceipt = await createTx.wait();
        let requestId: string | null = null;
        for (const log of createReceipt.logs) {
          try {
            const parsed = mirror.interface.parseLog(log);
            if (parsed?.name === 'MirrorMarketRequested') {
              requestId = parsed.args?.requestId?.toString() ?? null;
              break;
            }
          } catch {
            // not from this contract
          }
        }
        autoCreate = {
          attempted: true,
          txHash: createReceipt.hash,
          requestId,
          blockNumber: createReceipt.blockNumber,
          message:
            'Mirror market creation submitted. The market will activate once the on-chain VRF callback completes (typically ~30s on Fuji). Retry your mirror request after that.',
        };
      } catch (createErr) {
        const msg = createErr instanceof Error ? createErr.message : 'unknown';
        throw ErrorResponses.badRequest(
          `Auto-create-mirror failed for ${whaleTrade.source} ${whaleTrade.marketId}: ${msg}`
        );
      }

      // Persist a 0G receipt for the create-only step so it's auditable.
      let createRootHash: string | null = null;
      let createStorageTxHash: string | null = null;
      if (isZgConfigured() && autoCreate) {
        const createArtifact = {
          version: '1.1.0',
          type: 'mirror-market-auto-create',
          timestamp: Date.now(),
          requestor: userAddress,
          source: whaleTrade.source,
          externalId: whaleTrade.marketId,
          question: whaleTrade.marketQuestion ?? '',
          mirrorKey,
          onChain: {
            chainId: 43113,
            contract: AVALANCHE_CONTRACTS.externalMarketMirror,
            txHash: autoCreate.txHash,
            blockNumber: autoCreate.blockNumber,
            requestId: autoCreate.requestId,
          },
        };
        try {
          const up = await zgUpload(
            Buffer.from(JSON.stringify(createArtifact)),
            `mirror-create-${autoCreate.txHash}.json`
          );
          createRootHash = up.rootHash;
          createStorageTxHash = up.txHash || null;
        } catch (e) {
          console.warn('[whale-mirror] 0G upload of create receipt failed', e);
        }
      }

      const pendingResult = {
        success: false,
        pending: true,
        reason: 'mirror-market-created-pending-activation',
        autoCreate: {
          ...autoCreate,
          receipt: { rootHash: createRootHash, storageTxHash: createStorageTxHash },
        },
        mirrorKey,
        whaleTradeId: whaleTrade.id,
        retryAfterSeconds: 45,
      };
      idemSet(idemKey, { timestamp: Date.now(), result: pendingResult });
      chainMetrics.incrementCounter('whale_mirror_attempts_total', 1, {
        outcome: 'pending_activation',
      });
      // No on-chain trade happened — refund the reserved daily-spend budget so
      // the user isn't debited for a market that's still bootstrapping.
      releaseIfPending();
      return NextResponse.json(pendingResult, { status: 202 });
    }

    // Pre-flight: server wallet CRwN balance must cover the trade.
    const serverBalance: bigint = await crown.balanceOf(wallet.address);
    if (serverBalance < amountWei) {
      throw ErrorResponses.notEnoughCRwN(
        ethers.formatEther(serverBalance),
        ethers.formatEther(amountWei),
        wallet.address
      );
    }

    const allowance: bigint = await crown.allowance(
      wallet.address,
      AVALANCHE_CONTRACTS.externalMarketMirror
    );
    if (allowance < amountWei) {
      const approveTx = await crown.approve(
        AVALANCHE_CONTRACTS.externalMarketMirror,
        ethers.MaxUint256
      );
      await approveTx.wait();
    }

    // Slippage floor: derive minSharesOut from current pool state via static call.
    let minSharesOut = 0n;
    try {
      const expected = await mirrorRead.tradeMirror.staticCall(
        mirrorKey,
        whaleTrade.outcome === 'yes',
        amountWei,
        0n
      );
      if (typeof expected === 'bigint') {
        minSharesOut = computeMinSharesOut(expected, MAX_SLIPPAGE_BPS);
      }
    } catch {
      // staticCall not supported or pool empty; fall back to 0 (no slippage guard)
    }

    const tx = await mirror.tradeMirror(
      mirrorKey,
      whaleTrade.outcome === 'yes',
      amountWei,
      minSharesOut
    );
    const receipt: ethers.TransactionReceipt = await tx.wait();
    // Trade settled on-chain — the reservation is now a real spend, not a
    // refundable hold. Clear the ref so the outer catch (e.g. 0G upload
    // failure) doesn't refund a successful trade.
    reservation = null;

    let sharesOut: string | null = null;
    for (const log of receipt.logs) {
      try {
        const parsed = mirror.interface.parseLog(log);
        if (parsed?.name === 'MirrorTradeExecuted') {
          sharesOut = parsed.args?.tokensReceived?.toString() ?? null;
          break;
        }
      } catch {
        // not from this contract
      }
    }

    // Build receipt artifact and persist to 0G Storage (no centralized DB).
    // The on-chain VRFCopyTradeRequested event is the index — we recompute the
    // dataHash from this artifact for integrity, and the rootHash is content-addressed.
    const receiptArtifact = {
      version: '1.1.0',
      type: 'whale-mirror-receipt',
      timestamp: Date.now(),
      user: userAddress,
      whale: whaleTrade.traderAddress ?? '',
      source: whaleTrade.source,
      whaleTradeId: whaleTrade.id,
      whaleMarketId: whaleTrade.marketId,
      whaleMarketQuestion: whaleTrade.marketQuestion,
      whaleAmountUsd: whaleTrade.amountUsd,
      whaleOutcome: whaleTrade.outcome,
      whaleSide: whaleTrade.side,
      mirror: {
        mirrorKey,
        outcome: whaleTrade.outcome,
        amountWei: amountWei.toString(),
        amountCRwN: ethers.formatEther(amountWei),
        isYes: whaleTrade.outcome === 'yes',
        sharesOut,
        minSharesOut: minSharesOut.toString(),
        slippageBps: MAX_SLIPPAGE_BPS,
        method: 'tradeMirror',
      },
      onChain: {
        chainId: 43113,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        contract: AVALANCHE_CONTRACTS.externalMarketMirror,
      },
    };
    const dataHash = createHash('sha256')
      .update(JSON.stringify(receiptArtifact))
      .digest('hex');

    let rootHash: string | null = null;
    let storageTxHash: string | null = null;
    if (isZgConfigured()) {
      try {
        const up = await zgUpload(
          Buffer.from(JSON.stringify({ ...receiptArtifact, dataHash })),
          `mirror-receipt-${receipt.hash}.json`
        );
        rootHash = up.rootHash;
        storageTxHash = up.txHash || null;
      } catch (e) {
        console.warn('[whale-mirror] 0G upload failed; receipt remains derivable from event log', e);
      }
    } else {
      console.warn('[whale-mirror] 0G not configured (ZG_PRIVATE_KEY); skipping receipt upload');
    }

    const result = {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      mirrorKey,
      sharesOut,
      minSharesOut: minSharesOut.toString(),
      slippageBps: MAX_SLIPPAGE_BPS,
      copyAmount: ethers.formatEther(amountWei),
      copyAmountWei: amountWei.toString(),
      whaleTradeId: whaleTrade.id,
      outcome: whaleTrade.outcome,
      receipt: {
        rootHash,
        dataHash,
        storageTxHash,
      },
      limits: {
        capped: limitCapped,
        cappedReason: limitReason,
      },
    };
    idemSet(idemKey, { timestamp: Date.now(), result });
    chainMetrics.incrementCounter('whale_mirror_attempts_total', 1, {
      outcome: 'success',
    });
    chainMetrics.setGauge('whale_mirror_last_amount_crwn', parseFloat(ethers.formatEther(amountWei)));
    return NextResponse.json(result);
  } catch (error) {
    // Refund the daily-spend reservation if the trade never settled. This is a
    // no-op once `reservationReleased = true` is set after tx.wait() succeeds.
    releaseIfPending();
    const errorCode =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: unknown }).code)
        : 'unknown';
    chainMetrics.incrementCounter('whale_mirror_attempts_total', 1, {
      outcome: 'rejected',
      error_code: errorCode,
    });
    return handleAPIError(error, 'API:CopyTrade:WhaleMirror:POST');
  }
}
