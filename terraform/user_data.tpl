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

# Instalar dependências necessárias
log "Instalando git e dependências..."
apt-get install -y git curl ca-certificates gnupg lsb-release >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "ERRO: Falha ao instalar git"
    exit 1
fi

# Instalar Docker
log "Instalando Docker..."
# Adicionar repositório oficial do Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg >> "$LOG_FILE" 2>&1
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update >> "$LOG_FILE" 2>&1
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "ERRO: Falha ao instalar Docker"
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
docker build -t cloud-ai-agent . >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "ERRO: docker build falhou"
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
else
    log "ERRO: Container não está rodando!"
    exit 1
fi

log "Logs salvos em $LOG_FILE"