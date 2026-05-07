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

// Configurações da API OpenCode Zen
const OPENCODE_API_URL = 'https://opencode.ai/zen/v1/chat/completions';
const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY;

// Sessão global (em memória) - armazena o repositório atual
let currentSession = {
  repoUrl: null,
  owner: null,
  repo: null,
  lastUsed: null
};

// Rota de saúde
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Rota de debug - mostra logs do deploy
app.get('/debug', (req, res) => {
  const { exec } = require('child_process');
  exec('cat /var/log/deploy.log 2>/dev/null || echo "Log não encontrado"', (err, stdout, stderr) => {
    res.json({
      deploy_log: stdout || 'Log não disponível',
      timestamp: new Date().toISOString()
    });
  });
});

// Rota para obter status da sessão
app.get('/api/session', (req, res) => {
  res.json({
    hasRepo: !!currentSession.repoUrl,
    repo: currentSession.repoUrl,
    repoFormatted: currentSession.owner && currentSession.repo ? `${currentSession.owner}/${currentSession.repo}` : null,
    lastUsed: currentSession.lastUsed
  });
});

// Rota para limpar sessão
app.post('/api/reset', (req, res) => {
  currentSession = {
    repoUrl: null,
    owner: null,
    repo: null,
    lastUsed: null
  };
  res.json({
    success: true,
    message: 'Sessão limpa com sucesso!',
    timestamp: new Date().toISOString()
  });
});

