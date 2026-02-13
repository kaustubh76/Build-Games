# 📋 Avalanche Deployment Checklist

**Project**: Warriors AI-rena
**Target**: Avalanche C-Chain (Fuji Testnet → Mainnet)
**Migration**: Flow Testnet → Avalanche (VRF Removed)
**Date**: 2026-01-26

---

## ✅ Complete - All Smart Contract Changes

### Smart Contract Modifications
- [x] Arena.sol - VRF removed, block-based randomness implemented
- [x] ArenaFactory.sol - Constructor updated (no cadenceArch parameter)
- [x] ExternalMarketMirror.sol - FlowVRF completely removed
- [x] DeployAvalancheSimplified.s.sol - Deployment script created
- [x] DeployExternalMarketMirror.s.sol - Updated for no-VRF deployment
- [x] All contracts compile successfully (Solidity 0.8.29)

### Frontend Configuration
- [x] constants.ts - Avalanche chain IDs added (43113, 43114)
- [x] rainbowKitConfig.tsx - avalancheFuji and avalanche chains added
- [x] Contract address placeholders created

### Documentation
- [x] AVALANCHE_MIGRATION_SIMPLIFIED.md
- [x] AVALANCHE_MIGRATION_CHANGES.md
- [x] AVALANCHE_QUICK_DEPLOY.md
- [x] IMPLEMENTATION_COMPLETE.md
- [x] DEPLOYMENT_READY.md

---

## 🎯 Ready to Deploy

### Pre-Deployment Setup
- [ ] Foundry installed and updated (`foundryup`)
- [ ] Deployer wallet has 5+ AVAX (Fuji testnet)
- [ ] Environment variables configured
- [ ] All contracts compile (`forge build`)

### Environment Variables Checklist
```bash
export DEPLOYER_PRIVATE_KEY=0x...
export AI_SIGNER_ADDRESS=0x...
export ORACLE_ADDRESS=0x...  # Optional, can be address(0)
export SNOWTRACE_API_KEY=...  # Optional, for verification
```

- [ ] DEPLOYER_PRIVATE_KEY set
- [ ] AI_SIGNER_ADDRESS set
- [ ] ORACLE_ADDRESS set (or using address(0))
- [ ] SNOWTRACE_API_KEY set (if verifying)

---

## 🚀 Deployment Commands

### Compile Contracts
```bash
cd "/Users/apple/Desktop/Avalanche project"
forge clean && forge build
```
- [ ] Compilation successful
- [ ] No errors (warnings OK)

### Deploy to Fuji Testnet
```bash
forge script script/DeployAvalancheSimplified.s.sol:DeployAvalancheSimplified \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --broadcast \
  -vvvv
```
- [ ] Deployment started
- [ ] All 12 contracts deployed
- [ ] Permissions configured
- [ ] JSON saved: `deployments/avalanche-testnet.json`

### Deploy with Verification
```bash
forge script script/DeployAvalancheSimplified.s.sol:DeployAvalancheSimplified \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --broadcast \
  --verify \
  --etherscan-api-key $SNOWTRACE_API_KEY \
  -vvvv
```
- [ ] Contracts verified on SnowTrace

---

## ✅ Post-Deployment Tests

### Contract Addresses
- [ ] CrownToken: _______________
- [ ] WarriorsNFT: _______________
- [ ] ArenaFactory: _______________
- [ ] PredictionMarketAMM: _______________
- [ ] ExternalMarketMirror: _______________
- [ ] ZeroGOracle: _______________

### Test 1: Verify on SnowTrace
- [ ] Visit: https://testnet.snowtrace.io
- [ ] All contracts visible
- [ ] Source code verified
- [ ] Contract names correct

### Test 2: CrownToken Minting
```bash
cast send <CROWN_TOKEN> "mint(uint256)" "100000000000000000000" \
  --value 100ether \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --private-key $DEPLOYER_PRIVATE_KEY
```
- [ ] Minting successful
- [ ] Balance = 100 CRWN

### Test 3: Arena Factory
```bash
cast call <ARENA_FACTORY> "getArenas()(address[])" \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc
```
- [ ] Returns 5 arena addresses
- [ ] All addresses valid

