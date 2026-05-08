import { NextRequest, NextResponse } from 'next/server';
import { executeDebateRound, executeFullBattle } from '../../../../../../services/arena/debateService';
import { WarriorTraits, MarketSource, PredictionRound } from '../../../../../../types/predictionArena';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { isTier3BundledReceipts } from '@/lib/storage/featureFlags';
import { createPublicClient, http } from 'viem';
import { avalancheFuji, avalanche } from 'viem/chains';
import { getContracts, getChainId, warriorsNFTAbi, getAvalancheRpcUrl } from '../../../../../../constants';

/**
 * Fetch warrior traits from on-chain WarriorsNFT contract.
 * Returns balanced defaults if the read fails (e.g. traits not assigned yet).
 */
async function fetchOnChainTraits(warriorId: number): Promise<WarriorTraits> {
  const balanced: WarriorTraits = { strength: 5000, wit: 5000, charisma: 5000, defence: 5000, luck: 5000 };
  try {
    const chainId = getChainId();
    const chain = chainId === 43114 ? avalanche : avalancheFuji;
    const rpcUrl = getAvalancheRpcUrl();
    const client = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
    const contracts = getContracts();
    // viem returns the struct as an object with bigint values
    const result = await client.readContract({
      address: contracts.warriorsNFT as `0x${string}`,
      abi: warriorsNFTAbi,
      functionName: 'getTraits',
      args: [BigInt(warriorId)],
    });
    // The ABI specifies a tuple return with named components —
    // viem decodes this as an object with bigint fields.
    // Use indexing to safely handle both array-like and object shapes.
    const t = result as Record<string, bigint> & Record<number, bigint>;
    return {
      strength: Number(t.strength ?? t[0] ?? 5000n),
      wit:      Number(t.wit ?? t[1] ?? 5000n),
      charisma: Number(t.charisma ?? t[2] ?? 5000n),
      defence:  Number(t.defence ?? t[3] ?? 5000n),
      luck:     Number(t.luck ?? t[4] ?? 5000n),
    };
  } catch (err) {
    console.warn(`Failed to fetch on-chain traits for warrior ${warriorId}, using defaults:`, err);
    return balanced;
  }
}

/**
 * Store completed battle to Storage
 */
