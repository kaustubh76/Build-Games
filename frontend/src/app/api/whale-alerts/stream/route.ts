import { NextRequest, NextResponse } from 'next/server';
import { whaleTrackerService } from '@/services/externalMarkets/whaleTrackerService';
import type { WhaleTrade } from '@/types/externalMarket';
import { chainMetrics } from '@/lib/metrics';

/**
 * GET /api/whale-alerts/stream
 *
 * Server-Sent Events stream of live whale alerts. The whaleTrackerService
 * already aggregates Polymarket + Kalshi WS feeds and emits via
 * `onWhaleAlert(cb)`. This route bridges that into a browser-readable SSE.
 *
 * Frontend usage:
 *   const es = new EventSource('/api/whale-alerts/stream');
 *   es.addEventListener('whale', (e) => { const trade = JSON.parse(e.data); ... });
 *
 * Notes:
 *   - 0G-native: no DB. Pure live stream off the in-memory tracker.
 *   - Heartbeats every 25s keep proxies + browsers from closing the stream.
 *   - When the client disconnects (AbortSignal fires), we unsubscribe.
 *   - Backpressure: capped at MAX_TOTAL_SUBSCRIBERS process-wide and
 *     MAX_PER_IP per source IP so a runaway client can't exhaust the pool.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEARTBEAT_MS = 25_000;
const MAX_TOTAL_SUBSCRIBERS = 1000;
const MAX_PER_IP = 4;

let totalSubscribers = 0;
const perIpSubscribers = new Map<string, number>();

function getClientIp(request: NextRequest): string {
  // Vercel sets x-forwarded-for; fall back to a synthetic key for local dev.
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local'
  );
}

function publishGauges() {
  chainMetrics.setGauge('whale_alerts_stream_subscribers', totalSubscribers);
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const ipCount = perIpSubscribers.get(ip) ?? 0;

  if (totalSubscribers >= MAX_TOTAL_SUBSCRIBERS) {
    chainMetrics.incrementCounter('whale_alerts_stream_rejections_total', 1, {
      reason: 'max_total',
    });
    return NextResponse.json(
      {
        error: 'Stream subscriber limit reached. Try again in a moment.',
        code: 'STREAM_AT_CAPACITY',
        details: { max: MAX_TOTAL_SUBSCRIBERS, current: totalSubscribers },
      },
      { status: 503, headers: { 'Retry-After': '5' } }
    );
  }
  if (ipCount >= MAX_PER_IP) {
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
  totalSubscribers += 1;
  perIpSubscribers.set(ip, ipCount + 1);
  publishGauges();
  chainMetrics.incrementCounter('whale_alerts_stream_connects_total');

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    totalSubscribers = Math.max(0, totalSubscribers - 1);
    const next = (perIpSubscribers.get(ip) ?? 1) - 1;
    if (next <= 0) perIpSubscribers.delete(ip);
    else perIpSubscribers.set(ip, next);
    publishGauges();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Initial hello so the client knows it's connected.
      controller.enqueue(
        encoder.encode(
          `event: ready\ndata: ${JSON.stringify({
            ts: Date.now(),
            threshold: whaleTrackerService.getThreshold(),
            subscribers: totalSubscribers,
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

      // Tear down on client disconnect
      request.signal.addEventListener('abort', () => {
        try {
          unsubscribe?.();
        } catch {
          // ignore
        }
        if (heartbeat) clearInterval(heartbeat);
        release();
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    },
    cancel() {
      try {
        unsubscribe?.();
      } catch {
        // ignore
      }
      if (heartbeat) clearInterval(heartbeat);
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
