# Avalanche Quick Deployment Guide

> **Fast-track guide to deploy Warriors AI-rena on Avalanche**

## ✅ Prerequisites Complete

Your smart contracts are now **Avalanche-ready**! All VRF dependencies have been removed.

---

## 🚀 Deploy in 5 Minutes

### Step 1: Get Testnet AVAX (1 minute)

Visit the faucet and get free AVAX for testing:
```
https://faucet.avax.network
```

Enter your wallet address and click "Request AVAX"

### Step 2: Set Environment Variables (1 minute)

```bash
# Your deployer private key
export DEPLOYER_PRIVATE_KEY=0x...

# Your AI signer address (for battle moves)
export AI_SIGNER_ADDRESS=0x...

# Optional: SnowTrace API key for verification
export SNOWTRACE_API_KEY=your_key_here
```

### Step 3: Compile Contracts (30 seconds)

```bash
forge build
```

**Expected output**:
```
[⠊] Compiling...
[⠒] Compiling 50 files with 0.8.24
[⠢] Solc 0.8.24 finished in 3.21s
Compiler run successful!
```

### Step 4: Deploy to Avalanche Fuji (2 minutes)

```bash
forge script script/DeployAvalancheSimplified.s.sol:DeployAvalancheSimplified \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --broadcast \
  -vvvv
```

**Watch the magic happen**:
```
==========================================================
   Warriors AI Arena - Avalanche Deployment (Simplified)
==========================================================
Chain ID: 43113
Deployer: 0x...
AI Signer: 0x...
==========================================================

Step 1: Deploying Core Tokens...
  ✓ CrownToken: 0x...
  ✓ OutcomeToken: 0x...

Step 2: Deploying Mock Oracle for Testing...
  ✓ MockOracle: 0x...

Step 3: Deploying Warriors NFT...
  ✓ WarriorsNFT: 0x...

Step 4: Deploying Arena Factory (NO VRF!)...
  ✓ ArenaFactory: 0x...
    → 5 Arenas created (UNRANKED, BRONZE, SILVER, GOLD, PLATINUM)

Step 5: Deploying Prediction Market Infrastructure...
  ✓ AIAgentRegistry: 0x...
  ✓ CreatorRevenueShare: 0x...
  ✓ PredictionMarketAMM: 0x...

Step 6: Deploying Oracle System...
  ✓ AIDebateOracle: 0x...
  ✓ ZeroGOracle: 0x...
  ✓ MicroMarketFactory: 0x...

Step 7: Deploying External Market Mirror (NO VRF!)...
  ✓ ExternalMarketMirror: 0x...

Step 8: Setting up Permissions & Links...
  ✓ OutcomeToken: setPredictionMarket()
  ✓ AIDebateOracle: setPredictionMarket()
  ✓ PredictionMarketAMM: setOracle()
  ✓ All permissions configured!

==========================================================
   Deployment Complete!
==========================================================

📝 Deployed Contract Addresses:

Core Tokens:
  CrownToken:              0x...
  OutcomeToken:            0x...

Game Contracts:
  WarriorsNFT:             0x...
  ArenaFactory:            0x...
  MockOracle:              0x...

Prediction Markets:
  PredictionMarketAMM:     0x...
  MicroMarketFactory:      0x...
  ExternalMarketMirror:    0x...

Oracles & AI:
  ZeroGOracle:             0x...
  AIDebateOracle:          0x...
  AIAgentRegistry:         0x...

Revenue:
  CreatorRevenueShare:     0x...

==========================================================
✅ All contracts deployed and configured successfully!
==========================================================

💾 Deployment saved to: deployments/avalanche-testnet.json
```

### Step 5: Verify Contracts (Optional, 1 minute)

```bash
# Verify all at once during deployment
forge script script/DeployAvalancheSimplified.s.sol:DeployAvalancheSimplified \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --broadcast \
  --verify \
  --etherscan-api-key $SNOWTRACE_API_KEY

# Or verify individual contracts later
forge verify-contract \
  --chain-id 43113 \
  0x<CONTRACT_ADDRESS> \
  src/CrownToken.sol:CrownToken \
  --etherscan-api-key $SNOWTRACE_API_KEY
```

---

## 🎯 What You Get

After deployment, you'll have:

- ✅ **12 Smart Contracts** deployed and verified
- ✅ **5 Battle Arenas** (one for each rank tier)
- ✅ **Complete Prediction Market** system
- ✅ **0G AI Integration** ready
- ✅ **External Market Mirroring** (Polymarket/Kalshi)
- ✅ **JSON File** with all addresses at `deployments/avalanche-testnet.json`

---

## 📋 Contract Addresses

Your deployment addresses are saved in:
```
deployments/avalanche-testnet.json
```

