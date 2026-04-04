import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { ArenaAbi, getAvalancheRpcUrl, getAvalancheFallbackRpcUrl } from '@/constants';

const RPC_TIMEOUT = 15000;

function createClient() {
  return createPublicClient({
    chain: avalancheFuji,
    transport: http(getAvalancheRpcUrl(), { timeout: RPC_TIMEOUT }),
  });
}

function createFallbackClient() {
  return createPublicClient({
    chain: avalancheFuji,
    transport: http(getAvalancheFallbackRpcUrl(), { timeout: RPC_TIMEOUT }),
  });
}

async function readContract<T>(fn: (client: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
  try {
    return await fn(createClient());
  } catch {
    return await fn(createFallbackClient());
  }
}

// GET /api/arena/status?battleId=<arenaAddress>
// Reads game state directly from the on-chain Arena contract
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const battleId = searchParams.get('battleId');

  if (!battleId) {
    return NextResponse.json({ error: 'Battle ID (arena address) is required' }, { status: 400 });
  }

  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(battleId)) {
    return NextResponse.json({ gameState: null });
  }

  try {
    const arenaAddress = battleId as `0x${string}`;

    const [
      isInitialized,
      currentRound,
      isBettingPeriod,
      gameInitializedAt,
      lastRoundEndedAt,
      minBettingPeriod,
      minBattleRoundsInterval,
      warriorsOneNFTId,
      warriorsTwoNFTId,
      damageOnOne,
      damageOnTwo,
    ] = await Promise.all([
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getInitializationStatus' })),
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getCurrentRound' })),
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getIsBettingPeriodGoingOn' })),
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getGameInitializedAt' })),
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getLastRoundEndedAt' })),
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getMinWarriorsBettingPeriod' })),
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getMinBattleRoundsInterval' })),
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getWarriorsOneNFTId' })),
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getWarriorsTwoNFTId' })),
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getDamageOnWarriorsOne' })),
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getDamageOnWarriorsTwo' })),
    ]);

    const round = Number(currentRound);
    const initialized = Boolean(isInitialized);
    const betting = Boolean(isBettingPeriod);
    const initAt = Number(gameInitializedAt);
    const lastRoundAt = Number(lastRoundEndedAt);
    const bettingDuration = Number(minBettingPeriod);
    const roundInterval = Number(minBattleRoundsInterval);
    const nowSec = Math.floor(Date.now() / 1000);

    // Compute game phase and time remaining
    let gameState: 'idle' | 'playing' | 'finished' = 'idle';
    let phase: 'startGame' | 'battle' = 'startGame';
    let timeRemaining = 0;
    let totalTime = 0;

    if (!initialized) {
      gameState = 'idle';
    } else if (round > 5) {
      gameState = 'finished';
    } else if (betting) {
      gameState = 'playing';
      phase = 'startGame';
      totalTime = bettingDuration;
      const elapsed = nowSec - initAt;
      timeRemaining = Math.max(0, bettingDuration - elapsed);
    } else if (round > 0) {
      gameState = 'playing';
      phase = 'battle';
      totalTime = roundInterval;
      const elapsed = nowSec - lastRoundAt;
      timeRemaining = Math.max(0, roundInterval - elapsed);
    } else {
      // Initialized but round 0 and not betting — game about to start
      gameState = 'playing';
      phase = 'startGame';
      totalTime = bettingDuration;
      const elapsed = nowSec - initAt;
      timeRemaining = Math.max(0, bettingDuration - elapsed);
    }

    return NextResponse.json({
      gameState: {
        battleId,
        gameState,
        phase,
        timeRemaining,
        totalTime,
        lastUpdate: Date.now(),
        currentRound: round,
        totalRounds: 5,
        warriors1Id: Number(warriorsOneNFTId),
        warriors2Id: Number(warriorsTwoNFTId),
        damageOnWarriors1: Number(damageOnOne),
        damageOnWarriors2: Number(damageOnTwo),
        automationEnabled: true,
        type: 'on-chain',
      },
    });
  } catch (error) {
    console.error('Arena status chain read error:', error);
    // Return null gameState on contract read failure (e.g., invalid arena address)
    return NextResponse.json({ gameState: null });
  }
}
