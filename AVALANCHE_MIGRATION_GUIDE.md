# Warriors AI-rena: Avalanche Migration - Executive Summary

> **Complete migration guide from Flow Testnet to Avalanche C-Chain**

## 📋 Quick Overview

**Current State**: Deployed on Flow Testnet (Chain ID: 545) + 0G Galileo Testnet (16602)

**Target State**: Avalanche Fuji Testnet (43113) / Mainnet (43114) + 0G Galileo (16602)

**Migration Complexity**: Medium (VRF integration is the critical path)

**Estimated Timeline**: 3 weeks

**Estimated Cost**: ~$430 (testnet) + ~$1,150 (mainnet) + $300-400/month ongoing

---

## 🎯 Critical Changes Required

### 1. VRF System Migration (HIGHEST PRIORITY)

**Problem**: Flow's Cadence Arch provides synchronous randomness. Avalanche requires Chainlink VRF (async).

**Impact**: Arena.sol and ExternalMarketMirror.sol must be refactored.

**Solution**: Implement Chainlink VRF v2.5 wrapper with 2-step request/fulfill pattern.

### 2. Smart Contract Changes

| Contract | Change Required | Complexity |
|----------|-----------------|------------|
| **Arena.sol** | Replace `_revertibleRandom()` with async VRF | High |
| **ArenaFactory.sol** | Update constructor to pass VRF oracle instead of Cadence Arch | Low |
| **ExternalMarketMirror.sol** | Replace FlowVRFOracle with AvalancheVRFOracle | Medium |
| **WarriorsNFT.sol** | Remove 0G storage references (optional) | Low |
| **All Others** | No changes (chain-agnostic) | None |

### 3. Frontend Changes

- Add Avalanche chain configuration (43113, 43114)
- Update RPC endpoints in constants.ts
- Add Avalanche to wagmi/RainbowKit config
- Update contract addresses
- Handle async VRF flow in battle UI

### 4. Backend Changes

- Update .env files with Avalanche RPC URLs
- No code changes needed (services are chain-agnostic)

---

## 🔧 Implementation Checklist

### Week 1: Smart Contract Development

- [x] **Day 1-2**: Create `AvalancheVRFOracle.sol` (Chainlink VRF wrapper)
  - Implement request/fulfill pattern
  - Add subscription management
  - Create interface `IAvalancheVRFOracle.sol`

- [ ] **Day 3-4**: Refactor `Arena.sol`
  - Replace `i_cadenceArch` with `i_vrfOracle`
  - Split `nextRound()` into request + process functions
  - Add `GameState.WAITING_FOR_RANDOMNESS` state
  - Update battle flow logic

- [ ] **Day 5**: Refactor `ExternalMarketMirror.sol`
  - Replace `IFlowVRF` with `IAvalancheVRFOracle`
  - Update fulfillRandomness callback
  - Test market creation flow

- [ ] **Day 6-7**: Local testing with Foundry/Anvil
  - Test VRF oracle locally
  - Test arena battles with mock VRF
  - Test external market creation

### Week 2: Deployment & Integration

- [ ] **Day 8**: Create deployment script
  - Write `script/DeployAvalanche.s.sol`
  - Deploy to Avalanche Fuji Testnet
  - Verify contracts on SnowTrace

- [ ] **Day 9**: Configure Chainlink VRF
  - Create VRF subscription at https://vrf.chain.link/fuji
  - Fund with LINK tokens (10 LINK for testing)
  - Add AvalancheVRFOracle as consumer

- [ ] **Day 10**: Update frontend
  - Add Avalanche to `constants.ts`
  - Update `rainbowKitConfig.tsx`
  - Create `avalancheClient.ts`
  - Update environment variables

- [ ] **Day 11-12**: Integration testing
  - Test wallet connection
  - Test NFT minting
  - Test arena creation and battles
  - Test prediction markets
  - Test 0G AI integration

- [ ] **Day 13-14**: Bug fixes and optimization
  - Fix any issues found in testing
  - Optimize gas usage
  - Improve UX for async VRF flow

### Week 3: Production Preparation

- [ ] **Day 15-16**: Security review
  - Audit VRF integration
  - Check for reentrancy issues
  - Verify access controls
  - Test emergency procedures