async function storeBattleData(
  battle: any,
  rounds: any[],
  w1Traits: WarriorTraits,
  w2Traits: WarriorTraits
): Promise<{ rootHash?: string; success: boolean }> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  const battleRecord = {
    version: '1.0.0',
    battleId: battle.id,
    timestamp: Date.now(),
    market: {
      externalId: battle.externalMarketId,
      source: battle.source,
      question: battle.question,
    },
    warriors: [
      {
        id: battle.warrior1Id,
        owner: battle.warrior1Owner,
        side: 'yes',
        traits: w1Traits,
        finalScore: battle.warrior1Score,
      },
      {
        id: battle.warrior2Id,
        owner: battle.warrior2Owner,
        side: 'no',
        traits: w2Traits,
        finalScore: battle.warrior2Score,
      },
    ],
    rounds: rounds.map(r => ({
      roundNumber: r.roundNumber,
      warrior1: {
        argument: r.w1Argument || '',
        move: r.w1Move || '',
        score: r.w1Score,
        evidence: r.w1Evidence ? JSON.parse(r.w1Evidence) : [],
      },
      warrior2: {
        argument: r.w2Argument || '',
        move: r.w2Move || '',
        score: r.w2Score,
        evidence: r.w2Evidence ? JSON.parse(r.w2Evidence) : [],
      },
      roundWinner: r.roundWinner,
      judgeReasoning: r.judgeReasoning || '',
    })),
    outcome: battle.warrior1Score > battle.warrior2Score
      ? 'warrior1'
      : battle.warrior2Score > battle.warrior1Score
      ? 'warrior2'
      : 'draw',
    totalScores: {
      warrior1: battle.warrior1Score,
      warrior2: battle.warrior2Score,
    },
    stakes: battle.stakes,
    dataHash: '',
  };

  const response = await fetch(`${baseUrl}/api/arena/storage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ battle: battleRecord }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to store');
  }

  return await response.json();
}

/**
 * POST /api/arena/battles/[id]/execute
 * Execute a battle round or full battle
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'arena-battles-execute',
      maxRequests: 20,
      windowMs: 60000,
    });

    const { id: battleId } = await params;
    const body = await request.json();
    const { mode = 'round', warrior1Traits, warrior2Traits } = body;

    // Fetch battle
    const battle = await prisma.predictionBattle.findUnique({
      where: { id: battleId },
      include: {
        rounds: {
          orderBy: { roundNumber: 'asc' },
        },
      },
    });

    if (!battle) {
      throw ErrorResponses.notFound(`Battle #${battleId}`);
    }

    if (battle.status !== 'active') {
      throw ErrorResponses.badRequest(`Battle is not active (status: ${battle.status})`);
    }

    // Use client-supplied traits, or fetch real on-chain traits as fallback
    let w1Traits: WarriorTraits;
    let w2Traits: WarriorTraits;

    if (warrior1Traits && warrior2Traits) {
      w1Traits = warrior1Traits;
      w2Traits = warrior2Traits;
    } else {
      // Fetch actual traits from WarriorsNFT contract
      [w1Traits, w2Traits] = await Promise.all([
        warrior1Traits ? Promise.resolve(warrior1Traits) : fetchOnChainTraits(battle.warrior1Id),
        warrior2Traits ? Promise.resolve(warrior2Traits) : fetchOnChainTraits(battle.warrior2Id),
      ]);
    }

    const marketSource = battle.source as MarketSource;

    if (mode === 'full') {
      // Execute all remaining rounds
      const fullResult = await executeFullBattle(
        w1Traits,
        w2Traits,
        battle.question,
        marketSource
      );

      // Save all rounds to database — Tier 3 transcript bundling. When
      // ENABLE_0G_TIER3=1 the per-round Prisma writes are skipped; the rounds
      // are bundled into the battle's 0G receipt below. Until then we
      // dual-write so existing read paths (prisma.predictionRound.findMany)
      // keep working unchanged.
      if (!isTier3BundledReceipts()) {
        for (let i = 0; i < fullResult.rounds.length; i++) {
          const roundResult = fullResult.rounds[i];
          const roundNumber = i + 1;

          await prisma.predictionRound.upsert({
            where: {
              battleId_roundNumber: {
                battleId,
                roundNumber,
              },
            },
            update: {
              w1Argument: roundResult.warrior1.argument,
              w1Evidence: JSON.stringify(roundResult.warrior1.evidence),
              w1Move: roundResult.warrior1.move,
              w1Score: roundResult.warrior1Score,
              w2Argument: roundResult.warrior2.argument,
              w2Evidence: JSON.stringify(roundResult.warrior2.evidence),
              w2Move: roundResult.warrior2.move,
              w2Score: roundResult.warrior2Score,
              roundWinner: roundResult.roundWinner,
              judgeReasoning: roundResult.judgeReasoning,
              endedAt: new Date(),
            },
            create: {
              battleId,
              roundNumber,
              w1Argument: roundResult.warrior1.argument,
              w1Evidence: JSON.stringify(roundResult.warrior1.evidence),
              w1Move: roundResult.warrior1.move,
              w1Score: roundResult.warrior1Score,
              w2Argument: roundResult.warrior2.argument,
              w2Evidence: JSON.stringify(roundResult.warrior2.evidence),
              w2Move: roundResult.warrior2.move,
              w2Score: roundResult.warrior2Score,
              roundWinner: roundResult.roundWinner,
              judgeReasoning: roundResult.judgeReasoning,
              endedAt: new Date(),
            },
          });
        }
      }

      // Update battle
      const updatedBattle = await prisma.predictionBattle.update({
        where: { id: battleId },
        data: {
          warrior1Score: fullResult.warrior1TotalScore,
          warrior2Score: fullResult.warrior2TotalScore,
          currentRound: 6,
          status: 'completed',
          completedAt: new Date(),
        },
        include: { rounds: true },
      });

      // Update warrior stats
      await updateWarriorStats(
        battle.warrior1Id,
        battle.warrior2Id,
        fullResult.warrior1TotalScore,
        fullResult.warrior2TotalScore
      );

      // Store battle record to Storage. In Tier 3 mode the per-round Prisma
      // rows don't exist, so fall back to the raw fullResult.rounds shape
      // (already in memory) to keep the receipt complete.
      const roundsForStorage = updatedBattle.rounds.length > 0
        ? updatedBattle.rounds
        : fullResult.rounds.map((r, i) => ({
            roundNumber: i + 1,
            w1Argument: r.warrior1.argument,
            w1Evidence: JSON.stringify(r.warrior1.evidence),
            w1Move: r.warrior1.move,
            w1Score: r.warrior1Score,
            w2Argument: r.warrior2.argument,
            w2Evidence: JSON.stringify(r.warrior2.evidence),
            w2Move: r.warrior2.move,
            w2Score: r.warrior2Score,
            roundWinner: r.roundWinner,
            judgeReasoning: r.judgeReasoning,
          }));
      let storageResult = null;
      try {
        storageResult = await storeBattleData(
          updatedBattle,
          roundsForStorage,
          w1Traits,
          w2Traits
        );
      } catch (storageError) {
        // Log with context for debugging - storage failures are non-critical but should be investigated
        console.warn(`[Battle ${battle.id}] Failed to store battle to Storage:`, {
          battleId: battle.id,
          warrior1Id: battle.warrior1Id,
          warrior2Id: battle.warrior2Id,
          error: storageError instanceof Error ? storageError.message : 'Unknown error',
        });
      }

      return NextResponse.json({
        battle: updatedBattle,
        result: fullResult,
        message: 'Battle completed!',
        storage: storageResult,
      });
    }

    // Execute single round
    const roundNumber = battle.currentRound;

    if (roundNumber > 5) {
      throw ErrorResponses.badRequest('Battle already completed');
    }

    // Convert existing rounds to format expected by debate service
    const previousRounds: PredictionRound[] = battle.rounds.map(r => ({
      id: r.id,
      battleId: r.battleId,
      roundNumber: r.roundNumber,
      w1Argument: r.w1Argument || undefined,
      w1Evidence: r.w1Evidence || undefined,
      w1Move: r.w1Move as any,
      w1Score: r.w1Score,
      w2Argument: r.w2Argument || undefined,
      w2Evidence: r.w2Evidence || undefined,
      w2Move: r.w2Move as any,
      w2Score: r.w2Score,
      roundWinner: r.roundWinner as any,
      judgeReasoning: r.judgeReasoning || undefined,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString(),
    }));

    const roundResult = await executeDebateRound(
      w1Traits,
      w2Traits,
      {
        marketQuestion: battle.question,
        marketSource,
        roundNumber,
        previousRounds,
      }
    );

    // Save round — Tier 3 transcript bundling. When ENABLE_0G_TIER3=1 the
    // per-round Prisma write is skipped; the bundled receipt for the whole
    // battle is emitted on completion. Until then, dual-write keeps existing
    // read paths working.
    const roundData = {
      battleId,
      roundNumber,
      w1Argument: roundResult.warrior1.argument,
      w1Evidence: JSON.stringify(roundResult.warrior1.evidence),
      w1Move: roundResult.warrior1.move,
      w1Score: roundResult.warrior1Score,
      w2Argument: roundResult.warrior2.argument,
      w2Evidence: JSON.stringify(roundResult.warrior2.evidence),
      w2Move: roundResult.warrior2.move,
      w2Score: roundResult.warrior2Score,
      roundWinner: roundResult.roundWinner,
      judgeReasoning: roundResult.judgeReasoning,
      endedAt: new Date(),
    };
    const round = isTier3BundledReceipts()
      ? { ...roundData, id: `mem-round-${battleId}-${roundNumber}` }
      : await prisma.predictionRound.create({ data: roundData });

    // Update battle
    const isComplete = roundNumber >= 5;
    const newW1Score = battle.warrior1Score + roundResult.warrior1Score;
    const newW2Score = battle.warrior2Score + roundResult.warrior2Score;

    const updatedBattle = await prisma.predictionBattle.update({
      where: { id: battleId },
      data: {
        warrior1Score: newW1Score,
        warrior2Score: newW2Score,
        currentRound: roundNumber + 1,
        status: isComplete ? 'completed' : 'active',
        completedAt: isComplete ? new Date() : undefined,
      },
      include: { rounds: true },
    });

    // Update stats if complete
    let storageResult = null;
    if (isComplete) {
      await updateWarriorStats(
        battle.warrior1Id,
        battle.warrior2Id,
        newW1Score,
        newW2Score
      );

      // Store battle record to Storage
      try {
        storageResult = await storeBattleData(
          updatedBattle,
          updatedBattle.rounds,
          w1Traits,
          w2Traits
        );
      } catch (storageError) {
        console.warn('Failed to store battle to Storage:', storageError);
      }
    }

    return NextResponse.json({
      round,
      battle: updatedBattle,
      result: roundResult,
      message: `Round ${roundNumber} executed`,
      storage: storageResult,
    });
  } catch (error) {
    return handleAPIError(error, 'API:Arena:Battles:Execute:POST');
  }
}

