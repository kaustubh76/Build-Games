/**
 * Seed PredictionBattle + PredictionRound rows so /prediction-arena renders.
 *
 * Mix of pending / active / completed states so each filter tab on the
 * arena page has at least one battle to display.
 */
import './_lib/env';
import { getPrisma, disconnect } from './_lib/db';
import { step, pass, info, expectGte } from './_lib/expect';
import { TEST_WALLET_ADDRESS } from './_lib/env';

async function main(): Promise<void> {
  step('Seed PredictionBattle rows');
  const prisma = getPrisma();

  const battles = [
    { id: 'battle-001', externalMarketId: 'poly_election_2024', source: 'polymarket', question: 'Will Trump win the 2024 election?', warrior1Id: 1, warrior1Owner: TEST_WALLET_ADDRESS, warrior2Id: 2, warrior2Owner: '0xf1e2d3c4b5a6978869574635241302100abcdef0', stakes: '50000000000000000000', warrior1Score: 70, warrior2Score: 85, status: 'completed', currentRound: 3, onChainBattleId: '1', txHash: '0x' + 'a'.repeat(64) },
    { id: 'battle-002', externalMarketId: 'kalshi_fed_march', source: 'kalshi', question: 'Will Fed cut rates in March?', warrior1Id: 3, warrior1Owner: '0xa9b8c7d6e5f4030210293847565748392010abcd', warrior2Id: 1, warrior2Owner: TEST_WALLET_ADDRESS, stakes: '75000000000000000000', warrior1Score: 0, warrior2Score: 0, status: 'active', currentRound: 1, onChainBattleId: '2' },
    { id: 'battle-003', externalMarketId: 'poly_btc_150k', source: 'polymarket', question: 'BTC reaches $150k in 2025?', warrior1Id: 5, warrior1Owner: '0xb1c2d3e4f5a6978869574635241302100abcdef9', warrior2Id: 4, warrior2Owner: TEST_WALLET_ADDRESS, stakes: '100000000000000000000', warrior1Score: 0, warrior2Score: 0, status: 'pending', currentRound: 0 },
    { id: 'battle-004', externalMarketId: 'poly_agi_2026', source: 'polymarket', question: 'AGI achieved by end 2026?', warrior1Id: 2, warrior1Owner: '0xf1e2d3c4b5a6978869574635241302100abcdef0', warrior2Id: 3, warrior2Owner: '0xa9b8c7d6e5f4030210293847565748392010abcd', stakes: '60000000000000000000', warrior1Score: 92, warrior2Score: 88, status: 'completed', currentRound: 3, onChainBattleId: '3', txHash: '0x' + 'b'.repeat(64) },
    { id: 'battle-005', externalMarketId: 'kalshi_eth_3k', source: 'kalshi', question: 'ETH stays above $3k in Q2?', warrior1Id: 1, warrior1Owner: TEST_WALLET_ADDRESS, warrior2Id: 5, warrior2Owner: '0xb1c2d3e4f5a6978869574635241302100abcdef9', stakes: '40000000000000000000', warrior1Score: 65, warrior2Score: 50, status: 'active', currentRound: 2, onChainBattleId: '4' },
  ];

  for (const b of battles) {
    await prisma.predictionBattle.upsert({
      where: { id: b.id },
      create: b,
      update: b,
    });
    info(`battle ${b.id} — ${b.warrior1Id} vs ${b.warrior2Id} (${b.status})`);
  }
  pass(`${battles.length} battles upserted`);

  step('Seed PredictionRound rows for completed battles');
  const completed = battles.filter((b) => b.status === 'completed');
  let rounds = 0;
  for (const b of completed) {
    // Drop any prior rounds for this battle so reruns are deterministic.
    await prisma.predictionRound.deleteMany({ where: { battleId: b.id } });
    for (let r = 1; r <= 3; r++) {
      const w1 = Math.floor(b.warrior1Score / 3) + (r === 3 ? b.warrior1Score % 3 : 0);
      const w2 = Math.floor(b.warrior2Score / 3) + (r === 3 ? b.warrior2Score % 3 : 0);
      const moves = ['STRIKE', 'TAUNT', 'DODGE', 'SPECIAL', 'RECOVER'];
      await prisma.predictionRound.create({
        data: {
          battleId: b.id,
          roundNumber: r,
          w1Argument: `Round ${r} W1 argument backed by fundamentals + sentiment.`,
          w1Move: moves[r % moves.length],
          w1Confidence: 60 + r * 5,
          w1Score: w1,
          w2Argument: `Round ${r} W2 counter-argument citing technicals + macro.`,
          w2Move: moves[(r + 2) % moves.length],
          w2Confidence: 55 + r * 4,
          w2Score: w2,
          roundWinner: w1 > w2 ? 'warrior1' : w2 > w1 ? 'warrior2' : 'draw',
          judgeReasoning: 'Judged on argument coherence + evidence quality.',
        },
      });
      rounds++;
    }
  }
  pass(`${rounds} prediction rounds created`);

  step('Verify');
  const battleCount = await prisma.predictionBattle.count();
  const roundCount = await prisma.predictionRound.count();
  expectGte(battleCount, battles.length, 'PredictionBattle row count');
  expectGte(roundCount, rounds, 'PredictionRound row count');

  pass('Visit /prediction-arena — pending/active/completed tabs should each show entries');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(disconnect);
