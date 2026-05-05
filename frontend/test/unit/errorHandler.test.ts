/**
 * Unit tests for handleAPIError — specifically the bug fix that stopped
 * tagging non-Prisma errors as DATABASE_ERROR.
 */

import { describe, it, expect } from 'vitest';
import { handleAPIError, APIError, ErrorResponses } from '@/lib/api/errorHandler';

describe('handleAPIError', () => {
  it('handles APIError with its own status + code', async () => {
    const res = handleAPIError(ErrorResponses.badRequest('nope'), 'TEST');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.error).toBe('nope');
  });

  it('handles known Prisma error codes', async () => {
    const prismaP2025 = { code: 'P2025', message: 'whatever', meta: { foo: 1 } };
    const res = handleAPIError(prismaP2025, 'TEST');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
    expect(body.error).toBe('Resource not found');
  });

  it('handles unknown Prisma error codes (P-prefixed) as DATABASE_ERROR', async () => {
    const prismaP9999 = { code: 'P9999', message: 'unknown', meta: {} };
    const res = handleAPIError(prismaP9999, 'TEST');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('DATABASE_ERROR');
    expect(body.details).toEqual({ prismaCode: 'P9999' });
  });

  it('does NOT tag ethers CALL_EXCEPTION as DATABASE_ERROR', async () => {
    // This was the bug — ethers errors with code: 'CALL_EXCEPTION' got
    // mis-classified as DB errors, confusing users for an entire session.
    const ethersError = {
      code: 'CALL_EXCEPTION',
      message: 'execution reverted (custom error)',
      shortMessage: 'execution reverted',
      reason: null,
    };
    const res = handleAPIError(ethersError, 'TEST');
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('CHAIN_CALL_FAILED');
    expect(body.code).not.toBe('DATABASE_ERROR');
    expect(body.error).toBe('execution reverted');
  });

  it('handles viem RPC errors (numeric -32000 codes are NOT Prisma)', async () => {
    // viem rpc errors carry .code as -32xxx, but JSON-RPC string codes
    // can also appear. Verify neither path mis-tags.
    const viemNumericError = { code: -32000, message: 'requested too many blocks' };
    const res = handleAPIError(viemNumericError, 'TEST');
    // code is a number, not a string → falls through neither Prisma nor chain branch
    // → handled as a plain object → INTERNAL_ERROR or UNKNOWN_ERROR.
    const body = await res.json();
    expect(body.code).not.toBe('DATABASE_ERROR');
  });

  it('CALL_EXCEPTION returns 502 (upstream chain failure)', async () => {
    const res = handleAPIError(
      { code: 'CALL_EXCEPTION', message: 'reverted' },
      'TEST'
    );
    expect(res.status).toBe(502);
  });

  it('INSUFFICIENT_FUNDS routed through chain branch', async () => {
    const res = handleAPIError(
      { code: 'INSUFFICIENT_FUNDS', message: 'sender does not have enough' },
      'TEST'
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('CHAIN_CALL_FAILED');
  });

  it('truncates very long ethers messages to 240 chars', async () => {
    const longMsg = 'execution reverted ' + 'A'.repeat(500);
    const res = handleAPIError({ code: 'CALL_EXCEPTION', message: longMsg }, 'TEST');
    const body = await res.json();
    expect(body.error.length).toBeLessThanOrEqual(240);
  });

  it('prefers shortMessage when available', async () => {
    const res = handleAPIError(
      {
        code: 'CALL_EXCEPTION',
        message: 'long detailed text...',
        shortMessage: 'execution reverted',
      },
      'TEST'
    );
    const body = await res.json();
    expect(body.error).toBe('execution reverted');
  });

  it('plain Error → INTERNAL_ERROR', async () => {
    const res = handleAPIError(new Error('boom'), 'TEST');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('unknown error type → UNKNOWN_ERROR', async () => {
    const res = handleAPIError('just a string', 'TEST');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('UNKNOWN_ERROR');
  });

  it('APIError class instance roundtrips correctly', () => {
    const err = new APIError('oops', 418, 'TEAPOT', { brewing: true });
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('TEAPOT');
    expect(err.details).toEqual({ brewing: true });
  });
});
