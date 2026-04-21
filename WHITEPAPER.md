# Warriors AI-rena

## A Whitepaper on Web3's First Interactive Spectator Sport

**Version 1.0 — April 2026**
**Deployed on Avalanche C-Chain | Fuji Testnet (43113) | Mainnet-ready (43114)**
**Live:** https://warriors-ai-rena.vercel.app

---

## Abstract

Warriors AI-rena is a fully on-chain AI battle arena that merges three distinct markets — competitive gaming, prediction markets, and spectator betting — into a single, self-sustaining product on Avalanche C-Chain. Users mint warrior NFTs with verifiably-generated traits, watch them compete in five-round battles decided by AI inference, and place CRwN-denominated bets on outcomes. Uniquely, spectators can actively **influence** or **defluence** warriors mid-battle via on-chain token spending — a mechanic no other game, betting platform, or NFT project has deployed. All AI decisions run through 0G Compute with cryptographic proofs; all battle data is stored on 0G decentralized storage; all economic state lives on Avalanche. The CRwN token is minted 1:1 against AVAX and burned 1:1 back, making it a utility asset with no inflation, no staking yield, and no death-spiral risk.

---

## 1. Introduction

### 1.1 The Problem

Three distinct failures plague on-chain entertainment products:

1. **Static NFTs.** Over 90% of NFT collections produce no ongoing utility after mint. Holders mint, view, list on OpenSea, lose interest. The asset is a JPEG with no economic activity.

2. **No spectator layer.** Sports, esports, and traditional betting markets thrive because they separate *participants* (players) from *spectators* (fans). Every crypto game conflates the two — either you play actively or you leave. There is no passive, entertaining way to engage with a live on-chain competition with real financial stakes.

3. **Repetitive gameplay.** Deterministic combat loops (Axie Infinity, CryptoFights) become predictable within 10 matches. Play-to-earn economies collapse because token emission outpaces utility, and winning becomes a math problem rather than a spectacle.

Outside crypto, the spectator-betting market is well-understood: DraftKings and FanDuel together processed over **$10B in wagers in 2023**, with most users watching on mobile and placing bets on games they do not play. The market is proven. It has simply never been combined with verifiable on-chain outcomes, dynamic spectator mechanics, and true asset ownership.

### 1.2 The Solution

Warriors AI-rena is **the ESPN of Web3**: an entertainment layer where AI-powered competitions happen every few minutes, where any wallet can bet without owning an NFT, where spectators can alter a live match by burning tokens, and where every trait, move, damage calculation, and payout is settled on-chain or cryptographically proven.

Four things happen in every battle:

1. Two warriors with signed, on-chain traits enter an arena contract.
2. Spectators place CRwN bets on either side during a 60-second betting window.
3. The game-master AI (running on 0G Compute with signed outputs) picks moves for both warriors across five rounds, 30 seconds apart.
4. Winnings are distributed on-chain: 95% to bettors on the winning side, 5% to the warrior's owner. The arena resets.

Between rounds, spectators may burn additional CRwN to `influenceWarriorsOne()` / `influenceWarriorsTwo()` (boost damage) or `defluenceWarriorsOne()` / `defluenceWarriorsTwo()` (reduce opponent damage). Each address may defluence once per battle — scarcity creates decision weight. These influence points modify damage calculations in the next round's `battle()` call.

---

## 2. System Architecture

### 2.1 High-Level Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Settlement | Avalanche C-Chain (43113 / 43114) | Arena contracts, CRwN token, NFT ownership, payouts |
| AI Inference | 0G Compute Network | Verifiable move selection with cryptographic proofs |
| Storage | 0G Storage Network | Battle history, warrior metadata, verified predictions |
| Frontend | Next.js 15 on Vercel | Real-time spectator UI, polling-based automation |
| Identity | RainbowKit + wagmi + viem | Multi-wallet connection |
| Automation | Vercel cron + client polling | Triggers `startGame()`, `battle()`, `finishGame()` |

### 2.2 Smart Contract Map

Sixteen contracts deployed, falling into four groups:

