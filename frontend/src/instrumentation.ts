/**
 * Next.js instrumentation hook — runs once at server startup.
 *
 * We use it to enforce environment validation in production: a misconfigured
 * deploy crashes immediately at boot with a single aggregated error message,
 * instead of failing per-request when a handler tries to read a missing var.
 *
 * Dev / test runs are left alone so local workflows aren't gated behind every
 * mainnet env var. The validator is also wired into CI via `npm run env:check`
 * (see package.json) so PRs that touch env requirements get checked before merge.
 *
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register(): Promise<void> {
  // Only run startup validation in production — dev/test should always boot.
  if (process.env.NODE_ENV !== 'production') return;

  // Skip on the edge runtime — env validation needs Node features. The same
  // validator runs in the Node runtime startup, which is what matters for
  // server actions / API routes.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { assertEnvOrThrow } = await import('./lib/envValidator');
  // Throws with an aggregated, actionable error if anything is missing.
  assertEnvOrThrow();
}
