# Warriors AI-rena: Simplified Avalanche Migration (No VRF)

> **Streamlined migration guide - removing Chainlink VRF dependency**

## 🎯 New Approach: Remove VRF Dependency

Instead of migrating to Chainlink VRF, we'll **remove the VRF dependency entirely** and use alternative randomness sources that don't require external oracles.

---

## 📋 Migration Overview

**Current State**: Flow Testnet (545) with Cadence Arch VRF

**Target State**: Avalanche (43113/43114) with **block-based randomness**

**Migration Complexity**: **LOW** (no VRF integration needed)

**Estimated Timeline**: **1-2 weeks** (significantly reduced)

**Estimated Cost**: **~$300-500** (no ongoing VRF costs)

---

## 🔧 Randomness Alternatives (No VRF Required)

### Option 1: Block Hash Randomness (RECOMMENDED)

**Advantages**:
- No external dependencies
- No subscription costs
- Instant (no callbacks)
- Simple implementation

**Implementation**:
```solidity
function _getRandomness() private view returns (uint256) {
    // Use block hash + block timestamp + sender for randomness
    return uint256(keccak256(abi.encodePacked(
        blockhash(block.number - 1),
        block.timestamp,
        msg.sender,
        block.difficulty  // or block.prevrandao on some chains
    )));
}
```

**Security Considerations**:
- Not suitable for high-value gambling (miners can manipulate)
- Perfect for game mechanics where stakes are moderate
- Add commit-reveal for extra security if needed

### Option 2: AI Agent Signature-Based Randomness

**Advantages**:
- Already have AI agent infrastructure
- AI agent provides signed random seed
- Verifiable on-chain

**Implementation**:
```solidity
// AI agent provides signed random seed
function submitMoves(
    uint256 warrior1Move,
    uint256 warrior2Move,
    uint256 randomSeed,
    bytes memory signature
) external {
    // Verify signature from AI agent
    require(_verifyAISignature(randomSeed, signature), "Invalid signature");

    // Use randomSeed for battle calculations
    _processBattle(warrior1Move, warrior2Move, randomSeed);
}
```

**Security**: Relies on AI agent being honest (already trust model)

### Option 3: Hybrid Block + AI Signature

**Advantages**:
- Best of both worlds
- Extra security layer
- Still no VRF needed

**Implementation**:
```solidity
function _getRandomness(uint256 aiRandomSeed, bytes memory signature) private view returns (uint256) {
    require(_verifyAISignature(aiRandomSeed, signature), "Invalid AI seed");

    // Combine block hash with AI seed
    return uint256(keccak256(abi.encodePacked(
        blockhash(block.number - 1),
        aiRandomSeed,
        block.timestamp
    )));
}
```

---

## 🔄 Updated Migration Strategy

### Phase 1: Smart Contract Updates (Week 1)

#### Changes to Arena.sol

**OLD (Flow VRF)**:
```solidity
address private immutable i_cadenceArch;

function _revertibleRandom() private view returns (uint64) {
    (bool ok, bytes memory data) = i_cadenceArch.staticcall(
        abi.encodeWithSignature("revertibleRandom()")
    );
    require(ok, "Failed to fetch a random number through Cadence Arch");
    uint64 output = abi.decode(data, (uint64));
    return output;
}
```

**NEW (Block-based)**:
```solidity
// Remove i_cadenceArch completely

function _getRandomness() private view returns (uint256) {
    return uint256(keccak256(abi.encodePacked(
        blockhash(block.number - 1),
        block.timestamp,
        msg.sender,
        s_currentRound,
        s_gameState
    )));
}

// Or if using AI signature approach:
function _getRandomness(uint256 aiSeed, bytes memory signature) private view returns (uint256) {
    require(_verifyAISignature(aiSeed, signature), "Invalid AI signature");

    return uint256(keccak256(abi.encodePacked(
        blockhash(block.number - 1),
        aiSeed,
        block.timestamp,
        s_currentRound
    )));
}
```

**Battle flow remains synchronous** (no async callbacks):
```solidity
function nextRound() public {
    require(s_gameState == GameState.ONGOING, "Game not ongoing");
    require(block.timestamp >= s_lastRoundTime + MIN_BATTLE_ROUNDS_INTERVAL, "Too soon");

    // Get randomness instantly
    uint256 randomness = _getRandomness();

    // Process battle immediately
    _processBattleRound(randomness);

    s_currentRound++;
    s_lastRoundTime = block.timestamp;
}
```

#### Changes to ArenaFactory.sol

