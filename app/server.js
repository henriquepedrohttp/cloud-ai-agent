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

// Analisador de Repositório GitHub para POs
app.post('/api/analyze', async (req, res) => {
  try {
    let { repoUrl, question } = req.body;
    
    // Se receber texto livre, extrair URL e pergunta
    if (!repoUrl && !question && req.body.text) {
      const text = req.body.text;
      // Extrair URL do GitHub do texto
      const urlMatch = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^\/\s]+\/[^\/\s]+/);
      if (urlMatch) {
        repoUrl = urlMatch[0];
        // Remover apenas a URL do texto - manter o resto como pergunta
        question = text.replace(urlMatch[0], '').trim();
      }
    }

    if (!repoUrl || !question) {
      return res.status(400).json({ error: 'Forneça a URL do repositório e sua pergunta. Ex: "https://github.com/owner/repo foi implementada a função X"' });
    }

    // Extrair owner e repo da URL
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      return res.status(400).json({ error: 'URL do GitHub inválida. Use: https://github.com/owner/repo' });
    }

    const owner = match[1];
    const repo = match[2].replace(/\/$/, '').replace(/\.git$/, '');

    // Detectar período na pergunta
    let period = 7; // padrão: 7 dias
    let periodText = 'últimos 7 dias';
    const questionLower = question.toLowerCase();

    // Mapeamento de períodos - ordem importa (mais específicos primeiro)
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

    // Calcular data de início do período
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - period);
    const sinceDateStr = sinceDate.toISOString();

    // Verificar se o repositório existe antes de buscar commits
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

    // Verificar se é uma pergunta genérica (resumo)
    const isGenericQuestion = /funcionalidades?|features?|recursos?|o que foi|quais|alterações?|mudanças?|resumo|sumário/i.test(questionLower);
    const isSpecificQuestion = /foi implementad[oa]?|foi corrigido|foi adicionado|foi criado|existe|tem|possui/i.test(questionLower);

    let answer = '';
    let relatedCommits = [];

    if (isGenericQuestion && totalCommits > 0) {
      // Pergunta genérica - mostrar resumo de todos os commits
      answer = `📊 **RESUMO DAS ALTERAÇÕES** em ${periodText}:\n\n`;
      answer += `📁 Repositório: ${owner}/${repo}\n`;
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

    } else if (isSpecificQuestion || !isGenericQuestion) {
      // Pergunta específica - buscar por palavras-chave
      // Extrair palavras-chave (agora com >2 caracteres para pegar "login", "fix", etc)
      const stopWords = ['foi', 'implementada', 'implementado', 'adicionado', 'corrigido', 'criado', 'existe', 'tem', 'possui', 'esta', 'nesta', 'na', 'no', 'de', 'da', 'do', 'em', 'um', 'uma', 'o', 'a', 'e', 'ou', 'que', 'com', 'por', 'para'];
      
      const questionWords = question.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.includes(word));

      // Filtrar commits relacionados à pergunta
      if (questionWords.length > 0) {
        relatedCommits = commits.filter(commit => {
          const commitMessage = commit.commit.message.toLowerCase();
          return questionWords.some(word => commitMessage.includes(word));
        });
      }

      if (relatedCommits.length > 0) {
        answer = `✅ **SIM!** Encontrei ${relatedCommits.length} commit(s) relacionado(s) em ${periodText}:\n\n`;
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
        answer = `❌ **NÃO** encontrei commits relacionados à sua pergunta em ${periodText}.\n\n`;
        answer += `📊 Resumo do período: ${totalCommits} commits foram feitos, mas nenhum parece estar relacionado ao que você perguntou.\n\n`;
        if (totalCommits > 0) {
          answer += `💡 **Commits recentes:**\n`;
          commits.slice(0, 5).forEach(c => {
            const date = new Date(c.commit.author.date).toLocaleDateString('pt-BR');
            const shortMsg = c.commit.message.split('\n')[0].substring(0, 60);
            answer += `• ${date}: ${shortMsg}${shortMsg.length === 60 ? '...' : ''}\n`;
          });
        }
      }
    }

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
  console.log(`🤖 Agente de IA - MiniMax M2.5 Free`);
});
