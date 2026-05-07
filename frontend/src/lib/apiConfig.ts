/**
 * Centralized API Configuration - Avalanche Only
 *
 * All API routes should import from this file instead of hardcoding values.
 * This enables easy network switching between testnet and mainnet.
 */

// ============================================================================
// Chain RPCs - Avalanche
// ============================================================================

export const AVALANCHE_RPC = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
export const AVALANCHE_MAINNET_RPC = process.env.NEXT_PUBLIC_AVALANCHE_MAINNET_RPC || 'https://api.avax.network/ext/bc/C/rpc';

// Chain IDs
export const AVALANCHE_CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '43113', 10);

// ============================================================================
// Contract Addresses — chain-aware, single source of truth
// ============================================================================
//
// Resolution order (highest precedence wins):
//   1. Per-contract env override (e.g. NEXT_PUBLIC_CROWN_TOKEN)
//   2. chainsToContracts[NEXT_PUBLIC_CHAIN_ID] from constants.ts
//   3. Throws at module-load if a non-local chain resolves to 0x0…0
//
// Why this layout: the legacy `as const` flat map silently fell back to
// hardcoded Fuji addresses when NEXT_PUBLIC_CHAIN_ID flipped to 43114.
// That's a foot-gun for the mainnet cutover. Now: a misconfigured mainnet
// deploy (zero-address placeholders, no env overrides) crashes loudly at
// startup via the instrumentation hook + envValidator.
//
// The export shape (the keys) is preserved so the 59 existing call sites
// (`AVALANCHE_CONTRACTS.crownToken` etc.) keep working unchanged.

import { chainsToContracts, getChainId } from '@/constants';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Map of API-route key → corresponding key in `chainsToContracts` map. */
const CONTRACT_KEY_MAP = {
  crownToken: 'crownToken',
  predictionMarketAMM: 'predictionMarketAMM',
  aiAgentRegistry: 'aiAgentRegistry',
  aiDebateOracle: 'aiDebateOracle',
  outcomeToken: 'outcomeToken',
  creatorRevenueShare: 'creatorRevenueShare',
  warriorsNFT: 'warriorsNFT',
  arenaFactory: 'ArenaFactory', // note: capital-A in constants.ts
  externalMarketMirror: 'externalMarketMirror',
  aiAgentINFT: 'aiAgentINFT',
  agentINFTOracle: 'agentINFTOracle',
} as const;

/** Per-contract env override variable name. */
const CONTRACT_ENV_OVERRIDE = {
  crownToken: 'NEXT_PUBLIC_CROWN_TOKEN',
  predictionMarketAMM: 'NEXT_PUBLIC_PREDICTION_MARKET',
  aiAgentRegistry: 'NEXT_PUBLIC_AI_AGENT_REGISTRY',
  aiDebateOracle: 'NEXT_PUBLIC_AI_DEBATE_ORACLE',
  outcomeToken: 'NEXT_PUBLIC_OUTCOME_TOKEN',
  creatorRevenueShare: 'NEXT_PUBLIC_CREATOR_REVENUE',
  warriorsNFT: 'NEXT_PUBLIC_WARRIORS_NFT',
  arenaFactory: 'NEXT_PUBLIC_ARENA_FACTORY',
  externalMarketMirror: 'NEXT_PUBLIC_EXTERNAL_MARKET_MIRROR',
  aiAgentINFT: 'NEXT_PUBLIC_AI_AGENT_INFT',
  agentINFTOracle: 'NEXT_PUBLIC_AGENT_INFT_ORACLE',
} as const;

