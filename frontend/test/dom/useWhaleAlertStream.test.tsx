// @vitest-environment happy-dom
/**
 * Tests for useWhaleAlertStream — wraps an EventSource and dedupes by id.
 *
 * happy-dom doesn't ship EventSource, so we install a minimal shim on
 * globalThis BEFORE the hook imports. Three signals tested:
 *   1. `ready` event toggles isConnected → true
 *   2. Multiple `whale` events accumulate, deduped by `id`
 *   3. `error` flips isConnected → false
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ============================================================================
// EventSource shim — register on globalThis so the hook picks it up
// ============================================================================

type Listener = (e: MessageEvent | Event) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  readyState = 0;
  onopen: Listener | null = null;
  onerror: Listener | null = null;
  onmessage: Listener | null = null;
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn);
  }

  close() {
    this.readyState = 2;
  }

  // Test helpers (not part of the EventSource API)
  fireOpen() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  fireNamedEvent(name: string, data: string) {
    const ev = new MessageEvent(name, { data });
    this.listeners.get(name)?.forEach((l) => l(ev));
  }

  fireError() {
    this.readyState = 0;
    this.onerror?.(new Event('error'));
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  // @ts-expect-error injecting test shim into globalThis
  globalThis.EventSource = FakeEventSource;
});

afterEach(() => {
  // @ts-expect-error cleanup
  delete globalThis.EventSource;
});

import { useWhaleAlertStream } from '@/hooks/useWhaleAlertStream';

const baseTrade = (id: string, ts = Date.now()) => ({
  id,
  source: 'POLYMARKET',
  marketId: 'm-' + id,
  marketQuestion: 'q-' + id,
  traderAddress: '0x1111111111111111111111111111111111111111',
  side: 'buy' as const,
  outcome: 'yes' as const,
  amountUsd: '12000',
  shares: '5',
  price: 5500,
  timestamp: ts,
});

describe('useWhaleAlertStream', () => {
  it('starts disconnected, flips to connected on ready event', async () => {
    const { result } = renderHook(() => useWhaleAlertStream(50));
    expect(result.current.isConnected).toBe(false);

    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    const es = FakeEventSource.instances[0];
    act(() => {
      es.fireNamedEvent('ready', JSON.stringify({ ts: Date.now(), threshold: 10000 }));
    });
    await waitFor(() => expect(result.current.isConnected).toBe(true));
  });

  it('accumulates multiple whale events newest-first', async () => {
    const { result } = renderHook(() => useWhaleAlertStream(50));
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    const es = FakeEventSource.instances[0];

    act(() => {
      es.fireNamedEvent('whale', JSON.stringify(baseTrade('a', 1000)));
      es.fireNamedEvent('whale', JSON.stringify(baseTrade('b', 2000)));
      es.fireNamedEvent('whale', JSON.stringify(baseTrade('c', 3000)));
    });

    await waitFor(() => expect(result.current.alerts.length).toBe(3));
    // Newest-first: c, b, a
    expect(result.current.alerts.map((a) => a.id)).toEqual(['c', 'b', 'a']);
    expect(result.current.lastEventAt).toBeGreaterThan(0);
  });

  it('dedupes alerts with the same id', async () => {
    const { result } = renderHook(() => useWhaleAlertStream(50));
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    const es = FakeEventSource.instances[0];

    const dup = JSON.stringify(baseTrade('dup', 1000));
    act(() => {
      es.fireNamedEvent('whale', dup);
      es.fireNamedEvent('whale', dup);
      es.fireNamedEvent('whale', dup);
    });
    await waitFor(() => expect(result.current.alerts.length).toBe(1));
  });

  it('honours maxKept', async () => {
    const { result } = renderHook(() => useWhaleAlertStream(2));
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    const es = FakeEventSource.instances[0];

    act(() => {
      es.fireNamedEvent('whale', JSON.stringify(baseTrade('a', 1000)));
      es.fireNamedEvent('whale', JSON.stringify(baseTrade('b', 2000)));
      es.fireNamedEvent('whale', JSON.stringify(baseTrade('c', 3000)));
    });
    await waitFor(() => expect(result.current.alerts.length).toBe(2));
    // Newest two retained
    expect(result.current.alerts.map((a) => a.id)).toEqual(['c', 'b']);
  });

  it('error event flips isConnected to false', async () => {
    const { result } = renderHook(() => useWhaleAlertStream(50));
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    const es = FakeEventSource.instances[0];

    act(() => {
      es.fireNamedEvent('ready', JSON.stringify({ ts: Date.now(), threshold: 10000 }));
    });
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    act(() => {
      es.fireError();
    });
    await waitFor(() => expect(result.current.isConnected).toBe(false));
  });

  it('ignores malformed JSON in whale events', async () => {
    const { result } = renderHook(() => useWhaleAlertStream(50));
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    const es = FakeEventSource.instances[0];

    act(() => {
      es.fireNamedEvent('whale', 'not-json');
      es.fireNamedEvent('whale', JSON.stringify(baseTrade('valid', 1)));
    });
    await waitFor(() => expect(result.current.alerts.length).toBe(1));
    expect(result.current.alerts[0].id).toBe('valid');
  });

  it('closes the EventSource on unmount', async () => {
    const { unmount } = renderHook(() => useWhaleAlertStream(50));
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    const es = FakeEventSource.instances[0];
    expect(es.readyState).toBe(0);
    unmount();
    expect(es.readyState).toBe(2); // CLOSED
  });
});