// Rota principal para chat com o agente
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Mensagem é obrigatória' });
    }
    const response = await axios.post(
      OPENCODE_API_URL,
      {
        model: 'minimax-m2.5-free',
        messages: [
          { role: 'system', content: 'Você é um assistente útil e amigável.' },
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
      model: 'minimax-m2-5-free',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Erro na API:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Erro ao processar mensagem',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Função para extrair repo da URL
function extractRepoFromUrl(url) {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) return null;
  return {
    url: url,
    owner: match[1],
    repo: match[2].replace(/\/$/, '').replace(/\.git$/, '')
  };
}

// Função para detectar período na pergunta
function detectPeriod(question) {
  let period = 7;
  let periodText = 'últimos 7 dias';
  const questionLower = question.toLowerCase();

  const periodPatterns = [
    { regex: /(?:nesta|esta|na)\s+semana/i, days: 7, text: 'esta semana' },
    { regex: /(?:na\s+)?ultim[oa]s?\s+(\d+)\s*dias?/i, extract: (m) => ({ days: parseInt(m[1]), text: `últimos ${m[1]} dias` }) },
    { regex: /(?:na\s+)?ultim[oa]s?\s+(\d+)\s*semanas?/i, extract: (m) => ({ days: parseInt(m[1]) * 7, text: `últimas ${m[1]} semanas` }) },
    { regex: /(?:na\s+)?ultim[oa]s?\s+(\d+)\s*mes(es)?/i, extract: (m) => ({ days: parseInt(m[1]) * 30, text: `últimos ${m[1]} meses` }) },
    { regex: /(?:na\s+)?ultim[oa]s?\s*semana/i, days: 7, text: 'última semana' },
    { regex: /(?:no\s+)?ultim[oa]s?\s*mes/i, days: 30, text: 'último mês' },
    { regex: /(?:nos\s+)?ultimos?\s*dois?\s*meses?/i, days: 60, text: 'últimos 2 meses' },
    { regex: /(?:nos\s+)?ultimos?\s*tr[eê]s?\s*meses?/i, days: 90, text: 'últimos 3 meses' },
    { regex: /hoje|dia/i, days: 1, text: 'hoje' },
    { regex: /ontem/i, days: 2, text: 'ontem' },
  ];

  for (const pattern of periodPatterns) {
    const matchPeriod = questionLower.match(pattern.regex);
    if (matchPeriod) {
      if (pattern.extract) {
        const result = pattern.extract(matchPeriod);
        period = result.days;
        periodText = result.text;
      } else {
        period = pattern.days;
        periodText = pattern.text;
      }
      break;
    }
  }

  return { period, periodText };
}

// Dicionário PT → EN para expandir busca em commits
const KEYWORD_MAP = {
  // Estilos / Visual
  'estilos': ['style', 'theme', 'visual', 'css', 'design', 'ui', 'styled', 'scss', 'sass'],
  'estilo': ['style', 'theme', 'visual', 'css', 'design', 'ui', 'styled', 'scss'],
  'visual': ['visual', 'style', 'theme', 'ui', 'interface', 'design'],
  'aparencia': ['appearance', 'style', 'theme', 'visual', 'design'],
  'cor': ['color', 'theme', 'palette', 'background'],
  'cores': ['color', 'theme', 'palette', 'background', 'scheme'],
  'tema': ['theme', 'dark', 'light', 'mode', 'color'],
  'dark': ['dark', 'theme', 'mode'],
  'light': ['light', 'theme', 'mode'],
  'layout': ['layout', 'interface', 'responsive', 'grid', 'flex', 'css'],
  'interface': ['interface', 'ui', 'ux', 'layout', 'design'],

  // Botões / Ações
  'botao': ['button', 'btn', 'action', 'click', 'trigger'],
  'botoes': ['button', 'btn', 'action', 'click', 'trigger', 'actions'],
  'acao': ['action', 'click', 'trigger', 'event', 'handler'],
  'acoes': ['action', 'click', 'trigger', 'event', 'handler'],

  // Login / Autenticação
  'login': ['login', 'auth', 'signin', 'sign', 'oauth'],
  'acesso': ['access', 'auth', 'login', 'permission', 'role'],
  'autenticacao': ['auth', 'authentication', 'login', 'oauth', 'token', 'jwt'],
  'senha': ['password', 'auth', 'security', 'credential'],
  'oauth': ['oauth', 'auth', 'google', 'github', 'sso'],
  'token': ['token', 'jwt', 'auth', 'session'],
  'sessao': ['session', 'auth', 'token', 'cookie'],

  // API / Backend
  'api': ['api', 'endpoint', 'route', 'server', 'controller'],
  'backend': ['backend', 'server', 'api', 'service', 'controller'],
  'servidor': ['server', 'backend', 'api', 'service'],
  'endpoint': ['endpoint', 'route', 'api', 'path', 'url'],
  'rota': ['route', 'path', 'endpoint', 'url', 'api'],
  'rotas': ['route', 'path', 'endpoint', 'url', 'api'],
  'controller': ['controller', 'handler', 'route', 'api'],
  'servico': ['service', 'api', 'handler', 'business'],

  // Banco de dados
  'banco': ['database', 'db', 'sql', 'query', 'data'],
  'database': ['database', 'db', 'sql', 'query', 'schema'],
  'dados': ['data', 'database', 'query', 'model'],
  'query': ['query', 'sql', 'database', 'search'],
  'migration': ['migration', 'migrate', 'schema', 'database'],
  'schema': ['schema', 'database', 'migration', 'model'],
  'modelo': ['model', 'schema', 'entity', 'database'],

  // Deploy / DevOps
  'deploy': ['deploy', 'release', 'publish', 'build', 'pipeline'],
  'publicacao': ['publish', 'deploy', 'release', 'build'],
  'build': ['build', 'deploy', 'release', 'ci'],
  'pipeline': ['pipeline', 'ci', 'cd', 'workflow', 'action'],
  'ci': ['ci', 'cd', 'pipeline', 'action', 'workflow'],
  'github': ['github', 'git', 'action', 'workflow'],

  // Docker / Container
  'docker': ['docker', 'container', 'image', 'compose'],
  'container': ['container', 'docker', 'image', 'pod'],
  'imagem': ['image', 'docker', 'container', 'build'],
  'kubernetes': ['kubernetes', 'k8s', 'container', 'pod', 'helm'],
  'k8s': ['kubernetes', 'k8s', 'container', 'pod'],

  // Correções / Bugs
  'correcao': ['fix', 'bug', 'issue', 'resolve', 'hotfix', 'patch'],
  'correcoes': ['fix', 'bug', 'issue', 'resolve', 'hotfix', 'patch'],
  'bug': ['bug', 'fix', 'issue', 'error', 'crash'],
  'erro': ['error', 'bug', 'fix', 'issue', 'exception'],
  'crash': ['crash', 'error', 'bug', 'fatal'],

  // Testes
  'teste': ['test', 'spec', 'unit', 'e2e', 'coverage'],
  'testes': ['test', 'spec', 'unit', 'e2e', 'coverage', 'jest'],
  'qualidade': ['quality', 'test', 'coverage', 'lint'],
  'cobertura': ['coverage', 'test', 'codecov'],
  'jest': ['jest', 'test', 'unit'],
  'cypress': ['cypress', 'e2e', 'test'],

  // Documentação
  'documentacao': ['doc', 'readme', 'wiki', 'guide', 'documentation'],
  'doc': ['doc', 'documentation', 'readme', 'guide'],
  'readme': ['readme', 'doc', 'documentation'],
  'guia': ['guide', 'doc', 'documentation', 'manual'],

  // Performance
  'performance': ['perf', 'performance', 'optimize', 'speed', 'cache'],
  'velocidade': ['speed', 'performance', 'optimize', 'fast'],
  'cache': ['cache', 'redis', 'memoize', 'performance'],
  'otimizacao': ['optimize', 'performance', 'perf', 'improve'],

  // Refatoração
  'refatoracao': ['refactor', 'restructure', 'clean', 'debt'],
  'refatorar': ['refactor', 'restructure', 'clean'],
  'limpeza': ['clean', 'refactor', 'remove', 'debt'],
  'tecnica': ['debt', 'tech', 'refactor', 'improvement'],

  // Nova funcionalidade
  'funcionalidade': ['feat', 'feature', 'add', 'implement', 'create', 'introduce'],
  'funcionalidades': ['feat', 'feature', 'add', 'implement', 'create', 'introduce'],
  'feature': ['feature', 'feat', 'add', 'implement'],
  'nova': ['new', 'add', 'feat', 'implement', 'create'],
  'novo': ['new', 'add', 'feat', 'implement', 'create'],
  'adicionar': ['add', 'feat', 'implement', 'create'],
  'adicionado': ['add', 'feat', 'implement', 'create'],
  'implementar': ['implement', 'feat', 'add', 'create'],
  'implementado': ['implement', 'feat', 'add', 'create'],
  'criar': ['create', 'feat', 'add', 'implement'],
  'criado': ['create', 'feat', 'add', 'implement'],
  'introduzir': ['introduce', 'feat', 'add', 'implement'],

  // Segurança
  'seguranca': ['security', 'secure', 'vuln', 'encrypt', 'cve'],
  'seguro': ['secure', 'security', 'auth', 'encrypt'],
  'vulnerabilidade': ['vuln', 'security', 'cve', 'fix'],
  'criptografia': ['encrypt', 'crypto', 'security', 'hash'],
  'https': ['https', 'ssl', 'tls', 'security'],

  // Formulários / Inputs
  'formulario': ['form', 'input', 'field', 'validation'],
  'form': ['form', 'input', 'field', 'validation'],
  'input': ['input', 'field', 'form', 'validation'],
  'campo': ['field', 'input', 'form', 'validation'],
  'validacao': ['validation', 'validate', 'form', 'field'],
  'submit': ['submit', 'form', 'post', 'send'],

  // Notificações
  'notificacao': ['notification', 'alert', 'toast', 'message'],
  'notificacoes': ['notification', 'alert', 'toast', 'message', 'email', 'push'],
  'alerta': ['alert', 'notification', 'warn'],
  'email': ['email', 'mail', 'notification', 'send'],
  'push': ['push', 'notification', 'firebase'],

  // Imagens / Mídia
  'imagem': ['image', 'img', 'asset', 'svg', 'icon'],
  'imagens': ['image', 'img', 'asset', 'svg', 'icon', 'media'],
  'svg': ['svg', 'icon', 'image', 'asset'],
  'icone': ['icon', 'svg', 'image', 'asset'],
  'icones': ['icon', 'svg', 'image', 'asset'],
  'media': ['media', 'asset', 'image', 'video'],
  'arquivo': ['file', 'asset', 'upload', 'download'],
  'assets': ['asset', 'static', 'resource'],

  // Internacionalização
  'internacionalizacao': ['i18n', 'locale', 'translate', 'language'],
  'i18n': ['i18n', 'locale', 'translate', 'language'],
  'traducao': ['translate', 'translation', 'locale', 'i18n'],
  'idioma': ['language', 'locale', 'translate', 'i18n'],
  'portugues': ['pt', 'portuguese', 'locale', 'i18n'],
  'ingles': ['en', 'english', 'locale', 'i18n'],
  'locale': ['locale', 'i18n', 'translate', 'language'],

  // Configurações
  'configuracao': ['config', 'setting', 'env', 'variable'],
  'configuracoes': ['config', 'setting', 'env', 'variable', 'option'],
  'config': ['config', 'configuration', 'setting'],
  'variavel': ['variable', 'env', 'config', 'setting'],
  'variaveis': ['variable', 'env', 'config', 'setting'],
  'ambiente': ['env', 'environment', 'config', 'variable'],

  // Logs / Monitoramento
  'log': ['log', 'logging', 'monitor', 'trace'],
  'logs': ['log', 'logging', 'monitor', 'trace', 'analytics'],
  'monitoramento': ['monitor', 'metric', 'analytics', 'observability'],
  'metrica': ['metric', 'analytics', 'monitor', 'performance'],
  'analytics': ['analytics', 'metric', 'tracking'],
  'rastreamento': ['tracking', 'analytics', 'trace'],

  // Mobile / App
  'mobile': ['mobile', 'app', 'responsive', 'pwa', 'ios', 'android'],
  'app': ['app', 'mobile', 'pwa', 'application'],
  'aplicativo': ['app', 'mobile', 'application'],
  'ios': ['ios', 'mobile', 'apple', 'swift'],
  'android': ['android', 'mobile', 'kotlin'],
  'pwa': ['pwa', 'progressive', 'service-worker', 'mobile'],
  'responsivo': ['responsive', 'mobile', 'layout', 'css'],

  // Pagamento
  'pagamento': ['payment', 'checkout', 'stripe', 'billing'],
  'checkout': ['checkout', 'payment', 'cart', 'stripe'],
  'stripe': ['stripe', 'payment', 'billing'],
  'assinatura': ['subscription', 'billing', 'plan', 'payment'],
  'plano': ['plan', 'subscription', 'billing'],
  'preco': ['price', 'pricing', 'billing'],

  // Cache / Armazenamento
  'armazenamento': ['storage', 'cache', 'persist', 'save'],
  'persistencia': ['persist', 'storage', 'save', 'localstorage'],
  'localstorage': ['localstorage', 'storage', 'persist'],
  'redis': ['redis', 'cache', 'storage'],

  // Paginação / Listagem
  'paginacao': ['pagination', 'page', 'infinite', 'scroll'],
  'listagem': ['list', 'table', 'grid', 'pagination'],
  'lista': ['list', 'table', 'grid'],
  'tabela': ['table', 'list', 'grid', 'data'],
  'grid': ['grid', 'list', 'table', 'layout'],
  'page': ['page', 'pagination', 'route'],
  'scroll': ['scroll', 'infinite', 'lazy', 'virtual'],

  // Busca / Filtros
  'busca': ['search', 'find', 'query', 'filter'],
  'pesquisa': ['search', 'find', 'query'],
  'filtro': ['filter', 'search', 'sort'],
  'filtros': ['filter', 'search', 'sort', 'query'],
  'ordenacao': ['sort', 'order', 'filter'],
  'indice': ['index', 'search', 'elastic'],

  // Exportação / Relatório
  'exportacao': ['export', 'download', 'csv', 'pdf', 'excel'],
  'exportar': ['export', 'download', 'csv', 'pdf'],
  'download': ['download', 'export', 'file'],
  'relatorio': ['report', 'export', 'analytics'],
  'csv': ['csv', 'export', 'download'],
  'pdf': ['pdf', 'export', 'download', 'report'],
  'excel': ['excel', 'csv', 'export', 'download'],

  // Importação / Upload
  'importacao': ['import', 'upload', 'csv', 'batch'],
  'importar': ['import', 'upload', 'csv'],
  'upload': ['upload', 'import', 'file', 'media'],
  'lote': ['batch', 'bulk', 'import'],
  'sincronizacao': ['sync', 'synchronize', 'update'],

  // Versionamento
  'versao': ['version', 'tag', 'release'],
  'versionamento': ['version', 'tag', 'release', 'changelog'],
  'tag': ['tag', 'version', 'release'],
  'release': ['release', 'deploy', 'version', 'tag'],
  'changelog': ['changelog', 'release', 'version'],
  'semver': ['semver', 'version', 'release'],

  // Utilitários comuns
  'modal': ['modal', 'dialog', 'popup', 'overlay'],
  'popup': ['popup', 'modal', 'dialog', 'overlay'],
  'dialogo': ['dialog', 'modal', 'popup'],
  'menu': ['menu', 'nav', 'navigation', 'sidebar'],
  'navegacao': ['navigation', 'nav', 'router', 'route'],
  'router': ['router', 'route', 'navigation', 'path'],
  'link': ['link', 'url', 'href', 'route'],
  'footer': ['footer', 'bottom', 'layout'],
  'header': ['header', 'top', 'nav', 'layout'],
  'sidebar': ['sidebar', 'nav', 'menu', 'drawer'],
  'drawer': ['drawer', 'sidebar', 'panel'],
  'card': ['card', 'panel', 'widget'],
  'tooltip': ['tooltip', 'hint', 'popover'],
  'loading': ['loading', 'loader', 'spinner', 'skeleton'],
  'spinner': ['spinner', 'loading', 'loader'],
  'skeleton': ['skeleton', 'loading', 'placeholder'],
  'placeholder': ['placeholder', 'skeleton', 'empty'],
  'empty': ['empty', 'placeholder', 'no-data'],
  'error': ['error', 'exception', 'fail', 'bug'],
  'sucesso': ['success', 'confirm', 'done'],
  'warning': ['warning', 'warn', 'alert'],
  'info': ['info', 'information', 'notice'],

  // Estados / Data
  'estado': ['state', 'store', 'redux', 'context', 'provider'],
  'state': ['state', 'store', 'redux', 'context'],
  'redux': ['redux', 'state', 'store', 'action'],
  'contexto': ['context', 'provider', 'state'],
  'hook': ['hook', 'useeffect', 'usestate', 'custom'],
  'hooks': ['hook', 'useeffect', 'usestate', 'custom'],
  'provider': ['provider', 'context', 'service'],

  // HTTP / Comunicação
  'http': ['http', 'request', 'fetch', 'axios'],
  'fetch': ['fetch', 'http', 'request', 'api'],
  'axios': ['axios', 'http', 'request', 'api'],
  'websocket': ['websocket', 'socket', 'ws', 'realtime'],
  'socket': ['socket', 'websocket', 'realtime'],
  'graphql': ['graphql', 'query', 'api'],
  'rest': ['rest', 'api', 'http'],

  // Build / Bundler
  'webpack': ['webpack', 'bundle', 'build'],
  'vite': ['vite', 'build', 'bundle'],
  'bundler': ['bundle', 'webpack', 'rollup'],
  'transpile': ['transpile', 'babel', 'typescript'],
  'typescript': ['typescript', 'ts', 'type'],
  'types': ['type', 'typescript', 'interface'],

  // Utilidades
  'util': ['util', 'helper', 'tool'],
  'utilitario': ['util', 'helper', 'tool'],
  'helper': ['helper', 'util', 'tool'],
  'tools': ['tool', 'util', 'script'],
  'script': ['script', 'tool', 'automation'],

  // Git
  'commit': ['commit', 'git', 'changelog'],
  'branch': ['branch', 'git', 'merge'],
  'merge': ['merge', 'branch', 'conflict'],
  'rebase': ['rebase', 'git'],
  'clone': ['clone', 'git', 'repo'],
  'repo': ['repo', 'repository', 'git'],
  'repositorio': ['repository', 'repo', 'git'],

  // Frameworks comuns (para detectar mudanças tecnológicas)
  'react': ['react', 'component', 'jsx'],
  'vue': ['vue', 'component', 'nuxt'],
  'angular': ['angular', 'component', 'directive'],
  'next': ['next', 'nextjs', 'ssr'],
  'nuxt': ['nuxt', 'nuxtjs', 'vue'],
  'svelte': ['svelte', 'kit'],
  'node': ['node', 'nodejs', 'server'],
  'express': ['express', 'server', 'middleware'],
  'fastify': ['fastify', 'server'],
  'nestjs': ['nest', 'nestjs', 'module'],
  'prisma': ['prisma', 'orm', 'database'],
  'sequelize': ['sequelize', 'orm', 'database'],
  'mongoose': ['mongoose', 'mongo', 'database'],
  'mongo': ['mongo', 'mongodb', 'database'],
  'postgres': ['postgres', 'postgresql', 'database'],
  'mysql': ['mysql', 'database', 'sql'],

  // Mudança / Update
  'mudar': ['change', 'update', 'modify', 'replace'],
  'mudanca': ['change', 'update', 'modify'],
  'mudancas': ['change', 'update', 'modify', 'refactor'],
  'alterar': ['change', 'update', 'modify', 'edit'],
  'alteracao': ['change', 'update', 'modify'],
  'alteracoes': ['change', 'update', 'modify'],
  'atualizar': ['update', 'upgrade', 'change', 'bump'],
  'atualizacao': ['update', 'upgrade', 'change'],
  'atualizacoes': ['update', 'upgrade', 'change'],
  'modificar': ['modify', 'change', 'update'],
  'modificacao': ['modify', 'change', 'update'],
  'substituir': ['replace', 'change', 'swap'],
  'remover': ['remove', 'delete', 'drop', 'clean'],
  'removido': ['remove', 'delete', 'drop'],
  'deletar': ['delete', 'remove', 'drop'],
  'deletado': ['delete', 'remove', 'drop'],

  // Novo / Criação
  'conversa': ['conversation', 'chat', 'session', 'message'],
  'chat': ['chat', 'conversation', 'message'],
  'mensagem': ['message', 'chat', 'conversation'],
  'historico': ['history', 'log', 'session'],
  'memoria': ['memory', 'session', 'cache', 'store'],
  'persistir': ['persist', 'save', 'storage'],

  // Navegação / Tabs
  'tab': ['tab', 'navigation', 'panel'],
  'tabs': ['tab', 'navigation', 'panel'],
  'aba': ['tab', 'navigation', 'panel'],
  'abas': ['tab', 'navigation', 'panel'],
  'painel': ['panel', 'tab', 'card', 'section'],
  'painel': ['panel', 'dashboard', 'section'],

  // Texto / Tipografia
  'texto': ['text', 'typography', 'font'],
  'tipografia': ['typography', 'font', 'text'],
  'fonte': ['font', 'typography', 'text'],
  'titulo': ['title', 'heading', 'header'],
  'subtitulo': ['subtitle', 'heading'],
  'paragrafo': ['paragraph', 'text'],

  // Tabelas / Dados
  'dado': ['data', 'model', 'entity'],
  'registro': ['record', 'entry', 'row'],
  'linha': ['row', 'line', 'record'],
  'coluna': ['column', 'field'],
  'celula': ['cell', 'field'],
  'cabecalho': ['header', 'heading', 'title'],

  // Animações
  'animacao': ['animation', 'animate', 'transition'],
  'animacoes': ['animation', 'animate', 'transition', 'motion'],
  'transicao': ['transition', 'animation', 'fade'],
  'efeito': ['effect', 'animation', 'transition'],
};

// Stop words expandidas
const STOP_WORDS = [
  'foi', 'implementada', 'implementado', 'implementados', 'implementadas',
  'adicionado', 'adicionada', 'adicionados', 'adicionadas',
  'corrigido', 'corrigida', 'corrigidos', 'corrigidas',
  'criado', 'criada', 'criados', 'criadas',
  'existe', 'existem', 'tem', 'possui', 'possuem',
  'esta', 'nesta', 'estas', 'nestas',
  'este', 'neste', 'estes', 'nestes',
  'na', 'no', 'nas', 'nos',
  'de', 'da', 'do', 'das', 'dos', 'dela', 'dele', 'delas', 'deles',
  'em', 'um', 'uma', 'uns', 'umas',
  'o', 'a', 'os', 'as',
  'e', 'ou', 'que', 'com', 'por', 'para', 'sobre',
  'dessa', 'desse', 'dessas', 'desses',
  'desta', 'deste', 'destas', 'destes',
  'ele', 'ela', 'eles', 'elas', 'eu', 'voce', 'nos', 'voces',
  'meu', 'minha', 'meus', 'minhas',
  'seu', 'sua', 'seus', 'suas',
  'nosso', 'nossa', 'nossos', 'nossas',
  'já', 'ainda', 'ja', 'so', 'soh', 'só',
  'muito', 'muita', 'muitos', 'muitas',
  'pouco', 'pouca', 'poucos', 'poucas',
  'todo', 'toda', 'todos', 'todas',
  'qual', 'quais', 'quando', 'onde', 'porque', 'por que', 'como',
  'ser', 'sao', 'são', 'era', 'eram', 'foi', 'foram',
  'ter', 'tem', 'tinha', 'tinham', 'tendo',
  'estar', 'está', 'estao', 'estão', 'estava', 'estavam',
  'haver', 'há', 'houve', 'haviam',
  'fazer', 'faz', 'fazia', 'fizeram',
  'poder', 'pode', 'podem', 'podia', 'podiam',
  'dever', 'deve', 'devem', 'devia', 'deviam',
  'querer', 'quer', 'querem', 'queria',
  'ir', 'vai', 'vao', 'vão', 'ia', 'iam',
  'vir', 'vem', 'vêm', 'vinha', 'vinham',
  'dar', 'dá', 'dão', 'dava', 'davam',
  'ver', 've', 'vê', 'veem', 'via', 'viam',
  'saber', 'sabe', 'sabem', 'sabia', 'sabiam',
  'falar', 'fala', 'falam', 'falava', 'falavam',
  'dizer', 'diz', 'dizem', 'dizia', 'diziam',
  'achar', 'acha', 'acham', 'achava', 'achavam',
  'parecer', 'parece', 'parecem', 'parecia',
  'ficar', 'fica', 'ficam', 'ficava',
  'passar', 'passa', 'passam', 'passava',
  'deixar', 'deixa', 'deixam', 'deixava',
  'encontrar', 'encontra', 'encontram', 'encontrava',
  'voltar', 'volta', 'voltam', 'voltava',
  'sentir', 'sente', 'sentem', 'sentia',
  'tornar', 'torna', 'tornam', 'tornava',
  'parecer', 'parece', 'parecem', 'parecia',
  'chegar', 'chega', 'chegam', 'chegava',
  'partir', 'parte', 'partem', 'partia',
  'colocar', 'coloca', 'colocam', 'colocava',
  'pegar', 'pega', 'pegam', 'pegava',
  'trazer', 'traz', 'trazem', 'trazia',
  'usar', 'usa', 'usam', 'usava',
  'trabalhar', 'trabalha', 'trabalham', 'trabalhava',
  'chamar', 'chama', 'chamam', 'chamava',
  'tentar', 'tenta', 'tentam', 'tentava',
  'precisar', 'precisa', 'precisam', 'precisava',
  'acontecer', 'acontece', 'acontecem', 'acontecia',
  'gostar', 'gosta', 'gostam', 'gostava',
  'sair', 'sai', 'saem', 'saía',
  'conseguir', 'consegue', 'conseguem', 'conseguia',
  'escrever', 'escreve', 'escrevem', 'escrevia',
  'ler', 'lê', 'leem', 'lia',
  'abrir', 'abre', 'abrem', 'abria',
  'fechar', 'fecha', 'fecham', 'fechava',
  'seguir', 'segue', 'seguem', 'seguia',
  'conhecer', 'conhece', 'conhecem', 'conhecia',
  'pensar', 'pensa', 'pensam', 'pensava',
  'aparecer', 'aparece', 'aparecem', 'aparecia',
  'acabar', 'acaba', 'acabam', 'acabava',
  'acontecer', 'acontece', 'acontecem', 'acontecia',
  'existir', 'existe', 'existem', 'existia',
  'levar', 'leva', 'levam', 'levava',
  'ouvir', 'ouve', 'ouvem', 'ouvia',
  'morar', 'mora', 'moram', 'morava',
  'comer', 'come', 'comem', 'comia',
  'beber', 'bebe', 'bebem', 'bebia',
  'comprar', 'compra', 'compram', 'comprava',
  'vender', 'vende', 'vendem', 'vendia',
  'começar', 'começa', 'começam', 'começava',
  'terminar', 'termina', 'terminam', 'terminava',
  'esperar', 'espera', 'esperam', 'esperava',
  'acordar', 'acorda', 'acordam', 'acordava',
  'dormir', 'dorme', 'dormem', 'dormia',
  'acordar', 'acorda', 'acordam', 'acordava',
  'levantar', 'levanta', 'levantam', 'levantava',
  'sentar', 'senta', 'sentam', 'sentava',
  'ficar', 'fica', 'ficam', 'ficava',
  'andar', 'anda', 'andam', 'andava',
  'correr', 'corre', 'correm', 'corria',
  'chegar', 'chega', 'chegam', 'chegava',
  'partir', 'parte', 'partem', 'partia',
  'entrar', 'entra', 'entram', 'entrava',
  'sair', 'sai', 'saem', 'saía',
  'voltar', 'volta', 'voltam', 'voltava',
  'cair', 'cai', 'caem', 'caía',
  'subir', 'sobe', 'sobem', 'subia',
  'descer', 'desce', 'descem', 'descia',
  'sentir', 'sente', 'sentem', 'sentia',
  'ver', 'vê', 'veem', 'via',
  'olhar', 'olha', 'olham', 'olhava',
  'ouvir', 'ouve', 'ouvem', 'ouvia',
  'tocar', 'toca', 'tocam', 'tocava',
  'cheirar', 'cheira', 'cheiram', 'cheirava',
  'provar', 'prova', 'provam', 'provava',
  'sentar', 'senta', 'sentam', 'sentava',
  'deitar', 'deita', 'deitam', 'deitava',
  'levantar', 'levanta', 'levantam', 'levantava',
  'ficar', 'fica', 'ficam', 'ficava',
  'andar', 'anda', 'andam', 'andava',
  'correr', 'corre', 'correm', 'corria',
  'pular', 'pula', 'pulam', 'pulava',
  'nadar', 'nada', 'nadam', 'nadava',
  'voar', 'voa', 'voam', 'voava',
  'cair', 'cai', 'caem', 'caía',
  'subir', 'sobe', 'sobem', 'subia',
  'descer', 'desce', 'descem', 'descia',
  'entrar', 'entra', 'entram', 'entrava',
  'sair', 'sai', 'saem', 'saía',
  'voltar', 'volta', 'voltam', 'voltava',
  'chegar', 'chega', 'chegam', 'chegava',
  'partir', 'parte', 'partem', 'partia',
  'ficar', 'fica', 'ficam', 'ficava',
  'morar', 'mora', 'moram', 'morava',
  'nascer', 'nasce', 'nascem', 'nascia',
  'morrer', 'morre', 'morrem', 'morria',
  'crescer', 'cresce', 'crescem', 'crescia',
  'diminuir', 'diminui', 'diminuem', 'diminuía',
  'aumentar', 'aumenta', 'aumentam', 'aumentava',
  'mudar', 'muda', 'mudam', 'mudava',
  'trocar', 'troca', 'trocam', 'trocava',
  'tornar', 'torna', 'tornam', 'tornava',
  'virar', 'vira', 'viram', 'virava',
  'parecer', 'parece', 'parecem', 'parecia',
  'ficar', 'fica', 'ficam', 'ficava',
  'continuar', 'continua', 'continuam', 'continuava',
  'acabar', 'acaba', 'acabam', 'acabava',
  'começar', 'começa', 'começam', 'começava',
  'terminar', 'termina', 'terminam', 'terminava',
  'parar', 'para', 'param', 'parava',
  'esperar', 'espera', 'esperam', 'esperava',
  'demorar', 'demora', 'demoram', 'demorava',
  'gostar', 'gosta', 'gostam', 'gostava',
  'amar', 'ama', 'amam', 'amava',
  'odiar', 'odeia', 'odeiam', 'odiava',
  'preferir', 'prefere', 'preferem', 'preferia',
  'querer', 'quer', 'querem', 'queria',
  'poder', 'pode', 'podem', 'podia',
  'dever', 'deve', 'devem', 'devia',
  'precisar', 'precisa', 'precisam', 'precisava',
  'conseguir', 'consegue', 'conseguem', 'conseguia',
  'saber', 'sabe', 'sabem', 'sabia',
  'conhecer', 'conhece', 'conhecem', 'conhecia',
  'entender', 'entende', 'entendem', 'entendia',
  'compreender', 'compreende', 'compreendem', 'compreendia',
  'aprender', 'aprende', 'aprendem', 'aprendia',
  'ensinar', 'ensina', 'ensinam', 'ensinava',
  'lembrar', 'lembra', 'lembram', 'lembrava',
  'esquecer', 'esquece', 'esquecem', 'esquecia',
  'pensar', 'pensa', 'pensam', 'pensava',
  'acreditar', 'acredita', 'acreditam', 'acreditava',
  'duvidar', 'duvida', 'duvidam', 'duvidava',
  'confiar', 'confia', 'confiam', 'confiava',
  'desconfiar', 'desconfia', 'desconfiam', 'desconfiava',
  'esperar', 'espera', 'esperam', 'esperava',
  'sonhar', 'sonha', 'sonham', 'sonhava',
  'desejar', 'deseja', 'desejam', 'desejava',
  'querer', 'quer', 'querem', 'queria',
  'pretender', 'pretende', 'pretendem', 'pretendia',
  'tentar', 'tenta', 'tentam', 'tentava',
  'conseguir', 'consegue', 'conseguem', 'conseguia',
  'permitir', 'permite', 'permitem', 'permitia',
  'impedir', 'impede', 'impedem', 'impedia',
  'evitar', 'evita', 'evitam', 'evitava',
  'impedir', 'impede', 'impedem', 'impedia',
  'proibir', 'proíbe', 'proíbem', 'proibia',
  'deixar', 'deixa', 'deixam', 'deixava',
  'fazer', 'faz', 'fazem', 'fazia',
  'criar', 'cria', 'criam', 'criava',
  'produzir', 'produz', 'produzem', 'produzia',
  'construir', 'constrói', 'constroem', 'construía',
  'destruir', 'destrói', 'destroem', 'destruía',
  'formar', 'forma', 'formam', 'formava',
  'transformar', 'transforma', 'transformam', 'transformava',
  'mudar', 'muda', 'mudam', 'mudava',
  'trocar', 'troca', 'trocam', 'trocava',
  'substituir', 'substitui', 'substituem', 'substituía',
  'trocar', 'troca', 'trocam', 'trocava',
  'renovar', 'renova', 'renovam', 'renovava',
  'restaurar', 'restaura', 'restauram', 'restaurava',
  'recuperar', 'recupera', 'recuperam', 'recuperava',
  'salvar', 'salva', 'salvam', 'salvava',
  'guardar', 'guarda', 'guardam', 'guardava',
  'proteger', 'protege', 'protegem', 'protegia',
  'cuidar', 'cuida', 'cuidam', 'cuidava',
  'cuidado': ['careful', 'attention', 'warning'],
  'atenção': ['attention', 'careful', 'warning'],
  'alerta': ['alert', 'warning', 'attention'],
  'aviso': ['warning', 'alert', 'notice'],
  'nota': ['note', 'notice', 'attention'],
  'observacao': ['note', 'observation', 'attention'],
  'observação': ['note', 'observation', 'attention'],
  'importante': ['important', 'critical', 'priority'],
  'urgente': ['urgent', 'critical', 'priority', 'asap'],
  'critico': ['critical', 'urgent', 'important'],
  'crítico': ['critical', 'urgent', 'important'],
  'prioridade': ['priority', 'important', 'critical'],
  'bloqueador': ['blocker', 'blocking', 'critical'],
  'bloqueio': ['blocking', 'block', 'blocker'],
  'dependencia': ['dependency', 'depend', 'require'],
  'dependência': ['dependency', 'depend', 'require'],
  'dependencias': ['dependency', 'depend', 'require'],
  'incompatibilidade': ['incompatible', 'conflict', 'break'],
  'conflito': ['conflict', 'merge', 'collision'],
  'merge': ['merge', 'branch', 'conflict'],
  'revert': ['revert', 'rollback', 'undo'],
  'reverter': ['revert', 'rollback', 'undo'],
  'rollback': ['rollback', 'revert', 'undo'],
  'desfazer': ['undo', 'revert', 'rollback'],
];

// Função para expandir palavras PT → EN
function expandKeywords(words) {
  const expanded = new Set();
  words.forEach(word => {
    const lowerWord = word.toLowerCase();
    // Adicionar a palavra original
    expanded.add(lowerWord);
    // Adicionar expansões do dicionário
    if (KEYWORD_MAP[lowerWord]) {
      KEYWORD_MAP[lowerWord].forEach(enWord => expanded.add(enWord));
    }
    // Tentar encontrar match parcial no dicionário
    Object.entries(KEYWORD_MAP).forEach(([ptWord, enWords]) => {
      if (lowerWord.includes(ptWord) || ptWord.includes(lowerWord)) {
        enWords.forEach(enWord => expanded.add(enWord));
      }
    });
  });
  return Array.from(expanded);
}

// Analisador de Repositório GitHub para POs
app.post('/api/analyze', async (req, res) => {
  try {
    let { repoUrl, question } = req.body;
    let text = req.body.text;
    let repoChanged = false;
    let sessionCleared = false;
    
    // Se receber texto livre
    if (text) {
      const textLower = text.toLowerCase();
      
      // Verificar se é comando para limpar sessão
      if (/^\s*(limpar|resetar|nova\s+sess[ãa]o|clear|reset)\s*$/i.test(text)) {
        currentSession = { repoUrl: null, owner: null, repo: null, lastUsed: null };
        return res.json({
          success: true,
          answer: '🧹 **Sessão limpa com sucesso!**\n\nO repositório atual foi removido. Envie um novo link quando quiser analisar outro projeto.',
          sessionCleared: true,
          timestamp: new Date().toISOString()
        });
      }
      
      // Tentar extrair URL do GitHub do texto
      const urlMatch = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^\/\s]+\/[^\/\s]+/);
      
      if (urlMatch) {
        // Novo repositório encontrado no texto
        repoUrl = urlMatch[0];
        question = text.replace(urlMatch[0], '').trim();
        
        // Atualizar sessão
        const extracted = extractRepoFromUrl(repoUrl);
        if (extracted) {
          currentSession = {
            repoUrl: repoUrl,
            owner: extracted.owner,
            repo: extracted.repo,
            lastUsed: new Date().toISOString()
          };
          repoChanged = true;
        }
      } else if (currentSession.repoUrl) {
        // Não tem URL no texto, mas tem sessão ativa
        repoUrl = currentSession.repoUrl;
        question = text;
      } else {
        // Não tem URL e não tem sessão
        return res.status(400).json({ 
          error: 'Nenhum repositório definido. Envie um link do GitHub primeiro ou digite "limpar" para resetar.',
          needsRepo: true
        });
      }
    }

    if (!repoUrl || !question) {
      return res.status(400).json({ 
        error: 'Forneça a URL do repositório e sua pergunta.',
        example: 'https://github.com/facebook/react quais alterações esta semana?'
      });
    }

    // Extrair owner e repo da URL (se não estiver na sessão)
    if (!currentSession.owner || !currentSession.repo) {
      const extracted = extractRepoFromUrl(repoUrl);
      if (!extracted) {
        return res.status(400).json({ error: 'URL do GitHub inválida. Use: https://github.com/owner/repo' });
      }
      currentSession = {
        repoUrl: repoUrl,
        owner: extracted.owner,
        repo: extracted.repo,
        lastUsed: new Date().toISOString()
      };
      repoChanged = true;
    }

    const owner = currentSession.owner;
    const repo = currentSession.repo;

    // Detectar período na pergunta
    const { period, periodText } = detectPeriod(question);

    // Calcular data de início do período
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - period);
    const sinceDateStr = sinceDate.toISOString();

    // Verificar se o repositório existe
    try {
      await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });
    } catch (err) {
      if (err.response?.status === 404) {
        return res.status(404).json({ error: 'Repositório não encontrado. Verifique se a URL está correta e se o repositório é público.' });
      }
      throw err;
    }

    // Buscar commits do período
    const commitsResponse = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/commits`,
      {
        params: { since: sinceDateStr, per_page: 50 },
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      }
    );

    const commits = commitsResponse.data;
    const totalCommits = commits.length;
    const questionLower = question.toLowerCase();

    // Verificar se é uma pergunta genérica (resumo) ou específica
    const isGenericQuestion = /funcionalidades?|features?|recursos?|o que foi|quais|alterações?|mudanças?|resumo|sumário|tudo/i.test(questionLower);
    const isSpecificQuestion = /foi implementad[oa]?|foi corrigido|foi adicionado|foi criado|existe|tem|possui|adicionei|implementei|criei|subi/i.test(questionLower);

    let answer = '';
    let relatedCommits = [];

    // Header da resposta
    let headerInfo = '';
    if (repoChanged) {
      headerInfo = `📁 **Novo repositório definido:** ${owner}/${repo}\n\n`;
    } else {
      headerInfo = `📁 **Repositório atual:** ${owner}/${repo}\n\n`;
    }

    // Priorizar perguntas específicas sobre genéricas
    if (isGenericQuestion && !isSpecificQuestion && totalCommits > 0) {
      // Pergunta genérica - mostrar resumo de todos os commits
      answer = headerInfo;
      answer += `📊 **RESUMO DAS ALTERAÇÕES** em ${periodText}:\n\n`;
      answer += `📅 Período: ${periodText}\n`;
      answer += `📝 Total de commits: ${totalCommits}\n\n`;
      
      // Agrupar por tipo
      const categories = {
        features: [],
        fixes: [],
        docs: [],
        refactor: [],
        other: []
      };

      commits.forEach(c => {
        const msg = c.commit.message.toLowerCase();
        if (/feat|feature|add|new|implement|cria/i.test(msg)) categories.features.push(c);
        else if (/fix|bug|correct|resolv|corrig/i.test(msg)) categories.fixes.push(c);
        else if (/doc|readme|comment/i.test(msg)) categories.docs.push(c);
        else if (/refactor|clean|optim|improv|perf/i.test(msg)) categories.refactor.push(c);
        else categories.other.push(c);
      });

      answer += `📦 **Resumo por categoria:**\n`;
      if (categories.features.length > 0) answer += `• 🚀 Funcionalidades: ${categories.features.length}\n`;
      if (categories.fixes.length > 0) answer += `• 🐛 Correções: ${categories.fixes.length}\n`;
      if (categories.refactor.length > 0) answer += `• 🔧 Melhorias: ${categories.refactor.length}\n`;
      if (categories.docs.length > 0) answer += `• 📝 Documentação: ${categories.docs.length}\n`;
      if (categories.other.length > 0) answer += `• 📌 Outros: ${categories.other.length}\n`;
      
      answer += `\n📋 **Principais commits:**\n`;
      commits.slice(0, 10).forEach(c => {
        const date = new Date(c.commit.author.date).toLocaleDateString('pt-BR');
        const shortMsg = c.commit.message.split('\n')[0].substring(0, 80);
        answer += `• **${date}**: ${shortMsg}${shortMsg.length === 80 ? '...' : ''}\n`;
      });
      
      if (commits.length > 10) {
        answer += `\n*...e mais ${commits.length - 10} commits*`;
      }

    } else {
      // Pergunta específica - buscar por palavras-chave com expansão PT→EN
      
      // Extrair palavras-chave significativas
      let rawWords = question.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !STOP_WORDS.includes(word));

      // Se poucas palavras, reduzir filtro para pegar mais
      if (rawWords.length < 2) {
        rawWords = question.toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 1 && !STOP_WORDS.includes(word));
      }

      // Expandir palavras PT → EN
      const questionWords = expandKeywords(rawWords);

      // Filtrar commits relacionados à pergunta (com pesos)
      if (questionWords.length > 0) {
        relatedCommits = commits.filter(commit => {
          const commitMessage = commit.commit.message.toLowerCase();
          return questionWords.some(word => commitMessage.includes(word));
        });
      }

      answer = headerInfo;

      if (relatedCommits.length > 0) {
        answer += `✅ **SIM!** Encontrei ${relatedCommits.length} commit(s) relacionado(s) em ${periodText}:\n\n`;
        relatedCommits.slice(0, 10).forEach(c => {
          const date = new Date(c.commit.author.date).toLocaleDateString('pt-BR');
          const shortMsg = c.commit.message.split('\n')[0].substring(0, 80);
          answer += `• **${date}**: ${shortMsg}${shortMsg.length === 80 ? '...' : ''}\n`;
        });
        if (relatedCommits.length > 10) {
          answer += `\n*...e mais ${relatedCommits.length - 10} commits relacionados*`;
        }
        answer += `\n\n✅ **Resposta:** Sim, a funcionalidade/alteração parece ter sido implementada!`;
      } else {
        // Não encontrou matches específicos - mostrar commits mais relevantes
        answer += `🔍 **Análise da pergunta:** "${question}"\n\n`;
        
        if (totalCommits > 0) {
          // Tentar encontrar commits parcialmente relacionados com expansão
          const allRawWords = question.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !STOP_WORDS.includes(w));
          const allExpandedWords = expandKeywords(allRawWords);
          
          const partialMatches = commits.filter(commit => {
            const msg = commit.commit.message.toLowerCase();
            return allExpandedWords.some(word => word.length > 2 && msg.includes(word));
          });

          if (partialMatches.length > 0) {
            answer += `📋 **Commits possivelmente relacionados (${partialMatches.length}):**\n`;
            partialMatches.slice(0, 8).forEach(c => {
              const date = new Date(c.commit.author.date).toLocaleDateString('pt-BR');
              const shortMsg = c.commit.message.split('\n')[0].substring(0, 75);
              answer += `• ${date}: ${shortMsg}${shortMsg.length === 75 ? '...' : ''}\n`;
            });
            answer += `\n💡 **Nota:** Estes commits podem estar relacionados à sua pergunta. O sistema já traduz automaticamente termos em português para inglês ao buscar nos commits.\n`;
          } else {
            answer += `❌ **Não encontrei commits diretamente relacionados** à sua pergunta em ${periodText}.\n\n`;
            answer += `📊 **Commits recentes do período:**\n`;
            commits.slice(0, 8).forEach(c => {
              const date = new Date(c.commit.author.date).toLocaleDateString('pt-BR');
              const shortMsg = c.commit.message.split('\n')[0].substring(0, 75);
              answer += `• ${date}: ${shortMsg}${shortMsg.length === 75 ? '...' : ''}\n`;
            });
            answer += `\n💡 **Dica:** Não encontrei commits relacionados à sua pergunta. O sistema traduz automaticamente termos técnicos do português para inglês, mas você pode tentar sinônimos ou termos mais técnicos (ex: "estilos" → "styles", "autenticação" → "auth").`;
          }
        } else {
          answer += `📊 **Nenhum commit encontrado** em ${periodText}.\n`;
        }
      }
    }

    // Adicionar dica sobre como fazer novas perguntas
    answer += `\n\n💡 **Dica:** Você pode fazer mais perguntas sobre este mesmo repositório sem enviar o link novamente. Apenas digite sua nova pergunta!`;

    res.json({
      success: true,
      repo: `${owner}/${repo}`,
      period: periodText,
      totalCommits,
      relatedCount: relatedCommits.length,
      relatedCommits: relatedCommits.slice(0, 5).map(c => ({
        message: c.commit.message.split('\n')[0],
        author: c.commit.author.name,
        date: c.commit.author.date,
        url: c.html_url
      })),
      answer,
      sessionInfo: {
        hasRepo: true,
        repo: `${owner}/${repo}`,
        message: 'Repositório salvo na sessão. Faça mais perguntas sem enviar o link novamente!'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erro ao analisar repositório:', error.message);
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Repositório não encontrado. Verifique a URL.' });
    }
    if (error.response?.status === 403) {
      return res.status(403).json({ error: 'Limite de requisições do GitHub atingido. Tente novamente mais tarde.' });
    }
    res.status(500).json({
      success: false,
      error: 'Erro ao analisar repositório',
      details: error.message
    });
  }
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`🤖 Atlas AI - MiniMax M2.5 Free`);
});