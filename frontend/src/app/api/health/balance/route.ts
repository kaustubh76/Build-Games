import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import {
  AVALANCHE_RPC,
  AVALANCHE_CONTRACTS,
  ERC20_ABI,
  getServerPrivateKey,
} from '@/lib/apiConfig';
import { chainMetrics } from '@/lib/metrics';

/**
 * GET /api/health/balance
 *
 * Server-wallet CRwN balance health check. Returns 200 if balance >= floor,
 * 503 if below. The floor defaults to 100 CRwN; configure via
 * SERVER_WALLET_BALANCE_FLOOR_CRWN.
 *
 * Designed to be hit by Vercel cron / external monitors. Also publishes
 * `server_wallet_crwn_balance` and `server_wallet_balance_below_floor` gauges
 * to /api/metrics for Prometheus scrapers.
 */

const FLOOR_CRWN = process.env.SERVER_WALLET_BALANCE_FLOOR_CRWN ?? '100';

export async function GET(_request: NextRequest) {
  const startedAt = Date.now();
  try {
    const pk = getServerPrivateKey();
    if (!pk) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'Server signer not configured',
          code: 'NO_SIGNER',
        },
        { status: 503 }
      );
    }

    const provider = new ethers.JsonRpcProvider(AVALANCHE_RPC);
    const wallet = new ethers.Wallet(pk, provider);
    const crown = new ethers.Contract(
      AVALANCHE_CONTRACTS.crownToken,
      ERC20_ABI,
      provider
    );

    const balanceWei: bigint = await crown.balanceOf(wallet.address);
    const balanceCRwN = parseFloat(ethers.formatEther(balanceWei));
    const floor = parseFloat(FLOOR_CRWN);
    const belowFloor = balanceCRwN < floor;

    chainMetrics.setGauge('server_wallet_crwn_balance', balanceCRwN);
    chainMetrics.setGauge('server_wallet_balance_below_floor', belowFloor ? 1 : 0);

    return NextResponse.json(
      {
        ok: !belowFloor,
        wallet: wallet.address,
        balanceCRwN: balanceCRwN.toFixed(6),
        floorCRwN: floor.toFixed(2),
        belowFloor,
        reason: belowFloor
          ? `Balance ${balanceCRwN.toFixed(2)} CRwN is below floor ${floor} CRwN. Top up ${wallet.address}.`
          : undefined,
        durationMs: Date.now() - startedAt,
      },
      {
        status: belowFloor ? 503 : 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (e) {
    chainMetrics.incrementCounter('server_wallet_balance_check_errors_total');
    return NextResponse.json(
      {
        ok: false,
        reason: e instanceof Error ? e.message : 'unknown',
        code: 'BALANCE_CHECK_FAILED',
      },
      { status: 503 }
    );
  }
}
