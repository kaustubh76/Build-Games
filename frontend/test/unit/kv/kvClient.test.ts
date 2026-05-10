/**
 * Unit tests for the KV wrapper at `src/lib/kv/index.ts`. Two paths to
 * cover:
 *
 *  1. The IN-MEMORY shim — already exercised end-to-end by the rate
 *     limiter, nonce store, idempotency cache, and safetyLimits unit
 *     tests, but pinned here directly for the wrapper's own contract.
 *
 *  2. The @vercel/kv code path — only runs when `KV_REST_API_URL` and
 *     `KV_REST_API_TOKEN` are both set. We mock `@vercel/kv` at the
 *     module boundary and verify the wrapper translates each public
 *     primitive into the right Upstash call. Without this test, the
 *     production code path was shipped untested — the in-memory shim
 *     proves the API surface, but a typo in the kv-backed branches
 *     (e.g. `kv.kv.set()` vs `kv.kv.setex()`) would only surface on
 *     the first prod request.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_ENV = {
  KV_REST_API_URL: process.env.KV_REST_API_URL,
  KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
};

afterEach(() => {
  if (ORIGINAL_ENV.KV_REST_API_URL === undefined) delete process.env.KV_REST_API_URL;
  else process.env.KV_REST_API_URL = ORIGINAL_ENV.KV_REST_API_URL;
  if (ORIGINAL_ENV.KV_REST_API_TOKEN === undefined) delete process.env.KV_REST_API_TOKEN;
  else process.env.KV_REST_API_TOKEN = ORIGINAL_ENV.KV_REST_API_TOKEN;
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('kv wrapper — in-memory shim (the dev/test default)', () => {
  beforeEach(async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    vi.resetModules();
    const kv = await import('@/lib/kv');
    kv.__resetKvMemory();
  });

  it('isKvBackedByRemote() reports false when env unset', async () => {
    const { isKvBackedByRemote } = await import('@/lib/kv');
    expect(isKvBackedByRemote()).toBe(false);
  });

  it('incrWithTtl returns 1 on first call, 2 on second', async () => {
    const { incrWithTtl } = await import('@/lib/kv');
    expect(await incrWithTtl('k', 60)).toBe(1);
    expect(await incrWithTtl('k', 60)).toBe(2);
  });

  it('setIfNotExists returns true on first set, false on second', async () => {
    const { setIfNotExists } = await import('@/lib/kv');
    expect(await setIfNotExists('k', 'v', 60)).toBe(true);
    expect(await setIfNotExists('k', 'other', 60)).toBe(false);
  });

  it('getJSON returns null for missing keys, the value otherwise', async () => {
    const { getJSON, setJSONWithTtl } = await import('@/lib/kv');
    expect(await getJSON('absent')).toBeNull();
    await setJSONWithTtl('present', { x: 1 }, 60);
    expect(await getJSON<{ x: number }>('present')).toEqual({ x: 1 });
  });

  it('del removes a key', async () => {
    const { setJSONWithTtl, getJSON, del } = await import('@/lib/kv');
    await setJSONWithTtl('k', 'v', 60);
    await del('k');
    expect(await getJSON('k')).toBeNull();
  });

  it('addToSet / isInSet / removeFromSet round-trip', async () => {
    const { addToSet, isInSet, removeFromSet } = await import('@/lib/kv');
    expect(await isInSet('s', 'a')).toBe(false);
    await addToSet('s', 'a');
    expect(await isInSet('s', 'a')).toBe(true);
    await removeFromSet('s', 'a');
    expect(await isInSet('s', 'a')).toBe(false);
  });

  it('TTL expiry: a 1-second key returns null after wall-clock 1.1s', async () => {
    const { setJSONWithTtl, getJSON } = await import('@/lib/kv');
    await setJSONWithTtl('expires', 'v', 1);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await getJSON('expires')).toBeNull();
  }, 5_000);
});

describe('kv wrapper — @vercel/kv code path (mocked)', () => {
  // Build a fresh mock per test so call counts don't bleed.
  let kvMock: {
    incr: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    sadd: ReturnType<typeof vi.fn>;
    srem: ReturnType<typeof vi.fn>;
    sismember: ReturnType<typeof vi.fn>;
    multi: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.resetModules();
    process.env.KV_REST_API_URL = 'https://kv.example.test';
    process.env.KV_REST_API_TOKEN = 'fake-token';

    kvMock = {
      incr: vi.fn(),
      expire: vi.fn(),
      set: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
      sadd: vi.fn(),
      srem: vi.fn(),
      sismember: vi.fn(),
      multi: vi.fn(),
    };

    // The wrapper calls `kv.kv.<method>` — module shape: `{ kv: VercelKV }`.
    vi.doMock('@vercel/kv', () => ({ kv: kvMock }));
  });

  it('isKvBackedByRemote() reports true when env vars are set', async () => {
    const { isKvBackedByRemote } = await import('@/lib/kv');
    expect(isKvBackedByRemote()).toBe(true);
  });

  it('incrWithTtl uses a multi() pipeline with INCR + EXPIRE', async () => {
    const pipelineMock = {
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([7, 1]),
    };
    kvMock.multi.mockReturnValue(pipelineMock);

    const { incrWithTtl } = await import('@/lib/kv');
    const result = await incrWithTtl('rl:foo', 30);

    expect(result).toBe(7);
    expect(kvMock.multi).toHaveBeenCalledTimes(1);
    expect(pipelineMock.incr).toHaveBeenCalledWith('rl:foo');
    expect(pipelineMock.expire).toHaveBeenCalledWith('rl:foo', 30);
    expect(pipelineMock.exec).toHaveBeenCalledTimes(1);
  });

  it('setIfNotExists translates to set() with { nx: true, ex }', async () => {
    kvMock.set.mockResolvedValueOnce('OK');

    const { setIfNotExists } = await import('@/lib/kv');
    const result = await setIfNotExists('idem:foo', { x: 1 }, 300);

    expect(result).toBe(true);
    expect(kvMock.set).toHaveBeenCalledWith(
      'idem:foo',
      { x: 1 },
      { nx: true, ex: 300 }
    );
  });

  it('setIfNotExists returns false when the underlying set returns null (key already exists)', async () => {
    kvMock.set.mockResolvedValueOnce(null);

    const { setIfNotExists } = await import('@/lib/kv');
    const result = await setIfNotExists('idem:already-there', 'v', 60);
    expect(result).toBe(false);
  });

  it('getJSON returns the parsed value when KV has it', async () => {
    kvMock.get.mockResolvedValueOnce({ greeting: 'hi' });

    const { getJSON } = await import('@/lib/kv');
    const result = await getJSON<{ greeting: string }>('foo');
    expect(result).toEqual({ greeting: 'hi' });
    expect(kvMock.get).toHaveBeenCalledWith('foo');
  });

  it('getJSON returns null when KV returns null', async () => {
    kvMock.get.mockResolvedValueOnce(null);
    const { getJSON } = await import('@/lib/kv');
    expect(await getJSON('absent')).toBeNull();
  });

  it('setJSONWithTtl translates to set() with { ex }', async () => {
    kvMock.set.mockResolvedValueOnce('OK');
    const { setJSONWithTtl } = await import('@/lib/kv');
    await setJSONWithTtl('foo', { y: 2 }, 120);
    expect(kvMock.set).toHaveBeenCalledWith('foo', { y: 2 }, { ex: 120 });
  });

  it('del calls KV del()', async () => {
    kvMock.del.mockResolvedValueOnce(1);
    const { del } = await import('@/lib/kv');
    await del('foo');
    expect(kvMock.del).toHaveBeenCalledWith('foo');
  });

  it('addToSet calls KV sadd()', async () => {
    kvMock.sadd.mockResolvedValueOnce(1);
    const { addToSet } = await import('@/lib/kv');
    await addToSet('paused', '0xabc');
    expect(kvMock.sadd).toHaveBeenCalledWith('paused', '0xabc');
  });

  it('removeFromSet calls KV srem()', async () => {
    kvMock.srem.mockResolvedValueOnce(1);
    const { removeFromSet } = await import('@/lib/kv');
    await removeFromSet('paused', '0xabc');
    expect(kvMock.srem).toHaveBeenCalledWith('paused', '0xabc');
  });

  it('isInSet returns true when KV sismember() returns 1', async () => {
    kvMock.sismember.mockResolvedValueOnce(1);
    const { isInSet } = await import('@/lib/kv');
    expect(await isInSet('paused', '0xabc')).toBe(true);
    expect(kvMock.sismember).toHaveBeenCalledWith('paused', '0xabc');
  });

  it('isInSet returns false when KV sismember() returns 0', async () => {
    kvMock.sismember.mockResolvedValueOnce(0);
    const { isInSet } = await import('@/lib/kv');
    expect(await isInSet('paused', '0xabc')).toBe(false);
  });

  it('rate-limit pattern roundtrip: incrWithTtl returns the new count', async () => {
    // Sequence of 3 requests in the same window. The pipeline returns
    // the incrementing counter each time.
    const counts = [1, 2, 3];
    kvMock.multi.mockImplementation(() => {
      const next = counts.shift() ?? 0;
      return {
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([next, 1]),
      };
    });

    const { incrWithTtl } = await import('@/lib/kv');
    expect(await incrWithTtl('k', 60)).toBe(1);
    expect(await incrWithTtl('k', 60)).toBe(2);
    expect(await incrWithTtl('k', 60)).toBe(3);
  });
});
