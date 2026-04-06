#!/bin/bash
################################################################################
# Avalanche C-Chain Mainnet Deployment
#
# End-to-end deployment pipeline:
#   1. Pre-flight checks (keys, balance, toolchain)
#   2. Compile contracts (forge build)
#   3. Deploy all 16 contracts via DeployAvalancheSimplified.s.sol
#   4. Verify all contracts on Snowtrace
#   5. Write mainnet addresses into frontend/src/constants.ts
#   6. Generate Vercel env patch file
#
# Prerequisites:
#   cp .env.mainnet .env   (with real keys filled in)
#   Deployer funded with ~3 AVAX
#   Valid SNOWTRACE_API_KEY
#
# Usage:
#   ./scripts/deploy-mainnet.sh              # full deploy
#   ./scripts/deploy-mainnet.sh --dry-run    # simulate without broadcasting
#   ./scripts/deploy-mainnet.sh --skip-verify # deploy only, verify later
################################################################################

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
DEPLOYMENT_JSON="$PROJECT_ROOT/deployments/avalanche-mainnet.json"
CONSTANTS_TS="$FRONTEND_DIR/src/constants.ts"

MAINNET_RPC="https://api.avax.network/ext/bc/C/rpc"
CHAIN_ID=43114

# ── Options ──────────────────────────────────────────────────────────────────
DRY_RUN=false
SKIP_VERIFY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)    DRY_RUN=true;    shift ;;
        --skip-verify) SKIP_VERIFY=true; shift ;;
        --help|-h)
            echo "Usage: $0 [--dry-run] [--skip-verify]"
            exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# ── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo -e "${GREEN}[OK]${NC}  $1"; }
warn() { echo -e "${YELLOW}[!!]${NC}  $1"; }
err()  { echo -e "${RED}[ERR]${NC} $1"; }
hdr()  { echo -e "\n${BOLD}${CYAN}── $1 ──${NC}"; }

require_cmd() {
    if ! command -v "$1" &>/dev/null; then
        err "$1 not found. Install it first."
        exit 1
    fi
}

get_json_field() {
    # $1 = json file, $2 = field name under .contracts
    python3 -c "
import json, sys
d = json.load(open('$1'))
print(d['contracts'].get('$2', ''))" 2>/dev/null
}

################################################################################
# 1. PRE-FLIGHT CHECKS
################################################################################

hdr "Pre-flight checks"

require_cmd forge
require_cmd cast
require_cmd python3

cd "$PROJECT_ROOT"

# Load .env
if [ ! -f ".env" ]; then
    err ".env not found. Run: cp .env.mainnet .env  and fill in values."
    exit 1
fi
set -a; source .env; set +a

# Validate deployer key
if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ] || [[ "$DEPLOYER_PRIVATE_KEY" == *"REPLACE"* ]]; then
    err "DEPLOYER_PRIVATE_KEY not set. Generate one with: cast wallet new"
    exit 1
fi

# Validate Snowtrace key
if [ -z "${SNOWTRACE_API_KEY:-}" ] || [[ "$SNOWTRACE_API_KEY" == *"REPLACE"* ]] || [ "$SNOWTRACE_API_KEY" = "placeholder" ]; then
    err "SNOWTRACE_API_KEY not set. Get one free at https://snowtrace.io/myapikey"
    exit 1
fi

# Deployer address & balance
DEPLOYER_ADDR=$(cast wallet address "$DEPLOYER_PRIVATE_KEY" 2>/dev/null)
if [ -z "$DEPLOYER_ADDR" ]; then
    err "Invalid DEPLOYER_PRIVATE_KEY — could not derive address."
    exit 1
fi
BALANCE_WEI=$(cast balance "$DEPLOYER_ADDR" --rpc-url "$MAINNET_RPC" 2>/dev/null || echo "0")
# Guard against empty output from cast
BALANCE_WEI="${BALANCE_WEI:-0}"
BALANCE_AVAX=$(python3 -c "print(f'{int(\"$BALANCE_WEI\") / 1e18:.4f}')" 2>/dev/null || echo "0")

