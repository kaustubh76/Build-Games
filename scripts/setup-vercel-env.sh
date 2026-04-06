#!/bin/bash
################################################################################
# Vercel Environment Variables Setup
#
# Configures all required environment variables in Vercel by reading contract
# addresses from the deployment JSON. Supports both testnet and mainnet.
#
# Usage:
#   ./scripts/setup-vercel-env.sh                # defaults to testnet
#   ./scripts/setup-vercel-env.sh mainnet         # mainnet deployment
#   ./scripts/setup-vercel-env.sh mainnet --env production  # explicit env
#   ./scripts/setup-vercel-env.sh --from-file deployments/vercel-mainnet-env.txt
#
# Prerequisites:
#   - Vercel CLI installed: npm i -g vercel
#   - Logged into Vercel: vercel login
#   - Deployment JSON exists at deployments/avalanche-{network}.json
################################################################################

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# ── Argument parsing ─────────────────────────────────────────────────────────
NETWORK="testnet"
VERCEL_ENV="production"
FROM_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        mainnet|testnet) NETWORK="$1"; shift ;;
        --env)           VERCEL_ENV="$2"; shift 2 ;;
        --from-file)     FROM_FILE="$2"; shift 2 ;;
        --help|-h)
            echo "Usage: $0 [mainnet|testnet] [--env production|preview|development] [--from-file path]"
            exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# ── Mode: from-file ─────────────────────────────────────────────────────────
if [ -n "$FROM_FILE" ]; then
    if [ ! -f "$FROM_FILE" ]; then
        echo -e "${RED}File not found: $FROM_FILE${NC}"
        exit 1
    fi

    if ! command -v vercel &>/dev/null; then
        echo -e "${RED}Vercel CLI not found. Install with: npm i -g vercel${NC}"
        exit 1
    fi

    cd "$FRONTEND_DIR"
    echo -e "${BOLD}Applying env vars from $FROM_FILE to Vercel ($VERCEL_ENV)${NC}"
    echo ""

    count=0
    while IFS='=' read -r key value; do
        # Skip comments, empty lines
        [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
        # Strip leading/trailing whitespace
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)
        [ -z "$key" ] && continue

        echo -ne "  $key ... "
        if echo "$value" | vercel env add "$key" "$VERCEL_ENV" --force 2>/dev/null; then
            echo -e "${GREEN}OK${NC}"
            count=$((count + 1))
        else
            echo -e "${RED}FAILED${NC}"
        fi
    done < "$FROM_FILE"

    echo ""
    echo -e "${GREEN}Applied $count env vars to Vercel ($VERCEL_ENV).${NC}"
    echo "Redeploy with: vercel --prod"
    exit 0
fi

# ── Network config ───────────────────────────────────────────────────────────
case "$NETWORK" in
    mainnet)
        CHAIN_ID=43114
        RPC_URL="https://api.avax.network/ext/bc/C/rpc"
        FALLBACK_RPC="https://avalanche.public-rpc.com"
        DEPLOYMENT_FILE="$PROJECT_ROOT/deployments/avalanche-mainnet.json"
        ;;
    testnet)
        CHAIN_ID=43113
        RPC_URL="https://api.avax-test.network/ext/bc/C/rpc"
        FALLBACK_RPC="https://avalanche-fuji-c-chain-rpc.publicnode.com"
        DEPLOYMENT_FILE="$PROJECT_ROOT/deployments/avalanche-testnet.json"
        ;;
esac

# ── Checks ───────────────────────────────────────────────────────────────────
if ! command -v vercel &>/dev/null; then
    echo -e "${RED}Vercel CLI not found. Install with: npm i -g vercel${NC}"
    exit 1
fi

if [ ! -f "$DEPLOYMENT_FILE" ]; then
    echo -e "${RED}Deployment file not found: $DEPLOYMENT_FILE${NC}"
    echo "Deploy contracts first with: ./scripts/deploy-mainnet.sh"
    exit 1
fi

# ── Read contract addresses from deployment JSON ─────────────────────────────
get_addr() {
    python3 -c "import json; d=json.load(open('$DEPLOYMENT_FILE')); print(d['contracts'].get('$1', ''))" 2>/dev/null
}

