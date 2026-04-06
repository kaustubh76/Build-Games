import { NextRequest, NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http } from 'viem';
import { avalancheFuji, avalanche } from 'viem/chains';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { getAvalancheRpcUrl, getAvalancheFallbackRpcUrl, getChainId } from '@/constants';

const RPC_TIMEOUT = 30000; // 30 seconds

// Select chain based on NEXT_PUBLIC_CHAIN_ID (43114 = mainnet, else Fuji)
function getChain() {
  return getChainId() === 43114 ? avalanche : avalancheFuji;
}

// Create Avalanche public client
function createAvalanchePublicClient() {
  return createPublicClient({
    chain: getChain(),
    transport: http(getAvalancheRpcUrl(), { timeout: RPC_TIMEOUT }),
  });
}

// Create Avalanche fallback client
function createAvalancheFallbackClient() {
  return createPublicClient({
    chain: getChain(),
    transport: http(getAvalancheFallbackRpcUrl(), { timeout: RPC_TIMEOUT }),
  });
}

// Create Avalanche wallet client
function createAvalancheWalletClient(account: ReturnType<typeof privateKeyToAccount>) {
  return createWalletClient({
    chain: getChain(),
    transport: http(getAvalancheRpcUrl(), { timeout: RPC_TIMEOUT }),
    account,
  });
}

// Execute with Avalanche fallback
async function executeWithAvalancheFallback<T>(
  fn: (client: ReturnType<typeof createAvalanchePublicClient>) => Promise<T>
): Promise<T> {
  try {
    return await fn(createAvalanchePublicClient());
  } catch (error) {
    console.warn('[Avalanche] Primary RPC failed, trying fallback...');
    return await fn(createAvalancheFallbackClient());
  }
}

// Import the contract ABI and helpers
import { ArenaAbi, getApiBaseUrl } from '../../../constants';
import { warriorsNFTService, type WarriorsDetails } from '../../../services/warriorsNFTService';
import { withRetry, RetryPresets } from '@/lib/api/retry';

// Personality adjective pools for fallback
const ADJECTIVE_POOLS = [
  ['brave', 'fierce', 'strategic'],
  ['cunning', 'agile', 'tactical'],
  ['wise', 'patient', 'resilient'],
  ['bold', 'relentless', 'creative'],
  ['stoic', 'adaptable', 'fearless'],
];

/**
 * Generate deterministic-but-varied fallback traits from an NFT ID.
 * Different IDs produce different stats; same ID always produces the same result.
 */
function generateSeededTraits(nftId: bigint) {
  const seed = Number(nftId % BigInt(10000));

  // Seeded pseudo-random: deterministic per (seed + offset)
  const seededValue = (offset: number) => {
    const x = Math.sin(seed + offset) * 10000;
    return Math.floor((x - Math.floor(x)) * 4000) + 5000; // Range: 5000-9000
  };

  return {
    personality: {
      adjectives: ADJECTIVE_POOLS[seed % ADJECTIVE_POOLS.length],
      knowledge_areas: ['combat', 'strategy', 'warfare'],
    },
    traits: {
      Strength: seededValue(1),
      Wit: seededValue(2),
      Charisma: seededValue(3),
      Defence: seededValue(4),
      Luck: seededValue(5),
    },
  };
}

/**
 * Fetch warrior NFT data with retry and seeded fallback
 */
async function getWarriorBattleData(
  nftId: bigint
): Promise<{ personality: { adjectives: string[]; knowledge_areas: string[] }; traits: Record<string, number> }> {
  const defaults = generateSeededTraits(nftId);

  try {
    const details = await withRetry(
      () => warriorsNFTService.getWarriorsDetails(Number(nftId)),
      { ...RetryPresets.fast, maxRetries: 1 }
    );

    // Parse adjectives and knowledge_areas from comma-separated strings
    const adjectives = details.adjectives
      ? details.adjectives.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
      : defaults.personality.adjectives;

    const knowledge_areas = details.knowledge_areas
      ? details.knowledge_areas.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
      : defaults.personality.knowledge_areas;

    // Scale traits back to contract format (traits come as 0-100, contract uses 0-10000)
    const traits = {
      Strength: Math.round(details.traits.strength * 100),
      Wit: Math.round(details.traits.wit * 100),
      Charisma: Math.round(details.traits.charisma * 100),
      Defence: Math.round(details.traits.defence * 100),
      Luck: Math.round(details.traits.luck * 100)
    };

    console.log(`Game Master: Fetched NFT #${nftId} data - ${details.name}`);

    return {
      personality: {
        adjectives: adjectives.length > 0 ? adjectives : defaults.personality.adjectives,
        knowledge_areas: knowledge_areas.length > 0 ? knowledge_areas : defaults.personality.knowledge_areas
      },
      traits
    };
  } catch (error) {
    console.warn(`Game Master: Failed to fetch NFT #${nftId} data, using seeded fallback:`, error);
    return defaults;
  }
}