**OLD**:
```solidity
constructor(
    uint256 _costToInfluence,
    uint256 _costToDefluence,
    address _crownTokenAddress,
    address _AiPublicKey,
    address _cadenceArch,  // REMOVE THIS
    address _WarriorsNFTCollection,
    uint256 _betAmount
)
```

**NEW**:
```solidity
constructor(
    uint256 _costToInfluence,
    uint256 _costToDefluence,
    address _crownTokenAddress,
    address _AiPublicKey,
    // _cadenceArch parameter REMOVED
    address _WarriorsNFTCollection,
    uint256 _betAmount
)
```

#### Changes to ExternalMarketMirror.sol

**OLD**:
```solidity
IFlowVRF public immutable flowVRF;

function createMirrorMarket(...) external returns (uint256 requestId) {
    requestId = flowVRF.requestRandomness();
    // ... async flow
}
```

**NEW**:
```solidity
// Remove flowVRF completely

function createMirrorMarket(
    string calldata question,
    uint256 externalYesPrice,
    MarketSource source,
    string calldata externalMarketId
) external returns (uint256 marketId) {
    // Get randomness instantly
    uint256 randomness = uint256(keccak256(abi.encodePacked(
        blockhash(block.number - 1),
        block.timestamp,
        msg.sender,
        question
    )));

    // Apply variance immediately (no callback needed)
    int256 variance = int256(randomness % (VRF_VARIANCE_BPS * 2)) - int256(VRF_VARIANCE_BPS);
    uint256 adjustedPrice = uint256(int256(externalYesPrice) + variance);

    // Create market immediately
    marketId = predictionMarket.createMarket(question, adjustedPrice);

    // Store mirror info
    mirrorMarkets[marketId] = MirrorMarket({
        source: source,
        externalMarketId: externalMarketId,
        externalYesPrice: externalYesPrice,
        adjustedPrice: adjustedPrice,
        createdAt: block.timestamp
    });

    emit MirrorMarketCreated(marketId, source, externalMarketId, adjustedPrice);
}
```

#### Files NOT Needing Changes

✅ **CrownToken.sol** - No VRF dependency
✅ **WarriorsNFT.sol** - No VRF dependency
✅ **OutcomeToken.sol** - No VRF dependency
✅ **PredictionMarketAMM.sol** - No VRF dependency
✅ **ZeroGOracle.sol** - No VRF dependency
✅ **AIDebateOracle.sol** - No VRF dependency
✅ **AIAgentRegistry.sol** - No VRF dependency
✅ **CreatorRevenueShare.sol** - No VRF dependency
✅ **MicroMarketFactory.sol** - No VRF dependency
✅ **MockOracle.sol** - No VRF dependency

---

### Phase 2: Deployment (Week 1)

#### New Deployment Script

