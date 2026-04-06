#!/bin/bash
################################################################################
# Deployment Verification Script
#
# Verifies that the Avalanche Fuji implementation is properly deployed and
# all production features are integrated and working
#
# Usage:
#   ./scripts/verify-deployment.sh
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BASE_URL="${BASE_URL:-http://localhost:3000}"

# Network selection: mainnet or testnet
NETWORK="${1:-testnet}"
if [ "$NETWORK" = "mainnet" ]; then
    CHAIN_ID=43114
    CHAIN_NAME="Avalanche C-Chain Mainnet"
    EXPLORER_URL="https://snowtrace.io"
    DEPLOYMENT_FILE="$PROJECT_ROOT/deployments/avalanche-mainnet.json"
else
    CHAIN_ID=43113
    CHAIN_NAME="Avalanche Fuji Testnet"
    EXPLORER_URL="https://testnet.snowtrace.io"
    DEPLOYMENT_FILE="$PROJECT_ROOT/deployments/avalanche-testnet.json"
fi

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

################################################################################
# Helper Functions
################################################################################

print_header() {
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}$1${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_section() {
    echo -e "\n${CYAN}${BOLD}▶ $1${NC}"
}

check_pass() {
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    echo -e "${GREEN}✓ $1${NC}"
}

check_fail() {
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    echo -e "${RED}✗ $1${NC}"
}

check_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

check_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

################################################################################
# Verification Tests
################################################################################

print_header "Warriors AI Avalanche Deployment Verification"
echo -e "${BOLD}Date:${NC}    $(date '+%Y-%m-%d %H:%M:%S')"
echo -e "${BOLD}Network:${NC} $CHAIN_NAME (Chain ID: $CHAIN_ID)"
echo -e "${BOLD}Base URL:${NC} $BASE_URL"
echo ""

# ============================================================================
# 1. Environment Check
# ============================================================================

print_section "1. Environment Configuration"

cd "$FRONTEND_DIR"

# Check if .env file exists
if [ -f ".env" ]; then
    check_pass ".env file exists"

    # Check required variables
    required_vars=(
        "NEXT_PUBLIC_AVALANCHE_TESTNET_RPC"
        "PRIVATE_KEY"
    )

    for var in "${required_vars[@]}"; do
        if grep -q "^$var=" .env; then
            check_pass "$var is configured"
        else
            check_fail "$var is missing from .env"
        fi
    done
else
    check_fail ".env file not found"
fi

# ============================================================================
# 2. Build Verification
# ============================================================================

print_section "2. Build Verification"

# Check if .next directory exists
if [ -d ".next" ]; then
    check_pass "Next.js build directory exists"

    # Check key routes are built
    routes=(
        ".next/server/app/api/market/execute/route.js"
        ".next/server/app/api/market/vrf-trade/route.js"
    )

    for route in "${routes[@]}"; do
        if [ -f "$route" ]; then
            check_pass "$(basename $(dirname $route)) route compiled"
        else
            check_fail "$(basename $(dirname $route)) route missing"
        fi
    done
else
    check_warning "No build found - run 'npm run build' first"
fi

# ============================================================================
# 3. Source Code Integration Check
# ============================================================================

print_section "3. Production Features Integration"

# Check event listener integration
if grep -q "decodeEventLog" src/lib/eventListeners/externalMarketEvents.ts; then
    check_pass "Event listener uses viem decodeEventLog (fixed placeholder signatures)"
else
    check_fail "Event listener still has placeholder signatures"
fi

if grep -q "globalErrorHandler" src/lib/eventListeners/externalMarketEvents.ts; then
    check_pass "Event listener has error recovery integrated"
else
    check_fail "Event listener missing error recovery"
fi

if grep -q "AvalancheMetrics" src/lib/eventListeners/externalMarketEvents.ts; then
    check_pass "Event listener has metrics integrated"
else
    check_fail "Event listener missing metrics"
fi

# Check market/execute route integration
execute_route="src/app/api/market/execute/route.ts"
if [ -f "$execute_route" ]; then
    if grep -q "globalErrorHandler.handleRPCCall" "$execute_route"; then
        check_pass "market/execute route has circuit breaker protection"
    else
        check_fail "market/execute route missing circuit breaker"
    fi

    if grep -q "AvalancheMetrics.record" "$execute_route"; then
        check_pass "market/execute route has metrics recording"
    else
        check_fail "market/execute route missing metrics"
    fi

    if grep -q "PerformanceTimer" "$execute_route"; then
        check_pass "market/execute route has performance timing"
    else
        check_fail "market/execute route missing performance timing"
    fi
fi

# Check vrf-trade route integration
vrf_route="src/app/api/market/vrf-trade/route.ts"
if [ -f "$vrf_route" ]; then
    if grep -q "globalErrorHandler" "$vrf_route"; then
        check_pass "market/vrf-trade route has error recovery"
    else
        check_fail "market/vrf-trade route missing error recovery"
    fi

    if grep -q "AvalancheMetrics" "$vrf_route"; then
        check_pass "market/vrf-trade route has metrics"
    else
        check_fail "market/vrf-trade route missing metrics"
    fi
fi

# Check error recovery alert integration
if grep -q "globalAlertManager.sendAlert" src/lib/errorRecovery.ts; then
    check_pass "Error recovery has alert system connected"
else
    check_fail "Error recovery missing alert integration"
fi

# Check analytics stub exists
if [ -f "src/lib/analytics.ts" ]; then
    check_pass "Analytics stub module exists"
else
    check_fail "Analytics module missing"
fi

# ============================================================================
# 4. API Health Checks
# ============================================================================

print_section "4. API Health Checks"

# Check if server is running
if curl -sf "$BASE_URL" > /dev/null 2>&1; then
    check_pass "Server is running at $BASE_URL"

    # Test Market Execute API
    if curl -sf "$BASE_URL/api/market/execute" > /dev/null 2>&1; then
        check_pass "Market Execute API is accessible"
    else
        check_warning "Market Execute API not accessible (may need authentication)"
    fi

    # Test Market VRF Trade API
    if curl -sf "$BASE_URL/api/market/vrf-trade?mirrorKey=0x0" > /dev/null 2>&1; then
        check_pass "Market VRF Trade API is accessible"
    else
        check_warning "Market VRF Trade API not accessible"
    fi

    # Test Metrics API
    if curl -sf "$BASE_URL/api/metrics" > /dev/null 2>&1; then
        check_pass "Metrics API is accessible"

        # Check if metrics contain Avalanche-specific data
        metrics_output=$(curl -s "$BASE_URL/api/metrics")
        if echo "$metrics_output" | grep -q "avalanche_"; then
            check_pass "Metrics API returning Avalanche-specific metrics"
        else
            check_warning "No Avalanche metrics data yet (execute some operations first)"
        fi
    else
        check_warning "Metrics API not accessible"
    fi

else
    check_warning "Server not running - start with 'npm start' to test API endpoints"
fi

# ============================================================================
# 5. Contract Deployment Verification
# ============================================================================

print_section "5. Contract Deployment on $CHAIN_NAME"

if [ -f "$DEPLOYMENT_FILE" ]; then
    check_pass "Deployment file found: $(basename $DEPLOYMENT_FILE)"

    # Read contract addresses from deployment JSON
    CONTRACT_COUNT=$(python3 -c "import json; d=json.load(open('$DEPLOYMENT_FILE')); print(len(d.get('contracts', {})))" 2>/dev/null || echo "0")
    check_info "Contracts in deployment: $CONTRACT_COUNT"

    # Verify key contracts have non-zero addresses
    for contract in crownToken warriorsNFT arenaFactory predictionArena; do
        addr=$(python3 -c "import json; d=json.load(open('$DEPLOYMENT_FILE')); print(d['contracts'].get('$contract', ''))" 2>/dev/null)
        if [ -n "$addr" ] && [ "$addr" != "0x0000000000000000000000000000000000000000" ]; then
            check_pass "$contract: $addr"
        else
            check_fail "$contract: not deployed"
        fi
    done

    # For mainnet, check if contracts are verified on Snowtrace
    if [ "$NETWORK" = "mainnet" ]; then
        check_info "Run ./scripts/verify-contracts-snowtrace.sh mainnet to verify contracts on Snowtrace"
    fi
else
    check_fail "Deployment file not found: $DEPLOYMENT_FILE"
    if [ "$NETWORK" = "mainnet" ]; then
        check_info "Deploy to mainnet first: forge script script/DeployAvalancheSimplified.s.sol --rpc-url https://api.avax.network/ext/bc/C/rpc --broadcast --verify -vvvv"
    fi
fi

echo ""
check_info "Chain: $CHAIN_NAME (ID: $CHAIN_ID)"
check_info "Explorer: $EXPLORER_URL"

# ============================================================================
# 6. File Structure Verification
# ============================================================================

print_section "6. File Structure"

required_files=(
    "src/lib/errorRecovery.ts"
    "src/lib/metrics.ts"
    "src/lib/alerting/alertManager.ts"
    "src/lib/avalancheClient.ts"
    "src/lib/eventListeners/externalMarketEvents.ts"
    "src/lib/analytics.ts"
    "src/constants/abis/externalMarketMirrorAbi.ts"
    "src/constants/abis/crwnTokenAbi.ts"
    "src/app/api/market/execute/route.ts"
    "src/app/api/market/vrf-trade/route.ts"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        check_pass "$(basename $file) exists"
    else
        check_fail "$file missing"
    fi
done

################################################################################
# Summary
################################################################################

print_header "Verification Summary"

echo ""
echo -e "${BOLD}Results:${NC}"
echo -e "  Total Checks:  ${TOTAL_CHECKS}"
echo -e "  ${GREEN}Passed:        ${PASSED_CHECKS}${NC}"
echo -e "  ${RED}Failed:        ${FAILED_CHECKS}${NC}"
echo ""

if [ $FAILED_CHECKS -eq 0 ]; then
    echo -e "${GREEN}${BOLD}All checks passed! Deployment is ready for production.${NC}"
    echo ""
    echo -e "${BOLD}Next Steps:${NC}"
    if [ "$NETWORK" = "mainnet" ]; then
        echo "  1. Verify contracts on Snowtrace: ./scripts/verify-contracts-snowtrace.sh mainnet"
        echo "  2. Apply at retro9000.avax.network with deployer wallet"
        echo "  3. Set NEXT_PUBLIC_CHAIN_ID=43114 on Vercel and redeploy"
        echo "  4. Monitor AVAX burned at $EXPLORER_URL"
    else
        echo "  1. Start the server: npm start"
        echo "  2. Start event listener: curl -X POST http://localhost:3000/api/events/start"
        echo "  3. Monitor metrics: curl http://localhost:3000/api/metrics"
        echo "  4. When ready for mainnet: ./scripts/verify-deployment.sh mainnet"
    fi
    exit 0
else
    echo -e "${RED}${BOLD}Deployment verification failed with ${FAILED_CHECKS} issues.${NC}"
    echo ""
    echo -e "${BOLD}Recommended Actions:${NC}"
    echo "  1. Review failed checks above"
    echo "  2. Run: npm run build"
    echo "  3. Check environment configuration"
    echo "  4. Re-run this script: ./scripts/verify-deployment.sh $NETWORK"
    exit 1
fi
