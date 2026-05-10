/**
 * E2E test harness — env loader.
 *
 * Loads `.env.test.local` (gitignored) and refuses to run against mainnet.
 * Every other module in scripts/e2e/_lib imports from here so the safety
 * gate can't be skipped by accident.
 */
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(__dirname, '../../..');
const ENV_PATH = path.join(ROOT, '.env.test.local');

if (!fs.existsSync(ENV_PATH)) {
  console.error(`[e2e] Missing ${ENV_PATH}. Create it with TEST_PRIVATE_KEY etc.`);
  process.exit(2);
}

loadDotenv({ path: ENV_PATH });
loadDotenv({ path: path.join(ROOT, '.env') });
loadDotenv({ path: path.join(ROOT, '.env.local'), override: false });

function require_(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[e2e] Missing required env var: ${name}`);
    process.exit(2);
  }
  return v;
}

export const TEST_PRIVATE_KEY = require_('TEST_PRIVATE_KEY');
export const TEST_WALLET_ADDRESS = require_('TEST_WALLET_ADDRESS').toLowerCase() as `0x${string}`;
export const TEST_RPC_URL = require_('TEST_RPC_URL');
export const TEST_CHAIN_ID = parseInt(require_('TEST_CHAIN_ID'), 10);

if (TEST_CHAIN_ID === 43114) {
  console.error('[e2e] FATAL: TEST_CHAIN_ID is mainnet (43114). Refusing to run.');
  process.exit(2);
}
if (TEST_CHAIN_ID !== 43113 && TEST_CHAIN_ID !== 31337) {
  console.error(`[e2e] FATAL: TEST_CHAIN_ID=${TEST_CHAIN_ID} is not Fuji or local. Refusing.`);
  process.exit(2);
}

export const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:3000';
export const RUN_ID = process.env.E2E_RUN_ID ?? `e2e-${Date.now()}`;

export const FUJI_CONTRACTS = {
  crownToken: '0xF0011ca65e3F6314B180a8848ae373042bAEc9b4' as `0x${string}`,
  warriorsNFT: '0x218d3efaB076bd03E278CDCf3B488AA107215b8a' as `0x${string}`,
  arenaFactory: '0xe9faCA292CEF42489AF4d20266964Fb6425AE122' as `0x${string}`,
  predictionArena: '0xE80C2eaDf7B4d0e2acD51a475c1a2ED4134D4Ad5' as `0x${string}`,
  marketFactory: '0x7E2e6eb2Ad58c4a9CE1aD5ccfFfc7e5e715753BA' as `0x${string}`,
  microMarketFactory: '0xd81373eEd88FacE56c21CFA4787c80C325e0bC6E' as `0x${string}`,
  externalMarketMirror: '0x1cfa9eD162f90B1eD6d9A01c504fFc28B7412473' as `0x${string}`,
  aiAgentINFT: '0xbAE259eeA7fd49F631dE44Ac8d4fd2eb6C7F8Cb8' as `0x${string}`,
  creatorRevenueShare: '0x05Ca49f32B482e0Dce58e39A22F31e5f56A43Ee7' as `0x${string}`,
} as const;