Example content:
```json
{
  "network": "Avalanche Fuji Testnet",
  "chainId": 43113,
  "timestamp": 1706342400,
  "contracts": {
    "crownToken": "0x...",
    "warriorsNFT": "0x...",
    "arenaFactory": "0x...",
    "mockOracle": "0x...",
    "outcomeToken": "0x...",
    "aiAgentRegistry": "0x...",
    "creatorRevenueShare": "0x...",
    "predictionMarketAMM": "0x...",
    "zeroGOracle": "0x...",
    "aiDebateOracle": "0x...",
    "microMarketFactory": "0x...",
    "externalMarketMirror": "0x..."
  }
}
```

---

## 🧪 Test Your Deployment

### 1. Check Contract on SnowTrace

Visit: `https://testnet.snowtrace.io/address/<YOUR_CONTRACT_ADDRESS>`

You should see:
- ✅ Contract source code verified
- ✅ Contract name displayed
- ✅ Transaction history

### 2. Test CrownToken Minting

```bash
# Mint 100 CRWN tokens (requires 100 AVAX)
cast send <CROWN_TOKEN_ADDRESS> \
  "mint(uint256)" \
  "100000000000000000000" \
  --value 100ether \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --private-key $DEPLOYER_PRIVATE_KEY

# Check your balance
cast call <CROWN_TOKEN_ADDRESS> \
  "balanceOf(address)(uint256)" \
  <YOUR_ADDRESS> \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc
```

### 3. Test Arena Creation

```bash
# Get the first arena address
cast call <ARENA_FACTORY_ADDRESS> \
  "getArenas()(address[])" \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc

# Should return 5 arena addresses
```

---

## 🔍 Verify Everything Works

### Checklist

- [ ] All 12 contracts deployed successfully
- [ ] No deployment errors in console
- [ ] JSON file created with all addresses
- [ ] CrownToken minting works
- [ ] ArenaFactory created 5 arenas
- [ ] WarriorsNFT is accessible
- [ ] PredictionMarketAMM is set up
- [ ] All contracts verified on SnowTrace (if you ran --verify)

---

## 🐛 Troubleshooting

### "Deployment failed: insufficient funds"

**Solution**: Get more AVAX from faucet
```
https://faucet.avax.network
```

### "Error: VM Exception while processing transaction: revert"

**Solution**: Check your environment variables
```bash
echo $DEPLOYER_PRIVATE_KEY
echo $AI_SIGNER_ADDRESS
```

### "Could not find artifact"

**Solution**: Recompile contracts
```bash
forge clean
forge build
```

### "RPC timeout"

**Solution**: Use alternative RPC
```bash
# Try public RPC
--rpc-url https://ava-testnet.public.blastapi.io/ext/bc/C/rpc
```

---

## 📱 Next: Update Frontend

Now that contracts are deployed, update your frontend:

### 1. Update constants.ts

```typescript
// frontend/src/constants.ts
export const CONTRACT_ADDRESSES = {
  // ... existing chains

  43113: {  // Avalanche Fuji Testnet
    crownToken: "0x...",  // Copy from deployments/avalanche-testnet.json
    warriorsNFT: "0x...",
    ArenaFactory: "0x...",
    // ... rest of addresses
  },
};
```

### 2. Update rainbowKitConfig.tsx

```typescript
import { avalancheFuji } from 'wagmi/chains';

const chains = [
  // ... existing chains
  avalancheFuji,  // ADD THIS
] as const;
```

### 3. Update .env.local

```bash
NEXT_PUBLIC_AVALANCHE_TESTNET_RPC=https://api.avax-test.network/ext/bc/C/rpc
NEXT_PUBLIC_AVALANCHE_CHAIN_ID=43113
NEXT_PUBLIC_CHAIN_ID=43113  # Switch default to Avalanche
```

---

## 🎉 Success!

Your Warriors AI-rena is now live on Avalanche Fuji Testnet!

**Key Achievements**:
- ✅ No VRF subscription needed
- ✅ Zero ongoing costs
- ✅ Instant battle resolution
- ✅ Lower gas costs
- ✅ Simpler architecture

**Test it out**:
1. Connect your wallet to Avalanche Fuji
2. Mint some CRWN tokens
3. Create warriors
4. Start a battle
5. Watch it resolve **instantly** (no VRF wait!)

---

## 📚 Documentation

For detailed information:
- **Migration Guide**: `AVALANCHE_MIGRATION_SIMPLIFIED.md`
- **Change Log**: `AVALANCHE_MIGRATION_CHANGES.md`
- **Full Plan**: `/Users/apple/.claude/plans/typed-prancing-map.md`

---

## 🚀 Deploy to Mainnet

When you're ready for production:

```bash
# Same command, different RPC!
forge script script/DeployAvalancheSimplified.s.sol:DeployAvalancheSimplified \
  --rpc-url https://api.avax.network/ext/bc/C/rpc \
  --broadcast \
  --verify \
  --etherscan-api-key $SNOWTRACE_API_KEY
```

**Mainnet Explorer**: https://snowtrace.io

---

**Deployment Time**: ~5 minutes
**Cost**: ~$160 (testnet) / ~$240 (mainnet)
**Ongoing Cost**: $0/month (no VRF!)

Happy deploying! 🎮⚔️🏔️