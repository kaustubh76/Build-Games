/**
 * Catch-all 404 page. Replaces Next's default plain-HTML 404 with one
 * that fits the rest of the app, links back to the main routes, and
 * keeps the visitor anchored.
 *
 * Server component (no 'use client') — pure markup, no hooks needed.
 */
import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  const links: Array<{ href: string; label: string }> = [
    { href: '/', label: 'Home' },
    { href: '/markets', label: 'Markets' },
    { href: '/arena', label: 'Arena' },
    { href: '/leaderboard', label: 'Leaderboard' },
    { href: '/whale-tracker', label: 'Whale Tracker' },
  ];

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center">
        <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">404</p>
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-100 mb-3">
          Page not found
        </h1>
        <p className="text-sm text-slate-400 mb-8">
          The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-3 py-2 text-sm border border-slate-700 hover:bg-slate-800 hover:border-slate-600 text-slate-200 rounded transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
