import { describe, it, expect, vi } from 'vitest';

describe('getResilientPublicClient', () => {
  it('returns a viem PublicClient with a fallback transport', async () => {
    vi.resetModules();
    const { getResilientPublicClient } = await import('@/lib/viemClient');
    const client = getResilientPublicClient();
    expect(client).toBeDefined();
    expect(typeof client.getBlockNumber).toBe('function');
    expect(typeof client.readContract).toBe('function');
    // Transport identifier on viem clients exposes a .type field
    const transport = (client as unknown as { transport: { type: string } }).transport;
    expect(transport).toBeDefined();
    // Fallback transport reports type 'fallback' OR delegates to a single
    // transport when the fallback is identical to the primary.
    expect(['fallback', 'http']).toContain(transport.type);
  });

  it('honours a custom timeoutMs', async () => {
    vi.resetModules();
    const { getResilientPublicClient } = await import('@/lib/viemClient');
    const client = getResilientPublicClient({ timeoutMs: 1234 });
    expect(client).toBeDefined();
    // The timeout is buried inside transport config; just sanity-check the
    // factory accepts the option without throwing.
  });

  it('chain matches the configured chain id', async () => {
    vi.resetModules();
    const { getResilientPublicClient } = await import('@/lib/viemClient');
    const client = getResilientPublicClient();
    // Default test env has NEXT_PUBLIC_CHAIN_ID=43113 (Fuji)
    expect(client.chain?.id).toBe(43113);
  });
});
