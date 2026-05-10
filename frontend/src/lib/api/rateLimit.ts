/**
 * Rate Limiting Middleware — KV-backed, with in-memory fallback for dev/test.
 *
 * Backed by `lib/kv` so cold starts on Vercel don't reset the counters.
 * Production must set `KV_REST_API_URL` + `KV_REST_API_TOKEN` for the real
 * Upstash backend; without those the limiter falls back to per-process
 * memory (acceptable for single-instance / local dev).
 *
 * Pattern: each request INCRs a key whose TTL is the rate-limit window.
 * The new count is compared against `maxRequests`. The key auto-expires,
 * so we don't need a separate cleanup pass.
 */

import { ErrorResponses } from './errorHandler';
import { incrWithTtl, __resetKvMemory, __getKvMemorySize } from '@/lib/kv';

/**
 * Check if request is within rate limit
 *
 * @param key - Unique identifier for the rate limit (usually IP + route)
 * @param maxRequests - Maximum requests allowed in window
 * @param windowMs - Time window in milliseconds
 * @returns Rate limit status
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60000
): Promise<{
  allowed: boolean;
  remaining: number;
  resetIn: number;
  limit: number;
}> {
  const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const newCount = await incrWithTtl(`rl:${key}`, ttlSeconds);

  if (newCount > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: windowMs,
      limit: maxRequests,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - newCount),
    resetIn: windowMs,
    limit: maxRequests,
  };
}

/**
 * Generate rate limit key from request
 *
 * @param request - The HTTP request
 * @param prefix - Prefix to identify the route/action
 * @returns Rate limit key
 */
export function getRateLimitKey(request: Request, prefix: string): string {
  // Try to get IP from various headers (in order of preference)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');

  const ip = forwarded?.split(',')[0].trim() || realIp || cfConnectingIp || 'unknown';

  return `${prefix}:${ip}`;
}

/**
 * Generate rate limit key from request with wallet address support
 * This provides a secondary rate limit that can't be bypassed by IP rotation
 *
 * @param request - The HTTP request
 * @param prefix - Prefix to identify the route/action
 * @param walletAddress - Optional wallet address from authenticated request
 * @returns Rate limit key
 */
export function getRateLimitKeyWithWallet(
  request: Request,
  prefix: string,
  walletAddress?: string
): string {
  const ipKey = getRateLimitKey(request, prefix);

  // If wallet address is provided, create a combined key
  // This ensures users can't bypass limits by changing IPs
  if (walletAddress) {
    const normalizedAddress = walletAddress.toLowerCase();
    return `${prefix}:wallet:${normalizedAddress}`;
  }

  return ipKey;
}

/**
 * Apply rate limiting to a request
 *
 * @param request - The HTTP request
 * @param options - Rate limit options
 * @throws APIError if rate limit exceeded
 */
export async function applyRateLimit(
  request: Request,
  options: {
    prefix: string;
    maxRequests?: number;
    windowMs?: number;
    /** Optional wallet address for wallet-based rate limiting */
    walletAddress?: string;
    /** Use stricter limits for wallet-based tracking */
    strictWalletLimit?: boolean;
  }
): Promise<void> {
  // IP-based rate limiting
  const ipKey = getRateLimitKey(request, options.prefix);
  const ipResult = await checkRateLimit(ipKey, options.maxRequests, options.windowMs);

  if (!ipResult.allowed) {
    throw ErrorResponses.rateLimitExceeded(ipResult.resetIn);
  }

  // Additional wallet-based rate limiting if wallet address is provided
  // This prevents users from bypassing IP-based limits using proxies/VPNs
  if (options.walletAddress) {
    const walletKey = getRateLimitKeyWithWallet(
      request,
      options.prefix,
      options.walletAddress
    );

    // Use the same limits or stricter limits for wallet-based tracking
    const walletMaxRequests = options.strictWalletLimit
      ? Math.max(Math.floor((options.maxRequests || 10) / 2), 1) // Half the IP limit
      : options.maxRequests;

    const walletResult = await checkRateLimit(walletKey, walletMaxRequests, options.windowMs);

    if (!walletResult.allowed) {
      throw ErrorResponses.rateLimitExceeded(walletResult.resetIn);
    }
  }
}

/**
 * Apply rate limiting with automatic wallet extraction from request body
 * Useful for POST requests that include wallet address in the body
 *
 * @param request - The HTTP request (will be cloned for body reading)
 * @param body - The parsed request body
 * @param options - Rate limit options
 * @throws APIError if rate limit exceeded
 */
export async function applyRateLimitWithBody(
  request: Request,
  body: { userAddress?: string; walletAddress?: string; creatorAddress?: string },
  options: {
    prefix: string;
    maxRequests?: number;
    windowMs?: number;
    strictWalletLimit?: boolean;
  }
): Promise<void> {
  // Extract wallet address from common field names
  const walletAddress =
    body.userAddress || body.walletAddress || body.creatorAddress;

  await applyRateLimit(request, {
    ...options,
    walletAddress,
  });
}

/**
 * Get rate limit headers for response
 *
 * @param status - Rate limit status
 * @returns Headers object
 */
export function getRateLimitHeaders(status: {
  limit: number;
  remaining: number;
  resetIn: number;
}): Record<string, string> {
  const resetAt = Math.ceil((Date.now() + status.resetIn) / 1000);

  return {
    'X-RateLimit-Limit': status.limit.toString(),
    'X-RateLimit-Remaining': status.remaining.toString(),
    'X-RateLimit-Reset': resetAt.toString(),
  };
}

/**
 * Predefined rate limit configurations
 */
export const RateLimitPresets = {
  // Strict limits for write operations
  battleCreation: {
    maxRequests: 5,
    windowMs: 60000, // 5 per minute
  },

  betting: {
    maxRequests: 20,
    windowMs: 60000, // 20 per minute
  },

  marketCreation: {
    maxRequests: 3,
    windowMs: 60000, // 3 per minute
  },

  // Moderate limits for queries
  apiQueries: {
    maxRequests: 60,
    windowMs: 60000, // 60 per minute
  },

  // Relaxed limits for read operations
  readOperations: {
    maxRequests: 120,
    windowMs: 60000, // 120 per minute
  },
} as const;

// ============================================================================
// Test/soak inspectors — gated to non-production environments. State now
// lives in the KV-backed store (in-memory in dev/test); these helpers
// delegate to the kv module's debug surface.
// ============================================================================

function assertNotProduction(name: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is unavailable in production`);
  }
}

/**
 * Return the size of the rate-limit store. With KV-backed storage we don't
 * have direct access to per-key counts (the SCAN cost isn't worth a debug
 * helper), so the entries array is empty. Soak suites that previously
 * inspected entries should switch to asserting via the limiter's response
 * shape (`allowed`/`remaining`).
 */
export function __getRateLimitState(): {
  size: number;
  entries: Array<{ key: string; count: number; resetAt: number }>;
} {
  assertNotProduction('__getRateLimitState');
  return { size: __getKvMemorySize(), entries: [] };
}

/**
 * Reset the rate-limit store. In dev/test this clears the in-memory KV
 * shim (the same underlying Map shared with the nonce store, idempotency
 * cache, etc. — tests that touch multiple primitives should be aware).
 */
export function __resetRateLimitState(): void {
  assertNotProduction('__resetRateLimitState');
  __resetKvMemory();
}
