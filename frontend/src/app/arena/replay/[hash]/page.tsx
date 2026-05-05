import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  download as zgDownload,
  isZgConfigured,
} from '@/services/zgStorageService';

/**
 * Battle Replay Viewer — /arena/replay/[hash]
 *
 * Renders a stored prediction-battle record from 0G Storage. The `[hash]` is
 * either a 0G root hash (66-char hex) or a SHA-256 dataHash prefixed `0x`
 * (legacy fallback path through the existing /api/arena/storage GET).
 *
 * Server component: pulls the artifact at request time, no client fetch.
 * 0G-native: chain is the canonical record (battleDataHash on PredictionBattle),
 * the artifact lives content-addressed on 0G.
 */

interface BattleRound {
  roundNumber: number;
  warrior1: { argument: string; move: string; score: number; evidence: string[] };
  warrior2: { argument: string; move: string; score: number; evidence: string[] };
  roundWinner: string;
  judgeReasoning: string;
}

interface BattleRecord {
  version: string;
  battleId: string;
  timestamp: number;
  market: { externalId: string; source: string; question: string };
  warriors: Array<{
    id: number;
    owner: string;
    side: 'yes' | 'no';
    traits: { strength: number; wit: number; charisma: number; defence: number; luck: number };
    finalScore: number;
  }>;
  rounds: BattleRound[];
  outcome: string;
  totalScores: { warrior1: number; warrior2: number };
  stakes: string;
  betting?: { totalPool: string; warrior1Bets: string; warrior2Bets: string; totalBettors: number };
  dataHash: string;
}

async function loadRecord(hash: string): Promise<BattleRecord | null> {
  // 0G hashes are 66 chars (0x + 64). SHA-256 fallback hashes also start with 0x.
  // The 0G SDK accepts both with/without the 0x prefix; pass through as-is.
  if (!isZgConfigured()) return null;
  try {
    const data = await zgDownload(hash);
    return JSON.parse(data.toString()) as BattleRecord;
  } catch (err) {
    console.error('[arena/replay] 0G download failed', err);
    return null;
  }
}

function shortHash(h: string): string {
  if (!h || h.length < 12) return h;
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

function moveBadgeColor(move: string): string {
  switch (move?.toUpperCase()) {
    case 'STRIKE':
      return 'bg-red-500/20 text-red-300';
    case 'DODGE':
      return 'bg-blue-500/20 text-blue-300';
    case 'TAUNT':
      return 'bg-yellow-500/20 text-yellow-300';
    case 'SPECIAL':
      return 'bg-fuchsia-500/20 text-fuchsia-300';
    case 'RECOVER':
      return 'bg-green-500/20 text-green-300';
    default:
      return 'bg-gray-500/20 text-gray-300';
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hash: string }>;
}): Promise<Metadata> {
  const { hash } = await params;
  const record = await loadRecord(hash);
  if (!record) {
    return { title: 'Battle replay not found' };
  }
  const title = `${record.warriors[0]?.id ?? '?'} vs ${record.warriors[1]?.id ?? '?'} — ${record.outcome.toUpperCase()}`;
  return {
    title: `Replay: ${title}`,
    description: `Verifiable AI battle replay over ${record.rounds.length} rounds. Question: ${record.market.question}`,
    openGraph: {
      title: `Warriors AI-rena Battle Replay`,
      description: `${record.warriors[0]?.id} vs ${record.warriors[1]?.id} · ${record.outcome.toUpperCase()} · ${record.rounds.length} rounds`,
    },
  };
}

