# 🤖 Cloud AI Agent

Chatbot de IA usando o modelo MiniMax M2.5 Free via OpenCode Zen API, containerizado com Docker e deploy na AWS EC2 usando Terraform.

---

## 📋 Pré-requisitos

- Node.js 18+
- Docker
- AWS CLI configurado
- Conta AWS com acesso à EC2
- API Key da OpenCode (https://opencode.ai)

---

## 🚀 Executando Localmente

### 1. Clone o repositório
```bash
git clone https://github.com/henriquepedrohttp/cloud-ai-agent.git
cd cloud-ai-agent
```

### 2. Configure as variáveis de ambiente
```bash
cd app
cp .env.example .env
# Edite o arquivo .env e adicione sua API key:
# OPENCODE_API_KEY=sua_chave_aqui
```

### 3. Instale as dependências
```bash
npm install
```

### 4. Execute a aplicação
```bash
# Desenvolvimento (com hot-reload)
npm run dev

# Produção
npm start
```

### 5. Acesse no navegador
```
http://localhost:3000
```

---

## 🐳 Executando com Docker

### 1. Build da imagem
```bash
docker build -t cloud-ai-agent .
```

### 2. Execute o container
```bash
docker run -d -p 3000:3000 -e OPENCODE_API_KEY=sua_chave_aqui --name cloud-ai-agent cloud-ai-agent
```

### 3. Acesse
```
http://localhost:3000
```

---

## ☁️ Deploy na AWS EC2 com Terraform

### Pré-requisitos AWS

1. **Configure as credenciais AWS:**
```bash
aws configure
```

2. **Verifique se tem acesso à EC2**

### Variáveis do Terraform

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `aws_region` | Região da AWS | us-east-1 |
| `project_name` | Nome do projeto | ai-agent |
| `instance_type` | Tipo da instância | t3.micro |
| `opencode_api_key` | **Sua API key do OpenCode** | (obrigatório) |
| `github_repo` | URL do repositório GitHub | https://github.com/henriquepedrohttp/cloud-ai-agent.git |

### Executando o Deploy

```bash
cd terraform

# Inicialize o Terraform
terraform init

# Aplique a infraestrutura (com sua API key)
terraform apply -var="opencode_api_key=SUA_CHAVE_AQUI"
```

### Acessando a Aplicação

Após ~5 minutos, accesse:
```
http://<IP-PUBLICO>:3000
```

### Verificando os Logs

```
http://<IP-PUBLICO>:3000/debug
```

### Destruindo a Infraestrutura

```bash
terraform destroy -var="opencode_api_key=SUA_CHAVE_AQUI"
```

---

## 📁 Estrutura do Projeto

```
cloud-ai-agent/
├── app/                    # Código da aplicação Node.js
│   ├── server.js          # Servidor Express
│   ├── package.json       # Dependências
│   └── public/            # Frontend estático
│       └── index.html     # Interface do chat
├── Dockerfile             # Imagem Docker
├── terraform/             # Configuração Terraform
│   ├── main.tf           # Recursos AWS
│   ├── variables.tf      # Variáveis
│   ├── outputs.tf        # Outputs
│   └── user_data.tpl     # Script de inicialização
├── k8s/                   # Manifests Kubernetes
└── GUIA_ESTUDO.md        # Guia de estudo
```

---

## 🔧 Endpoints da API

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/` | GET | Interface do chat |
| `/health` | GET | Health check |
| `/api/chat` | POST | Enviar mensagem para IA |
| `/debug` | GET | Ver logs do deploy |

---

## 📝 Exemplo de Uso da API

```bash
# Enviar mensagem
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Olá, como você está?"}'
```

---

## ⚠️ Notas Importantes

1. **API Key**: Nunca versione sua API key! Use variáveis de ambiente.
2. **Custos**: A EC2 t3.micro está na camada gratuita, mas verifique os custos.
3. **Segurança**: O Security Group permite acesso às portas 22, 80 e 3000 de qualquer lugar (0.0.0.0/0). Para produção, restrinja os IPs.

---

## 📚 Referências

- [Documentação OpenCode](https://dev.opencode.ai/docs/)
- [Documentação Terraform AWS](https://registry.terraform.io/providers/hashicorp/aws)
- [Documentação Docker](https://docs.docker.com/)

---

Feito com ❤️ para projeto de Cloud Computing