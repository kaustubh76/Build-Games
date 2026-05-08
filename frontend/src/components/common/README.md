# UI hardening utilities

Three shared primitives shipped in the UI hardening pass. Use these instead
of hand-rolling loading spinners, error toasts, or input validators on each
page.

## `<DataState>`

Canonical loading / error / empty / loaded wrapper for any page that fetches
data. Mirrors the pattern that was already inline in `UnifiedPortfolio`.

```tsx
import { DataState } from '@/components/common/DataState';

const { data, loading, error, refetch } = useSomeQuery();

<DataState
  loading={loading}
  error={error}
  empty={!loading && !error && data.length === 0}
  onRetry={refetch}
  emptyTitle="No positions yet"
  emptyHint="Place your first mirror trade to get started."
  emptyCta={{ label: 'Browse markets', href: '/markets' }}
>
  <PositionList items={data} />
</DataState>
```

Props:
- `loading` — boolean. Renders the loading branch (spinner + caption).
- `error` — `string | Error | null`. Renders the red error card with optional retry button.
- `empty` — boolean. Renders the centered empty state with icon + title + hint + CTA.
- `onRetry` — fired by the Retry button in the error branch.
- `emptyCta` — `{ label, href? , onClick? }`. `href` renders a `<Link>`; `onClick` renders a `<button>`.
- `loadingSkeleton` — optional ReactNode override for the loading branch (use a custom skeleton matching your row shape).
- `loadingCaption` — caption shown next to the spinner. Default: `"Loading…"`.

Branch precedence: `loading > error > empty > children`. Loading wins over a stale error so refetches don't flash the previous failure.

Wired today: `app/portfolio/page.tsx`, `app/whale-tracker/page.tsx`. New pages should use it; pages with already-correct loading/error/empty branches don't need to migrate.

## `useAmountInput`

Controlled hook for token-amount `<input>`s. Replaces the raw `setAmount(e.target.value)` pattern that lets users paste `1e10`, `-5`, or `0.0000…01`.

```tsx
import { useAmountInput } from '@/hooks/useAmountInput';

const {
  value, onChange, error, isValid, parsedWei, setValue, reset,
} = useAmountInput({ max: 1000, unit: 'CRwN' });

<input
  type="text"
  inputMode="decimal"
  value={value}
  onChange={onChange}
  className={error ? 'border-red-500' : ''}
/>
{error ? <p role="alert">{error}</p> : null}

<button disabled={!isValid} onClick={() => submit(parsedWei!)}>Submit</button>
```

Catches: empty / whitespace, non-numeric, negative, scientific notation, more than `decimals` decimals (default 18), `≤ min` (default 0 exclusive), `> max`.

`parsedWei` is `bigint | null` — submit handlers can use `if (!parsedWei) return` instead of `try { BigInt(...) }`.

Wired today: `MirrorMarketTradePanel`, `MicroMarketTradePanel`, `CopyTradeSettings`, `FollowButton`. Additional callers (CreateMirrorMarketModal, LiveBattleView, CreateChallengeModal, home page mint, ai-agents/create) should adopt the same pattern.

## `useAddressInput`

Controlled hook for Ethereum-address `<input>`s. Trims whitespace, validates via viem's `isAddress`, and surfaces a normalized lowercase form for downstream comparisons.

```tsx
import { useAddressInput } from '@/hooks/useAddressInput';

const { value, onChange, error, isValid, normalized } = useAddressInput({
  forbidEqualTo: myAddress,  // optional — block self-references
});
```

Returns: `value` (raw input string), `error` (null when valid or empty), `isValid`, `normalized` (`0x${string}` lowercase, null when invalid).

## What's deliberately not provided

- A toast/snackbar primitive — use `useNotifications()` from `@/contexts/NotificationContext` instead.
- A skeleton library — pages that need a custom skeleton shape pass it via `<DataState loadingSkeleton={...}>`.
- A modal primitive — modals already use `fixed inset-0 z-50 flex items-center justify-center` with `max-w-* mx-4 max-h-[90vh] overflow-y-auto` containers. No abstraction yet because the pattern is small and modals vary too much in inner content.
