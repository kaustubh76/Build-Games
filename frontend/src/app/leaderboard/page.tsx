'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { useArenaLeaderboard } from '@/hooks/arena';
import { formatEther } from 'viem';
import { formatTokenAmount } from '@/lib/format/blockchain';

type SortOption = 'rating' | 'wins' | 'earnings';

const TIER_COLORS: Record<string, string> = {
  UNRANKED: 'text-gray-400',
  BRONZE: 'text-orange-600',
  SILVER: 'text-gray-300',
  GOLD: 'text-yellow-400',
  PLATINUM: 'text-cyan-400',
  DIAMOND: 'text-purple-400',
};

function getTierFromRating(rating: number): string {
  if (rating >= 2000) return 'DIAMOND';
  if (rating >= 1600) return 'PLATINUM';
  if (rating >= 1400) return 'GOLD';
  if (rating >= 1200) return 'SILVER';
  if (rating >= 1000) return 'BRONZE';
  return 'UNRANKED';
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Skeleton for loading state
const LeaderboardSkeleton = () => (
  <div className="space-y-3">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="arcade-card p-4 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-slate-700 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-slate-700 rounded w-1/3" />
            <div className="h-3 bg-slate-700 rounded w-1/5" />
          </div>
          <div className="h-6 bg-slate-700 rounded w-16" />
        </div>
      </div>
    ))}
  </div>
);

