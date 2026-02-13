/**
 * Debate Compute Service
 * Handles AI reasoning generation for debates
 * Simplified for Avalanche-only architecture (0G Compute removed)
 */

// Local type definitions (previously from types/zeroG)
export interface WarriorTraits {
  strength: number;
  wit: number;
  charisma: number;
  defence: number;
  luck: number;
}

export interface WarriorData {
  id: bigint;
  traits: WarriorTraits;
  totalBattles: number;
  wins: number;
  losses: number;
}

export interface BattleDataIndex {
  battleId: bigint;
  timestamp: number;
  warriors: WarriorData[];
  rounds: {
    roundNumber: number;
    moves: { warriorId: bigint; move: string }[];
    damage: { warriorId: bigint; damageDealt: number; damageTaken: number }[];
  }[];
  outcome: 'warrior1' | 'warrior2' | 'draw';
  totalDamage: { warrior1: number; warrior2: number };
  totalRounds: number;
}

export interface InferenceProof {
  signature: string;
  modelHash: string;
  inputHash: string;
  outputHash: string;
  providerAddress: string;
  attestation?: string;
}

// Types for debate compute
export interface DebatePredictionResult {
  agentId: bigint;
  debateId: bigint;
  outcome: 'yes' | 'no' | 'draw';
  confidence: number;
  reasoning: string;
  chatId: string;
  proof: InferenceProof;
  reasoningHash: string;
  timestamp: number;
  isVerified?: boolean;
  fallbackMode?: boolean;
}

export interface DebateReasoningResult {
  agentId: bigint;
  debateId: bigint;
  phase: 'prediction' | 'evidence' | 'rebuttal';
  reasoning: string;
  evidence: string[];
  confidence: number;
  chatId: string;
  proof: InferenceProof;
  storageRootHash?: string;
}

export interface DebateRebuttalResult {
  agentId: bigint;
  targetAgentId: bigint;
  rebuttal: string;
  counterEvidence: string[];
  strength: number;
  chatId: string;
  proof: InferenceProof;
}

export interface AgentPredictionContext {
  agentId: bigint;
  outcome: string;
  confidence: number;
  reasoning: string;
}

/**
 * Serialize battle data to string for prompts
 */
function serializeBattleData(battleData: BattleDataIndex): string {
  return JSON.stringify({
    battleId: battleData.battleId.toString(),
    timestamp: battleData.timestamp,
    warriors: battleData.warriors.map(w => ({
      id: w.id.toString(),
      traits: w.traits,
      stats: { totalBattles: w.totalBattles, wins: w.wins, losses: w.losses }
    })),
    outcome: battleData.outcome,
    totalRounds: battleData.totalRounds,
    totalDamage: battleData.totalDamage
  }, null, 2);
}

class DebateComputeService {
  // ============================================================================
  // Prediction Phase
  // ============================================================================

  /**
   * Generate AI prediction for a debate
   * Called during PREDICTION phase
   * Simplified implementation without 0G - uses local computation
   */
  async generatePrediction(
    debateId: bigint,
    marketId: bigint,
    battleId: bigint,
    agentId: bigint,
    battleData: BattleDataIndex
  ): Promise<DebatePredictionResult> {
    // Local prediction based on warrior stats
    const w1 = battleData.warriors[0];
    const w2 = battleData.warriors[1];

    const power1 = this.calculatePowerScore(w1?.traits || { strength: 50, wit: 50, charisma: 50, defence: 50, luck: 50 });
    const power2 = this.calculatePowerScore(w2?.traits || { strength: 50, wit: 50, charisma: 50, defence: 50, luck: 50 });

    const totalPower = power1 + power2;
    const warrior1Probability = power1 / totalPower;

    let outcome: 'yes' | 'no' | 'draw';
    if (warrior1Probability > 0.55) {
      outcome = 'yes';
    } else if (warrior1Probability < 0.45) {
      outcome = 'no';
    } else {
      outcome = 'draw';
    }

    const confidence = Math.abs(warrior1Probability - 0.5) * 200;
    const reasoning = this.generatePredictionReasoning(w1?.traits, w2?.traits, warrior1Probability);
    const reasoningHash = this.hashString(reasoning);

    return {
      agentId,
      debateId,
      outcome,
      confidence,
      reasoning,
      chatId: `local_${Date.now()}`,
      proof: this.createLocalProof(reasoning),
      reasoningHash,
      timestamp: Date.now(),
      isVerified: false,
      fallbackMode: true
    };
  }

