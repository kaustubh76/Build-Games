'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { WhaleAlertFeed } from '@/components/whale/WhaleAlertFeed';
import { WhaleAlertCard } from '@/components/whale/WhaleAlertCard';
import { TrackedTradersList } from '@/components/whale/TrackedTradersList';
import { DataState } from '@/components/common/DataState';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  useWhaleHistory,
  useTrackedTraders,
  useWhaleStats,
  useHotMarkets,
  useTopWhales,
} from '@/hooks/useWhaleAlerts';
import { MarketSource, TrackedTrader } from '@/types/externalMarket';

type Tab = 'live' | 'history' | 'traders';

// Helper functions for formatting
function formatVolume(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(0)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(0)}%`;
}

function shortenAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function WhaleTrackerPage() {
  const [activeTab, setActiveTab] = useState<Tab>('live');
  const [sourceFilter, setSourceFilter] = useState<MarketSource | ''>('');
  const [selectedTrader, setSelectedTrader] = useState<TrackedTrader | null>(null);

  const {
    trades: historicalTrades,
    loading: historyLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useWhaleHistory(50, sourceFilter || undefined);

  const { traders } = useTrackedTraders();
  const { stats, loading: statsLoading } = useWhaleStats();
  const { hotMarkets, loading: hotMarketsLoading } = useHotMarkets(5);
  const { topWhales, loading: topWhalesLoading } = useTopWhales(5);

  return (
    <div className="min-h-screen">
      <div className="container-arcade py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/markets" className="text-slate-400 hover:text-white text-sm">
              ← Back to Markets
            </Link>
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1
                className="text-2xl md:text-3xl text-red-400 mb-2 tracking-wider arcade-glow"
                style={{ fontFamily: 'Press Start 2P, monospace' }}
              >
                WHALE TRACKER
              </h1>
              <p className="text-slate-400 text-sm">
                Monitor large trades on Polymarket and Kalshi in real-time
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/portfolio/risk"
                className="px-3 py-1.5 rounded-lg bg-fuchsia-600/20 hover:bg-fuchsia-600/40 border border-fuchsia-500/40 text-fuchsia-300 text-sm font-medium"
              >
                🛡️ Risk Dashboard
              </Link>
              <span className="text-slate-400 text-sm">
                {stats?.trackedTraderCount ?? traders.length} traders tracked
              </span>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="24h Whale Volume"
            value={statsLoading ? '...' : formatVolume(stats?.totalVolume24h ?? 0)}
            change={stats?.volumeChange24h !== undefined ? formatChange(stats.volumeChange24h) : undefined}
            icon="💰"
            positive={stats?.volumeChange24h !== undefined ? stats.volumeChange24h >= 0 : undefined}
            loading={statsLoading}
          />
          <StatCard
            label="Large Trades (24h)"
            value={statsLoading ? '...' : (stats?.tradeCount24h ?? 0).toString()}
            change={stats?.tradeCountChange !== undefined ? formatChange(stats.tradeCountChange) : undefined}
            icon="📊"
            positive={stats?.tradeCountChange !== undefined ? stats.tradeCountChange >= 0 : undefined}
            loading={statsLoading}
          />
          <StatCard
            label="Tracked Whales"
            value={(stats?.trackedTraderCount ?? traders.length).toString()}
            icon="👀"
            loading={statsLoading}
          />
          <StatCard
            label="Avg Trade Size"
            value={statsLoading ? '...' : formatVolume(stats?.avgTradeSize ?? 0)}
            change={stats?.avgTradeSizeChange !== undefined ? formatChange(stats.avgTradeSizeChange) : undefined}
            icon="📈"
            positive={stats?.avgTradeSizeChange !== undefined ? stats.avgTradeSizeChange >= 0 : undefined}
            loading={statsLoading}
          />
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-700 mb-6">
          <nav className="flex gap-6">
            {[
              { id: 'live' as Tab, label: 'Live Feed', icon: '🔴' },
              { id: 'history' as Tab, label: 'History', icon: '📜' },
              { id: 'traders' as Tab, label: 'Tracked Traders', icon: '👀' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-1 border-b-2 font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-red-500 text-red-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {activeTab === 'live' && (
              <div className="arcade-card p-6">
                <ErrorBoundary context="whale-tracker.live" compact>
                  <WhaleAlertFeed maxAlerts={20} />
                </ErrorBoundary>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="arcade-card p-6">
                {/* Source Filter */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">
                    📜 Trade History
                  </h3>
                  <select
                    value={sourceFilter}
                    onChange={(e) =>
                      setSourceFilter(e.target.value as MarketSource | '')
                    }
                    className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm"
                  >
                    <option value="">All Sources</option>
                    <option value={MarketSource.POLYMARKET}>Polymarket</option>
                    <option value={MarketSource.KALSHI}>Kalshi</option>
                  </select>
                </div>

                <ErrorBoundary context="whale-tracker.history" compact>
                  <DataState
                    loading={historyLoading}
                    error={historyError}
                    empty={!historyLoading && !historyError && historicalTrades.length === 0}
                    onRetry={refetchHistory}
                    emptyTitle="No whale trades found"
                    emptyHint="Try changing the source filter or check back later — large trades happen sporadically."
                  >
                    <div className="space-y-3">
                      {historicalTrades.map((trade) => (
                        <WhaleAlertCard key={trade.id} trade={trade} compact />
                      ))}
                    </div>
                  </DataState>
                </ErrorBoundary>
              </div>
            )}

            {activeTab === 'traders' && (
              <div className="arcade-card p-6">
                <ErrorBoundary context="whale-tracker.traders" compact>
                  <TrackedTradersList onTraderSelect={setSelectedTrader} />
                </ErrorBoundary>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Hot Markets */}
            <div className="arcade-card p-6">
              <h3 className="text-yellow-400 font-bold mb-4 text-sm" style={{ fontFamily: 'Press Start 2P, monospace' }}>
                🔥 HOT MARKETS
              </h3>
              {hotMarketsLoading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-500" />
                </div>
              ) : hotMarkets.length === 0 ? (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No hot markets yet
                </div>
              ) : (
                <div className="space-y-3">
                  {hotMarkets.map((market) => (
                    <HotMarketItem
                      key={market.marketId}
                      question={market.question}
                      whaleCount={market.whaleTradeCount}
                      bullishPercent={market.bullishPercent}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Top Whales */}
            <div className="arcade-card p-6">
              <h3 className="text-yellow-400 font-bold mb-4 text-sm" style={{ fontFamily: 'Press Start 2P, monospace' }}>
                🏆 TOP WHALES (24H)
              </h3>
              {topWhalesLoading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-500" />
                </div>
              ) : topWhales.length === 0 ? (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No whale activity yet
                </div>
              ) : (
                <div className="space-y-3">
                  {topWhales.map((whale, index) => (
                    <TopWhaleItem
                      key={`${whale.address}-${whale.source}`}
                      address={whale.alias || shortenAddress(whale.address)}
                      volume={formatVolume(whale.volume24h)}
                      winRate={Math.round(whale.winRate * 100)}
                      rank={index + 1}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Alert Settings */}
            <div className="arcade-card p-6">
              <h3 className="text-yellow-400 font-bold mb-4 text-sm" style={{ fontFamily: 'Press Start 2P, monospace' }}>
                ⚙️ ALERT SETTINGS
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-sm">
                    Min Alert Amount
                  </label>
                  <select
                    className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                    defaultValue="10000"
                  >
                    <option value="1000">$1,000+</option>
                    <option value="5000">$5,000+</option>
                    <option value="10000">$10,000+</option>
                    <option value="50000">$50,000+</option>
                    <option value="100000">$100,000+</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Push Notifications</span>
                  <button className="w-12 h-6 bg-red-600 rounded-full relative">
                    <span className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Sound Alerts</span>
                  <button className="w-12 h-6 bg-gray-700 rounded-full relative">
                    <span className="absolute left-1 top-1 w-4 h-4 bg-gray-400 rounded-full" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  change,
  icon,
  positive,
  loading,
}: {
  label: string;
  value: string;
  change?: string;
  icon: string;
  positive?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="arcade-card rounded-xl p-4 border border-slate-700/30" style={{ backdropFilter: 'blur(20px)', borderRadius: '12px' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        {change && !loading && (
          <span
            className={`text-xs ${
              positive ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {change}
          </span>
        )}
      </div>
      {loading ? (
        <div className="h-8 w-20 bg-gray-700 animate-pulse rounded" />
      ) : (
        <div className="text-white text-2xl font-bold">{value}</div>
      )}
      <div className="text-gray-400 text-sm">{label}</div>
    </div>
  );
}

// Hot Market Item
function HotMarketItem({
  question,
  whaleCount,
  bullishPercent,
}: {
  question: string;
  whaleCount: number;
  bullishPercent: number;
}) {
  return (
    <div className="p-3 bg-gray-800/50 rounded-lg">
      <div className="text-white text-sm font-medium line-clamp-1 mb-2">
        {question}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">{whaleCount} whale trades</span>
        <span className={bullishPercent > 50 ? 'text-green-400' : 'text-red-400'}>
          {bullishPercent}% bullish
        </span>
      </div>
    </div>
  );
}

// Top Whale Item
function TopWhaleItem({
  address,
  volume,
  winRate,
  rank,
}: {
  address: string;
  volume: string;
  winRate: number;
  rank: number;
}) {
  const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

  return (
    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
      <div className="flex items-center gap-2">
        <span>{rankEmoji}</span>
        <code className="text-red-400 text-sm">{address}</code>
      </div>
      <div className="text-right">
        <div className="text-white text-sm font-medium">{volume}</div>
        <div className="text-green-400 text-xs">{winRate}% win</div>
      </div>
    </div>
  );
}
