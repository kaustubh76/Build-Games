# Avalanche Warriors AI-rena — AVAX Build Games Hackathon Submission

## Tech Stack

### Frontend
- **Next.js 15** (App Router + Pages Router) with **React 19** and **TypeScript 5**
- **TailwindCSS 4** for styling, **Framer Motion** for animations
- **RainbowKit 2.2.8** + **wagmi 2.15.6** + **viem 2.31.4** for wallet connection and contract interactions
- Deployed on **Vercel** at https://warriors-ai-rena.vercel.app

### Backend (Serverless API Routes)
- **66 Next.js API routes** (App Router + Pages Router) — fully serverless on Vercel
- **0G Storage** for decentralized data persistence (battle results, warrior metadata, verified predictions)
- **In-memory collections** with Prisma-compatible API and periodic 0G flush
- **Zod** for runtime schema validation on external API responses

### AI & Inference
- **OpenAI SDK v5.7.0** — direct calls for warrior generation, battle debates, and prediction analysis
- **0G Compute Network** — verifiable AI inference with cryptographic proof for predictions
- **Google Generative AI (Gemini)** — fallback model for redundancy

### Blockchain (Avalanche C-Chain, Fuji Testnet)
- **12+ smart contracts** deployed (WarriorsNFT, CrownToken, ArenaFactory, PredictionArena, AIAgentINFT, PredictionMarketAMM, MicroMarketFactory, ExternalMarketMirror, and more)
- **ERC-7857 iNFT standard** for AI agents with encrypted on-chain strategies
- **CRwN (Crown Token)** — ERC-20, 1:1 AVAX-backed, used for all in-game economics

### Storage
- **0G Decentralized Storage** — primary storage for warrior metadata, battle data, and market snapshots
- **IPFS/Pinata** — fallback and legacy image storage
- URI scheme: `storage://` (with `0g://` backward compatibility for existing on-chain NFTs)

### External Integrations
- **Polymarket** (Gamma API + CLOB API + WebSocket) — real-time prediction market data and whale tracking
- **Kalshi** (Trade API v2 + JWT auth + WebSocket) — regulated prediction market integration

---

## Architecture Decisions

### Why Serverless on Vercel (not a dedicated backend)?
All game logic runs in Next.js API routes. This eliminates infrastructure management, scales automatically, and keeps the entire stack in one repo. Battle state is stored on-chain (Arena contracts) with supplementary data persisted to 0G Storage for verifiability.

### Why Direct OpenAI Calls (no proxy/middleware)?
Simplicity. The OpenAI SDK is called directly from API routes for warrior trait generation, battle debate rounds, and market analysis. No added latency from proxy layers. 0G Compute provides a separate verifiable inference path when cryptographic proof is needed.

### Why 0G Storage over pure IPFS?
0G provides content-addressable decentralized storage with better throughput and native Avalanche ecosystem alignment. IPFS/Pinata is retained as fallback for resilience. The `storage://` URI scheme abstracts the storage backend.

### Why ERC-7857 for AI Agents?
ERC-7857 (iNFT standard) enables encrypted metadata on-chain — agent strategies are encrypted using proxy re-encryption, so only authorized users can decrypt them. This enables trustless copy trading where strategy IP is protected.

### Why Mirror External Markets On-Chain?
By mirroring Polymarket/Kalshi markets into on-chain AMM pools, users can trade prediction outcomes using CRwN on Avalanche without needing accounts on centralized platforms. Creators earn 2% fees on mirrored volume.

### Why CRwN Token (not raw AVAX)?
CRwN wraps AVAX 1:1 to create a contained game economy. It enables: controlled burn mechanics, spending approvals for arena betting, influence/defluence systems, and clean separation between game funds and wallet AVAX.

---

## Implementation Approach

The system is built around **three core loops**:

### Loop 1: Warrior NFT Lifecycle
`Mint → AI Trait Generation → On-Chain Trait Activation (signed by Game Master) → Battle`

