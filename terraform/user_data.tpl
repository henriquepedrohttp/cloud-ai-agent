#!/bin/bash
set -e

echo "=== Iniciando deploy do Cloud AI Agent ==="

# Atualizar sistema e instalar Docker
apt update
apt install -y docker.io docker-compose git

# Iniciar serviço Docker
systemctl start docker
systemctl enable docker

# Clonar repositório do GitHub
echo "=== Clonando repositório ==="
git clone ${github_repo} /app
cd /app

# Criar arquivo .env com a API key
echo "OPENCODE_API_KEY=${opencode_api_key}" > .env
echo "PORT=3000" >> .env

# Build da imagem Docker
echo "=== Buildando container ==="
docker build -t cloud-ai-agent .

# Parar container existente se houver
docker rm -f cloud-ai-agent 2>/dev/null || true

# Rodar o container
echo "=== Iniciando aplicação ==="
docker run -d -p 3000:3000 --env-file .env --name cloud-ai-agent cloud-ai-agent

echo "=== Deploy concluído! ==="