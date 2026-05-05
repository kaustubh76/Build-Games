/**
 * Vitest setup — runs once before any test file.
 *
 * - Loads .env.local + .env so tests have NEXT_PUBLIC_AVALANCHE_RPC_URL etc.
 * - Provides a default CRON_SECRET for sync-agent-events tests.
 * - Registers @testing-library/jest-dom matchers IFF a DOM env is active.
 */

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { afterEach } from 'vitest';

// Load env. Vercel-style cascade: .env.local overrides .env.
loadEnv({ path: path.resolve(__dirname, '../.env.local'), override: false });
loadEnv({ path: path.resolve(__dirname, '../.env'), override: false });

// Sane defaults for tests that don't need real values
process.env.NEXT_PUBLIC_CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || '43113';
process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL =
  process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret';

// Conditional jest-dom: only registers when running in a happy-dom env.
// Use dynamic import (works in both CJS + ESM contexts vitest may run under).
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());
}
