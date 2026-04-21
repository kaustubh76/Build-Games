# Warriors AI-rena — Future Plan

**Horizon: 36 months. Four phases. Each phase is a standalone shippable product.**

---

## Guiding Principles

Three rules that shape every future decision:

1. **Shipped > aspirational.** Every phase marker is a feature in production, not a plan. We measure progress by on-chain txns and weekly active spectators, not by Notion cards.
2. **Spectator-first.** Any feature that requires the user to *play* before they can enjoy is rejected. Every feature must add value to the passive audience as its first win.
3. **Verifiable by default.** If it affects stakes, it runs on-chain or through 0G with cryptographic proofs. No centralized black boxes in the critical path.

---

## Assumptions Log

This plan is built on explicit beliefs. If any of these turn out false, the downstream phases are invalidated and we will republish. We revisit this list quarterly.

| # | Assumption | Rationale | Invalidation signal | Tripwire action |
|---|-----------|-----------|---------------------|-----------------|
| A1 | Avalanche C-Chain gas remains <$0.05 per battle tx at Year 1 volumes | Current cost is ~$0.001; 50× safety margin | Single battle tx costs >$0.10 at mainnet | Migrate to L1 subnet or evaluate Arbitrum / Base |
| A2 | 0G Compute uptime >99% with <5s median latency | Current empirical observation; 0G team SLA | Three rolling-7-day periods with <95% uptime | Increase fallback to include OpenAI direct + Anthropic |
| A3 | CRwN classification as utility token holds in US / EU / UAE / SG | 1:1 AVAX backing, no yield, no speculation | Any regulator classifies as gambling chip or security | Geo-fence affected region; obtain opinion letter |
| A4 | Viral battle clips drive <$5 CAC at 1K WAS scale | Similar mechanics in traditional esports (clips, Twitch highlights) | 3 months of paid testing yields CAC >$15 | Shift to direct partnerships; pause organic investment |
| A5 | Spectator betting legal in our launch jurisdictions (US ex-NV-NY, UK, EU) | On-chain settlement + token utility framing | Legal opinion recommends full exit from target market | Pivot to play-money / testnet-only mode in affected regions |
| A6 | 0G Storage availability >99% | Redundant nodes in 0G network | Multiple week-long outages requiring frontend fallbacks | Re-prioritize IPFS/Pinata redundancy; reduce 0G dependence |
| A7 | Avalanche L1 subnet tooling matures by Phase 3 | Roadmap from Ava Labs public | No subnet path by month 18 | Stay on C-Chain; optimize via batching |
| A8 | External audit completes in <12 weeks | Typical for firms like Spearbit / Code4rena | Audit unable to schedule within 16 weeks | Launch on Fuji-only; parallel two firms |
| A9 | At least 30% of bettors use the Influence mechanic | Mechanic is the key moat; usage drives stickiness | <10% usage after 4 weeks of mainnet | Redesign UI; consider auto-influence assist mode |
| A10 | Seed funding of $500K is sufficient for 12 months of runway | Based on single FTE + 2 contractors + $30K infra | Burn exceeds $50K/mo sustained | Cut 1 contractor; renegotiate infra; slow hiring |

---

## Phase Gates

**No phase begins until the previous phase's gate is cleared.** These are hard numeric thresholds, not aspirations.

### Gate 1 → 2 (required to open The Colosseum)

| Condition | Threshold |
|-----------|-----------|
| Weekly Active Spectators | ≥1,000 sustained for 4 consecutive weeks |
| External audit completed with 0 critical / 0 high unresolved findings | Yes |
| Contribution margin (revenue − variable cost) | >$0 for 3 consecutive months |
| Mainnet battles executed | ≥5,000 cumulative |
| Critical on-chain bugs in production | 0 in the last 30 days |

### Gate 2 → 3 (required to open The Kingdom)

| Condition | Threshold |
|-----------|-----------|
| Weekly Active Spectators | ≥10,000 sustained |
| Monthly CRwN transaction volume | ≥$1M |
| Tournament participants weekly | ≥500 |
| Warrior marketplace secondary volume | ≥$50K / month |
| Series A closed | ≥$3M raised |
| Team size | ≥6 full-time equivalents |

### Gate 3 → 4 (required to open The Empire)

| Condition | Threshold |
|-----------|-----------|
| Monthly Active Users | ≥50,000 |
| Monthly volume | ≥$5M |
| Creator arenas deployed | ≥100 |
| L1 subnet mainnet launched | Yes |
| DAO treasury | ≥$10M equivalent |
| Legal entity structure complete | C-corp + foundation |

---

## Phase 1 — The Arena (Now → 6 Months)

**Theme:** Lock in the spectator-betting loop on Avalanche mainnet.

**North Star:** 1,000 Weekly Active Spectators (WAS).

### Shipped Already

