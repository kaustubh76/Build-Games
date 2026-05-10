/**
 * Seed WhaleTrade + TrackedTrader rows so /whale-tracker shows data.
 *
 * The whale-alerts API reads the WhaleTrade table directly, so seeding
 * here is the right move — no chain interaction needed for the page to
 * populate. Real whale events from the indexer will append on top.
 */
import './_lib/env';
import { getPrisma, disconnect } from './_lib/db';
import { step, pass, info, expectGte } from './_lib/expect';

async function main(): Promise<void> {
  step('Seed WhaleTrade rows');
  const prisma = getPrisma();

  const now = Date.now();
  const trades = [
    { source: 'polymarket', marketId: 'will-trump-win-2024', marketQuestion: 'Will Trump win the 2024 election?', traderAddress: '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678', side: 'buy', outcome: 'yes', amountUsd: '125000', shares: '250000', price: 5000, timestamp: new Date(now - 1000 * 60 * 5), txHash: '0x' + 'a'.repeat(64) },
    { source: 'polymarket', marketId: 'btc-150k-2025', marketQuestion: 'Will BTC reach $150k by end of 2025?', traderAddress: '0xb2c3d4e5f6071829304a5b6c7d8e9f0123456789', side: 'buy', outcome: 'no', amountUsd: '85000', shares: '170000', price: 5000, timestamp: new Date(now - 1000 * 60 * 12), txHash: '0x' + 'b'.repeat(64) },
    { source: 'kalshi', marketId: 'fed-rate-cut-march', marketQuestion: 'Will Fed cut rates in March?', traderAddress: '0xc3d4e5f60718293a4b5c6d7e8f90123456789ab0', side: 'sell', outcome: 'yes', amountUsd: '50000', shares: '100000', price: 5000, timestamp: new Date(now - 1000 * 60 * 30), txHash: '0x' + 'c'.repeat(64) },
    { source: 'polymarket', marketId: 'ai-agi-2026', marketQuestion: 'Will AGI be achieved by end of 2026?', traderAddress: '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678', side: 'buy', outcome: 'no', amountUsd: '200000', shares: '400000', price: 5000, timestamp: new Date(now - 1000 * 60 * 45), txHash: '0x' + 'd'.repeat(64) },
    { source: 'kalshi', marketId: 'eth-merge-q2', marketQuestion: 'Will ETH stay above $3k in Q2?', traderAddress: '0xd4e5f6071829304a5b6c7d8e9f0123456789abc1', side: 'buy', outcome: 'yes', amountUsd: '95000', shares: '190000', price: 5000, timestamp: new Date(now - 1000 * 60 * 60), txHash: '0x' + 'e'.repeat(64) },
    { source: 'polymarket', marketId: 'super-bowl-winner', marketQuestion: 'Will Chiefs win Super Bowl?', traderAddress: '0xe5f6071829304a5b6c7d8e9f0123456789abcdef', side: 'sell', outcome: 'yes', amountUsd: '70000', shares: '140000', price: 5000, timestamp: new Date(now - 1000 * 60 * 90), txHash: '0x' + 'f'.repeat(64) },
  ];

  for (const t of trades) {
    await prisma.whaleTrade.create({ data: t });
    info(`${t.source} ${t.side} ${t.outcome} $${t.amountUsd} on "${t.marketQuestion.slice(0, 40)}…"`);
  }
  pass(`${trades.length} whale trades inserted`);

  step('Seed TrackedTrader rows');
  const traders = [
    { address: '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'polymarket', alias: 'CryptoWhale', totalVolume: '5400000', winRate: 0.68, followers: 142, isWhale: true },
    { address: '0xb2c3d4e5f6071829304a5b6c7d8e9f0123456789', source: 'polymarket', alias: 'DegenKing', totalVolume: '3200000', winRate: 0.55, followers: 89, isWhale: true },
    { address: '0xc3d4e5f60718293a4b5c6d7e8f90123456789ab0', source: 'kalshi', alias: 'RatePredictor', totalVolume: '1800000', winRate: 0.72, followers: 67, isWhale: true },
    { address: '0xd4e5f6071829304a5b6c7d8e9f0123456789abc1', source: 'kalshi', alias: 'EthMaxi', totalVolume: '2100000', winRate: 0.61, followers: 53, isWhale: true },
  ];

  for (const t of traders) {
    await prisma.trackedTrader.upsert({
      where: { source_address: { source: t.source, address: t.address } },
      create: t,
      update: { totalVolume: t.totalVolume, winRate: t.winRate, followers: t.followers, isWhale: t.isWhale },
    });
    info(`${t.alias} (${t.source}) — ${t.followers} followers, ${(t.winRate * 100).toFixed(0)}% win rate`);
  }
  pass(`${traders.length} tracked traders upserted`);

  step('Verify');
  const whaleCount = await prisma.whaleTrade.count();
  const traderCount = await prisma.trackedTrader.count();
  expectGte(whaleCount, trades.length, 'WhaleTrade row count');
  expectGte(traderCount, traders.length, 'TrackedTrader row count');

  pass('Visit /whale-tracker — recent whale trades + leaderboard should render');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(disconnect);
