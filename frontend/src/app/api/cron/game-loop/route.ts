import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { avalancheFuji, avalanche } from 'viem/chains';
import {
  getContracts,
  getChainId,
  getAvalancheRpcUrl,
  ArenaFactoryAbi,
} from '../../../../constants';

/**
 * GET /api/cron/game-loop
 *
 * Vercel Cron Job that runs every minute to automate arena battles:
 *   1. Reads all arena addresses from the ArenaFactory contract
 *   2. Calls game-master to start games whose betting period has ended
 *   3. Calls game-master to execute the next round for active battles
 *
 * Secured by CRON_SECRET — Vercel sets this automatically for cron routes.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets Authorization header automatically)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
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
      return NextResponse.json({ success: true, message: 'No arenas found', actions: [] });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
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
    }

    return NextResponse.json({
      success: true,
      arenaCount: arenas.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron:GameLoop] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
