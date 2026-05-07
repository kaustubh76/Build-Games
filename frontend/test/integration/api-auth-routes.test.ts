/**
 * Integration tests for the SIWE auth flow.
 *
 *  /api/auth/nonce    — issues a single-use nonce
 *  /api/auth/verify   — verifies an EIP-4361 message + signature, mints cookie
 *  /api/auth/session  — returns 200/401 based on cookie
 *  /api/auth/logout   — revokes session + clears cookie
 *
 * Plus end-to-end coverage of `requireSessionForAddress` against one of the
 * high-risk routes (whale-alerts/follow), in both warn-mode (default) and
 * enforce-mode (AUTH_ENFORCE=1).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { formatSiweMessage } from '@/lib/auth/siwe';

const TEST_PRIVKEY = ('0x' + 'a'.repeat(64)) as `0x${string}`;
const TEST_ACCOUNT = privateKeyToAccount(TEST_PRIVKEY);
const TEST_ADDRESS = TEST_ACCOUNT.address;

const ORIGINAL_AUTH_ENFORCE = process.env.AUTH_ENFORCE;

beforeEach(async () => {
  vi.resetModules();
  // Reset in-process auth state.
  const nonceMod = await import('@/lib/auth/nonceStore');
  nonceMod.__resetNonceStore();
  const sessionMod = await import('@/lib/auth/session');
  sessionMod.__resetSessionState();
  delete process.env.AUTH_ENFORCE;
});

afterEach(() => {
  if (ORIGINAL_AUTH_ENFORCE === undefined) delete process.env.AUTH_ENFORCE;
  else process.env.AUTH_ENFORCE = ORIGINAL_AUTH_ENFORCE;
});

async function getNonce(): Promise<string> {
  const { GET } = await import('@/app/api/auth/nonce/route');
  const res = await GET(new NextRequest('http://test/api/auth/nonce'));
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.nonce as string;
}

async function buildSignedMessage(nonce: string, opts: { domain?: string; chainId?: number; address?: `0x${string}` } = {}) {
  const message = formatSiweMessage({
    domain: opts.domain ?? 'test',
    address: (opts.address ?? TEST_ADDRESS) as `0x${string}`,
    statement: 'Sign in to WarriorsAI-rena.',
    uri: 'http://test',
    version: '1',
    chainId: opts.chainId ?? 43113,
    nonce,
    issuedAt: new Date().toISOString(),
    expirationTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  const signature = await TEST_ACCOUNT.signMessage({ message });
  return { message, signature };
}

function makeVerifyRequest(body: unknown, host: string = 'test'): NextRequest {
  return new NextRequest('http://test/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', host },
    body: JSON.stringify(body),
  });
}

function extractSessionCookie(res: Response): string | null {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(/wai_session=([^;]+)/);
  return match ? match[1] : null;
}

describe('/api/auth/nonce', () => {
  it('issues a 64-hex-char nonce with future expiry', async () => {
    const { GET } = await import('@/app/api/auth/nonce/route');
    const res = await GET(new NextRequest('http://test/api/auth/nonce'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe('/api/auth/verify', () => {
  it('mints a session cookie on a valid SIWE handshake', async () => {
    const nonce = await getNonce();
    const { message, signature } = await buildSignedMessage(nonce);
    const { POST } = await import('@/app/api/auth/verify/route');
    const res = await POST(makeVerifyRequest({ message, signature }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.address.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
    expect(extractSessionCookie(res)).toBeTruthy();
  });

  it('rejects when the nonce is unknown / never issued', async () => {
    const { message, signature } = await buildSignedMessage('z'.repeat(64));
    const { POST } = await import('@/app/api/auth/verify/route');
    const res = await POST(makeVerifyRequest({ message, signature }));
    expect(res.status).toBe(401);
  });

  it('rejects on second use of the same nonce (single-use)', async () => {
    const nonce = await getNonce();
    const { message, signature } = await buildSignedMessage(nonce);
    const { POST } = await import('@/app/api/auth/verify/route');
    const res1 = await POST(makeVerifyRequest({ message, signature }));
    expect(res1.status).toBe(200);
    // Re-import for fresh request, same nonce — should be consumed already.
    const res2 = await POST(makeVerifyRequest({ message, signature }));
    expect(res2.status).toBe(401);
  });

  it('rejects on chainId mismatch (Fuji sig presented as mainnet)', async () => {
    const nonce = await getNonce();
    // Sign for chain 43114 even though server expects whatever NEXT_PUBLIC_CHAIN_ID is.
    const { message, signature } = await buildSignedMessage(nonce, { chainId: 99999 });
    const { POST } = await import('@/app/api/auth/verify/route');
    const res = await POST(makeVerifyRequest({ message, signature }));
    expect(res.status).toBe(401);
  });

  it('rejects on signature from a different key', async () => {
    const nonce = await getNonce();
    const otherKey = ('0x' + 'b'.repeat(64)) as `0x${string}`;
    const otherAccount = privateKeyToAccount(otherKey);
    const message = formatSiweMessage({
      domain: 'test',
      address: TEST_ADDRESS as `0x${string}`,  // claim TEST_ADDRESS
      statement: 'Sign in.',
      uri: 'http://test',
      version: '1',
      chainId: 43113,
      nonce,
      issuedAt: new Date().toISOString(),
    });
    // But sign with otherAccount → mismatch.
    const signature = await otherAccount.signMessage({ message });
    const { POST } = await import('@/app/api/auth/verify/route');
    const res = await POST(makeVerifyRequest({ message, signature }));
    expect(res.status).toBe(401);
  });
});

describe('/api/auth/session + /api/auth/logout', () => {
  async function signInAndGetCookie(): Promise<string> {
    const nonce = await getNonce();
    const { message, signature } = await buildSignedMessage(nonce);
    const { POST } = await import('@/app/api/auth/verify/route');
    const res = await POST(makeVerifyRequest({ message, signature }));
    const cookie = extractSessionCookie(res);
    expect(cookie).toBeTruthy();
    return cookie!;
  }

  it('GET /session returns 200 with a valid cookie', async () => {
    const token = await signInAndGetCookie();
    const { GET } = await import('@/app/api/auth/session/route');
    const req = new NextRequest('http://test/api/auth/session', {
      headers: { cookie: `wai_session=${token}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.address.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
  });

  it('GET /session returns 401 with no cookie', async () => {
    const { GET } = await import('@/app/api/auth/session/route');
    const res = await GET(new NextRequest('http://test/api/auth/session'));
    expect(res.status).toBe(401);
  });

  it('POST /logout revokes the session cookie', async () => {
    const token = await signInAndGetCookie();

    const { POST: logout } = await import('@/app/api/auth/logout/route');
    const logoutRes = await logout(
      new NextRequest('http://test/api/auth/logout', {
        method: 'POST',
        headers: { cookie: `wai_session=${token}` },
      })
    );
    expect(logoutRes.status).toBe(200);

    // The same token should now fail /session.
    const { GET: getSession } = await import('@/app/api/auth/session/route');
    const sessionRes = await getSession(
      new NextRequest('http://test/api/auth/session', {
        headers: { cookie: `wai_session=${token}` },
      })
    );
    expect(sessionRes.status).toBe(401);
  });
});

describe('requireSessionForAddress on whale-alerts/follow', () => {
  // Use whale-alerts/follow as the canonical guarded route. The same shape
  // applies to all 10 hardened routes.

  async function signInAndGetCookie(address?: `0x${string}`): Promise<string> {
    const nonce = await getNonce();
    const { message, signature } = await buildSignedMessage(nonce, { address });
    const { POST } = await import('@/app/api/auth/verify/route');
    const res = await POST(makeVerifyRequest({ message, signature }));
    return extractSessionCookie(res)!;
  }

  function makeFollowReq(body: object, cookie?: string): NextRequest {
    return new NextRequest('http://test/api/whale-alerts/follow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { cookie: `wai_session=${cookie}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  it('warn mode (default): no cookie + claimed address → still passes (logs warning)', async () => {
    process.env.AUTH_ENFORCE = '';
    const { POST } = await import('@/app/api/whale-alerts/follow/route');
    const res = await POST(
      makeFollowReq({
        userAddress: TEST_ADDRESS,
        whaleAddress: '0x' + 'cc'.repeat(20),
        config: { maxCopyAmount: '10', copyPercentage: 10, enabledSources: ['POLYMARKET'], autoMirror: false },
      })
    );
    // Warn-mode passes through; the route may still 5xx for unrelated reasons
    // (Prisma not migrated in this test env), but it's NOT a 401/403.
    expect([200, 400, 500]).toContain(res.status);
  });

  it('enforce mode: missing cookie → 401', async () => {
    process.env.AUTH_ENFORCE = '1';
    vi.resetModules();
    const { POST } = await import('@/app/api/whale-alerts/follow/route');
    const res = await POST(
      makeFollowReq({
        userAddress: TEST_ADDRESS,
        whaleAddress: '0x' + 'cc'.repeat(20),
        config: { maxCopyAmount: '10', copyPercentage: 10, enabledSources: ['POLYMARKET'], autoMirror: false },
      })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('enforce mode: cookie for a different wallet → 403', async () => {
    process.env.AUTH_ENFORCE = '';  // sign in first under default
    vi.resetModules();
    const cookie = await signInAndGetCookie();

    process.env.AUTH_ENFORCE = '1';
    vi.resetModules();
    const { POST } = await import('@/app/api/whale-alerts/follow/route');
    const res = await POST(
      makeFollowReq(
        {
          userAddress: '0x' + 'ff'.repeat(20),  // claim a different address
          whaleAddress: '0x' + 'cc'.repeat(20),
          config: { maxCopyAmount: '10', copyPercentage: 10, enabledSources: ['POLYMARKET'], autoMirror: false },
        },
        cookie
      )
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });
});