echo ""
echo -e "  Chain:     ${BOLD}Avalanche C-Chain Mainnet (${CHAIN_ID})${NC}"
echo -e "  Deployer:  ${BOLD}${DEPLOYER_ADDR}${NC}"
echo -e "  Balance:   ${BOLD}${BALANCE_AVAX} AVAX${NC}"
echo -e "  AI Signer: ${BOLD}${AI_SIGNER_ADDRESS:-not set}${NC}"
echo -e "  Dry run:   ${DRY_RUN}"
echo ""

# Minimum balance check: 1.5 AVAX (16 contract deploys + setup txns)
MIN_WEI=1500000000000000000
if python3 -c "exit(0 if int('$BALANCE_WEI') >= $MIN_WEI else 1)" 2>/dev/null; then
    log "Balance sufficient (>= 1.5 AVAX)"
else
    err "Insufficient balance. Fund $DEPLOYER_ADDR with at least 2-3 AVAX."
    err "Current balance: $BALANCE_AVAX AVAX"
    exit 1
fi

log "All pre-flight checks passed"

# Guard: warn if a previous mainnet deployment exists
if [ "$DRY_RUN" = false ] && [ -f "$DEPLOYMENT_JSON" ]; then
    warn "Existing mainnet deployment found: $DEPLOYMENT_JSON"
    echo ""
    echo -e "${YELLOW}  Previous contracts will be ABANDONED (not upgraded).${NC}"
    echo -e "${YELLOW}  The old deployment file will be backed up.${NC}"
    echo ""
    read -p "Overwrite previous deployment? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled. Previous deployment preserved."
        exit 0
    fi
    # Backup the old deployment
    BACKUP_FILE="${DEPLOYMENT_JSON%.json}-$(date +%Y%m%d_%H%M%S).backup.json"
    cp "$DEPLOYMENT_JSON" "$BACKUP_FILE"
    log "Old deployment backed up to $BACKUP_FILE"
fi

################################################################################
# 2. CONFIRMATION
################################################################################

if [ "$DRY_RUN" = false ]; then
    echo ""
    echo -e "${YELLOW}${BOLD}You are about to deploy 16 contracts to AVALANCHE C-CHAIN MAINNET.${NC}"
    echo -e "${YELLOW}This will spend real AVAX in gas fees (~0.5-2 AVAX).${NC}"
    echo ""
    read -p "Type 'deploy' to proceed: " CONFIRM
    if [ "$CONFIRM" != "deploy" ]; then
        echo "Cancelled."
        exit 0
    fi
fi

################################################################################
# 3. BUILD
################################################################################

hdr "Building contracts"

forge build --force
log "Contracts compiled"

################################################################################
# 4. DEPLOY
################################################################################

hdr "Deploying to Avalanche C-Chain Mainnet"

FORGE_CMD="forge script script/DeployAvalancheSimplified.s.sol \
    --rpc-url $MAINNET_RPC \
    --broadcast \
    -vvvv"

if [ "$SKIP_VERIFY" = false ]; then
    FORGE_CMD="$FORGE_CMD --verify --etherscan-api-key $SNOWTRACE_API_KEY"
fi

if [ "$DRY_RUN" = true ]; then
    warn "DRY RUN: simulating deployment (no broadcast)"
    forge script script/DeployAvalancheSimplified.s.sol \
        --rpc-url "$MAINNET_RPC" \
        -vvvv
else
    eval "$FORGE_CMD"
fi

# Verify deployment JSON was written
if [ ! -f "$DEPLOYMENT_JSON" ]; then
    if [ "$DRY_RUN" = true ]; then
        warn "Dry run: no deployment JSON generated (expected)"
    else
        err "deployments/avalanche-mainnet.json not found after deployment!"
        err "Check forge output above for errors."
        exit 1
    fi
fi

if [ "$DRY_RUN" = true ]; then
    log "Dry run complete. No changes were made."
    exit 0
fi

log "All 16 contracts deployed"
echo ""
cat "$DEPLOYMENT_JSON"
echo ""

