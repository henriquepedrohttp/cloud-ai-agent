# 📚 Guia de Estudo - Agente de IA com Cloud Computing

> **Projeto:** Containerização e Deploy em Kubernetes de um Agente de IA  
> **Tecnologias:** Node.js, Docker, Kubernetes, OpenCode Zen API  
> **Modelo:** MiniMax M2.5 Free

---

## 🎯 Visão Geral do Projeto

Este projeto demonstra os conceitos fundamentais de **Cloud Computing** através da criação de uma aplicação web completa, containerizada e orquestrada:

1. **Aplicação Web** → Node.js + Express + HTML/CSS
2. **Containerização** → Docker
3. **Orquestração** → Kubernetes (Docker Desktop)
4. **API Externa** → OpenCode Zen (MiniMax M2.5 Free)

---

## 🏗️ Arquitetura do Sistema

```
┌─────────────┐      HTTP       ┌──────────────┐     API      ┌─────────────┐
│   Usuário   │ ──────────────→ │   Node.js   │ ───────────→ │  OpenCode   │
│  (Browser)  │ ←────────────── │  (Express)  │ ←─────────── │   Zen API   │
└─────────────┘                 └──────────────┘              └─────────────┘
                                    │                                │
                                    ▼                                ▼
                              ┌──────────┐                    ┌──────────┐
                              │  Docker  │                    │ MiniMax  │
                              │Container │                    │  M2.5    │
                              └──────────┘                    └──────────┘
                                    │
                                    ▼
                              ┌──────────┐
                              │   K8s    │
                              │  (Pod)   │
                              └──────────┘
```

---

## 📁 Estrutura do Projeto

```
cloud-ai-agent/
├── .git/                   # Repositório Git
├── .gitignore             # Arquivos ignorados pelo Git
├── .dockerignore          # Arquivos ignorados pelo Docker
├── Dockerfile             # Receita da imagem Docker
├── app/                   # Código da aplicação
│   ├── server.js         # Servidor Express (backend)
│   ├── package.json      # Dependências Node.js
│   ├── .env              # Variáveis de ambiente (SECRETO!)
│   └── public/           # Frontend estático
│       └── index.html    # Interface web
├── k8s/                  # Manifests Kubernetes
│   ├── configmap.yaml    # Configurações não-sensíveis
│   ├── secret.yaml       # API key (não versionar!)
│   ├── deployment.yaml   # Especificação do Pod
│   └── service.yaml      # Exposição do serviço
└── scripts/              # Scripts utilitários
```

---

## 🚀 FASE 1: Setup Inicial

### 1.1 Criar Estrutura de Diretórios

```bash
mkdir -p cloud-ai-agent/app/public cloud-ai-agent/k8s cloud-ai-agent/scripts
cd cloud-ai-agent
```

**Conceito:** Organização do projeto seguindo boas práticas de separação de responsabilidades.

---

### 1.2 Inicializar Projeto Node.js

```bash
cd app
npm init -y
```

**O que acontece:**
- Cria o arquivo `package.json`
- Define metadados do projeto (nome, versão, autor)
- Configura entry point (arquivo principal)

**package.json inicial:**
```json
{
  "name": "app",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  }
}
```

---

### 1.3 Instalar Dependências

```bash
npm install express axios dotenv cors
npm install --save-dev nodemon
```

**Bibliotecas instaladas:**

| Pacote | Função |
|--------|--------|
| `express` | Framework web minimalista para Node.js |
| `axios` | Cliente HTTP para fazer requisições à API |
| `dotenv` | Carrega variáveis de ambiente do arquivo `.env` |
| `cors` | Habilita Cross-Origin Resource Sharing |
| `nodemon` | Reinicia servidor automaticamente em dev |

**Conceito:** Gerenciamento de dependências com npm (Node Package Manager).

---

## 💻 FASE 2: Aplicação Node.js

### 2.1 Criar Servidor (server.js)

```javascript
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configurações da API
const OPENCODE_API_URL = 'https://opencode.ai/zen/v1/chat/completions';
const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY;

// Health Check - verifica se servidor está vivo
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Rota principal - Chat com IA
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Mensagem obrigatória' });
    }

    // Chamada à API da OpenCode
    const response = await axios.post(
      OPENCODE_API_URL,
      {
        model: 'minimax-m2.5-free',  // Modelo gratuito
        messages: [
          { role: 'system', content: 'Você é um assistente útil.' },
          { role: 'user', content: message }
        ],
        max_tokens: 500,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENCODE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = response.data.choices[0].message.content;
    
    res.json({
      success: true,
      message: reply,
      model: 'minimax-m2.5-free'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erro ao processar mensagem'
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
```

