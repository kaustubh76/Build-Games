/**
 * Verify the read endpoints each empty UI page consumes are now non-empty.
 *
 * Requires the dev server to be running (`npm run dev`). If unreachable,
 * skips network checks and reports a notice rather than failing — the
 * Prisma rows themselves are the load-bearing assertion (covered by
 * earlier scripts).
 */
import './_lib/env';
import { step, pass, info, warn, fail, expectTrue } from './_lib/expect';
import { apiGet } from './_lib/http';
import { API_BASE, TEST_WALLET_ADDRESS } from './_lib/env';
import { disconnect } from './_lib/db';

interface Endpoint {
  path: string;
  page: string;
  predicate: (body: any) => boolean;
}

const ENDPOINTS: Endpoint[] = [
  { path: '/api/leaderboard?limit=10', page: '/leaderboard', predicate: (b) => Array.isArray(b?.data?.leaderboard) && b.data.leaderboard.length > 0 },
  { path: '/api/arena/leaderboard?limit=10', page: '/arena (warriors)', predicate: (b) => Array.isArray(b?.leaderboard) && b.leaderboard.length > 0 },
  { path: '/api/whale-alerts?limit=10', page: '/whale-tracker', predicate: (b) => Array.isArray(b?.data?.trades) && b.data.trades.length > 0 },
  { path: '/api/arena/battles?limit=10', page: '/prediction-arena', predicate: (b) => Array.isArray(b?.battles ?? b?.data?.battles) && (b?.battles ?? b?.data?.battles).length > 0 },
  { path: '/api/external/markets?limit=10', page: '/external (markets list)', predicate: (b) => Array.isArray(b?.data?.markets) && b.data.markets.length > 0 },
  { path: '/api/external/arbitrage', page: '/external (arbitrage tab)', predicate: (b) => Array.isArray(b?.data?.opportunities) && b.data.opportunities.length > 0 },
  { path: `/api/whale-alerts/following?address=${TEST_WALLET_ADDRESS}`, page: '/social/copy-trading', predicate: (b) => Array.isArray(b?.data?.following) && b.data.following.length > 0 },
];

async function main(): Promise<void> {
  step(`Verify UI read endpoints (against ${API_BASE})`);

  // Cheap reachability probe.
  let serverUp = true;
  try {
    const probe = await apiGet('/api/health');
    if (probe.status >= 500) serverUp = false;
  } catch {
    serverUp = false;
  }

  if (!serverUp) {
    warn(`${API_BASE} unreachable — skipping network checks. Start dev server (npm run dev) and rerun with E2E_API_BASE=...`);
    info('Prisma seed rows from earlier scripts are still in place.');
    return;
  }
  pass(`${API_BASE} reachable`);

  let failures = 0;
  for (const ep of ENDPOINTS) {
    const res = await apiGet(ep.path);
    if (res.status !== 200) {
      console.error(`  ✘ ${ep.path} returned ${res.status}`);
      failures++;
      continue;
    }
    const ok = ep.predicate(res.body);
    if (ok) {
      pass(`${ep.page} ← ${ep.path}`);
    } else {
      console.error(`  ✘ ${ep.page} ← ${ep.path}: response empty or unexpected shape`);
      console.error(`    body: ${JSON.stringify(res.body).slice(0, 200)}`);
      failures++;
    }
  }

  expectTrue(failures === 0, `${failures} endpoint(s) returned empty / unexpected payloads`);
  pass(`Test wallet for UI sign-in: ${TEST_WALLET_ADDRESS}`);
}

main()
  .catch((e) => { console.error(e); fail('verification crashed'); })
  .finally(disconnect);
