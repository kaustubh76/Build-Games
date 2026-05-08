// @vitest-environment happy-dom
/**
 * <DataState> DOM tests — verify each of the four branches renders correctly:
 * loading, error, empty, loaded. Plus the optional retry + empty CTA paths.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataState } from '@/components/common/DataState';

describe('<DataState>', () => {
  it('renders loading branch when loading is true', () => {
    render(
      <DataState loading={true}>
        <div data-testid="content">should-not-show</div>
      </DataState>
    );
    expect(screen.queryByTestId('content')).toBeNull();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('honours a custom loadingCaption', () => {
    render(
      <DataState loading loadingCaption="Fetching whales…">
        <div />
      </DataState>
    );
    expect(screen.getByText('Fetching whales…')).toBeInTheDocument();
  });

  it('honours a custom loadingSkeleton', () => {
    render(
      <DataState loading loadingSkeleton={<div data-testid="custom">skeleton</div>}>
        <div />
      </DataState>
    );
    expect(screen.getByTestId('custom')).toBeInTheDocument();
  });

  it('renders error branch with string error', () => {
    render(
      <DataState error="Network failure">
        <div data-testid="content" />
      </DataState>
    );
    expect(screen.getByText('Network failure')).toBeInTheDocument();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('renders error branch with Error object', () => {
    render(
      <DataState error={new Error('RPC down')}>
        <div />
      </DataState>
    );
    expect(screen.getByText('RPC down')).toBeInTheDocument();
  });

  it('shows Retry button only when onRetry is provided', () => {
    const { rerender } = render(
      <DataState error="oops">
        <div />
      </DataState>
    );
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();

    rerender(
      <DataState error="oops" onRetry={() => {}}>
        <div />
      </DataState>
    );
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('clicking Retry invokes onRetry', async () => {
    const onRetry = vi.fn();
    render(
      <DataState error="oops" onRetry={onRetry}>
        <div />
      </DataState>
    );
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders empty branch with title and hint', () => {
    render(
      <DataState empty emptyTitle="No agents" emptyHint="Create your first agent">
        <div data-testid="content" />
      </DataState>
    );
    expect(screen.getByText('No agents')).toBeInTheDocument();
    expect(screen.getByText('Create your first agent')).toBeInTheDocument();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('empty CTA with href renders a link', () => {
    render(
      <DataState
        empty
        emptyTitle="None"
        emptyCta={{ label: 'Browse', href: '/markets' }}
      >
        <div />
      </DataState>
    );
    const link = screen.getByRole('link', { name: /browse/i });
    expect(link).toHaveAttribute('href', '/markets');
  });

  it('empty CTA with onClick renders a button and calls handler', async () => {
    const onClick = vi.fn();
    render(
      <DataState empty emptyCta={{ label: 'Refresh', onClick }}>
        <div />
      </DataState>
    );
    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders children when not loading, no error, not empty', () => {
    render(
      <DataState>
        <div data-testid="content">data</div>
      </DataState>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('loading takes precedence over error (avoid stale errors during refetch)', () => {
    render(
      <DataState loading error="stale">
        <div data-testid="content" />
      </DataState>
    );
    expect(screen.queryByText('stale')).toBeNull();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('error takes precedence over empty', () => {
    render(
      <DataState error="nope" empty emptyTitle="None">
        <div />
      </DataState>
    );
    expect(screen.getByText('nope')).toBeInTheDocument();
    expect(screen.queryByText('None')).toBeNull();
  });
});