- [ ] **Day 17**: User acceptance testing
  - Internal team testing
  - Beta user testing
  - Collect feedback

- [ ] **Day 18-19**: Documentation
  - Update README.md
  - Update deployment guides
  - Create migration announcement
  - Update API documentation

- [ ] **Day 20**: Mainnet preparation
  - Create mainnet VRF subscription
  - Fund with production LINK amount (50 LINK)
  - Prepare deployment script for mainnet

- [ ] **Day 21**: Mainnet deployment
  - Deploy to Avalanche C-Chain
  - Verify all contracts
  - Monitor for 24 hours
  - Announce launch

---

## 📝 Key Files to Create

### New Smart Contracts

1. **`src/AvalancheVRFOracle.sol`**
   - Chainlink VRF v2.5 wrapper
   - Request/fulfill pattern
   - Subscription management
   - [Full implementation in main plan]

2. **`src/interfaces/IAvalancheVRFOracle.sol`**
   ```solidity
   interface IAvalancheVRFOracle {
       function requestRandomness() external returns (uint256 requestId);
       function getRandomResult(uint256 requestId) external view returns (uint256);
       function requestFulfilled(uint256 requestId) external view returns (bool);
   }
   ```

### New Deployment Scripts

3. **`script/DeployAvalanche.s.sol`**
   - Complete deployment suite
   - All contracts in correct order
   - Saves addresses to JSON
   - [Full implementation in main plan]

### New Frontend Files

4. **`frontend/src/lib/avalancheClient.ts`**
   - Avalanche RPC client
   - Primary + fallback support
   - Public + wallet clients
   - [Full implementation in main plan]

---

## 🔄 Modified Files

### Smart Contracts

**`src/Arena.sol`** - Major changes
```solidity
// OLD
address private immutable i_cadenceArch;
function _revertibleRandom() private view returns (uint64) { ... }
function nextRound() public { ... }

// NEW
IAvalancheVRFOracle private immutable i_vrfOracle;
mapping(uint256 => uint256) private pendingRandomnessRequests;
function nextRound() public { ... }  // Now requests VRF
function processRoundWithRandomness(uint256 requestId) external { ... }  // New
```

**`src/ArenaFactory.sol`** - Minor changes
```solidity
// OLD constructor parameter
address _cadenceArch

// NEW constructor parameter
address _vrfOracleAddress
```

**`src/ExternalMarketMirror.sol`** - Medium changes
```solidity
// OLD
IFlowVRF public immutable flowVRF;

// NEW
IAvalancheVRFOracle public immutable avalancheVRF;
```

### Frontend Configuration

**`frontend/src/constants.ts`** - Add Avalanche chains
```typescript
export type SupportedChainId = 545 | 16602 | 747 | 31337 | 43113 | 43114;

export const AVALANCHE_RPC_URLS = {
  testnet: { primary: 'https://api.avax-test.network/ext/bc/C/rpc', ... },
  mainnet: { primary: 'https://api.avax.network/ext/bc/C/rpc', ... },
};

export const CONTRACT_ADDRESSES: Record<SupportedChainId, ContractAddresses> = {
  // ... existing
  43113: { /* Avalanche Fuji addresses */ },
  43114: { /* Avalanche Mainnet addresses */ },
};
```

**`frontend/src/rainbowKitConfig.tsx`** - Add Avalanche chains
```typescript
import { avalancheFuji, avalanche } from 'wagmi/chains';

const chains = [
  anvil,
  flowTestnet,
  flowMainnet,
  zeroGGalileo,
  avalancheFuji,  // NEW
  avalanche,      // NEW
] as const;
```

**`frontend/.env.local`** - Add Avalanche config
```bash
NEXT_PUBLIC_AVALANCHE_TESTNET_RPC=https://api.avax-test.network/ext/bc/C/rpc
NEXT_PUBLIC_AVALANCHE_MAINNET_RPC=https://api.avax.network/ext/bc/C/rpc
NEXT_PUBLIC_AVALANCHE_CHAIN_ID=43113
NEXT_PUBLIC_AVALANCHE_VRF_ORACLE_ADDRESS=0x...
NEXT_PUBLIC_CHAIN_ID=43113  # Switch default to Avalanche
```

