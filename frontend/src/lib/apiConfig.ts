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
// Contract Addresses - Avalanche Fuji Testnet (43113)
// ============================================================================

export const AVALANCHE_CONTRACTS = {
  crownToken: process.env.NEXT_PUBLIC_CROWN_TOKEN || '0xF0011ca65e3F6314B180a8848ae373042bAEc9b4',
  predictionMarketAMM: process.env.NEXT_PUBLIC_PREDICTION_MARKET || '0xeBe1DB030bBFC5bCdD38593C69e4899887D2e487',
  aiAgentRegistry: process.env.NEXT_PUBLIC_AI_AGENT_REGISTRY || '0x5e0Df8750114ecBC0850494fb1a2b9001b61254e',
  aiDebateOracle: process.env.NEXT_PUBLIC_AI_DEBATE_ORACLE || '0x7C8484a8082b9E922b594D0Be2f82b4425B65E05',
  outcomeToken: process.env.NEXT_PUBLIC_OUTCOME_TOKEN || '0x578F5D284F1Ac91115293cC36eD2DF487550C1da',
  creatorRevenueShare: process.env.NEXT_PUBLIC_CREATOR_REVENUE || '0x05Ca49f32B482e0Dce58e39A22F31e5f56A43Ee7',
  warriorsNFT: process.env.NEXT_PUBLIC_WARRIORS_NFT || '0x6135D8ad56A326Ab0D6D12E5871cCD0b2b80da08',
  arenaFactory: process.env.NEXT_PUBLIC_ARENA_FACTORY || '0x6634fa404876E991269D8152Fea0291CCCFB4008',
  externalMarketMirror: process.env.NEXT_PUBLIC_EXTERNAL_MARKET_MIRROR || '0x1cfa9eD162f90B1eD6d9A01c504fFc28B7412473',
  aiAgentINFT: process.env.NEXT_PUBLIC_AI_AGENT_INFT || '0xbAE259eeA7fd49F631dE44Ac8d4fd2eb6C7F8Cb8',
  agentINFTOracle: process.env.NEXT_PUBLIC_AGENT_INFT_ORACLE || '0xf986215373Bc8E5A1a698Be72270c0e1FC4716e3',
} as const;

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
