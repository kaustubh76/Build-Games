/**
 * Markets route loading skeleton — grid of market cards.
 */
import React from 'react';
import { Skeleton, SkeletonMarketCard } from '@/components/ui/skeleton';

export default function MarketsLoading() {
  return (
    <main className="container mx-auto px-4 py-8 md:py-12">
      <div className="mb-8">
        <Skeleton height={32} width={200} className="mb-3" />
        <Skeleton height={16} width="40%" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonMarketCard key={i} />
        ))}
      </div>
    </main>
  );
}
