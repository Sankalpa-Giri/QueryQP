#!/usr/bin/env bash
set -e

DOMAIN="queryqp.duckdns.org"
REPO_DIR="/home/ubuntu/QueryQP"

echo "=============================================="
echo " Setting up Let's Encrypt SSL for $DOMAIN"
echo "=============================================="

cd "$REPO_DIR"

echo ">> 1. Pulling latest codebase from origin/main..."
git fetch origin main
git reset --hard origin/main

echo ">> 2. Installing certbot if not present..."
if ! command -v certbot &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y certbot
fi

echo ">> 3. Temporarily stopping Nginx container to free port 80 for SSL challenge..."
sudo docker compose -f docker-compose.aws.yml stop nginx || true

echo ">> 4. Requesting Let's Encrypt Certificate for $DOMAIN..."
sudo certbot certonly --standalone \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    -m "admin@$DOMAIN" \
    --preferred-challenges http \
    --keep-until-expiring

echo ">> 5. Updating Nginx configuration to enable HTTPS..."
cp nginx/nginx.ssl.conf nginx/nginx.conf

echo ">> 6. Updating docker-compose.aws.yml to mount certificates..."
# Ensure /etc/letsencrypt volume is in docker-compose.aws.yml
if ! grep -q "/etc/letsencrypt:/etc/letsencrypt:ro" docker-compose.aws.yml; then
    sed -i '/\.\/nginx\/nginx\.conf:\/etc\/nginx\/nginx\.conf:ro/a \      - \/etc\/letsencrypt:\/etc\/letsencrypt:ro' docker-compose.aws.yml
fi

echo ">> 7. Rebuilding and restarting all containers..."
sudo docker compose -f docker-compose.aws.yml build frontend
sudo docker compose -f docker-compose.aws.yml up -d

echo ">> 8. Verifying running containers..."
sleep 5
sudo docker compose -f docker-compose.aws.yml ps

echo ">> 9. Setting up automatic renewal cron job..."
(crontab -l 2>/dev/null | grep -v "certbot renew" ; echo "0 3 * * * certbot renew --quiet --pre-hook 'docker stop pyq-nginx' --post-hook 'docker start pyq-nginx'") | crontab -

echo "=============================================="
echo " SUCCESS! https://$DOMAIN is now LIVE with SSL!"
echo "=============================================="
