#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "   QueryQP AWS EC2 Automated Production Deployment       "
echo "=========================================================="

# 1. Detect OS and install Docker & Docker Compose Plugin
if ! command -v docker &> /dev/null; then
    echo ">> Installing Docker engine and compose plugin..."
    sudo apt-get update -y
    sudo apt-get install -y ca-certificates curl gnupg lsb-release
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker "$USER" || true
    echo ">> Docker installed successfully."
fi

# Ensure docker service is running
sudo systemctl enable docker
sudo systemctl start docker

# 2. Setup Production .env if missing
if [ ! -f .env ]; then
    echo ">> Creating production .env file from template..."
    cat << 'EOF' > .env
GROQ_API_KEY=${GROQ_API_KEY:-}
GROQ_MODEL=openai/gpt-oss-120b
LLAMA_CLOUD_API_KEY=${LLAMA_CLOUD_API_KEY:-}
DOCUMENT_PARSER=auto
JWT_SECRET_KEY=queryqp-prod-secret-key-2026-super-secure-production-deploy
ADMIN_DEFAULT_USERNAME=admin
ADMIN_DEFAULT_PASSWORD=admin123
EOF
    echo ">> Created .env template. Please edit .env if you need to add your API keys."
fi

# 3. Pull latest code from GitHub
echo ">> Fetching latest code from origin/main..."
git pull origin main

# 4. Build and start containers with Docker Compose
echo ">> Building and starting containers (Nginx, Redis, Celery Worker, FastAPI, Next.js)..."
sudo docker compose -f docker-compose.aws.yml down --remove-orphans || true
sudo docker compose -f docker-compose.aws.yml up -d --build

# 5. Health check
echo ">> Waiting for containers to become healthy (15 seconds)..."
sleep 15
sudo docker compose -f docker-compose.aws.yml ps

echo ""
echo "=========================================================="
echo "   QueryQP is LIVE and READY on AWS EC2!                  "
echo "=========================================================="
echo "Public URL:      http://16.176.164.0/"
echo "Admin Portal:    http://16.176.164.0/admin/login"
echo "Default Admin:   admin"
echo "Default Pass:    admin123"
echo "=========================================================="
