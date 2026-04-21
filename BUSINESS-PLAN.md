# Warriors AI-rena — Business Plan

**Entity:** Warriors AI-rena (operating name)
**Stage:** MVP deployed, seeking seed capital
**Category:** On-chain entertainment — spectator betting + AI battles
**Home chain:** Avalanche C-Chain
**Status:** Live on Fuji Testnet; mainnet-ready pending audit + capital

---

## 1. Executive Summary

Warriors AI-rena is a spectator-first, AI-powered battle arena on Avalanche C-Chain. Users mint warrior NFTs with verifiably-signed traits, watch them compete in 5-round battles decided by AI inference, and place CRwN token bets on outcomes. Spectators can **influence** or **defluence** warriors mid-battle — a mechanic no competing product offers.

**The product is live.** Sixteen smart contracts deployed. Full battle lifecycle verified end-to-end. 0G Compute powers verifiable AI moves; 0G Storage holds battle history; Avalanche C-Chain holds all economic state.

**We are raising $500K seed** to:
1. Complete external smart-contract audit and launch on Avalanche mainnet
2. Acquire the first 10,000 weekly active spectators through viral battle clips + Discord community
3. Ship tournaments + marketplace + team battles (Phase 2 features)
4. Build a 12-month runway to product-market-fit validation

**Projected Year 1 revenue: $200K–$580K** across four active streams (betting fee, influence costs, NFT mint, CRwN spread).

---

## 2. Company & Mission

### 2.1 Mission

Build the entertainment layer on-chain gaming has always lacked: a place where anyone can passively watch AI-generated battles, place small stakes, and actively shape live outcomes — all with cryptographic fairness.

### 2.2 Core Values

1. **Ship over promise.** Every feature is measured by on-chain transactions, not roadmap slides.
2. **Spectator-first.** The first-time experience works without a wallet. Ownership comes later.
3. **Verifiable by default.** If it affects stakes, it's on-chain or proven.
4. **Sustainable economics.** No pre-mints, no inflation, no yield farms, no ponzinomics.

### 2.3 Legal & Operational Structure (Planned)

- Delaware C-corp for US operations and investor-friendly structure
- BVI or Cayman foundation for protocol governance (post-Phase 2)
- Separation: company ships product; foundation holds treasury and votes on CRwN parameters

---

## 3. Product

### 3.1 What Users Do

```
Mint warrior → Activate traits → Enter arena → Watch battle
            ↓                              ↑
       Bet on outcome        Share highlight clip
            ↓                              ↑
       Influence live ──────→ Win/lose ────┘
```

### 3.2 Current Product Surface

- `/arena` — main spectator interface with 5 rank-tiered arenas
- `/warriorsMinter` — AI-generated trait + move assignment for new warriors
- `/leaderboard` — top warriors by ELO, winnings, streaks
- `/whale-tracker` — track top bettors and their positions
- `/external` — Polymarket / Kalshi market mirror (Phase 3 preview)
- `/portfolio` — user's warriors, bets, CRwN balance

### 3.3 What's Working Today (Verified On-Chain)

- Arena initialization with pre-flight checks (rank match, traits active, same-ID guard)
- 60-second betting window with multi-multiplier bet support
- Five-round battle execution with AI-signed moves
- Influence / defluence mid-battle with dynamic damage modification
- 95% / 5% payout split on game finish
- Automatic arena reset after battle completion
- Auto-generated AI traits + moves with ECDSA-verified signatures
- CRwN mint/burn at 1:1 AVAX parity

### 3.4 What's Next (12 Months)

See [FUTURE-PLAN.md](FUTURE-PLAN.md) for the full 36-month roadmap. Phase 1 (next 6 months) ships:

- Avalanche mainnet launch (post-audit)
- Mobile PWA
- Auto-generated highlight clips
- Discord bot integration
- Referral smart contract
- 23-achievement / 11-quest gamification layer
- Push notifications

---

## 4. Market

### 4.1 TAM / SAM / SOM

| Market | 2023 Size | Segment |
|--------|-----------|---------|
| **TAM** — Global online betting + prediction + Web3 gaming | $92B | All entertainment-betting consumers worldwide |
| **SAM** — Crypto-native users age 18–45 interested in betting | $4.6B (Web3 gaming alone) | Users with at least one self-custody wallet |
| **SOM** — Avalanche ecosystem + adjacent L1/L2 users | ~$80M annual spend | Year 1 realistic reachable market |

