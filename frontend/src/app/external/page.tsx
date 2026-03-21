'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useExternalMarkets, useExternalMarketStats } from '@/hooks/useExternalMarkets';
import { ExternalMarketCard } from '@/components/markets/ExternalMarketCard';
import { MarketSourceFilter, MarketSourceTabs } from '@/components/markets/MarketSourceFilter';
import { MarketSource, ExternalMarketStatus } from '@/types/externalMarket';

// Categories for filtering
const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'Politics', label: 'Politics' },
  { value: 'Crypto', label: 'Crypto' },
  { value: 'Sports', label: 'Sports' },
  { value: 'Science', label: 'Science' },
  { value: 'Entertainment', label: 'Entertainment' },
  { value: 'Finance', label: 'Finance' },
];

// Sort options
const SORT_OPTIONS = [
  { value: 'volume', label: 'Volume' },
  { value: 'endTime', label: 'Ending Soon' },
  { value: 'yesPrice', label: 'Probability' },
  { value: 'createdAt', label: 'Newest' },
];

export default function ExternalMarketsPage() {
  // Filter state
  const [sourceFilter, setSourceFilter] = useState<MarketSource | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ExternalMarketStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'volume' | 'endTime' | 'yesPrice' | 'createdAt'>('volume');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Build filters
  const filters = useMemo(() => ({
    source: sourceFilter === 'all' ? undefined : sourceFilter,
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    search: searchQuery || undefined,
    sortBy,
    sortOrder,
    page,
    pageSize,
  }), [sourceFilter, statusFilter, categoryFilter, searchQuery, sortBy, sortOrder, page]);

  // Reset page when filters change
  const resetFilters = () => setPage(1);

  // Fetch markets
  const { markets, loading, error, total, refetch, syncMarkets, syncing } = useExternalMarkets(filters);
  const { stats, loading: statsLoading } = useExternalMarketStats();

  // Handle sync
  const handleSync = async () => {
    if (sourceFilter === 'all') {
      await syncMarkets();
    } else {
      await syncMarkets(sourceFilter);
    }
  };

  return (
    <main className="min-h-screen">
      <div className="container-arcade py-6 md:py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/markets" className="text-slate-400 hover:text-white text-sm">
              ← Back to Markets
            </Link>
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl text-red-400 mb-2 tracking-wider arcade-glow"
                  style={{ fontFamily: 'Press Start 2P, monospace' }}>
                EXTERNAL MARKETS
              </h1>
              <p className="text-slate-400 text-sm">
                Trade on Polymarket and Kalshi markets with AI insights
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSync}
                disabled={syncing}
                className={`
                  px-4 py-2 rounded-lg font-medium transition-all
                  ${syncing
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-500'
                  }
                `}
              >
                {syncing ? 'Syncing...' : 'Sync Markets'}
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {!statsLoading && stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Markets"
              value={stats.totalMarkets.toString()}
              icon="📊"
            />
            <StatCard
              label="Polymarket"
              value={stats.polymarketCount.toString()}
              icon="🔮"
              color="blue"
            />
            <StatCard
              label="Kalshi"
              value={stats.kalshiCount.toString()}
              icon="📈"
              color="green"
            />
            <StatCard
              label="Total Volume"
              value={formatVolume(stats.totalVolume)}
              icon="💰"
              color="yellow"
            />
          </div>
        )}

        {/* Source Tabs */}
        <div className="mb-6">
          <MarketSourceTabs
            selected={sourceFilter}
            onChange={setSourceFilter}
            counts={{
              all: stats?.totalMarkets,
              polymarket: stats?.polymarketCount,
              kalshi: stats?.kalshiCount,
            }}
          />
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          {/* Search */}
          <div className="flex-1 min-w-[200px] max-w-md">
            <input
              type="text"
              placeholder="Search markets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full input"
            />
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ExternalMarketStatus | '')}
            className="input"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
            <option value="resolved">Resolved</option>
          </select>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="input"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white hover:bg-slate-700/50 transition-colors"
            >
              {sortOrder === 'desc' ? '↓' : '↑'}
            </button>
          </div>
        </div>

        {/* Results Count */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-gray-400 text-sm">
            Showing {markets.length} of {total} markets
          </p>
          {stats?.lastSync && (
            <p className="text-gray-500 text-sm">
              Last synced: {new Date(stats.lastSync).toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
            <button
              onClick={refetch}
              className="mt-2 text-sm text-red-300 hover:text-white"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && markets.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg mb-4">No markets found</p>
            <p className="text-gray-500 mb-6">
              Try adjusting your filters or sync markets from external sources
            </p>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync Markets Now'}
            </button>
          </div>
        )}

        {/* Markets Grid */}
        {!loading && markets.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {markets.map((market) => (
              <ExternalMarketCard key={market.id} market={market} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {markets.length > 0 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-slate-800/50 text-white rounded-lg border border-slate-700/50 hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-gray-400">
              Page {page} of {Math.ceil(total / pageSize)}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={markets.length < pageSize || page * pageSize >= total}
              className="px-4 py-2 bg-slate-800/50 text-white rounded-lg border border-slate-700/50 hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  icon,
  color = 'red',
}: {
  label: string;
  value: string;
  icon: string;
  color?: 'red' | 'blue' | 'green' | 'yellow';
}) {
  const colorClasses = {
    red: 'from-red-500/20 to-red-600/10 border-red-500/30',
    blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    green: 'from-green-500/20 to-green-600/10 border-green-500/30',
    yellow: 'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30',
  };

  return (
    <div className="arcade-card p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-slate-400 text-xs" style={{ fontFamily: 'Press Start 2P, monospace' }}>{label}</p>
          <p className="text-yellow-400 text-lg font-bold mt-1">{value}</p>
        </div>
      </div>
    </div>
  );
}

function formatVolume(vol: string): string {
  const num = parseFloat(vol);
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}
