/**
 * Seed Creator + CreatorFeeEntry rows so /creator-dashboard shows revenue.
 *
 * The TEST wallet is the focal creator — totals/tier/fees aggregate up to
 * what the dashboard expects. Other creators added so leaderboards have
 * something to compare against.
 */
import './_lib/env';
import { getPrisma, disconnect } from './_lib/db';
import { step, pass, info, expectGte } from './_lib/expect';
import { TEST_WALLET_ADDRESS } from './_lib/env';

async function main(): Promise<void> {
  step('Seed Creator rows');
  const prisma = getPrisma();

  const creators = [
    { address: TEST_WALLET_ADDRESS, type: 'market', tier: 'gold', totalVolumeGenerated: '850000000000000000000000', totalFeesEarned: '8500000000000000000000', pendingRewards: '1200000000000000000000', totalClaimed: '7300000000000000000000', marketsCreated: 14, warriorsCreated: 3, agentsOperated: 2 },
    { address: '0xf1e2d3c4b5a6978869574635241302100abcdef0', type: 'market', tier: 'diamond', totalVolumeGenerated: '2400000000000000000000000', totalFeesEarned: '24000000000000000000000', pendingRewards: '3000000000000000000000', totalClaimed: '21000000000000000000000', marketsCreated: 41, warriorsCreated: 8, agentsOperated: 5 },
    { address: '0xa9b8c7d6e5f4030210293847565748392010abcd', type: 'warrior', tier: 'silver', totalVolumeGenerated: '320000000000000000000000', totalFeesEarned: '3200000000000000000000', pendingRewards: '500000000000000000000', totalClaimed: '2700000000000000000000', marketsCreated: 6, warriorsCreated: 12, agentsOperated: 1 },
    { address: '0xb1c2d3e4f5a6978869574635241302100abcdef9', type: 'agent', tier: 'bronze', totalVolumeGenerated: '85000000000000000000000', totalFeesEarned: '850000000000000000000', pendingRewards: '120000000000000000000', totalClaimed: '730000000000000000000', marketsCreated: 2, warriorsCreated: 0, agentsOperated: 4 },
  ];

  for (const c of creators) {
    await prisma.creator.upsert({
      where: { address: c.address },
      create: c,
      update: { ...c, updatedAt: new Date() },
    });
    info(`creator ${c.address.slice(0, 8)}… (${c.tier}) — ${c.marketsCreated} markets`);
  }
  pass(`${creators.length} creators upserted`);

  step('Seed CreatorFeeEntry rows (recent fee history)');
  const feeEntries: Array<Parameters<typeof prisma.creatorFeeEntry.create>[0]['data']> = [];
  const baseTime = Date.now();
  for (let i = 0; i < 12; i++) {
    feeEntries.push({
      creatorAddress: TEST_WALLET_ADDRESS,
      marketId: `market-${100 + i}`,
      tradeVolume: String(BigInt(50 + i * 10) * BigInt(10) ** BigInt(18)),
      feeAmount: String(BigInt(5 + i) * BigInt(10) ** BigInt(17)),
      traderAddress: `0x${(i + 1).toString(16).padStart(40, '0')}`,
      txHash: `0x${'1'.repeat(63)}${i.toString(16)}`,
      source: i % 3 === 0 ? 'warrior_battle' : i % 3 === 1 ? 'market_trade' : 'agent_trade',
      createdAt: new Date(baseTime - i * 1000 * 60 * 60 * 4),
    });
  }
  await prisma.creatorFeeEntry.createMany({ data: feeEntries });
  pass(`${feeEntries.length} fee entries inserted`);

  step('Verify');
  const cCount = await prisma.creator.count();
  const feeCount = await prisma.creatorFeeEntry.count({ where: { creatorAddress: TEST_WALLET_ADDRESS } });
  expectGte(cCount, creators.length, 'Creator row count');
  expectGte(feeCount, feeEntries.length, 'CreatorFeeEntry row count for test wallet');

  pass(`Visit /creator-dashboard signed in as ${TEST_WALLET_ADDRESS} — totals + recent fees should render`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(disconnect);