**File**: `script/DeployAvalancheSimplified.s.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {WarriorsNFT} from "../src/WarriorsNFT.sol";
import {ArenaFactory} from "../src/ArenaFactory.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {AIAgentRegistry} from "../src/AIAgentRegistry.sol";
import {CreatorRevenueShare} from "../src/CreatorRevenueShare.sol";
import {PredictionMarketAMM} from "../src/PredictionMarketAMM.sol";
import {ZeroGOracle} from "../src/ZeroGOracle.sol";
import {AIDebateOracle} from "../src/AIDebateOracle.sol";
import {MicroMarketFactory} from "../src/MicroMarketFactory.sol";
import {ExternalMarketMirror} from "../src/ExternalMarketMirror.sol";

contract DeployAvalancheSimplified is Script {
    // Avalanche Fuji Testnet Configuration
    uint256 constant CHAIN_ID = 43113;

    // Game Economics
    uint256 constant COST_TO_INFLUENCE = 10 ether;  // 10 CRWN
    uint256 constant COST_TO_DEFLUENCE = 5 ether;   // 5 CRWN
    uint256 constant BET_AMOUNT = 1 ether;          // 1 CRWN

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address aiPublicKey = vm.envAddress("AI_SIGNER_ADDRESS");

        console2.log("==============================================");
        console2.log("Deploying to Avalanche Fuji Testnet");
        console2.log("Chain ID:", CHAIN_ID);
        console2.log("Deployer:", deployer);
        console2.log("AI Signer:", aiPublicKey);
        console2.log("==============================================");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Core Tokens
        CrownToken crownToken = new CrownToken();
        console2.log("CrownToken deployed:", address(crownToken));

        OutcomeToken outcomeToken = new OutcomeToken();
        console2.log("OutcomeToken deployed:", address(outcomeToken));

        // 2. Deploy Mock Oracle (for testing)
        MockOracle mockOracle = new MockOracle();
        console2.log("MockOracle deployed:", address(mockOracle));

        // 3. Deploy Warriors NFT
        WarriorsNFT warriorsNFT = new WarriorsNFT(
            aiPublicKey,
            address(mockOracle)
        );
        console2.log("WarriorsNFT deployed:", address(warriorsNFT));

        // 4. Deploy Arena Factory (NO VRF parameter)
        ArenaFactory arenaFactory = new ArenaFactory(
            COST_TO_INFLUENCE,
            COST_TO_DEFLUENCE,
            address(crownToken),
            aiPublicKey,
            // NO cadenceArch parameter!
            address(warriorsNFT),
            BET_AMOUNT
        );
        console2.log("ArenaFactory deployed:", address(arenaFactory));

        // 5. Deploy Prediction Market Infrastructure
        AIAgentRegistry aiAgentRegistry = new AIAgentRegistry();
        console2.log("AIAgentRegistry deployed:", address(aiAgentRegistry));

        CreatorRevenueShare creatorRevenueShare = new CreatorRevenueShare(
            address(crownToken)
        );
        console2.log("CreatorRevenueShare deployed:", address(creatorRevenueShare));

        PredictionMarketAMM predictionMarket = new PredictionMarketAMM(
            address(crownToken),
            address(outcomeToken),
            address(creatorRevenueShare)
        );
        console2.log("PredictionMarketAMM deployed:", address(predictionMarket));

        // 6. Deploy Oracle System
        AIDebateOracle aiDebateOracle = new AIDebateOracle(
            address(aiAgentRegistry)
        );
        console2.log("AIDebateOracle deployed:", address(aiDebateOracle));

        ZeroGOracle zeroGOracle = new ZeroGOracle(
            address(aiDebateOracle),
            address(predictionMarket)
        );
        console2.log("ZeroGOracle deployed:", address(zeroGOracle));

        MicroMarketFactory microMarketFactory = new MicroMarketFactory(
            address(predictionMarket),
            address(crownToken)
        );
        console2.log("MicroMarketFactory deployed:", address(microMarketFactory));

        // 7. Deploy External Market Mirror (NO VRF parameter)
        ExternalMarketMirror externalMarketMirror = new ExternalMarketMirror(
            // NO flowVRF parameter!
            address(crownToken),
            address(predictionMarket)
        );
        console2.log("ExternalMarketMirror deployed:", address(externalMarketMirror));

        // 8. Set Permissions & Links
        outcomeToken.setPredictionMarket(address(predictionMarket));
        aiDebateOracle.setPredictionMarket(address(predictionMarket));
        predictionMarket.setOracle(address(zeroGOracle));

        vm.stopBroadcast();

        console2.log("==============================================");
        console2.log("Deployment Complete!");
        console2.log("==============================================");

        // Save deployment addresses
        _saveDeployment(
            address(crownToken),
            address(warriorsNFT),
            address(arenaFactory),
            address(predictionMarket),
            address(zeroGOracle),
            address(externalMarketMirror)
        );
    }

    function _saveDeployment(
        address crownToken,
        address warriorsNFT,
        address arenaFactory,
        address predictionMarket,
        address zeroGOracle,
        address externalMarketMirror
    ) private {
        string memory json = string(abi.encodePacked(
            '{\n',
            '  "chainId": 43113,\n',
            '  "network": "Avalanche Fuji Testnet",\n',
            '  "crownToken": "', _addressToString(crownToken), '",\n',
            '  "warriorsNFT": "', _addressToString(warriorsNFT), '",\n',
            '  "arenaFactory": "', _addressToString(arenaFactory), '",\n',
            '  "predictionMarket": "', _addressToString(predictionMarket), '",\n',
            '  "zeroGOracle": "', _addressToString(zeroGOracle), '",\n',
            '  "externalMarketMirror": "', _addressToString(externalMarketMirror), '"\n',
            '}'
        ));

        vm.writeFile("deployments/avalanche-testnet.json", json);
        console2.log("\nDeployment addresses saved to: deployments/avalanche-testnet.json");
    }

    function _addressToString(address _addr) private pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory data = abi.encodePacked(_addr);
        bytes memory str = new bytes(42);
        str[0] = '0';
        str[1] = 'x';
        for (uint i = 0; i < 20; i++) {
            str[2+i*2] = alphabet[uint(uint8(data[i] >> 4))];
            str[3+i*2] = alphabet[uint(uint8(data[i] & 0x0f))];
        }
        return string(str);
    }
}
```

#### Deployment Commands

