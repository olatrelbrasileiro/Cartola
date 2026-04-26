// server.js - Com suporte a Pop-up (funcional!)
const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const crypto = require('crypto');
const path = require('path');

const app = express();

const isProduction = process.env.NODE_ENV === 'production';
const baseUrl = isProduction 
    ? process.env.RENDER_EXTERNAL_URL || 'https://seu-app.onrender.com'
    : 'http://localhost:3000';

const config = {
    clientId: 'cartola-web@apps.globoid',
    redirectUri: 'https://cartola.globo.com/login-callback.html', // FIXO
    authUrl: 'https://goidc.globo.com/auth/realms/globo.com/protocol/openid-connect/auth',
    tokenUrl: 'https://goidc.globo.com/auth/realms/globo.com/protocol/openid-connect/token',
    cartolaApi: 'https://api.cartola.globo.com'
};

app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { secure: isProduction }
}));

function generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

// ============ PÁGINA PRINCIPAL COM POP-UP ============
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Cartola Token Manager - Login Popup</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .container {
                    background: white;
                    border-radius: 20px;
                    padding: 40px;
                    max-width: 500px;
                    width: 100%;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }
                .logo { font-size: 64px; margin-bottom: 20px; }
                h1 { color: #333; margin-bottom: 10px; }
                p { color: #666; margin-bottom: 30px; }
                button {
                    background: #4CAF50;
                    color: white;
                    border: none;
                    padding: 15px 30px;
                    border-radius: 50px;
                    font-size: 18px;
                    cursor: pointer;
                    transition: all 0.3s;
                }
                button:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 20px rgba(76,175,80,0.4);
                }
                .loading {
                    display: none;
                    margin-top: 20px;
                    padding: 15px;
                    background: #f8f9fa;
                    border-radius: 10px;
                }
                .spinner {
                    display: inline-block;
                    width: 20px;
                    height: 20px;
                    border: 3px solid #f3f3f3;
                    border-top: 3px solid #4CAF50;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .success { color: #28a745; }
                .error { color: #dc3545; }
                .footer { margin-top: 30px; font-size: 12px; color: #999; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">🏆</div>
                <h1>Cartola Token Manager</h1>
                <p>Clique no botão abaixo para fazer login</p>
                
                <button id="loginBtn">🔑 Entrar com Globo.com</button>
                
                <div id="loading" class="loading">
                    <div class="spinner"></div>
                    <p style="margin-top: 10px;">Aguardando login...</p>
                    <p style="font-size: 12px;">Uma janela pop-up foi aberta. Faça login e ela fechará automaticamente.</p>
                </div>
                
                <div id="result"></div>
                <div class="footer">🔒 O pop-up fecha automaticamente após o login</div>
            </div>
            
            <script>
                let popup = null;
                
                document.getElementById('loginBtn').onclick = async () => {
                    // Mostra loading
                    document.getElementById('loading').style.display = 'block';
                    document.getElementById('result').innerHTML = '';
                    
                    // Obtém a URL de login do servidor
                    const response = await fetch('/auth/login-url');
                    const data = await response.json();
                    
                    // Abre pop-up
                    const width = 500;
                    const height = 600;
                    const left = (screen.width - width) / 2;
                    const top = (screen.height - height) / 2;
                    
                    popup = window.open(data.url, 'cartola_login', 
                        \`width=\${width},height=\${height},left=\${left},top=\${top},toolbar=no,location=yes\`);
                    
                    // Monitora o pop-up (check a cada 500ms)
                    const interval = setInterval(async () => {
                        if (!popup || popup.closed) {
                            clearInterval(interval);
                            document.getElementById('loading').style.display = 'none';
                            return;
                        }
                        
                        try {
                            // Tenta ler a URL do pop-up
                            const popupUrl = popup.location.href;
                            
                            // Se a URL contém o código de autorização
                            if (popupUrl.includes('login-callback.html?code=')) {
                                // Extrai o código
                                const match = popupUrl.match(/[?&]code=([^&]+)/);
                                if (match) {
                                    const code = decodeURIComponent(match[1]);
                                    const stateMatch = popupUrl.match(/[?&]state=([^&]+)/);
                                    const state = stateMatch ? decodeURIComponent(stateMatch[1]) : '';
                                    
                                    // Fecha o pop-up
                                    popup.close();
                                    clearInterval(interval);
                                    
                                    document.getElementById('loading').innerHTML = '<p>🔄 Obtendo token...</p>';
                                    
                                    // Troca o código por token
                                    const tokenResponse = await fetch('/auth/exchange', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ code, state })
                                    });
                                    
                                    const result = await tokenResponse.json();
                                    
                                    if (result.success) {
                                        document.getElementById('result').innerHTML = \`
                                            <div style="margin-top: 20px; padding: 15px; background: #d4edda; border-radius: 10px;">
                                                ✅ <strong>Login realizado com sucesso!</strong><br>
                                                Redirecionando para o dashboard...
                                            </div>
                                        \`;
                                        setTimeout(() => window.location.href = '/dashboard', 1500);
                                    } else {
                                        document.getElementById('result').innerHTML = \`
                                            <div style="margin-top: 20px; padding: 15px; background: #f8d7da; border-radius: 10px; color: #721c24;">
                                                ❌ Erro: \${result.error}
                                            </div>
                                        \`;
                                        document.getElementById('loading').style.display = 'none';
                                    }
                                }
                            }
                        } catch(e) {
                            // Erro de cross-origin é normal enquanto o pop-up está em outro domínio
                            // Só ignorar
                        }
                    }, 500);
                };
            </script>
        </body>
        </html>
    `);
});

// Rota para gerar URL de login
app.get('/auth/login-url', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const { verifier, challenge } = generatePKCE();
    
    req.session.oauthState = state;
    req.session.codeVerifier = verifier;
    
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: 'openid profile glbid birthdate',
        state: state,
        code_challenge: challenge,
        code_challenge_method: 'S256'
    });
    
    const authUrl = `${config.authUrl}?${params.toString()}`;
    res.json({ url: authUrl });
});

