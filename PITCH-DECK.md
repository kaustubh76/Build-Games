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

**Web3 gaming has a spectator problem.**

- 90%+ of NFTs are static JPEGs with no ongoing utility
- Crypto games require you to *play* — there's no passive audience
- Prediction markets are powerful but feel like spreadsheets
- Play-to-earn economies collapse on ponzinomics

**Meanwhile, DraftKings + FanDuel = $10B+ wagered in 2023** on events people *watch*, not play.

**The gap:** No product combines verifiable on-chain fairness with a sports-style spectator experience.

**Visual:** Split-screen. Left: empty NFT collection, dusty. Right: packed sports bar, phones out, betting.

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

- **16 smart contracts** deployed on Avalanche Fuji (43113)
- **9 warriors** minted with signed on-chain traits
- **Full battle lifecycle verified** end-to-end (init → bet → 5 rounds → finish → payout)
- **66 API routes** serverless on Vercel
- **Zero database** — 0G Storage replaces PostgreSQL, fully decentralized

**Executed live during development:**
- 3 complete battles with real CRwN bets, all signed and settled on-chain
- Auto-execution via Vercel cron + client polling both verified working
- Automated arena creation via `makeNewArena()` reproducible in ~10s

**Visual:** Snowtrace screenshots of the `GameFinished` events, green checkmarks.

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

**Built by a founder-engineer team with full-stack + smart contract experience.**

- 16 contracts audited internally, ready for external audit
- 66 API routes live, 0 centralized database
- Product shipped end-to-end on Avalanche Fuji
- Repository: https://github.com/kaustubh76/Build-Games

**What we're asking:**

- **Seed: $500K** for 12 months of runway
  - $150K — smart contract audit + bug bounty
  - $150K — user acquisition (2 community managers, influencer seeding, referral pool)
  - $100K — infrastructure (0G Compute credits, Vercel pro, RPC)
  - $100K — engineering (1 FTE for marketplace + tournaments)

- **Strategic partners:**
  - Avalanche ecosystem (co-marketing, L1 subnet support)
  - 0G Labs (compute credits, co-announcement)
  - Sports-betting tech (regulatory counsel)

**Visual:** Three columns: team, ask, partners.

---

## Slide 14 — The Ask, One Line

> **We've built the product. We've verified it works on-chain, end-to-end, with real AVAX. We need capital and partners to put 10,000 warriors in front of spectators by end of year.**
>
> **warriors-ai-rena.vercel.app**

**Visual:** The logo, the URL, and a single CTA: *"Watch a battle live right now."*

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
