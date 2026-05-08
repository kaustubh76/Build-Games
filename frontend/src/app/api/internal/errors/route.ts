import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { log } from '@/lib/api/logger';

/**
 * POST /api/internal/errors
 *
 * Best-effort sink for client-side error reports posted by `lib/errorReporter`.
 * The endpoint:
 *   - Validates the body shape (Zod) — bad-shape requests are dropped with 400
 *     so a misbehaving client can't pollute the logs with garbage.
 *   - Rate-limits by IP (60/min) — a runaway loop in one user's browser
 *     can't flood the logger.
 *   - Forwards to the structured logger as a single 'error' entry per call,
 *     keyed by the client's errorId so it correlates with the user-visible
 *     fallback in <ErrorBoundary>.
 *   - Returns 204 No Content. Client is fire-and-forget; we never need to
 *     send a body.
 *
 * Persistence: none today. Vercel's function-log retention is the storage.
 * When Sentry / Datadog lands, this endpoint can be removed entirely
 * (errorReporter.ts will captureException directly). Until then, this gives
 * us one searchable place for client crashes.
 */

const BodySchema = z.object({
  message: z.string().max(2000),
  name: z.string().max(200).optional(),
  stack: z.string().max(20_000).optional(),
  context: z.string().max(200),
  errorId: z.string().max(100).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    applyRateLimit(request, {
      prefix: 'internal-errors',
      maxRequests: 60,
      windowMs: 60_000,
    });

    const raw = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      // Don't surface field details — keep client-side reporting trivial.
      throw ErrorResponses.badRequest('Invalid error report shape');
    }

    const { message, name, stack, context, errorId, meta } = parsed.data;
    log.error('[client-error]', new Error(message), {
      context,
      errorId: errorId ?? null,
      errorName: name ?? null,
      stack: stack ?? null,
      meta: meta ?? null,
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    });

    // 204 No Content — client doesn't care about the response.
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleAPIError(error, 'API:Internal:Errors:POST');
  }
}
