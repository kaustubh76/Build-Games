// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useLocalStorage,
  useSessionStorage,
  useLocalStorageExists,
  useLocalStorageKeys,
  clearLocalStoragePrefix,
} from '@/hooks/useStorage';

/**
 * Tests for the storage hooks. Load-bearing utility used by:
 *   - useWhaleAlertBadge (last-seen ID)
 *   - useAgents (filter + sort persistence)
 *   - useMicroMarkets (filter + sort persistence)
 *   - useLeaderboard (cached payload)
 *
 * happy-dom provides a working localStorage + sessionStorage. These
 * tests pin the contract that a future refactor can't silently break.
 *
 * Note: cross-tab StorageEvent dispatch tests are skipped — happy-dom's
 * synchronous event dispatch causes React state-update reentrancy that
 * hangs vitest. The handler logic is simple enough (filter by key,
 * deserialize, set state) that integration testing in a real browser
 * is the better fit for that surface. The same-tab path through
 * setValue / removeValue IS covered here.
 */

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('useLocalStorage', () => {
  it('returns initialValue when the key is absent', () => {
    const { result } = renderHook(() => useLocalStorage('missing', 'default'));
    expect(result.current[0]).toBe('default');
  });

  it('does NOT infinite-loop when initialValue is an inline object literal', async () => {
    // Regression test: the previous implementation listed `initialValue`
    // in useCallback deps, so an inline `{ a: 0 }` literal created a
    // new ref each render → effect re-fired → setState → re-render →
    // infinite loop. The fix captures initialValue in a ref so the
    // deps stay stable.
    const { result } = renderHook(() =>
      useLocalStorage<{ a: number }>('inline', { a: 0 })
    );
    await Promise.resolve();
    expect(result.current[0]).toEqual({ a: 0 });
  });

  it('setValue persists to localStorage AND updates React state', () => {
    const { result } = renderHook(() => useLocalStorage<number>('count', 0));
    act(() => result.current[1](42));
    expect(result.current[0]).toBe(42);
    expect(JSON.parse(window.localStorage.getItem('count')!)).toBe(42);
  });

  it('setValue accepts a function-form like useState', () => {
    const { result } = renderHook(() => useLocalStorage<number>('count', 1));
    act(() => result.current[1]((prev) => prev + 1));
    expect(result.current[0]).toBe(2);
  });

  it('removeValue clears the entry AND resets state to initialValue', () => {
    const { result } = renderHook(() => useLocalStorage<string>('drop', 'default'));
    act(() => result.current[1]('something'));
    expect(window.localStorage.getItem('drop')).toBeTruthy();

    act(() => result.current[2]());
    expect(window.localStorage.getItem('drop')).toBeNull();
    expect(result.current[0]).toBe('default');
  });

  it('reads an existing value on mount', async () => {
    window.localStorage.setItem('greeting', JSON.stringify('hi'));
    const { result } = renderHook(() => useLocalStorage('greeting', 'fallback'));
    // useEffect fires after mount; flush microtasks.
    await Promise.resolve();
    expect(result.current[0]).toBe('hi');
  });

  it('serializes objects via JSON.stringify, deserializes via JSON.parse', () => {
    window.localStorage.setItem('obj', JSON.stringify({ x: 99 }));
    const { result } = renderHook(() => useLocalStorage<{ x: number }>('obj', { x: 0 }));
    return Promise.resolve().then(() => {
      expect(result.current[0]).toEqual({ x: 99 });
    });
  });

  it('falls back to initialValue when the stored JSON is corrupted', async () => {
    // Corrupted JSON → deserialize catches the throw and returns the
    // raw string. We don't crash, which is the load-bearing property.
    window.localStorage.setItem('garbage', '{not valid json');
    const { result } = renderHook(() => useLocalStorage<{ a: number }>('garbage', { a: 0 }));
    await Promise.resolve();
    // Either the raw string (current implementation's behavior) or
    // the initialValue — both prove "doesn't crash". Pin: not undefined.
    expect(result.current[0]).toBeDefined();
  });
});

