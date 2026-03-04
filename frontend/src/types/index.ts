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
// Note: getTierLabel and getTierColor are excluded to avoid ambiguity
// with same-named exports from './agent'. Import directly from
// '@/types/creator' when needed for creator tiers.
export {
  CreatorType,
  CreatorTier,
  type Creator,
  type RevenueEntry,
  type MarketFees,
  type CreatorDisplay,
  type RevenueEntryDisplay,
  type MarketFeesDisplay,
  type RevenueBreakdown,
  type TierRequirements,
  type CreatorStats,
  type RevenueTimePoint,
  type CreatorLeaderboardEntry,
  type CreatedAsset,
  type CreatorRegisteredEvent,
  type FeeRecordedEvent,
  type FeeDistributedEvent,
  type RewardsClaimedEvent,
  type TierUpgradedEvent,
  type MarketCreatorSetEvent,
  type WarriorCreatorSetEvent,
  FEE_RATES,
  TIER_THRESHOLDS,
  TIER_MULTIPLIERS,
  getCreatorTypeLabel,
  getTierIcon,
  getNextTier,
  getTierProgress,
  calculateCreatorFee,
  getRevenueSourceLabel,
  getRevenueSourceColor,
  formatVolume,
  getTierBenefits,
} from './creator';

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
