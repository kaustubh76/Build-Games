/**
 * Viem wallet/public clients pinned to Fuji.
 * Refuses any chain != 43113 (or 31337 local).
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  formatEther,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { TEST_PRIVATE_KEY, TEST_RPC_URL, TEST_CHAIN_ID } from './env';

const fujiOrLocal = defineChain({
  id: TEST_CHAIN_ID,
  name: TEST_CHAIN_ID === 43113 ? 'Avalanche Fuji' : 'Local',
  nativeCurrency: { decimals: 18, name: 'Avalanche', symbol: 'AVAX' },
  rpcUrls: { default: { http: [TEST_RPC_URL] } },
});

const account = privateKeyToAccount(
  (TEST_PRIVATE_KEY.startsWith('0x') ? TEST_PRIVATE_KEY : `0x${TEST_PRIVATE_KEY}`) as Hex
);

export const TEST_ACCOUNT: Address = account.address;

export const publicClient: PublicClient = createPublicClient({
  chain: fujiOrLocal,
  transport: http(TEST_RPC_URL),
});

export const walletClient: WalletClient = createWalletClient({
  account,
  chain: fujiOrLocal,
  transport: http(TEST_RPC_URL),
});

export async function assertChain(): Promise<void> {
  const chainId = await publicClient.getChainId();
  if (chainId !== TEST_CHAIN_ID) {
    throw new Error(`Connected chain ${chainId} doesn't match TEST_CHAIN_ID=${TEST_CHAIN_ID}`);
  }
}

export async function assertBalance(minAvax: number): Promise<bigint> {
  const balance = await publicClient.getBalance({ address: TEST_ACCOUNT });
  if (balance < parseEther(String(minAvax))) {
    throw new Error(
      `Wallet ${TEST_ACCOUNT} has only ${formatEther(balance)} AVAX, need >= ${minAvax}`
    );
  }
  return balance;
}

export { formatEther, parseEther };
