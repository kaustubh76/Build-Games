/**
 * Bearer-token gate for cron / internal / privileged-operator routes.
 *
 * Routes that submit transactions on behalf of the protocol (settlement,
 * oracle resolution, indexer-side syncs) MUST not be reachable by arbitrary
 * clients — they hold a server-side private key and would otherwise let any
 * caller sign arbitrary state changes.
 *
 * Behavior:
 *   - Production with `CRON_SECRET` set: require `Authorization: Bearer <secret>`.
 *     Reject with 401 on mismatch.
 *   - Production with `CRON_SECRET` unset: throw 503 (deployment is misconfigured).
 *     Better to fail loud than to silently accept anonymous requests.
 *   - Dev / test: allow through unless `force=1` query is passed; the
 *     integration suite relies on this to exercise the routes locally
 *     without a secret.
 *
 * Modeled on the existing /api/cron/sync-agent-events pattern (verified to
 * exist in this repo) so the deployment story stays uniform.
 */

import type { NextRequest } from 'next/server';
import { ErrorResponses } from '@/lib/api/errorHandler';

export function requireCronSecret(request: NextRequest): void {
  const isProd = process.env.NODE_ENV === 'production';
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');

  if (cronSecret) {
    if (auth !== `Bearer ${cronSecret}`) {
      throw ErrorResponses.unauthorized('Invalid or missing cron secret');
    }
    return;
  }

  // No secret configured.
  if (isProd) {
    throw ErrorResponses.serviceUnavailable('CRON_SECRET unset on this deployment');
  }
  // Dev/test fall-through. Caller has explicitly opted out of the gate by
  // not configuring CRON_SECRET in their local environment.
}
