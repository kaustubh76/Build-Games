'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';

interface ReplayEntry {
  battleId: string;
  dataHash: string;
  blockNumber: number;
  txHash: string;
}

interface ReplayPayload {
  entries: ReplayEntry[];
  total?: number;
  note?: string;
  cached?: boolean;
}

function shortHash(h: string): string {
  if (!h || h.length < 12) return h;
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

export default function ReplaysIndexPage() {
  const [data, setData] = useState<ReplayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/arena/replays?limit=50')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load replays');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 text-white">
      <div className="mb-6">
        <Link href="/arena" className="text-sm text-gray-400 hover:text-white">
          ← Back to Arena
        </Link>
      </div>

      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">🪞 Battle Replays</h1>
        <p className="text-gray-400 text-sm max-w-2xl">
          Every completed battle is stored on 0G Storage and indexed by its
          on-chain <code className="text-fuchsia-300">BattleDataStored</code> event.
          Anyone can replay it round-by-round and verify the artifact hasn&apos;t
          been tampered with.
        </p>
      </header>

      {loading && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 mb-2">Scanning on-chain events…</p>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 rounded-xl bg-gray-900/40 border border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex-1 mr-4">
                  <Skeleton width={100} height={16} className="mb-2" />
                  <Skeleton width={180} height={12} />
                </div>
                <div className="text-right">
                  <Skeleton width={60} height={12} className="mb-2 ml-auto" />
                  <Skeleton width={80} height={12} className="ml-auto" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500/40 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {data.note && (
            <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-300 text-sm">
              {data.note}
            </div>
          )}
          {data.entries.length === 0 ? (
            <div className="p-8 text-center text-gray-500 bg-gray-900/40 border border-gray-800 rounded-xl">
              <div className="text-4xl mb-2">⚔️</div>
              <p>No completed battles yet.</p>
              <p className="text-xs mt-2 mb-4">
                Replays appear here as soon as Game Master finalizes a battle and stores its 0G hash on-chain.
              </p>
              <Link
                href="/arena"
                className="inline-block px-3 py-1.5 rounded-lg bg-fuchsia-600/20 hover:bg-fuchsia-600/40 border border-fuchsia-500/40 text-fuchsia-300 text-sm"
              >
                Go to Arena →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {data.entries.map((e) => (
                <Link
                  key={`${e.battleId}-${e.dataHash}`}
                  href={`/arena/replay/${e.dataHash}`}
                  className="block p-4 rounded-xl bg-gray-900/40 hover:bg-gray-900/70 border border-gray-800 hover:border-fuchsia-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold">Battle #{e.battleId}</div>
                      <div className="text-xs text-gray-500 font-mono mt-1">
                        {shortHash(e.dataHash)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">block</div>
                      <div className="text-xs font-mono text-gray-300">{e.blockNumber}</div>
                      <div className="text-xs text-fuchsia-400 mt-1">View replay →</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <div className="mt-6 text-xs text-gray-500">
            {data.total !== undefined && (
              <>
                {data.entries.length} of {data.total} replays · indexed from on-chain events ·{' '}
                {data.cached ? 'cached' : 'fresh'}
              </>
            )}
          </div>
        </>
      )}
    </main>
  );
}
