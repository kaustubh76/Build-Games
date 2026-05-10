/**
 * API Route: Fetch AI Agents (iNFTs)
 * Server-side fetching for iNFT agent data from Avalanche
 */

import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';
import { agentINFTService } from '@/services/agentINFTService';
import { handleAPIError, applyRateLimit, RateLimitPresets } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    await applyRateLimit(request, {
      prefix: 'agents-list',
      ...RateLimitPresets.readOperations,
    });

    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';
    // Optional caller-supplied expected minimum totalSupply (the count
    // the client believes should be on-chain after a successful mint).
    // When provided, we poll-with-backoff until the chain catches up or
    // the budget runs out — better than the previous fixed 3s wait that
    // blocked even when the chain was already up to date.
    const expectMinRaw = searchParams.get('expectMin');
    const expectMin = expectMinRaw && /^\d{1,10}$/.test(expectMinRaw)
      ? Number(expectMinRaw)
      : null;

    const isDeployed = agentINFTService.isContractDeployed();

    if (!isDeployed) {
      return NextResponse.json({
        success: true,
        agents: [],
        totalSupply: 0,
      });
    }

    // Poll for blockchain propagation when the caller signals it just
    // mutated state. Two modes:
    //   - `expectMin=N` → poll until totalSupply >= N, capped at ~3s.
    //     Returns immediately when satisfied (often the first read).
    //   - `refresh=true` (legacy) → single 800ms wait, then read once.
    //     Down from the previous 3s because most mints settle in < 1s
    //     on Fuji and the client can re-call if still stale.
    let totalSupply = await agentINFTService.getTotalSupply();
    if (expectMin !== null && Number(totalSupply) < expectMin) {
      const POLL_MS = 500;
      const MAX_POLLS = 6; // ~3s budget
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        totalSupply = await agentINFTService.getTotalSupply();
        if (Number(totalSupply) >= expectMin) break;
      }
    } else if (forceRefresh) {
      console.log('[Agents API] Force refresh requested, brief wait for propagation...');
      await new Promise((resolve) => setTimeout(resolve, 800));
      totalSupply = await agentINFTService.getTotalSupply();
    }
    console.log(`[Agents API] Total supply: ${totalSupply}, forceRefresh: ${forceRefresh}, expectMin: ${expectMin ?? 'unset'}`);

    const infts = await agentINFTService.getAllActiveINFTs();

    // Convert to JSON-serializable format (bigint -> string)
    const agents = infts.map((inft) => ({
      tokenId: inft.tokenId.toString(),
      owner: inft.owner,
      encryptedMetadataRef: inft.encryptedMetadataRef,
      metadataHash: inft.metadataHash,
      onChainData: {
        tier: inft.onChainData.tier,
        stakedAmount: inft.onChainData.stakedAmount.toString(),
        isActive: inft.onChainData.isActive,
        copyTradingEnabled: inft.onChainData.copyTradingEnabled,
        createdAt: inft.onChainData.createdAt.toString(),
        lastUpdatedAt: inft.onChainData.lastUpdatedAt.toString(),
      },
      performance: {
        totalTrades: inft.performance.totalTrades.toString(),
        winningTrades: inft.performance.winningTrades.toString(),
        totalPnL: inft.performance.totalPnL.toString(),
        accuracyBps: inft.performance.accuracyBps.toString(),
      },
    }));

    return NextResponse.json({
      success: true,
      agents,
      totalSupply: totalSupply.toString(),
    });
  } catch (error) {
    return handleAPIError(error, 'API:Agents:GET');
  }
}
