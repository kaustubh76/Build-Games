/**
 * Unit tests for zgComputeService — pin the singleton + ack-latch + top-up
 * behavior that was buggy in the prior implementation.
 *
 * Bugs being regressed against:
 *   1. Concurrent first-call race re-running ack/top-up.
 *   2. Lockout when ack throws (acknowledgeInProgress stuck true forever).
 *   3. Unconditional top-up burning 2 0G per cold start.
 *
 * The 0G SDK is mocked at the module level so we can simulate ack failures
 * + low/high ledger balances without touching the real network.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// SDK mock — must be hoisted before the service module is imported.
const mockBroker = {
  inference: {
    acknowledgeProviderSigner: vi.fn(),
    getServiceMetadata: vi.fn(),
    getRequestHeaders: vi.fn(),
  },
  ledger: {
    getLedger: vi.fn(),
    transferFund: vi.fn(),
  },
};
const mockCreateBroker = vi.fn(async () => mockBroker);

vi.mock('@0glabs/0g-serving-broker', () => ({
  createZGComputeNetworkBroker: mockCreateBroker,
}));

// ethers is real but the wallet/provider don't actually do RPC in tests
// because we never hit the inference endpoint via fetch (it's mocked below).

// Provide env vars so isZgComputeConfigured() returns true.
process.env.ZG_PRIVATE_KEY = '0x' + '1'.repeat(64);
process.env.ZG_COMPUTE_PROVIDER = '0xa48f01287233509FD694a22Bf840225062E67836';
process.env.ZG_EVM_RPC = 'http://localhost:9999';

// Stub global fetch for the inference HTTP call.
const fetchStub = vi.fn();
(global as { fetch: typeof fetch }).fetch = fetchStub as unknown as typeof fetch;

beforeEach(async () => {
  vi.clearAllMocks();
  mockCreateBroker.mockReturnValue(mockBroker);
  mockBroker.inference.acknowledgeProviderSigner.mockResolvedValue(undefined);
  mockBroker.inference.getServiceMetadata.mockResolvedValue({
    endpoint: 'http://compute.example',
    model: 'mock-model',
  });
  mockBroker.inference.getRequestHeaders.mockResolvedValue({ 'x-fee': 'sig' });
  mockBroker.ledger.getLedger.mockResolvedValue({ totalBalance: BigInt(10) * BigInt(10 ** 18) });
  mockBroker.ledger.transferFund.mockResolvedValue(undefined);

  fetchStub.mockReset();
  // Return a FRESH Response each invocation — Response bodies are
  // single-use, so retrying after a 429/500 must hand the next attempt a
  // new instance or `.json()` / `.text()` throws "Body is unusable".
  fetchStub.mockImplementation(
    async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'PONG' } }] }), { status: 200 })
  );

  // Reset the singleton state between tests so each test starts cold.
  const mod = await import('@/services/zgComputeService');
  mod.__resetZgComputeForTests();
});

describe('zgComputeService — singleton + ack semantics', () => {
  it('isZgComputeConfigured reflects env vars', async () => {
    const { isZgComputeConfigured } = await import('@/services/zgComputeService');
    expect(isZgComputeConfigured()).toBe(true);
  });

  it('runs acknowledgeProviderSigner exactly once across concurrent first calls', async () => {
    const { chatCompletion } = await import('@/services/zgComputeService');

    const results = await Promise.all([
      chatCompletion([{ role: 'user', content: 'a' }]),
      chatCompletion([{ role: 'user', content: 'b' }]),
      chatCompletion([{ role: 'user', content: 'c' }]),
    ]);

    expect(results).toEqual(['PONG', 'PONG', 'PONG']);
    // Five concurrent first-callers, only ONE ack call — the prior
    // implementation could double-ack here under load.
    expect(mockBroker.inference.acknowledgeProviderSigner).toHaveBeenCalledTimes(1);
  });

  it('skips top-up when inference ledger already holds enough balance', async () => {
    mockBroker.ledger.getLedger.mockResolvedValue({
      totalBalance: BigInt(10) * BigInt(10 ** 18),
    });

    const { chatCompletion } = await import('@/services/zgComputeService');
    await chatCompletion([{ role: 'user', content: 'a' }]);

    expect(mockBroker.ledger.transferFund).not.toHaveBeenCalled();
  });

  it('tops up when inference ledger is below the 0.5 0G floor', async () => {
    mockBroker.ledger.getLedger.mockResolvedValue({ totalBalance: BigInt(0) });

    const { chatCompletion } = await import('@/services/zgComputeService');
    await chatCompletion([{ role: 'user', content: 'a' }]);

    expect(mockBroker.ledger.transferFund).toHaveBeenCalledTimes(1);
    const [provider, role, amount] = mockBroker.ledger.transferFund.mock.calls[0];
    expect(provider).toBe(process.env.ZG_COMPUTE_PROVIDER);
    expect(role).toBe('inference');
    expect(amount).toBe(BigInt(2) * BigInt(10 ** 18));
  });

  it('treats "already" ack errors as success (idempotent on the contract)', async () => {
    mockBroker.inference.acknowledgeProviderSigner.mockRejectedValueOnce(
      new Error('signer already acknowledged')
    );

    const { chatCompletion } = await import('@/services/zgComputeService');
    await expect(chatCompletion([{ role: 'user', content: 'a' }])).resolves.toBe('PONG');
  });

  it('REGRESSION: a failed ack must not lock out subsequent calls', async () => {
    // The prior implementation set `acknowledgeInProgress = true` and only
    // cleared it `if (providerAcknowledged)`. So a single ack failure left
    // the flag stuck, and every later call skipped the entire ack block.
    // Now we cache a Promise instead and clear it on rejection.
    mockBroker.inference.acknowledgeProviderSigner
      .mockRejectedValueOnce(new Error('rpc blip'))
      .mockResolvedValueOnce(undefined);

    const { chatCompletion } = await import('@/services/zgComputeService');

    await expect(chatCompletion([{ role: 'user', content: 'a' }])).rejects.toThrow(/blip/);

    // Second call must succeed — acknowledge gets retried.
    await expect(chatCompletion([{ role: 'user', content: 'b' }])).resolves.toBe('PONG');
    expect(mockBroker.inference.acknowledgeProviderSigner).toHaveBeenCalledTimes(2);
  });

  it('createZGComputeNetworkBroker is called once across concurrent callers', async () => {
    const { chatCompletion } = await import('@/services/zgComputeService');

    await Promise.all([
      chatCompletion([{ role: 'user', content: 'a' }]),
      chatCompletion([{ role: 'user', content: 'b' }]),
      chatCompletion([{ role: 'user', content: 'c' }]),
      chatCompletion([{ role: 'user', content: 'd' }]),
    ]);

    expect(mockCreateBroker).toHaveBeenCalledTimes(1);
  });

  it('passes 429 through with a friendly error message', async () => {
    fetchStub.mockImplementation(async () => new Response('rate limited', { status: 429 }));

    const { chatCompletion } = await import('@/services/zgComputeService');
    await expect(chatCompletion([{ role: 'user', content: 'a' }])).rejects.toThrow(/429/);
  });
});
