# WarriorsAI-rena Frontend

Next.js 15 frontend for the AI-powered NFT battle arena on Avalanche C-Chain.

**Live:** https://warriors-ai-rena.vercel.app/

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Environment Variables

Copy `.env` and fill in the required values. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_CHAIN_ID` | Yes | `43113` (Fuji) or `43114` (mainnet) |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | Yes | WalletConnect project ID |
| `PRIVATE_KEY` | Yes | Server-side signing key (for 0G + game master) |
| `GAME_MASTER_PRIVATE_KEY` | Yes | Signs battle moves on-chain |
| `AI_SIGNER_PRIVATE_KEY` | Yes | Signs warrior trait assignments |
| `ZG_COMPUTE_PROVIDER` | Yes | 0G Compute provider address |
| `ZG_EVM_RPC` | Yes | 0G Galileo testnet RPC |
| `ZG_INDEXER_RPC` | Yes | 0G Storage indexer URL |
| `CRON_SECRET` | Production | Vercel cron authentication |

## Project Structure

```
src/
  app/                    # Next.js App Router pages
    arena/                # Arena battle page
    warriorsMinter/       # NFT minting page
    leaderboard/          # Warrior leaderboard
    api/                  # 66 API routes
      arena/              # Arena battle APIs
      0g/                 # 0G Storage/Compute APIs
      game-master/        # Battle orchestration
      cron/               # Scheduled tasks
  services/               # Business logic
    arenaService.ts       # Arena contract interactions
    warriorsNFTService.ts # NFT contract interactions
    arenaFactoryService.ts # Arena creation
  hooks/                  # React hooks
    useArenas.ts          # Arena listing + details
  lib/
    0g/                   # 0G Storage data layer
      store.ts            # Collection-based in-memory store with 0G persistence
      collections.ts      # Typed document definitions (40+ models)
      db.ts               # Prisma-compatible API adapter
  constants.ts            # Chain config, contract addresses, ABIs
```

## Key Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/arena` | Arena battle page — initialize, bet, battle |
| `/warriorsMinter` | Mint and activate warrior NFTs |
| `/leaderboard` | Warrior rankings and stats |
| `/whale-tracker` | Whale trade tracking |
| `/external` | External market integration (Polymarket/Kalshi) |

## Data Layer

All data persistence uses **0G Decentralized Storage** instead of a centralized database:

- `lib/0g/store.ts` — In-memory `Collection` class with 0G Storage persistence
- `lib/0g/db.ts` — Prisma-compatible API (findUnique, findMany, create, update, $transaction, aggregate, groupBy)
- `lib/prisma.ts` — Re-exports the 0G db as `prisma` for zero-change migration across 88+ files

## Build

```bash
npm run build    # Production build
```

## Deploy

```bash
npx vercel --prod
```

Deployed to Vercel with serverless functions. See `vercel.json` for configuration.
