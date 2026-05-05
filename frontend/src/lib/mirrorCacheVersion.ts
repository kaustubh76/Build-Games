/**
 * Per-process cache invalidation for mirror-market reads.
 *
 * The /api/markets/ticker and /api/mirror/positions routes cache results in
 * memory for 30s to bound RPC cost. Writes (any /api/mirror/execute action
 * that mutates chain state) invalidate by bumping `version`. Read-side caches
 * compare against the version they were written under and re-fetch on mismatch.
 *
 * Cheap, in-process, no Redis. Cold starts wipe the version (back to 0), which
 * is fine — the RPC cache TTL still bounds staleness in the worst case.
 */

let version = 0;

export function bumpMirrorCacheVersion(): number {
  return ++version;
}

export function getMirrorCacheVersion(): number {
  return version;
}
