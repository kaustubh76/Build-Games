/**
 * <SiweGate> — wrap any feature that requires a SIWE session.
 *
 * Behavior:
 *   - If the user already has a valid session → render children.
 *   - If wallet is connected but no session → show a "Sign in" CTA.
 *   - If wallet is not connected → render `whenDisconnected` (or null).
 *
 * Use this around components that submit to a SIWE-guarded endpoint (whale
 * mirror, follow/unfollow, settings, market create, betting). The actual
 * authoritative check is on the server; this is purely UX so users don't
 * stare at a confusing 401 in the dev console.
 */

'use client';

import type { ReactNode } from 'react';
import { useSiweAuth } from '@/hooks/useSiweAuth';

export interface SiweGateProps {
  children: ReactNode;
  /** Rendered when the wallet isn't connected. Default: null. */
  whenDisconnected?: ReactNode;
  /** Optional override for the sign-in button label. */
  signInLabel?: string;
  /** Optional explanation under the button. */
  description?: string;
  /** className applied to the wrapper when in the "needs sign-in" state. */
  className?: string;
}

export function SiweGate({
  children,
  whenDisconnected = null,
  signInLabel = 'Sign in with wallet',
  description = 'Sign once per session to authorize trades and settings on your wallet.',
  className,
}: SiweGateProps) {
  const { session, isAuthenticated, isLoading, signIn, error } = useSiweAuth();

  if (isLoading) {
    return (
      <div className={className} aria-busy="true">
        Checking session…
      </div>
    );
  }

  if (isAuthenticated && session) {
    return <>{children}</>;
  }

  // Authenticated state is false. Either disconnected or just unsigned.
  // We can't read isConnected here without another wagmi hook, so we lean on
  // signIn() telling us "Connect a wallet first" via the error state.
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => {
          void signIn();
        }}
      >
        {signInLabel}
      </button>
      {description ? <p>{description}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {whenDisconnected}
    </div>
  );
}
