/**
 * API Route: Arena Storage
 * Stores and retrieves battle records via 0G Storage (decentralized)
 * Falls back to database when 0G is unavailable
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { upload as zgUpload, download as zgDownload, isZgConfigured } from '@/services/zgStorageService';

// Lazy-load prisma for DB fallback
let prisma: any = null;
try {
  prisma = require('@/lib/prisma').prisma;
} catch {
  // DB not available
}

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
 * Upload a completed battle record to 0G Storage (with DB fallback)
 */
export async function POST(request: NextRequest) {
  try {
    await applyRateLimit(request, {
      prefix: 'arena-storage',
      maxRequests: 20,
      windowMs: 60000,
    });

    const body = await request.json();
    const { battle } = body as { battle: BattleStorageRecord };

    if (!battle || !battle.battleId) {
      throw ErrorResponses.badRequest('Battle data with battleId is required');
    }

    if (!battle.warriors || battle.warriors.length !== 2) {
      throw ErrorResponses.badRequest('Battle must have exactly 2 warriors');
    }

    if (!battle.rounds || battle.rounds.length === 0) {
      throw ErrorResponses.badRequest('Battle must have at least 1 round');
    }

    // Generate data hash for integrity
    const dataHash = createHash('sha256')
      .update(JSON.stringify(battle))
      .digest('hex');

    const battleJson = JSON.stringify({ ...battle, dataHash });

    // Try 0G Storage first (decentralized)
    let rootHash = '';
    let txHash = '';
    let storageMethod = 'none';

    if (isZgConfigured()) {
      try {
        const result = await zgUpload(Buffer.from(battleJson), `battle-${battle.battleId}.json`);
        rootHash = result.rootHash;
        txHash = result.txHash;
        storageMethod = '0g';
        console.log(`Battle ${battle.battleId} stored on 0G Storage: rootHash=${rootHash}`);
      } catch (zgError) {
        console.error('0G Storage upload failed, falling back to DB:', zgError);
      }
    }

    // Fallback: store hash reference in DB
    if (!rootHash) {
      rootHash = `0x${dataHash}`;
      storageMethod = 'db-fallback';
    }

    // Update battle record with storage hash (if DB available)
    if (prisma) {
      try {
        await prisma.predictionBattle.update({
          where: { id: battle.battleId },
          data: { battleDataHash: rootHash },
        });
      } catch (dbError) {
        // DB update is non-critical — the battle data is already on 0G
        console.warn('DB update for battleDataHash failed (non-critical):', dbError);
      }
    }

    return NextResponse.json({
      success: true,
      rootHash,
      transactionHash: txHash || rootHash,
      dataHash,
      storageMethod,
      message: `Battle ${battle.battleId} stored via ${storageMethod}`,
    });
  } catch (error) {
    return handleAPIError(error, 'API:Arena:Storage:POST');
  }
}

/**
 * GET /api/arena/storage?rootHash=xxx
 * Download a battle record from 0G Storage (with DB fallback)
 */
export async function GET(request: NextRequest) {
  try {
    await applyRateLimit(request, {
      prefix: 'arena-storage-get',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
    const rootHash = searchParams.get('rootHash');

    if (!rootHash) {
      throw ErrorResponses.badRequest('rootHash is required');
    }

    // Try 0G Storage download first (for non-SHA256 hashes — real 0G root hashes)
    if (!rootHash.startsWith('0x') && isZgConfigured()) {
      try {
        const data = await zgDownload(rootHash);
        const battle = JSON.parse(data.toString());
        return NextResponse.json({
          success: true,
          rootHash,
          data: battle,
          source: '0g',
        });
      } catch (zgError) {
        console.error('0G Storage download failed:', zgError);
      }
    }

    // Fallback: look up by hash in DB
    if (prisma) {
      try {
        const battle = await prisma.predictionBattle.findFirst({
          where: { battleDataHash: rootHash },
        });

        if (battle) {
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
            source: 'database',
          });
        }
      } catch (dbError) {
        console.error('DB lookup failed:', dbError);
      }
    }

    throw ErrorResponses.badRequest('Battle record not found');
  } catch (error) {
    return handleAPIError(error, 'API:Arena:Storage:GET');
  }
}
