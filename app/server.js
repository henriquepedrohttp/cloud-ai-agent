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

    // Verificar se é uma pergunta genérica (resumo)
    const isGenericQuestion = /funcionalidades?|features?|recursos?|o que foi|quais|alterações?|mudanças?|resumo|sumário|tudo/i.test(questionLower);
    const isSpecificQuestion = /foi implementad[oa]?|foi corrigido|foi adicionado|foi criado|existe|tem|possui/i.test(questionLower);

    let answer = '';
    let relatedCommits = [];

    // Header da resposta
    let headerInfo = '';
    if (repoChanged) {
      headerInfo = `📁 **Novo repositório definido:** ${owner}/${repo}\n\n`;
    } else {
      headerInfo = `📁 **Repositório atual:** ${owner}/${repo}\n\n`;
    }

    if (isGenericQuestion && totalCommits > 0) {
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
      // Pergunta específica - buscar por palavras-chave
      const stopWords = ['foi', 'implementada', 'implementado', 'adicionado', 'corrigido', 'criado', 'existe', 'tem', 'possui', 'esta', 'nesta', 'na', 'no', 'de', 'da', 'do', 'em', 'um', 'uma', 'o', 'a', 'e', 'ou', 'que', 'com', 'por', 'para', 'sobre', 'dessa', 'desse', 'do', 'da', 'dos', 'das'];
      
      // Extrair palavras-chave significativas
      let questionWords = question.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.includes(word));

      // Se poucas palavras, reduzir filtro para pegar mais
      if (questionWords.length < 2) {
        questionWords = question.toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 1 && !stopWords.includes(word));
      }

      // Filtrar commits relacionados à pergunta
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
          // Tentar encontrar commits parcialmente relacionados
          const partialMatches = commits.filter(commit => {
            const msg = commit.commit.message.toLowerCase();
            // Buscar qualquer palavra da pergunta, mesmo pequena
            const allWords = question.toLowerCase().split(/\s+/).filter(w => w.length > 1);
            return allWords.some(word => 
              word.length > 3 && msg.includes(word)
            );
          });

          if (partialMatches.length > 0) {
            answer += `📋 **Commits possivelmente relacionados (${partialMatches.length}):**\n`;
            partialMatches.slice(0, 8).forEach(c => {
              const date = new Date(c.commit.author.date).toLocaleDateString('pt-BR');
              const shortMsg = c.commit.message.split('\n')[0].substring(0, 75);
              answer += `• ${date}: ${shortMsg}${shortMsg.length === 75 ? '...' : ''}\n`;
            });
            answer += `\n💡 **Nota:** Estes commits podem estar relacionados à sua pergunta. Como os commits são em inglês, tente perguntar usando termos técnicos em inglês.\n`;
          } else {
            answer += `❌ **Não encontrei commits diretamente relacionados** à sua pergunta em ${periodText}.\n\n`;
            answer += `📊 **Commits recentes do período:**\n`;
            commits.slice(0, 8).forEach(c => {
              const date = new Date(c.commit.author.date).toLocaleDateString('pt-BR');
              const shortMsg = c.commit.message.split('\n')[0].substring(0, 75);
              answer += `• ${date}: ${shortMsg}${shortMsg.length === 75 ? '...' : ''}\n`;
            });
            answer += `\n💡 **Dica:** Os commits deste projeto estão em inglês. Tente usar termos como "visual", "style", "theme", "design" para perguntar sobre mudanças visuais.`;
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