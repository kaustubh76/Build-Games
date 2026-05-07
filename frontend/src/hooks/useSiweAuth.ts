/**
 * SIWE auth hook — once-per-session sign-in flow keyed on the connected wallet.
 *
 * Flow:
 *   1. On mount (and on wallet change), call GET /api/auth/session to detect
 *      an existing cookie. If present → set state to authenticated.
 *   2. When the caller invokes signIn():
 *        a. GET /api/auth/nonce
 *        b. Build EIP-4361 message (formatSiweMessage)
 *        c. wagmi useSignMessage → user signs in their wallet
 *        d. POST /api/auth/verify — server validates, sets HttpOnly cookie
 *        e. set state to authenticated
 *   3. signOut() clears the cookie via POST /api/auth/logout.
 *
 * The session cookie is HttpOnly so we can't read it from JS — that's the
 * whole point. Server is the source of truth; client state is just a cached
 * "do I have a live session?" boolean for UI gating.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useChainId, useSignMessage } from 'wagmi';
import { formatSiweMessage } from '@/lib/auth/siwe';

export interface SiweSession {
  address: `0x${string}`;
  expiresAt: number;
}

export interface UseSiweAuthReturn {
  session: SiweSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Trigger the sign-in flow. Returns the new session, or null on failure. */
  signIn: () => Promise<SiweSession | null>;
  /** Revoke the session cookie. Does NOT disconnect the wallet. */
  signOut: () => Promise<void>;
  /** Last sign-in error, if any. Cleared on each signIn() attempt. */
  error: string | null;
}

const STATEMENT = 'Sign in to WarriorsAI-rena.';

export function useSiweAuth(): UseSiweAuthReturn {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const [session, setSession] = useState<SiweSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Probe existing session on mount + when wallet changes.
  useEffect(() => {
    let cancelled = false;
    async function probe() {
      setIsLoading(true);
      try {
        const res = await fetch('/api/auth/session', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        if (cancelled) return;
        if (res.ok) {
          const body = await res.json();
          setSession({ address: body.address, expiresAt: body.expiresAt });
        } else {
          setSession(null);
        }
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    probe();
    return () => {
      cancelled = true;
    };
  }, [address]);

  // If the user switched wallets while signed in, drop the cached session
  // (server cookie is still valid until logout, but the UI now reflects the
  // new wallet which needs its own sign-in).
  useEffect(() => {
    if (!isConnected) {
      setSession(null);
      return;
    }
    if (session && address && session.address.toLowerCase() !== address.toLowerCase()) {
      setSession(null);
    }
  }, [address, isConnected, session]);

  const signIn = useCallback(async (): Promise<SiweSession | null> => {
    setError(null);
    if (!address || !isConnected) {
      setError('Connect a wallet first');
      return null;
    }
    try {
      // 1. Fetch a fresh nonce.
      const nonceRes = await fetch('/api/auth/nonce', { credentials: 'include' });
      if (!nonceRes.ok) {
        setError('Failed to fetch sign-in nonce');
        return null;
      }
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      // 2. Build the EIP-4361 message. Domain comes from window.location.host
      // so the server's getExpectedDomain() (host header) matches.
      const domain = typeof window !== 'undefined' ? window.location.host : 'localhost';
      const uri = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
      const issuedAt = new Date().toISOString();
      const expirationTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const message = formatSiweMessage({
        domain,
        address,
        statement: STATEMENT,
        uri,
        version: '1',
        chainId,
        nonce,
        issuedAt,
        expirationTime,
      });

      // 3. Wallet prompt.
      const signature = await signMessageAsync({ message });

      // 4. Verify on the server, which sets the HttpOnly cookie.
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });
      if (!verifyRes.ok) {
        const body = (await verifyRes.json().catch(() => ({}))) as { error?: string };
        setError(body.error || 'Sign-in verification failed');
        return null;
      }
      const verified = (await verifyRes.json()) as { address: `0x${string}`; expiresAt: number };
      const newSession: SiweSession = {
        address: verified.address,
        expiresAt: verified.expiresAt,
      };
      setSession(newSession);
      return newSession;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sign-in failed';
      setError(msg);
      return null;
    }
  }, [address, isConnected, chainId, signMessageAsync]);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // best-effort — even if the request fails, drop local state
    }
    setSession(null);
  }, []);

  return {
    session,
    isLoading,
    isAuthenticated: session !== null,
    signIn,
    signOut,
    error,
  };
}