// Lazy initialization of clients - only created when needed at runtime
// This prevents build-time errors when env vars are not set
let _gameMasterAccount: ReturnType<typeof privateKeyToAccount> | null = null;
let _walletClient: ReturnType<typeof createAvalancheWalletClient> | null = null;
let _publicClient: ReturnType<typeof createAvalanchePublicClient> | null = null;
let _fallbackClient: ReturnType<typeof createAvalancheFallbackClient> | null = null;

function getGameMasterAccount() {
  if (!_gameMasterAccount) {
    // Server-side only - private keys should never have NEXT_PUBLIC_ prefix
    const privateKey = process.env.GAME_MASTER_PRIVATE_KEY?.trim();
    if (!privateKey) {
      throw new Error('GAME_MASTER_PRIVATE_KEY not found in environment variables. This is a server-side only variable.');
    }
    const hex = privateKey.replace(/^0x/i, '').padStart(64, '0');
    _gameMasterAccount = privateKeyToAccount(`0x${hex}` as `0x${string}`);
  }
  return _gameMasterAccount;
}

function getWalletClient() {
  if (!_walletClient) {
    _walletClient = createAvalancheWalletClient(getGameMasterAccount());
  }
  return _walletClient;
}

function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createAvalanchePublicClient();
  }
  return _publicClient;
}

function getFallbackClient() {
  if (!_fallbackClient) {
    _fallbackClient = createAvalancheFallbackClient();
  }
  return _fallbackClient;
}

// Helper to check if error is timeout
function isTimeoutError(error: unknown): boolean {
  const errMsg = (error as Error).message || '';
  return errMsg.includes('timeout') ||
         errMsg.includes('timed out') ||
         errMsg.includes('took too long') ||
         errMsg.includes('TimeoutError');
}

// Wait for receipt with fallback
async function waitForReceiptWithFallback(hash: `0x${string}`) {
  const primaryClient = getPublicClient();
  const fallbackClient = getFallbackClient();
  try {
    return await primaryClient.waitForTransactionReceipt({ hash, timeout: RPC_TIMEOUT });
  } catch (error) {
    if (isTimeoutError(error)) {
      console.warn('[Game Master] Primary RPC timed out waiting for receipt, trying fallback...');
      return await fallbackClient.waitForTransactionReceipt({ hash, timeout: RPC_TIMEOUT });
    }
    throw error;
  }
}

interface ArenaState {
  address: string;
  isInitialized: boolean;
  currentRound: number;
  isBettingPeriod: boolean;
  gameInitializedAt: number;
  lastRoundEndedAt: number;
  minBettingPeriod: number;
  minBattleRoundsInterval: number;
  playerOneBetAddresses: string[];
  playerTwoBetAddresses: string[];
}

async function getArenaState(arenaAddress: string): Promise<ArenaState | null> {
  try {
    const [
      isInitialized,
      currentRound,
      isBettingPeriod,
      gameInitializedAt,
      lastRoundEndedAt,
      minBettingPeriod,
      minBattleRoundsInterval,
      playerOneBetAddresses,
      playerTwoBetAddresses
    ] = await Promise.all([
      executeWithAvalancheFallback((client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getInitializationStatus',
      })),
      executeWithAvalancheFallback((client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getCurrentRound',
      })),
      executeWithAvalancheFallback((client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getIsBettingPeriodGoingOn',
      })),
      executeWithAvalancheFallback((client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getGameInitializedAt',
      })),
      executeWithAvalancheFallback((client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getLastRoundEndedAt',
      })),
      executeWithAvalancheFallback((client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getMinWarriorsBettingPeriod',
      })),
      executeWithAvalancheFallback((client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getMinBattleRoundsInterval',
      })),
      executeWithAvalancheFallback((client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getPlayerOneBetAddresses',
      })),
      executeWithAvalancheFallback((client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getPlayerTwoBetAddresses',
      }))
    ]);

    return {
      address: arenaAddress,
      isInitialized: Boolean(isInitialized),
      currentRound: Number(currentRound),
      isBettingPeriod: Boolean(isBettingPeriod),
      gameInitializedAt: Number(gameInitializedAt),
      lastRoundEndedAt: Number(lastRoundEndedAt),
      minBettingPeriod: Number(minBettingPeriod),
      minBattleRoundsInterval: Number(minBattleRoundsInterval),
      playerOneBetAddresses: playerOneBetAddresses as string[],
      playerTwoBetAddresses: playerTwoBetAddresses as string[]
    };
  } catch (error) {
    console.error(`Failed to get arena state for ${arenaAddress}:`, error);
    return null;
  }
}

