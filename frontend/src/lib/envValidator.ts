/**
 * Env validator — fail-fast guard for required configuration.
 *
 * Wired at module-load via `frontend/src/instrumentation.ts` so a misconfigured
 * production deploy crashes at startup with a single aggregated error message,
 * instead of failing per-request at runtime when a handler tries to read the
 * missing var.
 *
 * Two key features:
 *   1. **Severity**: `required` blocks startup; `recommended` only warns.
 *   2. **Chain-conditional**: `requiredFor: [43114]` makes a var required only
 *      when `NEXT_PUBLIC_CHAIN_ID` is mainnet. This is how we make the
 *      mainnet flip safe — every per-contract address must be explicitly set
 *      to a real mainnet deployment, not silently fall back to Fuji or zero.
 *
 * The validator is read-only: it inspects `process.env` and reports. The
 * actual fail-fast happens via `assertEnvOrThrow()`, which throws a single
 * Error whose message lists every failure.
 */

type Severity = 'required' | 'recommended';

interface EnvSpec {
  name: string;
  severity: Severity;
  /** Chain-conditional: var is required only for these chain IDs. When set,
   *  overrides `severity` for chains NOT in the list — i.e. on a chain that
   *  isn't in `requiredFor`, the var is treated as recommended. */
  requiredFor?: number[];
  description: string;
  /** Optional pattern check. Mismatches are reported as errors. */
  pattern?: RegExp;
}

const FUJI_CHAIN_ID = 43113;
const MAINNET_CHAIN_ID = 43114;
const LOCAL_CHAIN_ID = 31337;
const SUPPORTED_CHAINS = new Set([FUJI_CHAIN_ID, MAINNET_CHAIN_ID, LOCAL_CHAIN_ID]);

/**
 * The full env spec table. Add new requirements here, not in scattered
 * `if (!process.env.X) throw` checks throughout the codebase.
 */
export const ENV_SPECS: EnvSpec[] = [
  // -- Server signers (always required in production) --
  {
    name: 'PRIVATE_KEY',
    severity: 'required',
    description: 'Server signer for mirror trades + custodial 1-click flows',
    pattern: /^0x[0-9a-fA-F]{64}$/,
  },
  {
    name: 'GAME_MASTER_PRIVATE_KEY',
    severity: 'required',
    description: 'Battle execution / arena game-master signer',
    pattern: /^0x[0-9a-fA-F]{64}$/,
  },
  {
    name: 'AI_SIGNER_PRIVATE_KEY',
    severity: 'required',
    description: 'Warrior trait signature key (must match contract AI signer)',
    pattern: /^0x[0-9a-fA-F]{64}$/,
  },

  // -- Auth / cron --
  {
    name: 'CRON_SECRET',
    severity: 'required',
    description: 'Bearer token guarding /api/cron/* endpoints',
  },
  {
    name: 'SESSION_SECRET',
    severity: 'required',
    description: 'HMAC secret for SIWE session JWTs (≥32 chars)',
    pattern: /^.{32,}$/,
  },

  // -- Persistence --
  {
    name: 'DATABASE_URL',
    severity: 'required',
    description: 'Prisma connection string (read paths still depend on this)',
  },

  // -- Chain config --
  {
    name: 'NEXT_PUBLIC_CHAIN_ID',
    severity: 'required',
    description: 'Active chain (43113 Fuji, 43114 mainnet, 31337 local)',
    pattern: /^(43113|43114|31337)$/,
  },
  {
    name: 'NEXT_PUBLIC_AVALANCHE_RPC_URL',
    severity: 'recommended',
    description: 'Primary Avalanche RPC endpoint (resilient client falls back to public node)',
  },

  // -- AI / inference --
  {
    name: 'OPENAI_API_KEY',
    severity: 'recommended',
    description: 'OpenAI inference key (battle moves degrade to deterministic if missing)',
  },
  {
    name: 'ZG_PRIVATE_KEY',
    severity: 'recommended',
    description: '0G Storage signer (receipts skipped if missing — graceful degrade)',
  },
  {
    name: 'NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID',
    severity: 'recommended',
    description: 'WalletConnect project ID (RainbowKit uses a default if missing)',
  },

  // -- Prisma → 0G migration flags (default '' = dual-write rollout). Set
  // -- to '1' once the matching 0G receipts have been observed in production
  // -- for ~1 week without errors. See src/lib/storage/README.md.
  {
    name: 'ENABLE_0G_AUDIT_LOGS',
    severity: 'recommended',
    description: 'Tier 1: skip Prisma writes for SyncLog/SystemAudit/PriceSyncHistory/CreatorFeeEntry once 0G receipts are verified. Default: dual-write.',
    pattern: /^(0|1)?$/,
  },
  {
    name: 'ENABLE_0G_TIER2',
    severity: 'recommended',
    description: 'Tier 2: skip Prisma writes for MirrorTrade/MirrorCopyTrade/WhaleTrade/etc.; reads switch to event-sourced. Default: dual-write.',
    pattern: /^(0|1)?$/,
  },
  {
    name: 'ENABLE_0G_TIER3',
    severity: 'recommended',
    description: 'Tier 3: skip per-round Prisma writes for PredictionRound/AIDebateRound; bundle into parent receipt. Default: dual-write.',
    pattern: /^(0|1)?$/,
  },

  // -- MAINNET-ONLY contract addresses --
  // These vars are required ONLY when NEXT_PUBLIC_CHAIN_ID=43114. The point
  // is to refuse a mainnet flip until every contract has a real address —
  // never silently fall back to Fuji addresses or zero-address placeholders.
  {
    name: 'NEXT_PUBLIC_CROWN_TOKEN',
    severity: 'recommended',
    requiredFor: [MAINNET_CHAIN_ID],
    description: 'CRwN token contract address (mainnet)',
    pattern: /^0x[0-9a-fA-F]{40}$/,
  },
  {
    name: 'NEXT_PUBLIC_WARRIORS_NFT',
    severity: 'recommended',
    requiredFor: [MAINNET_CHAIN_ID],
    description: 'WarriorsNFT contract address (mainnet)',
    pattern: /^0x[0-9a-fA-F]{40}$/,
  },
  {
    name: 'NEXT_PUBLIC_ARENA_FACTORY',
    severity: 'recommended',
    requiredFor: [MAINNET_CHAIN_ID],
    description: 'ArenaFactory contract address (mainnet)',
    pattern: /^0x[0-9a-fA-F]{40}$/,
  },
  {
    name: 'NEXT_PUBLIC_PREDICTION_MARKET',
    severity: 'recommended',
    requiredFor: [MAINNET_CHAIN_ID],
    description: 'PredictionMarketAMM contract address (mainnet)',
    pattern: /^0x[0-9a-fA-F]{40}$/,
  },
  {
    name: 'NEXT_PUBLIC_AI_AGENT_REGISTRY',
    severity: 'recommended',
    requiredFor: [MAINNET_CHAIN_ID],
    description: 'AIAgentRegistry contract address (mainnet)',
    pattern: /^0x[0-9a-fA-F]{40}$/,
  },
  {
    name: 'NEXT_PUBLIC_EXTERNAL_MARKET_MIRROR',
    severity: 'recommended',
    requiredFor: [MAINNET_CHAIN_ID],
    description: 'ExternalMarketMirror contract address (mainnet)',
    pattern: /^0x[0-9a-fA-F]{40}$/,
  },
];

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** The chain ID we resolved during validation, for logging context. */
  chainId: number | null;
}

