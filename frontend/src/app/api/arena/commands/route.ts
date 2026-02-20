import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Helper to format DB state into the shape the frontend expects
function formatState(state: {
  id: string;
  gameState: string;
  phase: string;
  timeRemaining: number;
  totalTime: number;
  lastUpdate: Date;
  currentRound: number;
  totalRounds: number;
  warriors1Id: number | null;
  warriors2Id: number | null;
  automationEnabled: boolean;
  type: string;
}) {
  return {
    battleId: state.id,
    gameState: state.gameState,
    phase: state.phase,
    timeRemaining: state.timeRemaining,
    totalTime: state.totalTime,
    lastUpdate: state.lastUpdate.getTime(),
    currentRound: state.currentRound,
    totalRounds: state.totalRounds,
    warriors1Id: state.warriors1Id,
    warriors2Id: state.warriors2Id,
    automationEnabled: state.automationEnabled,
    type: state.type,
  };
}

// GET /api/arena/commands?battleId=xxx
// Replaces arena-backend GET endpoint with timestamp-based timer calculation
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const battleId = searchParams.get('battleId');

  if (!battleId) {
    return NextResponse.json({ error: 'Battle ID is required' }, { status: 400 });
  }

  try {
    const state = await prisma.arenaGameState.findUnique({
      where: { id: battleId },
    });

    if (!state) {
      return NextResponse.json({ hasCommand: false, gameState: null });
    }

    // Calculate time remaining based on timestamps (replaces setInterval countdown)
    const elapsed = Math.floor((Date.now() - state.lastUpdate.getTime()) / 1000);
    const timeRemaining = Math.max(0, state.totalTime - elapsed);

    // Check if timer expired and state transition is needed
    if (timeRemaining <= 0 && state.gameState === 'playing') {
      if (state.phase === 'startGame') {
        // 70 seconds expired -> send startGame command
        const updated = await prisma.arenaGameState.update({
          where: { id: battleId, phase: 'startGame' }, // optimistic lock
          data: {
            phase: 'battle',
            currentRound: 1,
            totalTime: 60,
            timeRemaining: 60,
            lastUpdate: new Date(),
            pendingAction: null,
          },
        });

        return NextResponse.json({
          hasCommand: true,
          command: {
            action: 'startGame',
            timestamp: Date.now(),
            battleId,
            requiresVerification: true,
          },
          gameState: { ...formatState(updated), timeRemaining: 60 },
        });
      } else if (state.phase === 'battle' && state.currentRound <= 5) {
        // 60 seconds expired -> send nextRound command
        const roundToSend = state.currentRound;
        const nextRound = state.currentRound + 1;
        const isFinished = nextRound > 5;

        const updated = await prisma.arenaGameState.update({
          where: { id: battleId, phase: 'battle', currentRound: state.currentRound }, // optimistic lock
          data: {
            currentRound: nextRound,
            totalTime: isFinished ? 0 : 60,
            timeRemaining: isFinished ? 0 : 60,
            lastUpdate: new Date(),
            gameState: isFinished ? 'finished' : 'playing',
            pendingAction: null,
          },
        });

        return NextResponse.json({
          hasCommand: true,
          command: {
            action: 'nextRound',
            timestamp: Date.now(),
            battleId,
            round: roundToSend,
          },
          gameState: { ...formatState(updated), timeRemaining: isFinished ? 0 : 60 },
        });
      }
    }

    // Check for pending action that hasn't been consumed
    if (state.pendingAction) {
      const command = {
        action: state.pendingAction,
        timestamp: state.pendingActionAt?.getTime() || Date.now(),
        battleId,
        round: state.pendingRound || undefined,
      };

      await prisma.arenaGameState.update({
        where: { id: battleId },
        data: { pendingAction: null, pendingActionAt: null, pendingRound: null },
      });

      return NextResponse.json({
        hasCommand: true,
        command,
        gameState: { ...formatState(state), timeRemaining },
      });
    }

    // No command pending, return current state
    return NextResponse.json({
      hasCommand: false,
      gameState: { ...formatState(state), timeRemaining },
    });
  } catch (error) {
    console.error('Command automation error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/arena/commands?battleId=xxx
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const battleId = searchParams.get('battleId');

  if (!battleId) {
    return NextResponse.json({ error: 'Battle ID is required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { action, warriors1Id, warriors2Id } = body;

    switch (action) {
      case 'initialize': {
        const newState = await prisma.arenaGameState.upsert({
          where: { id: battleId },
          create: {
            id: battleId,
            gameState: 'playing',
            phase: 'startGame',
            timeRemaining: 70,
            totalTime: 70,
            lastUpdate: new Date(),
            currentRound: 0,
            totalRounds: 5,
            warriors1Id,
            warriors2Id,
            automationEnabled: true,
            type: 'command-based',
          },
          update: {
            gameState: 'playing',
            phase: 'startGame',
            timeRemaining: 70,
            totalTime: 70,
            lastUpdate: new Date(),
            currentRound: 0,
            warriors1Id,
            warriors2Id,
            automationEnabled: true,
          },
        });

        return NextResponse.json({
          ...formatState(newState),
          message: 'Command-based automation initialized',
          arenaAddress: battleId,
          contractAddress: battleId,
        });
      }

      case 'cleanup': {
        await prisma.arenaGameState.deleteMany({ where: { id: battleId } });
        return NextResponse.json({ message: 'Command automation cleaned up' });
      }

      case 'resume': {
        const existing = await prisma.arenaGameState.findUnique({ where: { id: battleId } });
        if (!existing) {
          return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
        }
        await prisma.arenaGameState.update({
          where: { id: battleId },
          data: { gameState: 'playing', lastUpdate: new Date() },
        });
        return NextResponse.json({ message: 'Command automation resumed' });
      }

      case 'reset': {
        const current = await prisma.arenaGameState.findUnique({ where: { id: battleId } });
        if (!current) {
          return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
        }
        const updated = await prisma.arenaGameState.update({
          where: { id: battleId },
          data: {
            automationEnabled: false,
            gameState: 'stopped',
            phase: 'startGame',
            currentRound: 0,
            timeRemaining: 0,
            totalTime: 70,
            lastUpdate: new Date(),
            pendingAction: null,
          },
        });
        return NextResponse.json({
          message: 'Automation stopped due to failed startGame verification',
          gameState: formatState(updated),
          automationStopped: true,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use "initialize", "cleanup", "resume", or "reset"' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Command automation error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
