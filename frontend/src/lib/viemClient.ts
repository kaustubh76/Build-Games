/**
 * Resilient viem PublicClient factory.
 *
 * Wraps the primary + fallback Avalanche RPC URLs in viem's `fallback` transport,
 * which automatically retries against the next URL when the current one fails
 * (rate-limit, timeout, 5xx). This is the cure for "Fuji is rate-limited"
 * cascades that block CI integration tests.
 *
 * Usage:
 *   import { getResilientPublicClient } from '@/lib/viemClient';
 *   const client = getResilientPublicClient();
 *   const block = await client.getBlockNumber();
 */

import { createPublicClient, fallback, http } from 'viem';
import { avalancheFuji, avalanche } from 'viem/chains';
import { getAvalancheRpcUrl, getAvalancheFallbackRpcUrl, getChainId } from '@/constants';

interface ResilientClientOpts {
  /** Per-RPC request timeout (ms). Default 15s. */
  timeoutMs?: number;
  /** How many retries the fallback transport itself does on a single endpoint
   *  before flipping to the next. Default 1 (= one retry, then fail over). */
  retryCount?: number;
  /** ms to wait between retries (gets exponentially backed off by viem). */
  retryDelayMs?: number;
}

/**
 * Create a viem PublicClient with primary → fallback failover.
 *
 * Falls through silently when the primary RPC rate-limits, errors, or times
 * out. The fallback transport ranks endpoints by latency over time, so
 * persistent slowness on one RPC eventually demotes it.
 */
export function getResilientPublicClient(opts: ResilientClientOpts = {}) {
  const chainId = getChainId();
  const chain = chainId === 43114 ? avalanche : avalancheFuji;
  const primary = getAvalancheRpcUrl();
  const fallbackUrl = getAvalancheFallbackRpcUrl();
  const timeout = opts.timeoutMs ?? 15_000;
  const retryCount = opts.retryCount ?? 1;
  const retryDelay = opts.retryDelayMs ?? 250;

  const transports = [
    http(primary, { timeout, retryCount, retryDelay }),
    // Only add the fallback if it's actually different from the primary.
    ...(fallbackUrl && fallbackUrl !== primary
      ? [http(fallbackUrl, { timeout, retryCount, retryDelay })]
      : []),
  ];

  return createPublicClient({
    chain,
    transport: fallback(transports, {
      // Bug #3 fix: viem's default rank weights are latency-dominant, which
      // means a fast-failing primary (e.g. one that 429s in 5ms) stays ranked
      // above a slower-but-healthy fallback (e.g. one that succeeds in 200ms).
      // Stability weight 0.7 makes consistent successes outrank fast failures.
      // Re-rank every 10s.
      rank: {
        interval: 10_000,
        weights: { latency: 0.3, stability: 0.7 },
      },
    }),
  });
}
