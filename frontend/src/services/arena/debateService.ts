/**
 * AI Debate Service — Arena Battles
 *
 * Generates arguments for warriors in prediction arena debates using
 * 0G Compute for decentralized AI inference. Falls back to trait-based
 * scoring with template arguments when 0G is unavailable.
 */

import {
  WarriorTraits,
  DebateMove,
  DebateContext,
  DebateEvidence,
  GeneratedArgument,
  RoundResult,
  PredictionRound,
  MarketSource,
} from '../../types/predictionArena';

import {
  calculateRoundScore,
  generateBaseScore,
  selectOptimalMove,
  calculateConfidence,
} from '../../lib/arenaScoring';
import type { ScoreBreakdown } from '../../types/predictionArena';
import {
  chatCompletion as zgChatCompletion,
  isZgComputeConfigured,
} from '../zgComputeService';
import { safeParseAIResponse } from '../../lib/safeParseAIResponse';

// ============================================
// 0G COMPUTE — AI ARGUMENT GENERATION
// ============================================

/**
 * Generate a battle argument using 0G Compute.
 * Returns null if 0G is unavailable or the call fails.
 */
async function generateArgumentVia0G(
  traits: WarriorTraits,
  context: DebateContext,
  move: DebateMove
): Promise<{ argument: string; evidence: DebateEvidence[] } | null> {
  if (!isZgComputeConfigured()) return null;

  const side = context.side === 'yes' ? 'YES' : 'NO';
  const prompt = `You are a warrior debating in a blockchain prediction arena. You are arguing for the ${side} outcome on: "${context.marketQuestion}"

Your move this round is: ${move}
Round: ${context.roundNumber} of 5

Your warrior traits — Strength:${traits.strength} Wit:${traits.wit} Charisma:${traits.charisma} Defence:${traits.defence} Luck:${traits.luck}

Move guide:
- strike: Aggressive factual attack
- taunt: Mock the opponent's position
- dodge: Deflect opponent's argument
- special: Present an overlooked insight
- recover: Acknowledge weakness, redirect

Generate a short, punchy debate argument (2-3 sentences) for ${side}, matching the "${move}" style. Also provide 1-2 evidence points.

Respond with ONLY valid JSON:
{"argument":"<your argument>","evidence":[{"type":"data","title":"<title>","snippet":"<1 sentence>","relevance":80}]}`;

  try {
    const raw = await zgChatCompletion(
      [{ role: 'user', content: prompt }],
      { temperature: 0.85, maxTokens: 400 }
    );
    if (!raw) return null;

    const parsed = safeParseAIResponse<{ argument?: string; evidence?: any[] }>(raw);
    if (!parsed) return null;

    const evidence: DebateEvidence[] = (parsed.evidence || []).map((e: any) => ({
      type: e.type || 'data',
      source: e.source || '0G Compute Analysis',
      title: e.title || 'AI-generated evidence',
      snippet: e.snippet || '',
      relevance: e.relevance || 75,
      timestamp: new Date().toISOString(),
    }));

    return { argument: parsed.argument || raw, evidence };
  } catch (err) {
    console.warn('[DebateService] 0G argument generation failed, using template:', err);
    return null;
  }
}

// ============================================
// TEMPLATE FALLBACK — ARGUMENT GENERATION
// ============================================