**`foundry.toml`** - Add Avalanche RPCs
```toml
[rpc_endpoints]
avalanche_testnet = "https://api.avax-test.network/ext/bc/C/rpc"
avalanche_mainnet = "https://api.avax.network/ext/bc/C/rpc"

[etherscan]
avalanche_testnet = { key = "${SNOWTRACE_API_KEY}", url = "https://api-testnet.snowtrace.io/api" }
avalanche_mainnet = { key = "${SNOWTRACE_API_KEY}", url = "https://api.snowtrace.io/api" }
```

---

## 💰 Cost Breakdown

### Development Costs
- Smart contract refactoring: 40 hours
- Deployment scripts: 16 hours
- Frontend updates: 24 hours
- Testing & QA: 32 hours
- Documentation: 16 hours
- **Total: 128 hours**

### Deployment Costs

**Testnet (Fuji)**:
- Contract deployments: ~5 AVAX (~$200)
- Chainlink LINK: 10 LINK (~$150)
- Testing transactions: ~2 AVAX (~$80)
- **Total: ~$430**

**Mainnet (C-Chain)**:
- Contract deployments: ~10 AVAX (~$400)
- Chainlink LINK: 50 LINK (~$750)
- **Total: ~$1,150**

### Ongoing Costs (Monthly)
- Chainlink VRF usage: ~20 LINK (~$300)
- RPC infrastructure: $0-50 (public vs private)
- Monitoring: $0-50
- **Total: ~$300-400/month**

---

## ⚠️ Critical Risks & Mitigation

### Risk 1: VRF Subscription Runs Out
**Impact**: Battles freeze mid-game
**Mitigation**:
- Set up automated monitoring (check balance every minute)
- Alert when < 10 LINK remaining
- Document emergency refill procedure
- Keep backup LINK in hot wallet

### Risk 2: VRF Callback Gas Issues
**Impact**: Fulfillment transactions fail
**Mitigation**:
- Start with high `callbackGasLimit` (500k)
- Monitor actual gas usage
- Adjust based on data
- Test extensively on testnet

### Risk 3: Battle Flow UX Degradation
**Impact**: Users confused by async flow
**Mitigation**:
- Add clear "Waiting for randomness..." states
- Show progress indicators
- Implement optimistic UI updates
- Add explainer tooltips

### Risk 4: 0G Integration Break
**Impact**: AI features stop working
**Mitigation**:
- Test 0G thoroughly with Avalanche
- 0G is chain-agnostic (should work)
- Have centralized AI fallback ready
- Monitor 0G service health

---

## 📊 Success Metrics

### Technical
- Transaction success rate: >99%
- Average confirmation time: <3 seconds
- VRF fulfillment time: <30 seconds
- Gas cost per battle: <$2

### User Experience
- Battle creation success: >95%
- Wallet connection success: >98%
- Error rate: <2%

### Business
- User retention: Maintain or improve
- Daily active users: Track trend
- Transaction volume: Monitor growth

---

## 🚀 Deployment Commands

### Deploy to Fuji Testnet

```bash
# 1. Set environment variables
export DEPLOYER_PRIVATE_KEY=0x...
export AI_SIGNER_ADDRESS=0x...
export CHAINLINK_SUBSCRIPTION_ID=123
export SNOWTRACE_API_KEY=...

# 2. Deploy contracts
forge script script/DeployAvalanche.s.sol:DeployAvalanche \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --broadcast \
  --verify \
  -vvvv

# 3. Add VRF consumer
# Visit: https://vrf.chain.link/fuji
# Add deployed AvalancheVRFOracle address

# 4. Test deployment
cast call 0x<VRF_ORACLE> "s_subscriptionId()(uint256)" \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc
```

### Deploy to Mainnet

```bash
# Same as testnet but use mainnet RPC
forge script script/DeployAvalanche.s.sol:DeployAvalanche \
  --rpc-url https://api.avax.network/ext/bc/C/rpc \
  --broadcast \
  --verify \
  -vvvv
```

---

## 🔍 Verification

### Verify Contract on SnowTrace