async function updateWarriorStats(
  warrior1Id: number,
  warrior2Id: number,
  w1Score: number,
  w2Score: number
) {
  const winner = w1Score > w2Score ? warrior1Id : w2Score > w1Score ? warrior2Id : null;

  // Update warrior 1
  await prisma.warriorArenaStats.upsert({
    where: { warriorId: warrior1Id },
    update: {
      totalBattles: { increment: 1 },
      wins: winner === warrior1Id ? { increment: 1 } : undefined,
      losses: winner === warrior2Id ? { increment: 1 } : undefined,
      draws: winner === null ? { increment: 1 } : undefined,
    },
    create: {
      warriorId: warrior1Id,
      totalBattles: 1,
      wins: winner === warrior1Id ? 1 : 0,
      losses: winner === warrior2Id ? 1 : 0,
      draws: winner === null ? 1 : 0,
      arenaRating: 1000,
      peakRating: 1000,
    },
  });

  // Update warrior 2
  await prisma.warriorArenaStats.upsert({
    where: { warriorId: warrior2Id },
    update: {
      totalBattles: { increment: 1 },
      wins: winner === warrior2Id ? { increment: 1 } : undefined,
      losses: winner === warrior1Id ? { increment: 1 } : undefined,
      draws: winner === null ? { increment: 1 } : undefined,
    },
    create: {
      warriorId: warrior2Id,
      totalBattles: 1,
      wins: winner === warrior2Id ? 1 : 0,
      losses: winner === warrior1Id ? 1 : 0,
      draws: winner === null ? 1 : 0,
      arenaRating: 1000,
      peakRating: 1000,
    },
  });
}
