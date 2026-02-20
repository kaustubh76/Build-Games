import { NextRequest, NextResponse } from 'next/server';

// Try to import prisma, but gracefully handle if DB is not configured
let prisma: any = null;
try {
  prisma = require('@/lib/prisma').prisma;
} catch {
  // DB not available
}

// Helper to check if DB is available
async function getDb() {
  if (!prisma) return null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return prisma;
  } catch {
    return null;
  }
}

// GET /api/arena/status?battleId=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const battleId = searchParams.get('battleId');

  if (!battleId) {
    return NextResponse.json({ error: 'Battle ID is required' }, { status: 400 });
  }

  const db = await getDb();
  if (!db) {
    // No database configured — return graceful default
    return NextResponse.json({ gameState: null, dbStatus: 'not_configured' });
  }

  try {
    const state = await db.arenaGameState.findUnique({
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
