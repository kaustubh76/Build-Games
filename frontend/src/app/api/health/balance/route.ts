import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { formatEther, type Address } from 'viem';
import {
  AVALANCHE_CONTRACTS,
  getServerPrivateKey,
} from '@/lib/apiConfig';
import { getResilientPublicClient } from '@/lib/viemClient';
import { chainMetrics } from '@/lib/metrics';

/**
 * GET /api/health/balance
 *
 * Server-wallet CRwN balance health check. Returns 200 if balance >= floor,
 * 503 if below. The floor defaults to 100 CRwN; configure via
 * SERVER_WALLET_BALANCE_FLOOR_CRWN.
 *
 * Bug #5 fix: previously this route used a raw `ethers.JsonRpcProvider` against
 * the primary Avalanche RPC, so it died with a 503 during the very rate-limit
 * outages it was supposed to detect. Now it reads `balanceOf` via the resilient
 * viem client (primary → fallback failover), and the wallet's address is
 * derived from the private key locally (no RPC hop needed for `wallet.address`).
 *
 * Designed to be hit by Vercel cron / external monitors. Also publishes
 * `server_wallet_crwn_balance` and `server_wallet_balance_below_floor` gauges
 * to /api/metrics for Prometheus scrapers.
 */

const FLOOR_CRWN = process.env.SERVER_WALLET_BALANCE_FLOOR_CRWN ?? '100';

const ERC20_BALANCE_OF_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

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

    // Pure key-derivation — no RPC call. ethers.Wallet without a provider
    // exposes `.address` from the private key alone.
    const walletAddress = new ethers.Wallet(pk).address as Address;

    // Resilient client: primary → fallback failover so a rate-limited primary
    // doesn't take down the very health check that's there to detect it.
    const client = getResilientPublicClient();
    const balanceWei = await client.readContract({
      address: AVALANCHE_CONTRACTS.crownToken as Address,
      abi: ERC20_BALANCE_OF_ABI,
      functionName: 'balanceOf',
      args: [walletAddress],
    });

    const balanceCRwN = parseFloat(formatEther(balanceWei as bigint));
    const floor = parseFloat(FLOOR_CRWN);
    const belowFloor = balanceCRwN < floor;

    chainMetrics.setGauge('server_wallet_crwn_balance', balanceCRwN);
    chainMetrics.setGauge('server_wallet_balance_below_floor', belowFloor ? 1 : 0);

    return NextResponse.json(
      {
        ok: !belowFloor,
        wallet: walletAddress,
        balanceCRwN: balanceCRwN.toFixed(6),
        floorCRwN: floor.toFixed(2),
        belowFloor,
        reason: belowFloor
          ? `Balance ${balanceCRwN.toFixed(2)} CRwN is below floor ${floor} CRwN. Top up ${walletAddress}.`
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
