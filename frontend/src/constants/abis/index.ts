/**
 * Unified Contract ABIs
 *
 * Single source of truth for all contract interfaces.
 * All API routes should import ABIs from this module.
 *
 * Usage:
 * import { EXTERNAL_MARKET_MIRROR_ABI, CRWN_TOKEN_ABI, PredictionMarketAMMAbi } from '@/constants/abis';
 */

export { EXTERNAL_MARKET_MIRROR_ABI } from './externalMarketMirrorAbi';
export type { ExternalMarketMirrorABI } from './externalMarketMirrorAbi';

export { CRWN_TOKEN_ABI } from './crwnTokenAbi';
export type { CRwNTokenABI } from './crwnTokenAbi';

// Full contract ABIs extracted from compiled Foundry output
export { PredictionMarketAMMAbi } from './PredictionMarketAMMAbi';
export { OutcomeTokenAbi } from './OutcomeTokenAbi';
export { MarketFactoryAbi } from './MarketFactoryAbi';
export { PredictionArenaAbi } from './PredictionArenaAbi';
export { AILiquidityManagerAbi } from './AILiquidityManagerAbi';

// Contract addresses - re-export from constants for convenience
export { AVALANCHE_TESTNET_CONTRACTS, AVALANCHE_MAINNET_CONTRACTS } from '../index';