**Core economic contracts**
- `CrownToken.sol` — ERC-20, 1:1 AVAX-backed, mint/burn parity
- `WarriorsNFT.sol` — ERC-721 with five-stat trait struct, five signed moves, ranking enum
- `ArenaFactory.sol` — Deploys arena instances per rank; owns `makeNewArena()`
- `Arena.sol` — Battle engine per arena: betting, moves, damage, influence, payout

**Prediction market contracts**
- `PredictionMarketAMM.sol` — CPMM for yes/no markets
- `OutcomeToken.sol` — ERC-1155 prediction tokens
- `MarketFactory.sol` — User-created market deployment
- `ExternalMarketMirror.sol` — Polymarket / Kalshi data mirror
- `MicroMarketFactory.sol` — Per-round micro markets on battle outcomes

**AI agent contracts**
- `AIAgentRegistry.sol` — Agent metadata, staking tiers
- `AIAgentINFT.sol` — ERC-7857 intelligent NFT implementation
- `AIDebateOracle.sol` — Round scoring with signed AI verdicts
- `AILiquidityManager.sol` — Automated LP management

**Infrastructure**
- `CreatorRevenueShare.sol` — Royalty distribution for user-created content
- `PredictionArena.sol` — Debate arena for prediction markets

### 2.3 Battle Lifecycle

```
[1] User calls initializeGame(warrior1Id, warrior2Id)
    - Contract verifies: warriors different, rank matches arena, traits assigned
    - Sets isInitialized = true, betting period begins (60s)

[2] Spectators call betOnWarriorsOne(mult) or betOnWarriorsTwo(mult)
    - Each bet = mult * betAmount (fixed per arena tier)
    - CRwN transferred from spectator to arena contract
    - Addresses appended to playerOneBetAddresses / playerTwoBetAddresses

[3] Cron or UI polling calls startGame()
    - Requires: betting period elapsed AND bets on both sides
    - currentRound = 1, isBettingPeriod = false

[4] For each of 5 rounds, 30s apart:
    (a) Game master queries 0G Compute for move selection
    (b) Game master signs keccak256(abi.encodePacked(w1Move, w2Move))
    (c) Game master calls battle(w1Move, w2Move, signature)
    (d) Contract verifies signature against i_AiPublicKey
    (e) Damage calculation with trait mods + influence + defluence
    (f) Between rounds, spectators may call influence / defluence

[5] After round 5, battle() internally calls finishGame()
    - 5% of pool to warrior owner (cutOfWarriorsOneMaker)
    - 95% distributed pro-rata to winning bettors
    - Arena resets: isInitialized = false, ready for next battle
```

### 2.4 Damage Calculation

From `Arena.sol`:

```
baseDamage     = (attackerStrength * 5000) / 10000
defenceReduce  = min(defenderDefence / 125, 80)         // capped at 80%
influenceBonus = min(influencePoints * 10, 200)         // capped at +200%
defluenceRedux = min(defluencePoints * 5, 90)           // capped at -90%

damage = baseDamage
       * (100 - defenceReduce) / 100
       * (100 + influenceBonus) / 100
       * (100 - defluenceRedux) / 100
       * 2

damage = max(1, min(damage, 10000))
```

**Move modifiers** are additive on top:
- STRIKE: +25% damage scaling with Strength
- TAUNT: reduces opponent's next-round damage, scales with Charisma + Wit
- DODGE: success probability scales with Luck; full nullify on success
- SPECIAL: avg(Strength + Charisma + Wit); highest ceiling
- RECOVER: heal scaling with Defence + Charisma

**Move counter system**: STRIKE > TAUNT > DODGE > SPECIAL > RECOVER > STRIKE (rock-paper-scissors-lizard-spock). Counter multiplier 1.3x; countered multiplier 0.7x.

### 2.5 Verifiable AI Inference

Every move decision follows this path:

1. Game master API (`POST /api/game-master`) collects warrior traits, damage history, round number.
2. Prompt is sent to 0G Compute provider (`providerAddress` registered on 0G network).
3. Provider returns response + cryptographic proof containing `keccak256(prompt)` as `inputHash`, `keccak256(response)` as `outputHash`, and the provider's ECDSA signature.
4. The resulting move pair is hashed: `keccak256(abi.encodePacked(uint8 w1Move, uint8 w2Move))`.
5. Game master signs the hash with the AI signer key; the `Arena` contract verifies `ECDSA.recover(signedMessage, sig) == i_AiPublicKey`.
6. On failure, a deterministic trait-based fallback generates moves — ensuring the game never halts.

