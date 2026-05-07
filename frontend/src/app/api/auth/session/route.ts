import { NextRequest, NextResponse } from 'next/server';
import { handleAPIError, createAPILogger, ErrorResponses } from '@/lib/api';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth/session';

/**
 * GET /api/auth/session
 *
 * Cheap endpoint the client uses on mount to check whether the user already
 * has a valid session cookie (avoids forcing a sign-in prompt on every page
 * navigation). Returns 200 + { address, expiresAt } if signed in, else 401.
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request);
  logger.start();
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = verifySession(token);
    if (!session) throw ErrorResponses.unauthorized('No active session');
    logger.complete(200);
    return NextResponse.json(
      { address: session.address, expiresAt: session.exp },
      { headers: { ...logger.getResponseHeaders(), 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return handleAPIError(error, 'API:Auth:Session:GET');
  }
}
