/**
 * Oracle Service
 * Handles AI-powered battle resolution and verification
 * Simplified for Avalanche-only architecture
 */

import { encodePacked, keccak256, type Address } from 'viem';
import { logger } from '../lib/logger';

// Local type definitions
export interface WarriorTraits {
  strength: number;
  wit: number;
  charisma: number;
  defence: number;
  luck: number;
}

// Types for battle resolution
export interface BattleResult {
  battleId: bigint;
  warrior1Id: bigint;
  warrior2Id: bigint;
  warrior1Damage: bigint;
  warrior2Damage: bigint;
  winner: 'warrior1' | 'warrior2' | 'draw';
  rounds: number;
  timestamp: number;
  warrior1Stats?: WarriorTraits;
  warrior2Stats?: WarriorTraits;
  roundData?: {
    roundNumber: number;
    moves: { warriorId: bigint; move: string }[];
    damage: { warriorId: bigint; damageDealt: number; damageTaken: number }[];
  }[];
}

export interface ResolutionProof {
  battleId: bigint;
  outcome: 'yes' | 'no' | 'draw';
  aiSignatures: string[];
  consensusReached: boolean;
  confidenceScore: number;
  proofHash: string;
}

export interface AIProvider {
  address: Address;
  name: string;
  modelEndpoint: string;
  isActive: boolean;
  accuracy: number;
  totalResolutions: number;
}

// Resolution request status
export enum ResolutionStatus {
  Pending = 0,
  InProgress = 1,
  Completed = 2,
  Disputed = 3,
  Failed = 4
}

class OracleService {
  private readonly minConsensus = 2;
  private readonly requiredProviders = 3;

  // Cached AI providers (local simulation only)
  private aiProviders: AIProvider[] = [];
  private providersLoaded: boolean = false;

  constructor() {
    // Initialize with local simulation providers
    this.initializeLocalProviders();
  }

  /**
   * Initialize local simulation providers
   * Uses local deterministic resolution
   */
  private initializeLocalProviders(): void {
    this.aiProviders = [
      {
        address: '0x1111111111111111111111111111111111111111' as Address,
        name: 'Local Oracle 1',
        modelEndpoint: 'local',
        isActive: true,
        accuracy: 98,
        totalResolutions: 0
      },
      {
        address: '0x2222222222222222222222222222222222222222' as Address,
        name: 'Local Oracle 2',
        modelEndpoint: 'local',
        isActive: true,
        accuracy: 97,
        totalResolutions: 0
      },
      {
        address: '0x3333333333333333333333333333333333333333' as Address,
        name: 'Local Oracle 3',
        modelEndpoint: 'local',
        isActive: true,
        accuracy: 96,
        totalResolutions: 0
      }
    ];
    this.providersLoaded = true;
  }

  /**
   * Load AI providers (uses local providers)
   */
  async loadProviders(): Promise<void> {
    if (!this.providersLoaded) {
      this.initializeLocalProviders();
    }
  }

  /**
   * Request battle resolution from oracle
   * Uses local deterministic resolution
   */
  async requestResolution(battleResult: BattleResult): Promise<ResolutionProof> {
    logger.info('Requesting resolution for battle:', battleResult.battleId.toString());
    return this.requestResolutionLocal(battleResult);
  }

  /**
   * Local deterministic resolution
   */
  private async requestResolutionLocal(battleResult: BattleResult): Promise<ResolutionProof> {
    await this.loadProviders();

    // Query all active AI providers (local simulation)
    const activeProviders = this.aiProviders.filter(p => p.isActive);
    const resolutions = await Promise.all(
      activeProviders.map(provider => this.queryAIProviderLocal(provider, battleResult))
    );

    // Check for consensus
    const outcomes = resolutions.map(r => r.outcome);
    const consensusOutcome = this.findConsensus(outcomes);

    if (!consensusOutcome) {
      throw new Error('Failed to reach consensus among AI providers');
    }

    // Generate proof hash
    const proofHash = this.generateProofHash(battleResult, consensusOutcome, resolutions);

    return {
      battleId: battleResult.battleId,
      outcome: consensusOutcome,
      aiSignatures: resolutions.map(r => r.signature),
      consensusReached: true,
      confidenceScore: this.calculateConfidence(outcomes, consensusOutcome),
      proofHash
    };
  }

  /**
   * Query a single AI provider (local deterministic)
   */
  private async queryAIProviderLocal(
    provider: AIProvider,
    battleResult: BattleResult
  ): Promise<{ outcome: 'yes' | 'no' | 'draw'; signature: string; confidence: number }> {
    // Determine outcome based on battle damage
    let outcome: 'yes' | 'no' | 'draw';
    if (battleResult.warrior1Damage < battleResult.warrior2Damage) {
      outcome = 'yes'; // Warrior 1 wins (less damage = victory)
    } else if (battleResult.warrior1Damage > battleResult.warrior2Damage) {
      outcome = 'no'; // Warrior 2 wins
    } else {
      outcome = 'draw';
    }

    // Generate signature
    const signature = await this.generateAISignature(provider, battleResult, outcome);

    return {
      outcome,
      signature,
      confidence: 95 + Math.random() * 5 // 95-100% confidence
    };
  }

