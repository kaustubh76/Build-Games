// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/**
 * Tests for useFocusTrap. The hook is purely a DOM-side concern:
 *   - on activate, focus the first focusable inside the container
 *   - intercept Tab / Shift+Tab and wrap within the container
 *   - on deactivate, restore focus to the previously focused element
 *
 * happy-dom doesn't perfectly emulate browser focus semantics, but
 * covers enough of the API to pin the contract. The hook is small
 * enough that tightening it later won't churn these tests.
 */

interface DialogProps {
  active: boolean;
  children: React.ReactNode;
}

function Dialog({ active, children }: DialogProps) {
  const ref = useFocusTrap<HTMLDivElement>(active);
  return (
    <div ref={ref} data-testid="dialog">
      {children}
    </div>
  );
}

describe('useFocusTrap', () => {
  let outsideButton: HTMLButtonElement;

  beforeEach(() => {
    // A focusable element OUTSIDE the trap that we expect focus to
    // return to on deactivate.
    outsideButton = document.createElement('button');
    outsideButton.textContent = 'outside';
    document.body.appendChild(outsideButton);
    outsideButton.focus();
  });

  afterEach(() => {
    cleanup();
    if (outsideButton.parentNode) outsideButton.parentNode.removeChild(outsideButton);
  });

  it('on activate, focuses the first focusable inside the container', () => {
    render(
      <Dialog active={true}>
        <button data-testid="first">first</button>
        <button data-testid="second">second</button>
      </Dialog>
    );
    expect(document.activeElement?.textContent).toBe('first');
  });

  it('Tab on the LAST focusable wraps to the FIRST', () => {
    const { getByTestId } = render(
      <Dialog active={true}>
        <button data-testid="first">first</button>
        <button data-testid="last">last</button>
      </Dialog>
    );
    const last = getByTestId('last') as HTMLButtonElement;
    last.focus();
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement?.textContent).toBe('first');
  });

  it('Shift+Tab on the FIRST focusable wraps to the LAST', () => {
    const { getByTestId } = render(
      <Dialog active={true}>
        <button data-testid="first">first</button>
        <button data-testid="last">last</button>
      </Dialog>
    );
    const first = getByTestId('first') as HTMLButtonElement;
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement?.textContent).toBe('last');
  });

  it('Tab on a middle focusable does NOT wrap (browser default behavior)', () => {
    const { getByTestId } = render(
      <Dialog active={true}>
        <button data-testid="first">first</button>
        <button data-testid="middle">middle</button>
        <button data-testid="last">last</button>
      </Dialog>
    );
    const middle = getByTestId('middle') as HTMLButtonElement;
    middle.focus();
    // Tab from middle: hook should NOT preventDefault (browser handles
    // the natural advance to "last"). We verify by asserting focus
    // doesn't get wrapped to "first" — the hook's wrap only fires on
    // the boundary elements.
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement?.textContent).not.toBe('first');
  });

  it('disabled buttons are NOT focused as the initial element', () => {
    render(
      <Dialog active={true}>
        <button disabled data-testid="disabled">disabled</button>
        <button data-testid="enabled">enabled</button>
      </Dialog>
    );
    expect(document.activeElement?.textContent).toBe('enabled');
  });

  it('focuses the container itself if no children are focusable', () => {
    const { getByTestId } = render(
      <Dialog active={true}>
        <span>just a label</span>
      </Dialog>
    );
    const dialog = getByTestId('dialog');
    expect(document.activeElement).toBe(dialog);
    // Hook auto-sets tabindex so the container itself can hold focus.
    expect(dialog.getAttribute('tabindex')).toBe('-1');
  });

  it('restores focus to the previously focused element on deactivate', async () => {
    const { rerender } = render(
      <Dialog active={true}>
        <button data-testid="trap-button">inside</button>
      </Dialog>
    );
    expect(document.activeElement?.textContent).toBe('inside');

    rerender(
      <Dialog active={false}>
        <button data-testid="trap-button">inside</button>
      </Dialog>
    );

    // useFocusTrap restores via queueMicrotask; flush.
    await new Promise<void>((res) => queueMicrotask(() => res()));
    expect(document.activeElement).toBe(outsideButton);
  });

  it('inactive trap does NOT intercept Tab', () => {
    const { getByTestId } = render(
      <Dialog active={false}>
        <button data-testid="first">first</button>
        <button data-testid="last">last</button>
      </Dialog>
    );
    // outside button stays focused — no auto-focus into the dialog.
    expect(document.activeElement).toBe(outsideButton);
    // Tab is not intercepted; nothing wraps.
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(outsideButton);
  });

  it('toggling active=false then true does NOT throw', () => {
    const { rerender } = render(
      <Dialog active={true}>
        <button>x</button>
      </Dialog>
    );
    expect(() => rerender(<Dialog active={false}><button>x</button></Dialog>)).not.toThrow();
    expect(() => rerender(<Dialog active={true}><button>x</button></Dialog>)).not.toThrow();
  });
});