// Trocar código por token
app.post('/auth/exchange', async (req, res) => {
    const { code, state } = req.body;
    
    if (state !== req.session.oauthState) {
        return res.status(400).json({ error: 'Estado inválido' });
    }
    
    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code: code,
        redirect_uri: config.redirectUri,
        code_verifier: req.session.codeVerifier
    });
    
    try {
        const response = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        
        const tokens = await response.json();
        
        if (tokens.error) {
            return res.status(400).json({ error: tokens.error_description });
        }
        
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;
        req.session.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Renovar token
app.post('/auth/refresh', async (req, res) => {
    if (!req.session.refreshToken) {
        return res.status(401).json({ error: 'No refresh token' });
    }
    
    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        refresh_token: req.session.refreshToken
    });
    
    try {
        const response = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        
        const tokens = await response.json();
        
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;
        req.session.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ error: 'Refresh failed' });
    }
});

// Dashboard (igual antes)
app.get('/dashboard', (req, res) => {
    if (!req.session.accessToken) {
        return res.redirect('/');
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Dashboard - Cartola</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: system-ui; background: #f5f5f5; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; }
                .header-content { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
                .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                .card { background: white; border-radius: 12px; padding: 25px; margin-bottom: 25px; }
                .card h2 { margin-bottom: 20px; border-bottom: 2px solid #667eea; display: inline-block; }
                button { background: #667eea; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; margin: 5px; }
                .btn-logout { background: #dc3545; }
                pre { background: #263238; color: #a6c1ff; padding: 15px; border-radius: 8px; overflow-x: auto; margin-top: 15px; display: none; }
                .pre-show { display: block; }
                .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 20px; }
                .stat-card { background: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center; }
                .stat-value { font-size: 28px; font-weight: bold; color: #667eea; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="header-content">
                    <div class="logo">🏆 Cartola Manager</div>
                    <button class="btn-logout" onclick="logout()">🚪 Sair</button>
                </div>
            </div>
            <div class="container">
                <div class="card">
                    <h2>📊 Seu Time</h2>
                    <div class="stats" id="stats">
                        <div class="stat-card"><div class="stat-value" id="timeName">-</div><div>Time</div></div>
                        <div class="stat-card"><div class="stat-value" id="patrimonio">-</div><div>Patrimônio</div></div>
                        <div class="stat-card"><div class="stat-value" id="pontos">-</div><div>Pontos</div></div>
                    </div>
                </div>
                <div class="card">
                    <h2>📡 APIs</h2>
                    <button onclick="callApi('auth/time/info')">Meu Time</button>
                    <button onclick="callApi('atletas/mercado')">Atletas</button>
                    <button onclick="callApi('partidas')">Partidas</button>
                    <button onclick="callApi('mercado/status')">Status Mercado</button>
                    <pre id="response">Clique em um botão</pre>
                </div>
            </div>
            <script>
                async function callApi(endpoint) {
                    const pre = document.getElementById('response');
                    pre.innerHTML = '🔄 Carregando...';
                    pre.classList.add('pre-show');
                    const response = await fetch(\`/api/cartola/\${endpoint}\`);
                    const data = await response.json();
                    pre.innerHTML = JSON.stringify(data, null, 2);
                }
                async function loadStats() {
                    const response = await fetch('/api/cartola/auth/time/info');
                    const data = await response.json();
                    if (data.time) {
                        document.getElementById('timeName').innerHTML = data.time.nome;
                        document.getElementById('patrimonio').innerHTML = \`C\$ \${data.patrimonio}\`;
                        document.getElementById('pontos').innerHTML = data.pontos;
                    }
                }
                async function logout() {
                    await fetch('/auth/logout');
                    window.location.href = '/';
                }
                loadStats();
            </script>
        </body>
        </html>
    `);
});

// API Proxy
app.get('/api/cartola/:endpoint(*)', async (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const endpoint = req.params.endpoint;
    const url = `${config.cartolaApi}/${endpoint}`;
    
    const headers = {
        'Authorization': `Bearer ${req.session.accessToken}`,
        'X-GLB-Auth': 'oidc',
        'X-GLB-APP': 'cartola_web',
        'User-Agent': 'Mozilla/5.0'
    };
    
    try {
        const response = await fetch(url, { headers });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Logout
app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em ${baseUrl}`);
});