export default async function BattleReplayPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;

  if (!hash || hash.length < 32) {
    notFound();
  }

  const record = await loadRecord(hash);

  if (!record) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12 text-white">
        <h1 className="text-2xl sm:text-3xl font-bold mb-4">Battle replay unavailable</h1>
        <p className="text-gray-400 mb-6">
          We couldn&apos;t load the artifact at <code className="text-fuchsia-300">{shortHash(hash)}</code> from
          0G Storage. The hash may be invalid, the artifact may not have been
          persisted, or the 0G indexer may be momentarily unreachable.
        </p>
        <Link
          href="/arena"
          className="inline-block px-4 py-2 rounded-lg bg-fuchsia-600/30 hover:bg-fuchsia-600/50 text-fuchsia-200 text-sm"
        >
          ← Back to Arena
        </Link>
      </main>
    );
  }

  const w1 = record.warriors[0];
  const w2 = record.warriors[1];
  const winner =
    record.totalScores.warrior1 > record.totalScores.warrior2
      ? 'warrior1'
      : record.totalScores.warrior2 > record.totalScores.warrior1
      ? 'warrior2'
      : 'draw';

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 text-white">
      {/* Header */}
      <div className="mb-6">
        <Link href="/arena" className="text-sm text-gray-400 hover:text-white">
          ← Back to Arena
        </Link>
      </div>
      <header className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-purple-900/40 to-fuchsia-900/40 border border-fuchsia-500/40">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
            <div className="text-xs text-fuchsia-300 uppercase tracking-wider mb-1">
              Verifiable Battle Replay · v{record.version}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              Warrior #{w1?.id ?? '?'} vs Warrior #{w2?.id ?? '?'}
            </h1>
            <p className="text-gray-300 text-sm mt-2 max-w-2xl">
              {record.market.question}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">Outcome</div>
            <div
              className={`text-2xl font-bold ${
                winner === 'draw'
                  ? 'text-yellow-300'
                  : winner === 'warrior1'
                  ? 'text-green-300'
                  : 'text-red-300'
              }`}
            >
              {winner === 'draw' ? 'DRAW' : `Warrior #${winner === 'warrior1' ? w1?.id : w2?.id} wins`}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {record.totalScores.warrior1} – {record.totalScores.warrior2}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 pt-3 border-t border-fuchsia-500/20">
          <span>
            <span className="text-gray-500">Source:</span> {record.market.source}
          </span>
          <span>
            <span className="text-gray-500">Battle:</span>{' '}
            <code className="text-fuchsia-300">{shortHash(record.battleId)}</code>
          </span>
          <span>
            <span className="text-gray-500">Time:</span> {formatTime(record.timestamp)}
          </span>
          <span>
            <span className="text-gray-500">Stakes:</span> {record.stakes}
          </span>
          <span>
            <span className="text-gray-500">Hash:</span>{' '}
            <code className="text-green-300">{shortHash(record.dataHash)}</code>
          </span>
        </div>
      </header>

      {/* Warrior cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {[w1, w2].map((w, i) => {
          if (!w) return null;
          const isWinner =
            (i === 0 && winner === 'warrior1') || (i === 1 && winner === 'warrior2');
          return (
            <div
              key={i}
              className={`p-5 rounded-xl border ${
                isWinner
                  ? 'bg-green-500/10 border-green-400/40'
                  : 'bg-gray-900/40 border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs text-gray-500">Warrior #{w.id}</div>
                  <div className="text-lg font-bold">
                    Side: <span className={w.side === 'yes' ? 'text-green-300' : 'text-red-300'}>{w.side.toUpperCase()}</span>
                  </div>
                  <div className="text-xs text-gray-400 font-mono mt-1">{shortHash(w.owner)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Score</div>
                  <div className="text-2xl font-bold">{w.finalScore}</div>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                {(['strength', 'wit', 'charisma', 'defence', 'luck'] as const).map((stat) => (
                  <div key={stat} className="p-2 rounded bg-black/20">
                    <div className="text-gray-500 uppercase mb-0.5">{stat.slice(0, 3)}</div>
                    <div className="text-white font-bold">{w.traits[stat]}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Round-by-round */}
      <section>
        <h2 className="text-xl font-bold mb-4">Round-by-round breakdown</h2>
        <div className="space-y-4">
          {record.rounds.map((round) => (
            <div
              key={round.roundNumber}
              className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden"
            >
              <div className="px-4 py-2 bg-black/30 border-b border-gray-800 flex items-center justify-between">
                <div className="font-bold">Round {round.roundNumber}</div>
                <div className="text-xs">
                  Round winner:{' '}
                  <span
                    className={
                      round.roundWinner === 'draw'
                        ? 'text-yellow-300'
                        : round.roundWinner === 'warrior1'
                        ? 'text-green-300'
                        : 'text-red-300'
                    }
                  >
                    {round.roundWinner === 'draw' ? 'DRAW' : `Warrior #${round.roundWinner === 'warrior1' ? w1?.id : w2?.id}`}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-800">
                {[round.warrior1, round.warrior2].map((side, i) => (
                  <div key={i} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-gray-500">
                        Warrior #{i === 0 ? w1?.id : w2?.id}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${moveBadgeColor(side.move)}`}
                        >
                          {side.move?.toUpperCase() ?? '—'}
                        </span>
                        <span className="text-xs text-white font-bold">
                          +{side.score}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-200 leading-relaxed">{side.argument}</p>
                    {side.evidence?.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-gray-400">
                        {side.evidence.map((ev, j) => (
                          <li key={j} className="pl-2 border-l-2 border-fuchsia-500/30">
                            {ev}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
              {round.judgeReasoning && (
                <div className="px-4 py-3 border-t border-gray-800 bg-black/20">
                  <div className="text-xs text-gray-500 mb-1">Judge</div>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    {round.judgeReasoning}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Verifiability footer */}
      <section className="mt-10 p-5 rounded-xl border border-fuchsia-500/30 bg-gradient-to-br from-purple-900/20 to-fuchsia-900/20">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🔐</span>
          <div className="flex-1">
            <h3 className="font-bold mb-1">Verifiable on 0G Storage</h3>
            <p className="text-sm text-gray-300 mb-3">
              Every round, every argument, every score is content-addressed on 0G
              Storage. Anyone with this hash can re-fetch the same artifact and
              recompute the SHA-256 to verify it hasn&apos;t been tampered with.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <code className="flex-1 px-3 py-2 rounded bg-black/40 text-xs text-fuchsia-300 break-all">
                {hash}
              </code>
              <ShareButton hash={hash} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function ShareButton({ hash }: { hash: string }) {
  const url = `https://warriors-ai-rena.vercel.app/arena/replay/${hash}`;
  const tweet = `Verifiable AI battle replay 🪞⚔️\n${url}`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`;
  return (
    <a
      href={tweetUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="px-4 py-2 rounded bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold whitespace-nowrap"
    >
      Tweet replay
    </a>
  );
}
