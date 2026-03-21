'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useBattleMicroMarkets, useRoundMarkets } from '@/hooks/useMicroMarkets';
import { MicroMarketGrid, MicroMarketTradePanel } from '@/components/micro-markets';
import { type MicroMarketDisplay } from '@/services/microMarketService';

export default function MicroMarketsPage() {
  const params = useParams();
  const battleId = params?.battleId ? BigInt(params.battleId as string) : null;

  const { markets, groupedMarkets, loading, error } = useBattleMicroMarkets(battleId);
  const { rounds, currentRoundNumber } = useRoundMarkets(battleId);
  const [selectedMarket, setSelectedMarket] = useState<MicroMarketDisplay | null>(null);

  if (!battleId) {
    return (
      <div className="min-h-screen">
        <div className="container-arcade py-6 md:py-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Invalid Battle</h1>
          <Link href="/battles" className="text-red-400 hover:text-red-300">
            Browse Battles
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="container-arcade py-6 md:py-8">
        {/* Back Link */}
        <Link href="/prediction-arena" className="text-slate-400 hover:text-white mb-6 inline-block text-sm">
          ← Back to Arena
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl sm:text-2xl md:text-3xl text-red-400 mb-2 tracking-wider arcade-glow"
              style={{ fontFamily: 'Press Start 2P, monospace' }}>
            MICRO MARKETS
          </h1>
          <p className="text-slate-400 text-sm">Battle #{battleId.toString()} - Round {currentRoundNumber}</p>
        </div>

        {/* Round Tabs */}
        {rounds.length > 0 && (
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {rounds.map((round) => (
              <button
                key={round.roundNumber}
                className={`px-4 py-2 rounded-lg whitespace-nowrap ${
                  round.isActive
                    ? 'bg-red-600 text-white'
                    : round.isResolved
                    ? 'bg-gray-800 text-gray-400'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                Round {round.roundNumber}
                {round.isActive && <span className="ml-2 text-xs">Live</span>}
                {round.isResolved && <span className="ml-2 text-xs">Completed</span>}
              </button>
            ))}
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Markets Grid */}
          <div className="lg:col-span-2">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-gray-900 rounded-lg p-4 animate-pulse h-40" />
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-12 text-red-400">{error}</div>
            ) : markets.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                No micro markets available for this battle
              </div>
            ) : (
              <MicroMarketGrid
                markets={markets}
                groupedMarkets={groupedMarkets}
                onMarketSelect={setSelectedMarket}
                selectedMarketId={selectedMarket?.id ?? null}
              />
            )}
          </div>

          {/* Trade Panel */}
          <div className="lg:col-span-1">
            {selectedMarket ? (
              <MicroMarketTradePanel
                market={selectedMarket}
                onSuccess={() => {}}
              />
            ) : (
              <div className="arcade-card p-6 text-center">
                <p className="text-gray-400">Select a market to trade</p>
              </div>
            )}
          </div>
        </div>

        {/* Battle Warriors Info */}
        {groupedMarkets && (
          <div className="mt-8 arcade-card p-6">
            <h3 className="text-yellow-400 font-bold mb-4 text-sm" style={{ fontFamily: 'Press Start 2P, monospace' }}>BATTLE INFO</h3>
            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center text-2xl mb-2">
                  #{groupedMarkets.warrior1Id.toString()}
                </div>
                <span className="text-red-400 font-medium">Warrior 1</span>
              </div>
              <div className="text-3xl text-gray-600">VS</div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center text-2xl mb-2">
                  #{groupedMarkets.warrior2Id.toString()}
                </div>
                <span className="text-orange-400 font-medium">Warrior 2</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
