/**
 * Type Definitions Index
 * Re-exports all types for convenient importing
 */

// AI Agent types
export * from './agent';

// Micro Market types
export * from './microMarket';

// Debate types
export * from './debate';

// Creator Revenue types
export * from './creator';

// Battle data types (simplified from previous types)
export interface WarriorTraits {
  strength: number;
  wit: number;
  charisma: number;
  defence: number;
  luck: number;
}

export interface WarriorData {
  id: bigint;
  name?: string;
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
