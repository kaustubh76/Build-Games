/**
 * Unit tests for the production-always-enforce property of requireSession.
 *
 * The single most load-bearing security property of this module: a
 * production deployment NEVER opens the warn-mode bypass. The test pins
 * the contract so a future refactor of `isEnforceMode` can't silently
 * re-introduce the hole.
 *
 * Note: full end-to-end auth tests live in test/integration/api-auth-routes;
 * this file is a focused unit test of just the enforcement decision.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { requireSession, requireSessionForAddress } from '@/lib/auth/requireSession';

const originalEnv = {
  AUTH_ENFORCE: process.env.AUTH_ENFORCE,
  NODE_ENV: process.env.NODE_ENV,
};

beforeEach(() => {
  delete process.env.AUTH_ENFORCE;
  (process.env as Record<string, string>).NODE_ENV = 'test';
});

afterEach(() => {
  if (originalEnv.AUTH_ENFORCE === undefined) delete process.env.AUTH_ENFORCE;
  else process.env.AUTH_ENFORCE = originalEnv.AUTH_ENFORCE;
  (process.env as Record<string, string>).NODE_ENV = originalEnv.NODE_ENV ?? 'test';
});

function reqNoCookie(): NextRequest {
  return new NextRequest('http://example.test/api/foo');
}

describe('requireSession — production hard-enforces regardless of AUTH_ENFORCE', () => {
  it('production + no AUTH_ENFORCE + no session → throws 401', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    delete process.env.AUTH_ENFORCE;
    expect(() => requireSession(reqNoCookie())).toThrow();
  });

  it('production + AUTH_ENFORCE=0 + no session → throws (still enforced)', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.AUTH_ENFORCE = '0';
    expect(() => requireSession(reqNoCookie())).toThrow();
  });

  it('non-prod + no AUTH_ENFORCE + no session → returns synthetic session (warn mode)', () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    delete process.env.AUTH_ENFORCE;
    const s = requireSession(reqNoCookie());
    expect(s.jti).toBe('warn-mode');
  });

  it('non-prod + AUTH_ENFORCE=1 + no session → throws (explicit opt-in)', () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    process.env.AUTH_ENFORCE = '1';
    expect(() => requireSession(reqNoCookie())).toThrow();
  });
});

describe('requireSessionForAddress — same enforcement matrix', () => {
  it('production + no session → throws even with AUTH_ENFORCE unset', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    delete process.env.AUTH_ENFORCE;
    expect(() => requireSessionForAddress(reqNoCookie(), '0xabc')).toThrow();
  });

  it('production + missing claimed address → throws 400', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    expect(() => requireSessionForAddress(reqNoCookie(), null)).toThrow();
  });

  it('non-prod + no session → returns synthetic session marker (warn mode)', () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    const s = requireSessionForAddress(reqNoCookie(), '0xabc');
    expect(s.jti).toBe('warn-mode');
    expect(s.address).toBe('0xabc');
  });
});
