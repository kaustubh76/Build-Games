/**
 * 0G Compute Service
 * Server-side only — wraps @0glabs/0g-serving-broker for decentralized AI inference.
 * Uses OpenAI-compatible API via the 0G Compute Network.
 */

import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
import { ethers } from 'ethers';

const ZG_EVM_RPC = process.env.ZG_EVM_RPC || 'https://evmrpc-testnet.0g.ai';
// Reuse the existing AVAX deployer private key (same wallet for 0G operations)
const ZG_PRIVATE_KEY = process.env.ZG_PRIVATE_KEY || process.env.PRIVATE_KEY;
const ZG_COMPUTE_PROVIDER = process.env.ZG_COMPUTE_PROVIDER;

// Singleton broker instance (reused across requests)
let brokerInstance: Awaited<ReturnType<typeof createZGComputeNetworkBroker>> | null = null;
let providerAcknowledged = false;

async function getBroker() {
  if (!brokerInstance && ZG_PRIVATE_KEY) {
    // Use a static network to avoid ENS resolution on 0G testnet (chainId 16602)
    const network = new ethers.Network('0g-testnet', 16602);
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
 */
export async function chatCompletion(
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const broker = await getBroker();
  if (!broker || !ZG_COMPUTE_PROVIDER) {
    throw new Error('0G Compute not configured');
  }

  // One-time: acknowledge provider signer
  if (!providerAcknowledged) {
    try {
      await broker.inference.acknowledgeProviderSigner(ZG_COMPUTE_PROVIDER);
      providerAcknowledged = true;
    } catch (e: any) {
      // May already be acknowledged — continue
      if (!e.message?.includes('already')) {
        console.warn('0G provider acknowledgment warning:', e.message);
      }
      providerAcknowledged = true;
    }
  }

  // Get provider endpoint and model
  const { endpoint, model } = await broker.inference.getServiceMetadata(ZG_COMPUTE_PROVIDER);

  // Build request body
  const body = JSON.stringify({
    model,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2000,
  });

  // Generate per-request headers (single-use, must be new for each request)
  const headers = await broker.inference.getRequestHeaders(ZG_COMPUTE_PROVIDER, body);

  // Make OpenAI-compatible HTTP request to provider endpoint
  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`0G Compute error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
