import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { keccak256, toBytes } from 'viem';
import { z } from 'zod';
import {
  AVALANCHE_RPC,
  AVALANCHE_CONTRACTS,
  ERC20_ABI,
  getServerPrivateKey,
} from '@/lib/apiConfig';
import { EXTERNAL_MARKET_MIRROR_ABI } from '@/constants/abis/externalMarketMirrorAbi';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { chainMetrics } from '@/lib/metrics';
import { bumpMirrorCacheVersion } from '@/lib/mirrorCacheVersion';
import {
  enforceTradeLimits,
  recordSpend,
  computeMinSharesOut,
  getUserSpendInfo,
  MAX_SLIPPAGE_BPS,
  PER_TRADE_CAP_WEI,
  PER_USER_DAILY_CAP_WEI,
} from '@/lib/safetyLimits';

/**
 * Run enforceTradeLimits and rethrow as structured APIError codes so the
 * client can distinguish TRADING_PAUSED / PER_TRADE_CAP_EXCEEDED / DAILY_CAP_REACHED.
 */
function applyTradeLimits(addr: string, requestedWei: bigint) {
  try {
    return enforceTradeLimits(addr, requestedWei);
  } catch (limitErr) {
    const msg = limitErr instanceof Error ? limitErr.message : 'Safety limit hit';
    if (/Trading paused/i.test(msg)) throw ErrorResponses.tradingPaused();
    if (/Per-trade cap/i.test(msg)) {
      throw ErrorResponses.perTradeCapExceeded(
        ethers.formatEther(PER_TRADE_CAP_WEI),
        ethers.formatEther(requestedWei)
      );
    }
    if (/Daily mirror-trade cap/i.test(msg)) {
      const info = getUserSpendInfo(addr);
      throw ErrorResponses.dailyCapReached(
        ethers.formatEther(PER_USER_DAILY_CAP_WEI),
        ethers.formatEther(BigInt(info.spentWei))
      );
    }
    throw ErrorResponses.badRequest(msg);
  }
}

/**
 * POST /api/mirror/execute — Avalanche ExternalMarketMirror dispatcher.
 *
 * Despite the legacy alias still mounted at /api/flow/execute, NOTHING in this code
 * targets the Flow blockchain. Every write goes to the Avalanche-deployed
 * `ExternalMarketMirror` contract. The "flow" wording in the legacy path means
 * "action flow", not Flow chain.
 *
 * Actions: getMirrorKey, getMirrorMarket, query, createMirror, trade,
 *          vrfCopyTrade, syncPrice, resolve.
 */

const idempotencyCache = new Map<string, { timestamp: number; result: unknown }>();
const IDEMPOTENCY_WINDOW_MS = 60_000;

function cleanupIdempotencyCache() {
  const now = Date.now();
  for (const [key, value] of idempotencyCache.entries()) {
    if (now - value.timestamp > IDEMPOTENCY_WINDOW_MS * 2) idempotencyCache.delete(key);
  }
  if (idempotencyCache.size > 10_000) {
    const entries = Array.from(idempotencyCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, 5_000);
    idempotencyCache.clear();
    entries.forEach(([k, v]) => idempotencyCache.set(k, v));
  }
}

const sourceToUint8 = (source: string): number => {
  const s = String(source).toUpperCase();
  if (s === 'POLYMARKET' || s === '0') return 0;
  if (s === 'KALSHI' || s === '1') return 1;
  throw ErrorResponses.badRequest(`Unsupported source: ${source}`);
};

const ActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('vrfCopyTrade'),
    mirrorKey: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    agentId: z.union([z.string(), z.number()]).optional(),
    userAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    isYes: z.boolean(),
    amount: z.string().regex(/^[0-9]+$/),
  }),
  z.object({
    action: z.literal('createMirror'),
    walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    externalId: z.string().min(1).max(256),
    source: z.string(),
    question: z.string().min(1).max(1024),
    yesPrice: z.number().int().min(0).max(10_000),
    endTime: z.number().int().positive(),
    initialLiquidity: z.string().regex(/^[0-9]+(\.[0-9]+)?$/),
  }),
  z.object({
    action: z.literal('trade'),
    walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    mirrorKey: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    isYes: z.boolean(),
    amount: z.string().regex(/^[0-9]+(\.[0-9]+)?$/),
    minSharesOut: z.string().regex(/^[0-9]+$/).optional(),
  }),
  z.object({
    action: z.literal('getMirrorKey'),
    source: z.string(),
    externalId: z.string().min(1),
  }),
  z.object({
    action: z.literal('getMirrorMarket'),
    mirrorKey: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  }),
  z.object({
    action: z.literal('query'),
    mirrorKey: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  }),
  z.object({
    action: z.literal('syncPrice'),
    mirrorKey: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    newYesPrice: z.number().int().min(0).max(10_000),
    signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  }),
  z.object({
    action: z.literal('resolve'),
    mirrorKey: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    outcome: z.union([z.literal('yes'), z.literal('no')]),
    signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  }),
]);