### Test 4: Full Battle Test
- [ ] Mint 2 Warriors NFTs
- [ ] Approve CRWN for arena
- [ ] Initialize battle
- [ ] Execute 5 rounds (instant!)
- [ ] Battle completes
- [ ] Winner determined
- [ ] Randomness works

---

## 🎨 Frontend Integration

### Update Contract Addresses
**File**: `frontend/src/constants.ts`
- [ ] Copy addresses from `deployments/avalanche-testnet.json`
- [ ] Update chain 43113 section
- [ ] All 12 contract addresses filled

### Update Environment
**File**: `frontend/.env.local`
```bash
NEXT_PUBLIC_AVALANCHE_TESTNET_RPC=https://api.avax-test.network/ext/bc/C/rpc
NEXT_PUBLIC_AVALANCHE_CHAIN_ID=43113
NEXT_PUBLIC_CHAIN_ID=43113  # Switch to Avalanche
```
- [ ] RPC URL set
- [ ] Chain ID set
- [ ] Default chain updated

### Frontend Tests
- [ ] Wallet connects to Avalanche Fuji
- [ ] Can mint CRWN tokens
- [ ] Can mint Warriors NFT
- [ ] Can create battles
- [ ] Battles resolve instantly
- [ ] No VRF delay

---

## 📊 Success Metrics

### Performance
- [ ] Battle resolution time: < 5 seconds (vs 30-60s on Flow)
- [ ] Gas cost per battle: ~300k gas (40% reduction)
- [ ] Transaction confirmation: ~2-3 seconds

### Costs
- [ ] Deployment cost: ~$160 (testnet)
- [ ] No ongoing VRF costs (saved $300-400/month)
- [ ] 92% total cost savings vs Flow with VRF

### Functionality
- [ ] All 12 contracts working
- [ ] 5 arenas active
- [ ] Randomness fair and secure
- [ ] No VRF dependencies
- [ ] Instant battle resolution

---

## 🔒 Security Verification

### Block-Based Randomness
- [ ] Uses 7 entropy sources
- [ ] Cannot be manipulated by users
- [ ] Replay attacks prevented
- [ ] Fair for moderate stakes (1-5 CRWN)

### Contract Security
- [ ] All permissions set correctly
- [ ] Oracle addresses verified
- [ ] No admin backdoors
- [ ] Upgradability considered

---

## 🎬 Mainnet Deployment

When testnet is verified:

### Prepare for Mainnet
- [ ] All testnet tests passed
- [ ] Get 10+ AVAX for mainnet
- [ ] Update to mainnet RPC
- [ ] Prepare production keys
- [ ] Update frontend for chain 43114

### Deploy to Mainnet
```bash
forge script script/DeployAvalancheSimplified.s.sol:DeployAvalancheSimplified \
  --rpc-url https://api.avax.network/ext/bc/C/rpc \
  --broadcast \
  --verify \
  --etherscan-api-key $SNOWTRACE_API_KEY \
  -vvvv
```
- [ ] Mainnet deployment successful
- [ ] Contracts verified on SnowTrace
- [ ] Addresses in `deployments/avalanche-mainnet.json`

### Post-Mainnet
- [ ] Monitor for 24 hours
- [ ] All transactions succeed
- [ ] Gas costs acceptable
- [ ] User feedback positive
- [ ] Announce to community

---

## 🚨 Issues & Notes

**Deployment Issues Encountered**:
```
[Record any issues here]




```

**Gas Costs**:
- Deployment: _______ AVAX
- First Battle: _______ gas
- Market Creation: _______ gas

**Performance Notes**:
```
[Record performance observations]




```

---

## ✅ Final Sign-Off

**Testnet Deployment**:
- [ ] All contracts deployed
- [ ] All tests passed
- [ ] Frontend integrated
- [ ] Documentation complete

**Mainnet Deployment**:
- [ ] Testnet validated
- [ ] Security reviewed
- [ ] Team approved
- [ ] Users notified

---

**Deployed By**: _____________
**Deployment Date**: _____________
**Network**: Avalanche Fuji / Mainnet (circle one)
**Deployment Time**: _______ minutes
**Total Cost**: _______ AVAX

**Status**: 🟢 READY | 🟡 IN PROGRESS | ✅ COMPLETE

---

🚀 **Ready to conquer Avalanche!**
