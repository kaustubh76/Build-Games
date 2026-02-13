/**
 * Chain Service
 * Simplified for Avalanche-only architecture
 * Previously handled cross-chain coordination between 0G and Flow
 * Now only manages Avalanche chain interactions
 */

import { createPublicClient, http, formatEther } from 'viem';
import { avalancheFuji, avalanche } from 'viem/chains';
import { chainsToContracts, getChainId, getAvalancheRpcUrl, getAvalancheFallbackRpcUrl } from '@/constants';
import { AIAgentINFTAbi } from '@/constants/aiAgentINFTAbi';

// RPC timeout configuration
const RPC_TIMEOUT = 60000;

// ============================================
// TYPES
// ============================================

export interface AgentPerformance {
  agentId: bigint;
  totalTrades: number;
  totalPnL: bigint;
  winRate: number;
}

export interface AgentSyncState {
  agentId: string;
  tier: number;
  stakedAmount: string;
  isActive: boolean;
  copyTradingEnabled: boolean;
  totalTrades: number;
  winningTrades: number;
  totalPnL: string;
  lastSyncedAt: Date;
}

// ============================================
// SERVICE CLASS
// ============================================

class ChainService {
  private avalancheClient = createPublicClient({
    chain: getChainId() === 43114 ? avalanche : avalancheFuji,
    transport: http(getAvalancheRpcUrl(), { timeout: RPC_TIMEOUT }),
  });

  private avalancheFallbackClient = createPublicClient({
    chain: getChainId() === 43114 ? avalanche : avalancheFuji,
    transport: http(getAvalancheFallbackRpcUrl(), { timeout: RPC_TIMEOUT, retryCount: 2, retryDelay: 1000 }),
  });

  // Helper to check if error is timeout
  private isTimeoutError(error: unknown): boolean {
    const errMsg = (error as Error).message || '';
    return errMsg.includes('timeout') ||
           errMsg.includes('timed out') ||
           errMsg.includes('took too long') ||
           errMsg.includes('TimeoutError');
  }

  // Execute operation with fallback
  private async executeWithFallback<T>(
    operation: (client: typeof this.avalancheClient) => Promise<T>
  ): Promise<T> {
    try {
      return await operation(this.avalancheClient);
    } catch (error) {
      if (this.isTimeoutError(error)) {
        console.warn('[ChainService] Primary RPC timed out, trying fallback...');
        return await operation(this.avalancheFallbackClient);
      }
      throw error;
    }
  }

  private get aiAgentINFTAddress(): `0x${string}` {
    const contracts = chainsToContracts[getChainId()];
    return (contracts?.aiAgentINFT || '0x0000000000000000000000000000000000000000') as `0x${string}`;
  }

  /**
   * Get agent state from Avalanche
   */
  async getAgentState(agentId: bigint): Promise<AgentSyncState> {
    const [agentData, performance] = await Promise.all([
      this.executeWithFallback(client =>
        client.readContract({
          address: this.aiAgentINFTAddress,
          abi: AIAgentINFTAbi,
          functionName: 'getAgentData',
          args: [agentId],
        })
      ),
      this.executeWithFallback(client =>
        client.readContract({
          address: this.aiAgentINFTAddress,
          abi: AIAgentINFTAbi,
          functionName: 'getAgentPerformance',
          args: [agentId],
        })
      ),
    ]);

    // Type assertions for contract return types
    const agentDataTyped = agentData as {
      tier: number;
      stakedAmount: bigint;
      isActive: boolean;
      copyTradingEnabled: boolean;
    };

    const performanceTyped = performance as {
      totalTrades: bigint;
      winningTrades: bigint;
      totalPnL: bigint;
    };

    return {
      agentId: agentId.toString(),
      tier: agentDataTyped.tier,
      stakedAmount: formatEther(agentDataTyped.stakedAmount),
      isActive: agentDataTyped.isActive,
      copyTradingEnabled: agentDataTyped.copyTradingEnabled,
      totalTrades: Number(performanceTyped.totalTrades),
      winningTrades: Number(performanceTyped.winningTrades),
      totalPnL: formatEther(performanceTyped.totalPnL),
      lastSyncedAt: new Date(),
    };
  }