We do not need to own even 1% of SAM to be profitable. Our Year 1 revenue target ($200K–$580K) is 0.0002–0.0006% of SAM.

### 4.2 Market Trends Favoring Us

- **DraftKings + FanDuel processed $10B+ in wagers in 2023.** Sports-style betting is mainstream.
- **Polymarket crossed $1B monthly volume in 2024.** On-chain prediction markets are a proven category.
- **AI is moving on-chain rapidly.** 0G, Ritual, Bittensor all racing. Consumer AI products will be the test beds.
- **Avalanche is optimizing for gaming** (subnet v2, sub-second finality). Our chain is aligned with our category.
- **Gen Z watches more esports than live sports.** Spectator betting on competitive gaming is not a future bet — it's present behavior waiting for infrastructure.

### 4.3 Four User Personas

**Primary: Jake — The Spectator Bettor (26)**
- Current behavior: DraftKings / FanDuel weekly, Twitch Trading-Card game streams
- Pain: Wants to bet on AI battles but blockchain UX is too complex
- Lowest entry barrier — zero wallet needed to watch; one-click bet once connected
- Our wedge: spectator-first design. He doesn't need to own a warrior to play.

**Secondary: Mia — The Warrior Builder (23)**
- Current behavior: Mints on OpenSea, plays character-customization games
- Pain: Her NFTs are static; no utility post-mint
- Motivation: Her warrior's win rate directly drives resale value. Real utility.

**Secondary: Kai — The Competitive Player (28)**
- Current behavior: Ranked League / Valorant, dabbles in DeFi
- Pain: Wants to prove skill for real stakes
- Motivation: ELO rankings, tournament wins, mastering influence timing.

**Acquisition: Sarah — The Curious Newcomer (22)**
- Current behavior: ChatGPT + TikTok, zero crypto experience
- Pain: Crypto is intimidating, but AI + gaming is a cultural hook
- Path: Testnet-first, free to try, no financial risk until they commit.

---

## 5. Competition

### 5.1 Direct & Indirect Competitors

| Competitor | Positioning | Weakness | Our Edge |
|------------|-------------|----------|----------|
| **AI Arena** (Arbitrum) | Train neural networks to fight | Requires ML skill. No spectator betting. | Spectator-first; no ML; influence mechanic |
| **Axie Infinity** | P2E NFT battles | SLP death spiral; repetitive; $100+ entry | Stable CRwN, unique AI battles, free spectating |
| **Rollbit** | Crypto casino with NFT battles | House edge; no skill; centralized | PvP, skill-based, on-chain verifiable |
| **DraftKings / FanDuel** | Sports betting | No blockchain, no NFT ownership | On-chain transparency, real asset ownership |
| **Polymarket** | On-chain prediction markets | Passive. No entertainment. Spreadsheets. | Entertainment wrapper + active participation |
| **Twitch Predictions** | Free prediction stream overlay | No real stakes, no payout | Real CRwN stakes with real returns |

### 5.2 Positioning Map

```
            ACTIVE PARTICIPATION
                     │
         Warriors AI-rena ★
          (bet + influence live)
                     │
 Twitch Preds ─────┼───── Rollbit
 (fake stakes)      │      (no skill)
                    │
 LOW STAKES ────────┼──────── HIGH STAKES
                    │
 Axie Infinity ─────┼──── DraftKings / FanDuel
 (play-to-earn)     │      (no ownership)
                    │
              PASSIVE VIEWING
```

**No competitor occupies the upper-right quadrant.** That's our space.

### 5.3 Why We Win

1. **Influence mechanic** — unique, on-chain, defensible. Competitors would need to rebuild their entire economic layer to replicate.
2. **Spectator-first UX** — zero wallet to watch; any wallet to bet. This is a structural advantage we chose early.
3. **Unique AI content** — every battle is different. Content moat grows per-battle.
4. **Verifiable fairness** — cryptographic proofs on moves and traits. Centralized competitors cannot match.
5. **Avalanche native** — sub-second finality makes real-time influence feasible. Other L1s introduce unacceptable latency.

---

## 6. Business Model

### 6.1 Four Active Revenue Streams (Shipped)