The Game Master server-side key signs trait activations using `encodePacked` + `keccak256`, verified on-chain by the WarriorsNFT contract. This ensures only AI-generated traits are accepted.

### Loop 2: Prediction Battle Engine
`Match Warriors → 5-Round AI Debate → Score & Judge → Store to 0G → Settle Bets`

Each round: both warriors generate arguments via OpenAI considering their traits and moves (STRIKE, TAUNT, DODGE, SPECIAL, RECOVER). An AI judge scores based on logic, evidence, and move effectiveness. Complete battle data is hashed and stored to 0G Storage for verifiability.

### Loop 3: Market & Copy Trading
`Sync External Markets → Mirror On-Chain → Track Whales → Enable Copy Trading → Calculate P&L`

Polymarket and Kalshi markets are synced, mirrored into on-chain AMM pools, and whale trades (>$10k) are tracked in real-time via WebSockets. Users can follow whales or iNFT agents to auto-mirror trades.

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 15)             │
│  Wallet (RainbowKit) ←→ 60+ Hooks ←→ 15+ Pages     │
└──────────────┬──────────────────────┬────────────────┘
               │ API calls            │ Contract calls (viem/wagmi)
               ▼                      ▼
┌──────────────────────┐  ┌───────────────────────────────────┐
│  66 API Routes       │  │  Avalanche Fuji (12+ Contracts)   │
│  (Vercel Serverless) │  │  WarriorsNFT, CrownToken,        │
│                      │  │  PredictionArena, AIAgentINFT,    │
│  ┌────────────────┐  │  │  PredictionMarketAMM,            │
│  │ OpenAI SDK     │  │  │  ExternalMarketMirror,           │
│  │ 0G Compute     │  │  │  MicroMarketFactory...           │
│  │ Gemini         │  │  └───────────────────────────────────┘
│  └────────────────┘  │
│  ┌────────────────┐  │  ┌───────────────────────────────────┐
│  │ 0G Data Layer  │──┼─→│  0G Storage (decentralized)       │
│  └────────────────┘  │  │  Battles, Markets, Agents, Whales │
│  ┌────────────────┐  │  └───────────────────────────────────┘
│  │ 0G Storage     │  │
│  │ IPFS/Pinata    │  │  ┌───────────────────────────────────┐
│  └────────────────┘  │  │  External APIs                    │
│  ┌────────────────┐  │  │  Polymarket (Gamma + CLOB + WS)   │
│  │ Game Master    │──┼─→│  Kalshi (Trade API + JWT + WS)    │
│  │ Signing        │  │  └───────────────────────────────────┘
│  └────────────────┘  │
└──────────────────────┘
```

**On-chain**: NFT ownership, token balances, trait verification, market settlements, bet pools, creator revenue splits

**Off-chain**: AI inference, battle narration, market data sync, whale tracking, encrypted strategy storage, battle state management

---

## User Journey

### Step 1: Land & Connect
User visits the app, sees the game overview with live battles and leaderboards. Connects wallet via RainbowKit (MetaMask, WalletConnect, or Coinbase Wallet) on Avalanche Fuji.

### Step 2: Mint CRwN Tokens
User wraps AVAX into CRwN (1:1) to participate in the game economy. CRwN is required for betting, influence, and copy trading.

### Step 3: Mint a Warrior NFT
User fills out warrior creation form (name, bio, personality, knowledge areas), uploads an image. AI generates traits (strength, wit, charisma, defence, luck on 0-10000 scale) and unique moves. Image + metadata stored to 0G Storage. NFT minted on WarriorsNFT contract.

### Step 4: Activate Warrior Traits
User triggers trait activation. Server generates traits via AI, signs them with the Game Master key, and the user submits the signature on-chain. Contract verifies the signature matches the authorized AI signer.

### Step 5: Enter the Prediction Arena
User browses available prediction battles linked to real-world markets (Polymarket/Kalshi). Selects a market, picks their warrior, chooses a side (YES/NO), and stakes CRwN.

### Step 6: Watch AI Battle
5 rounds of AI-powered debate unfold. Each warrior uses moves informed by their traits. An AI judge scores each round. Users can use **Influence** (boost their warrior's damage with CRwN) or **Defluence** (weaken the opponent, limited 1x per battle). Spectators can place side bets.

### Step 7: Collect Rewards
Winner takes 95% of the losing pool. Battle data is hashed and stored to 0G Storage for permanent verifiability. Warrior stats (Elo, win rate, earnings) update on the leaderboard.

### Step 8: Explore AI Agents (iNFTs)
User browses AI agents with encrypted strategies (ERC-7857). Can view agent performance, accuracy, ROI. Can follow agents to auto-copy their trades. Can mint their own iNFT agent with a custom strategy.

### Step 9: Trade Prediction Markets
User trades YES/NO outcome tokens on mirrored markets (Polymarket/Kalshi) or user-created micro markets. AMM provides instant liquidity. Creators earn 2% on mirrored volume.

### Step 10: Track Whales & Copy Trade
User monitors whale trades (>$10k) in real-time. Follows top traders, configures copy trade parameters (max amount, percentage, auto-mirror). System auto-executes mirror trades on-chain.

### Step 11: Check Portfolio & Leaderboard
User reviews unified portfolio across native and mirror markets, checks P&L, views global warrior and agent leaderboards.

---

## MoSCoW Feature Prioritization

### Must Have (Core MVP — Shipped)
- **Warrior NFT Minting & Trait Activation** — AI-generated warriors with on-chain verified traits via Game Master signature
- **5-Round AI Battle System** — OpenAI-powered debates with move mechanics (STRIKE, TAUNT, DODGE, SPECIAL, RECOVER) and AI judging
- **CRwN Token Economy** — 1:1 AVAX-backed token for all in-game transactions
- **Prediction Arena with Betting** — Stake CRwN on warrior outcomes tied to real prediction markets
- **Wallet Integration** — RainbowKit + wagmi for seamless Avalanche wallet connection
- **0G Decentralized Storage** — Battle data and warrior metadata stored on 0G with content-addressable hashes
- **External Market Sync** — Polymarket and Kalshi market data fetched and displayed
- **Leaderboard** — Warrior rankings by wins, Elo, and earnings

### Should Have (High Value — Shipped)
- **AI Agent iNFTs (ERC-7857)** — Encrypted strategy agents with performance tracking and copy trading
- **Mirror Markets (On-Chain AMM)** — Trade external market outcomes on-chain using CRwN
- **Whale Tracking & Alerts** — Real-time monitoring of large trades on Polymarket/Kalshi via WebSocket
- **Copy Trading System** — Follow whales or AI agents to auto-mirror trades
- **Influence/Defluence Mechanics** — Spend CRwN to boost or weaken warriors during battle
- **0G Compute Verified Predictions** — Cryptographically verifiable AI inference for predictions
- **Battle Data Persistence** — Complete battle history stored to 0G Storage with SHA256 hashes

### Could Have (Nice to Have — Partially Built)
- **User-Created Micro Markets** — Let users create their own prediction markets on any topic
- **Arbitrage Detection** — Cross-platform price difference alerts between Polymarket/Kalshi/on-chain
- **Creator Revenue Dashboard** — Track creator fees from mirrored market volume (2% fee)
- **Daily Quests & Gamification** — Streak tracking, quests, and achievement badges
- **Social Sharing** — Share markets and battles to Twitter, Discord, Telegram
- **AI Debate Visualization** — Dedicated debate view with round-by-round argument display
- **Cross-Chain Messaging** — Multi-chain message passing (service exists, not fully integrated)

### Won't Have (Out of Scope for MVP)
- **Mainnet Deployment** — Staying on Fuji Testnet for hackathon
- **Real Money Trading** — All trades use testnet AVAX/CRwN
- **Mobile App** — Web-only for MVP
- **Governance/DAO** — No on-chain governance mechanism
- **Tournament Brackets** — Structured tournament mode deferred
- **Multi-Language Support** — English only
- **Advanced Charting/Analytics** — Basic portfolio view only, no candlestick charts
