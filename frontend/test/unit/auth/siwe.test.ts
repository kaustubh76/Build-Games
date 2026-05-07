import { describe, it, expect } from 'vitest';
import {
  formatSiweMessage,
  parseSiweMessage,
  assertSiweMessageMatches,
  type SiweMessage,
} from '@/lib/auth/siwe';

const NOW = new Date('2026-05-07T12:00:00Z');
const ADDR = '0x' + 'ab'.repeat(20);

function fixture(overrides: Partial<SiweMessage> = {}): SiweMessage {
  return {
    domain: 'warriors-ai-rena.vercel.app',
    address: ADDR as `0x${string}`,
    statement: 'Sign in to WarriorsAI-rena.',
    uri: 'https://warriors-ai-rena.vercel.app',
    version: '1',
    chainId: 43113,
    nonce: 'a'.repeat(64),
    issuedAt: NOW.toISOString(),
    expirationTime: new Date(NOW.getTime() + 10 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

describe('siwe.formatSiweMessage', () => {
  it('produces the canonical EIP-4361 line ordering', () => {
    const m = fixture();
    const s = formatSiweMessage(m);
    const lines = s.split('\n');
    expect(lines[0]).toBe(`${m.domain} wants you to sign in with your Ethereum account:`);
    expect(lines[1]).toBe(m.address);
    expect(lines[2]).toBe('');
    expect(lines[3]).toBe(m.statement);
    expect(lines[4]).toBe('');
    expect(lines[5]).toBe(`URI: ${m.uri}`);
    expect(lines[6]).toBe(`Version: 1`);
    expect(lines[7]).toBe(`Chain ID: ${m.chainId}`);
    expect(lines[8]).toBe(`Nonce: ${m.nonce}`);
    expect(lines[9]).toBe(`Issued At: ${m.issuedAt}`);
    expect(lines[10]).toBe(`Expiration Time: ${m.expirationTime}`);
  });

  it('omits statement block when statement is undefined', () => {
    const m = fixture({ statement: undefined });
    const s = formatSiweMessage(m);
    expect(s).not.toContain('Sign in');
    // Line 3 should be the URI field, not blank
    expect(s.split('\n')[3]).toMatch(/^URI: /);
  });
});

describe('siwe.parseSiweMessage', () => {
  it('round-trips format → parse', () => {
    const m = fixture();
    const parsed = parseSiweMessage(formatSiweMessage(m));
    expect(parsed.domain).toBe(m.domain);
    expect(parsed.address).toBe(m.address);
    expect(parsed.statement).toBe(m.statement);
    expect(parsed.uri).toBe(m.uri);
    expect(parsed.chainId).toBe(43113);
    expect(parsed.nonce).toBe(m.nonce);
    expect(parsed.issuedAt).toBe(m.issuedAt);
    expect(parsed.expirationTime).toBe(m.expirationTime);
  });

  it('rejects empty input', () => {
    expect(() => parseSiweMessage('')).toThrow(/empty message/i);
  });

  it('rejects malformed header line', () => {
    expect(() => parseSiweMessage('totally-not-siwe')).toThrow(/malformed header/i);
  });

  it('rejects malformed address', () => {
    const m = fixture();
    const bad = formatSiweMessage(m).replace(m.address, '0xnothex');
    expect(() => parseSiweMessage(bad)).toThrow(/malformed address/i);
  });

  it('rejects unsupported version', () => {
    const m = fixture();
    const bad = formatSiweMessage(m).replace('Version: 1', 'Version: 2');
    expect(() => parseSiweMessage(bad)).toThrow(/unsupported version/i);
  });

  it('rejects non-integer Chain ID', () => {
    const m = fixture();
    const bad = formatSiweMessage(m).replace('Chain ID: 43113', 'Chain ID: forty-three');
    expect(() => parseSiweMessage(bad)).toThrow(/Chain ID/);
  });

  it('rejects malformed Issued At', () => {
    const m = fixture();
    const bad = formatSiweMessage(m).replace(m.issuedAt, 'last-tuesday');
    expect(() => parseSiweMessage(bad)).toThrow(/Issued At/);
  });

  it('parses an optional Resources block', () => {
    const m = fixture({ resources: ['https://x.example/r1', 'ipfs://bafy...'] });
    const parsed = parseSiweMessage(formatSiweMessage(m));
    expect(parsed.resources).toEqual(['https://x.example/r1', 'ipfs://bafy...']);
  });
});

describe('siwe.assertSiweMessageMatches', () => {
  it('passes when domain, chainId, nonce, and freshness all match', () => {
    const m = fixture();
    expect(() =>
      assertSiweMessageMatches(
        m,
        { domain: m.domain, chainId: m.chainId, nonce: m.nonce },
        NOW
      )
    ).not.toThrow();
  });

  it('rejects domain mismatch (cross-site SIWE replay)', () => {
    const m = fixture();
    expect(() =>
      assertSiweMessageMatches(
        m,
        { domain: 'evil.example', chainId: m.chainId, nonce: m.nonce },
        NOW
      )
    ).toThrow(/domain mismatch/);
  });

  it('rejects chainId mismatch (Fuji sig used on mainnet)', () => {
    const m = fixture();
    expect(() =>
      assertSiweMessageMatches(
        m,
        { domain: m.domain, chainId: 43114, nonce: m.nonce },
        NOW
      )
    ).toThrow(/chainId mismatch/);
  });

  it('rejects nonce mismatch (replay)', () => {
    const m = fixture();
    expect(() =>
      assertSiweMessageMatches(
        m,
        { domain: m.domain, chainId: m.chainId, nonce: 'b'.repeat(64) },
        NOW
      )
    ).toThrow(/nonce mismatch/);
  });

  it('rejects messages older than maxAge', () => {
    const m = fixture({ issuedAt: new Date(NOW.getTime() - 11 * 60 * 1000).toISOString() });
    expect(() =>
      assertSiweMessageMatches(
        m,
        { domain: m.domain, chainId: m.chainId, nonce: m.nonce, maxAgeSec: 600 },
        NOW
      )
    ).toThrow(/older than/);
  });

  it('rejects messages dated in the future (clock skew tolerance is 5min)', () => {
    const m = fixture({ issuedAt: new Date(NOW.getTime() + 6 * 60 * 1000).toISOString() });
    expect(() =>
      assertSiweMessageMatches(
        m,
        { domain: m.domain, chainId: m.chainId, nonce: m.nonce },
        NOW
      )
    ).toThrow(/in the future/);
  });

  it('rejects messages whose Expiration Time has passed', () => {
    const m = fixture({
      issuedAt: new Date(NOW.getTime() - 1 * 60 * 1000).toISOString(),
      expirationTime: new Date(NOW.getTime() - 30 * 1000).toISOString(),
    });
    expect(() =>
      assertSiweMessageMatches(
        m,
        { domain: m.domain, chainId: m.chainId, nonce: m.nonce },
        NOW
      )
    ).toThrow(/expired/);
  });

  it('rejects messages whose Not Before has not yet passed', () => {
    const m = fixture({ notBefore: new Date(NOW.getTime() + 5 * 60 * 1000).toISOString() });
    expect(() =>
      assertSiweMessageMatches(
        m,
        { domain: m.domain, chainId: m.chainId, nonce: m.nonce },
        NOW
      )
    ).toThrow(/Not Before/);
  });
});
