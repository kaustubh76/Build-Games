# Storage: Prisma → 0G migration

The codebase originally treated Prisma as the canonical write target for every
domain object. The "0G-native" architecture target moves audit logs, event
records, and transcript data to **0G Storage receipts + on-chain events**, with
Prisma reserved for true read-heavy aggregations (Creator leaderboards,
WhaleFollow user prefs, MirrorMarket state).

This pass migrated **30 of the 60** Prisma write call sites across **Tiers 1, 2, 3**.

## Tiers

| Tier | Strategy | Models | Write sites | Status |
|---|---|---|---|---|
| **1** | Pure 0G receipt (Shape A) | SyncLog, SystemAudit, PriceSyncHistory, CreatorFeeEntry | 11 | ✅ migrated, dual-write |
| **2** | Event-sourced + 0G receipt (Shape B) | MirrorTrade, MirrorCopyTrade, BattleBettingPool, BattleBet, WhaleTrade, ArbitrageOpportunity | 13 | ✅ migrated, dual-write |
| **3** | Transcript bundling (Shape C) | PredictionRound, AIDebateRound | 6 | ✅ migrated, gated by `ENABLE_0G_TIER3` |
| **4** | Hybrid (chain event + 0G receipt root) | PredictionBattle, AgentTrade | 8 | ⏸ deferred (needs Solidity work) |
| **5** | Kept in Prisma | Creator, UserCreatedMarket, TrackedTrader, WhaleFollow, MirrorMarket | 15 | 🚫 out of scope |

## Replacement shapes

### Shape A — pure 0G receipt
Write a versioned JSON blob to 0G; return the rootHash. Reads are sparse and
operator-driven (`/api/storage/download/[rootHash]`). The rootHash is logged
via the structured logger so operators can grep historical receipts.

### Shape B — event-sourced reads
The on-chain event IS the index. Writes become 0G receipts (rich payload
that doesn't fit in event args). Reads use `lib/eventQuery/getLogsForAddressCached`
to issue paginated `client.getLogs` queries with a 5s cache layer.

### Shape C — transcript bundling
Children (e.g. `PredictionRound`) are accumulated in memory and serialised
into the parent's 0G receipt. Reads of `prisma.predictionBattle.findUnique({include: {rounds: true}})`
fall back to the embedded array via `zgDownload(battle.battleDataHash)`.

## Helpers

- `persistReceipt(envelope, filename)` — typed wrapper around `zgUpload`. Returns `{rootHash, txHash}` or `null` on failure / not-configured. Never throws.
- `buildEnvelope({type, payload})` — defaults version=`'1.0.0'` and ts=`Date.now()`.
- `lib/eventQuery/getLogsPaginated` — chunks queries into 2k-block windows (Fuji RPC limit).
- `lib/eventQuery/getLogsForAddressCached` — same + 5s TTL cache keyed on `(contract, event, argsKey)`.

Metrics:
- `zg_receipt_persisted_total{type}` — successful uploads.
- `zg_receipt_failed_total{type, reason}` — `not_configured | serialize_error | upload_error`.

## Rollout flags

All flags default to **off** (dual-write mode). Flip to `'1'` only after monitoring confirms the corresponding 0G receipts are landing reliably for ~1 week.

| Flag | Effect when `=1` |
|---|---|
| `ENABLE_0G_AUDIT_LOGS` | Tier 1: skip Prisma writes for SyncLog/SystemAudit/PriceSyncHistory/CreatorFeeEntry. |
| `ENABLE_0G_TIER2` | Tier 2: skip Prisma writes for MirrorTrade/MirrorCopyTrade/WhaleTrade/etc. (Reads still on Prisma until separate switch.) |
| `ENABLE_0G_TIER3` | Tier 3: skip per-round Prisma writes; bundle into parent receipt. Reads of `predictionBattle.rounds` fall back to the embedded array. |

## Rollout sequence

1. **This pass shipped** — all writes happen on both paths. Prisma is canonical.
2. Monitor `zg_receipt_persisted_total` for ~1 week. Confirm > 99% success rate per type.
3. Set `ENABLE_0G_TIER2=1` first (event-sourced models — Prisma writes stop, but reads still hit Prisma rows already there).
4. Set `ENABLE_0G_AUDIT_LOGS=1` after another week of clean operation.
5. Set `ENABLE_0G_TIER3=1` last (changes the read-fallback path for transcripts).
6. After 1 more week with no rollbacks: schedule the schema cleanup (drop deprecated models / fields).

## Database migration

The Prisma schema gains one new optional field:
- `AIDebate.receiptRootHash: String?` — bundled transcript root hash.

Migration SQL: `prisma/migrations/20260507_add_aidebate_receipt_root_hash/migration.sql`.

The migration is **additive only** (NULL-able new column). Safe to apply on the live DB without backfilling. New writes populate it; legacy rows leave it NULL and reads fall back to the AIDebateRound child table.

`PredictionBattle` already has `battleDataHash` from earlier work — no schema change needed there.

## What's deliberately NOT done

- **Tier 4 (PredictionBattle + AgentTrade)** — needs new Solidity events emitted by `PredictionArena` and `ExternalMarketMirror`. Separate plan, separate contract redeploy.
- **Tier 5 (Creator, WhaleFollow, MirrorMarket, UserCreatedMarket, TrackedTrader)** — read-heavy aggregations or pure app preferences. Move to Upstash KV in a future pass IF the per-instance trade-off becomes painful.
- **Backfill of historical Prisma rows into 0G** — new writes go to 0G; old rows stay queryable until they age out.
- **Dropping deprecated Prisma models** — keep the schema for one release for rollback safety, then a follow-up cleanup plan drops them.
- **Reading from event-sourced shape (Tier 2 reads)** — the eventQuery module is in place but no read path has been switched yet. Each consumer route is a separate (small) PR.
