'use client';

import { useEffect, useState } from 'react';
import type { WhaleTrade } from '@/types/externalMarket';

/**
 * Subscribes to /api/whale-alerts/stream (Server-Sent Events) for live whale
 * trades. Returns the most recent N alerts, newest first, plus connection state.
 *
 * Drop-in upgrade from `useWhaleAlerts(threshold)` for live UIs that don't need
 * the polling fallback. Reconnects automatically on EventSource close.
 */
export function useWhaleAlertStream(maxKept = 50) {
  const [alerts, setAlerts] = useState<WhaleTrade[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/whale-alerts/stream');

    es.addEventListener('ready', () => {
      setIsConnected(true);
    });

    es.addEventListener('whale', (e) => {
      try {
        const trade = JSON.parse((e as MessageEvent).data) as WhaleTrade;
        setLastEventAt(Date.now());
        setAlerts((prev) => {
          if (prev.some((p) => p.id === trade.id)) return prev;
          return [trade, ...prev].slice(0, maxKept);
        });
      } catch {
        // ignore malformed
      }
    });

    es.onopen = () => setIsConnected(true);
    es.onerror = () => setIsConnected(false);

    return () => {
      es.close();
      setIsConnected(false);
    };
  }, [maxKept]);

  return { alerts, isConnected, lastEventAt };
}
