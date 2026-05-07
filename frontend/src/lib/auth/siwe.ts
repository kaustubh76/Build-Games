/**
 * Sign-In with Ethereum (EIP-4361) message builder + strict parser.
 *
 * Why a custom shim instead of the `siwe` package: it pulls a partial copy of
 * ethers and overlaps awkwardly with the project's viem-first stack. EIP-4361
 * is a small, fully-specified format — a focused parser is ~120 lines and gives
 * us tighter control over the freshness / domain / chainId checks. Signature
 * verification still goes through `viem.verifyMessage` (see verifySession in
 * session.ts and the /api/auth/verify route).
 *
 * https://eips.ethereum.org/EIPS/eip-4361
 */

export interface SiweMessage {
  domain: string;          // RFC 3986 authority (host[:port])
  address: `0x${string}`;  // EIP-55 mixed-case or all-lower; we don't enforce checksum here
  statement?: string;      // optional human-readable statement
  uri: string;             // origin URL
  version: '1';
  chainId: number;         // 43113 / 43114 / 31337
  nonce: string;           // server-issued single-use nonce
  issuedAt: string;        // ISO-8601
  expirationTime?: string; // ISO-8601
  notBefore?: string;      // ISO-8601
  requestId?: string;
  resources?: string[];
}

/**
 * Build the canonical EIP-4361 message string. Order and exact formatting
 * matter — every line must match the spec or wallets that pre-validate the
 * message format will refuse to sign.
 */
export function formatSiweMessage(m: SiweMessage): string {
  const lines: string[] = [];
  // Header line
  lines.push(`${m.domain} wants you to sign in with your Ethereum account:`);
  lines.push(m.address);
  lines.push(''); // blank
  if (m.statement && m.statement.length > 0) {
    lines.push(m.statement);
    lines.push('');
  }
  lines.push(`URI: ${m.uri}`);
  lines.push(`Version: ${m.version}`);
  lines.push(`Chain ID: ${m.chainId}`);
  lines.push(`Nonce: ${m.nonce}`);
  lines.push(`Issued At: ${m.issuedAt}`);
  if (m.expirationTime) lines.push(`Expiration Time: ${m.expirationTime}`);
  if (m.notBefore) lines.push(`Not Before: ${m.notBefore}`);
  if (m.requestId) lines.push(`Request ID: ${m.requestId}`);
  if (m.resources && m.resources.length > 0) {
    lines.push('Resources:');
    for (const r of m.resources) lines.push(`- ${r}`);
  }
  return lines.join('\n');
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Parse a signed EIP-4361 message. Throws on shape mismatch — callers should
 * treat any throw as an invalid signature attempt. We don't try to be
 * permissive: a slightly-malformed message is more likely a downgrade attack
 * than a benign formatting drift.
 */
export function parseSiweMessage(raw: string): SiweMessage {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('SIWE: empty message');
  }
  const lines = raw.split('\n');

  // Line 0: "<domain> wants you to sign in with your Ethereum account:"
  const headerMatch = lines[0]?.match(/^(\S+) wants you to sign in with your Ethereum account:$/);
  if (!headerMatch) throw new Error('SIWE: malformed header line');
  const domain = headerMatch[1];

  // Line 1: address
  const address = lines[1];
  if (!address || !ADDRESS_RE.test(address)) throw new Error('SIWE: malformed address line');

  // Line 2: blank
  if (lines[2] !== '') throw new Error('SIWE: missing blank line after address');

  // Optional statement: lines[3] is statement OR start of fields. The spec
  // says statement is followed by a blank line; if line 3 is non-blank AND
  // line 4 is blank, line 3 is the statement. Otherwise no statement.
  let cursor = 3;
  let statement: string | undefined;
  if (lines[3] !== undefined && lines[3] !== '' && lines[4] === '') {
    statement = lines[3];
    cursor = 5;
  }

  // Required fields, in exact order: URI, Version, Chain ID, Nonce, Issued At
  const fields: Record<string, string> = {};
  for (; cursor < lines.length; cursor++) {
    const line = lines[cursor];
    if (line === 'Resources:') break;
    if (line === '') continue;
    const idx = line.indexOf(': ');
    if (idx === -1) throw new Error(`SIWE: malformed field line: ${line}`);
    const k = line.slice(0, idx);
    const v = line.slice(idx + 2);
    fields[k] = v;
  }

  // Resources block (optional)
  const resources: string[] = [];
  if (lines[cursor] === 'Resources:') {
    cursor++;
    while (cursor < lines.length && lines[cursor].startsWith('- ')) {
      resources.push(lines[cursor].slice(2));
      cursor++;
    }
  }

  const required = ['URI', 'Version', 'Chain ID', 'Nonce', 'Issued At'] as const;
  for (const k of required) {
    if (!fields[k]) throw new Error(`SIWE: missing required field "${k}"`);
  }
  if (fields.Version !== '1') throw new Error(`SIWE: unsupported version "${fields.Version}"`);
  const chainId = parseInt(fields['Chain ID'], 10);
  if (!Number.isFinite(chainId)) throw new Error('SIWE: Chain ID is not an integer');
  if (!ISO_RE.test(fields['Issued At'])) throw new Error('SIWE: Issued At is not ISO-8601');
  if (fields['Expiration Time'] && !ISO_RE.test(fields['Expiration Time']))
    throw new Error('SIWE: Expiration Time is not ISO-8601');
  if (fields['Not Before'] && !ISO_RE.test(fields['Not Before']))
    throw new Error('SIWE: Not Before is not ISO-8601');

  return {
    domain,
    address: address as `0x${string}`,
    statement,
    uri: fields.URI,
    version: '1',
    chainId,
    nonce: fields.Nonce,
    issuedAt: fields['Issued At'],
    expirationTime: fields['Expiration Time'],
    notBefore: fields['Not Before'],
    requestId: fields['Request ID'],
    resources: resources.length > 0 ? resources : undefined,
  };
}

