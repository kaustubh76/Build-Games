/**
 * Feature flags for the Prisma → 0G migration. Read-only at module scope —
 * each call hits process.env so flag flips take effect on the next request
 * without requiring a redeploy (Vercel env-var changes propagate at the next
 * cold start).
 *
 * Default for ALL flags is "off" (dual-write mode): legacy Prisma writes
 * keep happening, 0G receipts are persisted in parallel. Flip a flag to '1'
 * to switch the corresponding tier into 0G-only mode.
 *
 * See `src/lib/storage/README.md` for the rollout sequence.
 */

/**
 * Tier 1: SystemAudit / SyncLog / PriceSyncHistory / CreatorFeeEntry
 * are append-only audit logs. When `1`, the legacy Prisma writes are
 * skipped — only the 0G receipt is persisted.
 */
export function isTier1AuditOnly(): boolean {
  return process.env.ENABLE_0G_AUDIT_LOGS === '1';
}

/**
 * Tier 2: MirrorTrade / MirrorCopyTrade / BattleBet / BattleBettingPool /
 * WhaleTrade / ArbitrageOpportunity. When `1`, reads switch to
 * event-sourced (with Prisma fallback on RPC failure during rollout).
 */
export function isTier2EventSourced(): boolean {
  return process.env.ENABLE_0G_TIER2 === '1';
}

/**
 * Tier 3: PredictionRound / AIDebateRound child rows fold into their
 * parent receipt. When `1`, the child Prisma writes are skipped and the
 * parent's `receiptRootHash` becomes the source of truth.
 */
export function isTier3BundledReceipts(): boolean {
  return process.env.ENABLE_0G_TIER3 === '1';
}
