import { NextRequest, NextResponse } from 'next/server';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import {
  getUserSpendInfo,
  isUserPaused,
  pauseUser,
  unpauseUser,
  PER_TRADE_CAP_WEI,
  PER_USER_DAILY_CAP_WEI,
  MAX_SLIPPAGE_BPS,
} from '@/lib/safetyLimits';

/**
 * GET  /api/safety?address=0x...   → returns user's spend window, cap, paused state, system caps
 * POST /api/safety { address, action: 'pause' | 'resume' }
 *
 * 0G-native: state lives in-process. Cold starts wipe pause + spend (intentional —
 * the on-chain CRwN allowance is the real ceiling; this is an extra layer).
 */

export async function GET(request: NextRequest) {
  try {
    applyRateLimit(request, { prefix: 'safety-read', maxRequests: 60, windowMs: 60_000 });
    const address = request.nextUrl.searchParams.get('address');
    if (!address || !/^0[xX][0-9a-fA-F]{40}$/.test(address)) {
      throw ErrorResponses.badRequest('Missing or invalid address');
    }
    return NextResponse.json({
      user: getUserSpendInfo(address),
      system: {
        perTradeCapWei: PER_TRADE_CAP_WEI.toString(),
        perUserDailyCapWei: PER_USER_DAILY_CAP_WEI.toString(),
        maxSlippageBps: MAX_SLIPPAGE_BPS,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Safety:GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    applyRateLimit(request, { prefix: 'safety-write', maxRequests: 10, windowMs: 60_000 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      throw ErrorResponses.badRequest('Body must be JSON');
    }
    const { address, action } = body as { address?: string; action?: string };
    if (!address || !/^0[xX][0-9a-fA-F]{40}$/.test(address)) {
      throw ErrorResponses.badRequest('Missing or invalid address');
    }
    if (action === 'pause') {
      pauseUser(address);
    } else if (action === 'resume') {
      unpauseUser(address);
    } else {
      throw ErrorResponses.badRequest('action must be "pause" or "resume"');
    }
    return NextResponse.json({
      address,
      paused: isUserPaused(address),
      action,
    });
  } catch (error) {
    return handleAPIError(error, 'API:Safety:POST');
  }
}