const ARGUMENT_TEMPLATES = {
  yes: {
    [DebateMove.STRIKE]: [
      "The evidence overwhelmingly supports YES. {evidence}. The trajectory is clear.",
      "Let me present the hard facts: {evidence}. This points definitively to YES.",
      "Historical patterns don't lie: {evidence}. The outcome will be YES.",
    ],
    [DebateMove.TAUNT]: [
      "My opponent ignores the obvious signs. {evidence}. Their NO position is wishful thinking.",
      "The NO argument crumbles under scrutiny. {evidence}. Face the reality.",
      "While my opponent clings to doubt, {evidence}. The smart money is on YES.",
    ],
    [DebateMove.DODGE]: [
      "While that's an interesting point, let's focus on what matters: {evidence}.",
      "That concern is valid but misses the bigger picture. Consider: {evidence}.",
      "I acknowledge the uncertainty, but the core thesis remains: {evidence}.",
    ],
    [DebateMove.SPECIAL]: [
      "Here's what everyone's missing: {evidence}. This changes everything for YES.",
      "A deeper analysis reveals: {evidence}. The YES case is stronger than it appears.",
      "Consider this overlooked factor: {evidence}. It tips the scales to YES.",
    ],
    [DebateMove.RECOVER]: [
      "Fair point on that weakness. However, the overall picture still supports YES: {evidence}.",
      "I'll concede that aspect, but pivoting to the stronger argument: {evidence}.",
      "That's a valid concern. Let me address it and reinforce: {evidence}.",
    ],
  },
  no: {
    [DebateMove.STRIKE]: [
      "The data clearly indicates NO. {evidence}. The conclusion is unavoidable.",
      "Here are the facts that matter: {evidence}. This leads squarely to NO.",
      "Market signals are telling us: {evidence}. NO is the rational position.",
    ],
    [DebateMove.TAUNT]: [
      "The YES position is built on hopium. {evidence}. Reality says otherwise.",
      "My opponent's optimism ignores: {evidence}. The NO case is airtight.",
      "Wishful thinking won't change: {evidence}. NO is where this lands.",
    ],
    [DebateMove.DODGE]: [
      "That's one perspective, but consider: {evidence}. The NO thesis stands.",
      "An interesting angle, but the fundamentals point elsewhere: {evidence}.",
      "I see that argument, but let's refocus on: {evidence}.",
    ],
    [DebateMove.SPECIAL]: [
      "Here's the insight others miss: {evidence}. This seals the NO case.",
      "Looking deeper reveals: {evidence}. The NO position is underappreciated.",
      "An unconventional but crucial point: {evidence}. NO becomes clearer.",
    ],
    [DebateMove.RECOVER]: [
      "That's a fair critique. However, the NO thesis remains intact: {evidence}.",
      "I acknowledge that point, but consider the counter: {evidence}.",
      "Valid concern, but the weight of evidence still says NO: {evidence}.",
    ],
  },
};

function generateTemplateEvidence(
  context: DebateContext,
  luck: number,
  count: number = 2
): DebateEvidence[] {
  const evidenceTypes: DebateEvidence['type'][] = ['news', 'data', 'expert', 'historical', 'market'];
  const qualityBonus = (luck / 10000) * 20;
  const evidence: DebateEvidence[] = [];

  const snippets: Record<string, string[]> = {
    yes: [
      'Recent trends strongly support this outcome.',
      'Multiple indicators point to a positive resolution.',
      'Expert consensus aligns with this projection.',
    ],
    no: [
      'Current data suggests significant headwinds.',
      'Several factors indicate this outcome is unlikely.',
      'Expert analysis raises substantial concerns.',
    ],
  };

  for (let i = 0; i < count; i++) {
    const type = evidenceTypes[Math.floor(Math.random() * evidenceTypes.length)];
    const relevance = Math.round(60 + qualityBonus + Math.random() * 20);
    const sideSnippets = snippets[context.side];
    evidence.push({
      type,
      source: 'Template Analysis',
      title: `Evidence for ${context.side.toUpperCase()} outcome`,
      snippet: sideSnippets[Math.floor(Math.random() * sideSnippets.length)],
      relevance,
      timestamp: new Date().toISOString(),
    });
  }

  return evidence.sort((a, b) => b.relevance - a.relevance);
}

// ============================================
// ARGUMENT GENERATION (0G → template fallback)
// ============================================

/**
 * Generate an argument for a warrior — tries 0G Compute first,
 * falls back to template + trait-based generation.
 */
