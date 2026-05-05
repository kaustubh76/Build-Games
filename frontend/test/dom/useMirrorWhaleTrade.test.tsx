// @vitest-environment happy-dom
/**
 * Hook tests for useMirrorWhaleTrade.
 *
 * Mocks:
 *  - wagmi (useAccount) → control isConnected
 *  - NotificationContext (useNotifications) → spy on toast calls
 *  - global fetch → simulate the four response shapes (200, 202, 4xx, network)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { WhaleTrade } from '@/types/externalMarket';

// ============================================================================
// Mocks — define BEFORE importing the hook so vi.mock hoists correctly
// ============================================================================

const mockUseAccount = vi.fn();
vi.mock('wagmi', () => ({ useAccount: () => mockUseAccount() }));

const notifySpies = {
  success: vi.fn(),
  error: vi.fn(),
  errorWithRetry: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};
vi.mock('@/contexts/NotificationContext', () => ({
  useNotifications: () => notifySpies,
}));

import { useMirrorWhaleTrade } from '@/hooks/useMirrorWhaleTrade';

const TRADE: WhaleTrade = {
  id: 'whale-1',
  source: 'POLYMARKET' as never,
  marketId: 'mkt-1',
  marketQuestion: 'Will it pass?',
  traderAddress: '0x1111111111111111111111111111111111111111',
  side: 'buy',
  outcome: 'yes',
  amountUsd: '50000',
  shares: '100',
  price: 5500,
  timestamp: Date.now(),
};

beforeEach(() => {
  vi.restoreAllMocks();
  notifySpies.success.mockReset();
  notifySpies.error.mockReset();
  notifySpies.errorWithRetry.mockReset();
  notifySpies.warning.mockReset();
  notifySpies.info.mockReset();
});

describe('useMirrorWhaleTrade', () => {
  it('returns null + warning toast when wallet is not connected', async () => {
    mockUseAccount.mockReturnValue({ address: undefined, isConnected: false });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useMirrorWhaleTrade());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mirrorTrade(TRADE);
    });
    expect(outcome).toBeNull();
    expect(notifySpies.warning).toHaveBeenCalledWith(
      'Wallet not connected',
      expect.any(String)
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('200 success → lastResult populated, success toast fired', async () => {
    mockUseAccount.mockReturnValue({
      address: '0x5a6472782a098230e04A891a78BeEE1b7d48E90c',
      isConnected: true,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          txHash: '0xabc',
          blockNumber: 1,
          mirrorKey: '0x' + 'a'.repeat(64),
          sharesOut: '331081081081081082',
          minSharesOut: '0',
          slippageBps: 300,
          copyAmount: '1.0',
          copyAmountWei: '1000000000000000000',
          whaleTradeId: TRADE.id,
          outcome: 'yes',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const { result } = renderHook(() => useMirrorWhaleTrade());

    await act(async () => {
      await result.current.mirrorTrade(TRADE);
    });
    await waitFor(() => expect(result.current.lastResult).not.toBeNull());
    expect(result.current.lastResult).toMatchObject({
      success: true,
      whaleTradeId: TRADE.id,
      sharesOut: '331081081081081082',
    });
    expect(notifySpies.success).toHaveBeenCalled();
    expect(notifySpies.error).not.toHaveBeenCalled();
  });

  it('202 pending → lastPending populated, info toast fired, lastResult unchanged', async () => {
    mockUseAccount.mockReturnValue({
      address: '0x5a6472782a098230e04A891a78BeEE1b7d48E90c',
      isConnected: true,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          pending: true,
          reason: 'mirror-market-created-pending-activation',
          mirrorKey: '0x' + 'b'.repeat(64),
          whaleTradeId: TRADE.id,
          retryAfterSeconds: 45,
          autoCreate: {
            attempted: true,
            txHash: '0xcreate',
            requestId: null,
            blockNumber: 1,
            message: 'Mirror market creation submitted.',
          },
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const { result } = renderHook(() => useMirrorWhaleTrade());
    await act(async () => {
      await result.current.mirrorTrade(TRADE);
    });
    await waitFor(() => expect(result.current.lastPending).not.toBeNull());
    expect(result.current.lastPending).toMatchObject({
      pending: true,
      retryAfterSeconds: 45,
    });
    expect(result.current.lastResult).toBeNull();
    // 202 path now uses errorWithRetry so the user gets an inline "Retry now" button
    // instead of a fire-and-forget info toast.
    expect(notifySpies.errorWithRetry).toHaveBeenCalled();
    const args = notifySpies.errorWithRetry.mock.calls[0];
    expect(args[0]).toMatch(/Mirror market spinning up/i);
    expect(typeof args[2]).toBe('function'); // the retry callback
    expect(args[3]).toBe('Retry now');
  });

  it('4xx error → error state populated, error toast fired', async () => {
    mockUseAccount.mockReturnValue({
      address: '0x5a6472782a098230e04A891a78BeEE1b7d48E90c',
      isConnected: true,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'Trading paused for this user.', code: 'BAD_REQUEST' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const { result } = renderHook(() => useMirrorWhaleTrade());
    await act(async () => {
      await result.current.mirrorTrade(TRADE);
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toMatch(/Trading paused/);
    expect(notifySpies.error).toHaveBeenCalled();
  });

  it('network error → error state populated, retry-with-action toast fires', async () => {
    mockUseAccount.mockReturnValue({
      address: '0x5a6472782a098230e04A891a78BeEE1b7d48E90c',
      isConnected: true,
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useMirrorWhaleTrade());
    await act(async () => {
      await result.current.mirrorTrade(TRADE);
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe('Network down');
    // Network errors are transient — surface retry path
    expect(notifySpies.errorWithRetry).toHaveBeenCalled();
    expect(notifySpies.error).not.toHaveBeenCalled();
  });

  it('transient 503 error → errorWithRetry toast', async () => {
    mockUseAccount.mockReturnValue({
      address: '0x5a6472782a098230e04A891a78BeEE1b7d48E90c',
      isConnected: true,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'Server wallet drained', code: 'SERVICE_UNAVAILABLE' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const { result } = renderHook(() => useMirrorWhaleTrade());
    await act(async () => {
      await result.current.mirrorTrade(TRADE);
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(notifySpies.errorWithRetry).toHaveBeenCalled();
    expect(notifySpies.error).not.toHaveBeenCalled();
  });

  it('permanent 400 error (paused user) → plain error toast (no retry)', async () => {
    mockUseAccount.mockReturnValue({
      address: '0x5a6472782a098230e04A891a78BeEE1b7d48E90c',
      isConnected: true,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'Trading paused for this user.', code: 'BAD_REQUEST' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const { result } = renderHook(() => useMirrorWhaleTrade());
    await act(async () => {
      await result.current.mirrorTrade(TRADE);
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(notifySpies.error).toHaveBeenCalled();
    expect(notifySpies.errorWithRetry).not.toHaveBeenCalled();
  });

  it('isPending toggles true during fetch and false after', async () => {
    mockUseAccount.mockReturnValue({
      address: '0x5a6472782a098230e04A891a78BeEE1b7d48E90c',
      isConnected: true,
    });
    let resolveFetch: (() => void) | null = null;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = () =>
          resolve(
            new Response(
              JSON.stringify({
                success: true,
                txHash: '0xabc',
                blockNumber: 1,
                mirrorKey: '0x' + 'c'.repeat(64),
                sharesOut: '0',
                minSharesOut: '0',
                slippageBps: 300,
                copyAmount: '1.0',
                copyAmountWei: '1000000000000000000',
                whaleTradeId: TRADE.id,
                outcome: 'yes',
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          );
      })
    );

    const { result } = renderHook(() => useMirrorWhaleTrade());
    expect(result.current.isPending).toBe(false);

    let mirrorPromise: Promise<unknown> | undefined;
    act(() => {
      mirrorPromise = result.current.mirrorTrade(TRADE);
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));

    await act(async () => {
      resolveFetch?.();
      await mirrorPromise;
    });
    expect(result.current.isPending).toBe(false);
  });
});
