import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getLogsPaginated,
  getLogsForAddressCached,
  __resetEventQueryCache,
  __getEventQueryCacheState,
} from '@/lib/eventQuery';
import type { AbiEvent, PublicClient } from 'viem';

const FAKE_EVENT: AbiEvent = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { name: 'from', type: 'address', indexed: true },
    { name: 'to', type: 'address', indexed: true },
    { name: 'value', type: 'uint256', indexed: false },
  ],
};

const ADDR = ('0x' + 'cc'.repeat(20)) as `0x${string}`;

interface MockClient {
  getBlockNumber: ReturnType<typeof vi.fn>;
  getLogs: ReturnType<typeof vi.fn>;
}

function makeMockClient(head: bigint, fakeLog: unknown = { foo: 'bar' }): MockClient {
  return {
    getBlockNumber: vi.fn().mockResolvedValue(head),
    getLogs: vi.fn().mockResolvedValue([fakeLog]),
  };
}

beforeEach(() => {
  __resetEventQueryCache();
});

describe('getLogsPaginated', () => {
  it('chunks the query into 2k-block windows by default', async () => {
    const client = makeMockClient(7_000n);
    await getLogsPaginated({
      client: client as unknown as PublicClient,
      address: ADDR,
      event: FAKE_EVENT,
      fromBlock: 0n,
      toBlock: 7_000n,
    });
    // Default chunk = 2000 → expects 4 calls covering 0–1999, 2000–3999, 4000–5999, 6000–7000
    expect(client.getLogs).toHaveBeenCalledTimes(4);
    const ranges = client.getLogs.mock.calls.map((c) => [c[0].fromBlock, c[0].toBlock]);
    expect(ranges).toEqual([
      [0n, 1_999n],
      [2_000n, 3_999n],
      [4_000n, 5_999n],
      [6_000n, 7_000n],
    ]);
  });

  it('honours a custom chunk size', async () => {
    const client = makeMockClient(900n);
    await getLogsPaginated({
      client: client as unknown as PublicClient,
      address: ADDR,
      event: FAKE_EVENT,
      fromBlock: 0n,
      toBlock: 900n,
      chunkSize: 300n,
    });
    expect(client.getLogs).toHaveBeenCalledTimes(4); // 0-299, 300-599, 600-899, 900-900
  });

  it('returns [] when fromBlock > toBlock', async () => {
    const client = makeMockClient(100n);
    const result = await getLogsPaginated({
      client: client as unknown as PublicClient,
      address: ADDR,
      event: FAKE_EVENT,
      fromBlock: 200n,
      toBlock: 100n,
    });
    expect(result).toEqual([]);
    expect(client.getLogs).not.toHaveBeenCalled();
  });

  it('flattens results across chunks', async () => {
    const client = {
      getBlockNumber: vi.fn().mockResolvedValue(4_500n),
      getLogs: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'a' }])
        .mockResolvedValueOnce([{ id: 'b' }, { id: 'c' }])
        .mockResolvedValueOnce([{ id: 'd' }]),
    };
    const result = await getLogsPaginated({
      client: client as unknown as PublicClient,
      address: ADDR,
      event: FAKE_EVENT,
      fromBlock: 0n,
      toBlock: 4_500n,
    });
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
  });

  it('defaults toBlock to current head when omitted', async () => {
    const client = makeMockClient(123n);
    await getLogsPaginated({
      client: client as unknown as PublicClient,
      address: ADDR,
      event: FAKE_EVENT,
      fromBlock: 0n,
    });
    expect(client.getBlockNumber).toHaveBeenCalled();
    const lastCall = client.getLogs.mock.calls[client.getLogs.mock.calls.length - 1][0];
    expect(lastCall.toBlock).toBe(123n);
  });
});

describe('getLogsForAddressCached', () => {
  it('caches identical (contract, event, argsKey) within the TTL', async () => {
    const client = makeMockClient(1_000n, { id: 'x' });
    const args = { from: ADDR };
    const r1 = await getLogsForAddressCached(
      client as unknown as PublicClient,
      ADDR,
      FAKE_EVENT,
      ADDR.toLowerCase(),
      args
    );
    const r2 = await getLogsForAddressCached(
      client as unknown as PublicClient,
      ADDR,
      FAKE_EVENT,
      ADDR.toLowerCase(),
      args
    );
    expect(r1).toEqual(r2);
    // Only one underlying chain query.
    expect(client.getLogs).toHaveBeenCalledTimes(1);
    expect(__getEventQueryCacheState().size).toBe(1);
  });

  it('different argsKey → separate cache entry', async () => {
    const client = makeMockClient(1_000n);
    await getLogsForAddressCached(client as unknown as PublicClient, ADDR, FAKE_EVENT, 'k1', {});
    await getLogsForAddressCached(client as unknown as PublicClient, ADDR, FAKE_EVENT, 'k2', {});
    expect(__getEventQueryCacheState().size).toBe(2);
  });

  it('cache state inspector lists keys', async () => {
    const client = makeMockClient(1_000n);
    await getLogsForAddressCached(client as unknown as PublicClient, ADDR, FAKE_EVENT, 'k1', {});
    const state = __getEventQueryCacheState();
    expect(state.keys.length).toBe(1);
    expect(state.keys[0]).toContain('Transfer');
    expect(state.keys[0]).toContain('k1');
  });

  it('__reset clears all entries', async () => {
    const client = makeMockClient(1_000n);
    await getLogsForAddressCached(client as unknown as PublicClient, ADDR, FAKE_EVENT, 'k1', {});
    expect(__getEventQueryCacheState().size).toBe(1);
    __resetEventQueryCache();
    expect(__getEventQueryCacheState().size).toBe(0);
  });
});
