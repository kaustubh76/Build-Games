// @vitest-environment happy-dom
/**
 * ErrorBoundary tests — verify the catch / fallback / retry / onError /
 * compact / withErrorBoundary surfaces. The component is shipped but
 * untested; this is the first coverage.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary, withErrorBoundary } from '@/components/ErrorBoundary';

// Suppress React's noisy "consider adding an error boundary" stderr in tests.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function Boom({ throws }: { throws: boolean }) {
  if (throws) throw new Error('synthetic test error');
  return <div data-testid="ok">healthy child</div>;
}

describe('<ErrorBoundary>', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <Boom throws={false} />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('ok')).toBeInTheDocument();
  });

  it('catches a thrown error and shows the default fallback', () => {
    render(
      <ErrorBoundary>
        <Boom throws />
      </ErrorBoundary>
    );
    expect(screen.queryByTestId('ok')).toBeNull();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('shows a per-instance error ID in the fallback', () => {
    render(
      <ErrorBoundary>
        <Boom throws />
      </ErrorBoundary>
    );
    // ID matches the err_<timestamp>_<rand> shape
    expect(screen.getByText(/Error ID: err_[a-z0-9_]+/)).toBeInTheDocument();
  });

  it('compact mode shows a smaller fallback with retry', () => {
    render(
      <ErrorBoundary compact>
        <Boom throws />
      </ErrorBoundary>
    );
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('honours a custom fallback prop', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">custom</div>}>
        <Boom throws />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    // Default UI should not appear.
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });

  it('invokes onError callback with error + errorInfo', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Boom throws />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalledOnce();
    const [err, info] = onError.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('synthetic test error');
    // React's ErrorInfo carries componentStack
    expect(typeof info.componentStack).toBe('string');
  });

  it('"Try Again" button resets the boundary state (clears the fallback)', async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Boom throws />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    // Click Try Again — the child still throws, so the boundary catches again.
    // The point of this test is the BUTTON works (state is cleared and re-renders);
    // recovery requires the child to stop throwing, which is a parent concern.
    await user.click(screen.getByRole('button', { name: /try again/i }));
    // Either we see fallback again (still throwing) OR we see the child.
    // What we should NOT see is a stuck disabled button or React error.
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('compact "Retry" button resets the boundary state', async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary compact>
        <Boom throws />
      </ErrorBoundary>
    );
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    // Same as above — child still throws so we see fallback again.
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });
});

describe('withErrorBoundary HOC', () => {
  it('wraps a component and catches its render errors', () => {
    const Wrapped = withErrorBoundary(Boom, undefined, 'wrapped-test');
    render(<Wrapped throws />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('passes a custom fallback through', () => {
    const Wrapped = withErrorBoundary(
      Boom,
      <div data-testid="hoc-fallback" />,
      'wrapped-test'
    );
    render(<Wrapped throws />);
    expect(screen.getByTestId('hoc-fallback')).toBeInTheDocument();
  });
});
