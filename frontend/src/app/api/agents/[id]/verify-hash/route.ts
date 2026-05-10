import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { AVALANCHE_CONTRACTS } from '@/lib/apiConfig';
import { getResilientPublicClient } from '@/lib/viemClient';
import { AIAgentINFTAbi } from '@/constants/aiAgentINFTAbi';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { download as zgDownload, isZgConfigured } from '@/services/zgStorageService';
import { chainMetrics } from '@/lib/metrics';

/**
 * GET /api/agents/[id]/verify-hash
 *
 * Verifies the integrity of an iNFT's encrypted strategy artifact:
 *  1. Read the on-chain `metadataHash` (SHA-256 of the cleartext) and
 *     `encryptedMetadataRef` (storage URI / 0G root hash) from AIAgentINFT.
 *  2. Download the bytes at that ref from 0G Storage.
 *  3. Compute SHA-256 of the downloaded bytes.
 *  4. Compare against the on-chain hash.
 *
 * Status codes:
 *  - 200 + { match: true }                — bytes hash matches on-chain claim
 *  - 200 + { match: false }               — mismatch (potential tampering)
 *  - 404                                  — agent not found
 *  - 503 + { code: 'STORAGE_UNAVAILABLE' } — couldn't fetch the artifact
 *
 * Note: the ref is the encrypted blob, so its SHA-256 = on-chain
 * `metadataHash` only if `metadataHash` is computed over the encrypted blob.
 * If your contract stores SHA-256 of the cleartext, full verification needs
 * decryption keys and isn't a server-side check. We surface the comparison
 * regardless — UI explains the semantics.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await applyRateLimit(request, {
      prefix: 'agent-verify-hash',
      maxRequests: 30,
      windowMs: 60_000,
    });

    const { id } = await params;
    if (!/^\d+$/.test(id)) {
      throw ErrorResponses.badRequest('id must be a positive integer');
    }
    const tokenId = BigInt(id);

    const client = getResilientPublicClient();
    const inft = AVALANCHE_CONTRACTS.aiAgentINFT as `0x${string}`;

    // Bound the on-chain reads so a rate-limited RPC doesn't hang the route.
    const READ_TIMEOUT_MS = 15_000;
    const withTimeout = <T>(p: Promise<T>, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out`)), READ_TIMEOUT_MS)
        ),
      ]);

    let onChainHash: `0x${string}`;
    let ref: string;
    try {
      onChainHash = (await withTimeout(
        client.readContract({
          address: inft,
          abi: AIAgentINFTAbi,
          functionName: 'getMetadataHash',
          args: [tokenId],
        }),
        'getMetadataHash'
      )) as `0x${string}`;
      ref = (await withTimeout(
        client.readContract({
          address: inft,
          abi: AIAgentINFTAbi,
          functionName: 'getEncryptedMetadataRef',
          args: [tokenId],
        }),
        'getEncryptedMetadataRef'
      )) as string;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'chain read failed';
      if (/timed out/i.test(msg)) {
        return NextResponse.json(
          {
            match: false,
            reason: 'chain-timeout',
            message: `Chain read timed out (${msg}). Retry once Avalanche RPC is responsive.`,
            code: 'CHAIN_TIMEOUT',
          },
          { status: 503 }
        );
      }
      throw ErrorResponses.notFound(`Agent #${id}`);
    }

    if (!ref) {
      return NextResponse.json({
        match: false,
        reason: 'no-ref',
        message: `Agent #${id} has no encryptedMetadataRef on-chain.`,
        onChainHash,
        ref: null,
      });
    }

    // Strip the storage:// or 0g:// prefix if present.
    const cleanRef = ref.replace(/^(storage|0g|ipfs):\/\//, '');

    if (!isZgConfigured()) {
      chainMetrics.incrementCounter('agent_verify_hash_total', 1, { outcome: 'no_storage' });
      return NextResponse.json(
        {
          match: false,
          reason: 'storage-unavailable',
          message: '0G Storage is not configured on this server. Set ZG_PRIVATE_KEY to enable verification.',
          onChainHash,
          ref,
          code: 'STORAGE_UNAVAILABLE',
        },
        { status: 503 }
      );
    }

    let bytes: Buffer;
    try {
      bytes = await zgDownload(cleanRef);
    } catch (e) {
      chainMetrics.incrementCounter('agent_verify_hash_total', 1, { outcome: 'download_failed' });
      return NextResponse.json(
        {
          match: false,
          reason: 'download-failed',
          message: e instanceof Error ? e.message : 'Failed to download artifact',
          onChainHash,
          ref,
          code: 'STORAGE_UNAVAILABLE',
        },
        { status: 503 }
      );
    }

    const computed = '0x' + createHash('sha256').update(bytes).digest('hex');
    const match = computed.toLowerCase() === onChainHash.toLowerCase();
    chainMetrics.incrementCounter('agent_verify_hash_total', 1, {
      outcome: match ? 'match' : 'mismatch',
    });

    return NextResponse.json({
      match,
      onChainHash,
      computedHash: computed,
      ref,
      sizeBytes: bytes.length,
      message: match
        ? 'Hash matches: the artifact at this ref is byte-identical to what was committed on-chain.'
        : 'Hash mismatch. Either the artifact was changed, the ref points to a different blob, or the on-chain hash is over the cleartext (not the encrypted blob).',
    });
  } catch (error) {
    return handleAPIError(error, 'API:Agents:VerifyHash:GET');
  }
}
