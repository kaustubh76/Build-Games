/**
 * 0G Storage Service
 * Server-side only — wraps @0gfoundation/0g-ts-sdk for upload/download operations.
 * Uses temp files because the SDK only supports file-path-based operations.
 */

import { ZgFile, Indexer } from '@0gfoundation/0g-ts-sdk';
import { ethers, EnsPlugin } from 'ethers';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const ZG_EVM_RPC = process.env.ZG_EVM_RPC || 'https://evmrpc-testnet.0g.ai';
const ZG_INDEXER_RPC = process.env.ZG_INDEXER_RPC || 'https://indexer-storage-testnet-turbo.0g.ai';
// Reuse the existing AVAX deployer private key (same wallet for 0G operations)
const ZG_PRIVATE_KEY = process.env.ZG_PRIVATE_KEY || process.env.PRIVATE_KEY;

export const isZgConfigured = (): boolean => !!ZG_PRIVATE_KEY;

/**
 * Upload data to 0G Storage.
 * Writes buffer to a temp file, uploads via SDK, then cleans up.
 */
export async function upload(
  data: Buffer,
  fileName?: string
): Promise<{ rootHash: string; txHash: string }> {
  if (!ZG_PRIVATE_KEY) throw new Error('ZG_PRIVATE_KEY not configured');

  // Use a static network with dummy ENS plugin to avoid ENS resolution errors on 0G testnet
  const network = new ethers.Network('0g-testnet', 16602);
  network.attachPlugin(new EnsPlugin('0x0000000000000000000000000000000000000000', 16602));
  const provider = new ethers.JsonRpcProvider(ZG_EVM_RPC, network, { staticNetwork: network });
  const signer = new ethers.Wallet(ZG_PRIVATE_KEY, provider);
  const indexer = new Indexer(ZG_INDEXER_RPC);

  const tempPath = join(tmpdir(), `0g-upload-${Date.now()}-${fileName || 'data'}`);
  await writeFile(tempPath, data);

  try {
    const file = await ZgFile.fromFilePath(tempPath);
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr) throw new Error(`Merkle tree error: ${treeErr}`);

    const rootHash = tree!.rootHash() ?? '';
    const [uploadResult, uploadErr] = await indexer.upload(file, ZG_EVM_RPC, signer);
    if (uploadErr) throw new Error(`0G upload error: ${uploadErr}`);

    await file.close();
    return { rootHash, txHash: (uploadResult as { txHash?: string } | null)?.txHash || '' };
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

/**
 * Download data from 0G Storage by root hash.
 * Downloads to a temp file, reads into buffer, then cleans up.
 */
export async function download(rootHash: string): Promise<Buffer> {
  const indexer = new Indexer(ZG_INDEXER_RPC);
  const outPath = join(tmpdir(), `0g-download-${Date.now()}`);

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
