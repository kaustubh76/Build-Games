/**
 * Orchestrator — runs every e2e seed script in order, then verifies UI.
 *
 * Usage:
 *   npx tsx scripts/e2e/run-all.ts
 *   E2E_API_BASE=http://localhost:3000 npx tsx scripts/e2e/run-all.ts
 *
 * Each child script handles its own DB writes + assertions. If a script
 * exits non-zero, the orchestrator stops immediately (better to surface
 * the first failure than to cascade).
 */
import './_lib/env';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const SCRIPTS = [
  '01-seed-warriors-and-leaderboard.ts',
  '02-seed-whale-tracker.ts',
  '03-seed-creator-dashboard.ts',
  '04-seed-prediction-battles.ts',
  '05-seed-external-markets.ts',
  '06-seed-copy-trading.ts',
  '07-seed-debate-and-comments.ts',
  '08-verify-ui-endpoints.ts',
];

const here = __dirname;
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';

const startedAt = Date.now();
const passed: string[] = [];
const failed: { script: string; code: number }[] = [];

for (const script of SCRIPTS) {
  console.log(`\n${BOLD}${CYAN}═════ ${script} ═════${RESET}`);
  const r = spawnSync('npx', ['tsx', path.join(here, script)], {
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status === 0) {
    passed.push(script);
  } else {
    failed.push({ script, code: r.status ?? -1 });
    console.error(`${RED}${script} failed with exit ${r.status}${RESET}`);
    break;
  }
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\n${BOLD}═════ summary ═════${RESET}`);
console.log(`  ${GREEN}passed${RESET}: ${passed.length}/${SCRIPTS.length}`);
if (failed.length > 0) {
  console.log(`  ${RED}failed${RESET}: ${failed.map((f) => f.script).join(', ')}`);
}
console.log(`  elapsed: ${elapsed}s`);

if (failed.length === 0) {
  console.log(`\n${GREEN}${BOLD}All seeds + verifications passed.${RESET}`);
  console.log(`Pages to spot-check in the browser:`);
  console.log(`  /leaderboard          → AI leaderboard rows`);
  console.log(`  /arena                → top warriors by rating`);
  console.log(`  /whale-tracker        → recent whale trades + tracked traders`);
  console.log(`  /creator-dashboard    → totals + fee history (sign in as test wallet)`);
  console.log(`  /prediction-arena     → battles in pending/active/completed tabs`);
  console.log(`  /external             → external markets + arbitrage tab`);
  console.log(`  /social/copy-trading  → follows + mirror history (sign in)`);
  console.log(`  /markets/debate       → debate cards + comments`);
  process.exit(0);
} else {
  process.exit(1);
}
