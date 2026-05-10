import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyMessage } from 'viem';
import { handleAPIError, applyRateLimit, createAPILogger, ErrorResponses } from '@/lib/api';
import { parseSiweMessage, assertSiweMessageMatches } from '@/lib/auth/siwe';
import { consumeNonce } from '@/lib/auth/nonceStore';
import { signSession, SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE_SEC } from '@/lib/auth/session';
import { getChainId } from '@/constants';

/**
 * POST /api/auth/verify
 *
 * Verify a SIWE handshake and mint a session cookie. Steps:
 *  1. Parse the EIP-4361 message; reject malformed shape.
 *  2. Confirm the message's domain, chainId, and nonce match what we expect.
 *  3. Consume the nonce (single-use).
 *  4. Verify the signature against the claimed address via viem.
 *  5. Mint a 24h HMAC-signed session JWT, set as HttpOnly cookie.
 *
 * Any failure returns 401 — we do NOT leak which gate failed because the
 * specific error is useful to attackers (helps them reconstruct what
 * properties they need to forge).
 */

const BodySchema = z.object({
  message: z.string().min(1).max(4_000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

/**
 * Resolve the SIWE domain we'll accept on this deployment. Production MUST
 * set `AUTH_ALLOWED_DOMAINS` (comma-separated list) — we then accept the
 * first match and ignore client-controllable headers like `x-forwarded-host`.
 *
 * Trusting `x-forwarded-host` in production is a known SIWE replay surface:
 * an attacker spoofs the header at the edge and gets the server to accept a
 * message signed against `attacker.com`. The allowlist closes that window.
 *
 * Dev/test fall back to the request's host header so the local handshake
 * still works on `localhost:3000` without env wiring.
 */
function getExpectedDomain(request: NextRequest): string {
  const isProd = process.env.NODE_ENV === 'production';
  const allowed = (process.env.AUTH_ALLOWED_DOMAINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Compute the candidate host the request CLAIMS to be on. In dev we trust
  // it; in prod we use it only to pick a match from the allowlist.
  const candidate =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    new URL(request.url).host;

  if (isProd) {
    if (allowed.length === 0) {
      // Misconfigured prod deployment. Fail closed rather than fall back to
      // a header an attacker controls.
      throw new Error('AUTH_ALLOWED_DOMAINS not configured for production');
    }
    const match = allowed.find((d) => d === candidate);
    if (!match) {
      // Force a domain mismatch downstream — the SIWE assert step will
      // reject the message because its `domain` won't equal this value.
      // Returning the first allowlisted entry would let an attacker craft
      // a message against that domain and get it accepted, so we instead
      // return a sentinel that no SIWE message will ever match.
      return '__domain_not_allowlisted__';
    }
    return match;
  }

  return candidate;
}

export async function POST(request: NextRequest) {
  const logger = createAPILogger(request);
  logger.start();
  try {
    await applyRateLimit(request, { prefix: 'auth-verify', maxRequests: 20, windowMs: 60_000 });

    const raw = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ErrorResponses.badRequest('Body must be { message: string, signature: 0x... }');
    }
    const { message, signature } = parsed.data;

    let siwe;
    try {
      siwe = parseSiweMessage(message);
      assertSiweMessageMatches(siwe, {
        domain: getExpectedDomain(request),
        chainId: getChainId(),
        nonce: siwe.nonce,
      });
    } catch (e) {
      logger.warn('SIWE message rejected', { reason: e instanceof Error ? e.message : 'unknown' });
      // Generic 401 — don't leak which check failed.
      throw ErrorResponses.unauthorized('Invalid sign-in message');
    }

    // Consume the nonce ONCE — even if the signature check below fails. This
    // prevents a brute-forcer from grinding signatures against a long-lived
    // server nonce. The user retries the whole handshake (cheap).
    const nonceWasFresh = await consumeNonce(siwe.nonce);
    if (!nonceWasFresh) {
      logger.warn('SIWE nonce already consumed or expired');
      throw ErrorResponses.unauthorized('Invalid or expired sign-in nonce');
    }

    let valid = false;
    try {
      valid = await verifyMessage({
        address: siwe.address,
        message,
        signature: signature as `0x${string}`,
      });
    } catch (e) {
      logger.warn('verifyMessage threw', { error: e instanceof Error ? e.message : String(e) });
      valid = false;
    }
    if (!valid) {
      throw ErrorResponses.unauthorized('Signature verification failed');
    }

    const issued = signSession(siwe.address);
    logger.complete(200, `signed in ${issued.address}`);
    const res = NextResponse.json(
      { ok: true, address: issued.address, expiresAt: issued.expiresAt },
      { headers: logger.getResponseHeaders() }
    );
    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: issued.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_COOKIE_MAX_AGE_SEC,
    });
    return res;
  } catch (error) {
    logger.error('SIWE verify failed', error);
    return handleAPIError(error, 'API:Auth:Verify:POST');
  }
}
