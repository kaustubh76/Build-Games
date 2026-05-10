/**
 * Seed AIDebate + AIDebateRound + MarketComment rows for /markets/debate.
 *
 * Mix of in-progress and completed debates; comments on resolved markets.
 */
import './_lib/env';
import { getPrisma, disconnect } from './_lib/db';
import { step, pass, info, expectGte } from './_lib/expect';
import { TEST_WALLET_ADDRESS } from './_lib/env';

async function main(): Promise<void> {
  step('Seed AIDebate rows');
  const prisma = getPrisma();

  const debates = [
    { id: 'debate-001', marketId: 'poly_trump_2024', question: 'Will Trump win the 2024 election?', source: 'polymarket', predictedOutcome: 'yes', probability: 5400, confidence: 78, keyFactors: JSON.stringify(['polling momentum', 'incumbent disadvantage', 'historical patterns']), sources: JSON.stringify(['polling-aggregate', 'fivethirtyeight', 'wsj']), status: 'completed' },
    { id: 'debate-002', marketId: 'poly_btc_150k_2025', question: 'BTC reaches $150k by end 2025?', source: 'polymarket', predictedOutcome: 'no', probability: 3800, confidence: 65, keyFactors: JSON.stringify(['halving cycle', 'macro headwinds', 'institutional adoption']), sources: JSON.stringify(['glassnode', 'arkham', 'cryptoquant']), status: 'completed' },
    { id: 'debate-003', marketId: 'kalshi_fed_march', question: 'Fed cut rates March 2026?', source: 'kalshi', predictedOutcome: 'no', probability: 6700, confidence: 72, keyFactors: JSON.stringify(['CPI trend', 'unemployment data', 'fed minutes']), sources: JSON.stringify(['fred', 'bls', 'fomc-minutes']), status: 'completed' },
    { id: 'debate-004', marketId: 'poly_ai_agi_2026', question: 'AGI achieved by end 2026?', source: 'polymarket', status: 'in_progress' },
  ];

  for (const d of debates) {
    await prisma.aIDebate.upsert({ where: { id: d.id }, create: d, update: d });
    info(`debate "${d.question.slice(0, 45)}…" → ${d.status}${d.predictedOutcome ? ` (${d.predictedOutcome.toUpperCase()})` : ''}`);
  }
  pass(`${debates.length} debates upserted`);

  step('Seed AIDebateRound rows for completed debates');
  let roundCount = 0;
  for (const d of debates.filter((x) => x.status === 'completed')) {
    await prisma.aIDebateRound.deleteMany({ where: { debateId: d.id } });
    const roles: Array<{ role: string; arg: string; conf: number }> = [
      { role: 'bull', arg: 'YES side: market sentiment + recent price action support outcome.', conf: 75 },
      { role: 'bear', arg: 'NO side: macro headwinds + base rate suggest the opposite.', conf: 70 },
      { role: 'neutral', arg: 'Both sides have merit; uncertainty centers on timing rather than direction.', conf: 60 },
      { role: 'supervisor', arg: 'Aggregating arguments — bull case slightly stronger on weight of evidence.', conf: 80 },
    ];
    for (let i = 0; i < roles.length; i++) {
      await prisma.aIDebateRound.create({
        data: {
          debateId: d.id,
          roundNumber: i + 1,
          agentRole: roles[i].role,
          argument: roles[i].arg,
          sources: JSON.stringify(['source-1', 'source-2']),
          confidence: roles[i].conf,
        },
      });
      roundCount++;
    }
  }
  pass(`${roundCount} debate rounds created`);

  step('Seed MarketComment rows');
  const comments = [
    { marketId: 'poly_trump_2024', marketSource: 'polymarket', userAddress: TEST_WALLET_ADDRESS, content: 'Polling momentum is undeniable. YES looks underpriced at current levels.' },
    { marketId: 'poly_btc_150k_2025', marketSource: 'polymarket', userAddress: TEST_WALLET_ADDRESS, content: 'Halving math says we get there but timing is the question. Risk-managed YES.' },
    { marketId: 'poly_btc_150k_2025', marketSource: 'polymarket', userAddress: '0xf1e2d3c4b5a6978869574635241302100abcdef0', content: 'Disagree — macro liquidity is tight. NO until we see rate cuts.' },
    { marketId: 'kalshi_fed_march', marketSource: 'kalshi', userAddress: '0xa9b8c7d6e5f4030210293847565748392010abcd', content: 'Powell has been very clear about wanting more data. NO is heavy favorite.' },
    { marketId: 'poly_ai_agi_2026', marketSource: 'polymarket', userAddress: TEST_WALLET_ADDRESS, content: 'Definition of AGI is the entire battle here. Market is overpriced on YES.' },
  ];

  for (const c of comments) {
    await prisma.marketComment.create({ data: c });
    info(`comment on ${c.marketId}`);
  }
  pass(`${comments.length} comments inserted`);

  step('Verify');
  const debateCount = await prisma.aIDebate.count();
  const commentCount = await prisma.marketComment.count();
  expectGte(debateCount, debates.length, 'AIDebate row count');
  expectGte(commentCount, comments.length, 'MarketComment row count');

  pass('Visit /markets/debate — debate cards + comment threads should render');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(disconnect);