| # | Stream | Mechanism | Rate | Year 1 Est. |
|---|--------|-----------|------|------------|
| 1 | Battle betting fee | 5% of pool to warrior owner (from `Warriors_ONE_CUT = 5` in `Arena.sol`) | 500 BPS | $100K–$300K |
| 2 | Influence cost | Dynamic CRwN burn per `influenceWarriors*()` call | 1×–5× base | $50K–$150K |
| 3 | Defluence cost | Dynamic CRwN burn per `defluenceWarriors*()` call, one per battle per address | 1×–5× base | Included in #2 |
| 4 | NFT mint gas | Per-warrior network fee on `mintNft()` + `assignTraitsAndMoves()` | Variable | $20K–$50K |
| 5 | CRwN mint/burn spread | Tunable 0.1–0.5% on mint/burn | 10–50 BPS | $30K–$80K |
| | **Total Year 1** | | | **$200K–$580K** |

### 6.2 Five Revenue Streams (Built, Not Live)

| Stream | Mechanism | Year 2 Est. |
|--------|-----------|------------|
| Tournament entry fees | Bracket contracts with pool split | $50K–$100K |
| Creator revenue share | 2% of creator arena pools | $50K–$100K |
| Premium cosmetics | Visual upgrades (no gameplay impact) | $30K–$80K |
| Sponsored battles | Brand-sponsored featured matches | $50K–$200K |
| NFT secondary royalties | ERC-2981 on warrior resales | $20K–$50K |

### 6.3 Unit Economics

| Metric | Conservative | Optimistic |
|--------|-------------|------------|
| CAC | $8 | $3 |
| Activation rate | 40% | 65% |
| 6-month LTV | $40 | $120 |
| LTV / CAC | 5× | 40× |
| Payback period | 90 days | 30 days |
| Avg bet size | 10 CRwN ($10 @ parity) | 50 CRwN |
| Battles / user / week | 3 | 10 |
| Platform take rate | 3% | 5% |
| Revenue / user / month | $3 | $15 |

### 6.4 Revenue Scaling Math

At **1,000 daily battles** (Phase 2 target):
- Average pool: 20 CRwN per battle (20 bettors × 1 CRwN avg)
- Daily betting volume: 20,000 CRwN
- 5% fee: 1,000 CRwN / day = **$365K / year just from betting fee**
- Plus influence, mint, spread: **$500K–$2.5M / year**

At **10,000 daily battles** (Phase 3 target):
- 10× volume: **$5M–$25M / year**

---

## 7. Go-to-Market

### 7.1 The Viral Loop

```
Watch (free, no wallet)          ← 0% friction entry
         ↓
Hooked by AI narrative            ← retention hook (unique content)
         ↓
Connect wallet                   ← first friction point (optimized UX)
         ↓
Get CRwN (bridge AVAX)           ← one-click on-ramp
         ↓
Place first bet                  ← activation event
         ↓
Use Influence                    ← visible agency (key engagement driver)
         ↓
Win / exciting loss              ← emotional payoff
         ↓
Share highlight clip             ← viral mechanism (auto-generated)
         ↓
Friend clicks                    ← new user enters at step 1
```

### 7.2 Acquisition Channels (Ranked by Priority)

| # | Channel | Strategy | CAC | Volume |
|---|---------|----------|-----|--------|
| 1 | **Battle clip virality** | Auto-generated 30–60s highlight clips posted to TikTok, YouTube Shorts, Twitter. Focus on influence-driven comebacks. | $0 | High |
| 2 | **Discord community** | Strategy talk, matchup analysis, 4 daily quests. Cross-pollinate with Avalanche / 0G Discords. | $0 | High |
| 3 | **Crypto Twitter** | Daily battle results, leaderboard posts, "Warrior of the Week". Partnership with major accounts. | $0 | High |
| 4 | **Avalanche ecosystem** | Co-marketing with Avalanche Foundation, ecosystem listings, AVAX community calls. | $0 | High |
| 5 | **Influencer seeding** | Send 20 creators pre-minted Genesis warriors + battle tutorials. Track clickthrough to mainnet. | $0–$5 | Med |
| 6 | **Referral program** | Smart-contract referrals with CRwN bonuses both sides. Unlocks at first bet. | $2–$5 | Med |
| 7 | **Sports-betting communities** | Pitch "Imagine boosting your team mid-game with tokens." Reddit r/sportsbook, betting podcasts. | $0–$3 | Med |

