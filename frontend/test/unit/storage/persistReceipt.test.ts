import { describe, it, expect, beforeEach, vi } from 'vitest';

// We mock zgStorageService so the helper can be exercised without a real 0G
// network. The mock is hoisted by vi.mock so it applies to dynamic imports.
vi.mock('@/services/zgStorageService', () => ({
  upload: vi.fn(),
  isZgConfigured: vi.fn(),
}));

import { persistReceipt, buildEnvelope } from '@/lib/storage/persistReceipt';
import { upload as zgUpload, isZgConfigured } from '@/services/zgStorageService';

const mockedUpload = zgUpload as unknown as ReturnType<typeof vi.fn>;
const mockedConfigured = isZgConfigured as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedUpload.mockReset();
  mockedConfigured.mockReset();
});

describe('buildEnvelope', () => {
  it('defaults version to 1.0.0 and ts to Date.now()', () => {
    const before = Date.now();
    const env = buildEnvelope({ type: 'test', payload: { x: 1 } });
    expect(env.version).toBe('1.0.0');
    expect(env.type).toBe('test');
    expect(env.payload).toEqual({ x: 1 });
    expect(env.ts).toBeGreaterThanOrEqual(before);
  });

  it('honours explicit version + ts', () => {
    const env = buildEnvelope({ type: 'test', payload: 'p', version: '2.5.1', ts: 42 });
    expect(env.version).toBe('2.5.1');
    expect(env.ts).toBe(42);
  });
});

describe('persistReceipt', () => {
  it('returns null + records metric when 0G is not configured (graceful no-op)', async () => {
    mockedConfigured.mockReturnValue(false);
    const result = await persistReceipt(
      buildEnvelope({ type: 'sync-log', payload: { source: 'POLYMARKET' } }),
      'test.json'
    );
    expect(result).toBeNull();
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('uploads and returns the rootHash + txHash on success', async () => {
    mockedConfigured.mockReturnValue(true);
    mockedUpload.mockResolvedValue({ rootHash: '0xabc', txHash: '0xdef' });

    const result = await persistReceipt(
      buildEnvelope({ type: 'creator-fee', payload: { creator: '0x01', fee: '100' } }),
      'fee-1.json'
    );

    expect(result).toEqual({ rootHash: '0xabc', txHash: '0xdef' });
    expect(mockedUpload).toHaveBeenCalledOnce();
    const [buf, name] = mockedUpload.mock.calls[0];
    expect(name).toBe('fee-1.json');

    // Verify the buffer is the JSON-serialised envelope.
    const parsed = JSON.parse((buf as Buffer).toString());
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.type).toBe('creator-fee');
    expect(parsed.payload).toEqual({ creator: '0x01', fee: '100' });
    expect(typeof parsed.ts).toBe('number');
  });

  it('returns null when zgUpload throws (caller keeps Prisma row as fallback)', async () => {
    mockedConfigured.mockReturnValue(true);
    mockedUpload.mockRejectedValue(new Error('0G network unreachable'));

    const result = await persistReceipt(
      buildEnvelope({ type: 'sync-log', payload: { ok: true } }),
      'sync.json'
    );
    expect(result).toBeNull();
    expect(mockedUpload).toHaveBeenCalledOnce();
  });

  it('returns null on unserialisable payload (cyclic ref) without throwing', async () => {
    mockedConfigured.mockReturnValue(true);
    type Cyclic = { self?: Cyclic };
    const cyclic: Cyclic = {};
    cyclic.self = cyclic;

    const result = await persistReceipt(
      buildEnvelope({ type: 'cyclic', payload: cyclic }),
      'bad.json'
    );
    expect(result).toBeNull();
    // Should never have called upload because serialise failed first.
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('honours an empty txHash from the SDK', async () => {
    mockedConfigured.mockReturnValue(true);
    mockedUpload.mockResolvedValue({ rootHash: '0xroot', txHash: '' });
    const result = await persistReceipt(
      buildEnvelope({ type: 'sync-log', payload: {} }),
      'sync.json'
    );
    expect(result).toEqual({ rootHash: '0xroot', txHash: '' });
  });
});
