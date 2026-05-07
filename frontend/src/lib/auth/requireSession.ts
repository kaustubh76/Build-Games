/**
 * Route-level session guards. These are the authoritative auth checks for
 * state-changing routes — middleware is defense-in-depth, but each route
 * MUST also call one of these helpers before mutating state.
 *
 * Behavior is gated by AUTH_ENFORCE so we can ship the auth flow without
 * breaking existing clients during rollout:
 *
 *   AUTH_ENFORCE=1                 → fully enforced; missing/mismatched
 *                                    session throws 401/403.
 *   AUTH_ENFORCE unset (default)   → "warn" mode; mismatch is logged but the
 *                                    route still runs. The /api/auth/session
 *                                    flow works either way; this flag just
 *                                    controls whether the GUARD is hard.
 *
 * Once we've shipped client-side sign-in for ~1 week and confirmed the bulk
 * of traffic carries cookies, flip AUTH_ENFORCE=1 and the guard rejects.
 */

import type { NextRequest } from 'next/server';
import { ErrorResponses } from '@/lib/api/errorHandler';
import { log } from '@/lib/api/logger';
import {
  verifySession,
  SESSION_COOKIE_NAME,
  type VerifiedSession,
} from './session';

function isEnforceMode(): boolean {
  return process.env.AUTH_ENFORCE === '1';
}

export type Session = VerifiedSession;

/**
 * Read the session cookie and return the verified session, or null if there
 * isn't one (or it's invalid / expired / revoked). Never throws.
 */
export function getOptionalSession(request: NextRequest): Session | null {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return verifySession(token);
}

/**
 * Require ANY valid session. Throws ErrorResponses.unauthorized() in enforce
 * mode if missing. In warn mode, returns a synthetic session-less marker so
 * the caller can still operate — but logs a warning.
 *
 * Use this when the route doesn't have an "address claimed in body" field.
 */
export function requireSession(request: NextRequest): Session {
  const s = getOptionalSession(request);
  if (s) return s;
  if (isEnforceMode()) {
    throw ErrorResponses.unauthorized('Sign in required');
  }
  log.warn('[auth] requireSession: no session, but AUTH_ENFORCE is unset — allowing through', {
    path: new URL(request.url).pathname,
  });
  // Return a synthetic session marker so the caller can still proceed.
  return { address: '0x0000000000000000000000000000000000000000', jti: 'warn-mode', iat: 0, exp: 0 };
}

/**
 * Require a valid session AND that the session's address matches the
 * `claimed` address from the request body. This is the load-bearing check
 * for the "anyone can call for any wallet" hole.
 *
 * In enforce mode:
 *   - missing session → 401 unauthorized
 *   - mismatched address → 403 forbidden
 *
 * In warn mode (default), both situations log + pass through.
 */
export function requireSessionForAddress(
  request: NextRequest,
  claimed: string | undefined | null
): Session {
  const path = new URL(request.url).pathname;
  if (!claimed || typeof claimed !== 'string') {
    if (isEnforceMode()) {
      throw ErrorResponses.badRequest('Missing wallet address in request body');
    }
    log.warn('[auth] requireSessionForAddress: claimed address missing', { path });
    return { address: '', jti: 'warn-mode', iat: 0, exp: 0 };
  }

  const claimedLower = claimed.toLowerCase();
  const session = getOptionalSession(request);

  if (!session) {
    if (isEnforceMode()) {
      throw ErrorResponses.unauthorized('Sign in required');
    }
    log.warn('[auth] requireSessionForAddress: no session', { path, claimed: claimedLower });
    return { address: claimedLower, jti: 'warn-mode', iat: 0, exp: 0 };
  }

  if (session.address.toLowerCase() !== claimedLower) {
    if (isEnforceMode()) {
      throw ErrorResponses.forbidden(
        'Session wallet does not match the address in this request'
      );
    }
    log.warn('[auth] requireSessionForAddress: address mismatch', {
      path,
      sessionAddress: session.address,
      claimed: claimedLower,
    });
    return session;
  }

  return session;
}
