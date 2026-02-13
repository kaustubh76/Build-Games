/**
 * useAgentTradeHistory Hook
 * Fetch and display agent trade history from blockchain events
 *
 * This hook operates on Avalanche Fuji Testnet (Chain ID: 43113)
 * where the AIAgentINFT contract emits TradeRecorded events
 */

import { useState, useEffect, useCallback } from 'react';
import { formatEther, type Address, parseAbiItem, createPublicClient, http } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { chainsToContracts, getChainId, getAvalancheRpcUrl } from '@/constants';

// ============================================================================
// Types
// ============================================================================

export interface TradeHistoryEntry {
  agentId: bigint;
  marketId: bigint;
  won: boolean;
  pnl: bigint;
  confidence: bigint;
  blockNumber: bigint;
  transactionHash: string;
  timestamp?: number;
}

export interface UseAgentTradeHistoryResult {
  trades: TradeHistoryEntry[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const AVALANCHE_CHAIN_ID = getChainId(); // 43113 Avalanche Fuji Testnet

// Create Avalanche public client for read operations
const avalancheClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(getAvalancheRpcUrl()),
});

// TradeRecorded event from AIAgentINFT (on Avalanche chain)
// event TradeRecorded(uint256 indexed tokenId, bool won, int256 pnl)
const TRADE_RECORDED_EVENT = parseAbiItem(
  'event TradeRecorded(uint256 indexed tokenId, bool won, int256 pnl)'
);

// Max number of trades to display
const MAX_TRADES = 20;

// Total block range to search (reduced for performance)
const TOTAL_BLOCK_RANGE = BigInt(50000);

// Max blocks per query (Avalanche RPC limits, use 5000 to be safe)
const MAX_BLOCKS_PER_QUERY = BigInt(5000);

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook to fetch agent trade history from TradeRecorded events on Avalanche chain
 */
export function useAgentTradeHistory(agentId: bigint | undefined): UseAgentTradeHistoryResult {
  const [trades, setTrades] = useState<TradeHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // AIAgentINFT contract on Avalanche chain
  const aiAgentINFTAddress = chainsToContracts[AVALANCHE_CHAIN_ID]?.aiAgentINFT as Address;

  const fetchTradeHistory = useCallback(async () => {
    if (!agentId || !aiAgentINFTAddress) {
      setTrades([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get current block from Avalanche chain
      const currentBlock = await avalancheClient.getBlockNumber();
      const startBlock = currentBlock > TOTAL_BLOCK_RANGE ? currentBlock - TOTAL_BLOCK_RANGE : BigInt(0);

      console.log(`Fetching trade history for agent #${agentId} from Avalanche block ${startBlock} to ${currentBlock}`);

      // Chunk the query into multiple smaller queries to avoid RPC limits
      const allLogs: any[] = [];
      let fromBlock = startBlock;

      while (fromBlock < currentBlock) {
        const toBlock = fromBlock + MAX_BLOCKS_PER_QUERY > currentBlock
          ? currentBlock
          : fromBlock + MAX_BLOCKS_PER_QUERY;

        try {
          const logs = await avalancheClient.getLogs({
            address: aiAgentINFTAddress,
            event: TRADE_RECORDED_EVENT,
            args: {
              tokenId: agentId,
            },
            fromBlock,
            toBlock,
          });

          allLogs.push(...logs);

          // If we have enough trades, stop querying (search from recent to old)
          if (allLogs.length >= MAX_TRADES) {
            break;
          }
        } catch (chunkError) {
          // Log but continue with other chunks
          console.warn(`Failed to fetch logs for blocks ${fromBlock}-${toBlock}:`, chunkError);
        }

        fromBlock = toBlock + BigInt(1);
      }

      console.log(`Found ${allLogs.length} trade events for agent #${agentId} on Avalanche chain`);
      const logs = allLogs;

      // Parse and sort trades (most recent first)
      const parsedTrades: TradeHistoryEntry[] = logs
        .map((log) => ({
          agentId: log.args.tokenId as bigint,
          marketId: BigInt(0), // Not available in this event, placeholder
          won: log.args.won as boolean,
          pnl: log.args.pnl as bigint,
          confidence: BigInt(0), // Not available in this event, placeholder
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          // Estimate timestamp (Avalanche ~2 sec blocks)
          timestamp: Math.floor(Date.now() / 1000) - Number(currentBlock - log.blockNumber),
        }))
        .sort((a, b) => Number(b.blockNumber - a.blockNumber))
        .slice(0, MAX_TRADES);

      setTrades(parsedTrades);
    } catch (err) {
      console.error('Error fetching agent trade history:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch trade history'));
      setTrades([]);
    } finally {
      setIsLoading(false);
    }
  }, [agentId, aiAgentINFTAddress]);

  // Initial fetch when agentId changes
  useEffect(() => {
    fetchTradeHistory();
  }, [fetchTradeHistory]);

  return {
    trades,
    isLoading,
    error,
    refetch: fetchTradeHistory,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format PnL to human-readable string
 */
export function formatTradePnL(pnl: bigint): string {
  const value = Number(formatEther(pnl));
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}`;
}

/**
 * Format confidence to percentage
 */
export function formatConfidence(confidence: bigint): string {
  // Confidence is stored in basis points (0-10000)
  return `${(Number(confidence) / 100).toFixed(1)}%`;
}

/**
 * Format timestamp to relative time
 */
export function formatTradeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Get PnL color class
 */
export function getTradePnLColor(pnl: bigint): string {
  if (pnl > BigInt(0)) return 'text-green-400';
  if (pnl < BigInt(0)) return 'text-red-400';
  return 'text-gray-400';
}

export default useAgentTradeHistory;
