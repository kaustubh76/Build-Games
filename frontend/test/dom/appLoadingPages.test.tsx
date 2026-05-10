// @vitest-environment happy-dom
/**
 * DOM smoke tests for the App Router loading.tsx skeletons.
 *
 * Same rationale as appErrorPages.test.tsx — these files are auto-mounted
 * by Next at runtime, so a missing default export or broken import would
 * only surface when the route actually suspends. Tests pin the rendering
 * shape so refactors of the shared Skeleton primitives can't silently
 * regress these.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import RootLoading from '@/app/loading';
import LeaderboardLoading from '@/app/leaderboard/loading';
import MarketsLoading from '@/app/markets/loading';
import PortfolioLoading from '@/app/portfolio/loading';

describe('App Router loading.tsx skeletons', () => {
  it('root loading renders without throwing and includes skeleton placeholders', () => {
    const { container } = render(<RootLoading />);
    // The shimmer elements are <div> tags with the `skeleton` class. We just
    // assert at least a few exist — the exact count isn't worth pinning to.
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(5);
  });

  it('leaderboard loading renders the list-style skeletons', () => {
    const { container } = render(<LeaderboardLoading />);
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(5);
  });

  it('markets loading renders market-card skeletons', () => {
    const { container } = render(<MarketsLoading />);
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(5);
  });

  it('portfolio loading renders stat-card + position skeletons', () => {
    const { container } = render(<PortfolioLoading />);
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(5);
  });
});
