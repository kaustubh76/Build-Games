'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { WhaleTrade, MarketSource } from '@/types/externalMarket';
import { useMirrorWhaleTrade } from '@/hooks/useMirrorWhaleTrade';
import { ConfirmMirrorModal } from './ConfirmMirrorModal';

interface WhaleAlertCardProps {
  trade: WhaleTrade;
  compact?: boolean;
  /** Default mirror size in CRwN. Trades above the threshold get a confirm modal. */
  defaultSizeCRwN?: number;
  /** Threshold above which we ask for confirmation. */
  confirmAbove?: number;
}

export function WhaleAlertCard({
  trade,
  compact = false,
  defaultSizeCRwN = 100,
  confirmAbove = 100,
}: WhaleAlertCardProps) {
  const { mirrorTrade, isPending, isConnected, lastResult, lastPending } = useMirrorWhaleTrade();
  const justMirrored = lastResult?.whaleTradeId === trade.id;
  const awaitingActivation = lastPending?.whaleTradeId === trade.id && !justMirrored;
  const [confirming, setConfirming] = useState(false);
  const handleMirror = () => {
    if (defaultSizeCRwN > confirmAbove) {
      setConfirming(true);
    } else {
      void mirrorTrade(trade, String(defaultSizeCRwN));
    }
  };
  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  const sourceIcons: Record<MarketSource, string> = {
    [MarketSource.NATIVE]: '🏆',
    [MarketSource.POLYMARKET]: '🔮',
    [MarketSource.KALSHI]: '📊',
    [MarketSource.OPINION]: '💬',
  };

  const shortenAddress = (addr?: string) => {
    if (!addr) return 'Anonymous';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-red-500/50 transition-all">
        <span className="text-2xl">🐋</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
              {trade.side.toUpperCase()}
            </span>
            <span className="text-white font-medium">
              {formatAmount(trade.amountUsd)}
            </span>
            <span className={trade.outcome === 'yes' ? 'text-green-400' : 'text-red-400'}>
              {trade.outcome.toUpperCase()}
            </span>
          </div>
          <div className="text-gray-400 text-xs truncate">
            {trade.marketQuestion}
          </div>
        </div>
        <button
          type="button"
          onClick={handleMirror}
          disabled={!isConnected || isPending || justMirrored}
          title={!isConnected ? 'Connect wallet to mirror' : `Mirror this whale trade in CRwN`}
          className="px-2 py-1 rounded bg-fuchsia-600/80 hover:bg-fuchsia-500 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {justMirrored ? '✓' : isPending ? '…' : '🪞'}
        </button>
        <span className="text-gray-500 text-xs">{formatTime(trade.timestamp)}</span>
      </div>
    );
  }

  return (
    <div className="arcade-card p-4 hover:border-red-500/50 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-3xl">🐋</span>
          <div>
            <div className="text-white font-bold text-lg">Whale Alert</div>
            <div className="text-gray-400 text-sm">
              {sourceIcons[trade.source]} {trade.source}
            </div>
          </div>
        </div>
        <span className="text-gray-500 text-sm">{formatTime(trade.timestamp)}</span>
      </div>

      {/* Trade Details */}
      <div className="mb-4">
        <Link
          href={`/markets/${trade.marketId}`}
          className="text-red-400 hover:text-red-300 font-medium line-clamp-2"
        >
          {trade.marketQuestion}
        </Link>
      </div>

      {/* Trade Info */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="p-3 bg-gray-800/50 rounded-lg">
          <div className="text-gray-400 text-xs mb-1">Action</div>
          <div className="flex items-center gap-2">
            <span
              className={`font-bold ${
                trade.side === 'buy' ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {trade.side.toUpperCase()}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs ${
                trade.outcome === 'yes'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {trade.outcome.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="p-3 bg-gray-800/50 rounded-lg">
          <div className="text-gray-400 text-xs mb-1">Amount</div>
          <div className="text-white font-bold text-lg">
            {formatAmount(trade.amountUsd)}
          </div>
        </div>

        <div className="p-3 bg-gray-800/50 rounded-lg">
          <div className="text-gray-400 text-xs mb-1">Price</div>
          <div className="text-white">
            {(trade.price / 100).toFixed(1)}%
          </div>
        </div>

        <div className="p-3 bg-gray-800/50 rounded-lg">
          <div className="text-gray-400 text-xs mb-1">Shares</div>
          <div className="text-white">
            {parseFloat(trade.shares).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Trader Info */}
      {trade.traderAddress && (
        <div className="flex items-center justify-between gap-2 p-3 bg-gray-800/30 rounded-lg flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-gray-400 text-sm shrink-0">Trader:</span>
            <code className="text-red-400 text-sm break-all">
              {shortenAddress(trade.traderAddress)}
            </code>
          </div>
          {trade.txHash && (
            <a
              href={`https://etherscan.io/tx/${trade.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white text-xs shrink-0"
            >
              View TX →
            </a>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleMirror}
          disabled={!isConnected || isPending || justMirrored}
          title={!isConnected ? 'Connect wallet to mirror' : 'Mirror this whale trade'}
          className="flex-1 min-w-[140px] py-2 rounded-lg text-white text-sm font-bold bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {justMirrored ? (
            <>
              <span>✓</span>
              <span>Mirrored</span>
              {lastResult?.txHash && (
                <a
                  href={`https://testnet.snowtrace.io/tx/${lastResult.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 underline opacity-80"
                  onClick={(e) => e.stopPropagation()}
                  title={
                    lastResult.sharesOut
                      ? `${lastResult.copyAmount} CRwN → ${lastResult.sharesOut} shares · click to view tx`
                      : 'View tx'
                  }
                >
                  view
                </a>
              )}
            </>
          ) : awaitingActivation ? (
            <>
              <span>⏳</span>
              <span>Market spinning up…</span>
            </>
          ) : isPending ? (
            <>
              <span className="inline-block animate-spin">◌</span>
              <span>Mirroring…</span>
            </>
          ) : (
            <>
              <span>🪞</span>
              <span>{isConnected ? 'Mirror' : 'Connect to Mirror'}</span>
            </>
          )}
        </button>
        <Link
          href={`/markets/${trade.marketId}`}
          className="px-4 py-2 text-center bg-red-600 hover:bg-red-500 rounded-lg text-white text-sm font-medium"
        >
          View
        </Link>
        {trade.traderAddress && (
          <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm">
            Track
          </button>
        )}
      </div>

      {confirming && (
        <ConfirmMirrorModal
          trade={trade}
          sizeCRwN={defaultSizeCRwN}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void mirrorTrade(trade, String(defaultSizeCRwN));
          }}
        />
      )}
    </div>
  );
}

export default WhaleAlertCard;
