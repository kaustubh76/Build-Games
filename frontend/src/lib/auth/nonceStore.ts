/**
 * In-process single-use nonce store for SIWE handshakes.
 *
 * Trade-off: per-instance state. A user who hits a different Vercel instance
 * for /api/auth/nonce vs /api/auth/verify will get a "nonce mismatch" error
 * and just retry — same trade-off the rest of this codebase already accepts
 * for rate limits and idempotency caches. Acceptable because the SIWE flow
 * is cheap to retry and a stale or unreachable nonce simply forces re-sign.
 *
 * Properties:
 *   - 32-byte hex nonces (256-bit entropy)
 *   - 5-min TTL
 *   - single-use (consumeNonce returns false on the second call)
 *   - bounded size (LRU-trim at NONCE_MAX_SIZE) so a flood can't OOM
 */

import { randomBytes } from 'node:crypto';

const NONCE_TTL_MS = 5 * 60 * 1000;
const NONCE_MAX_SIZE = 10_000;
const NONCE_TRIM_TARGET = 5_000;

interface NonceEntry {
  expiresAt: number;
}

const store = new Map<string, NonceEntry>();

function trim(): void {
  if (store.size < NONCE_MAX_SIZE) return;
  const now = Date.now();
  // First evict anything already expired.
  for (const [k, v] of store.entries()) {
    if (v.expiresAt <= now) store.delete(k);
  }
  if (store.size <= NONCE_TRIM_TARGET) return;
  // Then trim oldest by expiresAt (proxy for issue order).
  const entries = Array.from(store.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  const drop = entries.length - NONCE_TRIM_TARGET;
  for (let i = 0; i < drop; i++) store.delete(entries[i][0]);
}

export function issueNonce(): { nonce: string; expiresAt: number } {
  if (store.size >= NONCE_MAX_SIZE) trim();
  const nonce = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + NONCE_TTL_MS;
  store.set(nonce, { expiresAt });
  return { nonce, expiresAt };
}

/**
 * Consume a nonce. Returns true if the nonce was present, unexpired, and not
 * already consumed. Always evicts the entry — single-use even on success.
 */
export function consumeNonce(nonce: string): boolean {
  const entry = store.get(nonce);
  if (!entry) return false;
  store.delete(nonce); // single-use: evict regardless of expiry outcome
  if (entry.expiresAt <= Date.now()) return false;
  return true;
}

// Test/inspector hooks — gated to non-production.
function assertNotProduction(name: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is unavailable in production`);
  }
}

export function __resetNonceStore(): void {
  assertNotProduction('__resetNonceStore');
  store.clear();
}

export function __getNonceStoreSize(): number {
  assertNotProduction('__getNonceStoreSize');
  return store.size;
}
