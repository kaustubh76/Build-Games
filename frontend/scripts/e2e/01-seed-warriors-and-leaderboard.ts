/**
 * Seed WarriorArenaStats + AIPredictionScore so /leaderboard renders rows.
 *
 * The on-chain warriors are already minted (token 1, 2 — see MEMORY.md).
 * This script populates the off-chain stats tables that the leaderboard
 * pages read. Idempotent via upserts keyed on warriorId / agentId.
 */
import './_lib/env';
import { getPrisma, disconnect } from './_lib/db';
import { step, pass, info, expectGte } from './_lib/expect';
import { TEST_WALLET_ADDRESS } from './_lib/env';

async function main(): Promise<void> {
  step('Seed WarriorArenaStats');
  const prisma = getPrisma();

  const warriors = [
    { warriorId: 1, totalBattles: 12, wins: 8, losses: 3, draws: 1, totalEarnings: '450000000000000000000', arenaRating: 1450, peakRating: 1480, currentStreak: 3, longestStreak: 5 },
    { warriorId: 2, totalBattles: 9, wins: 6, losses: 3, draws: 0, totalEarnings: '320000000000000000000', arenaRating: 1380, peakRating: 1420, currentStreak: 2, longestStreak: 4 },
    { warriorId: 3, totalBattles: 15, wins: 10, losses: 4, draws: 1, totalEarnings: '610000000000000000000', arenaRating: 1620, peakRating: 1650, currentStreak: 4, longestStreak: 6 },
    { warriorId: 4, totalBattles: 7, wins: 3, losses: 4, draws: 0, totalEarnings: '90000000000000000000', arenaRating: 1100, peakRating: 1180, currentStreak: 0, longestStreak: 2 },
    { warriorId: 5, totalBattles: 20, wins: 14, losses: 5, draws: 1, totalEarnings: '880000000000000000000', arenaRating: 1820, peakRating: 1850, currentStreak: 5, longestStreak: 7 },
  ];

  for (const w of warriors) {
    const avgScore = w.totalBattles > 0 ? (w.wins * 100) / w.totalBattles : 0;
    await prisma.warriorArenaStats.upsert({
      where: { warriorId: w.warriorId },
      create: { ...w, avgScore, categoryStats: JSON.stringify({ crypto: { wins: w.wins - 2, losses: w.losses }, sports: { wins: 2, losses: 0 } }) },
      update: { ...w, avgScore },
    });
    info(`warrior #${w.warriorId} → ${w.wins}W/${w.losses}L, rating ${w.arenaRating}`);
  }
  pass(`${warriors.length} warriors seeded`);

  step('Seed AIPredictionScore (powers /api/leaderboard)');
  const agents = [
    { agentId: 'agent-001', agentAddress: TEST_WALLET_ADDRESS, totalPredictions: 25, correctPredictions: 18, totalStaked: '1500000000000000000000', totalReturns: '2200000000000000000000', currentStreak: 4, longestStreak: 6 },
    { agentId: 'agent-002', agentAddress: '0x1234567890123456789012345678901234567890', totalPredictions: 18, correctPredictions: 11, totalStaked: '900000000000000000000', totalReturns: '1100000000000000000000', currentStreak: 2, longestStreak: 4 },
    { agentId: 'agent-003', agentAddress: '0x2345678901234567890123456789012345678901', totalPredictions: 32, correctPredictions: 26, totalStaked: '2400000000000000000000', totalReturns: '3800000000000000000000', currentStreak: 8, longestStreak: 10 },
    { agentId: 'agent-004', agentAddress: '0x3456789012345678901234567890123456789012', totalPredictions: 12, correctPredictions: 5, totalStaked: '600000000000000000000', totalReturns: '450000000000000000000', currentStreak: 0, longestStreak: 2 },
    { agentId: 'agent-005', agentAddress: '0x4567890123456789012345678901234567890123', totalPredictions: 41, correctPredictions: 31, totalStaked: '3100000000000000000000', totalReturns: '4900000000000000000000', currentStreak: 6, longestStreak: 9 },
  ];

  for (const a of agents) {
    const accuracy = a.totalPredictions > 0 ? (a.correctPredictions * 100) / a.totalPredictions : 0;
    const stakedNum = Number(a.totalStaked);
    const returnsNum = Number(a.totalReturns);
    const roi = stakedNum > 0 ? ((returnsNum - stakedNum) / stakedNum) * 100 : 0;
    const tier = accuracy >= 80 ? 'diamond' : accuracy >= 70 ? 'gold' : accuracy >= 60 ? 'silver' : 'bronze';
    await prisma.aIPredictionScore.upsert({
      where: { agentId: a.agentId },
      create: { ...a, accuracy, roi, tier },
      update: { ...a, accuracy, roi, tier },
    });
    info(`${a.agentId} → ${a.correctPredictions}/${a.totalPredictions} (${accuracy.toFixed(1)}%, ROI ${roi.toFixed(1)}%)`);
  }
  pass(`${agents.length} AI scores seeded`);

  step('Verify Prisma rows exist');
  const warriorCount = await prisma.warriorArenaStats.count();
  const agentCount = await prisma.aIPredictionScore.count();
  expectGte(warriorCount, warriors.length, 'WarriorArenaStats row count');
  expectGte(agentCount, agents.length, 'AIPredictionScore row count');

  pass('Visit /leaderboard, /arena (top warriors should now render)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(disconnect);
