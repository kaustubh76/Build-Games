// @vitest-environment happy-dom
import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { useClickOutside, useClickOutsideMultiple } from '@/hooks/useClickOutside';

/**
 * Tests for useClickOutside / useClickOutsideMultiple. Foundation hook
 * used by every dropdown, modal, and popover in the codebase.
 *
 * The bug we're closing: previously the handler was in the useEffect
 * deps. Consumers passing inline arrows (the dominant pattern) caused
 * the effect to tear down + rebuild the listener every render. The
 * ref-based stabilization keeps handler identity stable while still
 * calling the latest closure.
 */

interface DropdownProps {
  onOutside: () => void;
  enabled?: boolean;
}

function Dropdown({ onOutside, enabled = true }: DropdownProps) {
  const ref = useClickOutside<HTMLDivElement>(onOutside, enabled);
  return (
    <>
      <div ref={ref} data-testid="dropdown">
        <button data-testid="inside-btn">inside</button>
      </div>
      <button data-testid="outside-btn">outside</button>
    </>
  );
}

describe('useClickOutside', () => {
  afterEach(cleanup);

  it('fires the handler when clicking outside the ref', () => {
    const onOutside = vi.fn();
    const { getByTestId } = render(<Dropdown onOutside={onOutside} />);
    fireEvent.mouseDown(getByTestId('outside-btn'));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when clicking inside the ref', () => {
    const onOutside = vi.fn();
    const { getByTestId } = render(<Dropdown onOutside={onOutside} />);
    fireEvent.mouseDown(getByTestId('inside-btn'));
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('does NOT fire when clicking the ref element itself', () => {
    const onOutside = vi.fn();
    const { getByTestId } = render(<Dropdown onOutside={onOutside} />);
    fireEvent.mouseDown(getByTestId('dropdown'));
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('responds to touchstart in addition to mousedown', () => {
    const onOutside = vi.fn();
    const { getByTestId } = render(<Dropdown onOutside={onOutside} />);
    fireEvent.touchStart(getByTestId('outside-btn'));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when disabled', () => {
    const onOutside = vi.fn();
    const { getByTestId } = render(<Dropdown onOutside={onOutside} enabled={false} />);
    fireEvent.mouseDown(getByTestId('outside-btn'));
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('cleans up the listener on unmount (no leak)', () => {
    const onOutside = vi.fn();
    const { getByTestId, unmount } = render(<Dropdown onOutside={onOutside} />);
    fireEvent.mouseDown(getByTestId('outside-btn'));
    expect(onOutside).toHaveBeenCalledTimes(1);

    unmount();
    // Re-fire on a fresh element; the unmounted hook should NOT respond.
    const detached = document.createElement('button');
    document.body.appendChild(detached);
    fireEvent.mouseDown(detached);
    expect(onOutside).toHaveBeenCalledTimes(1);
    document.body.removeChild(detached);
  });

  it('latest handler wins when consumer re-renders with a new closure (regression fix)', () => {
    // Before the ref fix, swapping the handler still worked but caused
    // listener churn (remove + add every render). After the fix, the
    // listener is added once; the latest handler still fires because
    // the ref is updated on each render.
    function Wrapper() {
      const [count, setCount] = useState(0);
      // Inline arrow — new ref every render
      const ref = useClickOutside<HTMLDivElement>(() => setCount((c) => c + 1));
      return (
        <>
          <div ref={ref} data-testid="dropdown">inside</div>
          <button data-testid="outside-btn">outside</button>
          <span data-testid="count">{count}</span>
        </>
      );
    }
    const { getByTestId } = render(<Wrapper />);
    fireEvent.mouseDown(getByTestId('outside-btn'));
    expect(getByTestId('count').textContent).toBe('1');
    fireEvent.mouseDown(getByTestId('outside-btn'));
    expect(getByTestId('count').textContent).toBe('2');
  });
});

describe('useClickOutsideMultiple', () => {
  afterEach(cleanup);

  function MultiDropdown({ onOutside }: { onOutside: () => void }) {
    const refs = useClickOutsideMultiple<HTMLDivElement>(onOutside, 2);
    return (
      <>
        <div ref={refs[0]} data-testid="region-a">
          <button data-testid="a-inside">a-inside</button>
        </div>
        <div ref={refs[1]} data-testid="region-b">
          <button data-testid="b-inside">b-inside</button>
        </div>
        <button data-testid="outside-btn">outside</button>
      </>
    );
  }

  it('does NOT fire when clicking inside any of the registered refs', () => {
    const onOutside = vi.fn();
    const { getByTestId } = render(<MultiDropdown onOutside={onOutside} />);
    fireEvent.mouseDown(getByTestId('a-inside'));
    fireEvent.mouseDown(getByTestId('b-inside'));
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('fires when clicking outside ALL of the registered refs', () => {
    const onOutside = vi.fn();
    const { getByTestId } = render(<MultiDropdown onOutside={onOutside} />);
    fireEvent.mouseDown(getByTestId('outside-btn'));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('returns the requested number of refs', () => {
    let captured: React.RefObject<HTMLDivElement | null>[] = [];
    function Probe() {
      captured = useClickOutsideMultiple<HTMLDivElement>(() => {}, 4);
      return null;
    }
    render(<Probe />);
    expect(captured.length).toBe(4);
  });
});