This design gives every battle a complete, independently-verifiable audit trail: which provider computed the moves, what prompt produced them, what hash was signed, and what address signed it.

---

## 3. Token Economics

### 3.1 CRwN (Crown Token)

CRwN is a utility token with three properties:

- **Minted 1:1 against AVAX.** `mint(uint256 amount) payable` requires `msg.value == amount`. No pre-mint, no vesting, no team allocation.
- **Burned 1:1 back to AVAX.** `burn(uint256 amount)` transfers the underlying AVAX to the burner. The contract's AVAX balance always equals `totalSupply()`.
- **No yield, no staking, no inflation.** CRwN is not a security in any sensible reading — it is a stable medium of exchange for in-game actions, redeemable at parity.

This design is deliberately **boring**. There is no APY, no reflection, no lock-up. Users buy CRwN to *use*, not to hold. The utility — betting, influence, defluence — creates demand without requiring speculation.

### 3.2 Flow of Value

```
AVAX  ──[mint]──>  CRwN  ──[bet]──>  Arena pool
                                         │
                            ┌────────────┴────────────┐
                            │                         │
                         [win]                      [lose]
                            │                         │
                     95% to bettors            0% (forfeited)
                      5% to warrior owner
                            │
                            ▼
                     CRwN  ──[burn]──>  AVAX
```

CRwN spent on `influence()` / `defluence()` stays in the arena contract and is absorbed into the next battle's prize pool. This creates natural deflationary pressure on *held* CRwN (the pool grows) without shrinking the total supply.

### 3.3 Four Active Revenue Streams

| Stream | Mechanism | Rate |
|--------|-----------|------|
| Battle betting fee | 5% of each battle's pool routed to warrior owner | 500 BPS |
| Influence cost | CRwN burned per influence action, set at arena tier | 1×–5× base |
| Defluence cost | CRwN burned per defluence action (once per player per battle) | 1×–5× base |
| NFT mint gas | Network fee on `mintNft()` + `assignTraitsAndMoves()` | Variable |

### 3.4 Five Future Revenue Streams (Infrastructure Built)

| Stream | Status | Contract |
|--------|--------|----------|
| Tournament entry fees | Leaderboard infra shipped | via `WarriorsNFT.s_winnings` |
| Creator revenue share | Contract live on Fuji | `CreatorRevenueShare.sol` |
| Premium cosmetics | Planned | Extension to `WarriorsNFT.s_moves` |
| Sponsored battles | Planned | Custom `Arena` instances via `makeNewArena()` |
| Secondary royalties | Planned | ERC-2981 extension |

### 3.5 Arena Tiers and Cost Scaling

Five rank-tiered arenas exist, each with linearly scaled costs:

| Rank | Bet Amount | Influence | Defluence |
|------|-----------|-----------|-----------|
| UNRANKED | 1 CRwN | 1 CRwN | 1 CRwN |
| BRONZE | 2 CRwN | 2 CRwN | 2 CRwN |
| SILVER | 3 CRwN | 3 CRwN | 3 CRwN |
| GOLD | 4 CRwN | 4 CRwN | 4 CRwN |
| PLATINUM | 5 CRwN | 5 CRwN | 5 CRwN |

Warriors promote between tiers by accumulating winnings. The constant `TOTAL_WINNINGS_NEEDED_FOR_PROMOTION = 1 ether` applies per tier cumulatively.

---

## 4. The Warrior NFT

### 4.1 Trait Schema

```solidity
struct Traits {
    uint16 strength;   // 0–10,000 (2-decimal precision, max 100.00)
    uint16 wit;
    uint16 charisma;
    uint16 defence;
    uint16 luck;
}

struct Moves {
    string strike;
    string taunt;
    string dodge;
    string special;
    string recover;
}
```

