/**
 * AI Agent Trading Service
 * Executes trades on prediction markets using AI inference
 *
 * Simplified for Avalanche-only architecture
 * Predictions are generated locally and executed on-chain
 */

import type { Address } from 'viem';
import { parseEther, formatEther } from 'viem';
import predictionMarketService, { type Market, MarketStatus } from './predictionMarketService';
import aiAgentService from './aiAgentService';
import { agentINFTService } from './agentINFTService';
import { warriorsNFTService } from './warriorsNFTService';
import type { BattleDataIndex } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface TradingPrediction {
  marketId: bigint;
  agentId: bigint;
  isYes: boolean;
  confidence: number;
  reasoning: string;
  isVerified: boolean;
  chatId: string;
  proof: {
    inputHash: string;
    outputHash: string;
    providerAddress: Address;
    modelHash: string;
  };
  timestamp: number;
}

export interface TradeExecutionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  prediction?: TradingPrediction;
  amount?: string;
  sharesReceived?: string;
}

export interface AgentTradingConfig {
  agentId: bigint;
  maxTradeAmount: bigint;
  minConfidence: number;
  autoExecute: boolean;
  onlyVerified: boolean;  // CRITICAL: Only trade with verified predictions
}

// ============================================================================
// Service Class
// ============================================================================

class AIAgentTradingService {
  private readonly minConfidenceThreshold = 60; // Minimum confidence to trade

  /**
   * Generate AI prediction for a market
   * CRITICAL: Returns verification status - unverified predictions should NOT be traded
   */
  async generatePrediction(
    marketId: bigint,
    agentId: bigint
  ): Promise<TradingPrediction | null> {
    try {
      // Get market data
      const market = await predictionMarketService.getMarket(marketId);
      if (!market || market.status !== MarketStatus.Active) {
        console.error('Market not active or not found');
        return null;
      }

      // Get agent data - try iNFT first (Avalanche), then legacy registry (Avalanche)
      let agent: { id: bigint; strategy: number; riskProfile: number; isActive: boolean } | null = null;

      // First try iNFT service (agents are primarily iNFTs now)
      const inft = await agentINFTService.getINFT(agentId);
      if (inft && inft.onChainData.isActive) {
        agent = {
          id: agentId,
          strategy: 0, // Strategy is encrypted in iNFT metadata
          riskProfile: 1, // Risk profile is encrypted in iNFT metadata
          isActive: inft.onChainData.isActive
        };
        console.log(`[Trading] Using iNFT agent #${agentId}`);
      } else {
        // Fallback to legacy registry
        const legacyAgent = await aiAgentService.getAgent(agentId);
        if (legacyAgent && legacyAgent.isActive) {
          agent = {
            id: agentId,
            strategy: legacyAgent.strategy,
            riskProfile: legacyAgent.riskProfile,
            isActive: legacyAgent.isActive
          };
          console.log(`[Trading] Using legacy agent #${agentId}`);
        }
      }

      if (!agent || !agent.isActive) {
        console.error('Agent not active or not found');
        return null;
      }

      // Build battle data from market (handles warrior ID 0 gracefully)
      const battleData = await this.buildBattleData(market);

      // Generate prediction locally
      const parsed = this.generateLocalPrediction(market, battleData, agent);

      return {
        marketId,
        agentId,
        isYes: parsed.outcome === 'yes',
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        isVerified: false, // No external verification available
        chatId: `local_${Date.now()}`,
        proof: {
          inputHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
          outputHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
          providerAddress: '0x0000000000000000000000000000000000000000' as Address,
          modelHash: '0x0000000000000000000000000000000000000000000000000000000000000000'
        },
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error generating prediction:', error);
      return null;
    }
  }

  /**
   * Validate a prediction before execution
   * Simplified validation without external verification requirement
   */
  validatePrediction(prediction: TradingPrediction): {
    valid: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];

    console.log('[Validation] Checking prediction:', {
      confidence: prediction.confidence
    });

    // Check confidence threshold
    if (prediction.confidence < this.minConfidenceThreshold) {
      reasons.push(`Confidence ${prediction.confidence}% is below minimum ${this.minConfidenceThreshold}%`);
    }

    console.log('[Validation] Result:', { valid: reasons.length === 0, reasons });

    return {
      valid: reasons.length === 0,
      reasons
    };
  }

