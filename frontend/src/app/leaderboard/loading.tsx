/**
 * Leaderboard route loading skeleton — list-style, matches the actual
 * page so the visual transition is minimal.
 */
import React from 'react';
import { Skeleton, SkeletonLeaderboardEntry } from '@/components/ui/skeleton';

export default function LeaderboardLoading() {
  return (
    <main className="container mx-auto px-4 py-8 md:py-12">
      <div className="text-center mb-12">
        <Skeleton height={32} width={240} className="mx-auto mb-4" />
        <Skeleton height={14} width={320} className="mx-auto" />
      </div>
      <div className="max-w-4xl mx-auto space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonLeaderboardEntry key={i} />
        ))}
      </div>
    </main>
  );
}
