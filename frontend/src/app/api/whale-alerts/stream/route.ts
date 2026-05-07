import { NextRequest, NextResponse } from 'next/server';
import { whaleTrackerService } from '@/services/externalMarkets/whaleTrackerService';
import type { WhaleTrade } from '@/types/externalMarket';
import { chainMetrics } from '@/lib/metrics';
import {
  MAX_PER_IP,
  MAX_TOTAL_SUBSCRIBERS,
  getTotalSubscribers,
  getIpCount,
  tryReserveSlot,
  releaseSlot,
} from '@/lib/streams/whaleAlertsState';

/**
 * GET /api/whale-alerts/stream
 *
 * Server-Sent Events stream of live whale alerts. Counters + per-IP cap live
 * in `lib/streams/whaleAlertsState` so soak tests can inspect/reset state
 * without crossing the Next 15 route-export rules.
 *
 * Backpressure: capped at MAX_TOTAL_SUBSCRIBERS process-wide and MAX_PER_IP
 * per source IP. Counters released on (a) `request.signal.abort`, (b)
 * `cancel()` from the consumer, AND (c) controller error during `start()` —
 * the third path is the bug #2 fix from the soak workstream.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEARTBEAT_MS = 25_000;

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local'
  );
}

function publishGauges() {
  chainMetrics.setGauge('whale_alerts_stream_subscribers', getTotalSubscribers());
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  // Backpressure check before reserving the slot
  if (getTotalSubscribers() >= MAX_TOTAL_SUBSCRIBERS) {
    chainMetrics.incrementCounter('whale_alerts_stream_rejections_total', 1, {
      reason: 'max_total',
    });
    return NextResponse.json(
      {
        error: 'Stream subscriber limit reached. Try again in a moment.',
        code: 'STREAM_AT_CAPACITY',
        details: { max: MAX_TOTAL_SUBSCRIBERS, current: getTotalSubscribers() },
      },
      { status: 503, headers: { 'Retry-After': '5' } }
    );
  }
  if (getIpCount(ip) >= MAX_PER_IP) {
    chainMetrics.incrementCounter('whale_alerts_stream_rejections_total', 1, {
      reason: 'max_per_ip',
    });
    return NextResponse.json(
      {
        error: `Too many concurrent stream connections from this IP (max ${MAX_PER_IP}).`,
        code: 'STREAM_PER_IP_CAP',
        details: { ip, max: MAX_PER_IP },
      },
      { status: 429, headers: { 'Retry-After': '5' } }
    );
  }

  // Reserve a slot up-front so we don't race with concurrent connects.
  const reserved = tryReserveSlot(ip);
  if (!reserved.ok) {
    // Race: another request just took the last slot. Treat as max_total.
    chainMetrics.incrementCounter('whale_alerts_stream_rejections_total', 1, {
      reason: reserved.reason,
    });
    return NextResponse.json(
      {
        error: 'Stream subscriber limit reached.',
        code: reserved.reason === 'max_per_ip' ? 'STREAM_PER_IP_CAP' : 'STREAM_AT_CAPACITY',
      },
      {
        status: reserved.reason === 'max_per_ip' ? 429 : 503,
        headers: { 'Retry-After': '5' },
      }
    );
  }
  publishGauges();
  chainMetrics.incrementCounter('whale_alerts_stream_connects_total');

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    if (heartbeat) clearInterval(heartbeat);
    try {
      unsubscribe?.();
    } catch {
      // ignore
    }
    releaseSlot(ip);
    publishGauges();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      try {
        // Initial hello so the client knows it's connected.
        controller.enqueue(
          encoder.encode(
            `event: ready\ndata: ${JSON.stringify({
              ts: Date.now(),
              threshold: whaleTrackerService.getThreshold(),
              subscribers: getTotalSubscribers(),
            })}\n\n`
          )
        );

        const onAlert = (trade: WhaleTrade) => {
          try {
            controller.enqueue(
              encoder.encode(`event: whale\ndata: ${JSON.stringify(trade)}\n\n`)
            );
            chainMetrics.incrementCounter('whale_alerts_stream_emits_total');
          } catch {
            // controller may have closed (client gone) — silent
          }
        };

        unsubscribe = whaleTrackerService.onWhaleAlert(onAlert);

        heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
          } catch {
            // ignore
          }
        }, HEARTBEAT_MS);

        // Tear down on client disconnect.
        request.signal.addEventListener('abort', () => {
          release();
          try {
            controller.close();
          } catch {
            // ignore
          }
        });
      } catch (err) {
        // Bug #2 fix: if `start()` throws (e.g. whaleTrackerService.onWhaleAlert
        // dies, or controller.enqueue throws because the consumer's already
        // gone), neither `abort` nor `cancel` will fire to release the slot.
        // Catch + release here. The `released` guard makes this safe even if
        // abort/cancel fires later.
        release();
        try {
          controller.error(err instanceof Error ? err : new Error(String(err)));
        } catch {
          // ignore
        }
      }
    },
    cancel() {
      release();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