Traits are generated off-chain by 0G Compute, then signed by the AI signer key and submitted on-chain via `assignTraitsAndMoves(tokenId, str, wit, cha, def, luck, strike, taunt, dodge, special, recover, signedData)`. The contract verifies:

```solidity
bytes32 dataHash = keccak256(abi.encodePacked(
    _tokenId, _strength, _wit, _charisma, _defence, _luck,
    _strike, _taunt, _dodge, _special, _recover
));
bytes32 ethSignedMessage = MessageHashUtils.toEthSignedMessageHash(dataHash);
address recovered = ECDSA.recover(ethSignedMessage, _signedData);
require(recovered == i_AiPublicKey, "WarriorsNFT__InvalidSignature");
```

Once assigned, traits are locked. The NFT becomes immutable, its combat identity permanent.

### 4.2 Ranking and Promotion

```
UNRANKED → BRONZE → SILVER → GOLD → PLATINUM
```

Promotion happens via `promoteNFT(tokenId)` once the warrior has accumulated enough winnings. Demotion is possible via `demoteNFT(tokenId)` (currently DAO-restricted).

### 4.3 Metadata and Ownership

- `getEncryptedURI(tokenId)` returns a 0G Storage URI containing image + extended metadata.
- `getNFTsOfAOwner(address)` returns all tokens owned by an address.
- `getWinnings(tokenId)` returns cumulative CRwN won in battles.
- `transfer(from, to, tokenId, sealedKey, proof)` implements ERC-7857-style transfer with re-encrypted strategy keys (for AIAgentINFT derivative).

---

## 5. Game Master and Automation

### 5.1 Three Automation Layers

The app uses three independent layers to ensure battles always progress:

1. **Vercel cron** (`/api/cron/game-loop`) — Fires on a schedule. Enumerates all arenas, detects which need `startGame()` or `battle()`, and calls the game-master route.
2. **Client polling** (every 2 seconds in `arena/page.tsx`) — When a user is actively watching, polls `/api/arena/commands?battleId=...` for pending actions, then invokes `handleStartGame()` or `handleNextRound()` which delegate to the game-master.
3. **Manual override** (START BATTLE button) — If automation fails, the user can trigger the game-master manually via an arena-modal button.

All three routes converge on the same game-master endpoint, which is the single authority for on-chain signing.

### 5.2 Security of the AI Signer Key

The AI signer key is stored as `AI_SIGNER_PRIVATE_KEY` in Vercel's encrypted environment. The key never enters the frontend bundle — all signing happens in serverless functions. The public address (`i_AiPublicKey`) is immutably set at `WarriorsNFT` and `Arena` constructor time, so any key rotation requires contract redeployment.

---

## 6. 0G Integration

### 6.1 0G Compute

All AI inference — move selection, trait generation, debate arguments — runs on 0G Compute. The integration uses the OpenAI SDK as a transport layer pointing to 0G provider endpoints. Responses come paired with a proof struct:

```typescript
interface InferenceProof {
  inputHash: string;        // keccak256(prompt)
  outputHash: string;       // keccak256(response)
  providerAddress: string;  // 0G provider's wallet
  modelHash: string;        // Model identifier
  signature: string;        // Chat session ID
  attestation?: string;     // TEE attestation (optional)
}
```

Graceful degradation: if 0G is unreachable, a deterministic trait-based fallback selects moves from a weighted mapping of trait → optimal move. Battles never halt.

### 6.2 0G Storage

Battle results, warrior metadata, and verified predictions are stored on 0G Storage. Each record is content-addressed via a Merkle-tree root hash. The in-memory adapter in `frontend/src/lib/0g/store.ts` provides a Prisma-compatible API on top, so the app has a full CRUD surface without a centralized database.

---

## 7. Security Model

### 7.1 On-Chain

- **Reentrancy guards** on `mint`, `burn`, and all payout functions.
- **ECDSA verification** on every trait assignment and every battle move.
- **Time locks** — betting period (60s) and round intervals (30s) prevent griefing.
- **One-shot defluence** per player per battle, enforced by mapping.
- **Ranking-locked arenas** prevent cross-tier exploitation.
- **OpenZeppelin Ownable** on factory-level admin functions.

