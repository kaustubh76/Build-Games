/**
 * Centralized API Error Handling
 * Provides consistent error responses across all API routes
 */

import { NextResponse } from 'next/server';

/**
 * Custom API Error class with status code and error code
 */
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Prisma error codes we handle specially
 */
const PRISMA_ERROR_CODES: Record<string, { message: string; status: number; code: string }> = {
  P2000: { message: 'Value too long for column', status: 400, code: 'VALUE_TOO_LONG' },
  P2001: { message: 'Record not found', status: 404, code: 'NOT_FOUND' },
  P2002: { message: 'Unique constraint violation', status: 409, code: 'DUPLICATE' },
  P2003: { message: 'Foreign key constraint failed', status: 400, code: 'INVALID_REFERENCE' },
  P2025: { message: 'Resource not found', status: 404, code: 'NOT_FOUND' },
};

/**
 * Handle API errors and return consistent NextResponse
 *
 * @param error - The error to handle
 * @param context - Context string for logging (e.g., "API:Battles:GET")
 * @returns NextResponse with appropriate status code and error message
 */
export function handleAPIError(error: unknown, context: string): NextResponse {
  console.error(`[${context}]`, error);

  // Handle our custom APIError
  if (error instanceof APIError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        details: error.details,
      },
      { status: error.statusCode }
    );
  }

  // Handle Prisma errors. Prisma error codes always match /^P\d{4}$/
  // (e.g. P2002, P2025). Many other error sources — ethers (CALL_EXCEPTION),
  // viem (-32000), node fs (ENOENT) — also have a `code` field. Don't tag
  // those as DATABASE_ERROR; that confused users for the entire previous session.
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    /^P\d{4}$/.test((error as { code: string }).code)
  ) {
    const prismaError = error as { code: string; message: string; meta?: unknown };
    const mapping = PRISMA_ERROR_CODES[prismaError.code];

    if (mapping) {
      return NextResponse.json(
        {
          error: mapping.message,
          code: mapping.code,
          details: prismaError.meta,
        },
        { status: mapping.status }
      );
    }

    // Unknown Prisma error
    return NextResponse.json(
      {
        error: 'Database operation failed',
        code: 'DATABASE_ERROR',
        details: { prismaCode: prismaError.code },
      },
      { status: 500 }
    );
  }

  // Handle ethers / viem revert + RPC errors. Surface the underlying message
  // (truncated) so operators can see WHY a write reverted without a 500-with-stack.
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    const chainCode = (error as { code: string }).code;
    const isChainErr =
      chainCode === 'CALL_EXCEPTION' ||
      chainCode === 'INSUFFICIENT_FUNDS' ||
      chainCode === 'NONCE_EXPIRED' ||
      chainCode === 'REPLACEMENT_UNDERPRICED' ||
      chainCode === 'TRANSACTION_REPLACED' ||
      chainCode === 'NETWORK_ERROR' ||
      chainCode === 'TIMEOUT' ||
      chainCode === 'SERVER_ERROR' ||
      chainCode === 'UNSUPPORTED_OPERATION' ||
      chainCode === 'UNCONFIGURED_NAME';
    if (isChainErr) {
      const isDev = process.env.NODE_ENV === 'development';
      const errMsg = (error as { message?: string }).message ?? 'Chain call failed';
      const shortMsg = (error as { shortMessage?: string }).shortMessage;
      // Production: surface only the chain-side error code so clients can
      // discriminate (e.g. INSUFFICIENT_FUNDS triggers a top-up CTA) without
      // leaking specific account state. The full revert reason often
      // contains balances, addresses, or internal contract paths an attacker
      // could use to fingerprint a target.
      const clientMsg = isDev
        ? (shortMsg ?? errMsg.slice(0, 240))
        : `Chain call failed (${chainCode})`;
      return NextResponse.json(
        {
          error: clientMsg,
          code: 'CHAIN_CALL_FAILED',
          details: { chainCode, fullMessage: isDev ? errMsg : undefined },
        },
        { status: 502 } // upstream (chain RPC) failed
      );
    }
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    // Don't expose internal error details in production
    const isDev = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      {
        error: isDev ? error.message : 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: isDev ? { stack: error.stack } : undefined,
      },
      { status: 500 }
    );
  }

  // Unknown error type
  return NextResponse.json(
    {
      error: 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
    },
    { status: 500 }
  );
}