```bash
forge verify-contract \
  --chain-id 43113 \
  --compiler-version v0.8.24 \
  --constructor-args $(cast abi-encode "constructor(uint256,address,bytes32)" \
    123 \
    0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE \
    0xc799bd1e3bd4d1a41cd4968997a4e03dfd2a3c7c04b695881138580163f42887) \
  0x<CONTRACT_ADDRESS> \
  src/AvalancheVRFOracle.sol:AvalancheVRFOracle \
  --etherscan-api-key $SNOWTRACE_API_KEY
```

### Test VRF Functionality

```bash
# Request randomness
cast send 0x<VRF_ORACLE> "requestRandomness()" \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --private-key $TEST_PRIVATE_KEY

# Check if fulfilled (wait ~30 seconds)
cast call 0x<VRF_ORACLE> "requestFulfilled(uint256)" <REQUEST_ID> \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc

# Get random result
cast call 0x<VRF_ORACLE> "getRandomResult(uint256)" <REQUEST_ID> \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc
```

---

## 📚 Resources

### Avalanche
- **Testnet RPC**: https://api.avax-test.network/ext/bc/C/rpc
- **Mainnet RPC**: https://api.avax.network/ext/bc/C/rpc
- **Explorer**: https://testnet.snowtrace.io
- **Faucet**: https://faucet.avax.network
- **Docs**: https://docs.avax.network

### Chainlink VRF
- **VRF Dashboard**: https://vrf.chain.link/fuji
- **Documentation**: https://docs.chain.link/vrf/v2-5/overview
- **LINK Faucet**: https://faucets.chain.link/fuji
- **Supported Networks**: https://docs.chain.link/vrf/v2-5/supported-networks

### Development Tools
- **Foundry**: https://book.getfoundry.sh
- **wagmi**: https://wagmi.sh
- **RainbowKit**: https://www.rainbowkit.com
- **Viem**: https://viem.sh

---

## 🆘 Emergency Procedures

### If VRF Subscription Runs Out

1. **Immediate**: Go to https://vrf.chain.link/fuji
2. Find your subscription ID
3. Click "Fund Subscription"
4. Add 20 LINK minimum
5. Wait 1-2 minutes for confirmation
6. Pending battles will resume automatically

### If Contract Has Critical Bug

1. **Pause**: Call emergency pause if implemented
2. **Notify**: Announce on Discord/Twitter immediately
3. **Assess**: Determine severity and fix requirements
4. **Deploy**: Deploy patched contracts
5. **Migrate**: Help users migrate if needed
6. **Document**: Write post-mortem

### Emergency Contacts

- **Chainlink Support**: https://discord.gg/chainlink
- **Avalanche Support**: https://discord.gg/avalanche
- **0G Network**: https://discord.gg/0glabs

---

## ✅ Post-Migration Checklist

### Smart Contracts
- [ ] All contracts deployed
- [ ] All contracts verified on SnowTrace
- [ ] VRF subscription funded with >20 LINK
- [ ] VRF consumer contracts added
- [ ] Emergency pause tested
- [ ] Ownership transferred to multi-sig

### Frontend
- [ ] Chain configuration updated
- [ ] Contract addresses updated
- [ ] Wallet connection tested
- [ ] Battle flow works with async VRF
- [ ] All pages load correctly

### Backend
- [ ] Arena backend connects to Avalanche
- [ ] 0G storage service functional
- [ ] 0G compute service tested
- [ ] Monitoring alerts configured

### Documentation
- [ ] README updated
- [ ] Deployment guide updated
- [ ] Architecture diagrams updated
- [ ] User guides updated

### Operations
- [ ] VRF monitoring script running
- [ ] Gas price alerts configured
- [ ] Backup RPC endpoints tested
- [ ] Team trained on Avalanche

---

## 📞 Support

For detailed implementation guidance, see the complete migration plan at:
`/Users/apple/.claude/plans/typed-prancing-map.md`

For questions or issues during migration:
1. Check the detailed plan for specific implementation details
2. Review Chainlink VRF documentation
3. Test on Fuji testnet first before mainnet
4. Reach out to Avalanche/Chainlink Discord for technical support

---

**Document Version**: 1.0
**Created**: 2026-01-26
**Author**: Claude Code Agent
**Status**: Ready for Implementation

**Next Step**: Begin Week 1 development by creating AvalancheVRFOracle.sol