################################################################################
# 5. VERIFY CONTRACTS ON SNOWTRACE (if auto-verify missed any)
################################################################################

if [ "$SKIP_VERIFY" = false ]; then
    hdr "Verifying contracts on Snowtrace"
    if [ -x "$SCRIPT_DIR/verify-contracts-snowtrace.sh" ]; then
        "$SCRIPT_DIR/verify-contracts-snowtrace.sh" mainnet || warn "Some contracts may need manual verification"
    else
        warn "verify-contracts-snowtrace.sh not found or not executable"
    fi
fi

################################################################################
# 6. UPDATE FRONTEND CONSTANTS.TS
################################################################################

hdr "Updating frontend/src/constants.ts with mainnet addresses"

if [ ! -f "$CONSTANTS_TS" ]; then
    err "constants.ts not found at $CONSTANTS_TS"
    exit 1
fi

# Read addresses from deployment JSON
MOCK_ORACLE=$(get_json_field "$DEPLOYMENT_JSON" "mockOracle")
CROWN_TOKEN_ADDR=$(get_json_field "$DEPLOYMENT_JSON" "crownToken")
WARRIORS_NFT_ADDR=$(get_json_field "$DEPLOYMENT_JSON" "warriorsNFT")
ARENA_FACTORY_ADDR=$(get_json_field "$DEPLOYMENT_JSON" "arenaFactory")
OUTCOME_TOKEN_ADDR=$(get_json_field "$DEPLOYMENT_JSON" "outcomeToken")
AI_AGENT_REGISTRY_ADDR=$(get_json_field "$DEPLOYMENT_JSON" "aiAgentRegistry")
CREATOR_REVENUE_SHARE_ADDR=$(get_json_field "$DEPLOYMENT_JSON" "creatorRevenueShare")
PREDICTION_MARKET_AMM_ADDR=$(get_json_field "$DEPLOYMENT_JSON" "predictionMarketAMM")
AI_DEBATE_ORACLE_ADDR=$(get_json_field "$DEPLOYMENT_JSON" "aiDebateOracle")
MICRO_MARKET_FACTORY_ADDR=$(get_json_field "$DEPLOYMENT_JSON" "microMarketFactory")
EXTERNAL_MARKET_MIRROR_ADDR=$(get_json_field "$DEPLOYMENT_JSON" "externalMarketMirror")
AI_AGENT_INFT_ADDR=$(get_json_field "$DEPLOYMENT_JSON" "aiAgentINFT")
AI_LIQUIDITY_MANAGER_ADDR=$(get_json_field "$DEPLOYMENT_JSON" "aiLiquidityManager")
MARKET_FACTORY_ADDR=$(get_json_field "$DEPLOYMENT_JSON" "marketFactory")
PREDICTION_ARENA_ADDR=$(get_json_field "$DEPLOYMENT_JSON" "predictionArena")

# Export address vars so the python script can read them
export MOCK_ORACLE CROWN_TOKEN_ADDR WARRIORS_NFT_ADDR ARENA_FACTORY_ADDR
export OUTCOME_TOKEN_ADDR AI_AGENT_REGISTRY_ADDR CREATOR_REVENUE_SHARE_ADDR
export PREDICTION_MARKET_AMM_ADDR AI_DEBATE_ORACLE_ADDR MICRO_MARKET_FACTORY_ADDR
export EXTERNAL_MARKET_MIRROR_ADDR AI_AGENT_INFT_ADDR AI_LIQUIDITY_MANAGER_ADDR
export MARKET_FACTORY_ADDR PREDICTION_ARENA_ADDR

# Use python to do a precise in-place replacement of the 43114 block in constants.ts
python3 << PYEOF
import re, sys, os

constants_path = "$CONSTANTS_TS"

with open(constants_path, "r") as f:
    content = f.read()

# Pattern: match the entire 43114 block from its opening comment to closing brace
pattern = r'(// Avalanche C-Chain Mainnet \(Chain ID: 43114\)[^\n]*\n\s*43114:\s*\{)(.*?)(\n\s*\})'
match = re.search(pattern, content, re.DOTALL)

