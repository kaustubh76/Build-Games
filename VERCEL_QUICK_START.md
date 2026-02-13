# 🚀 Vercel Quick Start - Deploy in 5 Minutes

## Option 1: One-Command Deploy (Fastest)

```bash
cd /Users/apple/WarriorsAI-rena
./scripts/deploy-vercel.sh production
```

That's it! The script will:
1. ✅ Verify Vercel CLI is installed
2. ✅ Test the build
3. ✅ Deploy to production
4. ✅ Show deployment URL

---

## Option 2: Manual Deploy

### Step 1: Navigate to frontend
```bash
cd /Users/apple/WarriorsAI-rena/frontend
```

### Step 2: Deploy to production
```bash
vercel --prod
```

### Step 3: Follow prompts
- Select your team: `team_zPsrrkCnFi6oNMUiN38NlXIw`
- Confirm project: `frontend`
- Deploy!

---

## 🔐 Required: Configure Environment Variables

After deploying, you MUST add environment variables:

### Quick Method - Vercel Dashboard:
1. Go to: https://vercel.com/your-team/frontend/settings/environment-variables
2. Copy values from [`.env.vercel.template`](frontend/.env.vercel.template)
3. Add each variable for "Production" environment
4. Redeploy: `vercel --prod`

### CLI Method:
```bash
cd frontend

# Add each variable
vercel env add NEXT_PUBLIC_FLOW_TESTNET_RPC production
# Enter: https://testnet.evm.nodes.onflow.org

vercel env add NEXT_PUBLIC_CHAIN_ID production
# Enter: 545

vercel env add EXTERNAL_MARKET_MIRROR_ADDRESS production
# Enter: 0x7485019de6Eca5665057bAe08229F9E660ADEfDa

# ... continue for all variables in .env.vercel.template

# Redeploy after adding variables
vercel --prod
```

---

## ⚠️ Critical Environment Variables

These MUST be configured:

### 1. Blockchain Configuration
```bash
NEXT_PUBLIC_FLOW_TESTNET_RPC=https://testnet.evm.nodes.onflow.org
NEXT_PUBLIC_CHAIN_ID=545
EXTERNAL_MARKET_MIRROR_ADDRESS=0x7485019de6Eca5665057bAe08229F9E660ADEfDa
NEXT_PUBLIC_CRWN_TOKEN_ADDRESS=0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6
```

### 2. Private Keys (⚠️ Production Keys Only!)
```bash
PRIVATE_KEY=0x...your_production_key
ORACLE_PRIVATE_KEY=0x...your_oracle_key
```

### 3. Database
```bash
DATABASE_URL=postgresql://...?sslmode=require
```

### 4. 0G Storage (Deploy Separately First!)
```bash
NEXT_PUBLIC_STORAGE_API_URL=https://your-0g-storage.com
```

---

## 📊 Verify Deployment

### 1. Check deployment URL
```bash
# Your app will be at:
https://your-app.vercel.app
```

### 2. Test API endpoints
```bash
# Flow Execute API
curl https://your-app.vercel.app/api/flow/execute

# Should return: { "success": true, "status": "operational", ... }
```

### 3. Check metrics
```bash
curl https://your-app.vercel.app/api/metrics
```

### 4. Monitor logs
```bash
vercel logs --follow
```

---

## 🔄 Deploy 0G Storage (Required)

⚠️ **0G Storage CANNOT run on Vercel** - deploy to a separate server:

### Quick Deploy - Docker on VPS:
```bash
# SSH to your VPS
ssh user@your-server.com

# Clone and deploy
git clone <your-repo>
cd your-repo/frontend/0g-storage
npm install
npm run build
npm start

# Or use Docker
docker build -t 0g-storage .
docker run -d -p 3001:3001 --name 0g-storage 0g-storage
```

### Then update Vercel env var:
```bash
vercel env add NEXT_PUBLIC_STORAGE_API_URL production
# Enter: https://your-0g-server.com
```

---

## 🎯 Deployment Checklist

- [ ] Deploy frontend to Vercel: `vercel --prod`
- [ ] Configure all environment variables in Vercel Dashboard
- [ ] Deploy 0G storage to separate server
- [ ] Update `NEXT_PUBLIC_STORAGE_API_URL` in Vercel
- [ ] Configure database (Vercel Postgres or external)
- [ ] Test API endpoints
- [ ] Verify metrics are working
- [ ] Check logs for errors
- [ ] Configure custom domain (optional)

---

## 📚 Full Documentation

For complete deployment guide, see:
- [VERCEL_DEPLOYMENT_GUIDE.md](VERCEL_DEPLOYMENT_GUIDE.md) - Complete guide
- [frontend/.env.vercel.template](frontend/.env.vercel.template) - All environment variables

---

## 🆘 Quick Troubleshooting

### Build fails?
- Check: `npm run build` works locally
- Logs: `vercel logs`

### API returns 500?
- Check: Environment variables configured
- Check: DATABASE_URL is correct
- Check: Private keys are set

### Database connection fails?
- Add `?sslmode=require` to DATABASE_URL
- Check: Database allows connections from Vercel IPs

### 0G storage fails?
- 0G storage must be on separate server
- Update: `NEXT_PUBLIC_STORAGE_API_URL`

---

## 🚀 Deploy Now!

```bash
cd /Users/apple/WarriorsAI-rena
./scripts/deploy-vercel.sh production
```

Then configure environment variables and you're live! 🎉
