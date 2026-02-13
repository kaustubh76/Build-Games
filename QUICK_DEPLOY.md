# Quick Deployment Guide

## 🚀 Deploy to Production in 3 Steps

### Prerequisites
- Ubuntu 22.04 LTS server
- Root or sudo access
- Domain name configured

### Step 1: Setup Environment (5 minutes)

```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y curl git postgresql nginx

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Create application user
sudo useradd -m -s /bin/bash warriors
sudo usermod -aG sudo warriors
```

### Step 2: Configure Environment (5 minutes)

```bash
# Clone repository
cd /opt
sudo git clone https://github.com/your-org/WarriorsAI-rena.git
sudo chown -R warriors:warriors WarriorsAI-rena

# Create database
sudo -u postgres psql -c "CREATE DATABASE warriors_db;"
sudo -u postgres psql -c "CREATE USER warriors_user WITH ENCRYPTED PASSWORD 'your_secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE warriors_db TO warriors_user;"

# Configure environment
sudo mkdir -p /etc/WarriorsAI
sudo nano /etc/WarriorsAI/env
```

**Add to `/etc/WarriorsAI/env`:**

```bash
NODE_ENV=production
DATABASE_URL=postgresql://warriors_user:your_secure_password@localhost:5432/warriors_db
NEXT_PUBLIC_CHAIN_ID=545
NEXT_PUBLIC_FLOW_RPC_URL=https://testnet.evm.nodes.onflow.org
EXTERNAL_MARKET_MIRROR_ADDRESS=0x7485019de6Eca5665057bAe08229F9E660ADEfDa
NEXT_PUBLIC_CRWN_TOKEN_ADDRESS=0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6
PRIVATE_KEY=0xyour_private_key_here
ORACLE_PRIVATE_KEY=0xyour_oracle_private_key_here
```

```bash
# Secure environment file
sudo chmod 600 /etc/WarriorsAI/env
sudo chown warriors:warriors /etc/WarriorsAI/env
```

### Step 3: Deploy (10 minutes)

```bash
# Switch to warriors user
sudo su - warriors

# Run automated deployment
cd /opt/WarriorsAI-rena
./scripts/deploy-production.sh
```

**That's it!** 🎉

---

## Verify Deployment

```bash
# Check services are running
sudo systemctl status warriors-app
sudo systemctl status flow-event-listener

# Test API endpoints
curl http://localhost:3000/api/health
curl http://localhost:3000/api/rpc/health
curl http://localhost:3000/api/events/status

# View real-time monitoring
./scripts/monitor-flow-system.sh
```

---

## Setup Nginx Reverse Proxy (Optional but Recommended)

```bash
# Install SSL certificate
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com

# Configure Nginx
sudo nano /etc/nginx/sites-available/warriors
```

**Add:**

```nginx
upstream warriors_app {
    server localhost:3000;
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://warriors_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site and restart Nginx
sudo ln -s /etc/nginx/sites-available/warriors /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Common Commands

### Service Management
```bash
# Restart services
sudo systemctl restart warriors-app flow-event-listener

# Stop services
sudo systemctl stop warriors-app flow-event-listener

# View logs
sudo journalctl -u warriors-app -f
sudo journalctl -u flow-event-listener -f
```

### Monitoring
```bash
# Real-time dashboard
./scripts/monitor-flow-system.sh

# Check database health
npx ts-node scripts/check-database-health.ts

# View metrics
curl http://localhost:3000/api/metrics
```

### Updates
```bash
# Pull latest code
cd /opt/WarriorsAI-rena
git pull origin main

# Redeploy
./scripts/deploy-production.sh
```

### Backup
```bash
# Manual backup
pg_dump warriors_db | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore from backup
gunzip < backup_YYYYMMDD.sql.gz | psql warriors_db
```

---

## Troubleshooting

### Service Won't Start
```bash
# Check logs
sudo journalctl -u warriors-app -n 100

# Check environment
sudo cat /etc/WarriorsAI/env

# Reset service
sudo systemctl reset-failed warriors-app
sudo systemctl start warriors-app
```

### Database Connection Error
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -U warriors_user -d warriors_db -c "SELECT 1;"

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### Event Listener Not Syncing
```bash
# Check RPC health
curl http://localhost:3000/api/rpc/health

# Check event listener logs
sudo journalctl -u flow-event-listener -f

# Restart event listener
sudo systemctl restart flow-event-listener
```

---

## Getting Help

- **Full Documentation**: See [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md)
- **Technical Details**: See [PRODUCTION_READY_SUMMARY.md](./PRODUCTION_READY_SUMMARY.md)
- **Implementation Guide**: See [FLOW_IMPLEMENTATION_COMPLETE.md](./FLOW_IMPLEMENTATION_COMPLETE.md)

---

## Security Checklist

Before going live, ensure:

- [ ] Environment variables are secured (chmod 600)
- [ ] Firewall is configured (ufw)
- [ ] SSL certificate is installed
- [ ] Database user has limited permissions
- [ ] Backup strategy is in place
- [ ] Monitoring and alerts are configured
- [ ] Private keys are never exposed in logs or commits

---

## Performance Tips

- Monitor disk usage regularly (database grows over time)
- Run `VACUUM ANALYZE` on database monthly
- Keep Node.js and dependencies updated
- Use Prometheus + Grafana for advanced monitoring
- Configure log rotation to prevent disk fill

---

**Your Warriors AI implementation is ready for production! 🏆**