  /**
   * Get agent performance
   */
  async getAgentPerformance(agentId: bigint): Promise<AgentPerformance> {
    const performance = await this.executeWithFallback(client =>
      client.readContract({
        address: this.aiAgentINFTAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getAgentPerformance',
        args: [agentId],
      })
    );

    const performanceTyped = performance as {
      totalTrades: bigint;
      winningTrades: bigint;
      totalPnL: bigint;
    };

    const totalTrades = Number(performanceTyped.totalTrades);
    const winningTrades = Number(performanceTyped.winningTrades);

    return {
      agentId,
      totalTrades,
      totalPnL: performanceTyped.totalPnL,
      winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
    };
  }

  /**
   * Check chain health
   */
  async checkChainHealth(): Promise<{
    avalanche: { healthy: boolean; blockNumber?: bigint };
  }> {
    const result = {
      avalanche: { healthy: false, blockNumber: undefined as bigint | undefined },
    };

    try {
      const blockNumber = await this.avalancheClient.getBlockNumber();
      result.avalanche = { healthy: true, blockNumber };
    } catch (error) {
      console.error('Avalanche chain health check failed:', error);
    }

    return result;
  }

  /**
   * Get agent status
   */
  async getAgentStatus(agentId: bigint): Promise<{
    exists: boolean;
    owner?: string;
    active?: boolean;
  }> {
    try {
      const [owner, active] = await Promise.all([
        this.executeWithFallback(client =>
          client.readContract({
            address: this.aiAgentINFTAddress,
            abi: AIAgentINFTAbi,
            functionName: 'ownerOf',
            args: [agentId],
          })
        ),
        this.executeWithFallback(client =>
          client.readContract({
            address: this.aiAgentINFTAddress,
            abi: AIAgentINFTAbi,
            functionName: 'isAgentActive',
            args: [agentId],
          })
        ),
      ]);

      return {
        exists: true,
        owner: owner as string,
        active: active as boolean,
      };
    } catch (error) {
      // Agent doesn't exist
      console.warn('Agent not found:', error);
      return { exists: false };
    }
  }

  /**
   * Estimate gas costs for an operation
   */
  async estimateGas(operation: 'agentTrade' | 'enableCopyTrading' | 'recordTrade'): Promise<{
    gasEstimate: bigint;
    gasPriceGwei: string;
  }> {
    const gasPrice = await this.avalancheClient.getGasPrice();

    // Rough estimates based on operation type
    const gasEstimates = {
      agentTrade: 200000n,
      enableCopyTrading: 80000n,
      recordTrade: 100000n,
    };

    return {
      gasEstimate: gasEstimates[operation],
      gasPriceGwei: formatEther(gasPrice * 1000000000n).slice(0, 8),
    };
  }
}

// Export singleton instance
export const chainService = new ChainService();

// Backward compatibility - export as crossChainService
export const crossChainService = chainService;

// Export class for testing
export { ChainService };

// Legacy types for backward compatibility (empty since cross-chain is removed)
export interface UnifiedAgentPerformance extends AgentPerformance {
  nativeTrades: number;
  nativePnL: bigint;
  nativeWinRate: number;
  externalTrades: number;
  externalPnL: bigint;
  externalWinRate: number;
  overallWinRate: number;
  polymarketTrades: number;
  polymarketPnL: bigint;
  kalshiTrades: number;
  kalshiPnL: bigint;
}

export interface MirrorTradeResult {
  mirrorKey: string;
  marketId: bigint;
  isYes: boolean;
  amount: bigint;
  sharesOut: bigint;
  txHash: string;
  timestamp: number;
}