/**
 * Common HTTP error responses
 */
export const ErrorResponses = {
  notFound: (resource: string = 'Resource') =>
    new APIError(`${resource} not found`, 404, 'NOT_FOUND'),

  unauthorized: (message: string = 'Authentication required') =>
    new APIError(message, 401, 'UNAUTHORIZED'),

  forbidden: (message: string = 'Access denied') =>
    new APIError(message, 403, 'FORBIDDEN'),

  badRequest: (message: string, details?: unknown) =>
    new APIError(message, 400, 'BAD_REQUEST', details),

  conflict: (message: string = 'Resource already exists') =>
    new APIError(message, 409, 'CONFLICT'),

  rateLimitExceeded: (resetIn: number) =>
    new APIError(
      `Rate limit exceeded. Try again in ${Math.ceil(resetIn / 1000)} seconds`,
      429,
      'RATE_LIMIT_EXCEEDED',
      { resetIn }
    ),

  internal: (message: string = 'Internal server error') =>
    new APIError(message, 500, 'INTERNAL_ERROR'),

  serviceUnavailable: (message: string = 'Service temporarily unavailable') =>
    new APIError(message, 503, 'SERVICE_UNAVAILABLE'),

  // ============================================================================
  // Domain-specific error codes — used by mirror-trade endpoints to give
  // clients a stable, machine-readable handle on common rejections. The hook
  // layer (useMirrorWhaleTrade) keys retry behavior off these codes.
  // ============================================================================
  notEnoughCRwN: (haveCRwN: string, needCRwN: string, walletAddress: string) =>
    new APIError(
      `Server wallet has insufficient CRwN: have ${haveCRwN}, need ${needCRwN}. Top up ${walletAddress}.`,
      503,
      'NOT_ENOUGH_CRWN',
      { haveCRwN, needCRwN, walletAddress }
    ),

  marketActivationPending: (mirrorKey: string, retryAfterSeconds: number) =>
    new APIError(
      `Mirror market created on-chain but not yet active. Retry in ~${retryAfterSeconds}s.`,
      202,
      'MARKET_ACTIVATION_PENDING',
      { mirrorKey, retryAfterSeconds }
    ),

  slippageExceeded: (expectedShares: string, minShares: string) =>
    new APIError(
      `Slippage exceeds tolerance. Expected ${expectedShares}, would receive less than minimum ${minShares}.`,
      400,
      'SLIPPAGE_EXCEEDED',
      { expectedShares, minShares }
    ),

  dailyCapReached: (capCRwN: string, spentCRwN: string) =>
    new APIError(
      `Daily mirror-trade cap reached: ${spentCRwN} / ${capCRwN} CRwN. Resets 24h after first spend.`,
      400,
      'DAILY_CAP_REACHED',
      { capCRwN, spentCRwN }
    ),

  tradingPaused: () =>
    new APIError(
      'Trading paused for this user. Resume from the Risk Dashboard to continue.',
      400,
      'TRADING_PAUSED'
    ),

  perTradeCapExceeded: (capCRwN: string, requestedCRwN: string) =>
    new APIError(
      `Per-trade cap exceeded: requested ${requestedCRwN} > max ${capCRwN} CRwN.`,
      400,
      'PER_TRADE_CAP_EXCEEDED',
      { capCRwN, requestedCRwN }
    ),

  noActiveMirror: (source: string, externalId: string, autoCreateEnabled: boolean) =>
    new APIError(
      autoCreateEnabled
        ? `No active mirror market for ${source} ${externalId}. Auto-create attempted but failed.`
        : `No active mirror market for ${source} ${externalId}. Ask a creator to mirror it first, or set ENABLE_AUTO_CREATE_MIRROR=1 on the server.`,
      400,
      'NO_ACTIVE_MIRROR',
      { source, externalId, autoCreateEnabled }
    ),
};