export default function LeaderboardPage() {
  const { address, isConnected } = useAccount();
  const [sortBy, setSortBy] = useState<SortOption>('rating');
  const { leaderboard, loading, error, refetch } = useArenaLeaderboard(sortBy, 50);

  // Find user's warrior in leaderboard
  const userEntry = leaderboard.find((e) => e.warriorId !== undefined);

  return (
    <main className="container-arcade py-8 md:py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h1
          className="text-3xl md:text-4xl text-red-400 mb-4 tracking-wider arcade-glow"
          style={{ fontFamily: 'Press Start 2P, monospace' }}
        >
          LEADERBOARD
        </h1>
        <p
          className="text-slate-400 text-xs md:text-sm"
          style={{ fontFamily: 'Press Start 2P, monospace' }}
        >
          TOP WARRIORS IN THE ARENA
        </p>
      </div>

      {/* User Stats Card (if connected) */}
      {isConnected && (
        <div
          className="arcade-card p-6 mb-8 max-w-4xl mx-auto"
          style={{
            background: 'radial-gradient(circle at top left, rgba(220, 20, 60, 0.15), rgba(139, 0, 0, 0.1) 50%), linear-gradient(135deg, rgba(220, 20, 60, 0.1) 0%, rgba(139, 0, 0, 0.08) 30%, rgba(220, 20, 60, 0.1) 100%)',
            border: '2px solid rgba(220, 20, 60, 0.3)',
            backdropFilter: 'blur(20px)',
            borderRadius: '16px',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span
                className="text-gray-400 text-xs"
                style={{ fontFamily: 'Press Start 2P, monospace' }}
              >
                YOUR RANK
              </span>
              <p
                className="text-2xl text-white mt-1"
                style={{ fontFamily: 'Press Start 2P, monospace' }}
              >
                {userEntry ? `#${userEntry.rank}` : 'UNRANKED'}
              </p>
            </div>
            <Link
              href="/portfolio"
              className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
              style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '0.6rem' }}
            >
              VIEW PORTFOLIO
            </Link>
          </div>
        </div>
      )}

      {/* Sort Filters */}
      <div className="flex justify-center mb-8">
        <div className="flex bg-slate-800/60 rounded-lg p-1 border border-slate-700">
          {(['rating', 'wins', 'earnings'] as SortOption[]).map((option) => (
            <button
              key={option}
              onClick={() => setSortBy(option)}
              className={`px-4 py-2 rounded-md text-xs font-medium transition-all ${
                sortBy === option
                  ? 'bg-red-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
              style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '0.55rem' }}
            >
              {option === 'rating' ? 'RATING' : option === 'wins' ? 'WINS' : 'EARNINGS'}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="max-w-4xl mx-auto">
          <LeaderboardSkeleton />
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="text-center py-12 max-w-4xl mx-auto">
          <div className="arcade-card p-8" style={{ border: '2px solid rgba(239, 68, 68, 0.3)', borderRadius: '16px' }}>
            <p className="text-red-400 mb-4" style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '0.7rem' }}>
              FAILED TO LOAD LEADERBOARD
            </p>
            <button
              onClick={refetch}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
              style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '0.55rem' }}
            >
              RETRY
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && leaderboard.length === 0 && (
        <div className="text-center py-16 max-w-4xl mx-auto">
          <div
            className="arcade-card p-8"
            style={{
              background: 'radial-gradient(circle at top left, rgba(120, 160, 200, 0.15), rgba(100, 140, 180, 0.1) 50%)',
              border: '2px solid rgba(100, 116, 139, 0.3)',
              backdropFilter: 'blur(20px)',
              borderRadius: '16px',
            }}
          >
            <div className="text-5xl mb-4">&#x2694;&#xFE0F;</div>
            <h3
              className="text-lg text-yellow-400 mb-3 arcade-glow"
              style={{ fontFamily: 'Press Start 2P, monospace' }}
            >
              NO WARRIORS YET
            </h3>
            <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
              The leaderboard will be populated as warriors compete in the arena.
              Be the first to battle!
            </p>
            <Link
              href="/arena"
              className="inline-block px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '0.6rem' }}
            >
              ENTER ARENA
            </Link>
          </div>
        </div>
      )}

      {/* Top 3 Podium */}
      {!loading && leaderboard.length >= 3 && (
        <div className="flex justify-center items-end gap-4 mb-12 max-w-3xl mx-auto">
          {/* 2nd Place */}
          <div className="text-center flex-1">
            <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-3xl border-2 border-gray-400/30">
              &#x1F948;
            </div>
            <div
              className="arcade-card p-4"
              style={{ border: '2px solid rgba(192, 192, 192, 0.3)', borderRadius: '12px', backdropFilter: 'blur(20px)' }}
            >
              <p className="text-white text-sm font-medium truncate">
                Warrior #{leaderboard[1].warriorId}
              </p>
              <p className={`text-xs ${TIER_COLORS[getTierFromRating(leaderboard[1].arenaRating)]}`}>
                {getTierFromRating(leaderboard[1].arenaRating)}
              </p>
              <p className="text-lg text-yellow-400 font-bold mt-1">{leaderboard[1].arenaRating}</p>
              <p className="text-gray-400 text-xs">{leaderboard[1].wins}W - {leaderboard[1].losses}L</p>
            </div>
          </div>

          {/* 1st Place */}
          <div className="text-center flex-1 -mt-8">
            <div className="w-28 h-28 mx-auto mb-3 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-5xl shadow-lg shadow-yellow-500/30 border-2 border-yellow-400/50">
              &#x1F451;
            </div>
            <div
              className="arcade-card p-5"
              style={{
                background: 'radial-gradient(circle at top, rgba(255, 215, 0, 0.15), transparent 60%)',
                border: '2px solid rgba(255, 215, 0, 0.4)',
                borderRadius: '12px',
                backdropFilter: 'blur(20px)',
              }}
            >
              <p className="text-white font-bold truncate">
                Warrior #{leaderboard[0].warriorId}
              </p>
              <p className={`text-xs ${TIER_COLORS[getTierFromRating(leaderboard[0].arenaRating)]}`}>
                {getTierFromRating(leaderboard[0].arenaRating)}
              </p>
              <p className="text-2xl text-yellow-400 font-bold mt-1 arcade-glow">{leaderboard[0].arenaRating}</p>
              <p className="text-gray-400 text-xs">{leaderboard[0].wins}W - {leaderboard[0].losses}L</p>
            </div>
          </div>

          {/* 3rd Place */}
          <div className="text-center flex-1">
            <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center text-3xl border-2 border-amber-500/30">
              &#x1F949;
            </div>
            <div
              className="arcade-card p-4"
              style={{ border: '2px solid rgba(217, 119, 6, 0.3)', borderRadius: '12px', backdropFilter: 'blur(20px)' }}
            >
              <p className="text-white text-sm font-medium truncate">
                Warrior #{leaderboard[2].warriorId}
              </p>
              <p className={`text-xs ${TIER_COLORS[getTierFromRating(leaderboard[2].arenaRating)]}`}>
                {getTierFromRating(leaderboard[2].arenaRating)}
              </p>
              <p className="text-lg text-yellow-400 font-bold mt-1">{leaderboard[2].arenaRating}</p>
              <p className="text-gray-400 text-xs">{leaderboard[2].wins}W - {leaderboard[2].losses}L</p>
            </div>
          </div>
        </div>
      )}

      {/* Full Leaderboard Table */}
      {!loading && leaderboard.length > 0 && (
        <div
          className="max-w-4xl mx-auto arcade-card overflow-hidden"
          style={{
            border: '2px solid rgba(100, 116, 139, 0.3)',
            borderRadius: '16px',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-slate-800/50 text-slate-400 text-xs font-medium border-b border-slate-700/50">
            <div className="col-span-1">RANK</div>
            <div className="col-span-3">WARRIOR</div>
            <div className="col-span-2 text-center">W-L-D</div>
            <div className="col-span-2 text-center">WIN RATE</div>
            <div className="col-span-2 text-center">RATING</div>
            <div className="col-span-2 text-right">EARNINGS</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-slate-700/30">
            {leaderboard.map((entry, index) => {
              const tier = getTierFromRating(entry.arenaRating);
              const winRate = entry.totalBattles > 0
                ? ((entry.wins / entry.totalBattles) * 100).toFixed(0)
                : '0.0';
              const rank = entry.rank || index + 1;
              const rankIcons: Record<number, string> = { 1: '\u{1F947}', 2: '\u{1F948}', 3: '\u{1F949}' };

              return (
                <div
                  key={entry.warriorId}
                  className={`grid grid-cols-2 md:grid-cols-12 gap-2 md:gap-4 px-4 md:px-6 py-4 items-center hover:bg-slate-700/20 transition-colors ${
                    rank <= 3 ? 'bg-gradient-to-r from-yellow-900/5 to-transparent' : ''
                  }`}
                >
                  {/* Rank */}
                  <div className="md:col-span-1">
                    {rankIcons[rank] ? (
                      <span className="text-xl">{rankIcons[rank]}</span>
                    ) : (
                      <span className="text-slate-400 font-medium">#{rank}</span>
                    )}
                  </div>

                  {/* Warrior Info */}
                  <div className="md:col-span-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-red-500/30 to-yellow-500/30 rounded-full flex items-center justify-center border border-red-500/30 text-sm">
                        &#x2694;&#xFE0F;
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">Warrior #{entry.warriorId}</p>
                        <p className={`text-xs ${TIER_COLORS[tier]}`}>{tier}</p>
                      </div>
                    </div>
                  </div>

                  {/* Record */}
                  <div className="hidden md:block md:col-span-2 text-center">
                    <span className="text-green-400">{entry.wins}</span>
                    <span className="text-slate-500">-</span>
                    <span className="text-red-400">{entry.losses}</span>
                    <span className="text-slate-500">-</span>
                    <span className="text-yellow-400">{entry.draws}</span>
                  </div>

                  {/* Win Rate */}
                  <div className="hidden md:flex md:col-span-2 justify-center items-center gap-2">
                    <div className="w-14 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-emerald-400"
                        style={{ width: `${winRate}%` }}
                      />
                    </div>
                    <span className="text-white text-sm">{winRate}%</span>
                  </div>

                  {/* Rating */}
                  <div className="hidden md:block md:col-span-2 text-center">
                    <p className="text-yellow-400 font-bold">{entry.arenaRating}</p>
                  </div>

                  {/* Earnings */}
                  <div className="hidden md:block md:col-span-2 text-right">
                    <p className="text-red-400 font-medium text-sm">
                      {entry.totalEarnings && entry.totalEarnings !== '0'
                        ? `${formatTokenAmount(entry.totalEarnings)} CRwN`
                        : `${entry.wins} wins`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-700/30 bg-slate-800/30">
            <p className="text-slate-500 text-xs text-center">
              Showing top {leaderboard.length} warriors
            </p>
          </div>
        </div>
      )}

      {/* Rewards Info */}
      <div
        className="mt-12 max-w-4xl mx-auto arcade-card p-8"
        style={{
          background: 'radial-gradient(circle at top left, rgba(120, 160, 200, 0.15), rgba(100, 140, 180, 0.1) 50%)',
          border: '2px solid rgba(100, 116, 139, 0.3)',
          backdropFilter: 'blur(20px)',
          borderRadius: '16px',
        }}
      >
        <h2
          className="text-xl text-yellow-400 mb-6 text-center tracking-wider arcade-glow"
          style={{ fontFamily: 'Press Start 2P, monospace' }}
        >
          SEASONAL REWARDS
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-5 rounded-xl border border-yellow-500/30 bg-yellow-500/5">
            <div className="text-4xl mb-3">&#x1F947;</div>
            <h3
              className="text-sm text-yellow-400 mb-2"
              style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '0.6rem' }}
            >
              1ST PLACE
            </h3>
            <p className="text-xl font-bold text-white">1000 CRwN</p>
            <p className="text-slate-400 text-xs mt-1">+ Exclusive NFT Badge</p>
          </div>
          <div className="text-center p-5 rounded-xl border border-gray-400/30 bg-gray-400/5">
            <div className="text-4xl mb-3">&#x1F948;</div>
            <h3
              className="text-sm text-gray-300 mb-2"
              style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '0.6rem' }}
            >
              2ND PLACE
            </h3>
            <p className="text-xl font-bold text-white">500 CRwN</p>
            <p className="text-slate-400 text-xs mt-1">+ Rare NFT Badge</p>
          </div>
          <div className="text-center p-5 rounded-xl border border-amber-500/30 bg-amber-500/5">
            <div className="text-4xl mb-3">&#x1F949;</div>
            <h3
              className="text-sm text-amber-500 mb-2"
              style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '0.6rem' }}
            >
              3RD PLACE
            </h3>
            <p className="text-xl font-bold text-white">250 CRwN</p>
            <p className="text-slate-400 text-xs mt-1">+ NFT Badge</p>
          </div>
        </div>
        <p
          className="text-center text-slate-400 mt-6 text-xs"
          style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '0.5rem' }}
        >
          KEEP BATTLING TO CLIMB THE RANKS
        </p>
      </div>
    </main>
  );
}
