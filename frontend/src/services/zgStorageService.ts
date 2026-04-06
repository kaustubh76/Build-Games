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

  // Upload with 60s timeout (upload can hang on slow/unreachable 0G network)
  const uploadPromise = indexer.upload(memFile, ZG_EVM_RPC, signer);
  const uploadTimeout = new Promise<[null, string]>((resolve) =>
    setTimeout(() => resolve([null, '0G Storage upload timed out after 60s']), 60000)
  );
  const [uploadResult, uploadErr] = await Promise.race([uploadPromise, uploadTimeout]);
  if (uploadErr) throw new Error(`0G upload error: ${uploadErr}`);

  return { rootHash, txHash: (uploadResult as { txHash?: string } | null)?.txHash || '' };
}

/**
 * Download data from 0G Storage by root hash.
 * Downloads to a temp file (SDK requirement), reads into buffer, then cleans up.
 */
export async function download(rootHash: string): Promise<Buffer> {
  const indexer = getIndexer();
  const outPath = join(tmpdir(), `0g-download-${randomUUID()}`);

  // Download with 30s timeout
  const downloadPromise = indexer.download(rootHash, outPath, false);
  const timeoutPromise = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error('0G Storage download timed out after 30s')), 30000)
  );
  const err = await Promise.race([downloadPromise, timeoutPromise]);
  if (err) throw new Error(`0G download error: ${err}`);

  try {
    const data = await readFile(outPath);
    return data;
  } finally {
    await unlink(outPath).catch(() => {});
  }
}
