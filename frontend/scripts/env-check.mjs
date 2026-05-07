#!/usr/bin/env node
/**
 * env-check: standalone CLI runner for the envValidator. Prints a structured
 * report and exits 0 if valid, 1 if any required var is missing/malformed.
 *
 * Designed to run in CI BEFORE `next build` so a misconfigured deploy fails
 * at the env check, not three minutes later during build. Uses esbuild
 * (already a transitive dep) to strip TS types at runtime — no extra packages.
 *
 * Usage: node scripts/env-check.mjs
 *        npm run env:check
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const validatorPath = resolve(__dirname, '../src/lib/envValidator.ts');

// Compile envValidator.ts to a temporary CJS bundle.
const tmp = mkdtempSync(`${tmpdir()}/env-check-`);
const outFile = `${tmp}/envValidator.cjs`;

try {
  await build({
    entryPoints: [validatorPath],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    logLevel: 'silent',
  });
} catch (e) {
  console.error('[env-check] failed to compile validator:', e);
  process.exit(2);
}

// Dynamic import of the compiled bundle.
const { validateEnv } = await import(outFile);
const result = validateEnv(process.env);

// Print a structured report.
console.log(`[env-check] chainId=${result.chainId ?? 'unset'}`);
if (result.warnings.length) {
  console.log(`[env-check] WARNINGS (${result.warnings.length}):`);
  for (const w of result.warnings) console.log(`  - ${w}`);
}
if (result.errors.length) {
  console.log(`[env-check] ERRORS (${result.errors.length}):`);
  for (const e of result.errors) console.log(`  - ${e}`);
}

// Cleanup tmp dir.
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }

if (result.ok) {
  console.log('[env-check] OK');
  process.exit(0);
}
console.error('[env-check] FAIL — fix the errors above before deploying');
process.exit(1);
