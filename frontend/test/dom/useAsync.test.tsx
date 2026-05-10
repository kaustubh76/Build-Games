// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAsync, useMutation, usePagination } from '@/hooks/useAsync';

/**
 * Tests for useAsync, useMutation, usePagination — three load-bearing
 * hooks that wrap async work with React state. Most-important property
 * to pin: their returned callbacks (execute, mutate, mutateAsync, reset,
 * fetchPage, loadMore) MUST have stable identities across renders.
 *
 * The bug we're closing: previously these listed `onSuccess`, `onError`,
 * `mutationFn`, `fetchFn` in their useCallback deps. Consumers
 * routinely pass inline arrows (`onSuccess: (data) => refetch()`),
 * which create new references each render → new useCallback bindings
 * → consumer effects depending on those bindings re-fire → re-fetch
 * loop. The fix uses refs to stabilize the deps.
 */

describe('useAsync', () => {
  it('execute returns the resolved value and updates state', async () => {
    const fn = vi.fn().mockResolvedValue('hello');
    const { result } = renderHook(() => useAsync(fn));

    let value: string | null | undefined;
    await act(async () => {
      value = await result.current.execute();
    });

    expect(value).toBe('hello');
    expect(result.current.data).toBe('hello');
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it('execute returns null and surfaces the error on rejection', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAsync(fn));

    let value: string | null | undefined;
    await act(async () => {
      value = await result.current.execute();
    });

    expect(value).toBeNull();
    expect(result.current.error?.message).toBe('boom');
    expect(result.current.isError).toBe(true);
  });

  it('execute identity is stable across re-renders (the regression fix)', () => {
    // Inline arrow callbacks would have rebuilt execute every render
    // before the ref-based stabilization. Now the callback identity is
    // the same reference on every render — consumer useEffects depending
    // on `execute` won't re-fire spuriously.
    const fn = vi.fn().mockResolvedValue(42);
    const { result, rerender } = renderHook(() =>
      useAsync(fn, {
        onSuccess: () => {}, // inline = new ref each render
        onError: () => {},
      })
    );

    const first = result.current.execute;
    rerender();
    const second = result.current.execute;
    rerender();
    const third = result.current.execute;

    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it('reset identity is stable across re-renders', () => {
    const fn = vi.fn().mockResolvedValue(42);
    const { result, rerender } = renderHook(() =>
      useAsync(fn, { initialData: { a: 1 } })  // inline object
    );
    const first = result.current.reset;
    rerender();
    expect(result.current.reset).toBe(first);
  });

  it('reset clears state back to initialData', async () => {
    const fn = vi.fn().mockResolvedValue('x');
    const { result } = renderHook(() => useAsync<string>(fn, { initialData: 'initial' }));
    await act(async () => { await result.current.execute(); });
    expect(result.current.data).toBe('x');

    act(() => result.current.reset());
    expect(result.current.data).toBe('initial');
    expect(result.current.isSuccess).toBe(false);
  });

  it('onSuccess fires with the resolved value (via the ref)', async () => {
    const fn = vi.fn().mockResolvedValue('payload');
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAsync(fn, { onSuccess }));

    await act(async () => { await result.current.execute(); });
    expect(onSuccess).toHaveBeenCalledWith('payload');
  });

  it('onError fires with the rejected error (via the ref)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('bad'));
    const onError = vi.fn();
    const { result } = renderHook(() => useAsync(fn, { onError }));

    await act(async () => { await result.current.execute(); });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'bad' }));
  });

  it('latest onSuccess wins (ref is updated on each render)', async () => {
    // If the ref were updated only on first mount, an updated callback
    // would never fire. Verify the ref-update-on-every-render contract.
    const fn = vi.fn().mockResolvedValue('data');
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ cb }: { cb: (data: string) => void }) => useAsync(fn, { onSuccess: cb }),
      { initialProps: { cb: first } }
    );

    rerender({ cb: second });
    await act(async () => { await result.current.execute(); });

    expect(second).toHaveBeenCalledWith('data');
    expect(first).not.toHaveBeenCalled();
  });
});

