import { NextRequest, NextResponse } from 'next/server';
import { parseAbiItem } from 'viem';
import { AVALANCHE_CONTRACTS } from '@/lib/apiConfig';
import { getResilientPublicClient } from '@/lib/viemClient';
import { chainMetrics } from '@/lib/metrics';
import {
  MAX_PER_IP,
  MAX_TOTAL_SUBSCRIBERS,
  getTotalSubscribers,
  tryReserveSlot,
  releaseSlot,
} from '@/lib/streams/tickerState';

/**
 * GET /api/markets/ticker/stream
 *
 * SSE stream of `MirrorTradeExecuted` events from the Avalanche
 * `ExternalMarketMirror` contract. Counters live in `lib/streams/tickerState`
 * so soak tests can inspect/reset state.
 *
 * Bug #2 fix: `start()` is wrapped in try/finally — if it throws (watcher
 * setup failure, controller error during initial enqueue), `release()` runs
 * unconditionally. The `released` guard makes multi-call safe.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEARTBEAT_MS = 25_000;

const MIRROR_TRADE_EVENT = parseAbiItem(
  'event MirrorTradeExecuted(bytes32 indexed mirrorKey, address indexed trader, bool isYes, uint256 amount, uint256 tokensReceived)'
);

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local'
  );
}

function publishGauges() {
  chainMetrics.setGauge('ticker_stream_subscribers', getTotalSubscribers());
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  const reserved = tryReserveSlot(ip);
  if (!reserved.ok) {
    chainMetrics.incrementCounter('ticker_stream_rejections_total', 1, {
      reason: reserved.reason,
    });
    if (reserved.reason === 'max_total') {
      return NextResponse.json(
        {
          error: 'Ticker stream subscriber limit reached.',
          code: 'STREAM_AT_CAPACITY',
          details: { max: MAX_TOTAL_SUBSCRIBERS, current: getTotalSubscribers() },
        },
        { status: 503, headers: { 'Retry-After': '5' } }
      );
    }
    return NextResponse.json(
      {
        error: `Too many ticker stream connections from this IP (max ${MAX_PER_IP}).`,
        code: 'STREAM_PER_IP_CAP',
        details: { ip, max: MAX_PER_IP },
      },
      { status: 429, headers: { 'Retry-After': '5' } }
    );
  }
  publishGauges();
  chainMetrics.incrementCounter('ticker_stream_connects_total');

  // Use the resilient client (primary → fallback) so a rate-limited primary
  // doesn't kill the ticker stream. Also makes the route easy to mock in
  // soak tests by mocking @/lib/viemClient.
  const client = getResilientPublicClient();
  const mirrorAddress = AVALANCHE_CONTRACTS.externalMarketMirror as `0x${string}`;

  const encoder = new TextEncoder();
  let unwatch: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    if (heartbeat) clearInterval(heartbeat);
    try {
      unwatch?.();
    } catch {
      // ignore
    }
    releaseSlot(ip);
    publishGauges();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      try {
        controller.enqueue(
          encoder.encode(
            `event: ready\ndata: ${JSON.stringify({
              ts: Date.now(),
              subscribers: getTotalSubscribers(),
            })}\n\n`
          )
        );

        unwatch = client.watchEvent({
          address: mirrorAddress,
          event: MIRROR_TRADE_EVENT,
          onLogs: (logs) => {
            for (const log of logs) {
              try {
                const args =
                  (log as unknown as {
                    args?: {
                      mirrorKey?: string;
                      trader?: string;
                      isYes?: boolean;
                      amount?: bigint;
                      tokensReceived?: bigint;
                    };
                  }).args ?? {};
                const payload = {
                  mirrorKey: args.mirrorKey ?? '0x',
                  trader: args.trader ?? '0x',
                  isYes: !!args.isYes,
                  amount: (args.amount ?? 0n).toString(),
                  tokensReceived: (args.tokensReceived ?? 0n).toString(),
                  blockNumber: Number(log.blockNumber ?? 0n),
                  txHash: log.transactionHash,
                };
                controller.enqueue(
                  encoder.encode(`event: tick\ndata: ${JSON.stringify(payload)}\n\n`)
                );
                chainMetrics.incrementCounter('ticker_stream_emits_total');
              } catch {
                // ignore malformed logs
              }
            }
          },
          onError: (err) => {
            try {
              controller.enqueue(
                encoder.encode(
                  `event: error\ndata: ${JSON.stringify({ message: err.message ?? 'watch failed' })}\n\n`
                )
              );
            } catch {
              // ignore
            }
          },
        });

        heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
          } catch {
            // ignore
          }
        }, HEARTBEAT_MS);

        request.signal.addEventListener('abort', () => {
          release();
          try {
            controller.close();
          } catch {
            // ignore
          }
        });
      } catch (err) {
        // Bug #2 fix: catch any failure during start() so the slot is released.
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