CROWN=$(get_addr crownToken)
WARRIORS=$(get_addr warriorsNFT)
ARENA_FACTORY=$(get_addr arenaFactory)
PRED_AMM=$(get_addr predictionMarketAMM)
AI_REGISTRY=$(get_addr aiAgentRegistry)
DEBATE_ORACLE=$(get_addr aiDebateOracle)
OUTCOME=$(get_addr outcomeToken)
REVENUE_SHARE=$(get_addr creatorRevenueShare)
EXT_MIRROR=$(get_addr externalMarketMirror)
AI_INFT=$(get_addr aiAgentINFT)
MOCK_ORACLE=$(get_addr mockOracle)
MICRO_FACTORY=$(get_addr microMarketFactory)
AI_LIQ=$(get_addr aiLiquidityManager)
MKT_FACTORY=$(get_addr marketFactory)
PRED_ARENA=$(get_addr predictionArena)

cd "$FRONTEND_DIR"

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Vercel Environment Setup - Avalanche $NETWORK${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Network:    $NETWORK (chain $CHAIN_ID)"
echo -e "  Vercel env: $VERCEL_ENV"
echo -e "  Source:     $DEPLOYMENT_FILE"
echo ""

if [ "$NETWORK" = "mainnet" ]; then
    echo -e "${YELLOW}${BOLD}WARNING: Setting MAINNET contract addresses in Vercel.${NC}"
    echo -e "${YELLOW}Users will interact with REAL AVAX on the live site.${NC}"
    echo ""
    read -p "Continue? (y/n) " -n 1 -r
    echo ""
    [[ ! $REPLY =~ ^[Yy]$ ]] && { echo "Aborted."; exit 0; }
fi

# ── Helper to set a var ──────────────────────────────────────────────────────
set_var() {
    local key="$1"
    local value="$2"
    echo -ne "  $key ... "
    if echo "$value" | vercel env add "$key" "$VERCEL_ENV" --force 2>/dev/null; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAILED${NC}"
    fi
}

# ── Chain Configuration ──────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}Avalanche Chain Configuration${NC}"
set_var "NEXT_PUBLIC_CHAIN_ID" "$CHAIN_ID"
set_var "NEXT_PUBLIC_AVALANCHE_TESTNET_RPC" "https://api.avax-test.network/ext/bc/C/rpc"
set_var "NEXT_PUBLIC_AVALANCHE_MAINNET_RPC" "https://api.avax.network/ext/bc/C/rpc"
set_var "NEXT_PUBLIC_AVALANCHE_FALLBACK_RPC" "$FALLBACK_RPC"

# ── Contract Addresses ───────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}Contract Addresses (from deployment JSON)${NC}"
set_var "NEXT_PUBLIC_CROWN_TOKEN" "$CROWN"
set_var "NEXT_PUBLIC_WARRIORS_NFT" "$WARRIORS"
set_var "NEXT_PUBLIC_ARENA_FACTORY" "$ARENA_FACTORY"
set_var "NEXT_PUBLIC_PREDICTION_MARKET" "$PRED_AMM"
set_var "NEXT_PUBLIC_AI_AGENT_REGISTRY" "$AI_REGISTRY"
set_var "NEXT_PUBLIC_AI_DEBATE_ORACLE" "$DEBATE_ORACLE"
set_var "NEXT_PUBLIC_OUTCOME_TOKEN" "$OUTCOME"
set_var "NEXT_PUBLIC_CREATOR_REVENUE" "$REVENUE_SHARE"
set_var "NEXT_PUBLIC_EXTERNAL_MARKET_MIRROR" "$EXT_MIRROR"
set_var "NEXT_PUBLIC_AI_AGENT_INFT" "$AI_INFT"
set_var "NEXT_PUBLIC_AGENT_INFT_ORACLE" "$MOCK_ORACLE"

# Duplicate keys used by different parts of the frontend
set_var "NEXT_PUBLIC_CRWN_TOKEN_ADDRESS" "$CROWN"
set_var "NEXT_PUBLIC_AI_AGENT_INFT_ADDRESS" "$AI_INFT"
set_var "NEXT_PUBLIC_WARRIORS_ARENA_ADDRESS" "$ARENA_FACTORY"
set_var "NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS" "$PRED_AMM"
set_var "NEXT_PUBLIC_ARENA_CONTRACT_ADDRESS" "$ARENA_FACTORY"
set_var "NEXT_PUBLIC_EXTERNAL_MARKET_MIRROR_ADDRESS" "$EXT_MIRROR"
set_var "EXTERNAL_MARKET_MIRROR_ADDRESS" "$EXT_MIRROR"

# ── Avalanche Network Config ────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}Avalanche Network${NC}"
set_var "NEXT_PUBLIC_AVALANCHE_RPC" "$RPC_URL"
set_var "NEXT_PUBLIC_AVALANCHE_CHAIN_ID" "$CHAIN_ID"

# ── WalletConnect ────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}WalletConnect${NC}"
set_var "NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID" "70324e2b10f46c36029a6e5b927db0db"

# ── 0G Compute & Storage ─────────────────────────────────────────────────────
# Services read: ZG_COMPUTE_PROVIDER, ZG_EVM_RPC, ZG_INDEXER_RPC
# ZG_PRIVATE_KEY falls back to PRIVATE_KEY (set in manual section below)
echo ""
echo -e "${CYAN}${BOLD}0G Compute & Storage${NC}"
set_var "ZG_COMPUTE_PROVIDER" "0xa48f01287233509FD694a22Bf840225062E67836"
set_var "ZG_EVM_RPC" "https://evmrpc-testnet.0g.ai"
set_var "ZG_INDEXER_RPC" "https://indexer-storage-testnet-turbo.0g.ai"
set_var "NEXT_PUBLIC_USE_AI_COMPUTE" "true"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  Automatic configuration complete${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}${BOLD}MANUAL CONFIGURATION REQUIRED:${NC}"
echo ""
echo -e "The following sensitive variables must be added manually."
echo -e "Do NOT reuse testnet keys for mainnet."
echo ""
echo -e "  ${RED}1. PRIVATE_KEY${NC}"
echo "     Server-side private key for contract interactions (0G compute, market ops)"
echo "     vercel env add PRIVATE_KEY $VERCEL_ENV"
echo ""
echo -e "  ${RED}2. AI_SIGNER_PRIVATE_KEY${NC}"
echo "     Signs warrior traits and battle moves (must match AI_SIGNER_ADDRESS on-chain)"
echo "     vercel env add AI_SIGNER_PRIVATE_KEY $VERCEL_ENV"
echo ""
echo -e "  ${RED}3. GAME_MASTER_PRIVATE_KEY${NC}"
echo "     Signs game master operations (warrior generation, arena management)"
echo "     vercel env add GAME_MASTER_PRIVATE_KEY $VERCEL_ENV"
echo ""
echo -e "  ${RED}4. DATABASE_URL${NC}"
echo "     PostgreSQL connection string (Neon, Supabase, Railway, etc.)"
echo "     vercel env add DATABASE_URL $VERCEL_ENV"
echo ""
echo -e "  ${RED}5. NEXT_PUBLIC_STORAGE_API_URL${NC}"
echo "     Your frontend URL for storage proxy (e.g. https://warriors-ai-rena.vercel.app)"
echo "     vercel env add NEXT_PUBLIC_STORAGE_API_URL $VERCEL_ENV"
echo ""
echo -e "  ${RED}6. NEXT_PUBLIC_API_URL${NC}"
echo "     Same as above — the base URL for internal API calls"
echo "     vercel env add NEXT_PUBLIC_API_URL $VERCEL_ENV"
echo ""
echo -e "  ${RED}7. NEXT_PUBLIC_BASE_URL${NC}"
echo "     Public-facing URL of the app"
echo "     vercel env add NEXT_PUBLIC_BASE_URL $VERCEL_ENV"
echo ""
echo -e "${BOLD}After adding all variables:${NC}"
echo "  vercel --prod"
echo ""
echo "Or use the generated env file:"
echo "  ./scripts/setup-vercel-env.sh --from-file deployments/vercel-mainnet-env.txt"
echo ""
