'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { INFTBadge } from '@/components/agents/INFTBadge';

interface AgentDetail {
  tokenId: string;
  owner: string;
  encryptedMetadataRef: string;
  metadataHash: string;
  onChainData: {
    tier: number;
    stakedAmount: string;
    isActive: boolean;
    copyTradingEnabled: boolean;
    createdAt: string;
    lastUpdatedAt: string;
  };
  performance?: {
    totalTrades: string;
    winningTrades: string;
    totalPnL: string;
    accuracyBps: string;
  };
}

function shortHash(h: string): string {
  if (!h || h.length < 12) return h;
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

const TIER_NAMES = ['Novice', 'Apprentice', 'Expert', 'Master', 'Grandmaster'];

interface VerifyHashResult {
  match: boolean;
  onChainHash: string;
  computedHash?: string;
  ref?: string | null;
  sizeBytes?: number;
  message: string;
  reason?: string;
  code?: string;
}

export default function AgentStrategyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyHashResult | null>(null);

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch(`/api/agents/${id}/verify-hash`);
      const json = (await res.json()) as VerifyHashResult;
      setVerifyResult(json);
    } catch (e) {
      setVerifyResult({
        match: false,
        onChainHash: '',
        message: e instanceof Error ? e.message : 'Verification failed',
        reason: 'network',
      });
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/agents/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json && json.tokenId) setAgent(json);
        else if (json?.success && json.agent) setAgent(json.agent);
        else setError(json?.error ?? 'Agent not found');
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-white">
      <div className="mb-6">
        <Link href={`/ai-agents/${id}`} className="text-sm text-gray-400 hover:text-white">
          ← Back to agent
        </Link>
      </div>

      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <INFTBadge size="lg" showLabel />
          <h1 className="text-2xl sm:text-3xl font-bold">Agent #{id} · Strategy</h1>
        </div>
        <p className="text-gray-400 text-sm max-w-2xl">
          This agent&apos;s trading strategy is stored as <strong>encrypted metadata</strong> on
          decentralized storage. The on-chain contract holds only a content hash and an
          encrypted reference; the strategy itself is unreadable without proxy re-encryption
          authorization from the owner.
        </p>
      </header>

      {loading && <div className="p-8 text-center text-gray-500">Loading agent…</div>}
      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500/40 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {agent && (
        <>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-800">
              <div className="text-xs text-gray-500">Tier</div>
              <div className="text-lg font-bold mt-1">
                {TIER_NAMES[agent.onChainData.tier] ?? `T${agent.onChainData.tier}`}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-800">
              <div className="text-xs text-gray-500">Status</div>
              <div className="text-lg font-bold mt-1">
                {agent.onChainData.isActive ? (
                  <span className="text-green-400">Active</span>
                ) : (
                  <span className="text-gray-400">Inactive</span>
                )}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-800">
              <div className="text-xs text-gray-500">Copy trading</div>
              <div className="text-lg font-bold mt-1">
                {agent.onChainData.copyTradingEnabled ? (
                  <span className="text-fuchsia-400">Enabled</span>
                ) : (
                  <span className="text-gray-400">Disabled</span>
                )}
              </div>
            </div>
          </section>

          <section className="p-5 rounded-xl border border-fuchsia-500/30 bg-gradient-to-br from-purple-900/20 to-fuchsia-900/20 mb-6">
            <h2 className="font-bold flex items-center gap-2 mb-3">
              🔐 Encrypted strategy artifact
            </h2>
            <div className="space-y-2 text-sm">
              <div>
                <div className="text-xs text-gray-500">Encrypted metadata ref (storage URI)</div>
                <code className="block mt-1 px-3 py-2 rounded bg-black/40 text-xs text-fuchsia-300 break-all">
                  {agent.encryptedMetadataRef || '(empty)'}
                </code>
              </div>
              <div>
                <div className="text-xs text-gray-500">SHA-256 metadata hash</div>
                <code className="block mt-1 px-3 py-2 rounded bg-black/40 text-xs text-green-300 break-all">
                  {agent.metadataHash}
                </code>
              </div>
              <div>
                <div className="text-xs text-gray-500">Owner</div>
                <code className="block mt-1 px-3 py-2 rounded bg-black/40 text-xs text-gray-300 break-all">
                  {agent.owner}
                </code>
              </div>

              {/* Verify integrity */}
              <div className="pt-2 border-t border-fuchsia-500/20">
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={verifying}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold text-white"
                >
                  {verifying ? '🔐 Verifying…' : '🔐 Verify integrity'}
                </button>
                {verifyResult && (
                  <div
                    className={`mt-3 p-3 rounded text-xs ${
                      verifyResult.match
                        ? 'bg-green-500/10 border border-green-500/40 text-green-200'
                        : verifyResult.code === 'STORAGE_UNAVAILABLE'
                        ? 'bg-yellow-500/10 border border-yellow-500/40 text-yellow-200'
                        : 'bg-red-500/10 border border-red-500/40 text-red-200'
                    }`}
                  >
                    <div className="font-bold mb-1">
                      {verifyResult.match
                        ? '✓ Hash matches'
                        : verifyResult.code === 'STORAGE_UNAVAILABLE'
                        ? '⚠️ Storage unavailable'
                        : '✗ Hash mismatch'}
                    </div>
                    <div className="text-xs opacity-90 mb-2">{verifyResult.message}</div>
                    {verifyResult.computedHash && (
                      <div className="space-y-1">
                        <div>
                          <span className="opacity-60">on-chain:</span>{' '}
                          <code className="break-all">{verifyResult.onChainHash}</code>
                        </div>
                        <div>
                          <span className="opacity-60">computed:</span>{' '}
                          <code className="break-all">{verifyResult.computedHash}</code>
                        </div>
                        {verifyResult.sizeBytes !== undefined && (
                          <div className="opacity-60">
                            artifact size: {verifyResult.sizeBytes} bytes
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="p-5 rounded-xl border border-gray-800 bg-gray-900/40 mb-6">
            <h2 className="font-bold mb-3">How verification works</h2>
            <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
              <li>
                The contract <code className="text-fuchsia-300">AIAgentINFT</code> stores the
                encrypted reference and a SHA-256 of the cleartext strategy.
              </li>
              <li>
                When you follow this agent for copy trading, the on-chain
                <code className="text-fuchsia-300"> CopyTradeStarted</code> event proves your
                authorization is recorded.
              </li>
              <li>
                When the owner transfers the iNFT, the contract requires a
                re-encryption proof (<code className="text-fuchsia-300">transferWithReEncryption</code>),
                so the new owner can decrypt and the old owner cannot.
              </li>
              <li>
                Any trade by the agent emits <code className="text-fuchsia-300">TradeRecorded</code>
                or <code className="text-fuchsia-300">ExternalTradeRecorded</code> on-chain — fully auditable
                without revealing the underlying strategy.
              </li>
            </ol>
          </section>

          {agent.performance && (
            <section className="p-5 rounded-xl border border-gray-800 bg-gray-900/40">
              <h2 className="font-bold mb-3">Performance (on-chain only)</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">Total trades</div>
                  <div className="font-bold">{agent.performance.totalTrades}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Wins</div>
                  <div className="font-bold">{agent.performance.winningTrades}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Total PnL</div>
                  <div className="font-bold">{agent.performance.totalPnL}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Accuracy</div>
                  <div className="font-bold">
                    {(parseInt(agent.performance.accuracyBps || '0') / 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
