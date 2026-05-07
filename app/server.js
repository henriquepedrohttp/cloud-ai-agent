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
// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`🤖 Agente de IA - MiniMax M2.5 Free`);
});
