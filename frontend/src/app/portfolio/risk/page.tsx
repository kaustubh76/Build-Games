'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import { formatEther } from 'viem';
import { SkeletonStatCard, SkeletonTableRow } from '@/components/ui/skeleton';
import { InfoTip } from '@/components/ui/InfoTip';

interface SafetyState {
  user: {
    spentWei: string;
    capWei: string;
    remainingWei: string;
    windowStart: number;
    paused: boolean;
  };
  system: {
    perTradeCapWei: string;
    perUserDailyCapWei: string;
    maxSlippageBps: number;
  };
}

interface AuditEntry {
  requestId: string;
  mirrorKey: string;
  agentId: string;
  status: 'pending' | 'completed';
  amountWei?: string;
  blockNumber: number;
  txHash: string;
  executedTxHash?: string;
}

interface AuditPayload {
  entries: AuditEntry[];
  stats: { total: number; pending: number; completed: number };
}

interface PositionsPayload {
  positions: Array<{
    marketId: string;
    outcome: 'yes' | 'no';
    shares: string;
    avgPrice: number;
    currentPrice: number;
    value: string;
    pnl: string;
    pnlPercent: number;
    mirrorKey: string;
    usedVRF: boolean;
    market: { externalId: string; source: string; question: string } | null;
  }>;
}

function formatCRwN(wei: string): string {
  try {
    return parseFloat(formatEther(BigInt(wei))).toFixed(2);
  } catch {
    return '0.00';
  }
}

