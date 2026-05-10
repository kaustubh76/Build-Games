'use client';

/**
 * Last-resort error boundary for failures that escape `error.tsx` —
 * typically render exceptions inside the root layout itself (providers,
 * header, footer). Must own the `<html>` and `<body>` tags because the
 * root layout did not finish rendering.
 *
 * Keep markup tight and dependency-free — this runs in environments where
 * even basic providers may have failed.
 */

import React, { useEffect } from 'react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[app/global-error] root layout render failed', {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#0b0d12',
          color: '#e4e7eb',
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
      >
        <div
          style={{
            maxWidth: '32rem',
            padding: '1.5rem',
            background: 'rgba(239, 68, 68, 0.05)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '0.5rem',
          }}
        >
          <h1 style={{ fontSize: '1.25rem', color: '#fca5a5', marginTop: 0, marginBottom: '0.75rem' }}>
            Application failed to load
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'rgba(254, 202, 202, 0.85)', marginBottom: '1rem' }}>
            A critical error occurred before the page could initialize. Try refreshing.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: '0.75rem',
                color: 'rgba(252, 165, 165, 0.7)',
                fontFamily: 'monospace',
                marginBottom: '1rem',
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: '0.5rem 1rem',
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '0.25rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
