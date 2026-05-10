# Architecture

A reference for new contributors: how data flows, what guards what, and
where to look when something breaks. Keep it short — long architecture
docs rot. This file lives next to the code it describes; update it when
the shape of the system changes.

## TL;DR

```
       ┌─────────────────┐     ┌─────────────────┐
       │  Browser (UI)   │     │  Vercel Cron    │
       └────────┬────────┘     └────────┬────────┘
                │ SIWE cookie           │ Bearer CRON_SECRET
                ▼                       ▼
       ┌─────────────────────────────────────────┐
       │   Next.js 15 App Router (this repo)     │
       │   ┌───────────┬──────────┬───────────┐  │
       │   │ middleware│  /api/*  │  pages    │  │
       │   └─────┬─────┴────┬─────┴───────────┘  │
       └─────────┼──────────┼─────────────────────┘
                 │          │
       ┌─────────▼──┐  ┌────▼─────────────────┐
       │  Postgres  │  │  Avalanche RPC       │
       │  (Prisma)  │  │  (viem + ethers)     │
       └────────────┘  └──────┬───────────────┘
                              │
                       ┌──────▼─────────┐
                       │  0G Storage    │  receipts, audit logs
                       └────────────────┘
```

Three external systems (Postgres, Avalanche, 0G) feed one Next.js app that
serves both the UI and the API. There is no separate backend service.

---

## Auth flow

1. **Connect wallet** → RainbowKit / wagmi handle the wallet handshake.
2. **Sign SIWE message** (`/api/auth/nonce` → sign → `/api/auth/verify`).
   The verify route validates the message domain against
   `AUTH_ALLOWED_DOMAINS` (production) or the request host (dev), checks
   the nonce is single-use via `nonceStore`, recovers the signing
   address with viem, and mints an HMAC-signed session JWT (HS256, 24h).
3. **Session cookie** is HttpOnly, Secure, SameSite=Lax. Every API request
   carries it.
4. **Route-level guard** — each state-changing route calls
   `requireSession()` or `requireSessionForAddress()` from
   `src/lib/auth/requireSession.ts`. In production these always enforce.
   In dev the default is "warn mode" (logs but passes through) so the
   integration suite can exercise routes without signing in.
5. **Middleware** (`src/middleware.ts`) is defense-in-depth — it does NOT
   replace the route guard.

Privileged routes that don't have a user (cron, settlement, oracle) are
gated by `requireCronSecret()` instead — Bearer token, not a session.

---

## Storage tiers (the Prisma → 0G migration)

We're moving from a Postgres-canonical world to a chain-canonical one with
0G Storage as the receipt layer. The migration runs in tiers, gated by env
flags so we can roll back any step without redeploying.

| Tier | Models | Flag | Behavior when on |
|---|---|---|---|
| 1 | SystemAudit, SyncLog, PriceSyncHistory, CreatorFeeEntry | `ENABLE_0G_AUDIT_LOGS=1` | Skip the Prisma write; persist only the 0G receipt. |
| 2 | MirrorTrade, MirrorCopyTrade, BattleBet, etc. | `ENABLE_0G_TIER2=1` | Reads switch to event-sourced (`getLogs` against the contract); Prisma is the fallback when RPC fails. Five routes wired so far: `/api/portfolio/{mirror,native}`, `/api/events/status`, `/api/metrics`, `/api/agents/[id]/external-trades`. |
| 3 | PredictionRound, AIDebateRound (child rows) | `ENABLE_0G_TIER3=1` | Children fold into the parent's `receiptRootHash`; Prisma child writes skipped. |

The event-sourced read path lives in `src/lib/eventQuery/` — paginated
`getLogs` calls with a 5s in-memory cache, plus per-event decoders
(`mirrorTrades.ts`, `nativeTrades.ts`, `agentTrades.ts`) that map viem
`Log` objects to Prisma-shape rows so the downstream JSX never needs to
care which source it's reading from.

---

## Where things live

| Concern | Path |
|---|---|
| App Router pages | `src/app/` (no `/api/` segment) |
| API routes | `src/app/api/**/route.ts` |
| Pages Router (legacy, narrow scope) | `src/pages/` |
| React hooks | `src/hooks/` |
| Services (server-side business logic) | `src/services/` |
| Shared lib (auth, storage, eventQuery, api helpers) | `src/lib/` |
| Constants + ABIs | `src/constants.ts`, `src/constants/abis/` |
| Prisma schema + migrations | `prisma/` |
| Tests | `test/{unit,dom,integration,soak,e2e}/` |

Skill-specific subdirs:
- `src/lib/auth/` — SIWE, session JWT, nonce store, route guards.
- `src/lib/storage/` — 0G receipt persistence, feature flags, READMEs.
- `src/lib/api/` — error handler, rate limiter, logger, the shared
  `applyRateLimit` + `handleAPIError` + `ErrorResponses` surface every
  route uses.
- `src/lib/eventQuery/` — Tier-2 event-sourced read helpers.
- `src/components/common/` — shared UI primitives (`<DataState>`,
  `<ConnectWalletPrompt>`, `<ErrorBoundary>`).

---

## Operational guards