async function startGame(arenaAddress: string): Promise<boolean> {
  try {
    console.log(`Game Master: Starting game for arena ${arenaAddress}`);
    
    const hash = await getWalletClient().writeContract({
      address: arenaAddress as `0x${string}`,
      abi: ArenaAbi,
      functionName: 'startGame',
      chain: getChain(),
    });

    console.log(`Game Master: Start game transaction sent: ${hash}`);

    // Wait for transaction confirmation
    const receipt = await waitForReceiptWithFallback(hash);

    console.log(`Game Master: Game started successfully for arena ${arenaAddress}`);
    return receipt.status === 'success';
  } catch (error) {
    console.error(`Game Master: Failed to start game for arena ${arenaAddress}:`, error);
    return false;
  }
}

async function generateAIMoves(arenaAddress: string): Promise<{ moves: { agent_1: { move: string }, agent_2: { move: string } } } | { error: string }> {
  try {
    // Get current battle data from contract
    const [currentRound, damageOnWarriorsOne, damageOnWarriorsTwo, warriorsOneNFTId, warriorsTwoNFTId] = await Promise.all([
      executeWithAvalancheFallback((client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getCurrentRound',
      })),
      executeWithAvalancheFallback((client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getDamageOnWarriorsOne',
      })),
      executeWithAvalancheFallback((client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getDamageOnWarriorsTwo',
      })),
      executeWithAvalancheFallback((client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getWarriorsOneNFTId',
      })),
      executeWithAvalancheFallback((client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getWarriorsTwoNFTId',
      }))
    ]);

    // Fetch actual NFT metadata for both warriors in parallel
    console.log(`Game Master: Fetching NFT data for warriors #${warriorsOneNFTId} and #${warriorsTwoNFTId}`);
    const [warrior1Data, warrior2Data] = await Promise.all([
      getWarriorBattleData(warriorsOneNFTId as bigint),
      getWarriorBattleData(warriorsTwoNFTId as bigint)
    ]);

    const battlePrompt = {
      current_round: Number(currentRound),
      agent_1: {
        personality: warrior1Data.personality,
        traits: warrior1Data.traits,
        total_damage_received: Number(damageOnWarriorsOne)
      },
      agent_2: {
        personality: warrior2Data.personality,
        traits: warrior2Data.traits,
        total_damage_received: Number(damageOnWarriorsTwo)
      },
      moveset: [
        "strike",
        "taunt",
        "dodge",
        "recover",
        "special_move"
      ]
    };

    // Call AI for move selection
    console.log('Game Master: Calling AI for move selection...');
    const response = await fetch(`${getApiBaseUrl()}/api/generate-battle-moves`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        battlePrompt: battlePrompt
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Game Master: AI API Error:', errorText);
      return { error: `AI API HTTP error (${response.status}): ${errorText.slice(0, 200)}` };
    }

    const data = await response.json();
    if (!data.success) {
      console.error('Game Master: AI API Error:', data.error);
      return { error: `AI API returned failure: ${data.error}` };
    }

    console.log('Game Master: AI Response:', data.response);

    // Parse the AI response to extract moves
    try {
      const aiResponse = JSON.parse(data.response);
      
      // Handle multiple possible AI response formats
      let agent1Move: string | undefined;
      let agent2Move: string | undefined;
      
      if (aiResponse.agent_1?.move && aiResponse.agent_2?.move) {
        agent1Move = aiResponse.agent_1.move;
        agent2Move = aiResponse.agent_2.move;
      } else if (aiResponse.agent_1_move && aiResponse.agent_2_move) {
        agent1Move = aiResponse.agent_1_move;
        agent2Move = aiResponse.agent_2_move;
      } else if (aiResponse.moves?.agent_1 && aiResponse.moves?.agent_2) {
        agent1Move = aiResponse.moves.agent_1;
        agent2Move = aiResponse.moves.agent_2;
      } else if (typeof aiResponse.agent_1 === 'string' && typeof aiResponse.agent_2 === 'string') {
        agent1Move = aiResponse.agent_1;
        agent2Move = aiResponse.agent_2;
      } else if (aiResponse['agent_1.Move'] && aiResponse['agent_2.Move']) {
        agent1Move = aiResponse['agent_1.Move'];
        agent2Move = aiResponse['agent_2.Move'];
      } else if (aiResponse.agent_moves && aiResponse.agent_moves.agent_1 && aiResponse.agent_moves.agent_2) {
        agent1Move = aiResponse.agent_moves.agent_1;
        agent2Move = aiResponse.agent_moves.agent_2;
      }
      
      if (agent1Move && agent2Move) {
        return {
          moves: {
            agent_1: { move: agent1Move },
            agent_2: { move: agent2Move }
          }
        };
      } else {
        console.error('Game Master: Invalid AI response format');
        return { error: 'Invalid AI response format — could not extract agent moves' };
      }
    } catch (parseError) {
      console.error('Game Master: Failed to parse AI response:', parseError);
      return { error: `Failed to parse AI JSON response: ${(parseError as Error).message}` };
    }
  } catch (error) {
    console.error('Game Master: Failed to generate AI moves:', error);
    return { error: `Failed to generate AI moves: ${(error as Error).message}` };
  }
}

