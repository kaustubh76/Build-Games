import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { restoreFromSnapshot } from '@/lib/telegram/subscriptions';

/**
 * POST /api/whale-alerts/subscribe-telegram/restore
 *
 * Operator-only: rehydrate the in-process Telegram subscription registry from
 * a known 0G snapshot rootHash. Used after cold-start to recover subscribers
 * without making users re-subscribe.
 *
 * Auth: same Bearer token used by other cron routes (CRON_SECRET).
 *
 * Body:
 *   { rootHash: string }   — the 0G blob to load (with or without 0g:// prefix)
 *
 * Response:
 *   200 { restored, skippedExisting, ts, rootHash }
 *   400 invalid body
 *   401 missing/wrong CRON_SECRET
 *   503 STORAGE_UNAVAILABLE if 0G is unconfigured or download fails
 */

const BodySchema = z.object({
  rootHash: z.string().min(8).max(256),
});

export async function POST(request: NextRequest) {
  try {
    await applyRateLimit(request, {
      prefix: 'telegram-restore',
      maxRequests: 5,
      windowMs: 60_000,
    });

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      throw ErrorResponses.serviceUnavailable('CRON_SECRET not configured');
    }
    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      throw ErrorResponses.unauthorized('Bearer token required');
    }

    const raw = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ErrorResponses.badRequest(
        `Invalid body: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
      );
    }

    const result = await restoreFromSnapshot(parsed.data.rootHash);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error) {
      const m = error.message;
      // 0G download / config / not-found failures → 503 STORAGE_UNAVAILABLE
      if (
        /not configured|0G download|0G upload|0G Storage|file not found|timed out|download error/i.test(
          m
        )
      ) {
        return NextResponse.json(
          { error: m, code: 'STORAGE_UNAVAILABLE' },
          { status: 503 }
        );
      }
      // JSON parse / shape validation failures → 400 INVALID_SNAPSHOT
      if (/Snapshot|valid JSON/i.test(m)) {
        return NextResponse.json(
          { error: m, code: 'INVALID_SNAPSHOT' },
          { status: 400 }
        );
      }
    }
    // 0G "JsonRpcError: file not found" doesn't always carry a message —
    // some errors expose .name or .data instead. Inspect more loosely.
    const errAny = error as { name?: string; message?: string; data?: unknown };
    const combined = `${errAny.name ?? ''} ${errAny.message ?? ''}`;
    if (/JsonRpcError|file not found/i.test(combined)) {
      return NextResponse.json(
        { error: errAny.message ?? 'Storage download failed', code: 'STORAGE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    return handleAPIError(error, 'API:Telegram:Restore:POST');
  }
}