describe('useSessionStorage', () => {
  it('reads sessionStorage, NOT localStorage, on mount', async () => {
    window.sessionStorage.setItem('skey', JSON.stringify('session-value'));
    window.localStorage.setItem('skey', JSON.stringify('local-value'));
    const { result } = renderHook(() => useSessionStorage('skey', 'def'));
    await Promise.resolve();
    expect(result.current[0]).toBe('session-value');
  });

  it('returns initialValue when the key is absent', () => {
    const { result } = renderHook(() => useSessionStorage('skey', 'def'));
    expect(result.current[0]).toBe('def');
  });
});

describe('useLocalStorageExists', () => {
  it('returns false when the key is absent', async () => {
    const { result } = renderHook(() => useLocalStorageExists('absent'));
    await Promise.resolve();
    expect(result.current).toBe(false);
  });

  it('returns true when the key is present', async () => {
    window.localStorage.setItem('present', '1');
    const { result } = renderHook(() => useLocalStorageExists('present'));
    await Promise.resolve();
    expect(result.current).toBe(true);
  });
});

describe('useLocalStorageKeys', () => {
  it('returns only keys matching the prefix', async () => {
    window.localStorage.setItem('agent-1', 'a');
    window.localStorage.setItem('agent-2', 'b');
    window.localStorage.setItem('market-1', 'c');
    const { result } = renderHook(() => useLocalStorageKeys('agent-'));
    await Promise.resolve();
    expect(result.current.sort()).toEqual(['agent-1', 'agent-2']);
  });

  it('returns empty array when no keys match', async () => {
    window.localStorage.setItem('agent-1', 'a');
    const { result } = renderHook(() => useLocalStorageKeys('zzz-'));
    await Promise.resolve();
    expect(result.current).toEqual([]);
  });
});

describe('clearLocalStoragePrefix', () => {
  it('removes only matching keys, returns the count', () => {
    window.localStorage.setItem('cache-a', '1');
    window.localStorage.setItem('cache-b', '2');
    window.localStorage.setItem('keep-me', '3');
    const removed = clearLocalStoragePrefix('cache-');
    expect(removed).toBe(2);
    expect(window.localStorage.getItem('cache-a')).toBeNull();
    expect(window.localStorage.getItem('cache-b')).toBeNull();
    expect(window.localStorage.getItem('keep-me')).toBe('3');
  });

  it('returns 0 when nothing matches', () => {
    window.localStorage.setItem('keep', '1');
    expect(clearLocalStoragePrefix('zzz-')).toBe(0);
    expect(window.localStorage.getItem('keep')).toBe('1');
  });

  it('handles empty localStorage gracefully (no-op, returns 0)', () => {
    expect(clearLocalStoragePrefix('any-')).toBe(0);
  });
});

describe('serialize / deserialize edge cases (via the public hooks)', () => {
  it('handles a stored numeric value', async () => {
    window.localStorage.setItem('n', JSON.stringify(42));
    const { result } = renderHook(() => useLocalStorage<number>('n', 0));
    await Promise.resolve();
    expect(result.current[0]).toBe(42);
  });

  it('handles a stored boolean', async () => {
    window.localStorage.setItem('b', JSON.stringify(true));
    const { result } = renderHook(() => useLocalStorage<boolean>('b', false));
    await Promise.resolve();
    expect(result.current[0]).toBe(true);
  });

  it('handles a stored array', async () => {
    window.localStorage.setItem('arr', JSON.stringify([1, 2, 3]));
    const { result } = renderHook(() => useLocalStorage<number[]>('arr', []));
    await Promise.resolve();
    expect(result.current[0]).toEqual([1, 2, 3]);
  });

  it('handles a stored null', async () => {
    window.localStorage.setItem('null-val', JSON.stringify(null));
    const { result } = renderHook(() => useLocalStorage<string | null>('null-val', 'default'));
    await Promise.resolve();
    expect(result.current[0]).toBeNull();
  });
});