export type MirrorAction = z.infer<typeof ActionSchema>;

const READ_ACTIONS = new Set(['getMirrorKey', 'getMirrorMarket', 'query']);

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(AVALANCHE_RPC);
}

function getSignerWallet(provider: ethers.JsonRpcProvider): ethers.Wallet {
  const pk = getServerPrivateKey();
  if (!pk) throw ErrorResponses.serviceUnavailable('Server signer not configured (PRIVATE_KEY missing)');
  return new ethers.Wallet(pk, provider);
}

function readContract(provider: ethers.JsonRpcProvider): ethers.Contract {
  return new ethers.Contract(
    AVALANCHE_CONTRACTS.externalMarketMirror,
    EXTERNAL_MARKET_MIRROR_ABI,
    provider
  );
}

function writeContract(wallet: ethers.Wallet): ethers.Contract {
  return new ethers.Contract(
    AVALANCHE_CONTRACTS.externalMarketMirror,
    EXTERNAL_MARKET_MIRROR_ABI,
    wallet
  );
}

async function ensureCrownAllowance(wallet: ethers.Wallet, neededAmount: bigint) {
  const crown = new ethers.Contract(AVALANCHE_CONTRACTS.crownToken, ERC20_ABI, wallet);
  const current: bigint = await crown.allowance(wallet.address, AVALANCHE_CONTRACTS.externalMarketMirror);
  if (current < neededAmount) {
    const tx = await crown.approve(AVALANCHE_CONTRACTS.externalMarketMirror, ethers.MaxUint256);
    await tx.wait();
  }
}

function findEvent(
  contract: ethers.Contract,
  receipt: ethers.TransactionReceipt,
  name: string
): ethers.LogDescription | null {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === name) return parsed;
    } catch {
      // not from this contract
    }
  }
  return null;
}

