# Auth: SIWE sessions

Sign-In with Ethereum (EIP-4361) flow that mints a 24h HttpOnly session cookie,
used by the route-level `requireSessionForAddress(request, claimedAddress)`
guard to verify that the caller actually owns the wallet address they claim
in the request body.

## Flow

```
1. GET  /api/auth/nonce            → { nonce, expiresAt }    (single-use, 5min)
2. <user signs EIP-4361 message in their wallet>
3. POST /api/auth/verify           → mints HttpOnly cookie 'wai_session' (24h)
   { message, signature }
4. ...                             → cookie attached automatically on /api/* fetch
5. GET  /api/auth/session          → { address, expiresAt } | 401
6. POST /api/auth/logout           → cookie cleared, jti revoked
```

## Files

| File | Role |
|---|---|
| `siwe.ts` | EIP-4361 message format/parse + load-bearing assertion (domain, chainId, nonce, freshness) |
| `nonceStore.ts` | In-process single-use nonce map (5-min TTL, bounded LRU) |
| `session.ts` | HMAC-signed session JWT (HS256, 24h) + per-instance jti revocation |
| `requireSession.ts` | Route guards: `requireSession()`, `requireSessionForAddress()`, `getOptionalSession()` |
| `verifySignature.ts` | Legacy per-request header signing (kept for back-compat during rollout) |
| `index.ts` | Legacy session/role machinery (deprecated; do not extend) |

Client-side: see `frontend/src/hooks/useSiweAuth.ts` and `frontend/src/components/auth/SiweGate.tsx`.

## Rollout (warn → enforce)

The route guards and middleware are gated by two flags so we can ship the
client-side flow without breaking unupdated callers:

| Env var | Default | Effect |
|---|---|---|
| `AUTH_ENFORCE=1` | unset | Route handlers throw 401/403 on missing/mismatched session. When unset (default), missing/mismatched sessions just log a warning and pass through. |
| `AUTH_ENFORCEMENT_MODE=enforce` | `warn` | Middleware returns 401 on protected routes without a session cookie. When `warn`, it just logs + adds `X-Auth-Warning` response header. |

Recommended sequence:
1. Ship Day 1+2+3 (this PR) with **both flags unset**. Existing clients keep working; new clients pick up the cookie.
2. Monitor `[AUTH] WARN:` log lines for ~1 week to confirm the bulk of traffic is cookie-bearing.
3. Set `AUTH_ENFORCE=1`. Route handlers now reject mismatched sessions.
4. Set `AUTH_ENFORCEMENT_MODE=enforce`. Middleware short-circuits unauthenticated traffic.

## Per-instance trade-offs (matches the rest of the codebase)

- **Nonce store** is in-process. A user who lands on a different Vercel
  instance for /verify than they did for /nonce will get a "nonce mismatch"
  and just retry. Cheap.
- **Session jti revocation** is in-process. After /logout, the cookie is
  cleared client-side; on the rare cold-start case where a logged-out user
  reuses their cookie before its 24h TTL, that request would still verify.
  Same trade-off the rate-limit and idem-cache layers already accept.
- **Session secret** is HMAC, not RSA, so verify is stateless across instances
  — only the revocation set is per-instance.

## High-risk routes guarded today (10)

`requireSessionForAddress(request, body.<addressField>)` is wired into:

- `POST /api/copy-trade/whale-mirror` — `userAddress`
- `POST /api/mirror/execute` — `walletAddress` (trade) / `userAddress` (vrfCopyTrade)
- `POST /api/whale-alerts/follow` — `userAddress`
- `POST /api/whale-alerts/unfollow` — `userAddress`
- `POST /api/whale-alerts/update-config` — `userAddress`
- `POST /api/whale-alerts/subscribe-telegram` — `userAddress`
- `DELETE /api/whale-alerts/subscribe-telegram?address=` — query `address`
- `POST /api/markets/user-create` — `creatorAddress`
- `POST /api/creator/record-fee` — `creatorAddress`
- `POST /api/arena/betting` — `bettorAddress`

## Out of scope (follow-ups)

- Distributed session/nonce store (Upstash) — current per-instance trade-off is acceptable.
- Role/permission system (the legacy `lib/auth/index.ts:roles` machinery).
- Rate-limit + auth fusion (per-wallet limits already keyed off body address).
- E2E Playwright SIWE test against a wallet mock.
- Migrating remaining ~30 Prisma-write routes (agents/external-trade, agents/execute-trade, etc.) — risk-tier 2.