export async function generateWarriorArgument(
  traits: WarriorTraits,
  context: DebateContext,
  previousMoves: DebateMove[] = []
): Promise<GeneratedArgument> {
  // 1. Select optimal move based on traits and context
  const move = selectOptimalMove(
    traits,
    context.roundNumber,
    context.opponentLastMove,
    previousMoves
  );

  // 2. Try 0G Compute for real AI argument
  const aiResult = await generateArgumentVia0G(traits, context, move);

  let argument: string;
  let evidence: DebateEvidence[];

  if (aiResult) {
    argument = aiResult.argument;
    evidence = aiResult.evidence;
  } else {
    // 3. Template fallback
    evidence = generateTemplateEvidence(context, traits.luck, 2);
    const templates = ARGUMENT_TEMPLATES[context.side][move];
    const template = templates[Math.floor(Math.random() * templates.length)];
    const evidenceSummary = evidence.map(e => e.snippet).join(' Furthermore, ');
    argument = template.replace('{evidence}', evidenceSummary);
  }

  // 4. Calculate confidence
  const isWinning = context.previousRounds.length > 0 &&
    context.previousRounds.reduce((sum, r) => {
      const myScore = context.side === 'yes' ? r.w1Score : r.w2Score;
      const oppScore = context.side === 'yes' ? r.w2Score : r.w1Score;
      return sum + (myScore - oppScore);
    }, 0) > 0;

  const confidence = calculateConfidence(traits, move, context.roundNumber, isWinning);

  const reasoning = `Selected ${move} based on traits (STR:${traits.strength}, WIT:${traits.wit}, CHA:${traits.charisma}). ` +
    `Evidence quality: ${evidence[0]?.relevance || 0}. ` +
    (context.opponentLastMove ? `Opponent used ${context.opponentLastMove} last round. ` : '') +
    `Round ${context.roundNumber}/5. AI: ${aiResult ? '0G Compute' : 'template fallback'}.`;

  return { argument, evidence, confidence, move, reasoning };
}

// ============================================
// ROUND EXECUTION (now async for 0G)
// ============================================

/**
 * Execute a full debate round between two warriors.
 * Now async to support 0G Compute inference.
 */
export async function executeDebateRound(
  warrior1Traits: WarriorTraits,
  warrior2Traits: WarriorTraits,
  context: {
    marketQuestion: string;
    marketSource: MarketSource;
    roundNumber: number;
    previousRounds: PredictionRound[];
  }
): Promise<RoundResult> {
  const warrior1PrevMoves = context.previousRounds.map(r => r.w1Move as DebateMove).filter(Boolean);
  const warrior2PrevMoves = context.previousRounds.map(r => r.w2Move as DebateMove).filter(Boolean);

  const lastRound = context.previousRounds[context.previousRounds.length - 1];
  const w1OpponentLastMove = lastRound?.w2Move as DebateMove | undefined;
  const w2OpponentLastMove = lastRound?.w1Move as DebateMove | undefined;

  // Generate arguments in parallel (both can call 0G concurrently)
  const [warrior1Arg, warrior2Arg] = await Promise.all([
    generateWarriorArgument(
      warrior1Traits,
      {
        marketQuestion: context.marketQuestion,
        marketSource: context.marketSource,
        side: 'yes',
        roundNumber: context.roundNumber,
        previousRounds: context.previousRounds,
        opponentLastMove: w1OpponentLastMove,
      },
      warrior1PrevMoves
    ),
    generateWarriorArgument(
      warrior2Traits,
      {
        marketQuestion: context.marketQuestion,
        marketSource: context.marketSource,
        side: 'no',
        roundNumber: context.roundNumber,
        previousRounds: context.previousRounds,
        opponentLastMove: w2OpponentLastMove,
      },
      warrior2PrevMoves
    ),
  ]);

  // Score the round
  const w1BaseScore = generateBaseScore(warrior1Traits.luck);
  const w2BaseScore = generateBaseScore(warrior2Traits.luck);

  const w1ScoreBreakdown = calculateRoundScore(w1BaseScore, warrior1Traits, warrior1Arg.move, warrior2Arg.move, warrior2Traits);
  const w2ScoreBreakdown = calculateRoundScore(w2BaseScore, warrior2Traits, warrior2Arg.move, warrior1Arg.move, warrior1Traits);

  let roundWinner: 'warrior1' | 'warrior2' | 'draw';
  if (w1ScoreBreakdown.finalScore > w2ScoreBreakdown.finalScore) {
    roundWinner = 'warrior1';
  } else if (w2ScoreBreakdown.finalScore > w1ScoreBreakdown.finalScore) {
    roundWinner = 'warrior2';
  } else {
    roundWinner = 'draw';
  }

  const judgeReasoning = generateJudgeReasoning(warrior1Arg, warrior2Arg, w1ScoreBreakdown, w2ScoreBreakdown, roundWinner);

  return {
    warrior1: warrior1Arg,
    warrior2: warrior2Arg,
    warrior1Score: w1ScoreBreakdown.finalScore,
    warrior2Score: w2ScoreBreakdown.finalScore,
    roundWinner,
    judgeReasoning,
  };
}

