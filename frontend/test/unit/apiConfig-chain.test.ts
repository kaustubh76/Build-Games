/**
 * apiConfig.ts contract-address resolution: verifies the chain-aware lookup
 * and the refusal-to-start guard for zero/empty addresses on non-local chains.
 *
 * Resolution order (per apiConfig.ts):
 *   1. Per-contract env override (NEXT_PUBLIC_*)
 *   2. chainsToContracts[chainId] from constants.ts
 *   3. Throws at module-load if the resolved value is empty or 0x0…0
 *      on any chain other than 31337 (local).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Strip any contract overrides + chain ID to start clean.
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('NEXT_PUBLIC_') && k.endsWith('_TOKEN')) delete process.env[k];
  }
  delete process.env.NEXT_PUBLIC_CHAIN_ID;
  delete process.env.NEXT_PUBLIC_CROWN_TOKEN;
  delete process.env.NEXT_PUBLIC_PREDICTION_MARKET;
  delete process.env.NEXT_PUBLIC_AI_AGENT_REGISTRY;
  delete process.env.NEXT_PUBLIC_AI_DEBATE_ORACLE;
  delete process.env.NEXT_PUBLIC_OUTCOME_TOKEN;
  delete process.env.NEXT_PUBLIC_CREATOR_REVENUE;
  delete process.env.NEXT_PUBLIC_WARRIORS_NFT;
  delete process.env.NEXT_PUBLIC_ARENA_FACTORY;
  delete process.env.NEXT_PUBLIC_EXTERNAL_MARKET_MIRROR;
  delete process.env.NEXT_PUBLIC_AI_AGENT_INFT;
  delete process.env.NEXT_PUBLIC_AGENT_INFT_ORACLE;
  vi.resetModules();
});

afterEach(() => {
  // Restore the original env so other tests aren't disturbed.
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v !== undefined) process.env[k] = v;
  }
  vi.resetModules();
});

describe('apiConfig contract resolution', () => {
  it('resolves Fuji addresses from chainsToContracts when NEXT_PUBLIC_CHAIN_ID=43113 and no overrides', async () => {
    process.env.NEXT_PUBLIC_CHAIN_ID = '43113';
    const { AVALANCHE_CONTRACTS } = await import('@/lib/apiConfig');
    expect(AVALANCHE_CONTRACTS.crownToken).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // Specifically the deployed Fuji CRwN address (per constants.ts).
    expect(AVALANCHE_CONTRACTS.crownToken.toLowerCase()).toBe(
      '0xf0011ca65e3f6314b180a8848ae373042baec9b4'
    );
  });

  it('honours per-contract env override (env wins over chainsToContracts)', async () => {
    process.env.NEXT_PUBLIC_CHAIN_ID = '43113';
    const customAddr = '0x' + 'ff'.repeat(20);
    process.env.NEXT_PUBLIC_CROWN_TOKEN = customAddr;
    const { AVALANCHE_CONTRACTS } = await import('@/lib/apiConfig');
    expect(AVALANCHE_CONTRACTS.crownToken).toBe(customAddr);
  });

  it('REFUSES to load on mainnet (43114) when contracts are zero-address placeholders', async () => {
    process.env.NEXT_PUBLIC_CHAIN_ID = '43114';
    let caught: Error | null = null;
    try {
      await import('@/lib/apiConfig');
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught!.message).toContain('Refusing to start');
    expect(caught!.message).toContain('43114');
  });

  it('loads on mainnet when all per-contract env overrides are set', async () => {
    process.env.NEXT_PUBLIC_CHAIN_ID = '43114';
    process.env.NEXT_PUBLIC_CROWN_TOKEN = '0x' + 'aa'.repeat(20);
    process.env.NEXT_PUBLIC_PREDICTION_MARKET = '0x' + 'bb'.repeat(20);
    process.env.NEXT_PUBLIC_AI_AGENT_REGISTRY = '0x' + 'cc'.repeat(20);
    process.env.NEXT_PUBLIC_AI_DEBATE_ORACLE = '0x' + 'dd'.repeat(20);
    process.env.NEXT_PUBLIC_OUTCOME_TOKEN = '0x' + 'ee'.repeat(20);
    process.env.NEXT_PUBLIC_CREATOR_REVENUE = '0x' + '11'.repeat(20);
    process.env.NEXT_PUBLIC_WARRIORS_NFT = '0x' + '22'.repeat(20);
    process.env.NEXT_PUBLIC_ARENA_FACTORY = '0x' + '33'.repeat(20);
    process.env.NEXT_PUBLIC_EXTERNAL_MARKET_MIRROR = '0x' + '44'.repeat(20);
    process.env.NEXT_PUBLIC_AI_AGENT_INFT = '0x' + '55'.repeat(20);
    process.env.NEXT_PUBLIC_AGENT_INFT_ORACLE = '0x' + '66'.repeat(20);

    const { AVALANCHE_CONTRACTS } = await import('@/lib/apiConfig');
    expect(AVALANCHE_CONTRACTS.crownToken).toBe('0x' + 'aa'.repeat(20));
    expect(AVALANCHE_CONTRACTS.warriorsNFT).toBe('0x' + '22'.repeat(20));
    expect(AVALANCHE_CONTRACTS.externalMarketMirror).toBe('0x' + '44'.repeat(20));
  });

  it('allows zero-addresses on local chain (31337) for test fixtures', async () => {
    process.env.NEXT_PUBLIC_CHAIN_ID = '31337';
    const { AVALANCHE_CONTRACTS } = await import('@/lib/apiConfig');
    // Local chain explicitly uses zero placeholders — should not throw.
    expect(AVALANCHE_CONTRACTS.crownToken).toBe('0x0000000000000000000000000000000000000000');
  });
});