function resolveContracts(): Record<keyof typeof CONTRACT_KEY_MAP, string> {
  const chainId = getChainId();
  const chainContracts = chainsToContracts[chainId] || {};
  const out: Record<string, string> = {};

  for (const apiKey of Object.keys(CONTRACT_KEY_MAP) as Array<keyof typeof CONTRACT_KEY_MAP>) {
    const envName = CONTRACT_ENV_OVERRIDE[apiKey];
    const envValue = process.env[envName];
    const chainValue = (chainContracts as Record<string, string | undefined>)[
      CONTRACT_KEY_MAP[apiKey]
    ];
    out[apiKey] = (envValue && envValue.length > 0 ? envValue : chainValue) || '';
  }

  // Refuse zero/empty addresses for non-local chains. Local (31337) is allowed
  // to use placeholders since contracts are deployed dynamically per-test.
  if (chainId !== 31337) {
    const bad: string[] = [];
    for (const [k, v] of Object.entries(out)) {
      if (!v || v.toLowerCase() === ZERO_ADDRESS) {
        bad.push(`${k} (set ${CONTRACT_ENV_OVERRIDE[k as keyof typeof CONTRACT_ENV_OVERRIDE]} or update chainsToContracts[${chainId}] in constants.ts)`);
      }
    }
    if (bad.length > 0) {
      throw new Error(
        `[apiConfig] Refusing to start: chain ${chainId} has zero/empty contract addresses for: ${bad.join(', ')}`
      );
    }
  }

  return out as Record<keyof typeof CONTRACT_KEY_MAP, string>;
}

export const AVALANCHE_CONTRACTS = resolveContracts();

// ============================================================================
// API Rate Limits
// ============================================================================

export const RATE_LIMITS = {
  agentTrades: {
    maxPerMinute: 10,
    windowMs: 60000,
  },
  inference: {
    maxPerMinute: 20,
    blockDurationMs: 300000, // 5 minutes
  },
} as const;

// ============================================================================
// Trading Limits
// ============================================================================

export const TRADING_LIMITS = {
  maxTradeAmount: '100', // in CRwN
  minConfidence: 60, // percentage
  defaultTradeAmount: '10', // in CRwN
} as const;

// ============================================================================
// ABIs - Minimal for API routes
// ============================================================================

export const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
] as const;

export const AI_AGENT_INFT_ABI = [
  'function getAgentData(uint256 tokenId) view returns (tuple(uint8 tier, uint256 stakedAmount, bool isActive, bool copyTradingEnabled, uint256 createdAt, uint256 lastUpdatedAt))',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getEncryptedMetadataRef(uint256 tokenId) view returns (string)',
  'function getMetadataHash(uint256 tokenId) view returns (bytes32)',
  'function totalSupply() view returns (uint256)',
  'function crownToken() view returns (address)',
  'function MIN_STAKE_NOVICE() view returns (uint256)',
  'function getAgentFollowers(uint256 tokenId) view returns (address[])',
  'function getCopyTradeConfig(address user, uint256 tokenId) view returns (tuple(uint256 tokenId, uint256 maxAmountPerTrade, uint256 totalCopied, uint256 startedAt, bool isActive))',
  'function followAgent(uint256 tokenId, uint256 maxAmountPerTrade)',
  'function unfollowAgent(uint256 tokenId)',
  'function getUserFollowedAgents(address user) view returns (uint256[])',
] as const;

export const PREDICTION_MARKET_ABI = [
  'function getMarket(uint256 marketId) view returns (tuple(uint256 id, string question, uint256 endTime, uint256 resolutionTime, uint8 status, uint8 outcome, uint256 yesTokens, uint256 noTokens, uint256 liquidity, uint256 totalVolume, address creator, uint256 battleId, uint256 warrior1Id, uint256 warrior2Id, uint256 createdAt))',
  'function getPrice(uint256 marketId) view returns (uint256 yesPrice, uint256 noPrice)',
  'function buy(uint256 marketId, bool isYes, uint256 collateralAmount, uint256 minSharesOut) returns (uint256 sharesOut)',
  'function nextMarketId() view returns (uint256)',
  'function executeCopyTrade(uint256 agentId, uint256 marketId, bool isYes, uint256 collateralAmount) returns (uint256)',
] as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the base URL for internal API calls
 */
export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
}

/**
 * Get server private key (only available server-side)
 */
export function getServerPrivateKey(): string | undefined {
  return process.env.PRIVATE_KEY;
}

/**
 * Get AI signer private key (only available server-side)
 */
export function getAISignerPrivateKey(): string | undefined {
  return process.env.AI_SIGNER_PRIVATE_KEY;
}

// ============================================================================
// Type exports
// ============================================================================

export type AvalancheContract = keyof typeof AVALANCHE_CONTRACTS;
