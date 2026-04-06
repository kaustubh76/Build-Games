#!/bin/bash
################################################################################
# Snowtrace Contract Verification
#
# Verifies all deployed contracts on Snowtrace (Avalanche block explorer).
# Required for Retro9000 Round 2 eligibility.
#
# Reads contract addresses from deployments/avalanche-{network}.json and
# submits verification requests with the correct constructor arguments.
#
# Usage:
#   ./scripts/verify-contracts-snowtrace.sh mainnet
#   ./scripts/verify-contracts-snowtrace.sh testnet
#   ./scripts/verify-contracts-snowtrace.sh mainnet --retry-failed
################################################################################

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ── Network ──────────────────────────────────────────────────────────────────
NETWORK="${1:-mainnet}"
RETRY_FAILED=false
[[ "${2:-}" == "--retry-failed" ]] && RETRY_FAILED=true

case "$NETWORK" in
    mainnet)
        CHAIN_ID=43114
        VERIFIER_URL="https://api.snowtrace.io/api"
        EXPLORER="https://snowtrace.io"
        DEPLOYMENT_FILE="deployments/avalanche-mainnet.json"
        ;;
    testnet)
        CHAIN_ID=43113
        VERIFIER_URL="https://api-testnet.snowtrace.io/api"
        EXPLORER="https://testnet.snowtrace.io"
        DEPLOYMENT_FILE="deployments/avalanche-testnet.json"
        ;;
    *)
        echo "Usage: $0 [mainnet|testnet] [--retry-failed]"
        exit 1
        ;;
esac

# ── Load env ─────────────────────────────────────────────────────────────────
if [ -f ".env" ]; then
    set -a; source .env; set +a
fi

if [ -z "${SNOWTRACE_API_KEY:-}" ] || [ "$SNOWTRACE_API_KEY" = "placeholder" ] || [[ "$SNOWTRACE_API_KEY" == *"REPLACE"* ]]; then
    echo -e "${RED}SNOWTRACE_API_KEY not set. Get one from https://snowtrace.io/myapikey${NC}"
    exit 1
fi

if [ ! -f "$DEPLOYMENT_FILE" ]; then
    echo -e "${RED}Deployment file not found: $DEPLOYMENT_FILE${NC}"
    echo "Deploy contracts first with: ./scripts/deploy-mainnet.sh"
    exit 1
fi

# ── Read addresses ───────────────────────────────────────────────────────────
get_addr() {
    python3 -c "import json; d=json.load(open('$DEPLOYMENT_FILE')); print(d['contracts'].get('$1', ''))"
}

DEPLOYER_ADDR=$(cast wallet address "$DEPLOYER_PRIVATE_KEY" 2>/dev/null || echo "")
if [ -z "$DEPLOYER_ADDR" ]; then
    echo -e "${RED}Could not derive deployer address from DEPLOYER_PRIVATE_KEY.${NC}"
    echo "Ensure .env has the correct private key that was used to deploy."
    exit 1
fi
AI_SIGNER="${AI_SIGNER_ADDRESS:-0x0000000000000000000000000000000000000000}"

