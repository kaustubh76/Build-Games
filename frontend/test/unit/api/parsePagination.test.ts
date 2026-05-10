/**
 * Unit tests for `parsePagination` from `lib/api/validation`.
 *
 * The single load-bearing property: NaN safety. The previous in-line
 * pattern across ~6 paginated routes used:
 *
 *   const limit = Math.min(Math.max(parseInt(...), 1), 100);
 *
 * This silently produces `take: NaN` on garbage input, which Prisma
 * treats as "no limit" — a single `?limit=abc` request could pull
 * millions of rows. The helper closes that hole; these tests pin the
 * contract so a future "simplification" can't accidentally re-open it.
 */

import { describe, it, expect } from 'vitest';
import { parsePagination } from '@/lib/api/validation';

function paramsFrom(query: Record<string, string>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) sp.set(k, v);
  return sp;
}

describe('parsePagination', () => {
  it('returns defaults on empty params', () => {
    const { limit, offset } = parsePagination(paramsFrom({}));
    expect(limit).toBe(50);
    expect(offset).toBe(0);
  });

  it('honours custom defaults', () => {
    const { limit, offset } = parsePagination(paramsFrom({}), {
      defaultLimit: 25,
      defaultOffset: 10,
    });
    expect(limit).toBe(25);
    expect(offset).toBe(10);
  });

  it('clamps a numeric limit to maxLimit', () => {
    const { limit } = parsePagination(paramsFrom({ limit: '500' }), { maxLimit: 100 });
    expect(limit).toBe(100);
  });

  it('passes through a numeric limit within range', () => {
    const { limit } = parsePagination(paramsFrom({ limit: '42' }));
    expect(limit).toBe(42);
  });

  it('NaN-safe: ?limit=abc falls back to default (NOT NaN)', () => {
    // The bug we're closing: `parseInt('abc')` is NaN, and
    // `Math.min(NaN, 100)` is also NaN, which Prisma treats as
    // unbounded. The helper must fall back to the default.
    const { limit } = parsePagination(paramsFrom({ limit: 'abc' }));
    expect(limit).toBe(50);
    expect(Number.isFinite(limit)).toBe(true);
  });

  it('NaN-safe: empty-string ?limit= falls back to default', () => {
    const { limit } = parsePagination(paramsFrom({ limit: '' }));
    expect(limit).toBe(50);
  });

  it('rejects negative limit (falls back to default)', () => {
    const { limit } = parsePagination(paramsFrom({ limit: '-5' }));
    expect(limit).toBe(50);
  });

  it('rejects zero limit (falls back to default)', () => {
    // A `take: 0` would silently return zero rows, which is rarely the
    // user's intent and looks like a broken response. Easier to fall
    // back to the default than ship a confusing empty array.
    const { limit } = parsePagination(paramsFrom({ limit: '0' }));
    expect(limit).toBe(50);
  });

  it('parses scientific notation safely (parseInt handles it)', () => {
    // parseInt('1e10') is 1, NOT 10 billion — parseInt stops at the
    // first non-digit. Verifies the helper inherits this safety.
    const { limit } = parsePagination(paramsFrom({ limit: '1e10' }));
    expect(limit).toBe(1);
  });

  it('NaN-safe: ?offset=abc falls back to default', () => {
    const { offset } = parsePagination(paramsFrom({ offset: 'abc' }));
    expect(offset).toBe(0);
  });

  it('rejects negative offset (falls back to default)', () => {
    const { offset } = parsePagination(paramsFrom({ offset: '-1' }));
    expect(offset).toBe(0);
  });

  it('zero offset is valid (no fallback)', () => {
    // Unlike limit, offset=0 is the legitimate first-page value.
    const { offset } = parsePagination(paramsFrom({ offset: '0' }));
    expect(offset).toBe(0);
  });

  it('arbitrarily large valid offset passes through (no max-offset bound)', () => {
    // The helper doesn't cap offset — that's the route's responsibility
    // since legitimate deep-paginate use cases vary.
    const { offset } = parsePagination(paramsFrom({ offset: '99999' }));
    expect(offset).toBe(99999);
  });

  it('limit=Infinity is rejected (not finite)', () => {
    const { limit } = parsePagination(paramsFrom({ limit: 'Infinity' }));
    expect(limit).toBe(50);
  });
});
