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
        // Remover a URL do texto e limpar palavras-chave
        question = text
          .replace(urlMatch[0], '')
          .replace(/me analiza|me analiza|verifica|diz se|esse repo|este repo|analisa|me diga|fala se|essa funcionalidade|essa feature|esse recurso|foi implementada|foi corrigido|foi feito/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }

    if (!repoUrl || !question) {
      return res.status(400).json({ error: 'Forneça a URL do repositório e sua pergunta. Ex: "https://github.com/owner/repo" e "foi implementada a função X"' });
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

    // Mapeamento de períodos
    const periodPatterns = [
      { regex: /últim[oa]s?\s*(\d+)\s*dias?/i, days: null, extract: (m) => parseInt(m[1]) },
      { regex: /últimos\s*(\d+)\s*dias?/i, days: null, extract: (m) => parseInt(m[1]) },
      { regex: /última\s*semana/i, days: 7 },
      { regex: /esta\s*semana/i, days: 7 },
      { regex: /últimos?\s*mes/i, days: 30 },
      { regex: /últimos?\s*dois?\s*meses?/i, days: 60 },
      { regex: /últimos?\s*três?\s*meses?/i, days: 90 },
      { regex: /últimos?\s*(\d+)\s*meses?/i, days: null, extract: (m) => parseInt(m[1]) * 30 },
      { regex: /últimos?\s*semanas?\s*(\d+)/i, days: null, extract: (m) => parseInt(m[1]) * 7 },
    ];

    for (const pattern of periodPatterns) {
      const matchPeriod = questionLower.match(pattern.regex);
      if (matchPeriod) {
        period = pattern.extract ? pattern.extract(matchPeriod) : pattern.days;
        break;
      }
    }

    // Ajustar texto do período
    if (period === 7) periodText = questionLower.includes('semana') ? 'esta semana' : 'últimos 7 dias';
    else if (period === 30) periodText = 'último mês';
    else if (period === 90) periodText = 'últimos 3 meses';
    else periodText = `últimos ${period} dias`;

    // Calcular data de início do período
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - period);
    const sinceDateStr = sinceDate.toISOString().split('T')[0];

    // Buscar commits dos últimos 7 dias
    const commitsResponse = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/commits`,
      {
        params: { since: sinceDate, per_page: 30 },
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      }
    );

    const commits = commitsResponse.data;
    const totalCommits = commits.length;

    // Extrair palavras-chave da pergunta do PO
    const questionWords = question.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);

    // Filtrar commits relacionados à pergunta
    const relatedCommits = commits.filter(commit => {
      const commitMessage = (commit.commit.message + commit.commit.author.name).toLowerCase();
      return questionWords.some(word => commitMessage.includes(word));
    });

    // Analisar e gerar resposta
    let answer = '';
    if (relatedCommits.length > 0) {
      answer = `✅ Encontrei ${relatedCommits.length} commit(s) relacionado(s) em ${periodText}:\n\n`;
      relatedCommits.slice(0, 10).forEach(c => {
        const date = new Date(c.commit.author.date).toLocaleDateString('pt-BR');
        const shortMsg = c.commit.message.split('\n')[0].substring(0, 80);
        answer += `• **${date}**: ${shortMsg}${shortMsg.length === 80 ? '...' : ''}\n`;
      });
      if (relatedCommits.length > 10) {
        answer += `\n*...e mais ${relatedCommits.length - 10} commits relacionados*`;
      }
    } else {
      answer = `❌ Não encontrei commits relacionados à "${question}" em ${periodText}.\n\n`;
      answer += `Resumo do período: ${totalCommits} commits foram feitos, mas nenhum parece estar relacionado à sua pergunta.`;
    }

    // Se a pergunta for sobre funcionalidades, mostrar resumo das features
    const isFeatureQuestion = /funcionalidades?|features?|recursos?|o que foi|quais/i.test(question);
    if (isFeatureQuestion && totalCommits > 0) {
      const featureKeywords = ['feat', 'feature', 'add', 'new', 'criar', 'implement', 'criado'];
      const featureCommits = commits.filter(c => 
        featureKeywords.some(k => c.commit.message.toLowerCase().includes(k))
      );
      if (featureCommits.length > 0) {
        answer += `\n\n📦 **FUNCIONALIDADES/ALTERAÇÕES detectadas (${featureCommits.length}):**\n`;
        featureCommits.slice(0, 8).forEach(c => {
          const date = new Date(c.commit.author.date).toLocaleDateString('pt-BR');
          const shortMsg = c.commit.message.split('\n')[0].substring(0, 75);
          answer += `• ${date}: ${shortMsg}\n`;
        });
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
