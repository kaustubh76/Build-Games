/**
 * Creator Fee Recording API Route
 * POST: Record a trade fee for a creator
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { requireSessionForAddress } from '@/lib/auth/requireSession';
import { persistReceipt, buildEnvelope } from '@/lib/storage/persistReceipt';
import { isTier1AuditOnly } from '@/lib/storage/featureFlags';

// Numeric fields stored as strings (Prisma columns are String). We bound
// them at validation time so a malicious caller can't pass `1e30` or a
// negative — both would corrupt the running totals on the creator row.
// Cap at 1B CRwN per record (sanity, well above any real trade) so an
// attacker who got past the SIWE guard for their own address still can't
// blow the balance up to nonsense.
const MAX_PER_RECORD = 1_000_000_000;
const PostBodySchema = z.object({
  marketId: z.union([z.string(), z.number().int()]),
  creatorAddress: z.string().min(1),
  tradeVolume: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === 'number' ? v : parseFloat(v)))
    .refine((n) => Number.isFinite(n) && n > 0 && n <= MAX_PER_RECORD, {
      message: `tradeVolume must be a finite positive number ≤ ${MAX_PER_RECORD}`,
    }),
  feeAmount: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) =>
      v === undefined ? undefined : typeof v === 'number' ? v : parseFloat(v)
    )
    .refine((n) => n === undefined || (Number.isFinite(n) && n >= 0 && n <= MAX_PER_RECORD), {
      message: `feeAmount must be a finite non-negative number ≤ ${MAX_PER_RECORD}`,
    }),
  traderAddress: z.string().optional().nullable(),
  txHash: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting (30 fee recordings per minute)
    await applyRateLimit(request, {
      prefix: 'creator-record-fee-post',
      maxRequests: 30,
      windowMs: 60000,
    });

    const raw = await request.json().catch(() => null);
    const parsed = PostBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ErrorResponses.badRequest(
        `Invalid body: ${parsed.error.issues.map((i) => i.message).join('; ')}`
      );
    }
    const { marketId, creatorAddress, tradeVolume: volume, feeAmount, traderAddress, txHash } = parsed.data;

    // SIWE guard: only the creator wallet may credit fees to itself.
    requireSessionForAddress(request, creatorAddress);

    // Calculate fee (2% of trade volume by default)
    const calculatedFee = feeAmount ?? volume * 0.02;

    // Atomic-ish update: read + update wrapped in a single transaction so
    // two concurrent record-fee calls for the same creator can't both
    // observe the same baseline and lose one of the increments. Note that
    // the underlying columns are Strings (Prisma can't do `{ increment }`
    // on String columns), so we read-then-write inside the txn — Postgres
    // gives us repeatable-read inside the transaction, which closes the
    // window for the common race. A schema migration to Decimal columns
    // is the proper long-term fix; out of scope this pass.
    const updatedCreator = await prisma.$transaction(async (tx) => {
      const existing = await tx.creator.upsert({
        where: { address: creatorAddress },
        create: {
          address: creatorAddress,
          type: 'market',
          tier: 'bronze',
          totalVolumeGenerated: '0',
          totalFeesEarned: '0',
          pendingRewards: '0',
          totalClaimed: '0',
          marketsCreated: 1,
          warriorsCreated: 0,
          agentsOperated: 0,
        },
        update: {},
      });
      return tx.creator.update({
        where: { address: creatorAddress },
        data: {
          totalVolumeGenerated: (parseFloat(existing.totalVolumeGenerated) + volume).toString(),
          totalFeesEarned: (parseFloat(existing.totalFeesEarned) + calculatedFee).toString(),
          pendingRewards: (parseFloat(existing.pendingRewards) + calculatedFee).toString(),
          lastActiveAt: new Date(),
        },
      });
    });

    // Record the fee entry — 0G receipt is canonical; Prisma row is dual-write
    // during rollout (skipped once ENABLE_0G_AUDIT_LOGS=1).
    const feeData = {
      creatorAddress,
      marketId: marketId.toString(),
      tradeVolume: volume.toString(),
      feeAmount: calculatedFee.toString(),
      traderAddress: traderAddress || null,
      txHash: txHash || null,
      source: 'market_trade',
    };
    const receipt = await persistReceipt(
      buildEnvelope({ type: 'creator-fee', payload: feeData }),
      `creator-fee-${creatorAddress}-${Date.now()}.json`
    );
    let feeEntryId: string | null = null;
    if (!isTier1AuditOnly()) {
      const feeEntry = await prisma.creatorFeeEntry.create({ data: feeData });
      feeEntryId = feeEntry.id;
    }

    // Update market revenue if it's a user-created market
    if (marketId.toString().startsWith('user_') || typeof marketId === 'number') {
      const numericId = typeof marketId === 'number' ? marketId : parseInt(marketId.replace('user_', ''));
      if (!isNaN(numericId)) {
        try {
          await prisma.userCreatedMarket.update({
            where: { id: numericId },
            data: {
              totalVolume: {
                increment: volume,
              },
              creatorRevenue: {
                increment: calculatedFee,
              },
            },
          });
        } catch (e) {
          // Market might not exist in user created markets table
          console.log('[API] Market not in user created table:', numericId);
        }
      }
    }

    // Check and update creator tier based on total volume
    const newTier = calculateTier(parseFloat(updatedCreator.totalVolumeGenerated));
    if (newTier !== updatedCreator.tier) {
      await prisma.creator.update({
        where: { address: creatorAddress },
        data: { tier: newTier },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        feeRecorded: calculatedFee,
        totalPending: updatedCreator.pendingRewards,
        totalEarned: updatedCreator.totalFeesEarned,
        tier: newTier || updatedCreator.tier,
        feeEntryId,
        receipt: receipt ? { rootHash: receipt.rootHash, txHash: receipt.txHash } : null,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Creator:RecordFee:POST');
  }
}

function calculateTier(totalVolume: number): string {
  // Tier thresholds in CRwN
  if (totalVolume >= 1000000) return 'diamond';
  if (totalVolume >= 100000) return 'gold';
  if (totalVolume >= 10000) return 'silver';
  return 'bronze';
}

/**
 * GET: Get fee history for a creator
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    await applyRateLimit(request, {
      prefix: 'creator-record-fee-get',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
    const creatorAddress = searchParams.get('creator');
    // Clamp the requested limit so a single request can't pull millions of
    // rows and OOM the function. Default 50, max 100, treats NaN as default.
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, 100)
      : 50;

    if (!creatorAddress) {
      throw ErrorResponses.badRequest('Missing creator address');
    }

    const feeEntries = await prisma.creatorFeeEntry.findMany({
      where: { creatorAddress },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const creator = await prisma.creator.findUnique({
      where: { address: creatorAddress },
    });

    return NextResponse.json({
      success: true,
      data: {
        feeHistory: feeEntries.map((entry) => ({
          id: entry.id,
          marketId: entry.marketId,
          tradeVolume: entry.tradeVolume,
          feeAmount: entry.feeAmount,
          source: entry.source,
          timestamp: entry.createdAt.getTime(),
        })),
        summary: creator
          ? {
              totalVolumeGenerated: creator.totalVolumeGenerated,
              totalFeesEarned: creator.totalFeesEarned,
              pendingRewards: creator.pendingRewards,
              totalClaimed: creator.totalClaimed,
              tier: creator.tier,
            }
          : null,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Creator:RecordFee:GET');
  }
}
