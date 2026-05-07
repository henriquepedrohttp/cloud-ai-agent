#!/bin/bash

LOG_FILE="/var/log/deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Iniciando deploy do Cloud AI Agent ==="

# Instalar git (não vem na ECS Optimized AMI)
log "Instalando git..."
yum install -y git >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "ERRO: Falha ao instalar git"
    exit 1
fi

# Iniciar Docker
log "Iniciando Docker..."
systemctl start docker >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "ERRO: Docker start falhou"
    exit 1
fi

systemctl enable docker >> "$LOG_FILE" 2>&1

# Verificar se Docker está funcionando
log "Verificando Docker..."
docker --version >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "ERRO: Docker não está disponível"
    exit 1
fi

# Clonar repositório do GitHub
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

# Criar arquivo .env com a API key
log "Criando arquivo .env..."
echo "OPENCODE_API_KEY=${opencode_api_key}" > .env
echo "PORT=3000" >> .env

# Build da imagem Docker
log "Buildando container Docker..."
docker build -t cloud-ai-agent . >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "ERRO: docker build falhou"
    exit 1
fi

# Parar container existente se houver
docker rm -f cloud-ai-agent 2>/dev/null || true

# Rodar o container
log "Iniciando aplicação..."
docker run -d -p 3000:3000 --env-file .env --name cloud-ai-agent cloud-ai-agent >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
    log "ERRO: docker run falhou"
    exit 1
fi

# Verificar se está rodando
sleep 5
if docker ps | grep -q cloud-ai-agent; then
    log "=== Deploy concluído com sucesso! ==="
    log "Aplicação disponível em http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3000"
else
    log "ERRO: Container não está rodando!"
    exit 1
fi

log "Logs salvos em $LOG_FILE"