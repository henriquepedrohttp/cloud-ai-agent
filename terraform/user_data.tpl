#!/bin/bash

LOG_FILE="/var/log/deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Iniciando deploy do Cloud AI Agent ==="

# Atualizar sistema e instalar Docker
log "Instalando Docker e dependências..."
apt update >> "$LOG_FILE" 2>&1 || log "ERRO: apt update falhou"
apt install -y docker.io docker-compose git >> "$LOG_FILE" 2>&1 || log "ERRO: Docker install falhou"

# Iniciar serviço Docker
log "Iniciando serviço Docker..."
systemctl start docker >> "$LOG_FILE" 2>&1 || log "ERRO: Docker start falhou"
systemctl enable docker >> "$LOG_FILE" 2>&1 || log "ERRO: Docker enable falhou"

# Clonar repositório do GitHub
log "Clonando repositório do GitHub..."
git clone ${github_repo} /app >> "$LOG_FILE" 2>&1 || log "ERRO: git clone falhou"
cd /app

# Criar arquivo .env com a API key
log "Criando arquivo .env..."
echo "OPENCODE_API_KEY=${opencode_api_key}" > .env
echo "PORT=3000" >> .env

# Build da imagem Docker
log "Buildando container Docker..."
docker build -t cloud-ai-agent . >> "$LOG_FILE" 2>&1 || log "ERRO: docker build falhou"

# Parar container existente se houver
log "Preparando container..."
docker rm -f cloud-ai-agent 2>/dev/null || true

# Rodar o container
log "Iniciando aplicação..."
docker run -d -p 3000:3000 --env-file .env --name cloud-ai-agent cloud-ai-agent >> "$LOG_FILE" 2>&1 || log "ERRO: docker run falhou"

# Verificar se está rodando
sleep 5
if docker ps | grep -q cloud-ai-agent; then
    log "=== Deploy concluído com sucesso! ==="
else
    log "ERRO: Container não está rodando!"
fi

log "Logs salvos em $LOG_FILE"