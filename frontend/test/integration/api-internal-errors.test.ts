/**
 * Integration tests for /api/internal/errors. The endpoint is the production
 * sink for client-side error reports; we want to confirm it accepts the
 * exact shape errorReporter.ts posts, rejects garbage, and rate-limits.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Reset rate-limit state between tests so the 60/min cap doesn't bleed across.
beforeEach(async () => {
  vi.resetModules();
  const rl = await import('@/lib/api/rateLimit');
  rl.__resetRateLimitState();
});

function postBody(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://test/api/internal/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/internal/errors', () => {
  it('accepts a valid error report and returns 204', async () => {
    const { POST } = await import('@/app/api/internal/errors/route');
    const res = await POST(
      postBody({
        message: 'something broke',
        name: 'TypeError',
        stack: 'Error\n  at Foo (file.ts:12:3)',
        context: 'render',
        errorId: 'err_test_abc',
        meta: { walletAddress: '0xabc', route: '/portfolio' },
      })
    );
    expect(res.status).toBe(204);
  });

  it('returns 400 on a body that does not match the shape', async () => {
    const { POST } = await import('@/app/api/internal/errors/route');
    const res = await POST(postBody({ totally: 'wrong' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on an empty body', async () => {
    const { POST } = await import('@/app/api/internal/errors/route');
    const res = await POST(postBody(null));
    expect(res.status).toBe(400);
  });

  it('rejects oversized message strings (max 2000 chars)', async () => {
    const { POST } = await import('@/app/api/internal/errors/route');
    const big = 'x'.repeat(2001);
    const res = await POST(postBody({ message: big, context: 'render' }));
    expect(res.status).toBe(400);
  });

  it('rate-limits by IP after 60 requests in 60s', async () => {
    const { POST } = await import('@/app/api/internal/errors/route');
    let lastStatus = 204;
    for (let i = 0; i < 65; i++) {
      const res = await POST(
        postBody(
          { message: `err-${i}`, context: 'render' },
          { 'x-forwarded-for': '1.2.3.4' }
        )
      );
      lastStatus = res.status;
    }
    // Final calls should be rate-limited (429)
    expect(lastStatus).toBe(429);
  });

  it('accepts the exact shape errorReporter.ts posts', async () => {
    // Mirror the body construction in lib/errorReporter.ts
    const error = new Error('synthetic');
    const payload = { context: 'render', errorId: 'err_x_y' };
    const reporterBody = {
      message: error.message,
      name: error.name,
      stack: error.stack,
      ...payload,
    };
    const { POST } = await import('@/app/api/internal/errors/route');
    const res = await POST(postBody(reporterBody));
    expect(res.status).toBe(204);
  });
});
