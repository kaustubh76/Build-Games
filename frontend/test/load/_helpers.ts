/**
 * Shared helpers for soak / chaos tests in test/load/.
 *
 * Patterns reused from test/integration/api-stream-backpressure.test.ts:18-43:
 *  - NextRequest fabrication with x-forwarded-for + AbortController
 *  - Cleanup-on-teardown of opened streams
 *  - Microtask flushing for release-path assertions
 */

import { NextRequest } from 'next/server';

export interface OpenedStream {
  controller: AbortController;
  res: Response;
  ip: string;
}

/**
 * Build an SSE-style NextRequest with a forged client IP and AbortController.
 * Use the controller to simulate disconnect; pass `signal` so the route's
 * `request.signal.addEventListener('abort')` fires correctly.
 */
export function makeSseRequest(
  url: string,
  ip: string = '198.51.100.7'
): { req: NextRequest; controller: AbortController } {
  const controller = new AbortController();
  const req = new NextRequest(url, {
    method: 'GET',
    headers: { 'x-forwarded-for': ip },
    signal: controller.signal,
  });
  return { req, controller };
}

/**
 * Yield to the event loop so any queued microtasks (release callbacks,
 * AbortSignal listeners) run before the next assertion.
 */
export async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  // Also flush any queued promise callbacks.
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

/**
 * Poll a metric snapshot until `predicate` returns true or `timeoutMs` elapses.
 * Uses chainMetrics.snapshot() (added in Day 1.3) — falls back to a no-op
 * sleep loop if the inspector isn't available yet.
 */
export async function awaitMetric<T>(
  read: () => T,
  predicate: (value: T) => boolean,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const intervalMs = opts.intervalMs ?? 25;
  const start = Date.now();
  let last = read();
  while (!predicate(last)) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `awaitMetric timed out after ${timeoutMs}ms; last value: ${JSON.stringify(last)}`
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    last = read();
  }
  return last;
}

/**
 * Cleanly close a list of opened streams. Use in afterEach to avoid leaking
 * subscriber counters into the next test.
 */
export async function closeAllStreams(streams: OpenedStream[]): Promise<void> {
  while (streams.length) {
    const s = streams.pop()!;
    try {
      s.controller.abort();
    } catch {
      // ignore
    }
    try {
      await s.res.body?.cancel();
    } catch {
      // ignore
    }
  }
  await flushMicrotasks();
}

/**
 * Build a JSON POST request with optional headers. For idempotency-cache
 * floods + concurrent route invocation tests.
 */
export function makeJsonPost(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
