# UI hardening — pass II

Continuation of [README.md](./README.md). This pass adds error-boundary coverage, the first Tier-2 read-side switch, defensive parsing on the AI-agent creation form, and consolidates the two env validators.

## ErrorBoundary mount points

[ErrorBoundary](../ErrorBoundary.tsx) was shipped during an earlier pass but was never mounted. It now wraps every page render via the root layout, plus per-tab boundaries on whale-tracker.

| Mount | Purpose |
|---|---|
| `app/layout.tsx` (`<ErrorBoundary context="root">`) | Catches any uncaught render error in the entire `{props.children}` subtree. Replaces blank-white-screen with a fallback containing the error ID + retry button. The Header, Footer, ToastContainer, and GamificationOverlay are OUTSIDE the boundary so chrome stays intact when main content crashes. |
| `app/whale-tracker/page.tsx` (3 × `<ErrorBoundary compact>`) | One per tab (`live`, `history`, `traders`). A crash in one tab doesn't kill its siblings. Compact mode shows a smaller fallback that fits the tab panel. |

Per-route boundaries on portfolio, prediction-arena/battle/[id], and ai-agents/[id] are intentionally left to the root boundary — those pages are unified flows where a sub-section crash should bubble.

### `lib/errorReporter.ts`

Single integration point for client-side error reporting. ErrorBoundary's `onError` callback (and any catch site that wants to surface a caught exception) calls `reportError(error, { context, errorId, meta })`.

- **Dev**: `console.error` with the error ID + meta — grep-friendly.
- **Prod**: same `console.error` (visible in Vercel function logs) + best-effort POST to `/api/internal/errors` (endpoint doesn't exist yet — POST silently no-ops on 404).

When we wire Sentry, change ONLY this file — replace the body with `Sentry.captureException`.

## Tier-2 read-side switch

The [Prisma → 0G migration](../../lib/storage/README.md) shipped Tier-2 dual-write but no consumer reads were switched. This pass switches **one** consumer end-to-end so the migration starts paying off:

`/api/portfolio/mirror` now reads from on-chain `MirrorTradeExecuted` events when `ENABLE_0G_TIER2=1`, with a Prisma fallback on RPC failure (so the page never goes blank during the rollout window).

- New helper: [`lib/eventQuery/mirrorTrades.ts`](../../lib/eventQuery/mirrorTrades.ts) — `decodeMirrorTradeLog` returns a row shape compatible with `Prisma.MirrorTrade` so downstream JSX/components don't need a single change. See the file's JSDoc for the field gap list.
- Tests: 4 unit tests in `test/unit/eventQuery/mirrorTrades.test.ts` cover decode + lowercase + safe defaults + invalid log handling.

The other ~12 Tier-2 read consumers are follow-ups; the pattern is established.

## ai-agents/create defensive parsing

The CRwN-amount inputs in `app/ai-agents/create/page.tsx` (3 fields: `stakeAmount`, `tradingLimits.maxPositionSize`, `tradingLimits.maxDailyExposure`) were `parseFloat(...) * 1e18` — silently produces `NaN` on bad input, then `BigInt(NaN)` throws.

Now: a top-of-`handleCreate` guard runs `parseEther(...)` on each field in a try/catch and surfaces a clean alert. The `stakeAmountWei` derivation is replaced with `parseEther` (safe inside the guarded block).

Three integer-shaped inputs (`minConfidence`, `lookbackPeriod`, `maxDailyTrades`) are out of scope here — they're 0–100 / 1–20 / 1–100 ranges, not token amounts; `useAmountInput` would be the wrong shape. They're left to a future pass that introduces `useIntegerInput` if the need recurs.

## Env validator consolidation

`app/layout.tsx` previously called `validateEnvironmentOrThrow()` from the legacy `lib/validateEnv.ts` on every server render. The canonical validator now lives in `lib/envValidator.ts` and runs once at boot via `instrumentation.ts` (Next 15's startup hook).

This pass:
- **Removed** the duplicate `validateEnvironmentOrThrow` call from `layout.tsx`.
- **Kept** `lib/validateEnv.ts` because its helper functions (`getRequiredEnv`, `validators`, `isProduction`, etc.) are general-purpose and not yet replaced by `envValidator.ts`. They have no current consumers beyond `layout.tsx`, so dropping the file outright is a follow-up.
- **Added** `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` to the canonical validator's `ENV_SPECS` table (was checked by the legacy validator only).

## What's deliberately NOT done this pass

- **Sentry / Datadog actual wiring.** `errorReporter.ts` is the swap point. The `/api/internal/errors` endpoint also doesn't exist yet — needs an infra decision before mounting.
- **Tier-2 read switch on the other 12 sites.** Pattern is proven; remaining sites are follow-ups.
- **Backfilling Prisma rows into 0G.** New writes go to 0G; reads fall back for legacy rows.
- **Deleting `lib/validateEnv.ts` entirely.** Helper functions might be useful; a separate pass migrates callers if any emerge.
- **Refactoring the 3 integer inputs in ai-agents/create.** Different validation shape from token amounts.
- **a11y / visual redesign / E2E expansion.** Stayed deferred.
