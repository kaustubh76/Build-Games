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

// Singleton broker — single-flight via a stored Promise so concurrent
// first-callers all await the same instantiation rather than each
// constructing their own.
type Broker = Awaited<ReturnType<typeof createZGComputeNetworkBroker>>;
let brokerPromise: Promise<Broker> | null = null;

// Provider acknowledgment (one-shot, idempotent on success).
// Stored as a Promise so concurrent callers latch onto the same in-flight
// ack and never run it twice. Reset to null on failure so a later caller
// can retry — the previous bug left it stuck "in progress" forever after
// a single failure, locking out all subsequent requests.
let ackPromise: Promise<void> | null = null;
let providerAcknowledged = false;

async function getBroker(): Promise<Broker> {
  if (!ZG_PRIVATE_KEY) throw new Error('ZG_PRIVATE_KEY not configured');
  if (!brokerPromise) {
    brokerPromise = (async () => {
      const zgChainId = parseInt(process.env.NEXT_PUBLIC_0G_CHAIN_ID || '16602', 10);
      const network = new ethers.Network('0g-network', zgChainId);
      network.attachPlugin(new EnsPlugin('0x0000000000000000000000000000000000000000', zgChainId));
      const provider = new ethers.JsonRpcProvider(ZG_EVM_RPC, network, { staticNetwork: network });
      const signer = new ethers.Wallet(ZG_PRIVATE_KEY, provider);
      return createZGComputeNetworkBroker(signer);
    })().catch((e) => {
      brokerPromise = null;
      throw e;
    });
  }
  return brokerPromise;
}

export const isZgComputeConfigured = (): boolean => !!(ZG_PRIVATE_KEY && ZG_COMPUTE_PROVIDER);

/**
 * Test hook — reset the cached broker / ack state so a unit test can
 * exercise the singleton paths without restarting the process.
 */
export function __resetZgComputeForTests(): void {
  brokerPromise = null;
  ackPromise = null;
  providerAcknowledged = false;
}

async function ensureProviderAcknowledged(broker: Broker): Promise<void> {
  if (providerAcknowledged) return;
  if (ackPromise) return ackPromise;

  ackPromise = (async () => {
    try {
      await broker.inference.acknowledgeProviderSigner(ZG_COMPUTE_PROVIDER!);
      providerAcknowledged = true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // The SDK throws "already acknowledged" when state is already correct.
      // Treat that as success — it's idempotent on the contract side.
      if (msg.includes('already')) {
        providerAcknowledged = true;
        return;
      }
      throw new Error(`0G provider acknowledgment failed: ${msg}`);
    }

    // Top up the inference ledger only if balance is low. Previously this
    // ran unconditionally on every cold start, burning 2 0G per restart.
    try {
      const ledger = await broker.ledger.getLedger().catch(() => null);
      const inferenceBalance = (ledger as { totalBalance?: bigint } | null)?.totalBalance ?? 0n;
      const minBalance = BigInt(5) * BigInt(10 ** 17); // 0.5 0G threshold
      if (inferenceBalance < minBalance) {
        const topUp = BigInt(2) * BigInt(10 ** 18); // 2 0G
        await broker.ledger.transferFund(ZG_COMPUTE_PROVIDER!, 'inference', topUp);
        console.log('0G Compute: topped up inference account with 2 0G');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // "already" / "insufficient" are non-fatal: existing balance covers
      // inference, or wallet lacks 0G to top up. Either way, the next
      // chatCompletion call will surface a clearer error if there really
      // isn't enough balance to make the request.
      if (msg.includes('already') || msg.includes('insufficient')) {
        console.warn('0G top-up skipped:', msg.slice(0, 120));
      } else {
        console.error('0G top-up failed:', msg.slice(0, 200));
      }
    }
  })();

  // If acknowledgment fails, clear the latch so a later caller can retry.
  // Without this, a transient RPC blip on the very first request locks
  // out every subsequent request for the lifetime of the process.
  return ackPromise.catch((e) => {
    ackPromise = null;
    throw e;
  });
}

/**
 * Make a chat completion request via 0G Compute Network.
 * The broker handles billing/settlement; we make an OpenAI-compatible HTTP call.
 * Uses exponential backoff retry for transient failures.
 */
export async function chatCompletion(
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  if (!ZG_COMPUTE_PROVIDER) {
    throw new Error('0G Compute not configured');
  }
  const broker = await getBroker();

  await ensureProviderAcknowledged(broker);

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
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
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
