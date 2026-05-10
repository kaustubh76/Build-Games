import { NextRequest, NextResponse } from 'next/server';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { chatCompletion as zgChatCompletion, isZgComputeConfigured } from '@/services/zgComputeService';
import { safeParseAIResponse } from '@/lib/safeParseAIResponse';

const VALID_MOVES = ['strike', 'taunt', 'dodge', 'recover', 'special_move', 'special'];

/**
 * Trait-based fallback move selection when 0G Compute is unavailable.
 * Uses warrior stats, damage, and round to pick contextual moves.
 */
function generateTraitBasedMoves(battlePrompt: any): { agent_1: { move: string }; agent_2: { move: string } } {
  function selectMove(agent: any, opponentAgent: any): string {
    const traits = agent?.traits || {};
    const damage = agent?.total_damage_received || 0;
    const round = battlePrompt?.current_round || 1;

    // If heavily damaged, prioritize recovery
    if (damage > 6000) return 'recover';

    // Late rounds: favor aggressive plays
    if (round >= 4) {
      const avgOffensive = ((traits.Strength || 5000) + (traits.Charisma || 5000) + (traits.Wit || 5000)) / 3;
      if (avgOffensive > 6500) return 'special_move';
      return 'strike';
    }

    // Map strongest trait to optimal move
    const traitMoves: [string, string][] = [
      ['Strength', 'strike'],
      ['Charisma', 'taunt'],
      ['Luck', 'dodge'],
      ['Defence', 'recover'],
      ['Wit', 'special_move'],
    ];

    let bestTrait = 'Strength';
    let bestValue = 0;
    for (const [trait] of traitMoves) {
      const val = traits[trait] || 5000;
      if (val > bestValue) { bestValue = val; bestTrait = trait; }
    }

    const primaryMove = traitMoves.find(([t]) => t === bestTrait)?.[1] || 'strike';

    // Add entropy using round + damage to avoid identical moves every time
    const seed = (damage + round * 1000 + bestValue) % 10;
    if (seed < 7) return primaryMove;

    // 30% variety: pick from a subset based on seed
    const variety = ['strike', 'taunt', 'dodge', 'recover', 'special_move'];
    return variety[(damage + round) % variety.length];
  }

  return {
    agent_1: { move: selectMove(battlePrompt?.agent_1, battlePrompt?.agent_2) },
    agent_2: { move: selectMove(battlePrompt?.agent_2, battlePrompt?.agent_1) },
  };
}

/**
 * POST /api/generate-battle-moves
 *
 * Called by the game-master route to decide AI moves for each warrior
 * during an arena battle round. Uses 0G Compute for decentralized inference,
 * with trait-based fallback when 0G is unavailable.
 *
 * Request body: { battlePrompt: { current_round, agent_1, agent_2, moveset } }
 * Response:     { success: true, response: '{"agent_1":{"move":"strike"},"agent_2":{"move":"dodge"}}' }
 */