**Conceitos importantes:**
- **Express:** Framework que simplifica criação de servidores HTTP
- **Middleware:** Funções que processam requisições (CORS, JSON parsing)
- **Async/Await:** Programação assíncrona para chamadas de API
- **Environment Variables:** Separação de configuração sensível do código

---

### 2.2 Criar Interface Web (public/index.html)

Interface simples com HTML + CSS + JavaScript vanilla:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agente de IA - Cloud</title>
    <style>
        /* Estilos CSS responsivos */
        body {
            font-family: 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        /* ... mais estilos ... */
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 Agente de IA</h1>
        <div id="chat" class="chat-container"></div>
        <div class="input-container">
            <input type="text" id="userInput" placeholder="Digite...">
            <button onclick="sendMessage()">Enviar</button>
        </div>
    </div>

    <script>
        // JavaScript para comunicação com backend
        async function sendMessage() {
            const message = document.getElementById('userInput').value;
            
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            
            const data = await response.json();
            // Exibir resposta...
        }
    </script>
</body>
</html>
```

---

### 2.3 Atualizar package.json

```json
{
  "name": "cloud-ai-agent",
  "version": "1.0.0",
  "description": "Agente de IA usando MiniMax M2.5 Free",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "axios": "^1.15.2",
    "cors": "^2.8.6",
    "dotenv": "^17.4.2",
    "express": "^5.2.1"
  },
  "devDependencies": {
    "nodemon": "^3.1.14"
  }
}
```

**Scripts:**
- `npm start` → Produção (node server.js)
- `npm run dev` → Desenvolvimento (nodemon server.js)

---

### 2.4 Criar Arquivo .env

```bash
OPENCODE_API_KEY=sua_api_key_aqui
PORT=3000
NODE_ENV=development
```

**⚠️ IMPORTANTE:** Este arquivo NUNCA deve ser versionado no Git (contém segredos)!

---

### 2.5 Testar Aplicação Localmente

```bash
# Iniciar servidor
node server.js

# Testar health check (em outro terminal)
curl http://localhost:3000/health

# Resposta esperada:
{"status":"OK","timestamp":"2026-04-30T02:03:54.738Z"}
```

---

## 🐳 FASE 3: Containerização com Docker

### 3.1 O que é Docker?

**Docker** é uma plataforma que permite empacotar aplicações com todas as suas dependências em containers padronizados.

**Conceitos:**
- **Imagem:** Template read-only do container
- **Container:** Instância em execução de uma imagem
- **Dockerfile:** Receita para construir a imagem
- **Registry:** Repositório de imagens (Docker Hub, etc.)

---

### 3.2 Criar Dockerfile

```dockerfile
# Imagem base - Node.js versão 18 (Alpine = Linux minimalista)
FROM node:18-alpine

# Diretório de trabalho dentro do container
WORKDIR /app

# Copiar dependências primeiro (aproveita cache do Docker)
COPY app/package*.json ./

# Instalar dependências de produção
RUN npm ci --only=production

# Copiar código da aplicação
COPY app/server.js ./
COPY app/public ./public

# Expor porta 3000
EXPOSE 3000

# Health check - verifica se aplicação responde
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Comando de inicialização
CMD ["node", "server.js"]
```

**Boas práticas:**
1. Usar imagens base leves (Alpine)
2. Copiar package.json antes do código (cache eficiente)
3. Usar `npm ci` em vez de `npm install` (reproduzível)
4. Health check para monitoramento

---

### 3.3 Criar .dockerignore

```
node_modules
npm-debug.log
.env
.git
.gitignore
README.md
k8s/
```

**Por que?** Evita copiar arquivos desnecessários para a imagem (deixa mais leve e segura).

---

### 3.4 Build da Imagem

```bash
# Construir imagem
docker build -t cloud-ai-agent:v1.0.0 .

# Verificar imagens criadas
docker images | grep cloud-ai-agent

# Output:
# cloud-ai-agent   v1.0.0   ac9fb2256054   19s ago   195MB
```

**Flags:**
- `-t` → Tag (nome:versão)
- `.` → Contexto de build (diretório atual)

---

### 3.5 Testar Container

```bash
# Rodar container
docker run -d \
  -p 3000:3000 \
  -e OPENCODE_API_KEY=sua_api_key \
  --name ai-agent \
  cloud-ai-agent:v1.0.0

# Verificar container rodando
docker ps