### 7.3 Milestone Targets

| KPI | Testnet Alpha (now) | Testnet Beta (+1mo) | Mainnet M1 (+3mo) | M6 | M12 |
|-----|---------------------|---------------------|------------------|----|-----|
| New users / week | 30 | 100 | 300 | 1,000 | 2,500 |
| First-bet conversion | 30% | 40% | 50% | 60% | 65% |
| WAS | 50 | 300 | 1,000 | 3,000 | 10,000 |
| Battles / day | 5 | 20 | 50 | 100 | 500 |
| Weekly CRwN volume | 1K | 10K | 50K | 500K | 2M |
| Influence usage rate | 20% | 30% | 40% | 50% | 55% |
| 7-day retention | 20% | 30% | 40% | 45% | 50% |

---

## 8. Operations & Team

### 8.1 Current Team

- **Founder-engineer**: Full-stack + smart contract. Shipped 16 contracts + 66 API routes + 40+ 0G Storage collections. Repository: https://github.com/kaustubh76/Build-Games

### 8.2 Hires Needed (Post-Seed)

| Role | Quarter | Rationale |
|------|---------|-----------|
| Senior Solidity Engineer | Q2 2026 | Tournament + marketplace + team-battle contracts |
| Community Manager | Q2 2026 | Discord moderation, Twitter presence, influencer outreach |
| Content / Highlights Editor | Q3 2026 | Curate auto-generated clips, produce weekly recap videos |
| Growth / BD Lead | Q4 2026 | Influencer deals, ecosystem partnerships, sponsored battles pipeline |
| Product Designer | Q1 2027 | Mobile UX, marketplace flow, tournament UI |

### 8.3 Advisors

Seeking advisors with:
- Regulated sports-betting operations experience
- Smart contract security (audit firm founder preferred)
- Avalanche ecosystem leadership
- Prediction market protocol experience

### 8.4 Infrastructure Spend

| Line Item | Monthly | Annual |
|-----------|---------|--------|
| Vercel Pro (serverless + cron) | $200 | $2,400 |
| RPC providers (Avalanche + 0G + fallback) | $300 | $3,600 |
| 0G Compute credits | $500 | $6,000 |
| 0G Storage | $200 | $2,400 |
| Pinata (IPFS fallback) | $100 | $1,200 |
| GitHub / dev tooling | $100 | $1,200 |
| Monitoring (Sentry / DataDog) | $200 | $2,400 |
| Legal retainer | $1,000 | $12,000 |
| **Total** | **$2,600** | **$31,200** |

---

## 9. Financials

### 9.1 Funding Ask: $500K Seed

**Valuation cap:** $5M post-money (SAFE with standard 20% discount)

**Use of funds — 12 months:**

| Category | Amount | % |
|----------|--------|---|
| Smart contract audit + bug bounty | $150K | 30% |
| User acquisition (2 community / content hires + paid) | $150K | 30% |
| Infrastructure + operating costs | $100K | 20% |
| Engineering (1 senior Solidity FTE) | $100K | 20% |
| **Total** | **$500K** | 100% |

### 9.2 Projected P&L — Year 1

| | Conservative | Optimistic |
|--|-------------|------------|
| **Revenue** | $200K | $580K |
| Battle fee | $100K | $300K |
| Influence costs | $50K | $150K |
| NFT mint | $20K | $50K |
| CRwN spread | $30K | $80K |
| **Costs** | $380K | $420K |
| Infrastructure | $32K | $40K |
| Audit + security | $80K | $80K |
| Team + contractors | $180K | $200K |
| Marketing + community | $60K | $80K |
| Legal + compliance | $20K | $20K |
| Reserve | $8K | $0 |
| **Net (Y1)** | **($180K)** | **$160K** |
| **Runway after seed** | 18 months | 36+ months |

### 9.3 Projected P&L — Year 2

At 10,000 MAU and Phase 2 features live:

| | Base Case | Bull Case |
|--|----------|-----------|
| Revenue | $1.5M | $3.5M |
| Costs | $1M | $1.5M |
| **Net (Y2)** | **$500K** | **$2M** |
| Cumulative | $320K | $2.16M |

### 9.4 Path to Break-Even

