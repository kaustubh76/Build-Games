import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { keccak256, toBytes } from 'viem';
import {
  AVALANCHE_RPC,
  AVALANCHE_CONTRACTS,
  AI_AGENT_INFT_ABI,
  PREDICTION_MARKET_ABI,
  ERC20_ABI,
  getServerPrivateKey,
} from '@/lib/apiConfig';
import { prisma } from '@/lib/prisma';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

// In-memory idempotency cache (for production, use Redis)
// Maps idempotency key -> { timestamp, result }
const idempotencyCache = new Map<string, { timestamp: number; result: unknown }>();
const IDEMPOTENCY_WINDOW_MS = 60000; // 1 minute window for duplicate detection

// Clean up old entries periodically
function cleanupIdempotencyCache() {
  const now = Date.now();
  for (const [key, value] of idempotencyCache.entries()) {
    if (now - value.timestamp > IDEMPOTENCY_WINDOW_MS * 2) {
      idempotencyCache.delete(key);
    }
  }
  // Prevent unbounded growth
  if (idempotencyCache.size > 10000) {
    const entries = Array.from(idempotencyCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, 5000);
    idempotencyCache.clear();
    entries.forEach(([k, v]) => idempotencyCache.set(k, v));
  }
}

// Copy trade config from AIAgentINFT (Avalanche)
interface CopyTradeConfig {
  tokenId: bigint;
  maxAmountPerTrade: bigint;
  totalCopied: bigint;
  startedAt: bigint;
  isActive: boolean;
}

// Agent on-chain data from AIAgentINFT (Avalanche)
interface AgentOnChainData {
  tier: number;
  stakedAmount: bigint;
  isActive: boolean;
  copyTradingEnabled: boolean;
  createdAt: bigint;
  lastUpdatedAt: bigint;
}

interface ExecutionResult {
  follower: string;
  amount: string;
  success: boolean;
  txHash?: string;
  error?: string;
  tokensReceived?: string;
}