  /**
   * Generate prediction reasoning text
   */
  private generatePredictionReasoning(
    warrior1Stats?: WarriorTraits,
    warrior2Stats?: WarriorTraits,
    probability?: number
  ): string {
    if (!warrior1Stats || !warrior2Stats) {
      return 'Insufficient data to make a detailed prediction.';
    }

    const power1 = this.calculatePowerScore(warrior1Stats);
    const power2 = this.calculatePowerScore(warrior2Stats);
    const diff = Math.abs(power1 - power2);
    const winner = power1 > power2 ? 'Warrior 1' : 'Warrior 2';

    let analysis = `Based on statistical analysis of warrior attributes:\n\n`;
    analysis += `Warrior 1 - STR:${warrior1Stats.strength} WIT:${warrior1Stats.wit} CHA:${warrior1Stats.charisma} DEF:${warrior1Stats.defence} LCK:${warrior1Stats.luck}\n`;
    analysis += `Warrior 2 - STR:${warrior2Stats.strength} WIT:${warrior2Stats.wit} CHA:${warrior2Stats.charisma} DEF:${warrior2Stats.defence} LCK:${warrior2Stats.luck}\n\n`;

    if (diff < 50) {
      analysis += `Very close matchup! ${winner} has a slight edge. This could go either way.`;
    } else if (diff < 200) {
      analysis += `${winner} appears stronger overall, but the battle could still be competitive.`;
    } else {
      analysis += `${winner} has a significant advantage in this matchup. Expect a decisive victory.`;
    }

    return analysis;
  }

  // ============================================================================
  // Evidence Phase
  // ============================================================================

  /**
   * Generate evidence-backed reasoning for a prediction
   * Called during EVIDENCE phase
   * Simplified implementation without 0G
   */
  async generateEvidence(
    debateId: bigint,
    agentId: bigint,
    battleData: BattleDataIndex,
    otherPredictions?: AgentPredictionContext[]
  ): Promise<DebateReasoningResult> {
    const w1 = battleData.warriors[0];
    const w2 = battleData.warriors[1];

    const evidence: string[] = [];
    if (w1) {
      evidence.push(`Warrior 1 has ${w1.wins}/${w1.totalBattles} wins (${w1.totalBattles > 0 ? Math.round(w1.wins / w1.totalBattles * 100) : 0}% win rate)`);
      evidence.push(`Warrior 1 strength: ${w1.traits.strength}, defence: ${w1.traits.defence}`);
    }
    if (w2) {
      evidence.push(`Warrior 2 has ${w2.wins}/${w2.totalBattles} wins (${w2.totalBattles > 0 ? Math.round(w2.wins / w2.totalBattles * 100) : 0}% win rate)`);
      evidence.push(`Warrior 2 strength: ${w2.traits.strength}, defence: ${w2.traits.defence}`);
    }

    const reasoning = `Evidence-based analysis:\n\n${evidence.join('\n')}\n\nConclusion: The warrior with better overall stats and win rate is more likely to prevail.`;
    const confidence = 65;

    return {
      agentId,
      debateId,
      phase: 'evidence',
      reasoning,
      evidence,
      confidence,
      chatId: `local_evidence_${Date.now()}`,
      proof: this.createLocalProof(reasoning)
    };
  }

  // ============================================================================
  // Rebuttal Phase
  // ============================================================================

  /**
   * Generate rebuttal against another agent's prediction
   * Called during REBUTTAL phase
   * Simplified implementation without 0G
   */
  async generateRebuttal(
    debateId: bigint,
    agentId: bigint,
    targetAgentId: bigint,
    targetPrediction: {
      outcome: string;
      reasoning: string;
      confidence: number;
    },
    battleData: BattleDataIndex
  ): Promise<DebateRebuttalResult> {
    const rebuttal = `While the prediction of "${targetPrediction.outcome}" has merit, there are factors that could lead to a different outcome. Battle unpredictability and luck stats can significantly alter results.`;

    const counterEvidence = [
      'Luck factor can swing battles unexpectedly',
      'Historical performance may not reflect current form',
      'Matchup-specific advantages not fully accounted for'
    ];

    return {
      agentId,
      targetAgentId,
      rebuttal,
      counterEvidence,
      strength: 50,
      chatId: `local_rebuttal_${Date.now()}`,
      proof: this.createLocalProof(rebuttal)
    };
  }

  // ============================================================================
  // Verification (Stub)
  // ============================================================================

  /**
   * Verify reasoning proof
   * With 0G removed, always returns false (no verified proofs)
   */
  async verifyReasoningProof(
    chatId: string,
    proof: InferenceProof
  ): Promise<boolean> {
    // Without 0G, we cannot verify proofs
    console.warn('Proof verification unavailable: 0G compute removed');
    return false;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Calculate warrior power score
   */
  private calculatePowerScore(traits: WarriorTraits): number {
    return (
      traits.strength * 1.2 +
      traits.wit * 0.8 +
      traits.charisma * 0.5 +
      traits.defence * 1.0 +
      traits.luck * 0.7
    );
  }

  /**
   * Create a local proof placeholder
   */
  private createLocalProof(content: string): InferenceProof {
    return {
      signature: this.hashString(content),
      modelHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      inputHash: this.hashString(content),
      outputHash: this.hashString(content),
      providerAddress: '0x0000000000000000000000000000000000000000'
    };
  }

  /**
   * Simple string hash (FNV-1a)
   * Note: NOT cryptographically secure
   */
  private hashString(str: string): string {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    let hash = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < data.length; i++) {
      hash ^= data[i];
      hash = Math.imul(hash, 0x01000193); // FNV prime
    }
    return '0x' + (hash >>> 0).toString(16).padStart(64, '0');
  }

  /**
   * Check if compute is enabled (always false with 0G removed)
   */
  is0GEnabled(): boolean {
    return false;
  }
}

export const debateComputeService = new DebateComputeService();
export default debateComputeService;
