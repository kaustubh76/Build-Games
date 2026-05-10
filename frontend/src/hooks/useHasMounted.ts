'use client';

/**
 * Returns `false` on the server and during the first client render,
 * then `true` on every render after hydration. Use as a gate around
 * any value that is non-deterministic between server + client
 * (Date.now(), Math.random(), localStorage, window.matchMedia, etc.).
 *
 * Pattern:
 *   const mounted = useHasMounted();
 *   const isExpired = mounted ? Date.now() > deadline : false;
 *
 * Why not just `useEffect(() => setNow(Date.now()))` everywhere? Each
 * page would reinvent the gate, easy to forget, easy to compute the
 * non-deterministic value before the gate fires. A single shared hook
 * is one obvious tool that future code can reach for.
 */
import { useEffect, useState } from 'react';

export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
