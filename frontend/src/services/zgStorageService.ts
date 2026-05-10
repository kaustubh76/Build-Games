/**
 * 0G Storage Service
 * Server-side only — wraps @0gfoundation/0g-ts-sdk for upload/download operations.
 * Upload uses in-memory MemData (no temp files); download uses temp files (SDK requirement).
 */

import { MemData, Indexer } from '@0gfoundation/0g-ts-sdk';
import { ethers, EnsPlugin } from 'ethers';
import { readFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';

const ZG_EVM_RPC = process.env.ZG_EVM_RPC || 'https://evmrpc-testnet.0g.ai';
const ZG_INDEXER_RPC = process.env.ZG_INDEXER_RPC || 'https://indexer-storage-testnet-turbo.0g.ai';
// Reuse the existing AVAX deployer private key (same wallet for 0G operations)
const ZG_PRIVATE_KEY = process.env.ZG_PRIVATE_KEY || process.env.PRIVATE_KEY;

export const isZgConfigured = (): boolean => !!ZG_PRIVATE_KEY;

// Cached instances (singleton pattern, same as zgComputeService)
let _provider: ethers.JsonRpcProvider | null = null;
let _signer: ethers.Wallet | null = null;
let _indexer: Indexer | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    const zgChainId = parseInt(process.env.NEXT_PUBLIC_0G_CHAIN_ID || '16602', 10);
    const network = new ethers.Network('0g-network', zgChainId);
    network.attachPlugin(new EnsPlugin('0x0000000000000000000000000000000000000000', zgChainId));
    _provider = new ethers.JsonRpcProvider(ZG_EVM_RPC, network, { staticNetwork: network });
  }
  return _provider;
}

function getSigner(): ethers.Wallet {
  if (!_signer) {
    if (!ZG_PRIVATE_KEY) throw new Error('ZG_PRIVATE_KEY not configured');
    _signer = new ethers.Wallet(ZG_PRIVATE_KEY, getProvider());
  }
  return _signer;
}

function getIndexer(): Indexer {
  if (!_indexer) {
    _indexer = new Indexer(ZG_INDEXER_RPC);
  }
  return _indexer;
}

/**
 * Test hook — reset cached singletons.
 */
export function __resetZgStorageForTests(): void {
  _provider = null;
  _signer = null;
  _indexer = null;
}

/**
 * Race a promise against a timeout. Cleans up the timer on either path so
 * a fast success doesn't keep the event loop alive for the timeout window.
 */
async function raceWithTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T>([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Upload data to 0G Storage using in-memory MemData (no temp files).
 */
export async function upload(
  data: Buffer,
  fileName?: string
): Promise<{ rootHash: string; txHash: string }> {
  const signer = getSigner();
  const indexer = getIndexer();

  const memFile = new MemData(new Uint8Array(data));
  const [tree, treeErr] = await memFile.merkleTree();
  if (treeErr) throw new Error(`Merkle tree error: ${treeErr}`);

  const rootHash = tree!.rootHash() ?? '';

  // 0G upload submits an on-chain tx; the SDK returns a [result, err] tuple
  // rather than throwing. Wrap in our timer-clearing helper so the 60s
  // timeout doesn't pin the event loop after a fast success.
  const [uploadResult, uploadErr] = await raceWithTimeout(
    indexer.upload(memFile, ZG_EVM_RPC, signer),
    60_000,
    '0G Storage upload'
  );
  if (uploadErr) throw new Error(`0G upload error: ${uploadErr}`);

  const txHash = (uploadResult as { txHash?: string } | null)?.txHash || '';
  if (!txHash) {
    // Not strictly an error — some indexer paths return without a txHash
    // when content is already finalized — but worth surfacing in logs so
    // an operator can investigate "phantom" successful uploads.
    console.warn(`0G upload returned no txHash (rootHash=${rootHash})`);
  }
  return { rootHash, txHash };
}

/**
 * Download data from 0G Storage by root hash.
 * Downloads to a temp file (SDK requirement), reads into buffer, then cleans up.
 */
export async function download(rootHash: string): Promise<Buffer> {
  const indexer = getIndexer();
  const outPath = join(tmpdir(), `0g-download-${randomUUID()}`);

  let downloadOk = false;
  try {
    const err = await raceWithTimeout(
      indexer.download(rootHash, outPath, false),
      30_000,
      '0G Storage download'
    );
    if (err) throw new Error(`0G download error: ${err}`);
    downloadOk = true;
    return await readFile(outPath);
  } finally {
    // Always unlink, even on timeout. If the SDK is still writing in the
    // background after a timeout, a later sweep would clean it up — but at
    // least we don't leak when the happy path completes.
    await unlink(outPath).catch(() => {});
    // Marking the variable as used silences unused-var lint without
    // changing behavior; intentional for future readers.
    void downloadOk;
  }
}
