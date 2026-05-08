// @vitest-environment happy-dom
/**
 * errorReporter unit tests. Covers:
 *  - dev path: console.error called, no fetch
 *  - prod path: console.error + fire-and-forget fetch to /api/internal/errors
 *  - serialised body matches what the endpoint expects
 *  - never throws even when fetch is unavailable / rejects
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportError } from '@/lib/errorReporter';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
let consoleSpy: ReturnType<typeof vi.spyOn>;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchSpy = vi.fn().mockResolvedValue({ ok: true });
  // happy-dom provides fetch; we replace it for assertions.
  (globalThis as { fetch?: typeof fetch }).fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(() => {
  consoleSpy.mockRestore();
  // Restore NODE_ENV (vitest typing requires the cast)
  (process.env as Record<string, string | undefined>).NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('reportError', () => {
  it('logs to console regardless of environment', () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    reportError(new Error('dev test'), { context: 'render' });
    expect(consoleSpy).toHaveBeenCalled();
    const [tag, payload] = consoleSpy.mock.calls[0];
    expect(String(tag)).toContain('[errorReporter:render]');
    expect(payload).toMatchObject({
      message: 'dev test',
      name: 'Error',
    });
  });

  it('does NOT POST in development', () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    reportError(new Error('dev'), { context: 'render' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs to /api/internal/errors in production', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    reportError(new Error('prod'), { context: 'submit', errorId: 'err_xyz' });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/internal/errors');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('POST body matches the /api/internal/errors Zod schema', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    const err = new Error('synthetic');
    reportError(err, {
      context: 'render',
      errorId: 'err_abc_123',
      meta: { walletAddress: '0xabc', route: '/portfolio' },
    });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      message: 'synthetic',
      name: 'Error',
      context: 'render',
      errorId: 'err_abc_123',
      meta: { walletAddress: '0xabc', route: '/portfolio' },
    });
    // Stack should be present when the Error has one (it does — V8 captures it).
    expect(typeof body.stack).toBe('string');
  });

  it('uses keepalive on the fetch (so reports survive page unload)', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    reportError(new Error('x'), { context: 'unmount' });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.keepalive).toBe(true);
  });

  it('never throws even if fetch rejects', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    // Should NOT throw — fire-and-forget.
    expect(() =>
      reportError(new Error('boom'), { context: 'render' })
    ).not.toThrow();
  });

  it('never throws when fetch is unavailable', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    delete (globalThis as { fetch?: typeof fetch }).fetch;
    expect(() =>
      reportError(new Error('boom'), { context: 'render' })
    ).not.toThrow();
  });

  it('handles errors with a missing stack (rare but possible)', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    const err = new Error('no-stack');
    delete (err as { stack?: string }).stack;
    expect(() =>
      reportError(err, { context: 'render' })
    ).not.toThrow();
    expect(fetchSpy).toHaveBeenCalled();
  });
});
