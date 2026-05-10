/**
 * Seed ExternalMarket + ArbitrageOpportunity rows for /external and /markets.
 *
 * These mirror what the polymarket/kalshi sync routines normally produce.
 * Real syncs will overwrite by id; we just guarantee non-empty initial state.
 */
import './_lib/env';
import { getPrisma, disconnect } from './_lib/db';
import { step, pass, info, expectGte } from './_lib/expect';

async function main(): Promise<void> {
  step('Seed ExternalMarket rows');
  const prisma = getPrisma();

  const markets = [
    { id: 'poly_trump_2024', source: 'polymarket', externalId: 'trump-2024', question: 'Will Trump win the 2024 election?', description: 'Resolves YES if Trump wins the November 2024 US presidential election.', category: 'Politics', tags: JSON.stringify(['election', 'us-politics']), yesPrice: 5200, noPrice: 4800, volume: '124000000', liquidity: '8500000', endTime: new Date('2024-11-06'), status: 'resolved', outcome: 'yes', sourceUrl: 'https://polymarket.com/event/trump-2024' },
    { id: 'poly_btc_150k_2025', source: 'polymarket', externalId: 'btc-150k-2025', question: 'BTC reaches $150k by end of 2025?', category: 'Crypto', tags: JSON.stringify(['bitcoin', 'crypto']), yesPrice: 4100, noPrice: 5900, volume: '45000000', liquidity: '3200000', endTime: new Date('2025-12-31'), status: 'active', sourceUrl: 'https://polymarket.com/event/btc-150k' },
    { id: 'kalshi_fed_march', source: 'kalshi', externalId: 'FED-MARCH-CUT', question: 'Will the Fed cut rates in March 2026?', category: 'Economics', tags: JSON.stringify(['fed', 'rates']), yesPrice: 3500, noPrice: 6500, volume: '8200000', liquidity: '950000', endTime: new Date('2026-03-31'), status: 'active', sourceUrl: 'https://kalshi.com/markets/FED-MARCH-CUT' },
    { id: 'poly_ai_agi_2026', source: 'polymarket', externalId: 'agi-2026', question: 'Will AGI be achieved by end of 2026?', category: 'Tech', tags: JSON.stringify(['ai', 'agi']), yesPrice: 800, noPrice: 9200, volume: '12000000', liquidity: '1100000', endTime: new Date('2026-12-31'), status: 'active', sourceUrl: 'https://polymarket.com/event/agi-2026' },
    { id: 'kalshi_eth_3k', source: 'kalshi', externalId: 'ETH-3K-Q2', question: 'Will ETH stay above $3k throughout Q2 2026?', category: 'Crypto', tags: JSON.stringify(['ethereum', 'crypto']), yesPrice: 6700, noPrice: 3300, volume: '5400000', liquidity: '720000', endTime: new Date('2026-06-30'), status: 'active', sourceUrl: 'https://kalshi.com/markets/ETH-3K-Q2' },
    { id: 'poly_super_bowl', source: 'polymarket', externalId: 'super-bowl-2026', question: 'Will the Chiefs win Super Bowl 2026?', category: 'Sports', tags: JSON.stringify(['nfl', 'super-bowl']), yesPrice: 2400, noPrice: 7600, volume: '32000000', liquidity: '2800000', endTime: new Date('2026-02-08'), status: 'active', sourceUrl: 'https://polymarket.com/event/super-bowl-2026' },
  ];

  for (const m of markets) {
    await prisma.externalMarket.upsert({
      where: { id: m.id },
      create: m,
      update: { yesPrice: m.yesPrice, noPrice: m.noPrice, volume: m.volume, liquidity: m.liquidity, status: m.status, lastSyncAt: new Date() },
    });
    info(`${m.source} "${m.question.slice(0, 45)}…" yes=${m.yesPrice / 100}%`);
  }
  pass(`${markets.length} external markets upserted`);

  step('Seed ArbitrageOpportunity rows');
  const arbitrages = [
    { market1Source: 'polymarket', market1Id: 'poly_trump_2024', market1Question: 'Trump 2024?', market1YesPrice: 5200, market1NoPrice: 4800, market2Source: 'kalshi', market2Id: 'kalshi_pres_2024', market2Question: 'US Pres Trump 2024?', market2YesPrice: 5350, market2NoPrice: 4650, spread: 150, potentialProfit: 1.5, confidence: 0.92, status: 'active', expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) },
    { market1Source: 'polymarket', market1Id: 'poly_btc_150k_2025', market1Question: 'BTC $150k 2025?', market1YesPrice: 4100, market1NoPrice: 5900, market2Source: 'kalshi', market2Id: 'kalshi_btc_150k', market2Question: 'BTC reach 150K 2025?', market2YesPrice: 4350, market2NoPrice: 5650, spread: 250, potentialProfit: 2.5, confidence: 0.88, status: 'active', expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14) },
    { market1Source: 'polymarket', market1Id: 'poly_ai_agi_2026', market1Question: 'AGI 2026?', market1YesPrice: 800, market1NoPrice: 9200, market2Source: 'kalshi', market2Id: 'kalshi_agi', market2Question: 'AGI achieved 2026?', market2YesPrice: 950, market2NoPrice: 9050, spread: 150, potentialProfit: 1.5, confidence: 0.81, status: 'active', expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60) },
  ];

  for (const a of arbitrages) {
    await prisma.arbitrageOpportunity.create({ data: a });
    info(`${a.market1Question} ↔ ${a.market2Question} — ${a.spread / 100}% spread, ${(a.confidence * 100).toFixed(0)}% conf`);
  }
  pass(`${arbitrages.length} arbitrage opportunities inserted`);

  step('Verify');
  const mCount = await prisma.externalMarket.count();
  const arbCount = await prisma.arbitrageOpportunity.count();
  expectGte(mCount, markets.length, 'ExternalMarket row count');
  expectGte(arbCount, arbitrages.length, 'ArbitrageOpportunity row count');

  pass('Visit /external — markets list + arbitrage tab should render');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(disconnect);
