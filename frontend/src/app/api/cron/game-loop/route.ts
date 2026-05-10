import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { avalancheFuji, avalanche } from 'viem/chains';
import {
  getContracts,
  getChainId,
  getAvalancheRpcUrl,
  ArenaFactoryAbi,
} from '../../../../constants';
import { handleAPIError, createAPILogger } from '@/lib/api';
import { requireCronSecret } from '@/lib/auth/requireCronSecret';

/**
 * GET /api/cron/game-loop
 *
 * Vercel Cron Job that runs every minute to automate arena battles:
 *   1. Reads all arena addresses from the ArenaFactory contract
 *   2. Calls game-master to start games whose betting period has ended
 *   3. Calls game-master to execute the next round for active battles
 *
 * Secured by CRON_SECRET — Vercel sets this automatically for cron routes.
 * Errors funnel through `handleAPIError` so the response shape is the same
 * `{ error, code, details }` envelope clients see for any other 4xx/5xx.
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request);
  logger.start();

  try {
    requireCronSecret(request);

    const chainId = getChainId();
    const chain = chainId === 43114 ? avalanche : avalancheFuji;

    const client = createPublicClient({
      chain,
      transport: http(getAvalancheRpcUrl()),
    });

    const contracts = getContracts();
    const factoryAddress = contracts.ArenaFactory as `0x${string}`;

    // Fetch all arena addresses from the factory contract
    const arenas = await client.readContract({
      address: factoryAddress,
      abi: ArenaFactoryAbi,
      functionName: 'getArenas',
    }) as string[];

    if (!arenas || arenas.length === 0) {
      logger.info('No arenas found', { factoryAddress });
      logger.complete(200);
      return NextResponse.json(
        { success: true, message: 'No arenas found', actions: [] },
        { headers: logger.getResponseHeaders() }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const results: Record<string, unknown>[] = [];

    // Phase 1: Check and start games whose betting period ended
    const startRes = await fetch(`${baseUrl}/api/game-master`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'checkAndStartGames',
        arenaAddresses: arenas,
      }),
    });
    if (startRes.ok) {
      results.push({ phase: 'checkAndStartGames', ...(await startRes.json()) });
    } else {
      logger.warn('checkAndStartGames returned non-OK status', { status: startRes.status });
    }

    // Phase 2: Execute next rounds for battles in progress
    const roundRes = await fetch(`${baseUrl}/api/game-master`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'checkAndExecuteRounds',
        arenaAddresses: arenas,
      }),
    });
    if (roundRes.ok) {
      results.push({ phase: 'checkAndExecuteRounds', ...(await roundRes.json()) });
    } else {
      logger.warn('checkAndExecuteRounds returned non-OK status', { status: roundRes.status });
    }

    logger.complete(200, `Processed ${arenas.length} arenas across 2 phases`);
    return NextResponse.json(
      {
        success: true,
        arenaCount: arenas.length,
        results,
        timestamp: new Date().toISOString(),
      },
      { headers: logger.getResponseHeaders() }
    );
  } catch (error) {
    logger.error('cron game-loop failed', error);
    return handleAPIError(error, 'API:Cron:GameLoop:GET');
  }
}