function shortHash(s: string): string {
  if (!s || s.length < 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export default function RiskPage() {
  const { address, isConnected } = useAccount();
  const [safety, setSafety] = useState<SafetyState | null>(null);
  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [positions, setPositions] = useState<PositionsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pauseInFlight, setPauseInFlight] = useState(false);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const [s, a, p] = await Promise.all([
        fetch(`/api/safety?address=${address}`).then((r) => r.json()),
        fetch(`/api/copy-trade/audit?address=${address}`).then((r) => r.json()),
        fetch(`/api/mirror/positions?walletAddress=${address}`).then((r) => r.json()),
      ]);
      setSafety(s);
      setAudit(a);
      setPositions(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const togglePause = async () => {
    if (!address || !safety) return;
    setPauseInFlight(true);
    try {
      await fetch('/api/safety', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          action: safety.user.paused ? 'resume' : 'pause',
        }),
      });
      await refresh();
    } finally {
      setPauseInFlight(false);
    }
  };

  if (!isConnected) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-12 text-white">
        <h1 className="text-2xl sm:text-3xl font-bold mb-4">Risk Dashboard</h1>
        <p className="text-gray-400">
          Connect your wallet to see your spend window, mirror-trade audit log, and live positions.
        </p>
      </main>
    );
  }

  const dailyCap = safety ? parseFloat(formatCRwN(safety.user.capWei)) : 0;
  const dailySpent = safety ? parseFloat(formatCRwN(safety.user.spentWei)) : 0;
  const dailyPct = dailyCap > 0 ? Math.min(100, (dailySpent / dailyCap) * 100) : 0;
  const totalPositionValue = positions?.positions.reduce(
    (acc, p) => acc + parseFloat(formatCRwN(p.value)),
    0
  ) ?? 0;
  const totalPnl = positions?.positions.reduce(
    (acc, p) => acc + parseFloat(formatCRwN(p.pnl)),
    0
  ) ?? 0;

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 text-white">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Risk Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            Live mirror-trading state. All data sourced from chain events + in-process safety limits.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm border border-gray-700 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-500/20 border border-red-500/40 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Cards row — show skeletons while we wait on the first slow load */}
      {loading && !safety && !positions ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-4 rounded-lg bg-gray-900/60 border border-gray-700">
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            Daily mirror spend
            <InfoTip>
              In-process daily cap on mirror trades per wallet. Resets 24h after
              your first spend. The on-chain CRwN allowance to the
              ExternalMarketMirror contract is the real ceiling — this is a
              defense-in-depth limit on top.
            </InfoTip>
          </div>
          <div className="text-2xl font-bold">
            {dailySpent.toFixed(2)} <span className="text-sm text-gray-400">/ {dailyCap.toFixed(0)} CRwN</span>
          </div>
          <div className="mt-3 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-500"
              style={{ width: `${dailyPct}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-2">
            {dailyPct.toFixed(0)}% of daily cap used · resets in 24h from first spend
          </div>
        </div>

        <div className="p-4 rounded-lg bg-gray-900/60 border border-gray-700">
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            Open positions
            <InfoTip>
              Aggregated from on-chain `MirrorTradeExecuted` events. P&L uses
              the current YES price from `getMirrorMarket(mirrorKey)`. Positions
              cache for 30s in process; refresh forces a re-scan.
            </InfoTip>
          </div>
          <div className="text-2xl font-bold">{positions?.positions.length ?? 0}</div>
          <div className="text-xs text-gray-500 mt-2">
            Value: <span className="text-white">{totalPositionValue.toFixed(2)} CRwN</span> ·{' '}
            P&L:{' '}
            <span className={totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} CRwN
            </span>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-gray-900/60 border border-gray-700">
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            Trading status
            <InfoTip>
              Pause flips an in-process flag that rejects every subsequent mirror
              call before it touches the chain. Use it as a kill switch — your
              CRwN balance and on-chain allowance are unaffected.
            </InfoTip>
          </div>
          <div className={`text-2xl font-bold ${safety?.user.paused ? 'text-red-400' : 'text-green-400'}`}>
            {safety?.user.paused ? 'PAUSED' : 'ACTIVE'}
          </div>
          <button
            type="button"
            onClick={togglePause}
            disabled={pauseInFlight || !safety}
            className={`mt-3 w-full px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50 ${
              safety?.user.paused
                ? 'bg-green-500/30 hover:bg-green-500/50 text-green-200'
                : 'bg-red-500/30 hover:bg-red-500/50 text-red-200'
            }`}
          >
            {pauseInFlight ? '…' : safety?.user.paused ? 'Resume trading' : 'Pause all trading'}
          </button>
        </div>
      </div>
      )}

      {/* Audit log */}
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
          Mirror trade audit log
          {audit?.stats && (
            <span className="text-xs font-normal text-gray-500">
              {audit.stats.total} total · {audit.stats.completed} completed · {audit.stats.pending} pending
            </span>
          )}
        </h2>
        {loading && !audit ? (
          <div className="overflow-x-auto bg-gray-900/40 border border-gray-800 rounded">
            <table className="min-w-full text-sm">
              <tbody>
                <SkeletonTableRow columns={5} />
                <SkeletonTableRow columns={5} />
                <SkeletonTableRow columns={5} />
              </tbody>
            </table>
          </div>
        ) : !audit?.entries.length ? (
          <div className="p-6 text-center text-gray-500 bg-gray-900/40 border border-gray-800 rounded">
            <div className="text-3xl mb-2">📜</div>
            <p>No mirror trades yet.</p>
            <Link
              href="/whale-tracker"
              className="inline-block mt-3 px-3 py-1.5 rounded-lg bg-fuchsia-600/20 hover:bg-fuchsia-600/40 border border-fuchsia-500/40 text-fuchsia-300 text-sm"
            >
              Mirror your first whale trade →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto bg-gray-900/40 border border-gray-800 rounded">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-gray-400 uppercase border-b border-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Mirror key</th>
                  <th className="px-3 py-2 text-left">Amount</th>
                  <th className="px-3 py-2 text-left">Block</th>
                  <th className="px-3 py-2 text-left">Tx</th>
                </tr>
              </thead>
              <tbody>
                {audit.entries.map((e) => (
                  <tr key={e.requestId} className="border-b border-gray-900 last:border-0">
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          e.status === 'completed'
                            ? 'bg-green-500/20 text-green-300'
                            : 'bg-yellow-500/20 text-yellow-300'
                        }`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{shortHash(e.mirrorKey)}</td>
                    <td className="px-3 py-2">{e.amountWei ? formatCRwN(e.amountWei) : '—'} CRwN</td>
                    <td className="px-3 py-2 text-gray-400">{e.blockNumber}</td>
                    <td className="px-3 py-2">
                      <a
                        href={`https://testnet.snowtrace.io/tx/${e.executedTxHash ?? e.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-fuchsia-400 hover:text-fuchsia-300 underline"
                      >
                        {shortHash(e.executedTxHash ?? e.txHash)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Positions */}
      <section>
        <h2 className="text-xl font-bold mb-3">Live positions</h2>
        {loading && !positions ? (
          <div className="overflow-x-auto bg-gray-900/40 border border-gray-800 rounded">
            <table className="min-w-full text-sm">
              <tbody>
                <SkeletonTableRow columns={6} />
                <SkeletonTableRow columns={6} />
              </tbody>
            </table>
          </div>
        ) : !positions?.positions.length ? (
          <div className="p-6 text-center text-gray-500 bg-gray-900/40 border border-gray-800 rounded">
            <div className="text-3xl mb-2">💼</div>
            <p>No open mirror positions.</p>
            <Link
              href="/whale-tracker"
              className="inline-block mt-3 px-3 py-1.5 rounded-lg bg-fuchsia-600/20 hover:bg-fuchsia-600/40 border border-fuchsia-500/40 text-fuchsia-300 text-sm"
            >
              Find a whale to mirror →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto bg-gray-900/40 border border-gray-800 rounded">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-gray-400 uppercase border-b border-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left">Market</th>
                  <th className="px-3 py-2 text-left">Side</th>
                  <th className="px-3 py-2 text-right">Shares</th>
                  <th className="px-3 py-2 text-right">Avg / Now</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2 text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {positions.positions.map((p) => (
                  <tr key={`${p.mirrorKey}-${p.outcome}`} className="border-b border-gray-900 last:border-0">
                    <td className="px-3 py-2">
                      <div className="text-xs text-gray-500">{p.market?.source ?? 'mirror'}</div>
                      <div className="font-mono text-xs">{shortHash(p.mirrorKey)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          p.outcome === 'yes' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {p.outcome.toUpperCase()}
                      </span>
                      {p.usedVRF && (
                        <span className="ml-1 text-xs text-fuchsia-300" title="VRF copy trade">
                          🎲
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatCRwN(p.shares)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {(p.avgPrice * 100).toFixed(0)}% / {(p.currentPrice * 100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-2 text-right">{formatCRwN(p.value)}</td>
                    <td
                      className={`px-3 py-2 text-right font-semibold ${
                        parseFloat(p.pnl) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {parseFloat(p.pnl) >= 0 ? '+' : ''}
                      {formatCRwN(p.pnl)} ({p.pnlPercent >= 0 ? '+' : ''}
                      {p.pnlPercent.toFixed(2)}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-8 text-xs text-gray-500">
        <Link href="/whale-tracker" className="text-fuchsia-400 hover:text-fuchsia-300 underline">
          ← Back to Whale Tracker
        </Link>
        {' · '}
        <span>
          System caps: per-trade {safety?.system.perTradeCapWei ? formatCRwN(safety.system.perTradeCapWei) : '—'}{' '}
          CRwN, daily {safety?.system.perUserDailyCapWei ? formatCRwN(safety.system.perUserDailyCapWei) : '—'}{' '}
          CRwN, slippage {((safety?.system.maxSlippageBps ?? 0) / 100).toFixed(2)}%
        </span>
      </div>
    </main>
  );
}
