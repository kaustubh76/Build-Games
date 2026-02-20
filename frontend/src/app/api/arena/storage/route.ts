/**
 * API Route: Arena Storage
 * Handles storing and retrieving prediction arena battles via database
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

const prisma = new PrismaClient();

interface BattleStorageRecord {
  version: string;
  battleId: string;
  timestamp: number;
  market: {
    externalId: string;
    source: 'polymarket' | 'kalshi';
    question: string;
  };
  warriors: {
    id: number;
    owner: string;
    side: 'yes' | 'no';
    traits: {
      strength: number;
      wit: number;
      charisma: number;
      defence: number;
      luck: number;
    };
    finalScore: number;
  }[];
  rounds: {
    roundNumber: number;
    warrior1: {
      argument: string;
      move: string;
      score: number;
      evidence: string[];
    };
    warrior2: {
      argument: string;
      move: string;
      score: number;
      evidence: string[];
    };
    roundWinner: string;
    judgeReasoning: string;
  }[];
  outcome: string;
  totalScores: {
    warrior1: number;
    warrior2: number;
  };
  stakes: string;
  betting?: {
    totalPool: string;
    warrior1Bets: string;
    warrior2Bets: string;
    totalBettors: number;
  };
  dataHash: string;
}

/**
 * POST /api/arena/storage
 * Store a completed battle record to database
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting for storage operations
    applyRateLimit(request, {
      prefix: 'arena-storage',
      maxRequests: 20,
      windowMs: 60000,
    });

    const body = await request.json();
    const { battle } = body as { battle: BattleStorageRecord };

    if (!battle || !battle.battleId) {
      throw ErrorResponses.badRequest('Battle data with battleId is required');
    }

    // Validate battle structure
    if (!battle.warriors || battle.warriors.length !== 2) {
      throw ErrorResponses.badRequest('Battle must have exactly 2 warriors');
    }

    if (!battle.rounds || battle.rounds.length === 0) {
      throw ErrorResponses.badRequest('Battle must have at least 1 round');
    }

    // Generate a data hash from the battle content
    const dataHash = createHash('sha256')
      .update(JSON.stringify(battle))
      .digest('hex');

    // Use the data hash as the rootHash identifier
    const rootHash = `0x${dataHash}`;

    // Store battle data hash in the prediction battle record
    await prisma.predictionBattle.update({
      where: { id: battle.battleId },
      data: { battleDataHash: rootHash },
    });

    // Store the full battle data in MarketSnapshot for retrieval
    await prisma.marketSnapshot.upsert({
      where: { rootHash },
      create: {
        rootHash,
        marketId: battle.market.externalId,
        source: battle.market.source,
        question: battle.market.question,
        yesPrice: battle.totalScores.warrior1,
        noPrice: battle.totalScores.warrior2,
        volume: battle.stakes,
        timestamp: new Date(battle.timestamp),
      },
      update: {
        volume: battle.stakes,
        timestamp: new Date(battle.timestamp),
      },
    });

    return NextResponse.json({
      success: true,
      rootHash,
      transactionHash: rootHash,
      dataHash,
      message: `Battle ${battle.battleId} stored`,
    });
  } catch (error) {
    return handleAPIError(error, 'API:Arena:Storage:POST');
  }
}

/**
 * GET /api/arena/storage?rootHash=xxx
 * Retrieve a battle record from database
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting for retrieval operations
    applyRateLimit(request, {
      prefix: 'arena-storage-get',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
    const rootHash = searchParams.get('rootHash');

    if (!rootHash) {
      throw ErrorResponses.badRequest('rootHash is required');
    }

    // Look up battle by its data hash
    const battle = await prisma.predictionBattle.findFirst({
      where: { battleDataHash: rootHash },
    });

    if (!battle) {
      throw ErrorResponses.badRequest('Battle record not found');
    }

    // Return the battle data
    return NextResponse.json({
      success: true,
      rootHash,
      data: {
        battleId: battle.id,
        externalMarketId: battle.externalMarketId,
        source: battle.source,
        question: battle.question,
        warrior1Id: battle.warrior1Id,
        warrior1Owner: battle.warrior1Owner,
        warrior2Id: battle.warrior2Id,
        warrior2Owner: battle.warrior2Owner,
        warrior1Score: battle.warrior1Score,
        warrior2Score: battle.warrior2Score,
        stakes: battle.stakes,
        status: battle.status,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Arena:Storage:GET');
  }
}