| Guard | What it stops | Where it lives |
|---|---|---|
| `applyRateLimit` | DDoS, runaway client loops | `src/lib/api/rateLimit.ts` |
| `requireSession` | Anonymous mutation of user state | `src/lib/auth/requireSession.ts` |
| `requireCronSecret` | Anonymous calls to settlement / oracle | `src/lib/auth/requireCronSecret.ts` |
| `requireSessionForAddress` | "Address claim" forgery | `src/lib/auth/requireSession.ts` |
| Zod body schemas | Malformed input (BigInt overflow, prompt injection, etc.) | per-route |
| `<ErrorBoundary>` | Render-time crash → blank page | `src/components/ErrorBoundary.tsx`, mounted in root layout |
| Resilient viem client | Single-RPC outage | `src/lib/viemClient.ts` |
| Daily spend cap (mirror trades) | Drained user accounts on autopilot | `src/lib/safetyLimits.ts` |

---

## Rollout playbook

1. **Land code on `main`.** Tests + typecheck + build pass on PR.
2. **Vercel preview deploy.** Manually exercise the touched routes.
3. **Promote to production.** Vercel handles the cutover.
4. **Flip a feature flag** (`ENABLE_0G_TIER2=1`, `AUTH_ENFORCE=1`, etc.)
   in Vercel env settings. No redeploy needed for an env flip; the next
   request reads the new value.
5. **Monitor.** `/api/metrics` and `/api/events/status` surface the
   live state; `/api/internal/metrics` returns the in-process counters.
6. **Roll back** by flipping the flag off (no redeploy). For code-level
   rollbacks, use Vercel's instant rollback to the prior deployment.

---

## Cross-container state (Vercel KV)

Four primitives that need to be consistent across containers are KV-backed
(Vercel KV / Upstash Redis):

| Primitive | File | Why KV |
|---|---|---|
| Rate limiter (counters per IP/wallet+route) | `src/lib/api/rateLimit.ts` | Cold-start race: two containers each pass the cap |
| SIWE nonce store | `src/lib/auth/nonceStore.ts` | Issue on container A, verify on container B → "Invalid nonce" |
| Whale-mirror idempotency cache | `src/app/api/copy-trade/whale-mirror/route.ts` | Two parallel duplicate requests both run the heavy work |
| Daily-spend tracker (`reserveAndSpend`) | `src/lib/safetyLimits.ts` | Cross-container double-debit of the daily cap |

All four sit behind a thin wrapper at `src/lib/kv/index.ts`:
- **Production**: `@vercel/kv` (Upstash REST) when `KV_REST_API_URL` +
  `KV_REST_API_TOKEN` are set.
- **Dev / test / CI**: a Map-backed in-memory shim with the same API
  surface. No KV instance required to run tests; the unit suite exercises
  the shim directly.

Limitations:
- The KV-backed `reserveAndSpend` is read-then-write, NOT a true CAS —
  under genuine cross-container contention from the same wallet, two
  requests CAN observe the same baseline and both debit. The on-chain
  CRwN allowance is the real ceiling, so the worst case is the soft cap
  is briefly exceeded before the chain rejects. A Lua-script CAS path
  is the proper fix; tracked as TODO until contention surfaces in prod.

## What's NOT here (yet)

- **Sentry / OTel.** `src/lib/errorReporter.ts` is the swap point — once
  we add the SDK, it's a one-import change.
- **Real CSP.** Tailwind / RainbowKit / wagmi need inline-style + worker
  permissions; a CSP compatible with the wallet libs is a separate plan.
  X-Frame-Options + nosniff + Permissions-Policy are set today.
- **Decimal columns on Creator.** `totalVolumeGenerated`,
  `totalFeesEarned`, `pendingRewards` are stored as Strings; the route
  uses a transaction wrapper for safety. Migrating to Decimal would
  unlock atomic Prisma `{ increment }`. Out of this pass — needs an
  ALTER TABLE + a deploy window.

---

## When something breaks

- **"All my requests are 401."** Session cookie didn't survive the request.
  Check that cookies are HttpOnly+SameSite=Lax (default), and that the
  client sends `credentials: 'include'` on cross-origin fetches.
- **"Settle / resolve returns 503."** `CRON_SECRET` isn't set on this
  deployment. Production requires it.
- **"SIWE fails with 'Invalid sign-in message'."** Production rejected
  the domain. Confirm the message's domain field is in
  `AUTH_ALLOWED_DOMAINS`.
- **"`/api/portfolio/mirror` returns empty."** Check
  `ENABLE_0G_TIER2=1` is set AND the chain has events. The route falls
  back to Prisma on RPC error — look for `[portfolio/mirror]
  event-sourced read failed` in logs.
- **"Build fails with cryptic React-types errors."**
  `next.config.ts` sets `typescript.ignoreBuildErrors = true` because
  the codebase has a known 6,891-error baseline from a transitive
  React-types version conflict. New errors surface only via
  `npx tsc --noEmit`. CI runs that separately.
- **"`Invalid or expired sign-in nonce` errors after deploy."**
  `KV_REST_API_URL` / `KV_REST_API_TOKEN` not set. Without KV, the SIWE
  nonce lives in per-container memory; `/api/auth/nonce` and
  `/api/auth/verify` may land on different containers and the verify
  fails. Set the KV env vars in Vercel's Storage panel.
- **"Rate limits feel inconsistent."** Same root cause as above —
  without KV, counters are per-container; cold-starts and parallel
  containers each get a fresh budget.