CROWN=$(get_addr crownToken)
OUTCOME=$(get_addr outcomeToken)
MOCK_ORACLE=$(get_addr mockOracle)
WARRIORS=$(get_addr warriorsNFT)
ARENA_FACTORY=$(get_addr arenaFactory)
AI_REGISTRY=$(get_addr aiAgentRegistry)
REVENUE_SHARE=$(get_addr creatorRevenueShare)
PRED_AMM=$(get_addr predictionMarketAMM)
DEBATE_ORACLE=$(get_addr aiDebateOracle)
MICRO_FACTORY=$(get_addr microMarketFactory)
EXT_MIRROR=$(get_addr externalMarketMirror)
AI_INFT=$(get_addr aiAgentINFT)
AI_LIQ=$(get_addr aiLiquidityManager)
MKT_FACTORY=$(get_addr marketFactory)
PRED_ARENA=$(get_addr predictionArena)
ORACLE_ADDR=$(get_addr oracle)

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Snowtrace Contract Verification - Avalanche ${NETWORK}${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Chain ID:    $CHAIN_ID"
echo -e "  Deployer:    $DEPLOYER_ADDR"
echo -e "  AI Signer:   $AI_SIGNER"
echo -e "  Explorer:    $EXPLORER"
echo ""

# ── Counters ─────────────────────────────────────────────────────────────────
VERIFIED=0
ALREADY=0
FAILED=0
SKIPPED=0
TOTAL=0
FAILED_LIST=()

# ── Core verify function ────────────────────────────────────────────────────
verify() {
    local name="$1"
    local addr="$2"
    local src="$3"
    local ctor_args="${4:-}"

    TOTAL=$((TOTAL + 1))

    # Skip empty / zero addresses
    if [ -z "$addr" ] || [ "$addr" = "0x0000000000000000000000000000000000000000" ]; then
        echo -e "${YELLOW}SKIP${NC} $name — no address"
        SKIPPED=$((SKIPPED + 1))
        return 0
    fi

    echo -ne "${CYAN}[$TOTAL/15]${NC} $name ($addr) ... "

    # Build command
    local cmd="forge verify-contract $addr $src \
        --chain-id $CHAIN_ID \
        --etherscan-api-key $SNOWTRACE_API_KEY \
        --verifier-url $VERIFIER_URL \
        --watch --compiler-version v0.8.24"

    if [ -n "$ctor_args" ]; then
        cmd="$cmd --constructor-args $ctor_args"
    fi

    # Attempt 1
    local output
    if output=$(eval "$cmd" 2>&1); then
        if echo "$output" | grep -qi "already verified"; then
            echo -e "${GREEN}ALREADY VERIFIED${NC}"
            ALREADY=$((ALREADY + 1))
        else
            echo -e "${GREEN}VERIFIED${NC}"
            VERIFIED=$((VERIFIED + 1))
        fi
        return 0
    fi

    # Check if already verified (sometimes forge returns non-zero but contract is verified)
    if echo "$output" | grep -qi "already verified\|has already been verified"; then
        echo -e "${GREEN}ALREADY VERIFIED${NC}"
        ALREADY=$((ALREADY + 1))
        return 0
    fi

    # Attempt 2: retry after 5 seconds
    echo -ne "${YELLOW}retrying...${NC} "
    sleep 5

    if output=$(eval "$cmd" 2>&1); then
        echo -e "${GREEN}VERIFIED (retry)${NC}"
        VERIFIED=$((VERIFIED + 1))
        return 0
    fi

    if echo "$output" | grep -qi "already verified\|has already been verified"; then
        echo -e "${GREEN}ALREADY VERIFIED${NC}"
        ALREADY=$((ALREADY + 1))
        return 0
    fi

    # Attempt 3: retry after 10 seconds with --force flag
    echo -ne "${YELLOW}final attempt...${NC} "
    sleep 10

    local cmd_force="$cmd --force"
    if output=$(eval "$cmd_force" 2>&1); then
        echo -e "${GREEN}VERIFIED (force)${NC}"
        VERIFIED=$((VERIFIED + 1))
        return 0
    fi

    if echo "$output" | grep -qi "already verified\|has already been verified"; then
        echo -e "${GREEN}ALREADY VERIFIED${NC}"
        ALREADY=$((ALREADY + 1))
        return 0
    fi

    # Failed after 3 attempts
    echo -e "${RED}FAILED${NC}"
    echo -e "  ${YELLOW}Error: $(echo "$output" | tail -1)${NC}"
    echo -e "  ${YELLOW}Manual: $EXPLORER/address/$addr#code${NC}"
    FAILED=$((FAILED + 1))
    FAILED_LIST+=("$name:$addr:$src")
    return 0  # Don't exit; continue with other contracts
}

# ── Verify all contracts ─────────────────────────────────────────────────────

# Game economics constants (must match DeployAvalancheSimplified.s.sol)
COST_INFLUENCE="10000000000000000000"   # 10 ether
COST_DEFLUENCE="5000000000000000000"    # 5 ether
BET_AMOUNT="1000000000000000000"        # 1 ether

echo -e "${BOLD}Core Tokens${NC}"
verify "CrownToken" "$CROWN" "src/CrownToken.sol:CrownToken"
verify "OutcomeToken" "$OUTCOME" "src/OutcomeToken.sol:OutcomeToken"

echo ""
echo -e "${BOLD}Oracle${NC}"
verify "MockOracle" "$MOCK_ORACLE" "src/mocks/MockOracle.sol:MockOracle"

echo ""
echo -e "${BOLD}Game Contracts${NC}"
verify "WarriorsNFT" "$WARRIORS" "src/WarriorsNFT.sol:WarriorsNFT" \
    "$(cast abi-encode 'constructor(address,address,address)' "$DEPLOYER_ADDR" "$AI_SIGNER" "$MOCK_ORACLE")"

verify "ArenaFactory" "$ARENA_FACTORY" "src/ArenaFactory.sol:ArenaFactory" \
    "$(cast abi-encode 'constructor(uint256,uint256,address,address,address,uint256)' \
        "$COST_INFLUENCE" "$COST_DEFLUENCE" "$CROWN" "$AI_SIGNER" "$WARRIORS" "$BET_AMOUNT")"

echo ""
echo -e "${BOLD}Prediction Market${NC}"
verify "AIAgentRegistry" "$AI_REGISTRY" "src/AIAgentRegistry.sol:AIAgentRegistry" \
    "$(cast abi-encode 'constructor(address)' "$CROWN")"

verify "CreatorRevenueShare" "$REVENUE_SHARE" "src/CreatorRevenueShare.sol:CreatorRevenueShare" \
    "$(cast abi-encode 'constructor(address)' "$CROWN")"

verify "PredictionMarketAMM" "$PRED_AMM" "src/PredictionMarketAMM.sol:PredictionMarketAMM" \
    "$(cast abi-encode 'constructor(address,address,address)' "$CROWN" "$OUTCOME" "$REVENUE_SHARE")"

echo ""
echo -e "${BOLD}Oracles & Factories${NC}"
verify "AIDebateOracle" "$DEBATE_ORACLE" "src/AIDebateOracle.sol:AIDebateOracle" \
    "$(cast abi-encode 'constructor(address)' "$CROWN")"

verify "MicroMarketFactory" "$MICRO_FACTORY" "src/MicroMarketFactory.sol:MicroMarketFactory" \
    "$(cast abi-encode 'constructor(address,address)' "$CROWN" "$ARENA_FACTORY")"

verify "ExternalMarketMirror" "$EXT_MIRROR" "src/ExternalMarketMirror.sol:ExternalMarketMirror" \
    "$(cast abi-encode 'constructor(address,address,address)' "$CROWN" "$PRED_AMM" \
        "${ORACLE_ADDR:-0x0000000000000000000000000000000000000000}")"

echo ""
echo -e "${BOLD}AI & Additional${NC}"
verify "AIAgentINFT" "$AI_INFT" "src/AIAgentINFT.sol:AIAgentINFT" \
    "$(cast abi-encode 'constructor(address,address)' "$CROWN" "$MOCK_ORACLE")"

verify "AILiquidityManager" "$AI_LIQ" "src/AILiquidityManager.sol:AILiquidityManager" \
    "$(cast abi-encode 'constructor(address)' "$CROWN")"

verify "MarketFactory" "$MKT_FACTORY" "src/MarketFactory.sol:MarketFactory" \
    "$(cast abi-encode 'constructor(address,address,address)' "$PRED_AMM" "$ARENA_FACTORY" "$CROWN")"

verify "PredictionArena" "$PRED_ARENA" "src/PredictionArena.sol:PredictionArena" \
    "$(cast abi-encode 'constructor(address,address,address)' "$CROWN" "$WARRIORS" "$AI_SIGNER")"

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Verification Summary${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Total:            $TOTAL"
echo -e "  ${GREEN}Newly verified: $VERIFIED${NC}"
echo -e "  ${GREEN}Already done:   $ALREADY${NC}"
echo -e "  ${YELLOW}Skipped:        $SKIPPED${NC}"
echo -e "  ${RED}Failed:         $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}${BOLD}All contracts verified on Snowtrace.${NC}"
    echo -e "${GREEN}Retro9000 contract verification requirement: MET${NC}"
    echo ""
    echo "View on explorer:"
    for contract in "$CROWN" "$WARRIORS" "$ARENA_FACTORY" "$PRED_AMM" "$PRED_ARENA"; do
        [ -n "$contract" ] && echo "  $EXPLORER/address/$contract#code"
    done
else
    echo -e "${RED}${BOLD}$FAILED contracts failed verification.${NC}"
    echo ""
    echo "Failed contracts:"
    for entry in "${FAILED_LIST[@]}"; do
        IFS=':' read -r name addr src <<< "$entry"
        echo "  $name: $EXPLORER/address/$addr#code"
        echo "    forge verify-contract $addr $src --chain-id $CHAIN_ID --etherscan-api-key \$SNOWTRACE_API_KEY --verifier-url $VERIFIER_URL --watch"
    done
    echo ""
    echo "You can also verify manually at: $EXPLORER/verifyContract"
    echo "Or retry: $0 $NETWORK --retry-failed"
fi