export async function handleMirrorAction(action: MirrorAction): Promise<unknown> {
  const provider = getProvider();
  const reader = readContract(provider);

  switch (action.action) {
    case 'getMirrorKey': {
      const sourceId = sourceToUint8(action.source);
      const mirrorKey: string = await reader.getMirrorKey(sourceId, action.externalId);
      return { mirrorKey };
    }

    case 'getMirrorMarket':
    case 'query': {
      const data = await reader.getMirrorMarket(action.mirrorKey);
      const link = data.externalLink;
      return {
        mirrorKey: action.mirrorKey,
        onChainMarketId: data.marketId.toString(),
        externalId: link.externalId,
        source: Number(link.source) === 0 ? 'POLYMARKET' : 'KALSHI',
        question: '',
        yesPrice: Number(link.lastSyncPrice),
        noPrice: 10_000 - Number(link.lastSyncPrice),
        totalVolume: data.totalMirrorVolume.toString(),
        tradeCount: 0,
        isActive: link.isActive,
        creator: data.creator,
        createdAt: Number(data.createdAt),
        externalLink: {
          isActive: link.isActive,
          lastSyncTime: Number(link.lastSyncTime),
        },
      };
    }

    case 'createMirror': {
      const wallet = getSignerWallet(provider);
      const writer = writeContract(wallet);
      const sourceId = sourceToUint8(action.source);
      const liquidityWei = ethers.parseEther(action.initialLiquidity);
      await ensureCrownAllowance(wallet, liquidityWei);
      const tx = await writer.createMirrorMarket(
        action.externalId,
        sourceId,
        action.question,
        BigInt(action.yesPrice),
        BigInt(action.endTime),
        liquidityWei
      );
      const receipt: ethers.TransactionReceipt = await tx.wait();
      const requested = findEvent(writer, receipt, 'MirrorMarketRequested');
      const created = findEvent(writer, receipt, 'MirrorMarketCreated');
      const mirrorKey =
        (created?.args?.mirrorKey as string | undefined) ??
        (await reader.getMirrorKey(sourceId, action.externalId));
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        mirrorKey,
        requestId: requested?.args?.requestId?.toString() ?? null,
      };
    }

    case 'trade': {
      const wallet = getSignerWallet(provider);
      const writer = writeContract(wallet);
      const requestedWei = ethers.parseEther(action.amount);
      const { allowedWei, capped, reason } = applyTradeLimits(
        action.walletAddress,
        requestedWei
      );

      // Slippage floor: derive minSharesOut from current pool state via static call.
      let minSharesOut = action.minSharesOut ? BigInt(action.minSharesOut) : 0n;
      if (minSharesOut === 0n) {
        try {
          const expected = await reader.tradeMirror.staticCall(
            action.mirrorKey,
            action.isYes,
            allowedWei,
            0n
          );
          if (typeof expected === 'bigint') {
            minSharesOut = computeMinSharesOut(expected, MAX_SLIPPAGE_BPS);
          }
        } catch {
          // staticCall not supported or pool empty
        }
      }

      await ensureCrownAllowance(wallet, allowedWei);
      const tx = await writer.tradeMirror(action.mirrorKey, action.isYes, allowedWei, minSharesOut);
      const receipt: ethers.TransactionReceipt = await tx.wait();
      const ev = findEvent(writer, receipt, 'MirrorTradeExecuted');
      recordSpend(action.walletAddress, allowedWei);
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        sharesOut: ev?.args?.tokensReceived?.toString() ?? null,
        amountWei: allowedWei.toString(),
        minSharesOut: minSharesOut.toString(),
        capped,
        cappedReason: reason,
        slippageBps: MAX_SLIPPAGE_BPS,
      };
    }

    case 'vrfCopyTrade': {
      const wallet = getSignerWallet(provider);
      const writer = writeContract(wallet);
      const requestedWei = BigInt(action.amount);
      const { allowedWei, capped, reason } = applyTradeLimits(
        action.userAddress,
        requestedWei
      );
      await ensureCrownAllowance(wallet, allowedWei);
      const agentIdBig = BigInt(action.agentId ?? 0);
      const tx = await writer.vrfCopyTrade(action.mirrorKey, agentIdBig, action.isYes, allowedWei);
      const receipt: ethers.TransactionReceipt = await tx.wait();
      const requested = findEvent(writer, receipt, 'VRFCopyTradeRequested');
      recordSpend(action.userAddress, allowedWei);
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        requestId: requested?.args?.requestId?.toString() ?? null,
        amountWei: allowedWei.toString(),
        capped,
        cappedReason: reason,
      };
    }

    case 'syncPrice': {
      const wallet = getSignerWallet(provider);
      const writer = writeContract(wallet);
      const tx = await writer.syncPrice(action.mirrorKey, BigInt(action.newYesPrice), action.signature);
      const receipt: ethers.TransactionReceipt = await tx.wait();
      return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
    }

    case 'resolve': {
      const wallet = getSignerWallet(provider);
      const writer = writeContract(wallet);
      const tx = await writer.resolveMirror(action.mirrorKey, action.outcome === 'yes', action.signature);
      const receipt: ethers.TransactionReceipt = await tx.wait();
      return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object') {
      throw ErrorResponses.badRequest('Body must be a JSON object with an "action" field');
    }

    const parsed = ActionSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw ErrorResponses.badRequest(
        `Invalid action payload: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
      );
    }
    const action = parsed.data;
    const isWrite = !READ_ACTIONS.has(action.action);

    // Extract walletAddress for per-wallet rate limiting on writes.
    // Different action shapes carry it under different field names.
    const wallet =
      ('userAddress' in action && typeof action.userAddress === 'string'
        ? action.userAddress
        : 'walletAddress' in action && typeof action.walletAddress === 'string'
        ? action.walletAddress
        : undefined);

    applyRateLimit(request, {
      prefix: `mirror-execute-${isWrite ? 'write' : 'read'}`,
      maxRequests: isWrite ? 5 : 60,
      windowMs: 60_000,
      walletAddress: isWrite ? wallet : undefined,
      strictWalletLimit: isWrite,
    });

    const startedAt = Date.now();
    if (isWrite) {
      const idempotencyKey = keccak256(toBytes(JSON.stringify(action)));
      cleanupIdempotencyCache();
      const cached = idempotencyCache.get(idempotencyKey);
      if (cached && Date.now() - cached.timestamp < IDEMPOTENCY_WINDOW_MS) {
        chainMetrics.incrementCounter('mirror_executes_total', 1, {
          action: action.action,
          status: 'cached',
        });
        return NextResponse.json({
          ...(cached.result as object),
          cached: true,
          message: 'Duplicate request detected, returning cached result',
        });
      }
      const result = await handleMirrorAction(action);
      idempotencyCache.set(idempotencyKey, { timestamp: Date.now(), result });
      // Writes invalidate the read caches in /api/markets/ticker and
      // /api/mirror/positions so the user sees their fresh trade immediately.
      bumpMirrorCacheVersion();
      chainMetrics.incrementCounter('mirror_executes_total', 1, {
        action: action.action,
        status: 'success',
      });
      chainMetrics.observeHistogram(
        'mirror_execute_duration_ms',
        Date.now() - startedAt,
        { action: action.action }
      );
      return NextResponse.json(result);
    }

    const result = await handleMirrorAction(action);
    chainMetrics.incrementCounter('mirror_executes_total', 1, {
      action: action.action,
      status: 'success',
    });
    return NextResponse.json(result);
  } catch (error) {
    // Bucket the failure by APIError code (which we now thread through every
    // domain-specific rejection). Fallback to "unknown" for unexpected errors.
    const errorCode =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: unknown }).code)
        : 'unknown';
    chainMetrics.incrementCounter('mirror_executes_total', 1, {
      status: 'error',
      error_code: errorCode,
    });
    return handleAPIError(error, 'API:Mirror:Execute:POST');
  }
}
