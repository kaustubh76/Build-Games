'use client';

/**
 * useFocusTrap — keep keyboard focus inside a modal dialog.
 *
 * Sighted users dismiss a modal by pressing Esc or clicking the close
 * button. Keyboard-only users tab through it. Without a trap, Tab walks
 * out of the dialog and into the page below — which the modal is meant
 * to be modal *over* — losing the user's place and exposing controls
 * the modal is hiding.
 *
 * Usage:
 *
 *   const ref = useFocusTrap<HTMLDivElement>(isOpen);
 *   return <div ref={ref} role="dialog" aria-modal="true">...</div>;
 *
 * The hook:
 *   1. Captures the currently-focused element when the trap activates.
 *   2. Moves focus to the first focusable element inside the container
 *      (or the container itself if none, so Esc still works).
 *   3. Intercepts Tab / Shift+Tab and wraps within the container.
 *   4. On deactivate (close), restores focus to the original element.
 *
 * Deliberately small: no portal handling, no inert-everywhere-else, no
 * polyfills. The modals already render in document order and use
 * `aria-modal="true"`; assistive tech can use that to filter siblings.
 *
 * Limitations:
 *   - If focusable elements appear inside the container AFTER mount
 *     (lazy lists, async data), they ARE included on the next Tab —
 *     we re-query on each keypress, which is cheap.
 *   - If the previously focused element is removed from the DOM
 *     between activation and deactivation, restore is a no-op.
 *   - Doesn't handle `display: none` perfectly; we filter on
 *     `offsetParent !== null` which catches most hidden-via-CSS cases.
 */

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
  const all = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return all.filter((el) => {
    // offsetParent === null → element is `display: none` (or a fixed
    // descendant of a hidden ancestor). Skip those.
    if (el.offsetParent === null && el.tagName !== 'BODY') return false;
    if (el.hasAttribute('aria-hidden')) return false;
    return true;
  });
}

export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  active: boolean
) {
  const ref = useRef<T | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    // Remember who had focus before we hijacked it.
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Initial focus — first focusable in the dialog, or the container
    // itself if there are no focusable children. The container needs
    // tabindex={-1} for that to work; we set it programmatically so
    // callers don't have to remember.
    const focusables = getFocusable(container);
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      if (!container.hasAttribute('tabindex')) {
        container.setAttribute('tabindex', '-1');
      }
      container.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      if (!container) return;
      const items = getFocusable(container);
      if (items.length === 0) {
        // Nothing focusable — keep focus on the container so we don't
        // tab into the page behind it.
        e.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;

      // Wrap forward.
      if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
        return;
      }
      // Wrap backward.
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
        return;
      }
      // If somehow focus escaped the container (rare; happens if a child
      // imperatively blurs), pull it back to the first item.
      if (activeEl && !container.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Restore focus to the original element. Guard against the node
      // being removed from the DOM between activation and now.
      const prev = previouslyFocused.current;
      if (prev && document.body.contains(prev)) {
        // Use a microtask so the restore happens after React has
        // finished unmounting the modal — otherwise React sometimes
        // re-claims focus during cleanup.
        queueMicrotask(() => {
          try {
            prev.focus();
          } catch {
            // Element was removed mid-flight; nothing to do.
          }
        });
      }
      previouslyFocused.current = null;
    };
  }, [active]);

  return ref;
}
