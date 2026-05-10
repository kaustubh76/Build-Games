# Manual deployment + operations checklist

Everything in this list requires a human (or a privileged automation
account) to execute outside the codebase. Code changes alone cannot
finish these — the platform side has to be configured.

Order is roughly **must-do before next prod deploy** → **should-do this
sprint** → **track separately**. Each item links back to the code that
expects it.

---

## 1. Vercel project — env vars to set

These must be set in **Vercel → Project → Settings → Environment Variables**
before the next production deploy. Without them, hardening shipped in the
last several passes silently degrades or fails closed.

### Critical (deploy will misbehave without these)

| Variable | Why | Where it's read | What breaks if unset |
|---|---|---|---|
| `KV_REST_API_URL` | Vercel KV / Upstash REST URL | [src/lib/kv/index.ts](src/lib/kv/index.ts) | Rate limiter, SIWE nonces, idempotency cache, daily-spend tracker all fall back to per-container memory. Cold-starts reset state; cross-container races possible. |
| `KV_REST_API_TOKEN` | Vercel KV / Upstash REST token | [src/lib/kv/index.ts](src/lib/kv/index.ts) | Same as above. |
| `CRON_SECRET` | Bearer token gating privileged routes | [src/lib/auth/requireCronSecret.ts](src/lib/auth/requireCronSecret.ts) | `/api/markets/settle`, `/api/oracle/resolve`, and the cron handlers all return 503. |
| `SESSION_SECRET` | HMAC key for SIWE session JWTs | [src/lib/auth/session.ts](src/lib/auth/session.ts) | Sign-in flow throws at startup. ≥ 32 chars of entropy. Generate with `openssl rand -hex 32`. |
| `AUTH_ALLOWED_DOMAINS` | Comma-separated list of acceptable SIWE domains in production | [src/app/api/auth/verify/route.ts](src/app/api/auth/verify/route.ts) | Every SIWE handshake returns 401 in production. Example: `warriors-ai-rena.vercel.app,warriors-ai-rena-*.vercel.app` |
| `DATABASE_URL` | Postgres connection (Neon recommended) | [prisma/schema.prisma](prisma/schema.prisma) | All Prisma queries throw; most routes return 500. |

### Required for signing flows

| Variable | Why |
|---|---|
| `GAME_MASTER_PRIVATE_KEY` | Signs warrior trait payloads; the address derived from this key MUST equal the WarriorsNFT contract's expected signer. Otherwise every mint reverts. |
| `ORACLE_SIGNER_PRIVATE_KEY` | Signs battle resolutions submitted to the oracle contract. |
| `AI_SIGNER_PRIVATE_KEY` | Owner key used by `/api/markets/settle` to call `resolveMarket()`. MUST equal the deployed contract owner. |

### Required for app features

| Variable | Why |
|---|---|
| `NEXT_PUBLIC_AVALANCHE_RPC_URL` | Primary RPC. Public endpoints rate-limit under traffic; use Alchemy / Ankr / QuickNode in prod. |
| `NEXT_PUBLIC_AVALANCHE_FALLBACK_RPC_URL` | Fallback RPC for the resilient client. |
| `NEXT_PUBLIC_CHAIN_ID` | `43113` (Fuji testnet) or `43114` (mainnet). Mainnet path requires per-contract overrides. |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | Get a free one at https://cloud.walletconnect.com. |
| `ZG_PRIVATE_KEY`, `ZG_EVM_RPC`, `ZG_INDEXER_RPC`, `ZG_COMPUTE_PROVIDER` | 0G Storage + Compute. Without these, audit-log persistence and AI inference (`/api/activate-warriors`) return 503. |

### Optional / feature toggles

`ENABLE_0G_AUDIT_LOGS`, `ENABLE_0G_TIER2`, `ENABLE_0G_TIER3`, `ENABLE_AUTO_CREATE_MIRROR`, `AUTO_CREATE_LIQUIDITY_CRWN`, `SERVER_WALLET_BALANCE_FLOOR_CRWN`, `TELEGRAM_BOT_TOKEN`, `SLACK_WEBHOOK_URL`, `SLACK_ALERT_CHANNEL`, `ALERT_WEBHOOK_URL`, `PAGERDUTY_INTEGRATION_KEY`, `OPINION_API_KEY`, `INTERNAL_API_KEY`.

See [.env.example](.env.example) for the full annotated list.

---

## 2. Vercel KV — provision the database

The KV migration shipped in the latest pass moves four primitives off
in-process memory into Vercel KV (Upstash Redis). To activate it:

1. Vercel dashboard → **Storage** → **Create Database** → **KV**.
2. Pick a region close to your function region (default `iad1`).
3. Copy the `KV_REST_API_URL` and `KV_REST_API_TOKEN` it generates into
   the project's env vars (Production + Preview).
4. Redeploy. The next request reads the new env values; no code change
   needed.
5. **Verify**: hit `/api/auth/nonce` then immediately `/api/auth/verify`
   with the signed message. If the verify succeeds across multiple cold
   starts, KV is wired correctly. If "Invalid or expired sign-in nonce"
   shows up under load, the env vars aren't reaching the runtime.

Free tier (256 MB, 100k commands/day) covers small production traffic.

---

## 3. Vercel domain configuration

- **Custom domain**: if you point `warriorsai.app` at the Vercel project,
  add it to `AUTH_ALLOWED_DOMAINS` in addition to the
  `warriors-ai-rena.vercel.app` default. Production SIWE rejects any
  message claiming a domain not on the list.
- **Preview deploys**: Vercel preview URLs are
  `warriors-ai-rena-<branch>-<team>.vercel.app`. SIWE on previews requires
  either:
  - Adding a wildcard pattern (Vercel KV doesn't support wildcards in
    headers; you'd need to handle this in `getExpectedDomain`), OR
  - Adding each preview deploy domain manually before testing auth, OR
  - Setting `NODE_ENV=development` on previews so the host-header
    fallback engages. **NOT recommended** — it disables the prod
    enforcement path.

Recommended: add a build-time check that injects `VERCEL_URL` into
`AUTH_ALLOWED_DOMAINS` for preview environments. Tracked as TODO; do it
when first preview-auth complaint surfaces.

---

## 4. Database operations

### Prisma migrations

Once per environment (Local, Preview, Prod):

```bash
npx prisma migrate deploy
```

Add it to the deploy step in Vercel via:

```json
// package.json — already there:
"build": "prisma generate && next build"
```

`prisma generate` runs on every build. `prisma migrate deploy` does NOT.
For new schema migrations, run manually or wire into a pre-deploy step.

### Decimal column migration (deferred)

The `Creator` table stores `totalVolumeGenerated`, `totalFeesEarned`,
and `pendingRewards` as Strings. The `/api/creator/record-fee` route
uses a Prisma transaction wrapper as a stopgap — but the **proper fix**
is `ALTER TABLE` to switch to `Decimal` so atomic `{ increment }`
becomes safe. Steps when ready:

1. Create migration: `npx prisma migrate dev --name creator_decimal_columns`
2. Manual SQL inside the migration:
   ```sql
   ALTER TABLE "Creator"
     ALTER COLUMN "totalVolumeGenerated" TYPE DECIMAL(38, 18) USING "totalVolumeGenerated"::DECIMAL,
     ALTER COLUMN "totalFeesEarned" TYPE DECIMAL(38, 18) USING "totalFeesEarned"::DECIMAL,
     ALTER COLUMN "pendingRewards" TYPE DECIMAL(38, 18) USING "pendingRewards"::DECIMAL;
   ```
3. Update `creator/record-fee/route.ts` to use `{ increment: delta }`
   instead of read-then-write.
4. Drop the transaction wrapper.

Window required: ~30s lock on the Creator table. Schedule during low
traffic.

---

## 5. Contract operations

### Set the AI signer on WarriorsNFT

If `GAME_MASTER_PRIVATE_KEY` is rotated or the WarriorsNFT contract is
redeployed, the contract's `aiSigner` storage slot must be updated to
match the new key's derived address. Otherwise every mint reverts with
`InvalidSignature()`.

Recipe (cast or scripts/setAiSigner.ts):

```bash
# Get the address from the key
NEW_ADDR=$(cast wallet address $GAME_MASTER_PRIVATE_KEY)
# Set on the contract (caller must be contract owner)
cast send $WARRIORS_NFT setAiSigner $NEW_ADDR --private-key $OWNER_KEY
```

This was a real prior incident — the very first commit in the visible
git log (`45ba2ad`) referenced re-signing after an `encodePacked`
mismatch. Verify after every deploy:

```bash
cast call $WARRIORS_NFT 'aiSigner()(address)'
# Should equal $(cast wallet address $GAME_MASTER_PRIVATE_KEY)
```

### Deployer balance floor

`AI_SIGNER_PRIVATE_KEY` and `ORACLE_SIGNER_PRIVATE_KEY` need AVAX to pay
gas. Set up alerting (Slack / PagerDuty webhook) when either falls
below ~1 AVAX. The current code does NOT auto-alert; this is purely a
manual ops responsibility.

---

## 6. Cron job verification

Vercel sets up the cron triggers from `vercel.json`. Verify after first
production deploy:

1. Vercel dashboard → **Cron Jobs**. Both `/api/cron/game-loop` and
   `/api/cron/sync-agent-events` should appear with their schedules.
2. Manually invoke each once with the bearer token to confirm 200:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://warriors-ai-rena.vercel.app/api/cron/game-loop
curl -H "Authorization: Bearer $CRON_SECRET" https://warriors-ai-rena.vercel.app/api/cron/sync-agent-events
```

3. Check the function logs for any 401 / 503. 401 = wrong secret. 503 =
   `CRON_SECRET` env var not visible to the runtime.

---

## 7. Smoke tests after every deploy

Run these against the deployed URL:

```bash
BASE="https://warriors-ai-rena.vercel.app"

# Health
curl -fsSL "$BASE/api/health" | jq .

# Auth (should mint a nonce)
curl -fsSL "$BASE/api/auth/nonce" | jq .

# Privileged route (should return 401 without bearer)
curl -fs "$BASE/api/markets/settle" -X POST | jq .  # expect 401

# Privileged route (should return 401 with WRONG bearer)
curl -fs "$BASE/api/markets/settle" -X POST -H "Authorization: Bearer wrong" | jq .  # expect 401

# Security headers
curl -sI "$BASE" | grep -E "X-Frame-Options|X-Content-Type|Referrer-Policy|Permissions-Policy"

# CORS (should be specific, not *)
curl -sI "$BASE/api/health" -H "Origin: https://attacker.test" | grep -i "access-control-allow-origin"
# Expect: Access-Control-Allow-Origin: https://warriors-ai-rena.vercel.app
```

If any of these fail, **do NOT promote** — roll back via Vercel's
instant rollback.

---

## 8. Sentry / OTel wiring (future work)

`src/lib/errorReporter.ts` is the swap point. When you're ready:

1. `npm install @sentry/nextjs`
2. Create a Sentry project; copy the DSN.
3. `SENTRY_DSN` env var.
4. In `errorReporter.ts`, replace the `fetch('/api/internal/errors', ...)`
   call with `Sentry.captureException(err)`.

The ErrorBoundary's `onError` callback already pipes through
`errorReporter`, so wiring Sentry is a one-import-swap, not a refactor.

---

## 9. CI/CD secrets

For [.github/workflows/test.yml](../.github/workflows/test.yml) to run
the live-RPC integration tests, the GitHub repo needs these secrets:

- `NEXT_PUBLIC_AVALANCHE_RPC_URL` (a non-rate-limited RPC endpoint)
- `CI_TEST_WALLET_PRIVATE_KEY` (a funded testnet wallet — only used on
  push-to-main, NOT pull requests; the workflow is configured to skip
  layer-B writes on PRs)

Without these, the integration tests fall back to public RPC endpoints
and most timeout under load (this is the existing 6-test failure pattern
observed in recent runs — not a code bug).

---

## 10. Monitoring + alerting

Currently the app has structured logs but no APM. To set up:

1. **Vercel Logs** — already on by default. Filter `[ERROR]` to find
   real issues. 7-day retention.
2. **Vercel Analytics** — opt in via dashboard. Free tier covers small
   traffic. Page-level metrics only; doesn't see API performance.
3. **Better Stack / Datadog / Logtail** — pipe Vercel logs via the
   "Log Drains" integration. Required for >7-day history.
4. **PagerDuty** for criticals — `PAGERDUTY_INTEGRATION_KEY` env var
   wires `lib/alerting.ts` to page on the highest-severity events.

The minimum I'd recommend before opening to public traffic:
- Vercel Logs filter saved for `[ERROR]` and `status=5XX`.
- Slack channel webhook (`SLACK_WEBHOOK_URL`) for non-critical alerts.
- One person on-call who can read those.

---

## 11. Operational runbook

When something breaks, the order to check:

1. **Vercel deployment status** — most outages are bad deploys. Roll
   back to the previous deployment in Vercel's dashboard (one click).
2. **Vercel function logs** — filter `status=5XX` in the last hour.
3. **Avalanche RPC status** — primary AND fallback can both be down.
   Check https://status.avax.network.
4. **0G Storage / Compute status** — separate vendor; can outage
   independently of Avalanche. The audit-log path tolerates 0G
   downtime by falling back to Prisma.
5. **Vercel KV status** — Upstash dashboard. If KV is down, rate-limit
   and SIWE nonce calls fail with 502 from KV; the app degrades to
   "everyone gets 401 on sign-in." Plan a temporary `AUTH_ENFORCE=0`
   if you need to keep the app running through a KV outage.
6. **Database (Neon) status** — Neon dashboard. Pretty reliable.

Don't skip step 1. "It must be the chain" is rarely the right first
guess.

---

## 12. Known TODOs (track as issues, not blockers)

### Infrastructure / data
- **Lua-CAS for `reserveAndSpend`.** The KV-backed read-then-write isn't
  a true compare-and-set. Under cross-container contention from the
  same wallet, two requests can both pass the cap. The on-chain CRwN
  allowance is the real ceiling so worst case is the soft-cap is briefly
  exceeded. Fix: ship a Lua script in Upstash that does atomic
  GET+CAS+SET. Wait for a real contention incident before doing this.
- **Decimal columns on Creator** (see §4 above) — `ALTER TABLE` to
  switch String columns to Decimal so atomic Prisma `{ increment }`
  becomes safe; remove the transaction wrapper afterward.
- **Backfilling Prisma rows into 0G.** New writes go to 0G; reads fall
  back to Prisma for legacy rows. No bulk migration scheduled.

### Testing / coverage
- **Wagmi-mocked hook tests.** `useCopyTrade`, `useSiweAuth`,
  `useCreateMarket`, `useBattleBetting` need a shared wagmi mock
  harness. Bigger lift; doesn't fit in a single PR.
- **Integration tests for `/api/markets/settle` + `/api/oracle/resolve`.**
  Both are CRON_SECRET-gated; need a test that mocks the chain layer
  and exercises the success path. Currently only the negative-auth
  path is covered.
- **E2E (Playwright) coverage.** Four specs exist; the deferred list:
  full battle lifecycle (create → bet → battle → resolve), market
  creation (approve → create → settle), copy-trade execution.

### UX / a11y
- **Real CSP header.** Currently set X-Frame-Options + nosniff +
  Permissions-Policy. CSP that's compatible with Tailwind + RainbowKit
  + wagmi is a separate plan.
- **Per-page ErrorBoundary on agent profile** (`/ai-agents/[id]/page.tsx`).
  Portfolio + battle/[id] are now wrapped; this last one is cosmetic.
- **Color contrast audit.** Yellow-on-stone is borderline WCAG AA;
  formal contrast testing with WAVE/axe deferred.
- **Modal focus trap on remaining modals.** ConfirmMirror,
  AcceptChallenge, CreateChallenge, Achievement, CreateMirrorMarket,
  TransferAgent, AuthorizeUsage — all wired via `useFocusTrap`. Audit
  the rest (~5-10 less-used modals) and apply the same hook.

### Hygiene
- **Console.* migration.** ~290 calls remaining. Touch only when
  migrating a file for another reason.
- **`/api/copy-trade/whale-mirror` retry logic.** Two cold-start
  parallel requests with the same idemKey now correctly serialize via
  KV `setIfNotExists` — but the loser returns "in flight" without
  polling for the result. A polling client UX improvement is a TODO.
- **Hardcoded sleep in `useCopyTrade`.** `setTimeout(resolve, 1000)` in
  [src/hooks/useCopyTrade.ts](src/hooks/useCopyTrade.ts) waits a fixed
  second after a chain switch. Replace with `useWaitForTransactionReceipt`
  or a chain-id poll. (The agents/route.ts and creator-revenue checks
  from earlier audits are already resolved.)

### Newer infra deferrals
- **CSP-policy ratification.** When wallet libs add CSP support, ship
  a strict CSP. Track: https://github.com/rainbow-me/rainbowkit/issues
- **Vercel preview SIWE.** Preview URLs aren't on `AUTH_ALLOWED_DOMAINS`
  by default — pasting an auth handshake URL into a preview deploy
  fails 401. Build-time injection of `VERCEL_URL` into the allowlist
  is the fix.

---

## 13. Developer pitfalls (notes for the next time)

- **NEVER use `git stash` mid-session to "just check the original."**
  `git stash` clears EVERY uncommitted change in the working tree, not
  just the one file you were investigating. Recovery via `git stash pop`
  works (no conflicts in our case) but it's a heart-stopping moment.
  If you need to check a file's git baseline, use
  `git show HEAD:path/to/file` instead — read-only, doesn't touch the
  working tree.
- **Counting `<div>` / `</div>` with grep is unreliable.** JSX template
  literals like `` className={`...${cond}`} `` followed by `<div` on
  the next line make naive grep counts off by 4–5. Trust the
  TypeScript compiler's "expected closing tag" error message — it
  knows the actual nesting. Don't try to balance by line counts.
- **Auto-mode tool notifications can be stale.** When a `<task-notification>`
  arrives for a task ID you started 30+ minutes ago, it's the original
  long-blocked process finally finishing — not a new event. Ignore it
  and continue with current state.
