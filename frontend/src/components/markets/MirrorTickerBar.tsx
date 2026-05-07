'use client';

import { useEffect, useRef, useState } from 'react';
import { formatEther } from 'viem';

interface TickerRow {
  mirrorKey: string;
  marketId?: string;
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
 *
 * Polish:
 *   - Play/Pause toggle freezes polling so users can read carefully.
 *   - onRowClick lets a parent wire each row to a click-to-trade flow without
 *     coupling the ticker to a specific mirror hook.
 */
export function MirrorTickerBar({
  className = '',
  limit = 8,
  onRowClick,
}: {
  className?: string;
  limit?: number;
  onRowClick?: (row: TickerRow) => void;
}) {
  const [data, setData] = useState<TickerPayload | null>(null);
  const [prevYesByKey, setPrevYesByKey] = useState<Map<string, number>>(new Map());
  const [paused, setPaused] = useState(false);
  // Keep a stable ref to current data so the effect doesn't need it as a dep.
  const dataRef = useRef<TickerPayload | null>(null);
  dataRef.current = data;

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(`/api/markets/ticker?limit=${limit}`);
        const json = (await res.json()) as TickerPayload;
        if (cancelled) return;
        setPrevYesByKey((prev) => {
          const next = new Map<string, number>();
          for (const r of dataRef.current?.rows ?? []) next.set(r.mirrorKey, r.yesBps);
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
  }, [limit, paused]);

  // Live SSE: when an on-chain MirrorTradeExecuted fires, immediately re-fetch
  // the ticker so the row updates instantly. SSE complements (doesn't replace)
  // the 10s poll — poll covers price drift from external syncPrice events.
  useEffect(() => {
    if (paused) return;
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/markets/ticker/stream');
    let refetchScheduled = false;
    es.addEventListener('tick', () => {
      // Debounce: a flurry of trades collapses to one re-fetch.
      if (refetchScheduled) return;
      refetchScheduled = true;
      setTimeout(() => {
        refetchScheduled = false;
        fetch(`/api/markets/ticker?limit=${limit}`)
          .then((r) => r.json())
          .then((json: TickerPayload) => {
            setPrevYesByKey((prev) => {
              const next = new Map<string, number>();
              for (const r of dataRef.current?.rows ?? []) next.set(r.mirrorKey, r.yesBps);
              for (const [k, v] of prev) if (!next.has(k)) next.set(k, v);
              return next;
            });
            setData(json);
          })
          .catch(() => {
            /* fallback: next poll tick will catch up */
          });
      }, 250);
    });
    es.onerror = () => {
      // Silent — the polling effect above is the safety net.
    };
    return () => {
      es.close();
    };
  }, [limit, paused]);

  if (!data || data.rows.length === 0) {
    return null;
  }

  return (
    <div
      className={`overflow-x-auto whitespace-nowrap py-2 px-3 bg-black/40 border-y border-fuchsia-500/20 ${className}`}
    >
      <div className="inline-flex gap-4 items-center text-xs">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          aria-label={paused ? 'Resume live ticker' : 'Pause live ticker'}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/40 hover:bg-black/60 border border-fuchsia-500/30 text-fuchsia-300 font-bold tracking-wider"
        >
          {paused ? '▶' : '🔴'}
          <span>{paused ? 'PAUSED' : 'LIVE'}</span>
        </button>
        {data.rows.map((r) => {
          const yes = r.yesBps / 100;
          const prev = prevYesByKey.get(r.mirrorKey);
          const delta = prev !== undefined ? r.yesBps - prev : 0;
          const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '·';
          const arrowColor =
            delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-500';
          const clickable = !!onRowClick;
          const RowTag: 'button' | 'span' = clickable ? 'button' : 'span';
          const rowProps = clickable
            ? {
                type: 'button' as const,
                onClick: () => onRowClick?.(r),
                className:
                  'inline-flex items-center gap-1 px-1 py-0.5 rounded hover:bg-white/5 cursor-pointer transition-colors',
                title: `Click to trade ${r.source} ${shortKey(r.mirrorKey)}`,
              }
            : {
                className: 'inline-flex items-center gap-1',
              };
          return (
            <RowTag key={r.mirrorKey} {...rowProps}>
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
            </RowTag>
          );
        })}
      </div>
    </div>
  );
}

export default MirrorTickerBar;