if not match:
    print("ERROR: Could not find 43114 block in constants.ts", file=sys.stderr)
    sys.exit(1)

addrs = {
    "mockOracle":           os.environ.get("MOCK_ORACLE", ""),
    "crownToken":           os.environ.get("CROWN_TOKEN_ADDR", ""),
    "warriorsNFT":          os.environ.get("WARRIORS_NFT_ADDR", ""),
    "ArenaFactory":         os.environ.get("ARENA_FACTORY_ADDR", ""),
    "outcomeToken":         os.environ.get("OUTCOME_TOKEN_ADDR", ""),
    "aiAgentRegistry":      os.environ.get("AI_AGENT_REGISTRY_ADDR", ""),
    "microMarketFactory":   os.environ.get("MICRO_MARKET_FACTORY_ADDR", ""),
    "aiDebateOracle":       os.environ.get("AI_DEBATE_ORACLE_ADDR", ""),
    "creatorRevenueShare":  os.environ.get("CREATOR_REVENUE_SHARE_ADDR", ""),
    "predictionMarketAMM":  os.environ.get("PREDICTION_MARKET_AMM_ADDR", ""),
    "externalMarketMirror": os.environ.get("EXTERNAL_MARKET_MIRROR_ADDR", ""),
    "aiAgentINFT":          os.environ.get("AI_AGENT_INFT_ADDR", ""),
    "agentINFTOracle":      os.environ.get("MOCK_ORACLE", ""),
    "aiLiquidityManager":   os.environ.get("AI_LIQUIDITY_MANAGER_ADDR", ""),
    "marketFactory":        os.environ.get("MARKET_FACTORY_ADDR", ""),
    "predictionArena":      os.environ.get("PREDICTION_ARENA_ADDR", ""),
}

missing = [k for k, v in addrs.items() if not v]
if missing:
    print(f"ERROR: Missing addresses from deployment JSON: {missing}", file=sys.stderr)
    sys.exit(1)

lines = []
lines.append("")
lines.append("        // Deployed to Avalanche C-Chain Mainnet via deploy-mainnet.sh")
for name, addr in addrs.items():
    lines.append(f'        {name}: "{addr}",')

inner = "\n".join(lines)
new_content = content[:match.start(2)] + inner + "\n    " + content[match.end(2):]

with open(constants_path, "w") as f:
    f.write(new_content)

print(f"Updated {len(addrs)} mainnet addresses in constants.ts")
PYEOF

log "constants.ts updated with mainnet addresses"

################################################################################
# 7. GENERATE VERCEL ENV PATCH
################################################################################

hdr "Generating Vercel environment patch"

VERCEL_PATCH="$PROJECT_ROOT/deployments/vercel-mainnet-env.txt"

cat > "$VERCEL_PATCH" << EOF
# ============================================================================
# Vercel Environment Variables for Avalanche Mainnet
# Generated by deploy-mainnet.sh on $(date -u '+%Y-%m-%d %H:%M:%S UTC')
# ============================================================================
# Apply these in Vercel Dashboard > Settings > Environment Variables
# Or use: cat deployments/vercel-mainnet-env.txt | while IFS='=' read -r k v; do
#   [[ "\$k" =~ ^#.*$ || -z "\$k" ]] && continue
#   echo "\$v" | vercel env add "\$k" production --force
# done
# ============================================================================

# Chain Configuration
NEXT_PUBLIC_CHAIN_ID=43114
NEXT_PUBLIC_AVALANCHE_MAINNET_RPC=https://api.avax.network/ext/bc/C/rpc
NEXT_PUBLIC_AVALANCHE_FALLBACK_RPC=https://avalanche.public-rpc.com