We expect break-even in **Q3 2027** (month 15) under the base case, driven primarily by Phase 2 tournament entry fees and marketplace royalties unlocking new revenue streams without proportional cost growth.

---

## 10. Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Regulatory classification as gambling | Medium | High | Testnet-first, geo-fence, utility-token framing, legal counsel pre-mainnet |
| Smart contract vulnerability | Low-Med | Critical | External audit, bug bounty, timelock, upgradeable proxies for non-core |
| AI inference outage | Medium | Medium | Deterministic trait-based fallback ensures battle continuity |
| Low initial liquidity | High | Medium | Bootstrap treasury pool, creator incentives, fewer-deeper markets Phase 1 |
| No product-market fit | Medium | Critical | Kill criterion: <50 WAB after 6 weeks of open beta → pivot or sunset |
| Key person risk | High | High | Document everything, open-source core, hire redundancy post-seed |
| Avalanche ecosystem contraction | Low | Medium | Chain-agnostic contract design; portable to Arbitrum / Base |
| 0G Network immaturity | Medium | Medium | IPFS fallback; deterministic AI fallback; reducing dependence quarterly |

---

## 11. Exit Strategy

Three plausible outcomes:

### Scenario A — Organic Protocol Growth

Warriors AI-rena becomes a profitable self-sustaining protocol governed by CRwN holders. Company exits via:
- Selling operating entity to an aggregator (Avalanche Foundation, a larger gaming studio)
- Transitioning to foundation-only model with no company entity
- Timeline: 5+ years

### Scenario B — Strategic Acquisition

Acquired by a larger ecosystem player seeking:
- Web3 gaming footprint (Sky Mavis, Immutable)
- Spectator-betting vertical (Polymarket, Kalshi looking to expand)
- AI-on-chain integration (0G, Ritual, Bittensor for consumer play)
- Timeline: 2–3 years, valuation range $50M–$250M depending on MAU

### Scenario C — Platform Consolidation

We become the acquirer. If Phase 3–4 succeed, Warriors AI-rena becomes the multi-game entertainment layer. Acquire smaller Web3 games to fold into the platform. Timeline: 4+ years.

---

## 12. Appendix — Contract Addresses

**Avalanche Fuji Testnet (43113):**

| Contract | Address |
|----------|---------|
| CrownToken | `0xF0011ca65e3F6314B180a8848ae373042bAEc9b4` |
| WarriorsNFT | `0x218d3efaB076bd03E278CDCf3B488AA107215b8a` |
| ArenaFactory | `0xe9faCA292CEF42489AF4d20266964Fb6425AE122` |
| PredictionMarketAMM | `0xeBe1DB030bBFC5bCdD38593C69e4899887D2e487` |
| OutcomeToken | `0x578F5D284F1Ac91115293cC36eD2DF487550C1da` |
| AIAgentRegistry | `0x5e0Df8750114ecBC0850494fb1a2b9001b61254e` |
| AIAgentINFT | `0xbAE259eeA7fd49F631dE44Ac8d4fd2eb6C7F8Cb8` |
| AIDebateOracle | `0x17f63e80bd0db1ed77f6dcf54d2bb7ae3fb43f7d` |
| MicroMarketFactory | `0xd81373eEd88FacE56c21CFA4787c80C325e0bC6E` |
| CreatorRevenueShare | `0x05Ca49f32B482e0Dce58e39A22F31e5f56A43Ee7` |
| ExternalMarketMirror | `0x1cfa9eD162f90B1eD6d9A01c504fFc28B7412473` |
| PredictionArena | `0xE80C2eaDf7B4d0e2acD51a475c1a2ED4134D4Ad5` |
| MarketFactory | `0x7E2e6eb2Ad58c4a9CE1aD5ccfFfc7e5e715753BA` |
| AILiquidityManager | `0x625A38bD9B7941d79f1da95982c51B197eC4Bdfd` |
| MockOracle | `0xf986215373Bc8E5A1a698Be72270c0e1FC4716e3` |

**Explorer:** https://testnet.snowtrace.io
**Live product:** https://warriors-ai-rena.vercel.app
**Repository:** https://github.com/kaustubh76/Build-Games
**Mainnet-ready:** Yes. One environment variable change (`NEXT_PUBLIC_CHAIN_ID=43114`) + audit + contract redeploy.

---

**This business plan will be updated quarterly. Next revision: Q3 2026.**
