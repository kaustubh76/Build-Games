# Warriors AI-rena — Pitch Deck

*14 slides, designed for ~10-minute presentation. Each slide is marked with intent, visual cue, and speaker notes.*

---

## Slide 1 — Title

> **Warriors AI-rena**
> **Web3's First Interactive Spectator Sport**
>
> AI-powered battle arena on Avalanche C-Chain
> *"The ESPN of Web3"*
>
> Live: https://warriors-ai-rena.vercel.app
> Fuji Testnet | Mainnet-ready

**Visual:** Warrior silhouettes clashing, CRwN token glowing, Avalanche + 0G logos.

**Speaker note:** Hook them in 10 seconds: "Imagine if you could watch two AI warriors battle live, bet on the winner, and burn tokens mid-fight to boost your side. That's Warriors AI-rena. Live today on Avalanche."

---

## Slide 2 — The Problem

**Web3 gaming has a spectator problem — and the numbers prove it.**

| Observation | Data |
|-------------|------|
| NFT collections with zero secondary-sale utility | **~90%** (per OpenSea 2024 dormancy data) |
| Axie Infinity daily-active users since SLP collapse | **−95% from peak** |
| Time Gen Z spends watching esports vs live sports | **+35% esports** (Deloitte 2023) |
| U.S. sports betting handle (DraftKings + FanDuel) | **$10B+ in 2023** |
| Polymarket monthly volume (late 2024) | **>$1B/month** |
| AI Arena weekly active spectators (Arbitrum) | **~0** (platform is player-only) |

**The gap is clear:** spectator demand exists. NFT ownership desire exists. AI fighting games exist. **But no product puts all three in the same room**, with real on-chain stakes and a mechanic that lets the audience alter the outcome.

**Visual:** Split-screen. Left: dusty NFT portfolio with grey floor prices. Right: sports bar with glowing phones, all eyes on a screen.

---

## Slide 3 — Our Insight

> **Every successful entertainment economy has three roles: players, creators, spectators.**
> **Crypto has built for players. We've built for spectators.**

Our bet: the next billion crypto users will *watch before they play*. They want:
- Entertainment first
- Stakes without grinding
- Verifiable outcomes
- Something to influence, not just observe

**Visual:** Three concentric circles — Players (innermost, small), Creators (middle), **Spectators (outer, massive)**. Arrow points to the outer ring.

---

## Slide 3.5 — Why Now

**Five converging waves make this the right moment:**

1. **Avalanche's gaming focus.** Subnet v2 + sub-second finality + L1 launcher make real-time spectator mechanics feasible. No other EVM chain ships the UX latency this category needs.
2. **0G Network nearing mainnet.** Verifiable on-chain AI inference has moved from theoretical to usable. Competing AI-on-chain stacks (Bittensor, Ritual) are either upstream of our use case or not yet consumer-ready.
3. **Polymarket crossed $1B monthly volume in late 2024.** On-chain prediction markets are no longer niche. The audience exists.
4. **Gen Z watches more esports than live sports** (Deloitte 2023). Spectator betting on AI-driven competitive content is not a future bet — it's a mapping to existing behavior.
5. **AI-generated content is now cheaper than curated content.** A single warrior's traits + moves + lore costs pennies to generate. This was not economically feasible in 2022.

**Any single one of these lets someone else ship this.** All five at once is our window.

**Visual:** Five bars growing from 2022 → 2026, converging into an arrow pointing at "Warriors AI-rena."

---

## Slide 4 — What We Built

**Mint an AI warrior. Watch it battle. Bet on winners. Shape live outcomes.**

1. **Mint** a warrior NFT with AI-generated traits (Strength, Wit, Charisma, Defence, Luck) and five signed combat moves
2. **Enter** an arena — ranked tiers from Unranked to Platinum
3. **Watch** two warriors fight across 5 rounds with AI-selected moves
4. **Bet** CRwN on either side during the 60s betting window
5. **Influence** live — burn CRwN between rounds to boost a warrior or weaken the opponent
6. **Earn** when your side wins — 95% of the pool splits pro-rata

**Visual:** Product screenshot of the arena page. Two warriors mid-fight, bet totals, live timer.

---

## Slide 5 — The Killer Mechanic: Influence

**Between every round, spectators can spend CRwN to alter the next round's damage calculation.**

```
influenceWarriorsOne()  →  +10% to +200% damage for your pick
defluenceWarriorsOne()  →  -5% to -90% damage for opponent
                           (one use per player per battle — decision weight)
```

No betting platform, no NFT game, no prediction market lets spectators *change the outcome of a live event* with real financial stakes.

**This is our moat.** It requires on-chain settlement, verifiable state, real-time UX, and a dynamic damage model. Competitors can copy any one; combining them is hard.

**Visual:** Animation: damage bar ticks up as CRwN icons fly in. "You spent 5 CRwN → Warrior One next-round damage +40%"

---

## Slide 6 — The Economy

**CRwN — no speculation, no inflation, no death spiral.**

- 1 AVAX → 1 CRwN (on-chain mint)
- 1 CRwN → 1 AVAX (on-chain burn)
- No pre-mint, no team allocation, no vesting, no staking yield

