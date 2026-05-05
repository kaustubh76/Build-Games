/**
 * Tests for the structured ErrorResponses factories added in T3.1.
 * These give clients stable codes for common rejections (TRADING_PAUSED,
 * NOT_ENOUGH_CRWN, DAILY_CAP_REACHED, etc.) instead of regex on prose.
 */

import { describe, it, expect } from 'vitest';
import { ErrorResponses, handleAPIError } from '@/lib/api/errorHandler';

describe('Structured ErrorResponses factories', () => {
  it('tradingPaused → 400 + TRADING_PAUSED', async () => {
    const res = handleAPIError(ErrorResponses.tradingPaused(), 'TEST');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('TRADING_PAUSED');
    expect(body.error).toMatch(/Trading paused/i);
  });

  it('perTradeCapExceeded → 400 + PER_TRADE_CAP_EXCEEDED with details', async () => {
    const res = handleAPIError(
      ErrorResponses.perTradeCapExceeded('1000', '5000'),
      'TEST'
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('PER_TRADE_CAP_EXCEEDED');
    expect(body.details).toEqual({ capCRwN: '1000', requestedCRwN: '5000' });
  });

  it('dailyCapReached → 400 + DAILY_CAP_REACHED', async () => {
    const res = handleAPIError(
      ErrorResponses.dailyCapReached('5000', '5000'),
      'TEST'
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('DAILY_CAP_REACHED');
  });

  it('notEnoughCRwN → 503 + NOT_ENOUGH_CRWN with wallet address', async () => {
    const res = handleAPIError(
      ErrorResponses.notEnoughCRwN('5.6', '100', '0xabc'),
      'TEST'
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('NOT_ENOUGH_CRWN');
    expect(body.details.walletAddress).toBe('0xabc');
    expect(body.details.haveCRwN).toBe('5.6');
    expect(body.details.needCRwN).toBe('100');
  });

  it('marketActivationPending → 202 + MARKET_ACTIVATION_PENDING', async () => {
    const res = handleAPIError(
      ErrorResponses.marketActivationPending('0xkey', 45),
      'TEST'
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.code).toBe('MARKET_ACTIVATION_PENDING');
    expect(body.details.retryAfterSeconds).toBe(45);
  });

  it('slippageExceeded → 400 + SLIPPAGE_EXCEEDED', async () => {
    const res = handleAPIError(
      ErrorResponses.slippageExceeded('1000', '970'),
      'TEST'
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('SLIPPAGE_EXCEEDED');
  });

  it('noActiveMirror auto-create disabled mentions the env flag', async () => {
    const res = handleAPIError(
      ErrorResponses.noActiveMirror('POLYMARKET', 'mkt-123', false),
      'TEST'
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('NO_ACTIVE_MIRROR');
    expect(body.error).toMatch(/ENABLE_AUTO_CREATE_MIRROR/);
  });

  it('noActiveMirror auto-create enabled does NOT mention the env flag', async () => {
    const res = handleAPIError(
      ErrorResponses.noActiveMirror('POLYMARKET', 'mkt-123', true),
      'TEST'
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).not.toMatch(/ENABLE_AUTO_CREATE_MIRROR/);
    expect(body.error).toMatch(/Auto-create attempted but failed/);
  });
});
