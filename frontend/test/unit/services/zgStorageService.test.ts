/**
 * Unit tests for zgStorageService — pin the timer-clear + temp-file
 * cleanup + tuple-error handling that was missing or broken before.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs/promises';

const mockRootHash = '0xea3a8c1e553f7417a7ec591bea0ae85dbc9315699660c34af70b350b93444c79';

const mockMerkleTree = { rootHash: () => mockRootHash };
const mockMemDataInstance = {
  merkleTree: vi.fn(async () => [mockMerkleTree, null] as [typeof mockMerkleTree | null, string | null]),
};

const mockIndexer = {
  upload: vi.fn(),
  download: vi.fn(),
};

vi.mock('@0gfoundation/0g-ts-sdk', () => ({
  MemData: vi.fn(() => mockMemDataInstance),
  Indexer: vi.fn(() => mockIndexer),
}));

process.env.ZG_PRIVATE_KEY = '0x' + '1'.repeat(64);
process.env.ZG_EVM_RPC = 'http://localhost:9999';
process.env.ZG_INDEXER_RPC = 'http://localhost:9998';

beforeEach(async () => {
  vi.clearAllMocks();
  mockMemDataInstance.merkleTree.mockResolvedValue([mockMerkleTree, null]);
  mockIndexer.upload.mockResolvedValue([{ txHash: '0xtx' }, null]);
  mockIndexer.download.mockImplementation(async (_h: string, p: string) => {
    await fs.writeFile(p, Buffer.from('hello world'));
    return null;
  });

  const mod = await import('@/services/zgStorageService');
  mod.__resetZgStorageForTests();
});

describe('zgStorageService — upload', () => {
  it('returns rootHash and txHash on a successful upload', async () => {
    const { upload } = await import('@/services/zgStorageService');
    const res = await upload(Buffer.from('payload'), 'test.json');
    expect(res.rootHash).toBe(mockRootHash);
    expect(res.txHash).toBe('0xtx');
  });

  it('throws a clear error when the SDK returns a tuple error', async () => {
    mockIndexer.upload.mockResolvedValue([null, 'simulated indexer down']);
    const { upload } = await import('@/services/zgStorageService');
    await expect(upload(Buffer.from('p'))).rejects.toThrow(/simulated indexer down/);
  });

  it('throws when merkleTree errors', async () => {
    mockMemDataInstance.merkleTree.mockResolvedValue([null, 'tree error']);
    const { upload } = await import('@/services/zgStorageService');
    await expect(upload(Buffer.from('p'))).rejects.toThrow(/Merkle tree error/);
  });

  it('REGRESSION: timer is cleared after a fast success — no event-loop pinning', async () => {
    // Before the fix, the 60s setTimeout fired on a uncleared handle even
    // after upload succeeded in 50ms. We simulate by counting active handles
    // via vi.useFakeTimers — pendingTimers should be 0 after the upload.
    vi.useFakeTimers();
    try {
      mockIndexer.upload.mockResolvedValue([{ txHash: '0xtx' }, null]);
      const { upload } = await import('@/services/zgStorageService');
      const p = upload(Buffer.from('p'));
      await vi.advanceTimersByTimeAsync(0);
      await p;
      // No timer should remain — the previous bug left the 60s timer running.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('upload timeout produces a labeled error', async () => {
    // Block the upload forever; race-with-timeout should fire.
    mockIndexer.upload.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();
    try {
      const { upload } = await import('@/services/zgStorageService');
      // Attach the rejection handler synchronously BEFORE advancing the
      // timer so the timer-fired rejection has a listener — otherwise
      // vitest reports it as unhandled even though the test does await it.
      const expectation = expect(upload(Buffer.from('p'))).rejects.toThrow(
        /0G Storage upload timed out after 60000ms/
      );
      await vi.advanceTimersByTimeAsync(60_001);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('zgStorageService — download', () => {
  it('returns the file contents on success', async () => {
    const { download } = await import('@/services/zgStorageService');
    const data = await download(mockRootHash);
    expect(data.toString()).toBe('hello world');
  });

  it('throws when SDK returns an error string', async () => {
    mockIndexer.download.mockResolvedValue('not found');
    const { download } = await import('@/services/zgStorageService');
    await expect(download(mockRootHash)).rejects.toThrow(/not found/);
  });

  it('cleans up the temp file even on the happy path', async () => {
    const writtenPaths: string[] = [];
    mockIndexer.download.mockImplementation(async (_h: string, p: string) => {
      writtenPaths.push(p);
      await fs.writeFile(p, Buffer.from('x'));
      return null;
    });
    const { download } = await import('@/services/zgStorageService');
    await download(mockRootHash);
    // The temp file must not exist after download returns.
    expect(writtenPaths).toHaveLength(1);
    await expect(fs.access(writtenPaths[0])).rejects.toThrow();
  });

  it('REGRESSION: download timer is cleared after fast success', async () => {
    vi.useFakeTimers();
    try {
      mockIndexer.download.mockImplementation(async (_h: string, p: string) => {
        // Need to actually write the file synchronously-ish for readFile to
        // succeed — happens before timeout fires.
        await fs.writeFile(p, Buffer.from('ok'));
        return null;
      });
      const { download } = await import('@/services/zgStorageService');
      const p = download(mockRootHash);
      await vi.advanceTimersByTimeAsync(0);
      await p;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('zgStorageService — config gate', () => {
  it('isZgConfigured returns true when env is set', async () => {
    const { isZgConfigured } = await import('@/services/zgStorageService');
    expect(isZgConfigured()).toBe(true);
  });
});
