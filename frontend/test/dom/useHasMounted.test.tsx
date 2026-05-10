// @vitest-environment happy-dom
/**
 * Tests for useHasMounted — a one-line hook with two contracts:
 *   1. Returns false synchronously on first render.
 *   2. Returns true on every render after the mount effect runs.
 *
 * This is what makes it safe to gate Date.now() / Math.random() /
 * localStorage reads behind it: SSR and first-client render both see
 * `false`, so the rendered DOM matches and React doesn't mismatch.
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useHasMounted } from '@/hooks/useHasMounted';

function Probe({ onRender }: { onRender: (mounted: boolean) => void }) {
  const mounted = useHasMounted();
  onRender(mounted);
  return <div data-testid="probe">{mounted ? 'mounted' : 'not-mounted'}</div>;
}

describe('useHasMounted', () => {
  it('returns false synchronously on first render', () => {
    const seen: boolean[] = [];
    render(<Probe onRender={(v) => seen.push(v)} />);
    // First render must be false — that's the whole point.
    expect(seen[0]).toBe(false);
  });

  it('returns true on subsequent renders after the mount effect', async () => {
    const seen: boolean[] = [];
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<Probe onRender={(v) => seen.push(v)} />);
    });
    // After useEffect commits, render runs again with mounted=true.
    expect(seen.at(-1)).toBe(true);
    expect(result!.getByTestId('probe').textContent).toBe('mounted');
  });

  it('does not flip back to false on rerender', async () => {
    const seen: boolean[] = [];
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<Probe onRender={(v) => seen.push(v)} />);
    });
    await act(async () => {
      result!.rerender(<Probe onRender={(v) => seen.push(v)} />);
    });
    // Every render after the first should be true.
    expect(seen.slice(1).every((v) => v === true)).toBe(true);
  });
});