export async function POST(request: NextRequest) {
  try {
    await applyRateLimit(request, {
      prefix: 'generate-battle-moves',
      maxRequests: 30,
      windowMs: 60000,
    });

    const body = await request.json();
    const { battlePrompt } = body;

    if (!battlePrompt) {
      throw ErrorResponses.badRequest('Missing battlePrompt');
    }

    // Fallback to trait-based moves when 0G Compute is not configured
    if (!isZgComputeConfigured()) {
      console.warn('[GenerateBattleMoves] 0G Compute not configured, using trait-based fallback');
      const fallbackMoves = generateTraitBasedMoves(battlePrompt);
      return NextResponse.json({
        success: true,
        response: JSON.stringify(fallbackMoves),
        source: 'trait-fallback',
      });
    }

    const { current_round, agent_1, agent_2, moveset } = battlePrompt;

    const prompt = `You are a battle AI for a blockchain warrior arena game. You must choose the best move for each warrior based on their traits, personality, damage taken, and the current round.

## Battle State
- Round: ${current_round} of 5
- Available moves: ${(moveset || ['strike', 'taunt', 'dodge', 'recover', 'special_move']).join(', ')}

## Warrior 1
- Personality: ${JSON.stringify(agent_1?.personality?.adjectives || ['brave'])}
- Traits: Strength=${agent_1?.traits?.Strength || 5000}, Wit=${agent_1?.traits?.Wit || 5000}, Charisma=${agent_1?.traits?.Charisma || 5000}, Defence=${agent_1?.traits?.Defence || 5000}, Luck=${agent_1?.traits?.Luck || 5000}
- Total damage received: ${agent_1?.total_damage_received || 0}

## Warrior 2
- Personality: ${JSON.stringify(agent_2?.personality?.adjectives || ['fierce'])}
- Traits: Strength=${agent_2?.traits?.Strength || 5000}, Wit=${agent_2?.traits?.Wit || 5000}, Charisma=${agent_2?.traits?.Charisma || 5000}, Defence=${agent_2?.traits?.Defence || 5000}, Luck=${agent_2?.traits?.Luck || 5000}
- Total damage received: ${agent_2?.total_damage_received || 0}

## Move Guide
- strike: Basic attack, damage scales with Strength
- taunt: Reduces opponent's influence/defluence costs, scales with Charisma
- dodge: Attempt to dodge the opponent's attack, success scales with Luck
- recover: Heal damage, scales with Defence + Charisma
- special_move: Powerful attack, scales with average of Strength + Charisma + Wit

## Strategy Rules
- If heavily damaged (>6000), consider "recover"
- "special_move" is strongest but uses average stats
- "dodge" is risky but can nullify opponent damage
- Choose moves that leverage each warrior's strongest traits
- Late rounds (4-5) favor aggressive plays

Respond with ONLY valid JSON in this exact format, no explanation:
{"agent_1":{"move":"<move_name>"},"agent_2":{"move":"<move_name>"}}`;

    const aiResponse = await zgChatCompletion(
      [{ role: 'user', content: prompt }],
      { temperature: 0.8, maxTokens: 200 }
    );

    if (!aiResponse) {
      console.warn('[GenerateBattleMoves] 0G Compute returned empty, using trait-based fallback');
      const fallbackMoves = generateTraitBasedMoves(battlePrompt);
      return NextResponse.json({
        success: true,
        response: JSON.stringify(fallbackMoves),
        source: 'trait-fallback',
      });
    }

    // Parse and validate move selection
    const parsed = safeParseAIResponse<{
      agent_1?: { move?: string };
      agent_2?: { move?: string };
    }>(aiResponse);

    if (
      parsed?.agent_1?.move &&
      parsed?.agent_2?.move &&
      VALID_MOVES.includes(parsed.agent_1.move.toLowerCase()) &&
      VALID_MOVES.includes(parsed.agent_2.move.toLowerCase())
    ) {
      return NextResponse.json({
        success: true,
        response: JSON.stringify(parsed),
        source: '0g-compute',
      });
    }

    // Return raw string as fallback — game-master has its own multi-format parser
    return NextResponse.json({
      success: true,
      response: aiResponse,
      source: '0g-compute-raw',
    });
  } catch (error) {
    // Last-resort: trait-based fallback on any error
    try {
      const body = await request.clone().json().catch(() => null);
      if (body?.battlePrompt) {
        console.warn('[GenerateBattleMoves] Error occurred, using trait-based fallback:', (error as Error).message);
        const fallbackMoves = generateTraitBasedMoves(body.battlePrompt);
        return NextResponse.json({
          success: true,
          response: JSON.stringify(fallbackMoves),
          source: 'trait-fallback-error',
        });
      }
    } catch { /* ignore fallback errors */ }
    return handleAPIError(error, 'API:GenerateBattleMoves:POST');
  }
}
