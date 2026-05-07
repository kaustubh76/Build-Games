import { NextRequest, NextResponse } from 'next/server';
import { handleAPIError, applyRateLimit, createAPILogger } from '@/lib/api';
import { issueNonce } from '@/lib/auth/nonceStore';

/**
 * GET /api/auth/nonce
 *
 * Issue a single-use SIWE nonce. The client embeds this in the EIP-4361
 * message it signs; the server consumes it on /api/auth/verify. 5-min TTL.
 *
 * No auth required — anyone may request a nonce. Rate-limited per-IP so a
 * flood can't exhaust the bounded nonce store.
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request);
  logger.start();
  try {
    applyRateLimit(request, { prefix: 'auth-nonce', maxRequests: 30, windowMs: 60_000 });
    const { nonce, expiresAt } = issueNonce();
    logger.complete(200);
    return NextResponse.json(
      { nonce, expiresAt },
      {
        headers: {
          ...logger.getResponseHeaders(),
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    logger.error('issue nonce failed', error);
    return handleAPIError(error, 'API:Auth:Nonce:GET');
  }
}