function generateJudgeReasoning(
  w1Arg: GeneratedArgument,
  w2Arg: GeneratedArgument,
  w1Score: ScoreBreakdown,
  w2Score: ScoreBreakdown,
  winner: 'warrior1' | 'warrior2' | 'draw'
): string {
  const parts: string[] = [];
  parts.push(`YES used ${w1Arg.move} while NO used ${w2Arg.move}.`);

  if (w1Score.moveMultiplier > 1) {
    parts.push(`YES's ${w1Arg.move} effectively countered NO's ${w2Arg.move}.`);
  } else if (w2Score.moveMultiplier > 1) {
    parts.push(`NO's ${w2Arg.move} effectively countered YES's ${w1Arg.move}.`);
  }

  const w1EQ = w1Arg.evidence[0]?.relevance || 0;
  const w2EQ = w2Arg.evidence[0]?.relevance || 0;
  if (Math.abs(w1EQ - w2EQ) > 10) {
    parts.push(`${w1EQ > w2EQ ? 'YES' : 'NO'} presented stronger supporting evidence.`);
  }

  if (winner === 'warrior1') {
    parts.push(`Round goes to YES (${w1Score.finalScore} vs ${w2Score.finalScore}).`);
  } else if (winner === 'warrior2') {
    parts.push(`Round goes to NO (${w2Score.finalScore} vs ${w1Score.finalScore}).`);
  } else {
    parts.push(`Round is a draw (${w1Score.finalScore} vs ${w2Score.finalScore}).`);
  }

  return parts.join(' ');
}

// ============================================
// FULL BATTLE EXECUTION (now async for 0G)
// ============================================

/**
 * Execute all 5 rounds of a prediction battle.
 */
export async function executeFullBattle(
  warrior1Traits: WarriorTraits,
  warrior2Traits: WarriorTraits,
  marketQuestion: string,
  marketSource: MarketSource
): Promise<{
  rounds: RoundResult[];
  finalWinner: 'warrior1' | 'warrior2' | 'draw';
  warrior1TotalScore: number;
  warrior2TotalScore: number;
}> {
  const rounds: RoundResult[] = [];
  const previousRounds: PredictionRound[] = [];

  for (let roundNum = 1; roundNum <= 5; roundNum++) {
    const result = await executeDebateRound(warrior1Traits, warrior2Traits, {
      marketQuestion,
      marketSource,
      roundNumber: roundNum,
      previousRounds,
    });

    rounds.push(result);

    previousRounds.push({
      id: `round-${roundNum}`,
      battleId: 'temp',
      roundNumber: roundNum,
      w1Argument: result.warrior1.argument,
      w1Move: result.warrior1.move,
      w1Score: result.warrior1Score,
      w2Argument: result.warrior2.argument,
      w2Move: result.warrior2.move,
      w2Score: result.warrior2Score,
      roundWinner: result.roundWinner,
      startedAt: new Date().toISOString(),
    });
  }

  const warrior1TotalScore = rounds.reduce((sum, r) => sum + r.warrior1Score, 0);
  const warrior2TotalScore = rounds.reduce((sum, r) => sum + r.warrior2Score, 0);

  let finalWinner: 'warrior1' | 'warrior2' | 'draw';
  if (warrior1TotalScore > warrior2TotalScore) finalWinner = 'warrior1';
  else if (warrior2TotalScore > warrior1TotalScore) finalWinner = 'warrior2';
  else finalWinner = 'draw';

  return { rounds, finalWinner, warrior1TotalScore, warrior2TotalScore };
}