### 7.2 Off-Chain

- Private keys live exclusively in Vercel encrypted env; never in the client bundle or git history.
- Game master signatures are narrow: they sign only the move pair for a specific arena round, not arbitrary data.
- Rate limiting (via `applyRateLimit`) on every public API route.
- Content moderation: AI move selection is constrained to five enum values; no freeform text reaches the chain.

### 7.3 Economic

- **1:1 AVAX backing** eliminates death-spiral scenarios. Even if everyone burns CRwN simultaneously, the contract holds enough AVAX to redeem.
- **No leverage, no loans, no liquidations.** Bets are fully collateralized in CRwN.
- **Influence costs escalate** dynamically to prevent whale domination of a single round.

---

## 8. Roadmap

### Phase 1 — The Arena (now → 6 months)

- Avalanche mainnet deployment
- 1000+ weekly active spectators
- 50+ daily battles
- Mobile PWA
- Auto-generated battle highlight clips
- Discord community + weekly tournaments

### Phase 2 — The Colosseum (6–12 months)

- 8/16/32-bracket tournaments with weekly prize pools
- Embeddable live battle viewer (for external sites)
- Warrior marketplace with performance-priced floors
- Team battles (3v3)
- Spectator chat during matches

### Phase 3 — The Kingdom (12–24 months)

- Full prediction market integration (Polymarket / Kalshi)
- ERC-7857 AI agent iNFTs with encrypted strategies
- Creator arenas (themed, user-deployed)
- Copy trading (follow whales / AI agents auto-mirror)
- Avalanche L1 subnet with CRwN as native gas

### Phase 4 — The Empire (24–36 months)

- Multi-game platform (racing, strategy, trivia)
- Official esports league with brand sponsors
- Enterprise API for gamified prediction markets
- Full DAO governance over protocol parameters

---

## 9. Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Regulatory classification as gambling | High | Testnet-first launch; geo-fence; CRwN positioned as pure utility; legal counsel pre-mainnet |
| Smart contract vulnerability | Critical | Full audit pre-mainnet; bug bounty; timelock; upgradeable proxies for non-core contracts |
| AI inference outage | Medium | Trait-based deterministic fallback ensures battle continuity |
| Low initial liquidity | Medium | Bootstrap pools from treasury; creator incentives; fewer-but-deeper markets in Phase 1 |
| No product-market fit | Critical | Kill criterion: <50 weekly active battlers after 6 weeks of open beta → pivot or sunset |

---

## 10. Conclusion

Warriors AI-rena is not another NFT project, prediction market, or play-to-earn game. It is an attempt to build the spectator layer that on-chain entertainment has lacked since its inception — a place where tens of thousands of users can passively enjoy unique AI-generated competitions, actively shape outcomes with small token stakes, and participate in a stable, verifiable economy without needing to understand the underlying cryptography.

The contracts are live. The economic loop is closed. The product works end-to-end today on Avalanche Fuji, with one environment variable separating us from mainnet. We invite builders, bettors, and warriors to step into the arena.

---

**Contracts — Avalanche Fuji Testnet (43113)**

| Contract | Address |
|----------|---------|
| CrownToken | `0xF0011ca65e3F6314B180a8848ae373042bAEc9b4` |
| WarriorsNFT | `0x218d3efaB076bd03E278CDCf3B488AA107215b8a` |
| ArenaFactory | `0xe9faCA292CEF42489AF4d20266964Fb6425AE122` |
| PredictionMarketAMM | `0xeBe1DB030bBFC5bCdD38593C69e4899887D2e487` |
| AIAgentINFT | `0xbAE259eeA7fd49F631dE44Ac8d4fd2eb6C7F8Cb8` |
| PredictionArena | `0xE80C2eaDf7B4d0e2acD51a475c1a2ED4134D4Ad5` |
| ExternalMarketMirror | `0x1cfa9eD162f90B1eD6d9A01c504fFc28B7412473` |

**Explorer:** https://testnet.snowtrace.io
**Live product:** https://warriors-ai-rena.vercel.app
**Repository:** https://github.com/kaustubh76/Build-Games
