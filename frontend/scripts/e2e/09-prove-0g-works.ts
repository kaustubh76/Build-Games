/**
 * Prove 0G Storage and 0G Compute actually work end-to-end.
 *
 * Storage path:
 *   1. Build a unique payload (run id + timestamp).
 *   2. Upload via zgStorageService → capture rootHash + on-chain txHash.
 *   3. Download by rootHash and assert byte-equality.
 *
 * Compute path:
 *   1. Call zgComputeService.chatCompletion with a tiny prompt that has
 *      a deterministic-ish answer ("reply with the single word PONG").
 *   2. Assert non-empty response.
 *
 * Failures print the exact error from the SDK so we can tell whether the
 * problem is local config, the testnet endpoints, or the broker itself.
 */
import './_lib/env';
import { step, pass, info, warn } from './_lib/expect';
import { createHash } from 'node:crypto';

// Local throw-style failure — do NOT use the `fail()` helper, which
// calls process.exit and would prevent the second proof from running.
function bail(msg: string): never {
  throw new Error(msg);
}

const RUN_ID = `prove-0g-${Date.now()}`;

async function proveStorage(): Promise<void> {
  step('0G Storage — upload + download roundtrip');

  const { upload, download, isZgConfigured } = await import('@/services/zgStorageService');

  if (!isZgConfigured()) {
    bail('isZgConfigured() returned false — set ZG_PRIVATE_KEY (or PRIVATE_KEY) in .env');
  }
  pass('ZG_PRIVATE_KEY (or PRIVATE_KEY fallback) detected');

  const payload = Buffer.from(
    JSON.stringify({
      runId: RUN_ID,
      ts: Date.now(),
      message: 'Avalanche Warriors AI-rena 0G smoke test',
      // Force unique bytes so we know we're not just hitting a cached blob.
      nonce: Math.random().toString(36).slice(2),
    })
  );
  const localHash = createHash('sha256').update(payload).digest('hex');
  info(`payload: ${payload.length} bytes, sha256=${localHash.slice(0, 16)}…`);

  const t0 = Date.now();
  let rootHash: string;
  let txHash: string;
  try {
    const result = await upload(payload, `${RUN_ID}.json`);
    rootHash = result.rootHash;
    txHash = result.txHash;
  } catch (e: any) {
    bail(`upload failed: ${e?.message ?? String(e)}`);
  }
  const uploadMs = Date.now() - t0;
  pass(`uploaded in ${uploadMs}ms — rootHash=${rootHash.slice(0, 18)}… tx=${txHash.slice(0, 12)}…`);

  // Download. Fresh-blob propagation on 0G can lag; retry a few times.
  let downloaded: Buffer | null = null;
  let lastErr = '';
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const t1 = Date.now();
    try {
      downloaded = await download(rootHash);
      pass(`downloaded ${downloaded.length} bytes in ${Date.now() - t1}ms (attempt ${attempt})`);
      break;
    } catch (e: any) {
      lastErr = e?.message ?? String(e);
      warn(`download attempt ${attempt}/${maxAttempts} failed: ${lastErr.slice(0, 120)}`);
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 5_000 * attempt));
    }
  }
  if (!downloaded) bail(`download failed after ${maxAttempts} attempts: ${lastErr}`);

  const downloadedHash = createHash('sha256').update(downloaded).digest('hex');
  if (downloadedHash !== localHash) {
    bail(`hash mismatch — expected ${localHash}, got ${downloadedHash}`);
  }
  pass(`byte-equal roundtrip — sha256 matches`);
}

async function proveCompute(): Promise<void> {
  step('0G Compute — chat completion via broker');

  const { chatCompletion, isZgComputeConfigured } = await import('@/services/zgComputeService');

  if (!isZgComputeConfigured()) {
    bail(
      'isZgComputeConfigured() returned false — set ZG_PRIVATE_KEY and ZG_COMPUTE_PROVIDER in .env'
    );
  }
  pass('ZG_PRIVATE_KEY + ZG_COMPUTE_PROVIDER detected');

  const t0 = Date.now();
  let reply: string;
  try {
    reply = await chatCompletion(
      [
        { role: 'system', content: 'Reply with only the single word PONG. No punctuation.' },
        { role: 'user', content: 'PING' },
      ],
      { temperature: 0, maxTokens: 12 }
    );
  } catch (e: any) {
    bail(`chatCompletion failed: ${e?.message ?? String(e)}`);
  }
  const elapsed = Date.now() - t0;

  if (!reply || reply.trim().length === 0) {
    bail(`empty reply (${elapsed}ms)`);
  }
  pass(`got reply in ${elapsed}ms: ${JSON.stringify(reply.slice(0, 80))}`);
}

async function logWalletBalance(): Promise<void> {
  // Tiny diagnostic — print the 0G-testnet balance of the signing wallet so
  // a "tx reverted with no data" failure is obviously a funding issue.
  const { ethers } = await import('ethers');
  const rpc = process.env.ZG_EVM_RPC || 'https://evmrpc-testnet.0g.ai';
  const pk = process.env.ZG_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!pk) return;
  const wallet = new ethers.Wallet(pk.startsWith('0x') ? pk : `0x${pk}`);
  const provider = new ethers.JsonRpcProvider(rpc);
  const bal = await provider.getBalance(wallet.address);
  info(`signer wallet: ${wallet.address}`);
  info(`0G testnet balance: ${ethers.formatEther(bal)} 0G (${bal.toString()} wei)`);
  if (bal === 0n) {
    warn('balance is zero — storage upload will revert. Faucet: https://faucet.0g.ai');
  } else if (bal < 10n ** 16n) {
    warn(`balance < 0.01 0G — likely insufficient for upload tx + storage fee.`);
  }
}

async function main(): Promise<void> {
  step(`0G end-to-end smoke test — run id ${RUN_ID}`);
  info(`ZG_EVM_RPC=${process.env.ZG_EVM_RPC ?? '(default)'}`);
  info(`ZG_INDEXER_RPC=${process.env.ZG_INDEXER_RPC ?? '(default)'}`);
  info(`ZG_COMPUTE_PROVIDER=${process.env.ZG_COMPUTE_PROVIDER ?? '(unset)'}`);
  await logWalletBalance().catch((e) => warn(`balance probe failed: ${e?.message ?? e}`));

  let storageOk = false;
  let computeOk = false;

  try {
    await proveStorage();
    storageOk = true;
  } catch (e: any) {
    if (e?.message?.startsWith('process.exit')) throw e;
    console.error(`Storage path threw: ${e?.message ?? e}`);
  }

  try {
    await proveCompute();
    computeOk = true;
  } catch (e: any) {
    if (e?.message?.startsWith('process.exit')) throw e;
    console.error(`Compute path threw: ${e?.message ?? e}`);
  }

  step('summary');
  console.log(`  Storage roundtrip: ${storageOk ? '✔' : '✘'}`);
  console.log(`  Compute inference: ${computeOk ? '✔' : '✘'}`);
  if (!storageOk || !computeOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
