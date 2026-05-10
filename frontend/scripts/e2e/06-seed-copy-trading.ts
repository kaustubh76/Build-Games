/**
 * Seed WhaleFollow + MirrorCopyTrade rows so /social/copy-trading renders.
 *
 * Test wallet follows two whales; one follow has executed mirror trades.
 */
import './_lib/env';
import { getPrisma, disconnect } from './_lib/db';
import { step, pass, info, expectGte } from './_lib/expect';
import { TEST_WALLET_ADDRESS } from './_lib/env';

async function main(): Promise<void> {
  step('Seed WhaleFollow rows');
  const prisma = getPrisma();

  const follows = [
    { userId: TEST_WALLET_ADDRESS, userAddress: TEST_WALLET_ADDRESS, whaleAddress: '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678', config: JSON.stringify({ maxCopyAmount: '10000', copyPercentage: 5, enabledSources: ['polymarket'], autoMirror: true }), isActive: true },
    { userId: TEST_WALLET_ADDRESS, userAddress: TEST_WALLET_ADDRESS, whaleAddress: '0xc3d4e5f60718293a4b5c6d7e8f90123456789ab0', config: JSON.stringify({ maxCopyAmount: '5000', copyPercentage: 10, enabledSources: ['kalshi'], autoMirror: false }), isActive: true },
    { userId: TEST_WALLET_ADDRESS, userAddress: TEST_WALLET_ADDRESS, whaleAddress: '0xb2c3d4e5f6071829304a5b6c7d8e9f0123456789', config: JSON.stringify({ maxCopyAmount: '2000', copyPercentage: 3, enabledSources: ['polymarket'], autoMirror: false }), isActive: false },
  ];

  for (const f of follows) {
    await prisma.whaleFollow.upsert({
      where: { userAddress_whaleAddress: { userAddress: f.userAddress, whaleAddress: f.whaleAddress } },
      create: f,
      update: { config: f.config, isActive: f.isActive },
    });
    info(`follow ${f.whaleAddress.slice(0, 10)}… active=${f.isActive}`);
  }
  pass(`${follows.length} whale follows upserted`);

  step('Seed MirrorCopyTrade execution log');
  const trades = [
    { userId: TEST_WALLET_ADDRESS, whaleAddress: '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678', originalTradeId: 'whale-trade-001', mirrorKey: 'will-trump-win-2024:yes', outcome: 'yes', copyAmount: '500000000000000000000', status: 'completed', txHash: '0x' + '1'.repeat(64) },
    { userId: TEST_WALLET_ADDRESS, whaleAddress: '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678', originalTradeId: 'whale-trade-002', mirrorKey: 'btc-150k-2025:no', outcome: 'no', copyAmount: '250000000000000000000', status: 'completed', txHash: '0x' + '2'.repeat(64) },
    { userId: TEST_WALLET_ADDRESS, whaleAddress: '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678', originalTradeId: 'whale-trade-003', mirrorKey: 'ai-agi-2026:no', outcome: 'no', copyAmount: '750000000000000000000', status: 'completed', txHash: '0x' + '3'.repeat(64) },
    { userId: TEST_WALLET_ADDRESS, whaleAddress: '0xc3d4e5f60718293a4b5c6d7e8f90123456789ab0', originalTradeId: 'whale-trade-004', mirrorKey: 'fed-march-cut:yes', outcome: 'yes', copyAmount: '180000000000000000000', status: 'pending' },
    { userId: TEST_WALLET_ADDRESS, whaleAddress: '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678', originalTradeId: 'whale-trade-005', mirrorKey: 'super-bowl-winner:no', outcome: 'no', copyAmount: '320000000000000000000', status: 'failed' },
  ];

  for (const t of trades) {
    await prisma.mirrorCopyTrade.create({ data: t });
    info(`mirror ${t.outcome.toUpperCase()} ${t.mirrorKey} (${t.status})`);
  }
  pass(`${trades.length} mirror copy trades inserted`);

  step('Verify');
  const fCount = await prisma.whaleFollow.count({ where: { userAddress: TEST_WALLET_ADDRESS } });
  const tCount = await prisma.mirrorCopyTrade.count({ where: { userId: TEST_WALLET_ADDRESS } });
  expectGte(fCount, follows.length, 'WhaleFollow rows for test wallet');
  expectGte(tCount, trades.length, 'MirrorCopyTrade rows for test wallet');

  pass(`Visit /social/copy-trading signed in as ${TEST_WALLET_ADDRESS} — follows + history populate`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(disconnect);
