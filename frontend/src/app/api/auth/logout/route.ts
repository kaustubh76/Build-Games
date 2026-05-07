import { NextRequest, NextResponse } from 'next/server';
import { handleAPIError, createAPILogger } from '@/lib/api';
import { verifySession, revokeSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';

/**
 * POST /api/auth/logout
 *
 * Revoke the current session and clear the cookie. Idempotent — calling
 * without a session is a no-op (200). The jti revocation is per-instance
 * and best-effort (cold starts wipe it); the cookie clear is the load-
 * bearing effect.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request);
  logger.start();
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = verifySession(token);
    if (session) revokeSession(session.jti);
    logger.complete(200);
    const res = NextResponse.json(
      { ok: true },
      { headers: logger.getResponseHeaders() }
    );
    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return res;
  } catch (error) {
    return handleAPIError(error, 'API:Auth:Logout:POST');
  }
}
