# Imagem base Node.js Alpine (leve e segura)
FROM node:18-alpine
# Diretório de trabalho dentro do container
WORKDIR /app
# Copiar arquivos de dependências primeiro (para cache eficiente)
COPY app/package*.json ./
# Instalar dependências de produção
RUN npm ci --only=production
# Copiar o código da aplicação
COPY app/server.js ./
COPY app/public ./public
# Expor a porta que a aplicação usa
EXPOSE 3000
# Health check - verifica se aplicação está respondendo
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
# Comando para iniciar a aplicação
CMD ["node", "server.js"]

