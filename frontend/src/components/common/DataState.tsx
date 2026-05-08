'use client';

/**
 * <DataState> — the canonical loading / error / empty / loaded wrapper.
 *
 * Pages that fetch data should wrap their main content in this so we always
 * surface the same shape across the product. Mirrors the patterns already
 * established in UnifiedPortfolio.tsx (the inline loading spinner, the red
 * error card with retry, the centered empty state with icon/title/hint).
 *
 * Usage:
 *
 *   <DataState
 *     loading={isLoading}
 *     error={error}
 *     empty={positions.length === 0}
 *     emptyTitle="No positions yet"
 *     emptyHint="Place your first mirror trade to get started."
 *     emptyCta={{ label: 'Browse markets', href: '/markets' }}
 *     onRetry={refetch}
 *   >
 *     <PortfolioTable positions={positions} />
 *   </DataState>
 */

import React, { type ReactNode } from 'react';
import Link from 'next/link';

export interface DataStateCta {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface DataStateProps {
  /** True while data is being fetched. Renders the loading branch. */
  loading?: boolean;
  /** Truthy when fetch failed. Renders the error branch with retry button. */
  error?: string | Error | null;
  /** True when fetch succeeded but data array is []. Renders empty branch. */
  empty?: boolean;
  /** Title shown in empty state. Default: "Nothing here yet". */
  emptyTitle?: string;
  /** Hint shown below the empty title. */
  emptyHint?: string;
  /** Optional CTA in the empty state (link or button). */
  emptyCta?: DataStateCta;
  /** Optional retry callback for the error state. */
  onRetry?: () => void;
  /** Custom skeleton override. Default: spinner + "Loading..." text. */
  loadingSkeleton?: ReactNode;
  /** Optional loading caption shown next to the spinner. */
  loadingCaption?: string;
  /** Children render only when not loading, no error, and not empty. */
  children: ReactNode;
}

function defaultErrorMessage(err: string | Error): string {
  if (typeof err === 'string') return err;
  return err.message || 'Something went wrong';
}

function DefaultSkeleton({ caption }: { caption?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
      <span className="ml-3 text-gray-400">{caption ?? 'Loading…'}</span>
    </div>
  );
}

export function DataState({
  loading,
  error,
  empty,
  emptyTitle = 'Nothing here yet',
  emptyHint,
  emptyCta,
  onRetry,
  loadingSkeleton,
  loadingCaption,
  children,
}: DataStateProps) {
  // Loading takes precedence — we don't show stale errors during a refetch.
  if (loading) {
    return <>{loadingSkeleton ?? <DefaultSkeleton caption={loadingCaption} />}</>;
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <p className="text-red-400">{defaultErrorMessage(error)}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 text-sm transition-colors"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (empty) {
    return (
      <div className="text-center py-12">
        <svg
          className="w-16 h-16 mx-auto text-gray-600 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
        <h3 className="text-lg font-medium text-gray-400 mb-2">{emptyTitle}</h3>
        {emptyHint ? <p className="text-gray-500 text-sm">{emptyHint}</p> : null}
        {emptyCta ? (
          <div className="mt-4">
            {emptyCta.href ? (
              <Link
                href={emptyCta.href}
                className="inline-block px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 text-sm transition-colors"
              >
                {emptyCta.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={emptyCta.onClick}
                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 text-sm transition-colors"
              >
                {emptyCta.label}
              </button>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return <>{children}</>;
}