/**
 * POST /api/copy-trade/execute
 * Execute copy trades for all followers of an agent
 *
 * Body: {
 *   agentId: number,
 *   marketId: number,
 *   isYes: boolean,
 *   agentTradeAmount: string (in CRwN, e.g., "10")
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting for copy trade execution (5/min - critical operation)
    applyRateLimit(request, {
      prefix: 'copy-trade-execute',
      maxRequests: 5,
      windowMs: 60000,
    });

    const body = await request.json();
    const { agentId, marketId, isYes, agentTradeAmount } = body;

    // Validate required fields with proper type checking (marketId can be 0)
    if (
      !agentId ||
      typeof marketId !== 'number' ||
      typeof isYes !== 'boolean' ||
      !agentTradeAmount
    ) {
      throw ErrorResponses.badRequest('Missing or invalid required fields: agentId, marketId, isYes, agentTradeAmount');
    }

    // Generate idempotency key from request body
    const idempotencyKey = keccak256(
      toBytes(JSON.stringify({ agentId, marketId, isYes, agentTradeAmount }))
    );

    // Check for duplicate request within window
    cleanupIdempotencyCache();
    const existingRequest = idempotencyCache.get(idempotencyKey);
    if (existingRequest && Date.now() - existingRequest.timestamp < IDEMPOTENCY_WINDOW_MS) {
      console.log(`[Copy Trade] Returning cached response for idempotency key: ${idempotencyKey.slice(0, 10)}...`);
      return NextResponse.json({
        ...(existingRequest.result as object),
        cached: true,
        message: 'Duplicate request detected, returning cached result',
      });
    }

    // Get server private key for executing trades
    const privateKey = getServerPrivateKey();
    if (!privateKey) {
      throw ErrorResponses.serviceUnavailable('Server not configured for copy trade execution');
    }

    // Setup provider and wallet for Avalanche
    const avalancheProvider = new ethers.JsonRpcProvider(AVALANCHE_RPC);
    const wallet = new ethers.Wallet(privateKey, avalancheProvider);

    // Create contract instances
    // AIAgentINFT on Avalanche - for reading followers and copy configs
    const inftContract = new ethers.Contract(
      AVALANCHE_CONTRACTS.aiAgentINFT,
      AI_AGENT_INFT_ABI,
      avalancheProvider
    );

    const marketContract = new ethers.Contract(
      AVALANCHE_CONTRACTS.predictionMarketAMM,
      PREDICTION_MARKET_ABI,
      wallet
    );

    const crownToken = new ethers.Contract(
      AVALANCHE_CONTRACTS.crownToken,
      ERC20_ABI,
      wallet
    );

    // Get agent info from Avalanche iNFT contract
    let agentData: AgentOnChainData;
    let agentOwner: string;
    try {
      agentData = await inftContract.getAgentData(agentId);
      agentOwner = await inftContract.ownerOf(agentId);
    } catch (err) {
      console.error('Error getting agent data from Avalanche:', err);
      throw ErrorResponses.notFound(`Agent #${agentId} not found on Avalanche`);
    }

    if (!agentData.isActive) {
      throw ErrorResponses.badRequest(`Agent #${agentId} is not active`);
    }

    if (!agentData.copyTradingEnabled) {
      throw ErrorResponses.badRequest(`Agent #${agentId} does not have copy trading enabled`);
    }

    // Get all followers of this agent from Avalanche
    const followers: string[] = await inftContract.getAgentFollowers(agentId);

    if (followers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No followers to execute copy trades for',
        agentId,
        marketId,
        isYes,
        executed: 0
      });
    }

    // Verify market is active
    const market = await marketContract.getMarket(marketId);
    console.log(`[Copy Trade] Market #${marketId} status:`, market.status, 'type:', typeof market.status);
    // Handle both BigInt and number comparison
    if (Number(market.status) !== 0) { // ACTIVE = 0
      throw ErrorResponses.badRequest(`Market #${marketId} is not active (status: ${market.status})`);
    }

    const currentTime = Math.floor(Date.now() / 1000);
    if (Number(market.endTime) <= currentTime) {
      throw ErrorResponses.badRequest(`Market #${marketId} has expired`);
    }

    const results: ExecutionResult[] = [];
    let successCount = 0;
    let totalVolume = BigInt(0);

    // Check server wallet balance
    const walletBalance = await crownToken.balanceOf(wallet.address);
    console.log(`Server wallet balance: ${ethers.formatEther(walletBalance)} CRwN`);

    // Check and approve if needed
    const currentAllowance = await crownToken.allowance(wallet.address, AVALANCHE_CONTRACTS.predictionMarketAMM);
    const neededAmount = ethers.parseEther(agentTradeAmount) * BigInt(followers.length);

    if (currentAllowance < neededAmount) {
      console.log('Approving CRwN for copy trades...');
      const approveTx = await crownToken.approve(
        AVALANCHE_CONTRACTS.predictionMarketAMM,
        ethers.MaxUint256 // Infinite approval for convenience
      );
      await approveTx.wait();
      console.log('Approval confirmed');
    }

    // For each follower, check their config and execute copy trade
    for (const follower of followers) {
      try {
        // Get follower's copy trade config from Avalanche
        const config: CopyTradeConfig = await inftContract.getCopyTradeConfig(follower, agentId);

        if (!config.isActive) {
          results.push({
            follower,
            amount: '0',
            success: false,
            error: 'Copy trading not active for this follower'
          });
          continue;
        }

        // Calculate trade amount (min of agent trade and follower's max)
        const agentAmount = ethers.parseEther(agentTradeAmount);
        const maxAmount = config.maxAmountPerTrade;
        const tradeAmount = agentAmount < maxAmount ? agentAmount : maxAmount;

        // Check if we have enough balance
        if (tradeAmount > walletBalance) {
          results.push({
            follower,
            amount: ethers.formatEther(tradeAmount),
            success: false,
            error: 'Insufficient server wallet balance'
          });
          continue;
        }

        // Execute copy trade
        // Note: This uses server wallet to execute on behalf of follower
        // In production, this should use the follower's own approval/signature
        const tx = await marketContract.executeCopyTrade(
          agentId,
          marketId,
          isYes,
          tradeAmount
        );
        const receipt = await tx.wait();

        // Parse events to get tokens received
        let tokensReceived = 'unknown';
        for (const log of receipt.logs) {
          try {
            const parsed = marketContract.interface.parseLog(log);
            if (parsed?.name === 'TokensPurchased') {
              tokensReceived = ethers.formatEther(parsed.args.tokensOut);
            }
          } catch (parseError) {
            // Expected for events from other contracts (e.g., ERC20 Transfer events)
            // Only log in development for debugging
            if (process.env.NODE_ENV === 'development') {
              console.debug('[Copy Trade] Could not parse log (likely from different contract):', parseError);
            }
          }
        }

        results.push({
          follower,
          amount: ethers.formatEther(tradeAmount),
          success: true,
          txHash: receipt.hash,
          tokensReceived
        });

        // Track copy trade in database for PnL calculation
        try {
          await prisma.agentTrade.create({
            data: {
              agentId: agentId.toString(),
              marketId: marketId.toString(),
              isYes: isYes,
              amount: tradeAmount.toString(),
              txHash: receipt.hash,
              isCopyTrade: true,
              copiedFrom: agentId.toString(),
              recordedOn0G: false,
            }
          });
          console.log(`   📊 Copy trade tracked for follower ${follower.slice(0, 8)}...`);
        } catch (dbError) {
          console.error('   ⚠️ Failed to track copy trade in database:', dbError);
        }

        successCount++;
        totalVolume += tradeAmount;

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          follower,
          amount: '0',
          success: false,
          error: errorMessage
        });
      }
    }

    const responseData = {
      success: true,
      summary: {
        agentId,
        agentOwner,
        agentTier: Number(agentData.tier),
        marketId,
        marketQuestion: market.question,
        direction: isYes ? 'YES' : 'NO',
        totalFollowers: followers.length,
        successfulExecutions: successCount,
        failedExecutions: followers.length - successCount,
        totalVolume: ethers.formatEther(totalVolume)
      },
      results,
      timestamp: new Date().toISOString()
    };

    // Cache the successful result for idempotency
    idempotencyCache.set(idempotencyKey, {
      timestamp: Date.now(),
      result: responseData,
    });

    return NextResponse.json(responseData);

  } catch (error) {
    return handleAPIError(error, 'API:CopyTrade:Execute:POST');
  }
}

/**
 * GET /api/copy-trade/execute?agentId=1
 * Get copy trade readiness status for an agent
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting for status checks
    applyRateLimit(request, {
      prefix: 'copy-trade-status',
      maxRequests: 60,
      windowMs: 60000,
    });

    const searchParams = request.nextUrl.searchParams;
    const agentId = searchParams.get('agentId');

    if (!agentId) {
      throw ErrorResponses.badRequest('Missing agentId parameter');
    }

    // Avalanche provider for reading agent data
    const avalancheProvider = new ethers.JsonRpcProvider(AVALANCHE_RPC);

    const inftContract = new ethers.Contract(
      AVALANCHE_CONTRACTS.aiAgentINFT,
      AI_AGENT_INFT_ABI,
      avalancheProvider
    );

    // Get agent info from Avalanche
    let agentData: AgentOnChainData;
    let agentOwner: string;
    try {
      agentData = await inftContract.getAgentData(agentId);
      agentOwner = await inftContract.ownerOf(agentId);
    } catch (err) {
      console.error('Error getting agent data from Avalanche:', err);
      throw ErrorResponses.notFound(`Agent #${agentId} not found on Avalanche`);
    }

    // Get followers from Avalanche
    const followers: string[] = await inftContract.getAgentFollowers(agentId);

    // Get active follower configs from Avalanche
    const activeFollowers: Array<{
      address: string;
      maxAmountPerTrade: string;
      totalCopied: string;
    }> = [];

    for (const follower of followers) {
      const config: CopyTradeConfig = await inftContract.getCopyTradeConfig(follower, agentId);
      if (config.isActive) {
        activeFollowers.push({
          address: follower,
          maxAmountPerTrade: ethers.formatEther(config.maxAmountPerTrade),
          totalCopied: ethers.formatEther(config.totalCopied)
        });
      }
    }

    // Check server wallet on Avalanche (where trades execute)
    const privateKey = getServerPrivateKey();
    let serverWalletStatus = { configured: false, balance: '0', address: '' };

    if (privateKey) {
      const wallet = new ethers.Wallet(privateKey, avalancheProvider);
      const crownToken = new ethers.Contract(AVALANCHE_CONTRACTS.crownToken, ERC20_ABI, avalancheProvider);
      const balance = await crownToken.balanceOf(wallet.address);

      serverWalletStatus = {
        configured: true,
        balance: ethers.formatEther(balance),
        address: wallet.address
      };
    }

    return NextResponse.json({
      success: true,
      agent: {
        id: Number(agentId),
        owner: agentOwner,
        tier: Number(agentData.tier),
        isActive: agentData.isActive,
        copyTradingEnabled: agentData.copyTradingEnabled,
        stakedAmount: ethers.formatEther(agentData.stakedAmount)
      },
      copyTrading: {
        totalFollowers: followers.length,
        activeFollowers: activeFollowers.length,
        followers: activeFollowers
      },
      serverWallet: serverWalletStatus,
      chains: {
        agentData: 'Avalanche Fuji (43113)',
        tradeExecution: 'Avalanche Fuji (43113)'
      },
      executionEndpoint: 'POST /api/copy-trade/execute'
    });

  } catch (error) {
    return handleAPIError(error, 'API:CopyTrade:Execute:GET');
  }
}
