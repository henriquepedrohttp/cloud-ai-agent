#!/bin/bash

LOG_FILE="/var/log/deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Iniciando deploy do Cloud AI Agent ==="

# Atualizar repositórios
log "Atualizando repositórios..."
apt-get update >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "ERRO: apt-get update falhou"
    exit 1
fi

# Instalar git e docker.io (dos repositórios Ubuntu)
log "Instalando git e docker.io..."
apt-get install -y git docker.io >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "ERRO: Falha ao instalar git ou docker"
    exit 1
fi

# Iniciar Docker
log "Iniciando Docker..."
systemctl start docker >> "$LOG_FILE" 2>&1
systemctl enable docker >> "$LOG_FILE" 2>&1

# Verificar Docker
log "Verificando Docker..."
docker --version >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "ERRO: Docker não está funcionando"
    exit 1
fi

# Adicionar usuário ubuntu ao grupo docker (opcional)
usermod -aG docker ubuntu 2>/dev/null || true

# Clonar repositório
log "Clonando repositório do GitHub..."
git clone ${github_repo} /app >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "ERRO: git clone falhou"
    exit 1
fi

cd /app
if [ $? -ne 0 ]; then
    log "ERRO: Não foi possível entrar no diretório /app"
    exit 1
fi

# Criar .env
log "Criando arquivo .env..."
echo "OPENCODE_API_KEY=${opencode_api_key}" > .env
echo "PORT=3000" >> .env

# Build
log "Buildando container Docker..."
cd /app
docker build -t cloud-ai-agent . >> "$LOG_FILE" 2>&1
BUILD_RESULT=$?
if [ $BUILD_RESULT -ne 0 ]; then
    log "ERRO: docker build falhou (código: $BUILD_RESULT)"
    log "Detalhes do erro:"
    docker build -t cloud-ai-agent . 2>&1 | head -30 >> "$LOG_FILE"
    exit 1
fi

# Parar container existente
docker rm -f cloud-ai-agent 2>/dev/null || true

# Rodar container
log "Iniciando aplicação..."
docker run -d -p 3000:3000 --env-file .env --name cloud-ai-agent cloud-ai-agent >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "ERRO: docker run falhou"
    exit 1
fi

# Verificar
sleep 5
if docker ps | grep -q cloud-ai-agent; then
    log "=== Deploy concluído com sucesso! ==="
    log "IP público: $(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
else
    log "ERRO: Container não está rodando!"
    exit 1
fi

log "Logs salvos em $LOG_FILE"