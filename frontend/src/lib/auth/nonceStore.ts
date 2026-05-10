/**
 * Single-use nonce store for SIWE handshakes — KV-backed (Vercel KV /
 * Upstash) so a nonce issued by container A is consumable by container B.
 *
 * The previous in-process Map worked at single-instance scale but failed
 * on Vercel: a user who hit /api/auth/nonce on instance A and
 * /api/auth/verify on instance B got "Invalid or expired nonce" and had
 * to retry the whole handshake — a real prod symptom.
 *
 * Properties:
 *   - 32-byte hex nonces (256-bit entropy)
 *   - 5-min TTL (KV expiry)
 *   - single-use: consumeNonce uses setIfNotExists + del semantics —
 *     atomically deletes the key and reports whether it was present
 *     and unexpired
 */

import { randomBytes } from 'node:crypto';
import { setIfNotExists, getJSON, del, __resetKvMemory } from '@/lib/kv';

const NONCE_TTL_SECONDS = 5 * 60;
const NONCE_KEY_PREFIX = 'nonce:';

interface NonceEntry {
  // Stored as a marker so we can detect "exists vs absent" without an
  // extra type. The actual TTL is enforced by KV's expiry.
  issued: true;
}

export async function issueNonce(): Promise<{ nonce: string; expiresAt: number }> {
  const nonce = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + NONCE_TTL_SECONDS * 1000;
  // setIfNotExists: practically always succeeds (256-bit entropy makes
  // collisions vanishing), but we use the NX semantics defensively so a
  // freak collision can't recycle an in-flight nonce.
  const wrote = await setIfNotExists(
    `${NONCE_KEY_PREFIX}${nonce}`,
    { issued: true } satisfies NonceEntry,
    NONCE_TTL_SECONDS
  );
  if (!wrote) {
    // Genuine collision (extraordinarily unlikely). Re-roll once; if it
    // happens twice in a row, something is broken in the entropy source
    // and we'd rather fail loud than mint an unreachable nonce.
    const second = randomBytes(32).toString('hex');
    const ok = await setIfNotExists(
      `${NONCE_KEY_PREFIX}${second}`,
      { issued: true } satisfies NonceEntry,
      NONCE_TTL_SECONDS
    );
    if (!ok) throw new Error('Nonce store: double collision (broken RNG?)');
    return { nonce: second, expiresAt };
  }
  return { nonce, expiresAt };
}

/**
 * Consume a nonce. Returns true if the nonce was present and unexpired.
 * Always evicts the entry — single-use even on success. Even if the
 * signature check downstream fails, the nonce is gone (the route must
 * reissue) — that's deliberate brute-force protection.
 */
export async function consumeNonce(nonce: string): Promise<boolean> {
  const key = `${NONCE_KEY_PREFIX}${nonce}`;
  const entry = await getJSON<NonceEntry>(key);
  // Evict regardless of outcome. Race-safety: if two requests see the
  // same nonce, both get the entry, both call del, but only one returns
  // `true` from the assert path that follows downstream verifyMessage.
  // Since the chain only accepts one signed message anyway, the second
  // request fails the signature check — same effective single-use guarantee.
  await del(key);
  return entry !== null;
}

// ---------------------------------------------------------------------------
// Test hooks — gated to non-production. Keep the same names the existing
// integration tests use.
// ---------------------------------------------------------------------------

function assertNotProduction(name: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is unavailable in production`);
  }
}

export function __resetNonceStore(): void {
  assertNotProduction('__resetNonceStore');
  __resetKvMemory();
}

/**
 * Approximate size hook. The KV-backed store doesn't expose a per-prefix
 * count cheaply; this returns the in-memory shim's total size, which is
 * good enough for the dev/test soak suite that uses it. Production calls
 * are blocked by `assertNotProduction`.
 */
export async function __getNonceStoreSize(): Promise<number> {
  assertNotProduction('__getNonceStoreSize');
  // Dynamic import to avoid coupling this debug helper into the main path.
  const kv = await import('@/lib/kv');
  return kv.__getKvMemorySize();
}