**Utility-driven demand:**
- Betting uses CRwN
- Influence burns CRwN
- NFT minting burns CRwN (gas)
- All fees denominated in CRwN

CRwN is money that knows what it's for. You buy to use it, not to hold it.

**Visual:** AVAX → CRwN → (Bet / Influence / Mint) → CRwN → AVAX. Closed loop.

---

## Slide 7 — Market Size & Position

**Three converging TAMs:**

| Market | 2023 Size | Our Play |
|--------|-----------|---------|
| Sports Betting | $10B+ (DK + FD alone) | Spectator bettors |
| Web3 Gaming | $4.6B | AI battle arena |
| Prediction Markets | $1B+/mo (Polymarket) | Phase-3 integration |

**Competitive map (active participation × real stakes):**

```
                     ACTIVE PARTICIPATION
                           │
                   Warriors AI-rena ★
                  (bet + influence live)
                           │
         Twitch ───────────┼─────────── Rollbit
       Predictions         │            (no skill)
                           │
   LOW STAKES ─────────────┼───────────── HIGH STAKES
                           │
      Axie Infinity ───────┼─────── DraftKings
      (grindy)             │        (no ownership)
                           │
                    PASSIVE VIEWING
```

**No one occupies our corner.**

**Visual:** The 2×2 above, with a big star in the upper-right.

---

## Slide 8 — Traction & Deployment

**Live today. Not a mock. Not a landing page. A working product.**

**Contracts deployed & verified on Avalanche Fuji (chain 43113):**
- CrownToken — `0xF0011ca65e3F6314B180a8848ae373042bAEc9b4`
- WarriorsNFT — `0x218d3efaB076bd03E278CDCf3B488AA107215b8a`
- ArenaFactory — `0xe9faCA292CEF42489AF4d20266964Fb6425AE122`
- +13 more (see WHITEPAPER.md §2.2)

**Verifiable battle execution (Snowtrace-visible):**
- New UNRANKED arena created: `0x6fA5fbdAF71b67c05382Fca9EF702416df3Ee1aC`
- Warriors #7 and #9 activated with AI-signed traits (tx `0x7e5cd2...` and `0x198df7...`)
- Full 5-round battle executed via game-master automation (April 2026)
- Automatic reward distribution + arena reset confirmed on-chain

**Engineering velocity:**
- 16 smart contracts deployed + Snowtrace-verified
- 66 API routes on Vercel (fully serverless)
- 40+ document collections in 0G Storage layer (PostgreSQL fully removed)
- Three-layer automation: Vercel cron + 2-second client polling + manual override
- Complete deployment pipeline: `./scripts/deploy-mainnet.sh` one-command mainnet deploy

**Demoable loop:**
1. Visit https://warriors-ai-rena.vercel.app/arena
2. Pick UNRANKED arena
3. Enter warrior IDs, place bets
4. Watch 5 rounds auto-execute with on-chain signature on each move
5. Rewards distributed, arena resets

**Visual:** Side-by-side — left panel: Snowtrace showing `GameFinished` event with damage values; right panel: product screenshot of final round with winner highlighted.

---

## Slide 9 — Tech Moat

**Five defensibility layers:**

1. **Signed trait system** — every warrior's stats are ECDSA-verified against a game-master key. No impersonation, no trait forgery.
2. **Influence smart contracts** — the damage-mod math is non-obvious and iteratively tuned. Six months of balance work baked in.
3. **0G Compute integration** — verifiable AI inference with cryptographic proofs, not a chatbot wrapper.
4. **Three-layer automation** — cron + client polling + manual override. Battles never stall.
5. **Prisma-compatible 0G data layer** — 40+ document collections, full CRUD, decentralized storage. Data moat grows with every battle.

**Visual:** Stacked shield with five bands, each labeled.

---

## Slide 10 — Business Model

**Four active revenue streams, five more built and waiting.**

| Stream | Mechanism | Year 1 |
|--------|-----------|--------|
| Betting fee | 5% on winnings | $100K–$300K |
| Influence/Defluence | CRwN burned per action | $50K–$150K |
| NFT mint gas | Per-warrior fee | $20K–$50K |
| CRwN spread | Tunable 0.1–0.5% on mint/burn | $30K–$80K |
| **Total Year 1** | | **$200K–$580K** |

**Unit economics:**
- CAC: $3–$8 (battle clip virality, Discord, referral)
- 6-month LTV: $40–$120
- LTV/CAC: 5–40×

**Ready to unlock in Year 2:** tournament entry fees, creator revenue share, premium cosmetics, sponsored battles, NFT royalties.

**Visual:** Stacked bar chart — four green bars (active) + five grey bars (ready).

---

## Slide 11 — Go-to-Market

**The viral loop:**

```
Watch (free, no wallet)
    ↓
Hooked by AI narrative
    ↓
Connect wallet, get testnet CRwN
    ↓
Place first bet (rounds 1–2)
    ↓
Use Influence (visible agency)
    ↓
Win or dramatic loss
    ↓
Share highlight clip
    ↓
Friend clicks → loop
```

