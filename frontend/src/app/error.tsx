'use client';

/**
 * Root-segment error boundary. Next.js App Router auto-wraps every page
 * under this segment with this component, so a render exception in any
 * route shows a graceful retry UI instead of a blank tab.
 *
 * Notes:
 *   - Must be a client component (Next requirement for error.tsx).
 *   - Receives `error` (the thrown Error) and `reset` (rerun the segment).
 *   - We deliberately keep the markup simple — a richer per-page boundary
 *     can still be added in-page; this is only the last-line backstop.
 */

import React, { useEffect } from 'react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[app/error] caught render error', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-lg w-full p-6 bg-red-500/5 border border-red-500/30 rounded-lg">
        <h2 className="text-xl font-semibold text-red-300 mb-2">Something went wrong</h2>
        <p className="text-sm text-red-200/80 mb-4">
          We hit an unexpected error rendering this page. The team has been notified.
        </p>
        {error.digest && (
          <p className="text-xs text-red-400/70 font-mono mb-4">
            Reference: <span className="select-all">{error.digest}</span>
          </p>
        )}
        {process.env.NODE_ENV !== 'production' && (
          <pre className="mb-4 p-3 bg-red-900/40 rounded text-xs text-red-200/90 overflow-auto max-h-48">
            {error.message}
            {'\n\n'}
            {error.stack}
          </pre>
        )}
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="px-4 py-2 border border-red-500/30 hover:bg-red-500/10 text-red-200 text-sm rounded transition-colors"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