/**
 * Run all checks against the current `process.env`. Pure — no side effects.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const rawChainId = env.NEXT_PUBLIC_CHAIN_ID;
  let chainId: number | null = null;
  if (rawChainId !== undefined) {
    const parsed = parseInt(rawChainId, 10);
    if (Number.isFinite(parsed) && SUPPORTED_CHAINS.has(parsed)) {
      chainId = parsed;
    } else {
      errors.push(
        `NEXT_PUBLIC_CHAIN_ID="${rawChainId}" is not a supported chain ID (43113, 43114, or 31337)`
      );
    }
  }

  for (const spec of ENV_SPECS) {
    const value = env[spec.name];
    const present = typeof value === 'string' && value.length > 0;

    // Effective severity: chain-conditional vars get promoted to `required`
    // when the active chain is in their `requiredFor` list. They stay
    // `recommended` for other chains.
    let effectiveSeverity: Severity = spec.severity;
    if (spec.requiredFor && chainId !== null && spec.requiredFor.includes(chainId)) {
      effectiveSeverity = 'required';
    }

    if (!present) {
      const msg = `${spec.name} is missing — ${spec.description}`;
      if (effectiveSeverity === 'required') errors.push(msg);
      else warnings.push(msg);
      continue;
    }

    if (spec.pattern && !spec.pattern.test(value)) {
      errors.push(
        `${spec.name} is set but does not match expected pattern (${spec.pattern.toString()})`
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings, chainId };
}

/**
 * Throw an aggregated Error if validation fails. Use this at startup
 * (instrumentation.ts) so a misconfigured deploy crashes loudly instead of
 * limping along until the first request needs the missing var.
 *
 * Warnings are logged via console.warn but do not throw.
 */
export function assertEnvOrThrow(env: NodeJS.ProcessEnv = process.env): void {
  const result = validateEnv(env);

  if (result.warnings.length > 0) {
    for (const w of result.warnings) {
      console.warn(`[envValidator] WARN: ${w}`);
    }
  }

  if (!result.ok) {
    const header = `Environment validation failed (chainId=${result.chainId ?? 'unset'}). Fix the following before starting:`;
    const body = result.errors.map((e) => `  - ${e}`).join('\n');
    const tail =
      '\n\nSet these in your deployment environment (e.g. Vercel project env vars or .env.production).';
    throw new Error(`${header}\n${body}${tail}`);
  }
}

// Test/CLI helper: re-export the chain constants for callers that want to
// reason about them without re-parsing.
export const CHAIN_IDS = {
  FUJI: FUJI_CHAIN_ID,
  MAINNET: MAINNET_CHAIN_ID,
  LOCAL: LOCAL_CHAIN_ID,
} as const;
