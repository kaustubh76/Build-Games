/**
 * 0G Compute Service
 * Server-side only — wraps @0glabs/0g-serving-broker for decentralized AI inference.
 * Uses OpenAI-compatible API via the 0G Compute Network.
 */

import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
import { ethers, EnsPlugin } from 'ethers';
import { withRetry, RetryPresets } from '@/lib/api/retry';

const ZG_EVM_RPC = process.env.ZG_EVM_RPC || 'https://evmrpc-testnet.0g.ai';
// Reuse the existing AVAX deployer private key (same wallet for 0G operations)
const ZG_PRIVATE_KEY = process.env.ZG_PRIVATE_KEY || process.env.PRIVATE_KEY;
const ZG_COMPUTE_PROVIDER = process.env.ZG_COMPUTE_PROVIDER;

// Singleton broker instance (reused across requests)
let brokerInstance: Awaited<ReturnType<typeof createZGComputeNetworkBroker>> | null = null;
let providerAcknowledged = false;
let acknowledgeInProgress = false;

async function getBroker() {
  if (!brokerInstance && ZG_PRIVATE_KEY) {
    // Use a static network with dummy ENS plugin to avoid ENS resolution errors on 0G testnet
    const zgChainId = parseInt(process.env.NEXT_PUBLIC_0G_CHAIN_ID || '16602', 10);
    const network = new ethers.Network('0g-network', zgChainId);
    network.attachPlugin(new EnsPlugin('0x0000000000000000000000000000000000000000', zgChainId));
    const provider = new ethers.JsonRpcProvider(ZG_EVM_RPC, network, { staticNetwork: network });
    const signer = new ethers.Wallet(ZG_PRIVATE_KEY, provider);
    brokerInstance = await createZGComputeNetworkBroker(signer);
  }
  return brokerInstance;
}

export const isZgComputeConfigured = (): boolean => !!(ZG_PRIVATE_KEY && ZG_COMPUTE_PROVIDER);

/**
 * Make a chat completion request via 0G Compute Network.
 * The broker handles billing/settlement; we make an OpenAI-compatible HTTP call.
 * Uses exponential backoff retry for transient failures.
 */
export async function chatCompletion(
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const broker = await getBroker();
  if (!broker || !ZG_COMPUTE_PROVIDER) {
    throw new Error('0G Compute not configured');
  }

  // One-time: acknowledge provider signer and ensure sufficient balance
  if (!providerAcknowledged && !acknowledgeInProgress) {
    acknowledgeInProgress = true;
    try {
      await broker.inference.acknowledgeProviderSigner(ZG_COMPUTE_PROVIDER);
      providerAcknowledged = true;
    } catch (e: any) {
      if (e.message?.includes('already')) {
        providerAcknowledged = true;
      } else {
        console.error('0G provider acknowledgment failed:', e.message);
        acknowledgeInProgress = false;
        throw new Error(`0G provider acknowledgment failed: ${e.message}`);
      }
    } finally {
      if (providerAcknowledged) acknowledgeInProgress = false;
    }

    // Top up compute account to ensure sufficient balance
    try {
      const topUpAmount = BigInt(2) * BigInt(10 ** 18); // 2 0G
      await broker.ledger.transferFund(ZG_COMPUTE_PROVIDER, 'inference', topUpAmount);
      console.log('0G Compute: topped up inference account with 2 0G');
    } catch (e: any) {
      if (e.message?.includes('already') || e.message?.includes('insufficient')) {
        // Already funded or wallet has no 0G — not fatal for inference
        console.warn('0G top-up skipped:', e.message?.slice(0, 120));
      } else {
        console.error('0G top-up failed:', e.message?.slice(0, 200));
      }
    }
  }

  // Get provider endpoint and model (outside retry loop — these are stable)
  const { endpoint, model } = await broker.inference.getServiceMetadata(ZG_COMPUTE_PROVIDER);

  // Build request body
  const body = JSON.stringify({
    model,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2000,
  });

  // Retry with exponential backoff for transient failures
  return withRetry(async () => {
    // Generate FRESH per-request headers each attempt (single-use billing tokens)
    const headers = await broker.inference.getRequestHeaders(ZG_COMPUTE_PROVIDER!, body);

    // Make OpenAI-compatible HTTP request with 30s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 429) {
          throw new Error('0G Compute rate limited (429). Try again in a few seconds.');
        }
        if (response.status === 503) {
          throw new Error('0G Compute provider temporarily unavailable (503).');
        }
        throw new Error(`0G Compute error (${response.status}): ${errText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (e: any) {
      if (e.name === 'AbortError') {
        throw new Error('0G Compute request timed out after 30s');
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }, {
    ...RetryPresets.fast,
    onRetry: (attempt, error, delay) => {
      console.warn(`0G Compute: retry ${attempt} after ${delay}ms: ${error.message}`);
    },
  });
}
