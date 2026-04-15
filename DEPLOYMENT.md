# Deployment Guide

Complete guide for deploying Warriors AI-rena to Avalanche C-Chain (Fuji testnet or mainnet).

## Prerequisites

- **Node.js 18+** and **npm**
- **Foundry** (install: `curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- **Funded deployer wallet** on the target chain:
  - Fuji testnet: ~1 AVAX from [faucet](https://faucet.avax.network/)
  - Mainnet: ~3 AVAX real (16 contracts × ~0.1-0.2 AVAX each + gas buffer)
- **Snowtrace API key** (free from [snowtrace.io](https://snowtrace.io/apis))
- **Vercel account** with the `warriors-ai-rena` project linked

---

## Testnet Deployment (Fuji)

The testnet is already deployed. Contract addresses are committed to [frontend/src/constants.ts](frontend/src/constants.ts) and [deployments/avalanche-testnet.json](deployments/avalanche-testnet.json).

To redeploy from scratch:

```bash
# 1. Copy env template and fill in keys
cp .env.mainnet .env
# Edit .env:
#   DEPLOYER_PRIVATE_KEY=0x...  (your Fuji deployer key)
#   SNOWTRACE_API_KEY=...
#   AI_SIGNER_ADDRESS=0x...     (public address of your AI signer)
# Also change RPC in scripts/deploy-mainnet.sh to Fuji:
#   RPC="https://api.avax-test.network/ext/bc/C/rpc"
#   CHAIN_ID=43113

# 2. Build contracts
forge build

# 3. Deploy
forge script script/DeployAvalancheSimplified.s.sol \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --broadcast --verify \
  --etherscan-api-key $SNOWTRACE_API_KEY \
  -vvvv

# 4. Capture addresses from broadcast/ and update frontend/src/constants.ts chain 43113
```

---

## Mainnet Deployment (C-Chain)

### Pre-Flight Checklist

- [ ] Fresh deployer wallet generated (`cast wallet new`)
- [ ] Deployer funded with ≥2 AVAX on C-Chain mainnet
- [ ] `.env.mainnet` filled in with real values (NEVER commit this)
- [ ] Snowtrace API key ready
- [ ] Foundry installed and updated
- [ ] Repo is on `main` branch with no uncommitted changes
- [ ] Vercel project linked (`npx vercel link`)
- [ ] Team notified of deployment window

### One-Command Deploy

```bash
./scripts/deploy-mainnet.sh
```

This script:
1. Runs pre-flight checks (keys, balance, toolchain)
2. Compiles contracts (`forge build`)
3. Deploys 16 contracts via `script/DeployAvalancheSimplified.s.sol`
4. Verifies all contracts on Snowtrace (with 3-retry logic)
5. Updates `frontend/src/constants.ts` with mainnet addresses (chain 43114)
6. Writes `deployments/avalanche-mainnet.json`
7. Generates a Vercel env patch file

### Manual Deploy (if you want to run steps individually)

```bash
# 1. Configure
cp .env.mainnet .env
# Edit .env with real values

# 2. Build
forge build

# 3. Deploy contracts
forge script script/DeployAvalancheSimplified.s.sol \
  --rpc-url https://api.avax.network/ext/bc/C/rpc \
  --broadcast --verify \
  --etherscan-api-key $SNOWTRACE_API_KEY \
  -vvvv

# 4. Update frontend constants.ts manually with deployed addresses
# (see frontend/src/constants.ts chain 43114 block)

# 5. Push env vars to Vercel
./scripts/setup-vercel-env.sh mainnet

# 6. Deploy frontend
cd frontend && npx vercel deploy --prod --yes
cd .. && npx vercel alias <deploy-url> warriors-ai-rena.vercel.app
```

### Post-Deploy Verification

```bash
# 1. Check all contracts are verified on Snowtrace
./scripts/verify-contracts-snowtrace.sh mainnet

# 2. Run deployment health checks
./scripts/verify-deployment.sh mainnet

# 3. Smoke test the live site
curl -I https://warriors-ai-rena.vercel.app/
curl https://warriors-ai-rena.vercel.app/api/arena/leaderboard
```

### Switching Between Testnet and Mainnet

The frontend reads `NEXT_PUBLIC_CHAIN_ID` at build time. To switch:

```bash
# Testnet
npx vercel env add NEXT_PUBLIC_CHAIN_ID production
# Enter: 43113

# Mainnet
npx vercel env add NEXT_PUBLIC_CHAIN_ID production
# Enter: 43114

# Redeploy
cd frontend && npx vercel deploy --prod --yes
```

---

## Environment Variables (Vercel)

The frontend requires these env vars on Vercel:

### Public (client-exposed)
- `NEXT_PUBLIC_CHAIN_ID` — `43113` or `43114`
- `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` — from cloud.walletconnect.com
- `NEXT_PUBLIC_AVALANCHE_TESTNET_RPC` / `NEXT_PUBLIC_AVALANCHE_MAINNET_RPC`
- `NEXT_PUBLIC_BASE_URL` — `https://warriors-ai-rena.vercel.app`
- `NEXT_PUBLIC_0G_CHAIN_ID` — `16602` (0G Galileo testnet for iNFT)

### Server-side (secrets)
- `PRIVATE_KEY` — General 0G signing
- `GAME_MASTER_PRIVATE_KEY` — Signs battle moves
- `AI_SIGNER_PRIVATE_KEY` — Signs warrior trait assignments
- `ORACLE_PRIVATE_KEY` — Oracle fallback
- `CRON_SECRET` — Vercel cron auth (auto-set on deploy)
- `ZG_COMPUTE_PROVIDER` — 0G Compute provider address
- `ZG_EVM_RPC` — `https://evmrpc-testnet.0g.ai`
- `ZG_INDEXER_RPC` — `https://indexer-storage-testnet-turbo.0g.ai`

Use `./scripts/setup-vercel-env.sh <testnet|mainnet>` to push these automatically.

---

## Rollback

If mainnet deployment goes wrong:

```bash
# 1. Revert frontend to previous Vercel deploy
npx vercel rollback

# 2. Reset NEXT_PUBLIC_CHAIN_ID back to 43113 (testnet)
npx vercel env rm NEXT_PUBLIC_CHAIN_ID production
npx vercel env add NEXT_PUBLIC_CHAIN_ID production  # enter 43113

# 3. Revert constants.ts via git
git revert <mainnet-update-commit>
git push origin main

# 4. Redeploy
cd frontend && npx vercel deploy --prod --yes
```

Smart contracts cannot be "rolled back" — if deployment is broken, you must redeploy fresh contracts and update addresses.

---

## Troubleshooting

**"execution reverted" during deployment**
- Check deployer balance (need ~2 AVAX for full deploy)
- Verify `AI_SIGNER_ADDRESS` in `.env` is a valid address (not placeholder)

**Snowtrace verification fails**
- Rate limit: wait 30s and retry
- Run `./scripts/verify-contracts-snowtrace.sh mainnet` to retry individual contracts
- Check Solidity version matches `foundry.toml` setting

**Frontend shows wrong chain**
- Check Vercel env var `NEXT_PUBLIC_CHAIN_ID` matches deployment target
- Must redeploy after changing env vars (they're baked in at build time for `NEXT_PUBLIC_*`)

**Battle initialization uses wrong warrior IDs**
- See [arena/page.tsx](frontend/src/app/arena/page.tsx) `handleInitializeArena` — has pre-flight checks and error handling for stale arena state

**Contracts deployed but frontend can't read them**
- Verify `constants.ts` chain 43114 block has the deployed addresses (not zero addresses)
- Check RPC URL reachability: `curl https://api.avax.network/ext/bc/C/rpc -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'`