# Contract Addresses (Avalanche C-Chain Mainnet)
NEXT_PUBLIC_CROWN_TOKEN=${CROWN_TOKEN_ADDR}
NEXT_PUBLIC_WARRIORS_NFT=${WARRIORS_NFT_ADDR}
NEXT_PUBLIC_ARENA_FACTORY=${ARENA_FACTORY_ADDR}
NEXT_PUBLIC_PREDICTION_MARKET=${PREDICTION_MARKET_AMM_ADDR}
NEXT_PUBLIC_AI_AGENT_REGISTRY=${AI_AGENT_REGISTRY_ADDR}
NEXT_PUBLIC_AI_DEBATE_ORACLE=${AI_DEBATE_ORACLE_ADDR}
NEXT_PUBLIC_OUTCOME_TOKEN=${OUTCOME_TOKEN_ADDR}
NEXT_PUBLIC_CREATOR_REVENUE=${CREATOR_REVENUE_SHARE_ADDR}
NEXT_PUBLIC_EXTERNAL_MARKET_MIRROR=${EXTERNAL_MARKET_MIRROR_ADDR}
NEXT_PUBLIC_AI_AGENT_INFT=${AI_AGENT_INFT_ADDR}
NEXT_PUBLIC_AGENT_INFT_ORACLE=${MOCK_ORACLE}
NEXT_PUBLIC_CRWN_TOKEN_ADDRESS=${CROWN_TOKEN_ADDR}
NEXT_PUBLIC_AI_AGENT_INFT_ADDRESS=${AI_AGENT_INFT_ADDR}
NEXT_PUBLIC_WARRIORS_ARENA_ADDRESS=${ARENA_FACTORY_ADDR}
NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS=${PREDICTION_MARKET_AMM_ADDR}
NEXT_PUBLIC_ARENA_CONTRACT_ADDRESS=${ARENA_FACTORY_ADDR}
NEXT_PUBLIC_EXTERNAL_MARKET_MIRROR_ADDRESS=${EXTERNAL_MARKET_MIRROR_ADDR}
EXTERNAL_MARKET_MIRROR_ADDRESS=${EXTERNAL_MARKET_MIRROR_ADDR}
EOF

log "Vercel env patch saved to deployments/vercel-mainnet-env.txt"

################################################################################
# 8. SUMMARY
################################################################################

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  Mainnet Deployment Complete${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BOLD}Deployed Contracts:${NC}"
echo "  CrownToken:           $CROWN_TOKEN_ADDR"
echo "  WarriorsNFT:          $WARRIORS_NFT_ADDR"
echo "  ArenaFactory:         $ARENA_FACTORY_ADDR"
echo "  PredictionMarketAMM:  $PREDICTION_MARKET_AMM_ADDR"
echo "  ExternalMarketMirror: $EXTERNAL_MARKET_MIRROR_ADDR"
echo "  PredictionArena:      $PREDICTION_ARENA_ADDR"
echo "  AIAgentINFT:          $AI_AGENT_INFT_ADDR"
echo "  ... and 9 more (see deployments/avalanche-mainnet.json)"
echo ""
echo -e "${BOLD}Files Updated:${NC}"
echo "  deployments/avalanche-mainnet.json   (contract addresses)"
echo "  frontend/src/constants.ts            (43114 block filled in)"
echo "  deployments/vercel-mainnet-env.txt   (copy to Vercel)"
echo ""
echo -e "${BOLD}Next Steps:${NC}"
echo "  1. Apply Vercel env vars:"
echo "     ./scripts/setup-vercel-env.sh mainnet"
echo "  2. Deploy frontend:"
echo "     ./scripts/deploy-vercel.sh production"
echo "  3. Apply for Retro9000:"
echo "     https://retro9000.avax.network"
echo "  4. Verify everything:"
echo "     ./scripts/verify-deployment.sh mainnet"
echo ""
echo -e "${BOLD}Retro9000 Checklist:${NC}"
echo "  [ ] All contracts verified on https://snowtrace.io"
echo "  [ ] Project submitted at retro9000.avax.network"
echo "  [ ] Deployer ownership proved (sign from $DEPLOYER_ADDR)"
echo "  [ ] 'New project' tag claimed (5x multiplier)"
echo "  [ ] Frontend live on mainnet (NEXT_PUBLIC_CHAIN_ID=43114)"
echo ""
