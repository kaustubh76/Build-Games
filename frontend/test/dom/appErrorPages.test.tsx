// @vitest-environment happy-dom
/**
 * DOM smoke tests for the App Router error/404 pages.
 *
 * Why: these files are auto-mounted by Next at runtime — there's no
 * import-site to typecheck them against. Without these tests, a typo
 * (missing default export, broken JSX) would only surface in production
 * when something actually threw.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import RootError from '@/app/error';
import NotFound from '@/app/not-found';

describe('app/error.tsx', () => {
  it('renders the message + the digest reference when present', () => {
    const err = Object.assign(new Error('boom'), { digest: 'NEXT_DIGEST_ABC' });
    render(<RootError error={err} reset={() => {}} />);
    expect(screen.getByText(/Something went wrong/i)).toBeTruthy();
    expect(screen.getByText('NEXT_DIGEST_ABC')).toBeTruthy();
  });

  it('hides the digest line when the error has no digest', () => {
    render(<RootError error={new Error('boom')} reset={() => {}} />);
    expect(screen.queryByText(/Reference:/)).toBeNull();
  });

  it('calls reset when the user clicks "Try again"', () => {
    const reset = vi.fn();
    render(<RootError error={new Error('boom')} reset={reset} />);
    fireEvent.click(screen.getByText('Try again'));
    expect(reset).toHaveBeenCalledOnce();
  });
});

describe('app/not-found.tsx', () => {
  it('renders the 404 heading and core nav links', () => {
    render(<NotFound />);
    expect(screen.getByText(/Page not found/i)).toBeTruthy();
    // Core nav links should all be present.
    for (const label of ['Home', 'Markets', 'Arena', 'Leaderboard', 'Whale Tracker']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});
