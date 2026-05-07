/**
 * Fuji RPC sanity smoke
 *
 * The bare minimum: confirm the public RPC URL we use everywhere actually
 * works, the deployed ExternalMarketMirror contract responds, and our ABI
 * shape matches what the chain returns. If THIS fails, every downstream
 * integration test will fail with worse error messages.
 *
 * View-only — costs nothing.
 */

import { describe, it, expect } from 'vitest';
import { keccak256, encodePacked } from 'viem';
import { AVALANCHE_CONTRACTS } from '@/lib/apiConfig';
import { EXTERNAL_MARKET_MIRROR_ABI } from '@/constants/abis/externalMarketMirrorAbi';
import { getResilientPublicClient } from '@/lib/viemClient';

describe('Fuji RPC sanity (resilient client with primary→fallback)', () => {
  // Uses the production resilient client so a rate-limited primary RPC
  // (which is the steady state on Fuji's free public endpoint) doesn't
  // cascade-fail the suite.
  const client = getResilientPublicClient();

  it('returns a current block number', async () => {
    const block = await client.getBlockNumber();
    expect(block).toBeGreaterThan(0n);
    // Sanity: block height should be >50M on Fuji as of mid-2026
    expect(block).toBeGreaterThan(50_000_000n);
  });

  it('chain id matches Fuji', async () => {
    const id = await client.getChainId();
    expect(id).toBe(43113);
  });

  it('ExternalMarketMirror contract responds to getMirrorKey (pure)', async () => {
    const mirrorKey = (await client.readContract({
      address: AVALANCHE_CONTRACTS.externalMarketMirror as `0x${string}`,
      abi: EXTERNAL_MARKET_MIRROR_ABI,
      functionName: 'getMirrorKey',
      args: [0, 'fuji-rpc-smoke'],
    })) as `0x${string}`;

    expect(mirrorKey).toMatch(/^0x[0-9a-f]{64}$/);
    // getMirrorKey is deterministic; recompute it locally and assert match.
    const expected = keccak256(encodePacked(['uint8', 'string'], [0, 'fuji-rpc-smoke']));
    expect(mirrorKey).toBe(expected);
  });

  it('totalMirrors returns a uint256', async () => {
    const total = (await client.readContract({
      address: AVALANCHE_CONTRACTS.externalMarketMirror as `0x${string}`,
      abi: EXTERNAL_MARKET_MIRROR_ABI,
      functionName: 'totalMirrors',
    })) as bigint;
    expect(typeof total).toBe('bigint');
    expect(total).toBeGreaterThanOrEqual(0n);
  });
});
