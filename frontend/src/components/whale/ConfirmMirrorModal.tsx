'use client';

import React from 'react';
import type { WhaleTrade } from '@/types/externalMarket';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ConfirmMirrorModalProps {
  trade: WhaleTrade;
  sizeCRwN: number;
  /** Per-trade cap in CRwN (display only — server enforces) */
  perTradeCap?: number;
  /** Slippage tolerance in basis points (display only) */
  slippageBps?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation modal shown before mirroring a "big" whale trade.
 *
 * Rendered when sizeCRwN exceeds the small-trade threshold (default 100).
 * Server-side limits still apply on top of this — the modal is a UX guard,
 * not a security boundary.
 */
export function ConfirmMirrorModal({
  trade,
  sizeCRwN,
  perTradeCap = 1000,
  slippageBps = 300,
  onConfirm,
  onCancel,
}: ConfirmMirrorModalProps) {
  const slippagePct = (slippageBps / 100).toFixed(2);
  const overCap = sizeCRwN > perTradeCap;
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-mirror-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-gradient-to-br from-purple-900/90 to-fuchsia-900/90 border border-fuchsia-500/40 p-5 text-white shadow-2xl"
      >
        <h2 id="confirm-mirror-title" className="text-lg font-bold mb-1">
          🪞 Confirm mirror trade
        </h2>
        <p className="text-xs text-gray-300 mb-4">
          You&apos;re about to mirror a whale&apos;s position. Server-signed
          custodial — review before confirming.
        </p>

        <div className="space-y-2 text-sm mb-4">
          <Row label="Whale" value={shortAddr(trade.traderAddress)} />
          <Row label="Source" value={String(trade.source)} />
          <Row label="Market" value={trade.marketQuestion || trade.marketId} />
          <Row
            label="Outcome"
            value={
              <span
                className={
                  trade.outcome === 'yes' ? 'text-green-300' : 'text-red-300'
                }
              >
                {trade.outcome.toUpperCase()}
              </span>
            }
          />
          <Row
            label="Your size"
            value={
              <span className={overCap ? 'text-red-300' : 'text-fuchsia-300'}>
                {sizeCRwN.toFixed(2)} CRwN
                {overCap && (
                  <span className="ml-1 text-xs">
                    (&gt; {perTradeCap} cap — will be rejected)
                  </span>
                )}
              </span>
            }
          />
          <Row label="Slippage tolerance" value={`${slippagePct}%`} />
        </div>

        <div className="text-xs text-gray-400 mb-4 p-2 rounded bg-black/30">
          ✓ Slippage protection enforced via on-chain `minSharesOut` <br />
          ✓ Per-trade cap enforced server-side before tx <br />
          ✓ Receipt persisted to 0G Storage on success
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={overCap}
            className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
          >
            Confirm mirror
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-gray-400 text-xs uppercase tracking-wider shrink-0">
        {label}
      </span>
      <span className="text-right break-words min-w-0">{value}</span>
    </div>
  );
}

function shortAddr(addr?: string): string {
  if (!addr) return 'Anonymous';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
