/**
 * Next.js Middleware — defense-in-depth presence check.
 *
 * Edge runtime can't run Node `crypto`, so the middleware does NOT verify the
 * session JWT here — it only checks that a session cookie is present on
 * routes in PROTECTED_ROUTES. The authoritative check lives in each route
 * handler via `requireSessionForAddress()` (which does the HMAC verify on
 * the Node runtime).
 *
 * Modes (AUTH_ENFORCEMENT_MODE):
 *   'warn' (default) — log presence/absence but always pass through.
 *   'enforce'        — return 401 if cookie is missing on protected routes.
 *                      Note: this is BEFORE we verify the signature; expired
 *                      or revoked cookies still get rejected at the route
 *                      handler. Middleware reduces wasted work, route is
 *                      authoritative.
 *
 * Legacy `X-Address` / `X-Signature` per-request signing scheme is kept for
 * back-compat with old clients during rollout — if those headers are present,
 * we treat the request as authenticated and skip the cookie check.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// SESSION_COOKIE_NAME is duplicated here (not imported from session.ts) to
// avoid pulling Node `crypto` into the edge bundle.
const SESSION_COOKIE_NAME = 'wai_session';

// Protected routes — superset of the high-risk routes guarded at handler level.
const PROTECTED_ROUTES = [
  { path: '/api/arena/battles', methods: ['POST', 'PATCH', 'DELETE'] },
  { path: '/api/arena/betting', methods: ['POST'] },
  { path: '/api/agents/authorize', methods: ['POST', 'DELETE'] },
  { path: '/api/copy-trade/whale-mirror', methods: ['POST'] },
  { path: '/api/copy-trade/execute', methods: ['POST'] },
  { path: '/api/agents/external-trade', methods: ['POST'] },
  { path: '/api/agents/execute-trade', methods: ['POST'] },
  { path: '/api/mirror/execute', methods: ['POST'] },
  { path: '/api/oracle/resolve', methods: ['POST'] },
  { path: '/api/markets/user-create', methods: ['POST'] },
  { path: '/api/creator/record-fee', methods: ['POST'] },
  { path: '/api/whale-alerts/follow', methods: ['POST'] },
  { path: '/api/whale-alerts/unfollow', methods: ['POST'] },
  { path: '/api/whale-alerts/update-config', methods: ['POST'] },
  { path: '/api/whale-alerts/subscribe-telegram', methods: ['POST', 'DELETE'] },
];

// Public routes that never require authentication.
const PUBLIC_ROUTES = [
  '/api/health',
  '/api/auth',              // sign-in flow itself must remain unauthenticated
  '/api/arena/markets',
  '/api/external/markets',
  '/api/leaderboard',
  '/api/game-master',       // Server-to-server (called by cron)
  '/api/cron',              // Vercel cron (authenticated via CRON_SECRET)
];

// 'warn' (default) | 'enforce'
const AUTH_MODE = process.env.AUTH_ENFORCEMENT_MODE || 'warn';

function isProtectedRoute(pathname: string, method: string): boolean {
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) return false;
  return PROTECTED_ROUTES.some(
    route => pathname.startsWith(route.path) && route.methods.includes(method)
  );
}

function hasLegacyAuthHeaders(request: NextRequest): boolean {
  // Old per-request signing scheme — kept for back-compat during rollout.
  return !!(
    request.headers.get('X-Address') &&
    request.headers.get('X-Signature') &&
    request.headers.get('X-Timestamp') &&
    request.headers.get('X-Message')
  );
}

function hasSessionCookie(request: NextRequest): boolean {
  return !!request.cookies.get(SESSION_COOKIE_NAME)?.value;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  if (!pathname.startsWith('/api/')) return NextResponse.next();
  if (!isProtectedRoute(pathname, method)) return NextResponse.next();

  if (hasSessionCookie(request) || hasLegacyAuthHeaders(request)) {
    return NextResponse.next();
  }

  const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
  const timestamp = new Date().toISOString();

  if (AUTH_MODE === 'enforce') {
    console.warn(
      `[AUTH] BLOCKED: ${method} ${pathname} from ${clientIP} at ${timestamp} — no session cookie`
    );
    return NextResponse.json(
      {
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
        message: 'Sign in (POST /api/auth/verify) before calling this endpoint',
      },
      { status: 401 }
    );
  }

  // Default 'warn' mode — log + add warning header so clients can spot the
  // gap during rollout, but allow through. Route handler still gets to
  // decide via requireSessionForAddress (which is also gated by AUTH_ENFORCE).
  console.warn(
    `[AUTH] WARN: ${method} ${pathname} from ${clientIP} at ${timestamp} — no session cookie`
  );
  const response = NextResponse.next();
  response.headers.set('X-Auth-Warning', 'Sign in required (will be enforced soon)');
  return response;
}

// Configure which routes this middleware applies to
export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
  ],
};
