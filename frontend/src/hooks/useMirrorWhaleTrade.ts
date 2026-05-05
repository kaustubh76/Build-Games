'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { useNotifications } from '@/contexts/NotificationContext';
import type { WhaleTrade } from '@/types/externalMarket';

export interface MirrorWhaleResult {
  success: true;
  txHash: string;
  blockNumber: number;
  mirrorKey: string;
  sharesOut: string | null;
  minSharesOut: string;
  slippageBps: number;
  copyAmount: string;
  copyAmountWei: string;
  whaleTradeId: string;
  outcome: 'yes' | 'no';
  cached?: boolean;
  receipt?: {
    rootHash: string | null;
    dataHash: string;
    storageTxHash: string | null;
  };
}

export interface MirrorWhalePending {
  success: false;
  pending: true;
  reason: 'mirror-market-created-pending-activation';
  mirrorKey: string;
  whaleTradeId: string;
  retryAfterSeconds: number;
  autoCreate: {
    attempted: boolean;
    txHash: string | null;
    requestId: string | null;
    blockNumber: number | null;
    message: string;
    receipt?: { rootHash: string | null; storageTxHash: string | null };
  };
}

interface MirrorWhaleError {
  error: string;
  code?: string;
}

type MirrorWhaleOutcome = MirrorWhaleResult | MirrorWhalePending | null;

function toSnapshot(trade: WhaleTrade) {
  return {
    id: trade.id,
    source: trade.source,
    marketId: trade.marketId,
    marketQuestion: trade.marketQuestion,
    traderAddress: trade.traderAddress,
    outcome: trade.outcome,
    side: trade.side,
    amountUsd: trade.amountUsd,
  };
}

export function useMirrorWhaleTrade() {
  const { address, isConnected } = useAccount();
  const notify = useNotifications();
  const [isPending, setIsPending] = useState(false);
  const [lastResult, setLastResult] = useState<MirrorWhaleResult | null>(null);
  const [lastPending, setLastPending] = useState<MirrorWhalePending | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cleanup tracker for any pending auto-retry timers
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const mirrorTrade = useCallback(
    async (
      trade: WhaleTrade,
      sizeCRwN?: string
    ): Promise<MirrorWhaleOutcome> => {
      if (!isConnected || !address) {
        setError('Connect wallet to mirror');
        notify.warning('Wallet not connected', 'Connect to mirror this trade');
        return null;
      }
      setIsPending(true);
      setError(null);
      try {
        const res = await fetch('/api/copy-trade/whale-mirror', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: address,
            whaleTradeId: trade.id,
            sizeCRwN,
            whaleTrade: toSnapshot(trade),
          }),
        });
        const json = await res.json();

        // 202 → mirror market was auto-created, need to retry after activation.
        // Notify the user with an explicit "Retry now" action that fires the same
        // mirrorTrade(...) call once the activation window is up.
        if (res.status === 202 && json && json.pending) {
          const pending = json as MirrorWhalePending;
          setLastPending(pending);
          // Schedule an auto-retry after the suggested window. User can also
          // click the retry-now button in the UI before then.
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            void mirrorTrade(trade, sizeCRwN);
          }, Math.max(1, pending.retryAfterSeconds) * 1000);
          notify.errorWithRetry(
            'Mirror market spinning up',
            `Created on-chain. Auto-retrying in ~${pending.retryAfterSeconds}s — or click Retry now.`,
            () => {
              if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
              }
              void mirrorTrade(trade, sizeCRwN);
            },
            'Retry now'
          );
          return pending;
        }

        if (!res.ok) {
          const msg = (json as MirrorWhaleError).error ?? 'Mirror failed';
          setError(msg);
          // Transient errors get an inline retry button. Permanent rejections
          // (paused user, over-cap) don't — the user must change something first.
          const code = (json as MirrorWhaleError).code;
          const isTransient =
            code === 'CHAIN_CALL_FAILED' ||
            code === 'SERVICE_UNAVAILABLE' ||
            code === 'RATE_LIMIT_EXCEEDED' ||
            res.status === 502 ||
            res.status === 503;
          if (isTransient) {
            notify.errorWithRetry('Mirror failed', msg, () => {
              void mirrorTrade(trade, sizeCRwN);
            });
          } else {
            notify.error('Mirror failed', msg);
          }
          return null;
        }
        const result = json as MirrorWhaleResult;
        setLastResult(result);
        notify.success(
          result.cached ? 'Mirror already pending' : 'Mirror submitted',
          `${parseFloat(result.copyAmount).toFixed(2)} CRwN · ${result.outcome.toUpperCase()}`
        );
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Network error';
        setError(msg);
        // Network errors are always transient — surface the retry path.
        notify.errorWithRetry('Mirror failed', msg, () => {
          void mirrorTrade(trade, sizeCRwN);
        });
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [address, isConnected, notify]
  );

  return { mirrorTrade, isPending, lastResult, lastPending, error, isConnected };
}
