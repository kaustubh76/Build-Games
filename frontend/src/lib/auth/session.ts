/**
 * Session JWT — HS256 HMAC, stateless verify, in-process revocation set.
 *
 * Why custom: keeps dep footprint small (Node `crypto` only — no `jose`,
 * no `jsonwebtoken`) and lets us own the revocation semantics. The format
 * is plain JWT (`header.payload.sig`) so a debugging operator can decode it
 * with any standard tool.
 *
 * Token shape:
 *   header  = base64url({"alg":"HS256","typ":"JWT"})
 *   payload = base64url({sub: "0xAddr...", iat, exp, jti})
 *   sig     = base64url(hmacSha256(SESSION_SECRET, `${header}.${payload}`))
 *
 * `jti` is a 16-byte random ID. /api/auth/logout adds it to a per-instance
 * revocation Set; verifySession() rejects revoked jtis. Cold starts wipe the
 * revocation list — a logged-out user could in theory reuse their cookie
 * after a cold start, but the ttl is short (24h) and this matches the rest
 * of the codebase's per-instance trade-off. We document it in AUTH.md.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_SEC = 24 * 60 * 60; // 24h

interface JwtPayload {
  sub: string; // wallet address (lowercased on issue)
  iat: number;
  exp: number;
  jti: string;
}

const HEADER_B64URL = base64urlEncode(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
const revokedJtis = new Set<string>();

function getSecret(): Buffer {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      'SESSION_SECRET is missing or too short (need ≥32 chars). Set it in your env.'
    );
  }
  return Buffer.from(raw, 'utf8');
}

function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export interface IssuedSession {
  token: string;
  jti: string;
  expiresAt: number; // epoch seconds
  address: string;
}

export function signSession(address: string, now: Date = new Date()): IssuedSession {
  const secret = getSecret();
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + SESSION_TTL_SEC;
  const jti = randomBytes(16).toString('hex');
  const payload: JwtPayload = { sub: address.toLowerCase(), iat, exp, jti };
  const payloadB64 = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${HEADER_B64URL}.${payloadB64}`;
  const sig = base64urlEncode(createHmac('sha256', secret).update(signingInput).digest());
  return {
    token: `${signingInput}.${sig}`,
    jti,
    expiresAt: exp,
    address: payload.sub,
  };
}

export interface VerifiedSession {
  address: string;
  jti: string;
  iat: number;
  exp: number;
}

/**
 * Verify a session token. Returns the decoded session on success or null on
 * any failure (bad shape, bad signature, expired, revoked). Never throws —
 * callers treat null as "not authenticated".
 */
export function verifySession(token: string | undefined | null, now: Date = new Date()): VerifiedSession | null {
  if (typeof token !== 'string' || token.length === 0) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  if (headerB64 !== HEADER_B64URL) return null;

  let secret: Buffer;
  try {
    secret = getSecret();
  } catch {
    // SESSION_SECRET not set; treat as unauthenticated rather than throw.
    return null;
  }

  const expectedSig = base64urlEncode(
    createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest()
  );
  // Constant-time compare. Buffers must be the same length for timingSafeEqual.
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  let payload: JwtPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8')) as JwtPayload;
  } catch {
    return null;
  }
  if (
    typeof payload?.sub !== 'string' ||
    typeof payload?.iat !== 'number' ||
    typeof payload?.exp !== 'number' ||
    typeof payload?.jti !== 'string'
  ) {
    return null;
  }
  const nowSec = Math.floor(now.getTime() / 1000);
  if (payload.exp <= nowSec) return null;
  if (revokedJtis.has(payload.jti)) return null;
  return {
    address: payload.sub,
    jti: payload.jti,
    iat: payload.iat,
    exp: payload.exp,
  };
}

/**
 * Mark a jti as revoked. Subsequent verifySession() calls will return null
 * for tokens with this jti. Per-instance only — see file header note.
 */
export function revokeSession(jti: string): void {
  revokedJtis.add(jti);
}

// Constants exposed for cookie / route layer
export const SESSION_COOKIE_NAME = 'wai_session';
export const SESSION_COOKIE_MAX_AGE_SEC = SESSION_TTL_SEC;

// Test inspectors — gated.
function assertNotProduction(name: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is unavailable in production`);
  }
}

export function __resetSessionState(): void {
  assertNotProduction('__resetSessionState');
  revokedJtis.clear();
}

export function __getRevokedCount(): number {
  assertNotProduction('__getRevokedCount');
  return revokedJtis.size;
}
