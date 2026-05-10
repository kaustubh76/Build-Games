/**
 * Portfolio route loading skeleton — stat cards on top, position list below.
 */
import React from 'react';
import { Skeleton, SkeletonStatCard } from '@/components/ui/skeleton';

export default function PortfolioLoading() {
  return (
    <main className="container mx-auto px-4 py-8 md:py-12">
      <div className="mb-8">
        <Skeleton height={32} width={200} className="mb-3" />
        <Skeleton height={16} width="35%" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-gray-800/40 border border-gray-700 rounded-xl p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <Skeleton height={16} width={80} rounded="full" className="mb-3" />
                <Skeleton height={20} width="80%" className="mb-2" />
                <Skeleton height={12} width="30%" />
              </div>
              <div className="flex gap-4">
                <Skeleton height={48} width={64} />
                <Skeleton height={48} width={64} />
                <Skeleton height={48} width={80} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