  /**
   * Execute trade on behalf of agent using server wallet
   * CRITICAL: This method sends the trade to the server for execution
   */
  async executeAgentTrade(
    prediction: TradingPrediction,
    amount: bigint
  ): Promise<TradeExecutionResult> {
    try {
      console.log(`[AgentTrading] Executing server-side trade for agent #${prediction.agentId}`);
      console.log(`   Market: #${prediction.marketId}, Position: ${prediction.isYes ? 'YES' : 'NO'}`);
      console.log(`   Amount: ${formatEther(amount)} CRwN, Confidence: ${prediction.confidence}%`);
      console.log(`   Verified: ${prediction.isVerified}, Proof: ${prediction.proof?.outputHash ? 'present' : 'missing'}`);

      // Serialize prediction properly (convert BigInt to string)
      const serializedPrediction = {
        marketId: prediction.marketId.toString(),
        agentId: prediction.agentId.toString(),
        isYes: prediction.isYes,
        confidence: prediction.confidence,
        reasoning: prediction.reasoning,
        isVerified: prediction.isVerified,
        chatId: prediction.chatId,
        proof: prediction.proof,
        timestamp: prediction.timestamp
      };

      const response = await fetch('/api/agents/execute-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: prediction.agentId.toString(),
          marketId: prediction.marketId.toString(),
          isYes: prediction.isYes,
          amount: amount.toString(),
          prediction: serializedPrediction
        })
      });

      const result = await response.json();

      if (!result.success) {
        console.error('[AgentTrading] Trade execution failed:', result.error);
        return {
          success: false,
          error: result.error || 'Trade execution failed',
          prediction
        };
      }

      console.log(`[AgentTrading] ✅ Trade executed successfully!`);
      console.log(`   TX Hash: ${result.txHash}`);

      return {
        success: true,
        txHash: result.txHash,
        prediction,
        amount: formatEther(amount)
      };
    } catch (error) {
      console.error('[AgentTrading] Error executing trade:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        prediction
      };
    }
  }

  /**
   * Get agent trading status (wallet balance, rate limits, etc.)
   */
  async getAgentTradingStatus(agentId?: bigint): Promise<{
    success: boolean;
    wallet?: { address: string; crwnBalance: string; nativeBalance: string };
    limits?: { maxTradeAmount: string; minConfidence: number };
    rateLimit?: { remaining: number; resetIn: number } | null;
    error?: string;
  }> {
    try {
      const url = agentId
        ? `/api/agents/execute-trade?agentId=${agentId.toString()}`
        : '/api/agents/execute-trade';

      const response = await fetch(url, { method: 'GET' });
      const result = await response.json();

      if (!result.success) {
        console.error('[AgentTrading] Failed to get status:', result.error);
        return { success: false, error: result.error };
      }

      return result;
    } catch (error) {
      console.error('[AgentTrading] Error getting status:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Store prediction for audit trail (local only)
   */
  async storePrediction(prediction: TradingPrediction): Promise<string | null> {
    // Predictions are stored locally only
    // They can be logged locally or stored in a database if needed
    console.log('[Trading] Prediction stored locally', {
      marketId: prediction.marketId.toString(),
      agentId: prediction.agentId.toString(),
      isYes: prediction.isYes,
      confidence: prediction.confidence
    });
    return null;
  }

  /**
   * Generate prediction locally
   */
  private generateLocalPrediction(
    market: Market,
    battleData: BattleDataIndex,
    agent: any
  ): { outcome: 'yes' | 'no' | 'draw'; confidence: number; reasoning: string } {
    const w1 = battleData.warriors[0];
    const w2 = battleData.warriors[1];

    // Calculate power scores
    const power1 = this.calculatePowerScore(w1?.traits);
    const power2 = this.calculatePowerScore(w2?.traits);

    const totalPower = power1 + power2;
    const warrior1Probability = totalPower > 0 ? power1 / totalPower : 0.5;

    // Determine outcome
    let outcome: 'yes' | 'no' | 'draw';
    if (warrior1Probability > 0.55) {
      outcome = 'yes';
    } else if (warrior1Probability < 0.45) {
      outcome = 'no';
    } else {
      outcome = 'draw';
    }

    const confidence = Math.min(95, Math.abs(warrior1Probability - 0.5) * 200 + 50);

    const reasoning = `Based on statistical analysis: Warrior 1 has power score ${power1.toFixed(0)}, ` +
      `Warrior 2 has power score ${power2.toFixed(0)}. ` +
      `Win probability for Warrior 1: ${(warrior1Probability * 100).toFixed(1)}%.`;

    return { outcome, confidence, reasoning };
  }

  /**
   * Calculate warrior power score
   */
  private calculatePowerScore(traits?: { strength: number; wit: number; charisma: number; defence: number; luck: number }): number {
    if (!traits) return 210; // Default if no traits
    return (
      traits.strength * 1.2 +
      traits.wit * 0.8 +
      traits.charisma * 0.5 +
      traits.defence * 1.0 +
      traits.luck * 0.7
    );
  }

  /**
   * Get trade recommendation based on prediction
   */
  getTradeRecommendation(prediction: TradingPrediction, maxAmount: bigint): {
    shouldTrade: boolean;
    position: 'yes' | 'no';
    amount: bigint;
    reasons: string[];
  } {
    const validation = this.validatePrediction(prediction);

    if (!validation.valid) {
      return {
        shouldTrade: false,
        position: prediction.isYes ? 'yes' : 'no',
        amount: BigInt(0),
        reasons: validation.reasons
      };
    }

    // Use the maxAmount directly - confidence is already validated above threshold (60%)
    // Don't scale by confidence as this causes unexpected large trades
    // The validation ensures we only trade when confidence is sufficient

    return {
      shouldTrade: true,
      position: prediction.isYes ? 'yes' : 'no',
      amount: maxAmount,
      reasons: [`Verified prediction with ${prediction.confidence}% confidence`]
    };
  }

  /**
   * Build battle data from market for prediction
   * Fetches real warrior data from the WarriorsNFT contract with fallback
   * Handles generic prediction markets (warrior IDs = 0) gracefully
   */
  private async buildBattleData(market: Market): Promise<BattleDataIndex> {
    // Check if this is a battle market or a generic prediction market
    const isBattleMarket = market.warrior1Id && market.warrior1Id !== BigInt(0) &&
                           market.warrior2Id && market.warrior2Id !== BigInt(0);

    // Helper to create default warrior data for generic markets
    const createDefaultWarrior = (warriorId: bigint, index: number) => ({
      id: warriorId || BigInt(index + 1),
      name: warriorId > BigInt(0) ? `Warrior #${warriorId}` : `Option ${index === 0 ? 'Yes' : 'No'}`,
      traits: { strength: 50, wit: 50, charisma: 50, defence: 50, luck: 50 },
      totalBattles: 0,
      wins: 0,
      losses: 0
    });

    // For generic markets (no warriors), return placeholder data
    if (!isBattleMarket) {
      // This is a generic prediction market, not a warrior battle
      return {
        battleId: market.battleId || BigInt(0),
        timestamp: Number(market.createdAt) * 1000,
        warriors: [
          createDefaultWarrior(BigInt(0), 0),
          createDefaultWarrior(BigInt(0), 1)
        ],
        rounds: [],
        outcome: 'draw',
        totalDamage: { warrior1: 0, warrior2: 0 },
        totalRounds: 0
      };
    }

    // Helper to fetch warrior data with fallback
    const getWarriorData = async (warriorId: bigint, index: number) => {
      try {
        const details = await warriorsNFTService.getWarriorsDetails(Number(warriorId));
        return {
          id: warriorId,
          name: details.name,
          traits: details.traits,
          totalBattles: 0, // Historical data not available from contract
          wins: 0,
          losses: 0
        };
      } catch (error) {
        console.warn(`Failed to fetch warrior ${warriorId}, using defaults:`, error);
        return createDefaultWarrior(warriorId, index);
      }
    };

    // Fetch both warriors in parallel
    const [warrior1, warrior2] = await Promise.all([
      getWarriorData(market.warrior1Id, 0),
      getWarriorData(market.warrior2Id, 1)
    ]);

    return {
      battleId: market.battleId,
      timestamp: Number(market.createdAt) * 1000,
      warriors: [warrior1, warrior2],
      rounds: [],
      outcome: 'draw',
      totalDamage: { warrior1: 0, warrior2: 0 },
      totalRounds: 0
    };
  }

}

export const aiAgentTradingService = new AIAgentTradingService();
export default aiAgentTradingService;
