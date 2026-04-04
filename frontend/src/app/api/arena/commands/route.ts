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

// GET /api/arena/commands?battleId=<arenaAddress>
// Reads on-chain state and determines if a command should be issued
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const battleId = searchParams.get('battleId');

  if (!battleId) {
    return NextResponse.json({ error: 'Battle ID (arena address) is required' }, { status: 400 });
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(battleId)) {
    return NextResponse.json({ hasCommand: false, gameState: null });
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
    ] = await Promise.all([
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getInitializationStatus' })),
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getCurrentRound' })),
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getIsBettingPeriodGoingOn' })),
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getGameInitializedAt' })),
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getLastRoundEndedAt' })),
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getMinWarriorsBettingPeriod' })),
      readContract((c) => c.readContract({ address: arenaAddress, abi: ArenaAbi, functionName: 'getMinBattleRoundsInterval' })),
    ]);

    const round = Number(currentRound);
    const initialized = Boolean(isInitialized);
    const betting = Boolean(isBettingPeriod);
    const initAt = Number(gameInitializedAt);
    const lastRoundAt = Number(lastRoundEndedAt);
    const bettingDuration = Number(minBettingPeriod);
    const roundInterval = Number(minBattleRoundsInterval);
    const nowSec = Math.floor(Date.now() / 1000);

    if (!initialized) {
      return NextResponse.json({ hasCommand: false, gameState: null });
    }

    // Game finished
    if (round > 5) {
      return NextResponse.json({ hasCommand: false, gameState: { gameState: 'finished', currentRound: round } });
    }

    // Betting period active — check if it's expired (time to start game)
    if (betting) {
      const bettingTimeElapsed = nowSec - initAt;
      if (bettingTimeElapsed >= bettingDuration) {
        return NextResponse.json({
          hasCommand: true,
          command: {
            action: 'startGame',
            timestamp: Date.now(),
            battleId,
            requiresVerification: true,
          },
          gameState: {
            gameState: 'playing',
            phase: 'startGame',
            currentRound: round,
            timeRemaining: 0,
          },
        });
      }
      // Betting still active
      return NextResponse.json({
        hasCommand: false,
        gameState: {
          gameState: 'playing',
          phase: 'startGame',
          currentRound: round,
          timeRemaining: Math.max(0, bettingDuration - bettingTimeElapsed),
        },
      });
    }

    // Battle phase — check if round interval has elapsed (time for next round)
    if (round > 0 && round <= 5) {
      const roundTimeElapsed = nowSec - lastRoundAt;
      if (roundTimeElapsed >= roundInterval) {
        return NextResponse.json({
          hasCommand: true,
          command: {
            action: 'nextRound',
            timestamp: Date.now(),
            battleId,
            round,
          },
          gameState: {
            gameState: 'playing',
            phase: 'battle',
            currentRound: round,
            timeRemaining: 0,
          },
        });
      }
      // Waiting for round interval
      return NextResponse.json({
        hasCommand: false,
        gameState: {
          gameState: 'playing',
          phase: 'battle',
          currentRound: round,
          timeRemaining: Math.max(0, roundInterval - roundTimeElapsed),
        },
      });
    }

    // Default: no command
    return NextResponse.json({ hasCommand: false, gameState: null });
  } catch (error) {
    console.error('Command chain read error:', error);
    return NextResponse.json({ hasCommand: false, gameState: null });
  }
}

// POST /api/arena/commands?battleId=<arenaAddress>
// No-op — battle initialization and cleanup happen on-chain
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const battleId = searchParams.get('battleId');

  if (!battleId) {
    return NextResponse.json({ error: 'Battle ID is required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'initialize':
        // No-op: arena initialization happens on-chain via initializeGame()
        return NextResponse.json({
          message: 'Arena initialization is handled on-chain',
          battleId,
          type: 'on-chain',
        });

      case 'cleanup':
        // No-op: game cleanup happens on-chain via finishGame()
        return NextResponse.json({ message: 'Arena cleanup is handled on-chain' });

      case 'resume':
        return NextResponse.json({ message: 'Arena automation reads from chain — always active' });

      case 'reset':
        return NextResponse.json({ message: 'Arena reset is handled on-chain' });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use "initialize", "cleanup", "resume", or "reset"' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Command POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