async function executeNextRound(arenaAddress: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Game Master: Executing next round for arena ${arenaAddress}`);

    // Generate AI moves
    const result = await generateAIMoves(arenaAddress);
    if ('error' in result) {
      console.error('Game Master: Failed to generate AI moves:', result.error);
      return { success: false, error: result.error };
    }
    const moves = result.moves;

    console.log(`Game Master: AI selected moves - Agent 1: ${moves.agent_1.move}, Agent 2: ${moves.agent_2.move}`);

    // Map move names to contract enum values (handles AI response variations)
    const moveMapping: { [key: string]: number } = {
      'strike': 0,
      'taunt': 1,
      'dodge': 2,
      'special_move': 3,
      'special': 3,
      'specialmove': 3,
      'special move': 3,
      'recover': 4,
      'recovery': 4,
    };

    const normalizeMove = (raw: string, label: string): number => {
      const key = raw.toLowerCase().trim();
      const value = moveMapping[key];
      if (value === undefined) {
        console.warn(`[GameMaster] Unknown move from AI: "${raw}" (${label}), defaulting to strike(0)`);
        return 0;
      }
      return value;
    };

    const warriorsOneMove = normalizeMove(moves.agent_1.move, 'agent_1');
    const warriorsTwoMove = normalizeMove(moves.agent_2.move, 'agent_2');

    // Create signature for the battle moves.
    // Contract flow (Arena.sol):
    //   dataHash = keccak256(abi.encodePacked(move1, move2))
    //   ethSignedMessage = MessageHashUtils.toEthSignedMessageHash(dataHash)
    //   recovered = ECDSA.recover(ethSignedMessage, signature)
    //
    // viem's signMessage({ message: { raw: dataHash } }) internally applies the
    // same EIP-191 prefix ("\x19Ethereum Signed Message:\n32") before signing.
    // So we pass the RAW dataHash — NOT the prefixed hash.

    const { encodePacked, keccak256 } = await import('viem');

    const encodedMoves = encodePacked(['uint8', 'uint8'], [warriorsOneMove, warriorsTwoMove]);
    const dataHash = keccak256(encodedMoves);

    const signature = await getGameMasterAccount().signMessage({
      message: { raw: dataHash }
    });

    console.log(`Game Master: Executing battle with moves ${warriorsOneMove} vs ${warriorsTwoMove}`);

    const hash = await getWalletClient().writeContract({
      address: arenaAddress as `0x${string}`,
      abi: ArenaAbi,
      functionName: 'battle',
      args: [warriorsOneMove, warriorsTwoMove, signature as `0x${string}`],
      chain: getChain(),
    });

    console.log(`Game Master: Battle transaction sent: ${hash}`);

    // Wait for transaction confirmation
    const receipt = await waitForReceiptWithFallback(hash);

    console.log(`Game Master: Next round executed successfully for arena ${arenaAddress}`);
    return { success: receipt.status === 'success' };
  } catch (error) {
    console.error(`Game Master: Failed to execute next round for arena ${arenaAddress}:`, error);
    return { success: false, error: `Round execution failed: ${(error as Error).message}` };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'game-master',
      maxRequests: 20,
      windowMs: 60000,
    });

    const body = await request.json();
    const { action, arenaAddresses } = body;

    if (!action || !arenaAddresses || !Array.isArray(arenaAddresses)) {
      throw ErrorResponses.badRequest('Missing action or arenaAddresses array');
    }

    const results: { [key: string]: any } = {};

    // Batch arena state reads in parallel (5 at a time) for efficiency
    const BATCH_SIZE = 5;
    const arenaStates = new Map<string, ArenaState | null>();

    for (let i = 0; i < arenaAddresses.length; i += BATCH_SIZE) {
      const batch = arenaAddresses.slice(i, i + BATCH_SIZE);
      const stateResults = await Promise.allSettled(
        batch.map((addr: string) => getArenaState(addr))
      );
      for (let j = 0; j < batch.length; j++) {
        const result = stateResults[j];
        arenaStates.set(batch[j], result.status === 'fulfilled' ? result.value : null);
      }
    }

    // Process arenas sequentially (avoid nonce conflicts on game master wallet)
    for (const arenaAddress of arenaAddresses) {
      console.log(`Game Master: Processing ${action} for arena ${arenaAddress}`);

      const arenaState = arenaStates.get(arenaAddress) ?? null;
      if (!arenaState) {
        results[arenaAddress] = { success: false, error: 'Failed to get arena state' };
        continue;
      }

      const currentTime = Math.floor(Date.now() / 1000);

      if (action === 'checkAndStartGames') {
        // Check if betting period is over and there are bets on both sides
        const bettingEndTime = arenaState.gameInitializedAt + arenaState.minBettingPeriod;
        const shouldStartGame = arenaState.isInitialized && 
                               arenaState.isBettingPeriod && 
                               currentTime >= bettingEndTime &&
                               arenaState.playerOneBetAddresses.length > 0 &&
                               arenaState.playerTwoBetAddresses.length > 0;

        if (shouldStartGame) {
          console.log(`Game Master: Starting game for arena ${arenaAddress} - betting period ended`);
          const success = await startGame(arenaAddress);
          results[arenaAddress] = { success, action: 'started', bettingEndTime, currentTime };
        } else {
          results[arenaAddress] = { 
            success: true, 
            action: 'no_action_needed',
            reason: !arenaState.isInitialized ? 'not_initialized' :
                   !arenaState.isBettingPeriod ? 'not_in_betting_period' :
                   currentTime < bettingEndTime ? 'betting_period_ongoing' :
                   arenaState.playerOneBetAddresses.length === 0 ? 'no_bets_warriors_one' :
                   arenaState.playerTwoBetAddresses.length === 0 ? 'no_bets_warriors_two' : 'unknown',
            bettingEndTime,
            currentTime
          };
        }
      } else if (action === 'checkAndExecuteRounds') {
        // Check if it's time for next round
        const roundEndTime = arenaState.lastRoundEndedAt + arenaState.minBattleRoundsInterval;
        const shouldExecuteRound = arenaState.isInitialized && 
                                  !arenaState.isBettingPeriod &&
                                  arenaState.currentRound > 0 && 
                                  arenaState.currentRound < 6 && // Game has max 5 rounds
                                  currentTime >= roundEndTime;

        if (shouldExecuteRound) {
          console.log(`Game Master: Executing next round for arena ${arenaAddress} - round interval passed`);
          const roundResult = await executeNextRound(arenaAddress);
          results[arenaAddress] = { success: roundResult.success, action: 'executed_round', error: roundResult.error, roundEndTime, currentTime, round: arenaState.currentRound };
        } else {
          results[arenaAddress] = { 
            success: true, 
            action: 'no_action_needed',
            reason: !arenaState.isInitialized ? 'not_initialized' :
                   arenaState.isBettingPeriod ? 'in_betting_period' :
                   arenaState.currentRound === 0 ? 'game_not_started' :
                   arenaState.currentRound >= 6 ? 'game_finished' :
                   currentTime < roundEndTime ? 'round_interval_ongoing' : 'unknown',
            roundEndTime,
            currentTime,
            round: arenaState.currentRound
          };
        }
      } else {
        results[arenaAddress] = { success: false, error: 'Invalid action' };
      }
    }

    return NextResponse.json({ success: true, results });

  } catch (error) {
    return handleAPIError(error, 'API:GameMaster:POST');
  }
}