describe('useMutation', () => {
  it('mutateAsync returns the result on success', async () => {
    const fn = vi.fn().mockResolvedValue({ id: 1 });
    const { result } = renderHook(() => useMutation<{ id: number }, { name: string }>(fn));

    let value: { id: number } | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({ name: 'a' });
    });

    expect(value).toEqual({ id: 1 });
    expect(result.current.isSuccess).toBe(true);
  });

  it('mutate returns null on rejection (vs throwing)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useMutation(fn));

    let value: unknown;
    await act(async () => {
      value = await result.current.mutate('var');
    });
    expect(value).toBeNull();
    expect(result.current.isError).toBe(true);
  });

  it('mutateAsync identity is stable across re-renders', () => {
    const fn = vi.fn().mockResolvedValue('x');
    const { result, rerender } = renderHook(() =>
      useMutation(fn, { onSuccess: () => {} })  // inline = new ref each render
    );
    const first = result.current.mutateAsync;
    rerender();
    expect(result.current.mutateAsync).toBe(first);
  });

  it('latest onSuccess wins on the next mutation', async () => {
    const fn = vi.fn().mockResolvedValue('x');
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ cb }: { cb: (data: string, vars: string) => void }) =>
        useMutation<string, string>(fn, { onSuccess: cb }),
      { initialProps: { cb: first } }
    );

    rerender({ cb: second });
    await act(async () => { await result.current.mutateAsync('vars'); });

    expect(second).toHaveBeenCalledWith('x', 'vars');
    expect(first).not.toHaveBeenCalled();
  });
});

describe('usePagination', () => {
  it('initial state: empty data, hasMore=true, page=initialPage', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => usePagination(fn, { initialPage: 3 }));
    expect(result.current.data).toEqual([]);
    expect(result.current.page).toBe(3);
    expect(result.current.hasMore).toBe(true);
  });

  it('loadMore appends results and advances the page', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ items: ['a', 'b'], hasMore: true })
      .mockResolvedValueOnce({ items: ['c'], hasMore: false });

    const { result } = renderHook(() => usePagination<string>(fn, { initialPage: 1 }));

    await act(async () => { await result.current.loadMore(); });
    expect(result.current.data).toEqual(['a', 'b']);
    expect(result.current.page).toBe(2);
    expect(result.current.hasMore).toBe(true);

    await act(async () => { await result.current.loadMore(); });
    expect(result.current.data).toEqual(['a', 'b', 'c']);
    expect(result.current.hasMore).toBe(false);
  });

  it('loadMore is a no-op once hasMore is false', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ items: ['a'], hasMore: false });

    const { result } = renderHook(() => usePagination<string>(fn));
    await act(async () => { await result.current.loadMore(); });
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => { await result.current.loadMore(); });
    expect(fn).toHaveBeenCalledTimes(1); // not called again
  });

  it('reset clears data and resets page to initialPage', async () => {
    const fn = vi.fn().mockResolvedValueOnce({ items: ['a'], hasMore: true });
    const { result } = renderHook(() => usePagination<string>(fn, { initialPage: 5 }));
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.page).toBe(6);

    act(() => result.current.reset());
    expect(result.current.data).toEqual([]);
    expect(result.current.page).toBe(5);
    expect(result.current.hasMore).toBe(true);
  });

  it('fetchFn ref is updated — latest closure runs on next loadMore', async () => {
    // Fixes the bug where listing `fetchFn` in deps churned fetchPage
    // every render. The latest fn must still run when called, even
    // though the callback identity is stable.
    const first = vi.fn().mockResolvedValue({ items: ['from-first'], hasMore: true });
    const second = vi.fn().mockResolvedValue({ items: ['from-second'], hasMore: true });

    const { result, rerender } = renderHook(
      ({ fn }: { fn: () => Promise<{ items: string[]; hasMore: boolean }> }) =>
        usePagination<string>(fn),
      { initialProps: { fn: first } }
    );

    rerender({ fn: second });
    await act(async () => { await result.current.loadMore(); });

    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    expect(result.current.data).toEqual(['from-second']);
  });
});