# Testar
curl http://localhost:3000/health
```

**Flags:**
- `-d` → Detached (roda em background)
- `-p` → Port mapping (host:container)
- `-e` → Environment variable
- `--name` → Nome do container

---

## ☸️ FASE 4: Kubernetes (A Fazer Amanhã)

### O que é Kubernetes?

**Kubernetes (K8s)** é um sistema de orquestração de containers que automatiza:
- Deployment e scaling de aplicações
- Gerenciamento de estado desejado
- Load balancing
- Auto-recovery

**Conceitos principais:**

| Recurso | Função |
|---------|--------|
| **Pod** | Menor unidade deployável (contém container(s)) |
| **Deployment** | Gerencia estado desejado dos pods |
| **Service** | Expõe pods internamente ou externamente |
| **ConfigMap** | Configurações não-sensíveis |
| **Secret** | Dados sensíveis (senhas, API keys) |
| **Namespace** | Isolamento lógico de recursos |

---

### 4.1 ConfigMap (variáveis de ambiente públicas)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ai-agent-config
  namespace: default
data:
  PORT: "3000"
  NODE_ENV: "production"
```

---

### 4.2 Secret (dados sensíveis)

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ai-agent-secret
  namespace: default
type: Opaque
stringData:
  OPENCODE_API_KEY: "sua_api_key_aqui"
```

**⚠️ NUNCA versionar este arquivo com dados reais!**

---

### 4.3 Deployment (especificação do pod)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-agent-deployment
  labels:
    app: ai-agent
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ai-agent
  template:
    metadata:
      labels:
        app: ai-agent
    spec:
      containers:
      - name: ai-agent
        image: cloud-ai-agent:v1.0.0
        imagePullPolicy: Never  # Usar imagem local
        ports:
        - containerPort: 3000
        env:
        - name: PORT
          valueFrom:
            configMapKeyRef:
              name: ai-agent-config
              key: PORT
        - name: OPENCODE_API_KEY
          valueFrom:
            secretKeyRef:
              name: ai-agent-secret
              key: OPENCODE_API_KEY
```

---

### 4.4 Service (exposição)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: ai-agent-service
spec:
  selector:
    app: ai-agent
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
```

---

### 4.5 Comandos Kubernetes (Amanhã)

```bash
# Aplicar manifests
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Verificar status
kubectl get pods
kubectl get svc

# Port-forward para testar
kubectl port-forward svc/ai-agent-service 8080:80

# Acessar em http://localhost:8080
```

---

## 📋 Comandos Git Úteis

```bash
# Ver status
git status

# Adicionar arquivos
git add .

# Commit
git commit -m "mensagem descritiva"

# Ver histórico
git log --oneline

# Ver diff
git diff

# Ver branch atual
git branch
```

---

## ❓ Troubleshooting Comum

### Erro: "Cannot find module"
**Causa:** Node do Windows em vez do WSL  
**Solução:** Usar `/usr/bin/node` explicitamente

### Erro: "Insufficient balance"
**Causa:** Sem créditos na conta OpenCode  
**Solução:** Verificar saldo ou usar modelo gratuito

### Erro: "Model not supported"
**Causa:** Nome do modelo incorreto  
**Solução:** Usar `minimax-m2.5-free` (com ponto, não hífen)

---

## 📚 Conceitos Fundamentais para Estudar

### Docker
- [ ] Imagens vs Containers
- [ ] Camadas de filesystem
- [ ] Docker Hub e registries
- [ ] Volumes e persistência
- [ ] Docker Compose

### Kubernetes
- [ ] Arquitetura do K8s (Master + Workers)
- [ ] Pods e containers
- [ ] ReplicaSets e Deployments
- [ ] Services e networking
- [ ] ConfigMaps e Secrets

### Node.js
- [ ] Event loop
- [ ] Middleware pattern
- [ ] Async/Await
- [ ] Módulos CommonJS vs ES6

### REST APIs
- [ ] Métodos HTTP (GET, POST, PUT, DELETE)
- [ ] Status codes (200, 400, 404, 500)
- [ ] JSON como formato de troca
- [ ] Headers e autenticação

---

## 🎯 Checklist de Progresso

- [x] Estrutura de diretórios
- [x] Projeto Node.js inicializado
- [x] Dependências instaladas
- [x] Servidor Express criado
- [x] Interface web criada
- [x] package.json configurado
- [x] .env criado
- [x] Teste local funcionando
- [x] Dockerfile criado
- [x] .dockerignore criado
- [x] Imagem Docker construída
- [x] Container testado
- [ ] ConfigMap K8s
- [ ] Secret K8s
- [ ] Deployment K8s
- [ ] Service K8s
- [ ] Deploy no cluster
- [ ] README.md final

---

## 🔗 Links Úteis

- [Documentação OpenCode](https://dev.opencode.ai/docs/)
- [Documentação Docker](https://docs.docker.com/)
- [Documentação Kubernetes](https://kubernetes.io/docs/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)

---

## 💡 Dica Final

> **"Cloud Computing não é sobre tecnologia, é sobre abstração."**
> 
> Cada camada (Docker, Kubernetes) abstrai complexidade da camada anterior, permitindo focar no que realmente importa: **sua aplicação**.

---

**Próximo encontro:** Fase 4 - Kubernetes completo! 🚀