export interface SiweAssertExpected {
  domain: string;
  chainId: number;
  /**
   * If set, the message's nonce must equal this. Pass the nonce the server
   * just issued for this address and consume it in the same transaction —
   * never accept a nonce the client made up.
   */
  nonce: string;
  /** Reject messages issued more than this many seconds ago. Default: 600 (10 min). */
  maxAgeSec?: number;
  /** Reject messages whose explicit Expiration Time has passed. Default: true. */
  enforceExpirationTime?: boolean;
}

/**
 * Reject the message if any of the load-bearing fields don't match what the
 * server expected. This is the single place we decide a SIWE message is
 * acceptable — every gate (nonce, domain, chainId, age, expiration) must pass.
 */
export function assertSiweMessageMatches(
  m: SiweMessage,
  expected: SiweAssertExpected,
  now: Date = new Date()
): void {
  if (m.domain !== expected.domain) {
    throw new Error(`SIWE: domain mismatch (expected "${expected.domain}", got "${m.domain}")`);
  }
  if (m.chainId !== expected.chainId) {
    throw new Error(`SIWE: chainId mismatch (expected ${expected.chainId}, got ${m.chainId})`);
  }
  if (m.nonce !== expected.nonce) {
    throw new Error('SIWE: nonce mismatch (replay or stale handshake)');
  }
  const issuedAtMs = Date.parse(m.issuedAt);
  if (!Number.isFinite(issuedAtMs)) throw new Error('SIWE: unparseable Issued At');
  const maxAge = (expected.maxAgeSec ?? 600) * 1000;
  if (now.getTime() - issuedAtMs > maxAge) {
    throw new Error(`SIWE: message is older than ${maxAge / 1000}s`);
  }
  // Reject messages dated noticeably in the future (clock skew tolerance).
  if (issuedAtMs - now.getTime() > 5 * 60 * 1000) {
    throw new Error('SIWE: Issued At is in the future');
  }
  if ((expected.enforceExpirationTime ?? true) && m.expirationTime) {
    const expMs = Date.parse(m.expirationTime);
    if (Number.isFinite(expMs) && now.getTime() > expMs) {
      throw new Error('SIWE: message has expired');
    }
  }
  if (m.notBefore) {
    const nbMs = Date.parse(m.notBefore);
    if (Number.isFinite(nbMs) && now.getTime() < nbMs) {
      throw new Error('SIWE: message Not Before has not been reached');
    }
  }
}
