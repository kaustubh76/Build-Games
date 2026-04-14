# Warriors AI-rena — Go-to-Market Submission

> **Web3's First Interactive Spectator Sport**
> Mint AI warriors. Watch them battle. Bet on outcomes. Influence the fight in real-time.

| | |
|---|---|
| **Live Product** | https://warriors-ai-rena.vercel.app/ |
| **Chain** | Avalanche C-Chain — Fuji Testnet (Chain ID 43113) |
| **Contracts Deployed** | 12 smart contracts |
| **API Routes** | 69 endpoints (66 App Router + 3 Pages Router) |
| **Database Models** | 23+ Prisma models |
| **Status** | Functional MVP — not a mockup, not a pitch deck |

---

## Table of Contents

1. [Long-Term Vision](#1-long-term-vision)
2. [Milestones & Roadmap](#2-milestones--roadmap)
3. [User Acquisition & Channels](#3-user-acquisition--channels)
4. [Community Building & Engagement](#4-community-building--engagement)
5. [Revenue & Monetization](#5-revenue--monetization)
6. [Competitive Analysis](#6-competitive-analysis)
7. [Appendix: Contracts, Tech Stack & Metrics](#7-appendix)

---

## 1. Long-Term Vision

**We're building the ESPN of Web3 — the entertainment layer where AI-powered competitions happen, spectators engage with real financial stakes, and anyone can watch, bet, and influence outcomes from their phone.**

In 3 years, we see ourselves as the platform that answered the question *"why would a normal person care about on-chain gaming?"* — by making it a spectator sport.

### The Core Insight

Every successful entertainment platform has spectators AND participants. Sports have fans who watch AND bet. Esports have viewers who watch AND predict. But in Web3 gaming, spectators don't exist — you either play or you don't.

**Warriors AI-rena creates Web3's first spectator sport** — where anyone can watch AI battles, bet on outcomes, and actively influence the fight in real-time.

### The 4-Phase Arc

#### Phase 1: "The Arena" — Now to 6 Months

**Goal:** Establish Warriors AI-rena as the most entertaining spectator betting experience in Web3.

What's already shipped:
- Full AI battle engine: 5-round debate with 5 combat moves (STRIKE, TAUNT, DODGE, SPECIAL, RECOVER)
- Rock-paper-scissors counter system (1.3x counter bonus / 0.7x countered penalty)
- 5 trait modifiers: Strength (+25%), Wit (+20%), Charisma (+15%), Defence (-20% damage reduction), Luck (+10%)
- Scoring on 0-1000 scale with Elo ratings (K-factor=32, minimum rating 100)
- Spectator betting with 5% fee on winnings (closes after round 2)
- Influence/defluence — spectators spend CRwN to boost/weaken warriors between rounds via smart contract calls, with dynamically escalating costs
- CRwN token: 1:1 AVAX-backed via mint/burn (no inflation, no death spiral)
- Gamification: 23 achievements, 11-quest daily pool, streak system, XP progression
- Warrior ranking: Unranked → Bronze → Silver → Gold → Platinum

Next 6 months: Mainnet launch, 2,000+ weekly active spectators, 50+ daily battles, mobile PWA.

#### Phase 2: "The Colosseum" — 6 to 12 Months

**Goal:** Competitive infrastructure and expanded spectator experience.

- Tournament mode: 8/16/32 warrior brackets with escalating prize pools
- Live streaming integration: embeddable battle viewer for Twitch/YouTube
- Warrior marketplace: buy/sell warriors where battle histories determine value
- Battle replays and auto-generated highlight reels
- Team battles (3v3)
- Spectator chat during live battles

Target: 10,000+ weekly active users, weekly tournaments with $1K+ prize pools.

#### Phase 3: "The Kingdom" — 12 to 24 Months

**Goal:** Platform expansion — let others build on the arena infrastructure.

Infrastructure already built (contracts deployed, not yet user-facing):
- Mirror markets via ExternalMarketMirror contract (`createMirrorMarket()`, `tradeMirror()`)
- ERC-7857 AI Agent iNFTs with encrypted strategies and copy trading (`vrfCopyTrade()` with VRF randomization)
- Whale tracking (10 API routes tracking Polymarket/Kalshi activity)
- Creator arenas with tiered revenue sharing (Creator Revenue Share contract deployed)

This phase activates it all: prediction market integration, creator arenas, copy trading, Avalanche L1 subnet with CRwN as gas token.

Target: 50,000+ MAU, $5M+ monthly betting volume, 100+ creator arenas.

#### Phase 4: "The Empire" — 24 to 36 Months

**Goal:** Become the entertainment layer for on-chain prediction and competition.

- Multi-game platform: the spectator betting + influence engine becomes infrastructure for new game types (racing, strategy, trivia)
- Official esports league with seasons and sponsors
- Enterprise API for gamified prediction markets
- Full DAO governance

Target: 100K+ MAU.

### The 10-Year North Star

*"Warriors AI-rena becomes the platform where AI-powered competitions happen and real value flows through entertainment — accessible to anyone with a phone and an internet connection."*

---

## 2. Milestones & Roadmap

| Period | Key Milestones |
|--------|---------------|
| **Completed (Mar 2026)** | 12 smart contracts deployed on Avalanche Fuji. 69 API routes. 23+ Prisma database models. Full AI battle engine: 5-round debate, 5 moves, counter system (1.3x/0.7x multipliers), 5 trait modifiers (Strength/Wit/Charisma/Defence/Luck on 0-10,000 precision), scoring to 1000, Elo (K=32, min 100). Spectator betting: 5% fee on winnings (`BETTING_FEE_BPS = 500`), closes after round 2. Influence/defluence on-chain mechanics with dynamic cost escalation (4 cost parameters per arena). CRwN token: 1:1 AVAX mint/burn, ERC-20. Game Master signature verification: `encodePacked` + `keccak256` hash + ECDSA → `assignTraitsAndMoves()` on-chain. 0G Storage for verifiable battle data (SHA256 hashes). Gamification: 23 achievements (5 rarities: Common 25XP to Legendary 500XP), 11-quest pool (4 selected daily, seeded random for consistency), streak system, XP. Warrior ranking: Unranked/Bronze/Silver/Gold/Platinum (on-chain via `getRanking()`). 2 warriors minted and activated on-chain with AI-generated traits. |
| **Q3 2026** | **Mainnet deployment**: CRwN, WarriorsNFT, ArenaFactory, PredictionArena on Avalanche C-Chain. Smart contract audit + community bug bounty. "The Grand Arena Opens" 3-day launch event with escalating prize pools. Press campaign: CoinDesk, The Block, Decrypt. Avalanche ecosystem partnerships (Joepegs/Campfire for warrior trading). Mobile-responsive PWA. Battle replays + auto-generated highlight reels. **Target: 500 active users week 1, 2,000+ weekly active spectators.** |
| **Q4 2026 - Q1 2027** | Tournament mode (8/16/32 brackets, $1K+ weekly prizes). Spectator chat. Warrior marketplace (battle-history pricing). Team battles (3v3). Streaming integration (embeddable Twitch/YouTube battle viewer). Activate mirror market integration (ExternalMarketMirror to Polymarket/Kalshi). Launch copy trading + whale alerts. **Target: 10K weekly active users, $1M monthly CRwN volume.** |
| **Q2-Q4 2027** | Creator arenas (anyone deploys themed arenas). AI Agent iNFT marketplace (ERC-7857). Avalanche L1 subnet evaluation (CRwN as gas token). Cross-chain warriors. DAO governance. SDK for third-party integrations. **Target: 50K MAU, $5M+ monthly volume, 100+ creator arenas.** |

---

## 3. User Acquisition & Channels

### Strategy: The Product IS the Marketing

Every battle generates content that drives the next user. Zero-CAC virality is built into the core loop.

### Conversion Funnel

```
Watch a battle (FREE, no wallet needed)
    |
    v
Hooked by AI narrative + influence drama
    |
    v
Connect wallet, get testnet CRwN (zero cost)
    |
    v
Place first bet (open rounds 1-2, closes after round 2)
    |
    v
Use Influence to boost their pick (CRwN spent, cost escalates per use)
    |
    v
Win (or exciting loss)
    |
    v
Share on Twitter: "My warrior clutched a 3-2 comeback!"
    |
    v
Friends click link --> Watch a battle --> LOOP REPEATS
```

**The key insight:** Spectating is FREE. No wallet needed to watch. Zero barrier to first experience — lower than any competitor in the category.

### Channels (Ranked by Priority)

| # | Channel | Strategy | CAC | Priority |
|---|---------|----------|-----|----------|
| 1 | **Battle clip virality** | 30-60s battle highlights for TikTok/YouTube Shorts/Twitter. Focus on dramatic moments: counter-move comebacks (TAUNT countering STRIKE at 1.3x in round 5), influence swings that flip outcomes, upset victories. The influence mechanic creates "I changed the outcome" stories — the most viral content type. | $0 | Highest |
| 2 | **Discord community** | Strategy discussion ("Should I TAUNT or SPECIAL against high-Defence?"), warrior showcases, matchup analysis, feedback loop. 4 daily quests keep members active. | $0 | Highest |
| 3 | **Crypto Twitter** | Daily battle results, leaderboard updates, "Warrior of the Week" (highest Elo climb), influence highlight clips. Tag Avalanche ecosystem. Winners brag, losers want revenge — natural engagement loop. | $0 | High |
| 4 | **Avalanche ecosystem** | Hackathon exposure, ecosystem page listing, community calls, Summit presentations. Native Avalanche dApp — 12 contracts on Fuji. | $0 | High |
| 5 | **Content creator seeding** | Send 20 crypto/gaming YouTubers pre-minted Genesis warriors + battle tutorial. They activate traits (Game Master signs), battle on-stream with audience betting. Viewers mint their own. | $0-5 | Medium |
| 6 | **Referral program** | "Recruit a Warrior" — referrer gets bonus CRwN + exclusive cosmetic when referee completes first battle. Both sides incentivized. | $2-5 | Medium |
| 7 | **Sports betting communities** | Primary persona is "The Spectator Bettor" from the $10B+ sports betting market. Pitch: "Imagine you could spend tokens to boost your team mid-game. That's what Influence does." Reddit betting subs, Discord betting servers. | $0-3 | Medium |
| 8 | **Paid social** | Twitter/Reddit ads targeting "crypto gaming", "NFT battles", "AI gaming" — only after product-market fit confirmed on testnet. | $15-30 | Low (Phase 3+) |

### Why This Works

- Battles are inherently shareable (dramatic AI narratives, comebacks, upsets)
- Influence creates "I changed the outcome" stories (best viral content)
- Spectating is FREE — zero barrier to first experience
- Every battle creates a winner who wants to brag and a loser who wants revenge
- The competitive Elo system + leaderboard rankings create aspirational content

### Network Effects

1. **Spectator liquidity effect** — More spectators betting -> bigger prize pools -> more attractive battles -> attracts more spectators
2. **Warrior reputation effect** — More battles -> warriors develop reputations (W/L records, Elo ratings) -> spectators have more data to bet on -> better experience -> more spectators

---

## 4. Community Building & Engagement

### Discord (Core Hub)

| Channel | Purpose |
|---------|---------|
| `#arena-battles` | Live battle notifications, results, upset alerts. Auto-posted when low-rated warriors upset high-rated opponents. |
| `#warrior-showcase` | Users share warrior creations with backstories. Community votes "Warrior of the Week." |
| `#strategy-talk` | Matchup analysis: "High-Strength warriors are vulnerable to TAUNT-heavy opponents (TAUNT counters STRIKE at 1.3x)." Influence timing discussion. Betting odds analysis. |
| `#feedback` | Direct product input. Top 3 user complaints fixed weekly. Users see their feedback ship. |
| Role-gated access | Alpha testers get exclusive roles — creates status and FOMO. |

### Appointment Viewing

3 arena battles per day at set times during alpha — like TV schedules. Community votes on matchups before each battle. "Prime Time Battles" at peak hours with bigger stakes. Creates habitual engagement and social anticipation.

### Weekly Tournaments

"Battle of the Titans" — 8 warrior bracket format, community bets, streamed on Discord. Recurring events create storylines: rivalries, underdogs, dynasties. Each tournament generates shareable content (bracket results, clutch moments, influence plays).

### Gamification System (Shipped and Operational)

#### Daily Quests

4 quests selected daily from an 11-quest pool across 8 types. Selection is deterministic per day (seeded random by date for consistency). Resets at midnight UTC.

| Difficulty | Examples | Rewards |
|-----------|---------|---------|
| **Easy** | Complete 3 trades, Win 2 trades, Follow an AI agent, Watch 3 battles | 20-40 XP |
| **Medium** | Complete 5 trades, Win 3 trades, Copy trade from an agent, Add liquidity | 35-60 XP |
| **Hard** | Earn 100 CRwN profit, Win 5 trades, Trade 500 CRwN volume | 75-100 XP + 10-20 CRwN bonus |

#### 23 Achievements (5 Rarities)

| Rarity | XP | Example Achievements |
|--------|-----|---------------------|
| **Common** (25 XP) | 25 | First Blood (1 trade), Hot Hand (3-win streak), First Fortune (100 CRwN profit), Apprentice (1 copy trade) |
| **Uncommon** (50 XP) | 50 | Market Warrior (10 trades), Winning Streak (5 wins), Gold Hoarder (1K CRwN), Network Builder (follow 5 agents), Early Bird, Night Owl |
| **Rare** (100 XP) | 100 | Battle Hardened (50 trades), Unstoppable (10-win streak), Treasure Hunter (5K CRwN), Copy Master (25 copy trades), Liquidity Provider, Dedicated Warrior (7-day login) |
| **Epic** (250 XP) | 250 | Arena Champion (100 trades), Crypto Whale (25K CRwN profit), Arena Veteran (30-day login) |
| **Legendary** (500 XP) | 500 | Trading Legend (500 trades), Legendary Streak (20 wins), Market Mogul (100K CRwN), Lucky Seven (win with exactly 7.77% profit — hidden) |

5 categories: Trading (5), Streaks (4), Profits (5), Social (4), Special (5 — includes 3 hidden achievements).

#### Warrior Ranking & Elo System

| Component | Detail |
|-----------|--------|
| **On-chain ranking** | Unranked -> Bronze -> Silver -> Gold -> Platinum (set via `getRanking()` on WarriorsNFT contract) |
| **Elo rating** | Standard chess Elo: K-factor = 32, minimum rating = 100. Separate calculation for wins and draws. |
| **Leaderboard** | Sortable by: `arenaRating` (desc), `wins` (desc), `totalEarnings` (desc). Rate-limited at 60 req/min. |
| **Tracked stats** | totalBattles, wins, losses, draws, totalEarnings, avgScore, currentStreak, longestStreak, arenaRating, peakRating, categoryStats (JSON) |

#### Streak System

Consecutive daily logins multiply quest rewards. Visual flame indicator in header. Loss aversion psychology drives daily returns.

### Genesis Warriors Program

First 100 warriors minted on testnet get a permanent "Genesis" badge + mainnet whitelist. Creates early adopter identity, scarcity, and FOMO. Genesis warriors will be recognizable forever in the arena.

### User Feedback Loop

- In-app feedback button
- Weekly 15-min user interviews (5 users/week)
- Post-first-battle survey
- Target: 50 qualitative responses, NPS > 30
- Top 3 user complaints fixed weekly — demonstrating the community shapes the product

### Future: DAO Governance

Community governs battle rules (move balance, influence cost curves), fee structure, feature priorities, and market curation. Transition from builder-led to community-owned platform decisions.

---

## 5. Revenue & Monetization

### Principle: Revenue From Entertainment, Not Speculation

Every dollar of revenue comes from someone having fun. No ponzinomics. No inflationary token. No death spiral.

### 4 Active Revenue Streams (Implemented in MVP)

#### 1. Battle Betting Fees — 5% on Winnings

```
Payout calculation (from /api/arena/betting):

WIN:
  share = (betAmount * 10^18) / winningPool
  winnings = (losingPool * share) / 10^18
  fee = (winnings * 500) / 10000        // 5% fee on WINNINGS only
  payout = betAmount + winnings - fee

DRAW:
  fee = (betAmount * 500) / 10000        // 5% fee on refund
  payout = betAmount - fee

LOSS:
  payout = 0
```

- `BETTING_FEE_BPS = 500` (500 basis points = 5%) — verified in PredictionArena ABI
- Fee applied on winnings from the losing pool, NOT on the principal bet
- Betting opens when battle starts, **closes after round 2** (enforced: `if (battle.currentRound > 2)`)
- Implemented in both on-chain (ArenaFactory `betOnWarriorsOne/Two`) and database-tracked (Prediction Arena API)
- Atomic database transactions ensure pool integrity

**Projected Year 1: $100K-300K**

#### 2. Influence/Defluence Costs

- CRwN spent to boost (influence) or weaken (defluence) warriors between rounds
- 4 separate cost parameters per arena: `costToInfluenceWarriorsOne`, `costToInfluenceWarriorsTwo`, `costToDefluenceWarriorsOne`, `costToDefluenceWarriorsTwo`
- Costs **dynamically escalate** — each use multiplies the cost, creating a game-theory auction
- Smart contract functions: `influenceWarriorsOne()`, `influenceWarriorsTwo()`, `defluenceWarriorsOne()`, `defluenceWarriorsTwo()` on ArenaFactory

**Projected Year 1: $50K-150K**

#### 3. NFT Minting Fees

- Gas + CRwN cost for warrior minting and trait activation
- Game Master signature verification on-chain via `assignTraitsAndMoves()`

**Projected Year 1: $20K-50K**

#### 4. CRwN Exchange Spread (Tunable)

- Currently 1:1 AVAX-to-CRwN with no spread
- Tunable parameter — can add 0.1-0.5% spread as usage scales
- Revenue lever available when needed

**Projected Year 1: $30K-80K**

### 5 Future Revenue Streams (Infrastructure Built)

| Stream | Evidence of Infrastructure | Potential |
|--------|--------------------------|-----------|
| **Tournament entry fees** | Leaderboard + Elo system operational, bracket format validated in "Battle of the Titans" | $50K-100K |
| **Creator arena fees** | Creator Revenue Share contract deployed (`0x05Ca49f32B...`), creator tier system built (bronze to diamond with `getTierBonusRate()`), fee recording API live (`/api/creator/record-fee`) | $50K-100K |
| **NFT secondary royalties** | 2.5% on warrior resales via marketplace integration | $20K-50K |
| **Sponsored battles** | Brand-sponsored featured battles (e.g., "The Avalanche Cup") | $50K-200K |
| **Premium cosmetics** | Visual warrior upgrades with no gameplay impact | $30K-80K |

### CRwN Token Economics — Stable, Not Speculative

**CRwN is a utility token, NOT a speculative asset.**

| Property | Detail |
|----------|--------|
| **Mint** | `mint(to, amount)` — payable. Send AVAX, receive equal CRwN. Always. |
| **Burn** | `burn(amount)` / `burnFrom(account, amount)` — destroy CRwN, receive AVAX. Always. |
| **Backing** | 1:1 AVAX. Not a reserve — actual mint/burn parity enforced by smart contract. |
| **Inflation** | None. Zero staking rewards. Zero yield farming. Zero liquidity mining. |
| **Death spiral risk** | Impossible. CRwN is always redeemable for AVAX at 1:1. |
| **Value driver** | Utility: betting, influence, minting. Users buy CRwN to USE it. |

**Why this matters:**
- New users aren't scared of a volatile game token
- No "when token pump?" community — users focus on gameplay
- Sustainable economy from day 1 (no death spiral like Axie's SLP)
- Aligns with Avalanche Product Strategy: solve real problems, don't create artificial incentive loops

### Unit Economics

| Metric | Conservative | Optimistic |
|--------|-------------|-----------|
| CAC (blended) | $8 | $3 |
| LTV (active bettor, 6 months) | $40 | $120 |
| **LTV/CAC ratio** | **5x** | **40x** |
| Revenue per active user/month | $3 | $15 |
| AI cost per battle | $0.01-0.05 | $0.01-0.05 |

**Revenue model at scale:**
At 100 battles/day with average 10 CRwN wagered per battle:
- Betting fee revenue: ~$182/day = **$66K/year** (betting fees alone)
- Add influence + minting + spread: **$100K-250K/year**
- At 1,000 battles/day: **$660K-2.5M/year**

---

## 6. Competitive Analysis

### Competitor 1: AI Arena (Arbitrum)

AI-powered fighting game. Users train neural network fighters. VC-funded ($5M+). First-mover in AI gaming.

| Dimension | AI Arena | Warriors AI-rena |
|-----------|----------|-----------------|
| **Accessibility** | Requires ML knowledge to train fighters. Steep learning curve. | AI generates traits automatically. Set name, bio, adjectives -> Game Master signs -> warrior ready. Zero ML knowledge. |
| **Spectator experience** | No spectator betting. No way to watch and wager on someone else's fight. | **Spectator-first.** Any wallet calls `placeBet()` without owning a warrior. Betting open rounds 1-2. |
| **Audience participation** | None. Spectators are completely passive. | **Influence/Defluence** — novel on-chain mechanic. `influenceWarriorsOne()` / `defluenceWarriorsOne()` with dynamically escalating costs. No other platform lets spectators alter a live competitive event through smart contract calls. |
| **Battle uniqueness** | AI models produce similar outputs over time. Repetitive. | Every battle: unique AI arguments, 5 moves with counter system (1.3x/0.7x), trait-based scoring to 1000. Same warriors fighting twice = completely different battles. Infinite content. |
| **Economy** | Custom speculative game token. | CRwN 1:1 AVAX mint/burn. No inflation. No death spiral. Mathematically impossible to collapse. |
| **Chain** | Single-chain (Arbitrum). | Avalanche C-Chain — sub-second finality, lower gas, dedicated gaming ecosystem. |

### Competitor 2: Rollbit (Crypto Casino)

$1B+/month volume. Crash games, slots, sports betting, NFT battles. Slick UX.

| Dimension | Rollbit | Warriors AI-rena |
|-----------|---------|-----------------|
| **Fairness** | Casino — house always wins. Opaque RNG. | **Player-vs-player.** Battle data hashed to 0G Storage (verifiable). Traits cryptographically signed by Game Master + verified on-chain via `assignTraitsAndMoves()`. Every battle auditable. |
| **Skill** | Pure chance. Zero strategy. | Trait-based scoring (5 traits x 5 moves x counter relationships = deep strategy). Influence timing matters. Real strategic depth. |
| **Interaction** | Place bet, watch spin. Zero interaction post-bet. | **Active participation throughout.** Bet rounds 1-2. Influence/defluence between rounds. Watch 5 rounds of AI narrative. React to scoring swings. 10-minute experience, not 10-second spin. |
| **NFT utility** | Decorative NFTs with no gameplay function. | Warriors: ERC-721 with on-chain traits, battle history, Elo ratings (K=32), streaks, rankings (Unranked to Platinum). NFT earns its value through performance. |
| **Economy** | House takes mathematical edge on every bet. | 5% fee on winnings only (not principal). Winners profit. Sustainable because fee comes from entertainment value, not mathematical exploitation. |

### Competitor 3: Axie Infinity (Pioneer P2E)

Had 2M+ players at peak. NFT battle creatures. Economy collapsed.

| Dimension | Axie Infinity | Warriors AI-rena |
|-----------|--------------|-----------------|
| **Economy** | SLP was inflationary — minted every battle, no backing. Death spiral: more players -> more tokens -> devaluation -> exodus. | **CRwN 1:1 AVAX-backed.** `mint()`: send AVAX, get CRwN. `burn()`: destroy CRwN, get AVAX. Mathematically cannot death-spiral — always redeemable at parity. |
| **Battle variety** | Deterministic combat. After 10 battles, every outcome seen. Repetitive grind. | **AI generates unique narratives every fight.** 5 rounds x 5 moves x trait modifiers x counter system. Same two warriors fighting twice produce completely different battles. Infinite content. |
| **Entry cost** | Required $100+ to buy 3 Axies before playing. Prohibitive. | **Spectator-first: $0 entry.** Watch + bet without owning any NFT. Testnet CRwN is free. Lowest friction entry in the entire category. |
| **Engagement depth** | Grind battles -> earn SLP -> sell. One-dimensional loop. | Multi-layered: Bet -> Influence -> Watch narrative -> Track Elo -> 4 daily quests -> 23 achievements (5 rarities) -> Streaks -> Rankings (Unranked to Platinum) -> Tournaments. |
| **Spectator experience** | None. Play or leave. | Built for spectators FIRST. Betting, influence, leaderboard, tournaments — the majority of engagement doesn't require NFT ownership. |

### Competitive Positioning Map

```
                ACTIVE AUDIENCE PARTICIPATION
                          |
                 Warriors AI-rena
              (Bet + Influence + Watch)
                          |
          Twitch --------+-------- Rollbit
        Predictions      |        (Crypto Casino)
        (Fake stakes)    |        (Real stakes, no skill)
                          |
  --------+---------------+---------------+--------
           |              |              |
    LOW STAKES            |          HIGH STAKES
           |              |              |
    Axie Infinity --------+-------- DraftKings
    (Play-to-Earn)        |        (Sports Betting)
                          |
        AI Arena ---------+------- CryptoFights
        (Train AI)        |        (On-chain combat)
                          |
                PASSIVE VIEWING ONLY
```

**Our unique position that no competitor occupies:**

Real financial stakes + Active audience participation (influence/defluence) + AI-generated unique content + Verifiable on-chain fairness.

No competitor combines all four.

---

## 7. Appendix

### Deployed Smart Contracts (Avalanche Fuji Testnet)

| # | Contract | Address | Key Functions |
|---|----------|---------|---------------|
| 1 | **CRwN Token** | `0xF0011ca65e3F6314B180a8848ae373042bAEc9b4` | `mint()`, `burn()`, `burnFrom()`, ERC-20 |
| 2 | **WarriorsNFT** | `0x218d3efaB076bd03E278CDCf3B488AA107215b8a` | `mint()`, `assignTraitsAndMoves()`, `getRanking()`, ERC-721 |
| 3 | **ArenaFactory** | `0xe9faCA292CEF42489AF4d20266964Fb6425AE122` | `startGame()`, `battle()`, `finishGame()`, `betOnWarriorsOne/Two()`, `influenceWarriorsOne/Two()`, `defluenceWarriorsOne/Two()` |
| 4 | **PredictionArena** | `0xE80C2eaDf7B4d0e2acD51a475c1a2ED4134D4Ad5` | `createChallenge()`, `acceptChallenge()`, `submitRound()`, `placeBet()`, `claimBet()`, `storeBattleData()` |
| 5 | **ExternalMarketMirror** | `0x1cfa9eD162f90B1eD6d9A01c504fFc28B7412473` | `createMirrorMarket()`, `tradeMirror()`, `tradeWithVerifiedPrediction()`, `vrfCopyTrade()` |
| 6 | **AI Agent iNFT (ERC-7857)** | `0xbAE259eeA7fd49F631dE44Ac8d4fd2eb6C7F8Cb8` | `followAgent()`, `unfollowAgent()`, `getCopyTradeConfig()`, encrypted metadata |
| 7 | **Agent iNFT Oracle** | `0xf986215373Bc8E5A1a698Be72270c0e1FC4716e3` | Oracle for agent trade verification |
| 8 | **AI Debate Oracle** | `0x17f63e80bd0db1ed77f6dcf54d2bb7ae3fb43f7d` | Oracle for battle resolution |
| 9 | **Prediction Market AMM** | `0xeBe1DB030bBFC5bCdD38593C69e4899887D2e487` | `getMarket()`, `getPrice()`, `buy()`, `executeCopyTrade()` |
| 10 | **Outcome Token** | `0x578F5D284F1Ac91115293cC36eD2DF487550C1da` | Position tokens for market outcomes |
| 11 | **Creator Revenue Share** | `0x05Ca49f32B482e0Dce58e39A22F31e5f56A43Ee7` | `getTierBonusRate()`, creator fee distribution |
| 12 | **AI Agent Registry** | `0x5e0Df8750114ecBC0850494fb1a2b9001b61254e` | Agent registration and management |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15 (App Router + Pages Router) on Vercel |
| **Blockchain** | Avalanche C-Chain (4,500 TPS, <1s finality) via viem + wagmi + RainbowKit |
| **Database** | PostgreSQL via Prisma ORM (23+ models) |
| **AI Inference** | 0G Compute (decentralized, verifiable) |
| **Storage** | 0G Storage (content-addressable, auditable) |
| **Wallet** | RainbowKit + wagmi |

### Battle Engine Technical Specs

| Component | Specification |
|-----------|--------------|
| **Rounds** | 5 per battle |
| **Moves** | STRIKE, TAUNT, DODGE, SPECIAL, RECOVER |
| **Counter system** | STRIKE->DODGE, TAUNT->STRIKE, DODGE->SPECIAL, SPECIAL->TAUNT, RECOVER->DODGE |
| **Counter bonus** | 1.3x (30% damage boost) |
| **Countered penalty** | 0.7x (30% damage reduction) |
| **Trait precision** | 0-10,000 (2 decimal places) |
| **Trait bonuses** | Strength +25%, Wit +20%, Charisma +15%, Defence -20% reduction, Luck +10% |
| **Score range** | 0-1000 per round |
| **Elo K-factor** | 32 |
| **Elo minimum** | 100 |
| **Betting window** | Rounds 1-2 only |
| **Betting fee** | 500 BPS (5% on winnings) |

### Key Metrics for Evaluation

| Criteria | Evidence |
|----------|---------|
| **Market understanding** | Identified the spectator gap in Web3 gaming. Positioned at intersection of sports betting ($10B+), AI gaming, and NFTs. Clear problem: NFTs are static, crypto games have no spectator experience. |
| **Growth strategy viability** | Core viral loop built into product (shareable battles + influence stories). 7 zero/low-CAC channels identified. Spectator-first = zero barrier to entry. |
| **User acquisition plan** | 4 personas with specific channels. Phased GTM: waitlist -> closed alpha -> open beta -> mainnet. Primary persona (Spectator Bettor) maps to $10B+ sports betting market. |
| **Business model clarity** | 4 implemented revenue streams. 5 future streams with infrastructure built. CRwN is stable utility token (1:1 AVAX, no ponzinomics). Unit economics: 5-40x LTV/CAC. |
| **Scalability potential** | 5 technical moats (battle AI engine, influence contracts, signature system, 0G verification, dual betting infra). Clear scaling path: 1K -> 10K -> 50K -> 500K users. Avalanche L1 subnet roadmap. |

---

*Warriors AI-rena — Built on Avalanche*
*Live at: https://warriors-ai-rena.vercel.app/*
*All claims verified against deployed code — March 2026*
