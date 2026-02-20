import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/arena/status?battleId=xxx
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
      return NextResponse.json({ gameState: null });
    }

    // Calculate live timeRemaining from timestamps
    const elapsed = Math.floor((Date.now() - state.lastUpdate.getTime()) / 1000);
    const timeRemaining = Math.max(0, state.totalTime - elapsed);

    return NextResponse.json({
      gameState: {
        battleId: state.id,
        gameState: state.gameState,
        phase: state.phase,
        timeRemaining,
        totalTime: state.totalTime,
        lastUpdate: state.lastUpdate.getTime(),
        currentRound: state.currentRound,
        totalRounds: state.totalRounds,
        warriors1Id: state.warriors1Id,
        warriors2Id: state.warriors2Id,
        automationEnabled: state.automationEnabled,
        type: state.type,
      },
    });
  } catch (error) {
    console.error('Status API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
