/**
 * Unit tests for requireCronSecret — the single gate in front of every
 * privileged-operator route (settle, oracle/resolve, the cron handlers).
 * These tests pin the contract so future refactors of the helper don't
 * silently re-open the hole the helper was added to close.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/auth/requireCronSecret';

const originalEnv = {
  CRON_SECRET: process.env.CRON_SECRET,
  NODE_ENV: process.env.NODE_ENV,
};

beforeEach(() => {
  delete process.env.CRON_SECRET;
  (process.env as Record<string, string>).NODE_ENV = 'test';
});

afterEach(() => {
  if (originalEnv.CRON_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalEnv.CRON_SECRET;
  (process.env as Record<string, string>).NODE_ENV = originalEnv.NODE_ENV ?? 'test';
});

function reqWith(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://example.test/cron', { headers });
}

describe('requireCronSecret', () => {
  it('rejects with 401 when CRON_SECRET is set but the bearer is missing', () => {
    process.env.CRON_SECRET = 'shh';
    expect(() => requireCronSecret(reqWith())).toThrow();
  });

  it('rejects with 401 when CRON_SECRET is set and the bearer is wrong', () => {
    process.env.CRON_SECRET = 'shh';
    expect(() =>
      requireCronSecret(reqWith({ authorization: 'Bearer not-shh' }))
    ).toThrow();
  });

  it('passes when the bearer matches CRON_SECRET exactly', () => {
    process.env.CRON_SECRET = 'shh';
    expect(() =>
      requireCronSecret(reqWith({ authorization: 'Bearer shh' }))
    ).not.toThrow();
  });

  it('rejects with 503 in production when CRON_SECRET is unset (deployment misconfig)', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    delete process.env.CRON_SECRET;
    expect(() => requireCronSecret(reqWith())).toThrow();
  });

  it('passes through in dev/test when CRON_SECRET is unset (local debugging)', () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    delete process.env.CRON_SECRET;
    expect(() => requireCronSecret(reqWith())).not.toThrow();
  });

  it('does NOT accept a different scheme (Basic, ApiKey, etc.) as a match', () => {
    process.env.CRON_SECRET = 'shh';
    expect(() =>
      requireCronSecret(reqWith({ authorization: 'Basic shh' }))
    ).toThrow();
    expect(() =>
      requireCronSecret(reqWith({ authorization: 'shh' }))
    ).toThrow();
  });
});