**Zero CAC channels** (highest priority):
1. Battle clip virality (TikTok, Shorts, Twitter)
2. Discord community (daily quests, matchup analysis)
3. Crypto Twitter (leaderboard posts, Warrior of the Week)
4. Avalanche ecosystem partnerships

**Low-CAC channels:** Influencer seeding (20 creators, Genesis warriors), referral program (CRwN bonus both sides), sports-betting communities.

**Visual:** Funnel from Watch → Share, with percentages.

---

## Slide 12 — Roadmap

**Four phases, each with explicit user targets.**

| Phase | Timeline | Theme | North Star |
|-------|----------|-------|-----------|
| 1 — The Arena | Now → 6mo | Spectator product | 1K WAB |
| 2 — The Colosseum | 6–12mo | Tournaments, marketplace, team battles | 10K WAB |
| 3 — The Kingdom | 12–24mo | Prediction markets, creator arenas, iNFT agents | 50K MAU |
| 4 — The Empire | 24–36mo | Multi-game platform, esports league, DAO | 500K MAU |

**Each phase is a standalone, shippable product.** We don't need Phase 4 to monetize. Phase 1 already does.

**Visual:** Four stacked bars labeled with their themes, each growing wider.

---

## Slide 13 — Team & Asks

**Built by a founder-engineer team with full-stack + smart contract + AI experience.**

**What's shipped in the last 30 days (proof of velocity):**
- Fully removed PostgreSQL/Prisma; built a Prisma-compatible 0G Storage data layer (40+ collections)
- Migrated frontend from Flow chain (545) to Avalanche Fuji (43113)
- Built a verifiable game-master API that signs battle moves with the contract's `i_AiPublicKey`
- Deployed new UNRANKED arena via `ArenaFactory.makeNewArena()` and executed a full battle end-to-end
- Fixed three layers of automation (Vercel cron, client polling, manual override) with comprehensive tests
- Authored and published the whitepaper, pitch deck, business plan, future plan, deployment guide

**Repository:** https://github.com/kaustubh76/Build-Games
**Live product:** https://warriors-ai-rena.vercel.app

**What we're asking:**

- **Seed: $500K** for 12 months of runway
  - $150K — smart contract audit + bug bounty
  - $150K — user acquisition (2 community managers, influencer seeding, referral pool)
  - $100K — infrastructure (0G Compute credits, Vercel Pro, RPC, monitoring)
  - $100K — engineering (1 senior Solidity FTE for marketplace + tournaments)

- **Strategic partners:**
  - **Avalanche Foundation** — co-marketing, L1 subnet coordination
  - **0G Labs** — compute credits, co-announced product launches
  - **Sports-betting counsel** — regulatory opinion letter pre-mainnet
  - **Avalanche-aligned gaming funds** — Ava Ventures, Blizzard Fund

- **Hires post-seed (in order):**
  1. Senior Solidity engineer (tournament + marketplace contracts)
  2. Community manager (Discord moderation, Twitter presence)
  3. Content editor (auto-generated highlight clips, weekly recaps)
  4. Growth / BD lead (sponsored battles, influencer partnerships)

**Visual:** Three columns — team + shipped-in-30-days proof, ask breakdown, partner logos.

---

## Slide 14 — The Ask, One Line

> **Every sport has a front row. On-chain entertainment hasn't had one.**
> **We built it.**
>
> Sixteen contracts deployed. Full battle lifecycle verified on-chain.
> One environment variable from mainnet. $500K to put 10,000 weekly spectators in that front row by end of year.
>
> **warriors-ai-rena.vercel.app**

**Visual:** Minimalist — just the logo, one sentence, and a pulsing CTA button: *"Watch a live battle."*

**Speaker note (last 30 seconds):** "Every talk about on-chain entertainment ends with someone saying 'when will the user show up?' We think the user is already there — they just don't know this exists yet. They're watching Twitch, betting on DraftKings, collecting NFTs that don't do anything. We're the single product that combines all three, with an unfair mechanic that no one else has: letting the audience change the outcome. That's worth putting in front of 10,000 people this year. That's the ask. Thank you."

---

## Appendix — Demo Flow (5 minutes)

1. **Load arena page** — show 5 arena tiers, UNRANKED open for entry.
2. **Mint a warrior** — show AI trait generation, ECDSA signing, on-chain trait assignment.
3. **Initialize arena** — select two warriors, pre-flight checks run (rank match, traits assigned, different IDs).
4. **Place bets** — two bets on two sides, CRwN approved and transferred.
5. **Wait 60s** — timer ticks; cron/polling detects expiry.
6. **Game auto-starts** — startGame() fires, Round 1 begins.
7. **Watch round 1** — AI picks moves, damage calculated, visual updates.
8. **Influence demo** — click "+5 CRwN to Warrior One" between rounds.
9. **Rounds 2–5** — continue with occasional influence.
10. **Auto-finish** — Round 5's `battle()` calls `finishGame()` internally. Winners get paid. Arena resets.

**Proof on-chain:** Open Snowtrace in parallel, show every transaction landing.

---

## Closing One-Liner

> **On-chain entertainment needs spectators. We built them a front-row seat with a button to shape the outcome.**
