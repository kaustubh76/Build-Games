import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { Chain } from 'viem';
import { anvil, avalancheFuji, avalanche } from 'viem/chains';
import { getAvalancheRpcUrl, getAvalancheFallbackRpcUrl } from '@/constants';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

// RPC timeout configuration
const RPC_TIMEOUT = 60000;

// Define supported chains - Avalanche only
const SUPPORTED_CHAINS: Record<number, Chain> = {
  [anvil.id]: anvil, // Chain ID 31337 - Local development
  [avalancheFuji.id]: avalancheFuji, // Chain ID 43113 - Avalanche Fuji Testnet
  [avalanche.id]: avalanche, // Chain ID 43114 - Avalanche C-Chain Mainnet
};

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'contract-read',
      maxRequests: 120,
      windowMs: 60000,
    });

    const { contractAddress, abi, functionName, args, chainId } = await request.json();

    if (!contractAddress || !abi || !functionName) {
      throw ErrorResponses.badRequest('Missing required parameters');
    }

    // Default to chain 43113 (Avalanche Fuji testnet) if no chainId provided
    const targetChainId = chainId || 43113;

    // Get the chain configuration
    const chain = SUPPORTED_CHAINS[targetChainId];
    if (!chain) {
      throw ErrorResponses.badRequest(`Unsupported chain ID: ${targetChainId}. Supported chains: ${Object.keys(SUPPORTED_CHAINS).join(', ')}`);
    }

    // Get RPC URL based on chain
    const getRpcUrl = () => {
      if (targetChainId === avalancheFuji.id || targetChainId === avalanche.id) {
        return getAvalancheRpcUrl();
      }
      return chain.rpcUrls.default.http[0];
    };

    const getFallbackRpcUrl = () => {
      if (targetChainId === avalancheFuji.id || targetChainId === avalanche.id) {
        return getAvalancheFallbackRpcUrl();
      }
      return chain.rpcUrls.default.http[0];
    };

    // Create client with primary RPC
    const publicClient = createPublicClient({
      chain,
      transport: http(getRpcUrl(), { timeout: RPC_TIMEOUT }),
    });

    // Fallback client
    const fallbackClient = createPublicClient({
      chain,
      transport: http(getFallbackRpcUrl(), { timeout: RPC_TIMEOUT }),
    });

    // Helper to execute with fallback
    const executeWithFallback = async <T>(
      operation: (client: typeof publicClient) => Promise<T>
    ): Promise<T> => {
      try {
        return await operation(publicClient);
      } catch (error) {
        const errMsg = (error as Error).message || '';
        if (errMsg.includes('timeout') || errMsg.includes('timed out') || errMsg.includes('took too long')) {
          console.warn('[Contract Read] Primary RPC timed out, trying fallback...');
          return await operation(fallbackClient);
        }
        throw error;
      }
    };

    const result = await executeWithFallback(async (client) => {
      return await client.readContract({
        address: contractAddress as `0x${string}`,
        abi,
        functionName,
        args: args || [],
      });
    });

    // Serialize BigInt values
    const serializedResult = JSON.parse(
      JSON.stringify(result, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value
      )
    );

    return NextResponse.json({
      success: true,
      result: serializedResult,
    });
  } catch (error) {
    return handleAPIError(error, 'API:ContractRead:POST');
  }
}