  /**
   * Generate AI provider signature for the resolution
   */
  private async generateAISignature(
    provider: AIProvider,
    battleResult: BattleResult,
    outcome: 'yes' | 'no' | 'draw'
  ): Promise<string> {
    const dataToSign = encodePacked(
      ['uint256', 'uint256', 'uint256', 'string', 'address'],
      [
        battleResult.battleId,
        battleResult.warrior1Damage,
        battleResult.warrior2Damage,
        outcome,
        provider.address
      ]
    );

    return keccak256(dataToSign);
  }

  /**
   * Find consensus outcome from multiple AI responses
   */
  private findConsensus(outcomes: ('yes' | 'no' | 'draw')[]): 'yes' | 'no' | 'draw' | null {
    const counts = { yes: 0, no: 0, draw: 0 };

    outcomes.forEach(outcome => {
      counts[outcome]++;
    });

    for (const [outcome, count] of Object.entries(counts)) {
      if (count >= this.minConsensus) {
        return outcome as 'yes' | 'no' | 'draw';
      }
    }

    return null;
  }

  /**
   * Calculate confidence score based on consensus strength
   */
  private calculateConfidence(
    outcomes: ('yes' | 'no' | 'draw')[],
    consensusOutcome: 'yes' | 'no' | 'draw'
  ): number {
    const agreeing = outcomes.filter(o => o === consensusOutcome).length;
    return (agreeing / outcomes.length) * 100;
  }

  /**
   * Generate proof hash for on-chain verification
   */
  private generateProofHash(
    battleResult: BattleResult,
    outcome: 'yes' | 'no' | 'draw',
    resolutions: { outcome: string; signature: string; confidence: number }[]
  ): string {
    const data = encodePacked(
      ['uint256', 'uint256', 'uint256', 'string', 'bytes32[]'],
      [
        battleResult.battleId,
        battleResult.warrior1Damage,
        battleResult.warrior2Damage,
        outcome,
        resolutions.map(r => r.signature as `0x${string}`)
      ]
    );

    return keccak256(data);
  }

  /**
   * Verify a resolution proof
   */
  async verifyProof(proof: ResolutionProof): Promise<boolean> {
    if (proof.aiSignatures.length < this.minConsensus) {
      return false;
    }

    if (!proof.consensusReached) {
      return false;
    }

    if (proof.confidenceScore < 70) {
      return false;
    }

    return true;
  }

  /**
   * Get battle prediction
   * Uses local calculation
   */
  async predictBattleOutcome(
    warrior1Id: bigint,
    warrior2Id: bigint,
    warrior1Stats: WarriorTraits,
    warrior2Stats: WarriorTraits
  ): Promise<{
    prediction: 'warrior1' | 'warrior2';
    confidence: number;
    reasoning: string;
    suggestedOdds: { yes: number; no: number };
  }> {
    // Calculate power scores
    const power1 = this.calculatePowerScore(warrior1Stats);
    const power2 = this.calculatePowerScore(warrior2Stats);

    const totalPower = power1 + power2;
    const warrior1Probability = power1 / totalPower;

    return {
      prediction: warrior1Probability > 0.5 ? 'warrior1' : 'warrior2',
      confidence: Math.abs(warrior1Probability - 0.5) * 200,
      reasoning: this.generatePredictionReasoning(warrior1Stats, warrior2Stats, warrior1Probability),
      suggestedOdds: {
        yes: Math.round(warrior1Probability * 100),
        no: Math.round((1 - warrior1Probability) * 100)
      }
    };
  }

  /**
   * Calculate warrior power score
   */
  private calculatePowerScore(stats: WarriorTraits): number {
    return (
      stats.strength * 1.2 +
      stats.wit * 0.8 +
      stats.charisma * 0.5 +
      stats.defence * 1.0 +
      stats.luck * 0.7
    );
  }

  /**
   * Generate prediction reasoning text
   */
  private generatePredictionReasoning(
    warrior1Stats: WarriorTraits,
    warrior2Stats: WarriorTraits,
    probability: number
  ): string {
    const power1 = this.calculatePowerScore(warrior1Stats);
    const power2 = this.calculatePowerScore(warrior2Stats);
    const diff = Math.abs(power1 - power2);
    const winner = power1 > power2 ? 'Warrior 1' : 'Warrior 2';

    if (diff < 100) {
      return `Very close matchup! ${winner} has a slight edge. This could go either way.`;
    } else if (diff < 500) {
      return `${winner} appears stronger overall, but the battle could still be competitive.`;
    } else {
      return `${winner} has a significant advantage in this matchup. Expect a decisive victory.`;
    }
  }

  /**
   * Get registered AI providers
   */
  async getAIProviders(): Promise<AIProvider[]> {
    await this.loadProviders();
    return this.aiProviders.filter(p => p.isActive);
  }

  /**
   * Get resolution status for a battle
   */
  async getResolutionStatus(battleId: bigint): Promise<{
    status: ResolutionStatus;
    proof: ResolutionProof | null;
    disputeDeadline: number | null;
  }> {
    // In production, fetch from contract
    return {
      status: ResolutionStatus.Pending,
      proof: null,
      disputeDeadline: null
    };
  }
}

export const oracleService = new OracleService();
export default oracleService;
