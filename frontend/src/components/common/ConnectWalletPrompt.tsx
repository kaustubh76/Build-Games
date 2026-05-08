'use client';

/**
 * <ConnectWalletPrompt> — shared "connect your wallet to continue" UI.
 *
 * Pages that gate their main content on `isConnected` previously hand-rolled
 * this UI four different ways. This component standardises the shape (icon
 * + arcade-glow heading + description) while keeping the per-page voice via
 * the `title` and `description` props.
 *
 * Usage:
 *
 *   const { isConnected } = useAccount();
 *   if (!isConnected) {
 *     return <ConnectWalletPrompt description="…to manage copy trading." />;
 *   }
 *
 * The wallet connect button itself is intentionally NOT included — pages
 * already have RainbowKit / wagmi wired in their layout's Providers, and
 * RainbowKit's modal opens via the Header's "Connect" button. Including a
 * connect button here would duplicate that surface.
 */

import React from 'react';

export interface ConnectWalletPromptProps {
  /** Big emoji at the top. Default: 🔐. */
  icon?: string;
  /** Arcade-glow heading. Default: "CONNECT WALLET". */
  title?: string;
  /** Body copy. Pages should always set this for context-specific copy. */
  description: string;
  /** Optional second-line hint underneath. */
  hint?: string;
}

export function ConnectWalletPrompt({
  icon = '🔐',
  title = 'CONNECT WALLET',
  description,
  hint,
}: ConnectWalletPromptProps) {
  return (
    <main className="container-arcade py-12 md:py-20">
      <div className="text-center animate-fade-in">
        <div className="text-5xl md:text-6xl mb-6" aria-hidden="true">
          {icon}
        </div>
        <h1
          className="text-2xl md:text-3xl text-red-400 mb-4 arcade-glow"
          style={{ fontFamily: 'Press Start 2P, monospace' }}
        >
          {title}
        </h1>
        <p className="text-slate-400 mb-2 text-sm md:text-base">{description}</p>
        {hint ? <p className="text-slate-500 text-xs md:text-sm">{hint}</p> : null}
      </div>
    </main>
  );
}
