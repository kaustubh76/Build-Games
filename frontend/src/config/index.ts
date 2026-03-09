/**
 * Centralized configuration for WarriorsAI-rena
 * All environment-dependent values should be configured here
 */

// API URLs - configured via environment variables for different deployments
export const config = {
  // Storage downloads are handled by /api/storage/download/[hash] (0G Storage + IPFS fallback)
  storageDownloadBaseUrl: '/api/storage/download',

  // Base URL for this frontend application
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'),

  // Blockchain RPC URLs - Avalanche
  avalancheTestnetRpc: process.env.NEXT_PUBLIC_AVALANCHE_TESTNET_RPC || 'https://api.avax-test.network/ext/bc/C/rpc',
  avalancheMainnetRpc: process.env.NEXT_PUBLIC_AVALANCHE_MAINNET_RPC || 'https://api.avax.network/ext/bc/C/rpc',

  // Chain IDs - Avalanche
  chainIds: {
    avalancheTestnet: 43113,
    avalancheMainnet: 43114,
  },

  // WalletConnect Project ID
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || '',

  // Game Master (server-side only - NEVER expose to client)
  // All signing operations must go through API routes (/api/game-master, /api/generate-battle-moves)
  // This value will only be available in server-side code (API routes, Server Components)
  gameMasterPrivateKey: process.env.GAME_MASTER_PRIVATE_KEY || '',

  // AI Signer Private Key (server-side only)
  aiSignerPrivateKey: process.env.AI_SIGNER_PRIVATE_KEY || '',
} as const;

// Helper functions for building URLs
export const getStorageDownloadUrl = (rootHash: string): string => {
  return `${config.storageDownloadBaseUrl}/${rootHash}`;
};

export const getArenaCommandsUrl = (battleId: string): string => {
  return `/api/arena/commands?battleId=${battleId}`;
};

export const getArenaStatusUrl = (battleId: string): string => {
  return `/api/arena/status?battleId=${battleId}`;
};

// Check if we're in production
export const isProduction = process.env.NODE_ENV === 'production';

// Storage is always available via /api/storage/download (0G or IPFS)
export const isStorageConfigured = (): boolean => true;

// Validate required environment variables
export const validateConfig = (): { valid: boolean; missing: string[] } => {
  const missing: string[] = [];

  if (!config.walletConnectProjectId) {
    missing.push('NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID');
  }

  return {
    valid: missing.length === 0,
    missing,
  };
};

export default config;
