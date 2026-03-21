'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useDebateFull, usePhaseDurations } from '@/hooks/useDebate';
import { DebatePanel, ConsensusIndicator } from '@/components/debate';

export default function DebatePage() {
  const params = useParams();
  const debateId = params?.id ? BigInt(params.id as string) : null;

  // For now, using debateId as marketId and battleId (these would come from context in real app)
  const marketId = debateId;
  const battleId = BigInt(0);

  const {
    debate,
    consensus,
    consensusBreakdown,
    confidencePercent,
    predictions,
    participantCount,
    yesCount,
    noCount,
    timeline,
    canFinalize,
    loading,
    error
  } = useDebateFull(debateId, marketId, battleId);

  const { durationsFormatted } = usePhaseDurations();

  if (!debateId) {
    return (
      <div className="min-h-screen">
        <div className="container-arcade py-6 md:py-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Invalid Debate</h1>
          <Link href="/markets" className="text-red-400 hover:text-red-300">
            Browse Markets
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="container-arcade py-6 md:py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-800 rounded w-1/3 mb-4" />
            <div className="h-64 bg-gray-800 rounded-xl mb-4" />
            <div className="h-96 bg-gray-800 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !debate) {
    return (
      <div className="min-h-screen">
        <div className="container-arcade py-6 md:py-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Debate Not Found</h1>
          <p className="text-gray-400 mb-6">{error || 'This debate does not exist.'}</p>
          <Link href="/markets" className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500">
            Browse Markets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="container-arcade py-6 md:py-8">
        {/* Back Link */}
        <Link href="/markets" className="text-slate-400 hover:text-white mb-6 inline-block text-sm">
          ← Back to Markets
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl sm:text-2xl md:text-3xl text-red-400 mb-2 tracking-wider arcade-glow"
              style={{ fontFamily: 'Press Start 2P, monospace' }}>
            AI DEBATE #{debateId.toString()}
          </h1>
          <p className="text-slate-400 text-sm">Market #{marketId?.toString()}</p>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Main Debate Panel */}
          <div className="lg:col-span-2">
            <DebatePanel debate={debate} predictions={predictions} />
          </div>

          {/* Right Column - Consensus & Info */}
          <div className="space-y-6">
            {/* Consensus */}
            {consensus && (
              <ConsensusIndicator
                consensus={consensus}
                confidencePercent={confidencePercent}
                breakdown={consensusBreakdown}
              />
            )}

            {/* Phase Durations */}
            <div className="arcade-card p-6">
              <h3 className="text-yellow-400 font-bold mb-4 text-sm" style={{ fontFamily: 'Press Start 2P, monospace' }}>PHASE DURATIONS</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Prediction</span>
                  <span className="text-white">{durationsFormatted.prediction}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Evidence</span>
                  <span className="text-white">{durationsFormatted.evidence}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Rebuttal</span>
                  <span className="text-white">{durationsFormatted.rebuttal}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Dispute Period</span>
                  <span className="text-white">{durationsFormatted.dispute}</span>
                </div>
              </div>
            </div>

            {/* Vote Summary */}
            <div className="arcade-card p-6">
              <h3 className="text-yellow-400 font-bold mb-4 text-sm" style={{ fontFamily: 'Press Start 2P, monospace' }}>VOTE SUMMARY</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-green-400">{yesCount}</p>
                  <p className="text-sm text-gray-400">Yes</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-400">{noCount}</p>
                  <p className="text-sm text-gray-400">No</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{participantCount}</p>
                  <p className="text-sm text-gray-400">Total</p>
                </div>
              </div>
            </div>

            {/* Finalize Button */}
            {canFinalize && (
              <button className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors">
                Finalize Debate
              </button>
            )}
          </div>
        </div>

        {/* Timeline */}
        {timeline.length > 0 && (
          <div className="mt-8 arcade-card p-6">
            <h3 className="text-yellow-400 font-bold mb-4 text-sm" style={{ fontFamily: 'Press Start 2P, monospace' }}>EVENT TIMELINE</h3>
            <div className="space-y-4">
              {timeline.map((event, index) => (
                <div key={index} className="flex items-start gap-4">
                  <div className="w-2 h-2 rounded-full bg-red-500 mt-2" />
                  <div>
                    <p className="text-white text-sm">{event.description}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(Number(event.timestamp) * 1000).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
