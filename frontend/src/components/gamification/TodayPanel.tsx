'use client';

import { useStreak } from '@/hooks/useStreak';
import { useDailyQuests } from '@/hooks/useDailyQuests';
import { useAchievements } from '@/hooks/useAchievements';
import Link from 'next/link';

/**
 * TodayPanel — compact retention surface for the home page.
 *
 * Shows:
 *  - Login & win streaks (with "fire" emoji at milestones)
 *  - Daily quest progress (X of Y complete, time until reset)
 *  - Total XP available today
 *
 * No data fetches; reads from existing client-side gamification stores.
 */
export function TodayPanel() {
  const { streaks, getWinStreakLevel } = useStreak();
  const {
    quests,
    timeUntilReset,
    totalXPAvailable,
    totalXPClaimed,
  } = useDailyQuests();
  const { unlockedAchievements, allAchievements, totalXP } = useAchievements();

  const completed = quests.filter((q) => q.isComplete).length;
  const claimedCount = quests.filter((q) => q.claimed).length;
  const winLevel = getWinStreakLevel();
  const winEmoji =
    winLevel === 'legendary'
      ? '🌟'
      : winLevel === 'blazing'
      ? '⚡️'
      : winLevel === 'fire'
      ? '🔥'
      : winLevel === 'hot'
      ? '🌶️'
      : '⚔️';

  // Most recent achievement, plus a fallback "next to unlock" hint when empty.
  const latestAchievement = unlockedAchievements
    .slice()
    .sort((a, b) => b.unlockedAt - a.unlockedAt)[0];
  const totalAchievementsCount = allAchievements.length;
  const unlockedCount = unlockedAchievements.length;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-yellow-500/10 via-orange-500/10 to-red-500/10 border border-yellow-500/30 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-yellow-300 tracking-wider">TODAY</h3>
        <div className="text-xs text-gray-400">resets in {timeUntilReset || '—'}</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-black/20 border border-orange-500/20">
          <div className="text-xs text-gray-400 mb-1">Login streak</div>
          <div className="text-2xl font-bold text-orange-300">
            🗓️ {streaks.currentLoginStreak} <span className="text-xs text-gray-500">/ {streaks.bestLoginStreak} best</span>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-black/20 border border-red-500/20">
          <div className="text-xs text-gray-400 mb-1">Win streak</div>
          <div className="text-2xl font-bold text-red-300">
            {winEmoji} {streaks.currentWinStreak} <span className="text-xs text-gray-500">/ {streaks.bestWinStreak} best</span>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-black/20 border border-yellow-500/20">
          <div className="text-xs text-gray-400 mb-1">Daily quests</div>
          <div className="text-2xl font-bold text-yellow-300">
            ✅ {completed} <span className="text-xs text-gray-500">/ {quests.length}</span>
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {totalXPClaimed} / {totalXPAvailable} XP claimed
            {claimedCount < completed && (
              <span className="ml-1 text-green-400">· {completed - claimedCount} unclaimed</span>
            )}
          </div>
        </div>
      </div>

      {/* Achievements row */}
      <div className="mt-3 p-3 rounded-lg bg-black/20 border border-purple-500/20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl shrink-0">{latestAchievement?.achievement.icon ?? '🏆'}</span>
            <div className="min-w-0">
              <div className="text-xs text-gray-400">
                {latestAchievement ? 'Latest achievement' : 'Achievements'}
              </div>
              <div className="text-sm font-bold text-purple-200 truncate">
                {latestAchievement?.achievement.name ?? `${unlockedCount} of ${totalAchievementsCount} unlocked`}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-gray-500">Total XP</div>
            <div className="text-sm font-bold text-yellow-300">{totalXP}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-gray-400">
          {quests.length > 0 ? `Trade, predict, mirror — earn XP and CRwN.` : 'No quests yet for today.'}
        </div>
        <Link
          href="/leaderboard"
          className="px-3 py-1 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-200 text-xs font-semibold"
        >
          Leaderboard →
        </Link>
      </div>
    </div>
  );
}

export default TodayPanel;
