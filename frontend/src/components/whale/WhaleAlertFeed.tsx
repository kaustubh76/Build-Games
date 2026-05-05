'use client';

import React, { useMemo } from 'react';
import { useWhaleAlerts } from '@/hooks/useWhaleAlerts';
import { useWhaleAlertStream } from '@/hooks/useWhaleAlertStream';
import { WhaleAlertCard } from './WhaleAlertCard';
import { MarketSource, type WhaleTrade } from '@/types/externalMarket';

interface WhaleAlertFeedProps {
  source?: MarketSource;
  maxAlerts?: number;
  compact?: boolean;
}

export function WhaleAlertFeed({
  source,
  maxAlerts = 10,
  compact = false,
}: WhaleAlertFeedProps) {
  const { alerts: pollAlerts, threshold, setThreshold, clearAlerts } =
    useWhaleAlerts(10000);
  const { alerts: liveAlerts, isConnected: streamConnected } =
    useWhaleAlertStream(50);

  // Merge live (SSE) + polled alerts; live ones win on dedupe.
  const merged = useMemo<WhaleTrade[]>(() => {
    const byId = new Map<string, WhaleTrade>();
    for (const a of pollAlerts) byId.set(a.id, a);
    for (const a of liveAlerts) byId.set(a.id, a);
    return Array.from(byId.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [pollAlerts, liveAlerts]);

  const isConnected = streamConnected;

  // Filter by source if specified
  const filteredAlerts = source ? merged.filter((a) => a.source === source) : merged;

  const displayAlerts = filteredAlerts.slice(0, maxAlerts);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🐋</span> Whale Alerts
          </h3>
          <span
            className={`px-2 py-0.5 rounded-full text-xs ${
              isConnected
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400'
            }`}
          >
            {isConnected ? '● Live' : '○ Offline'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value))}
            className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
          >
            <option value="1000">$1K+</option>
            <option value="5000">$5K+</option>
            <option value="10000">$10K+</option>
            <option value="50000">$50K+</option>
            <option value="100000">$100K+</option>
          </select>
          {merged.length > 0 && (
            <button
              onClick={clearAlerts}
              className="px-2 py-1 text-gray-400 hover:text-white text-sm"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Alert List */}
      {displayAlerts.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <span className="text-4xl mb-2 block">🐋</span>
          <p>No whale trades detected yet</p>
          <p className="text-sm text-gray-500 mt-1 mb-3">
            Watching for trades over ${threshold.toLocaleString()}
          </p>
          {threshold > 1000 && (
            <button
              type="button"
              onClick={() => setThreshold(1000)}
              className="px-3 py-1 rounded-lg bg-fuchsia-600/20 hover:bg-fuchsia-600/40 border border-fuchsia-500/40 text-fuchsia-300 text-xs"
            >
              Lower threshold to $1K ↘
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayAlerts.map((trade) => (
            <WhaleAlertCard
              key={trade.id}
              trade={trade}
              compact={compact}
            />
          ))}
        </div>
      )}

      {/* Show More */}
      {filteredAlerts.length > maxAlerts && (
        <button className="w-full py-2 text-red-400 hover:text-red-300 text-sm">
          Show {filteredAlerts.length - maxAlerts} more alerts
        </button>
      )}
    </div>
  );
}

export default WhaleAlertFeed;