```bash
# 1. Set environment variables (NO CHAINLINK_SUBSCRIPTION_ID needed!)
export DEPLOYER_PRIVATE_KEY=0x...
export AI_SIGNER_ADDRESS=0x...
export SNOWTRACE_API_KEY=...  # Optional, for verification

# 2. Deploy to Avalanche Fuji Testnet
forge script script/DeployAvalancheSimplified.s.sol:DeployAvalancheSimplified \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --broadcast \
  --verify \
  -vvvv

# 3. That's it! No VRF subscription setup needed.
```

---

### Phase 3: Frontend Updates (Week 2)

#### No VRF-Related Changes Needed!

The frontend changes remain the same as before, but **simpler**:

**File**: `frontend/src/constants.ts`

```typescript
// Just add Avalanche configuration
export type SupportedChainId = 545 | 16602 | 747 | 31337 | 43113 | 43114;

export const CONTRACT_ADDRESSES: Record<SupportedChainId, ContractAddresses> = {
  // ... existing chains

  43113: {
    crownToken: "0x...",  // From deployment
    warriorsNFT: "0x...",
    ArenaFactory: "0x...",
    // NO vrfOracle field!
    predictionMarket: "0x...",
    externalMarketMirror: "0x...",
    // ... rest of contracts
  },
};
```

**File**: `frontend/src/rainbowKitConfig.tsx`

```typescript
import { avalancheFuji, avalanche } from 'wagmi/chains';

const chains = [
  anvil,
  flowTestnet,
  flowMainnet,
  zeroGGalileo,
  avalancheFuji,  // ADD
  avalanche,      // ADD
] as const;
```

**File**: `frontend/.env.local`

```bash
# Add Avalanche RPC
NEXT_PUBLIC_AVALANCHE_TESTNET_RPC=https://api.avax-test.network/ext/bc/C/rpc
NEXT_PUBLIC_AVALANCHE_MAINNET_RPC=https://api.avax.network/ext/bc/C/rpc
NEXT_PUBLIC_AVALANCHE_CHAIN_ID=43113

# Switch default chain
NEXT_PUBLIC_CHAIN_ID=43113  # Now points to Avalanche
```

**Battle flow stays synchronous** - no async VRF handling needed!

---

## ✅ Updated Implementation Checklist

### Week 1: Smart Contracts & Deployment

**Day 1-2**: Refactor contracts to remove VRF
- [ ] Update Arena.sol - replace `_revertibleRandom()` with `_getRandomness()`
- [ ] Update ArenaFactory.sol - remove `_cadenceArch` parameter
- [ ] Update ExternalMarketMirror.sol - remove FlowVRF dependency
- [ ] Remove FlowVRFOracle.sol (no longer needed)
- [ ] Test locally with Foundry

**Day 3-4**: Create deployment scripts
- [ ] Write `DeployAvalancheSimplified.s.sol`
- [ ] Update `foundry.toml` with Avalanche endpoints
- [ ] Test deployment on local Anvil
- [ ] Deploy to Avalanche Fuji Testnet
- [ ] Verify contracts on SnowTrace

**Day 5**: Integration testing
- [ ] Test Arena battles on Fuji
- [ ] Test NFT minting
- [ ] Test prediction markets
- [ ] Test external market mirroring
- [ ] Verify randomness quality

### Week 2: Frontend & Production

**Day 6-7**: Frontend updates
- [ ] Add Avalanche to `constants.ts`
- [ ] Update `rainbowKitConfig.tsx`
- [ ] Update environment variables
- [ ] Test wallet connection
- [ ] Test all features on Fuji

**Day 8-9**: Final testing
- [ ] End-to-end battle testing
- [ ] Performance testing
- [ ] Gas optimization
- [ ] Security review

**Day 10**: Mainnet deployment
- [ ] Deploy to Avalanche C-Chain
- [ ] Verify contracts
- [ ] Update frontend to mainnet
- [ ] Monitor for 24 hours

---

## 💰 Updated Cost Analysis

### Development Costs
- Smart contract updates: **20 hours** (reduced from 40)
- Deployment scripts: **8 hours** (reduced from 16)
- Frontend updates: **16 hours** (reduced from 24)
- Testing: **16 hours** (reduced from 32)
- **Total: 60 hours** (53% reduction!)

### Deployment Costs

**Testnet**:
- Contract deployments: ~3 AVAX (~$120)
- Testing: ~1 AVAX (~$40)
- **Total: ~$160** (63% reduction!)

**Mainnet**:
- Contract deployments: ~6 AVAX (~$240)
- **Total: ~$240** (79% reduction!)

