/**
 * Root-segment loading skeleton.
 *
 * Next.js App Router auto-mounts this whenever a server component is
 * suspended (route transition, async data). Without it, navigation
 * shows a blank page until the new route resolves — measurable LCP
 * regression and confusing UX.
 *
 * Per-route loading.tsx files override this where the layout differs
 * enough that a generic skeleton looks wrong.
 */
import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function RootLoading() {
  return (
    <main className="container mx-auto px-4 py-8 md:py-12">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <Skeleton height={32} width="40%" className="mx-auto mb-3" />
          <Skeleton height={16} width="55%" className="mx-auto" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-gray-800/40 border border-gray-700 rounded-xl p-5"
            >
              <Skeleton height={20} width="60%" className="mb-3" />
              <Skeleton height={14} width="90%" className="mb-2" />
              <Skeleton height={14} width="75%" className="mb-4" />
              <div className="flex gap-2">
                <Skeleton height={32} className="flex-1" rounded="md" />
                <Skeleton height={32} className="flex-1" rounded="md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
