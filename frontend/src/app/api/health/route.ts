/**
 * Health Check API Endpoint
 * GET /api/health
 *
 * Returns system health status for monitoring
 * Supports ?quick=true for lightweight checks (load balancer probes)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { agentINFTService } from '@/services/agentINFTService';
import { getAvalancheRpcUrl, getAvalancheFallbackRpcUrl } from '@/constants';
import { handleAPIError, createAPILogger } from '@/lib/api';

// RPC timeout configuration
const RPC_TIMEOUT = 60000;

// Track server start time for uptime calculation
const serverStartTime = Date.now();

interface ServiceStatus {
  status: 'up' | 'down';
  latency?: number;
  error?: string;
  blockNumber?: string;
  chainId?: number;
  address?: string;
}

/**
 * Check Avalanche Fuji chain connectivity with fallback
 */
async function checkAvalancheChain(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const publicClient = createPublicClient({
      chain: avalancheFuji,
      transport: http(getAvalancheRpcUrl(), { timeout: RPC_TIMEOUT }),
    });

    const blockNumber = await publicClient.getBlockNumber();
    const latency = Date.now() - start;

    return {
      status: 'up',
      latency,
      chainId: avalancheFuji.id,
      blockNumber: blockNumber.toString(),
    };
  } catch (error) {
    // Try fallback RPC if primary times out
    const errMsg = (error as Error).message || '';
    if (errMsg.includes('timeout') || errMsg.includes('timed out') || errMsg.includes('took too long')) {
      console.warn('[Health Check] Avalanche primary RPC timed out, trying fallback...');
      try {
        const fallbackClient = createPublicClient({
          chain: avalancheFuji,
          transport: http(getAvalancheFallbackRpcUrl(), { timeout: RPC_TIMEOUT }),
        });
        const blockNumber = await fallbackClient.getBlockNumber();
        const latency = Date.now() - start;
        return {
          status: 'up',
          latency,
          chainId: avalancheFuji.id,
          blockNumber: blockNumber.toString(),
        };
      } catch (fallbackError) {
        return {
          status: 'down',
          error: `Primary and fallback failed: ${(error as Error).message}`,
        };
      }
    }
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check iNFT contract deployment status
 */
async function checkContractDeployment(): Promise<ServiceStatus> {
  try {
    const isDeployed = agentINFTService.isContractDeployed();
    const address = agentINFTService.getContractAddress();

    if (!isDeployed) {
      return {
        status: 'down',
        error: 'AIAgentINFT contract not deployed',
        address,
      };
    }

    // Try to read total supply to verify contract is responsive
    const totalSupply = await agentINFTService.getTotalSupply();

    return {
      status: 'up',
      address,
    };
  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
      address: agentINFTService.getContractAddress(),
    };
  }
}

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request);
  logger.start();

  try {
    const { searchParams } = new URL(request.url);
    const isQuickCheck = searchParams.get('quick') === 'true';

    // For quick health checks (load balancer probes), skip external dependencies
    if (isQuickCheck) {
      const response = NextResponse.json({
        success: true,
        status: 'healthy',
        services: {
          api: { status: 'up' as const, latency: 0 },
        },
        timestamp: Date.now(),
        uptime: Date.now() - serverStartTime,
      });

      // Add cache headers for quick checks
      response.headers.set('Cache-Control', 'no-store, max-age=0');
      response.headers.set('X-Request-ID', logger.requestId);
      logger.complete(200, 'Quick health check');
      return response;
    }

    // Run all health checks in parallel
    const [avalancheResult, contractResult] = await Promise.allSettled([
      checkAvalancheChain(),
      checkContractDeployment(),
    ]);

    const services: Record<string, ServiceStatus> = {
      api: { status: 'up', latency: 0 },
      avalanche_chain:
        avalancheResult.status === 'fulfilled'
          ? avalancheResult.value
          : { status: 'down', error: String(avalancheResult.reason) },
      contracts:
        contractResult.status === 'fulfilled'
          ? contractResult.value
          : { status: 'down', error: String(contractResult.reason) },
    };

    // Determine overall status
    const downCount = Object.values(services).filter((s) => s.status === 'down').length;
    const status: 'healthy' | 'degraded' | 'unhealthy' =
      downCount === 0 ? 'healthy' : downCount < 2 ? 'degraded' : 'unhealthy';

    // Calculate memory usage
    const memoryUsage = process.memoryUsage ? {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    } : undefined;

    const response = NextResponse.json({
      success: status !== 'unhealthy',
      status,
      services,
      timestamp: Date.now(),
      uptime: Date.now() - serverStartTime,
      version: process.env.npm_package_version || 'unknown',
      environment: process.env.NODE_ENV || 'unknown',
      memory: memoryUsage,
    });

    // Add appropriate headers
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    response.headers.set('X-Request-ID', logger.requestId);

    logger.complete(status === 'unhealthy' ? 503 : 200);
    return response;
  } catch (error) {
    logger.error('Health check failed', error);
    return handleAPIError(error, 'API:Health:GET');
  }
}