### Ongoing Costs
- **$0/month** for VRF (removed!)
- RPC infrastructure: $0 (public RPCs)
- **Total: $0/month** (100% reduction!)

---

## ⚠️ Randomness Security Considerations

### Block Hash Randomness Limitations

**What it protects against**:
✅ User manipulation
✅ Replay attacks
✅ Predictability for regular users

**What it doesn't protect against**:
❌ Miner/validator manipulation (can choose to skip block)
❌ Front-running attacks (randomness visible before execution)

### Risk Assessment for Your Use Case

**For Warriors AI-rena battles**:
- Bet amounts: 1-5 CRWN (moderate stakes)
- Attack cost: Would need to be validator + sacrifice block rewards
- Attack benefit: Win a single battle bet
- **Risk Level: LOW** (attack cost >> benefit)

**Verdict**: Block-based randomness is **perfectly acceptable** for your use case.

### If You Want Extra Security (Optional)

**Commit-Reveal Pattern**:
```solidity
// Round 1: Players commit hash of their move
function commitMove(bytes32 moveHash) external;

// Round 2: Players reveal actual move
function revealMove(uint256 move, bytes32 salt) external;

// System verifies: keccak256(move, salt) == moveHash
```

This prevents front-running but adds complexity. **Not recommended** unless stakes increase significantly.

---

## 🚀 Quick Start Commands

### Deploy to Avalanche Fuji Testnet

```bash
# 1. Get testnet AVAX
# Visit: https://faucet.avax.network

# 2. Set environment
export DEPLOYER_PRIVATE_KEY=0xyour_private_key
export AI_SIGNER_ADDRESS=0xyour_ai_signer_address

# 3. Deploy!
forge script script/DeployAvalancheSimplified.s.sol:DeployAvalancheSimplified \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --broadcast \
  -vvvv

# 4. Done! Check deployments/avalanche-testnet.json for addresses
```

### Update Frontend

```bash
# 1. Update environment
cd frontend
echo "NEXT_PUBLIC_AVALANCHE_CHAIN_ID=43113" >> .env.local
echo "NEXT_PUBLIC_CHAIN_ID=43113" >> .env.local

# 2. Update contract addresses in src/constants.ts
# (Copy from deployments/avalanche-testnet.json)

# 3. Run frontend
npm run dev
```

---

## 📊 Comparison: VRF vs Block-Based

| Feature | Chainlink VRF | Block-Based |
|---------|---------------|-------------|
| **Setup Complexity** | High | Low |
| **Implementation Time** | 3 weeks | 1-2 weeks |
| **Deployment Cost** | $430 + $1,150 | $160 + $240 |
| **Monthly Cost** | $300-400 | $0 |
| **Randomness Quality** | Excellent | Good |
| **Security Level** | Very High | Medium-High |
| **Latency** | 30 seconds | Instant |
| **Dependencies** | External oracle | None |
| **User Experience** | Async (complex) | Sync (simple) |
| **Suitable for Gambling** | Yes | Moderate stakes |

**For your use case**: Block-based is the **clear winner**.

---

## ✅ Success Criteria

### Technical
- [ ] All contracts deploy successfully
- [ ] Battles execute without errors
- [ ] Randomness is unpredictable to users
- [ ] No gas issues
- [ ] Frontend connects properly

### Security
- [ ] Randomness can't be manipulated by users
- [ ] No reentrancy vulnerabilities
- [ ] Access controls work correctly
- [ ] Emergency pause functional

### User Experience
- [ ] Battles complete instantly (no VRF wait)
- [ ] UI is responsive
- [ ] Wallet connection smooth
- [ ] Gas costs reasonable (<$2 per battle)

---

## 🆘 Support & Resources

### Avalanche
- **Testnet Faucet**: https://faucet.avax.network
- **Explorer**: https://testnet.snowtrace.io
- **RPC**: https://api.avax-test.network/ext/bc/C/rpc
- **Discord**: https://discord.gg/avalanche

### Development Tools
- **Foundry Docs**: https://book.getfoundry.sh
- **Solidity by Example**: https://solidity-by-example.org

---

## 📞 Next Steps

1. **Review this simplified approach**
2. **Confirm you're okay with block-based randomness**
3. **Start with Day 1 tasks** (refactor Arena.sol)
4. **Deploy to Fuji testnet**
5. **Test thoroughly**
6. **Deploy to mainnet**

**Ready to start implementation?** The approach is much simpler now without VRF!

---

**Document Version**: 2.0 (Simplified)
**Last Updated**: 2026-01-26
**Status**: Ready for Implementation
**Recommended Approach**: Block-based randomness (no VRF)