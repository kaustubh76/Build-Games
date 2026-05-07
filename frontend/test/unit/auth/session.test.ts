import { describe, it, expect, beforeEach } from 'vitest';
import {
  signSession,
  verifySession,
  revokeSession,
  __resetSessionState,
  __getRevokedCount,
} from '@/lib/auth/session';

const ADDR = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa';

beforeEach(() => {
  __resetSessionState();
});

describe('session sign/verify', () => {
  it('round-trips: signed token verifies with the same address', () => {
    const issued = signSession(ADDR);
    const verified = verifySession(issued.token);
    expect(verified).not.toBeNull();
    expect(verified!.address).toBe(ADDR.toLowerCase());
    expect(verified!.jti).toBe(issued.jti);
    expect(verified!.exp).toBe(issued.expiresAt);
  });

  it('returns null on tampered signature', () => {
    const { token } = signSession(ADDR);
    const tampered = token.slice(0, -2) + 'XX';
    expect(verifySession(tampered)).toBeNull();
  });

  it('returns null on tampered payload (HMAC re-check fails)', () => {
    const { token } = signSession(ADDR);
    const [h, p, s] = token.split('.');
    // Replace payload with a different one (different jti) but keep original sig
    const otherPayload = signSession(ADDR).token.split('.')[1];
    const tampered = `${h}.${otherPayload}.${s}`;
    expect(verifySession(tampered)).toBeNull();
  });

  it('returns null on completely malformed input', () => {
    expect(verifySession('not.a.jwt')).toBeNull();
    expect(verifySession('one-segment')).toBeNull();
    expect(verifySession('')).toBeNull();
    expect(verifySession(undefined)).toBeNull();
    expect(verifySession(null)).toBeNull();
  });

  it('returns null when token is expired (now > exp)', () => {
    const past = new Date('2020-01-01T00:00:00Z');
    const { token } = signSession(ADDR, past);
    const verified = verifySession(token, new Date('2026-05-07T12:00:00Z'));
    expect(verified).toBeNull();
  });

  it('lowercases sub on issue (case-insensitive comparison downstream)', () => {
    const issued = signSession(ADDR);
    expect(issued.address).toBe(ADDR.toLowerCase());
  });
});

describe('session revocation', () => {
  it('revoked jti causes verifySession to return null', () => {
    const issued = signSession(ADDR);
    expect(verifySession(issued.token)).not.toBeNull();
    revokeSession(issued.jti);
    expect(verifySession(issued.token)).toBeNull();
    expect(__getRevokedCount()).toBe(1);
  });

  it('only the revoked jti is rejected; other sessions for the same address still verify', () => {
    const a = signSession(ADDR);
    const b = signSession(ADDR);
    revokeSession(a.jti);
    expect(verifySession(a.token)).toBeNull();
    expect(verifySession(b.token)).not.toBeNull();
  });
});