- 16 contracts deployed on Fuji with verified end-to-end battle flow
- 0G Compute AI inference with trait-based fallback
- 0G Storage data layer (PostgreSQL fully removed)
- Three-layer automation (Vercel cron + 2-second client polling + manual override)
- CRwN mint/burn at 1:1 AVAX parity
- Five-tier arena system (Unranked → Platinum)
- Influence / defluence smart contracts
- Verifiable trait signing via ECDSA
- Pre-flight arena init checks (rank match, traits active, same-ID guard)
- Snowtrace contract verification
- Full mainnet deployment pipeline (`deploy-mainnet.sh`, verify scripts)

### Shipping in Phase 1

**Q2 2026 (months 1–2)**
- [ ] External smart contract audit (Code4rena or Spearbit) — $60K budget
- [ ] Mainnet deployment to Avalanche C-Chain (43114)
- [ ] Migrate Fuji traffic, deprecate testnet arena (keep as sandbox)
- [ ] Mobile-first responsive redesign of `/arena` page
- [ ] 30-second auto-generated battle highlight clip pipeline (server-side FFmpeg render)

**Q3 2026 (months 3–4)**
- [ ] Discord bot: `!battle 7 vs 9` brings a live widget into Discord
- [ ] Referral smart contract with CRwN bonuses (both sides get 5 CRwN on referee's first bet)
- [ ] Warrior-of-the-Week algorithm (highest win rate + longest streak)
- [ ] Leaderboard page with time-window filters (24h / 7d / 30d / all-time)
- [ ] Push notifications for battles users have bets on

**Q4 2026 (months 5–6)**
- [ ] PWA (installable on home screen, offline-cached battle replays)
- [ ] 23 achievements system (5 rarities: Common 25XP → Legendary 500XP)
- [ ] 11-quest daily pool (4 quests per day, seeded random)
- [ ] Streak bonuses (3-day / 7-day / 30-day betting streaks multiply small CRwN reward)

### Phase 1 Success Criteria

| KPI | Minimum | Target | Stretch |
|-----|---------|--------|---------|
| WAS | 300 | 1,000 | 2,500 |
| Battles/day | 20 | 50 | 100 |
| Weekly CRwN volume | 50K | 200K | 500K |
| 7-day retention | 30% | 40% | 50% |
| CAC | <$10 | <$5 | <$3 |

### Kill Criteria

If fewer than **50 WAB after 6 weeks of mainnet open beta**, we pause and rethink the core loop. This is an explicit commitment.

### Phase 1 Resource Plan

| Milestone | FTE-weeks | $ Cost | Q |
|-----------|-----------|--------|---|
| External audit (Spearbit/Code4rena) | 8 audit-weeks (external) | $60K | Q2 |
| Mainnet deployment + verification | 3 FTE-weeks | $5K gas | Q2 |
| Mobile PWA redesign | 6 FTE-weeks | $0 (in-house) | Q2–Q3 |
| Highlight clip pipeline (server-side FFmpeg) | 4 FTE-weeks | $2K infra | Q3 |
| Discord bot + widget | 3 FTE-weeks | $0 | Q3 |
| Referral smart contract | 4 FTE-weeks | $5K audit-incremental | Q3 |
| Leaderboard page + filters | 2 FTE-weeks | $0 | Q3 |
| Push notifications | 2 FTE-weeks | $500 service | Q4 |
| PWA + offline cache | 4 FTE-weeks | $0 | Q4 |
| 23-achievement / 11-quest system | 5 FTE-weeks | $0 | Q4 |
| User acquisition (paid experiments) | — | $30K | Q3–Q4 |
| Community managers (2 contractors) | 48 contractor-weeks | $60K | Ongoing |
| **Phase 1 total** | ~41 FTE-weeks + 48 contractor-weeks | **~$162K** | |

Budget leaves ~$338K of the $500K seed for Phase 2 bridging, contingency, legal, and second-half infrastructure.

---

## Phase 2 — The Colosseum (6 → 12 Months)

**Theme:** Turn spectators into participants. Add social layers and deeper economies.

**North Star:** 10,000 WAS, $1M monthly CRwN volume.

### Features

**Tournaments**
- Bracket contracts: 8-slot, 16-slot, 32-slot
- Entry fees in CRwN; winner-takes-majority with multi-tier payout
- Weekly prize pools seeded from protocol treasury
- Leaderboard integration with ELO-based seeding
- Estimated implementation: 6 weeks

**Warrior Marketplace**
- ERC-2981 royalty support on `WarriorsNFT`
- Performance-priced floor: `floorPrice = baseFloor + winningsMultiplier(tokenId)`
- In-app buy/sell interface
- Warrior-of-the-Week auction (NFT burned into special cosmetic tier)
- Estimated implementation: 5 weeks

**Team Battles (3v3)**
- New `TeamArena.sol` contract
- 3 warriors per team, 5 rounds, shared HP pool
- Team bets, team influence
- Asymmetric team compositions (tank / DPS / support roles via trait mods)
- Estimated implementation: 8 weeks

**Live Spectator Chat**
- In-page chat tied to arena session
- No tokens required to chat; betting users get colored names
- Moderator bot + slow-mode
- Estimated implementation: 3 weeks

**Embeddable Battle Viewer**
- iframe widget for external sites
- Partnership with crypto news sites, Discord servers
- Monetization: ads on free views, white-label for partners
- Estimated implementation: 4 weeks

### Phase 2 Success Criteria

| KPI | Minimum | Target |
|-----|---------|--------|
| WAS | 5,000 | 10,000 |
| Monthly CRwN volume | $500K | $1M |
| Tournament participants (weekly) | 500 | 2,000 |
| Secondary sales volume | $50K/mo | $250K/mo |
| Embed placements | 20 sites | 100 sites |

---

## Phase 3 — The Kingdom (12 → 24 Months)

**Theme:** Become the platform layer for on-chain entertainment.

**North Star:** 50,000 MAU, $5M+ monthly volume.

### Features

**Prediction Market Integration**
- Live Polymarket / Kalshi feed resolves warrior match themes (e.g. "Election: Trump Arena")
- Match results determined by real-world event resolution, not just AI
- Cross-market liquidity: CRwN used as collateral in both markets
- Infrastructure built in Phase 1 (MatchedMarketPair, ExternalMarketMirror) activates here
- Estimated implementation: 12 weeks

**ERC-7857 AI Agent iNFTs**
- Full encrypted-strategy iNFTs
- Each agent is an autonomous trader with signed proofs
- Rent your agent to others; agent owner gets a cut of earnings
- Proxy re-encryption on transfer (strategy stays secret)
- Already deployed: `AIAgentINFT.sol` on 0G Galileo
- Estimated implementation: 10 weeks

**Creator Arenas**
- Anyone deploys a themed arena via `makeNewArena()`
- Creator sets custom influence costs, bet amounts, trait requirements
- Creator gets 2% of all pools in their arena
- Leaderboard: top creator arenas by volume
- Estimated implementation: 6 weeks

**Copy Trading**
- Subscribe to a top-performing agent/whale
- Their trades auto-mirror to your wallet (capped at user-set size)
- Infrastructure built in Phase 1 (`MirrorCopyTrade` collection) activates
- Subscription fee in CRwN to the whale
- Estimated implementation: 8 weeks

**Avalanche L1 Subnet**
- Dedicated subnet with CRwN as gas token
- Sub-second finality optimized for real-time influence mechanics
- Higher throughput (10K+ TPS) for tournaments
- Free for spectators (gasless meta-transactions for bets below threshold)
- Estimated implementation: 16 weeks (coordination with Avalanche team)

### Phase 3 Success Criteria

| KPI | Minimum | Target |
|-----|---------|--------|
| MAU | 25,000 | 50,000 |
| Monthly volume | $2M | $5M |
| Creator arenas | 50 | 200 |
| Active AI agents | 500 | 2,000 |
| L1 subnet launch | Beta | Mainnet |

---

## Phase 4 — The Empire (24 → 36 Months)

**Theme:** Multi-game platform, esports league, DAO governance.

**North Star:** 500,000 MAU.

### Features

**Multi-Game Platform**
- Same spectator framework, different game modes:
  - **Racing Arena** — AI-driven racing with trait-based car tuning
  - **Strategy Arena** — turn-based conquest with resource mechanics
  - **Trivia Arena** — AI asks, AI answers, fastest wins
- Unified CRwN economy across all games
- Shared leaderboard with cross-game ranking
- Each new game is a deployment pattern, not a rewrite

**Official Esports League**
- Weekly televised-style tournaments (Twitch + YouTube co-streams)
- Brand sponsorships (energy drinks, crypto exchanges)
- $100K+ monthly prize pools
- Team leagues with sponsorships

**Enterprise API**
- White-label spectator-betting infrastructure for other protocols
- "Polymarket inside" model: your market, our entertainment layer
- Revenue: 1% of all volume routed through the API

**Full DAO Governance**
- CRwN-holder votes on:
  - Fee parameters (bet %, influence cost curves)
  - Tournament prize pool sizing
  - New game approvals
  - Creator arena moderation policies
- Timelock + multi-sig for critical parameter changes

### Phase 4 Success Criteria

| KPI | Minimum | Target |
|-----|---------|--------|
| MAU | 250,000 | 500,000 |
| Games launched | 2 | 4 |
| Annual volume | $50M | $100M |
| DAO proposals | 20 | 50 |
| Brand sponsorships | 5 | 20 |

---

## Cross-Cutting Initiatives

### Security & Audits

**Continuous:**
- Bug bounty program on Immunefi from Phase 1 onward ($5K → $50K tiered)
- Every new contract deployment passes internal review + external audit
- Quarterly pen-tests on the game-master API (the single point of signing authority)

**Phase milestones:**
- Phase 1: External audit (Spearbit / Code4rena) — mandatory pre-mainnet
- Phase 2: Second audit for tournament + marketplace contracts
- Phase 3: Full protocol re-audit for iNFT + subnet
- Phase 4: Ongoing audit retainer

### AI Model Evolution

**Phase 1:** 0G Compute for move selection; trait-based fallback.

**Phase 2:** Add LLM-generated battle narratives (play-by-play commentary, post-battle recaps) — purely decorative, not affecting mechanics.

**Phase 3:** Encrypted strategy models inside iNFT agents (the *agent* picks moves based on its private strategy, not a shared engine).

**Phase 4:** User-trained agents; each user can fine-tune a base model and deploy it as a warrior-coach.

### Regulatory & Legal

- **Phase 1:** Engage US + EU crypto-specialized counsel. Map exposure to gambling / securities regulations per jurisdiction.
- **Phase 1:** Geo-fence high-risk jurisdictions at the CDN layer.
- **Phase 2:** Obtain legal opinion that CRwN is a utility token (1:1 AVAX backing makes this defensible).
- **Phase 3:** Regulatory sandbox applications in UK (FCA), Singapore (MAS), UAE (VARA).
- **Phase 4:** Full regulated entity structure if required for brand sponsorships.

### Treasury & Token Management

- **No team token allocation, ever.** All CRwN is minted 1:1 against user AVAX.
- **Protocol treasury** funded by 5% battle fee portion.
- **Treasury policy:** 50% held as AVAX (operational), 40% held as CRwN (liquidity), 10% held as stablecoins (audit + legal).
- **Multi-sig:** 4-of-7 on all treasury transactions from Phase 1.
- **Annual treasury report** published on-chain and in human-readable form.

---

## Dependencies & External Risks

### Hard Dependencies

| Dependency | Phase | Fallback |
|-----------|-------|----------|
| Avalanche mainnet stability | 1+ | Multi-region RPC, fallback providers |
| 0G Compute uptime | 1+ | Deterministic trait-based move fallback |
| 0G Storage availability | 1+ | IPFS/Pinata fallback retained |
| Vercel cron reliability | 1+ | Client polling covers gaps; manual override UI |
| Polymarket / Kalshi APIs | 3+ | Caching + multi-source oracles |

### External Risks Tracked

- **Avalanche ecosystem contraction** — mitigated by chain-agnostic contract design (easily portable to Arbitrum, Base)
- **Regulatory shift on gambling-adjacent products** — mitigated by utility-token framing + geo-fencing
- **0G Network maturity** — we have IPFS/Pinata and deterministic fallback; reducing dependence quarterly
- **AI model cost inflation** — 0G pricing is competitive with OpenAI; self-host option in Phase 4

---

## Decision Cadence

- **Weekly:** Product standup, KPI dashboard review, bug triage
- **Monthly:** Roadmap retrospective, kill-criteria check, treasury report
- **Quarterly:** Public progress update (blog post + Discord AMA), audit renewal check
- **Annually:** Strategy retreat, full roadmap re-planning for next 12 months

---

## What We Will NOT Do

To avoid scope creep and feature-salad, here's what's explicitly out of scope:

- **No token launch beyond CRwN.** No governance token, no yield token, no "vCRwN staking". CRwN is the only asset.
- **No NFT gacha mechanics.** Trait generation is transparent. No randomized loot boxes.
- **No fiat on-ramp integration in Phase 1.** Users bridge AVAX. Fiat comes in Phase 3 at earliest, and only through regulated partners.
- **No aggressive growth hacks that break unit economics.** If CAC > $15, we pause paid acquisition.
- **No closed-source critical paths.** All smart contracts are verified on Snowtrace. All off-chain signing logic is auditable.
- **No centralized hosting of battle state.** 0G Storage and Avalanche only. If they are down, battles are delayed, not mis-settled.

---

## The Long View

Warriors AI-rena is a bet that on-chain entertainment will eventually look like traditional entertainment — massive audiences, small stakes per person, deep engagement loops — but with verifiable fairness, real ownership, and mechanics that only on-chain infrastructure makes possible (like spectator influence).

Getting there is a 3-year grind through four phases. Each phase has to independently stand on its own legs. We're not asking anyone to wait for Phase 4 to see value; Phase 1 is already live, verifiable, and fun.

If this works, it becomes the template for the next category of consumer crypto products. If it doesn't, the kill criteria fire early enough that we can redirect without burning the treasury.

Either way, we will know soon. That's the point of shipping.
