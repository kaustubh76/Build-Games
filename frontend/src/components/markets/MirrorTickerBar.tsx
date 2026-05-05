'use client';

import { useEffect, useState } from 'react';
import { formatEther } from 'viem';

interface TickerRow {
  mirrorKey: string;
  externalId: string;
  source: 'POLYMARKET' | 'KALSHI';
  yesBps: number;
  noBps: number;
  totalVolume: string;
  isActive: boolean;
}

interface TickerPayload {
  rows: TickerRow[];
  total?: number;
  cached?: boolean;
}

const POLL_MS = 10_000;

function formatVol(wei: string): string {
  try {
    const v = parseFloat(formatEther(BigInt(wei)));
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toFixed(0);
  } catch {
    return '0';
  }
}

function shortKey(k: string): string {
  if (!k || k.length < 12) return k;
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

/**
 * Slim live ticker bar — pulls top mirror markets every 10s and shows
 * current YES price + 24h-ish volume. Read-only, no DB.
 */
export function MirrorTickerBar({
  className = '',
  limit = 8,
}: {
  className?: string;
  limit?: number;
}) {
  const [data, setData] = useState<TickerPayload | null>(null);
  const [prevYesByKey, setPrevYesByKey] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(`/api/markets/ticker?limit=${limit}`);
        const json = (await res.json()) as TickerPayload;
        if (cancelled) return;
        setPrevYesByKey((prev) => {
          const next = new Map<string, number>();
          for (const r of data?.rows ?? []) next.set(r.mirrorKey, r.yesBps);
          for (const [k, v] of prev) if (!next.has(k)) next.set(k, v);
          return next;
        });
        setData(json);
      } catch {
        // ignore — next tick will retry
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  if (!data || data.rows.length === 0) {
    return null;
  }

  return (
    <div
      className={`overflow-x-auto whitespace-nowrap py-2 px-3 bg-black/40 border-y border-fuchsia-500/20 ${className}`}
    >
      <div className="inline-flex gap-4 items-center text-xs">
        <span className="text-fuchsia-400 font-bold tracking-wider">🔴 LIVE</span>
        {data.rows.map((r) => {
          const yes = r.yesBps / 100;
          const prev = prevYesByKey.get(r.mirrorKey);
          const delta = prev !== undefined ? r.yesBps - prev : 0;
          const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '·';
          const arrowColor =
            delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-500';
          return (
            <span key={r.mirrorKey} className="inline-flex items-center gap-1">
              <span
                className={`text-[10px] px-1 py-0.5 rounded ${
                  r.source === 'POLYMARKET'
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'bg-blue-500/20 text-blue-300'
                }`}
              >
                {r.source === 'POLYMARKET' ? 'POLY' : 'KAL'}
              </span>
              <span className="font-mono text-gray-400">{shortKey(r.mirrorKey)}</span>
              <span className="text-white font-bold">{yes.toFixed(1)}%</span>
              <span className={arrowColor}>{arrow}</span>
              <span className="text-gray-500">vol {formatVol(r.totalVolume)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default MirrorTickerBar;
