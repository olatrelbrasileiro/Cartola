// server.js - Backend completo para autenticação Cartola FC (FUNCIONAL)
const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const crypto = require('crypto');
const path = require('path');

const app = express();

// Configuração
const isProduction = process.env.NODE_ENV === 'production';
const baseUrl = isProduction 
    ? process.env.RENDER_EXTERNAL_URL || 'https://seu-app.onrender.com'
    : 'http://localhost:3000';

const config = {
    clientId: 'cartola-web@apps.globoid',
    redirectUri: 'https://cartola.globo.com/login-callback.html', // FIXO - NÃO MUDA!
    authUrl: 'https://goidc.globo.com/auth/realms/globo.com/protocol/openid-connect/auth',
    tokenUrl: 'https://goidc.globo.com/auth/realms/globo.com/protocol/openid-connect/token',
    cartolaApi: 'https://api.cartola.globo.com',
    userInfoUrl: 'https://goidc.globo.com/auth/realms/globo.com/protocol/openid-connect/userinfo'
};

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));

// Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Gerar PKCE
function generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256')
        .update(verifier)
        .digest('base64url');
    return { verifier, challenge };
}

// Rota inicial - página de login manual
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Cartola Token Manager</title>
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
                    max-width: 600px;
                    width: 100%;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }
                .logo { font-size: 64px; text-align: center; margin-bottom: 20px; }
                h1 { text-align: center; color: #333; margin-bottom: 10px; }
                .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
                .step {
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 12px;
                    margin: 20px 0;
                }
                .step h3 { color: #333; margin-bottom: 15px; }
                .step p { color: #666; margin: 10px 0; line-height: 1.5; }
                .step code {
                    background: #e9ecef;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-family: monospace;
                    font-size: 12px;
                    word-break: break-all;
                }
                input {
                    width: 100%;
                    padding: 12px;
                    margin: 15px 0;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    font-family: monospace;
                    font-size: 12px;
                }
                button {
                    background: #4CAF50;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-size: 16px;
                    cursor: pointer;
                    width: 100%;
                    transition: all 0.3s;
                }
                button:hover {
                    background: #45a049;
                    transform: translateY(-2px);
                }
                .btn-login {
                    background: #667eea;
                    margin-bottom: 10px;
                }
                .btn-login:hover { background: #5a67d8; }
                .success {
                    background: #d4edda;
                    color: #155724;
                    padding: 15px;
                    border-radius: 8px;
                    margin: 20px 0;
                    border: 1px solid #c3e6cb;
                }
                .error {
                    background: #f8d7da;
                    color: #721c24;
                    padding: 15px;
                    border-radius: 8px;
                    margin: 20px 0;
                    border: 1px solid #f5c6cb;
                }
                .loading {
                    text-align: center;
                    padding: 20px;
                }
                .footer {
                    text-align: center;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #eee;
                    font-size: 12px;
                    color: #999;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">🏆</div>
                <h1>Cartola Token Manager</h1>
                <div class="subtitle">Gerencie seu time e acesse a API do Cartola FC</div>
                
                <div class="step">
                    <h3>🔐 Passo 1: Faça login no Cartola</h3>
                    <p>Clique no botão abaixo. Uma nova janela vai abrir.</p>
                    <button class="btn-login" onclick="window.open('/auth/login', '_blank')">
                        🔑 Ir para página de login do Cartola
                    </button>
                    <p><small>⚠️ Faça login com sua conta Globo.com</small></p>
                </div>
                
                <div class="step">
                    <h3>📋 Passo 2: Cole o código de autorização</h3>
                    <p>Após o login, você será redirecionado para o Cartola.</p>
                    <p><strong>Copie a URL completa</strong> da barra de endereço e cole abaixo:</p>
                    <input type="text" id="callbackUrl" placeholder="https://cartola.globo.com/login-callback.html?code=xxxxx&state=xxxxx" />
                    <button onclick="extractCode()">🔓 Obter meu token</button>
                </div>
                
                <div id="result"></div>
                <div class="footer">
                    🔒 Seus dados são seguros. O token é armazenado apenas durante sua sessão.
                </div>
            </div>
            
            <script>
                async function extractCode() {
                    const url = document.getElementById('callbackUrl').value;
                    const resultDiv = document.getElementById('result');
                    
                    if (!url) {
                        resultDiv.innerHTML = '<div class="error">❌ Por favor, cole a URL!</div>';
                        return;
                    }
                    
                    // Extrai o code e state da URL
                    const codeMatch = url.match(/[?&]code=([^&]+)/);
                    const stateMatch = url.match(/[?&]state=([^&]+)/);
                    
                    if (!codeMatch) {
                        resultDiv.innerHTML = '<div class="error">❌ Código não encontrado na URL! Verifique se você colou a URL correta.</div>';
                        return;
                    }
                    
                    const code = decodeURIComponent(codeMatch[1]);
                    const state = stateMatch ? decodeURIComponent(stateMatch[1]) : '';
                    
                    resultDiv.innerHTML = '<div class="loading">🔄 Obtendo token...</div>';
                    
                    try {
                        const response = await fetch('/auth/exchange', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ code, state })
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            resultDiv.innerHTML = \`
                                <div class="success">
                                    ✅ <strong>Login realizado com sucesso!</strong><br>
                                    Seu token foi obtido. Redirecionando para o dashboard...
                                </div>
                            \`;
                            setTimeout(() => window.location.href = '/dashboard', 2000);
                        } else {
                            resultDiv.innerHTML = \`<div class="error">❌ Erro: \${result.error}</div>\`;
                        }
                    } catch (error) {
                        resultDiv.innerHTML = '<div class="error">❌ Erro de conexão com o servidor</div>';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// Iniciar login OAuth
app.get('/auth/login', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const { verifier, challenge } = generatePKCE();
    
    // Salva na sessão para recuperar depois
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
    console.log('Redirecting to login:', authUrl);
    res.redirect(authUrl);
});

// Trocar código por token (chamado via fetch)
app.post('/auth/exchange', async (req, res) => {
    const { code, state } = req.body;
    
    // Verifica se o state está correto
    if (state !== req.session.oauthState) {
        console.error('State mismatch. Expected:', req.session.oauthState, 'Got:', state);
        return res.status(400).json({ error: 'Estado inválido. Tente novamente.' });
    }
    
    if (!code) {
        return res.status(400).json({ error: 'Código não encontrado' });
    }
    
    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code: code,
        redirect_uri: config.redirectUri,
        code_verifier: req.session.codeVerifier
    });
    
    try {
        console.log('Exchanging code for token...');
        const response = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        
        const tokens = await response.json();
        
        if (tokens.error) {
            console.error('Token error:', tokens);
            return res.status(400).json({ error: tokens.error_description || tokens.error });
        }
        
        // Salva os tokens na sessão
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;
        req.session.idToken = tokens.id_token;
        req.session.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
        
        console.log('Authentication successful!');
        res.json({ success: true });
        
    } catch (error) {
        console.error('Token exchange error:', error);
        res.status(500).json({ error: 'Erro ao obter token: ' + error.message });
    }
});

// Dashboard (protegido)
app.get('/dashboard', (req, res) => {
    if (!req.session.accessToken) {
        return res.redirect('/');
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Dashboard - Cartola Token Manager</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #f5f5f5;
                    min-height: 100vh;
                }
                .header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 20px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .header-content {
                    max-width: 1200px;
                    margin: 0 auto;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 15px;
                }
                .logo { font-size: 24px; font-weight: bold; }
                .user-info { display: flex; align-items: center; gap: 15px; }
                .btn-logout {
                    background: rgba(255,255,255,0.2);
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 8px;
                    cursor: pointer;
                }
                .btn-logout:hover { background: rgba(255,255,255,0.3); }
                .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                .card {
                    background: white;
                    border-radius: 12px;
                    padding: 25px;
                    margin-bottom: 25px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                }
                .card h2 {
                    color: #333;
                    margin-bottom: 20px;
                    border-bottom: 2px solid #667eea;
                    padding-bottom: 10px;
                    display: inline-block;
                }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    margin-top: 20px;
                }
                .stat-card {
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 10px;
                    text-align: center;
                }
                .stat-value { font-size: 28px; font-weight: bold; color: #667eea; }
                .stat-label { color: #666; margin-top: 5px; }
                .endpoint-list { display: flex; flex-direction: column; gap: 10px; }
                .endpoint-item {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.3s;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 10px;
                }
                .endpoint-item:hover {
                    background: #e9ecef;
                    transform: translateX(5px);
                }
                .endpoint-name { font-family: monospace; color: #667eea; font-weight: bold; }
                .endpoint-desc { color: #666; font-size: 14px; }
                .response-area {
                    background: #263238;
                    color: #a6c1ff;
                    padding: 20px;
                    border-radius: 8px;
                    font-family: monospace;
                    font-size: 12px;
                    overflow-x: auto;
                    margin-top: 20px;
                    display: none;
                    max-height: 400px;
                    overflow-y: auto;
                }
                .response-area.show { display: block; }
                .token-status {
                    padding: 12px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }
                .token-valid { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                .btn-refresh {
                    background: #28a745;
                    color: white;
                    border: none;
                    padding: 5px 10px;
                    border-radius: 5px;
                    cursor: pointer;
                    margin-left: 10px;
                }
                @media (max-width: 768px) {
                    .header-content { flex-direction: column; text-align: center; }
                    .endpoint-item { flex-direction: column; text-align: center; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="header-content">
                    <div class="logo">🏆 Cartola Manager</div>
                    <div class="user-info">
                        <span id="userName">Carregando...</span>
                        <button class="btn-logout" onclick="logout()">🚪 Sair</button>
                    </div>
                </div>
            </div>
            
            <div class="container">
                <div class="card" id="tokenStatusCard">
                    <div id="tokenStatus"></div>
                </div>
                
                <div class="card">
                    <h2>📊 Suas Estatísticas</h2>
                    <div class="stats-grid" id="statsGrid">
                        <div class="stat-card"><div class="stat-value" id="timeName">-</div><div class="stat-label">Nome do Time</div></div>
                        <div class="stat-card"><div class="stat-value" id="patrimonio">-</div><div class="stat-label">Patrimônio (C$)</div></div>
                        <div class="stat-card"><div class="stat-value" id="pontos">-</div><div class="stat-label">Pontuação Total</div></div>
                    </div>
                </div>
                
                <div class="card">
                    <h2>📡 APIs do Cartola</h2>
                    <p>Clique em qualquer endpoint para testar:</p>
                    <div class="endpoint-list">
                        <div class="endpoint-item" data-endpoint="auth/time/info"><div><div class="endpoint-name">GET /auth/time/info</div><div class="endpoint-desc">Informações do seu time</div></div><span>🔍 Testar →</span></div>
                        <div class="endpoint-item" data-endpoint="auth/ligas"><div><div class="endpoint-name">GET /auth/ligas</div><div class="endpoint-desc">Suas ligas</div></div><span>🔍 Testar →</span></div>
                        <div class="endpoint-item" data-endpoint="atletas/mercado"><div><div class="endpoint-name">GET /atletas/mercado</div><div class="endpoint-desc">Lista de atletas do mercado</div></div><span>🔍 Testar →</span></div>
                        <div class="endpoint-item" data-endpoint="partidas"><div><div class="endpoint-name">GET /partidas</div><div class="endpoint-desc">Jogos da rodada</div></div><span>🔍 Testar →</span></div>
                        <div class="endpoint-item" data-endpoint="mercado/status"><div><div class="endpoint-name">GET /mercado/status</div><div class="endpoint-desc">Status do mercado</div></div><span>🔍 Testar →</span></div>
                    </div>
                    <div id="responseArea" class="response-area"></div>
                </div>
            </div>
            
            <script>
                let lastResponse = null;
                
                async function loadUserInfo() {
                    try {
                        const response = await fetch('/api/user/info');
                        if (response.ok) {
                            const user = await response.json();
                            document.getElementById('userName').innerHTML = \`👤 \${user.name || user.globoId || 'Cartoleiro'}\`;
                        }
                    } catch (error) { console.error(error); }
                }
                
                async function loadTeamStats() {
                    try {
                        const response = await fetch('/api/cartola/auth/time/info');
                        if (response.ok) {
                            const data = await response.json();
                            document.getElementById('timeName').innerHTML = data.time?.nome || '-';
                            document.getElementById('patrimonio').innerHTML = \`C\$ \${data.patrimonio?.toFixed(2) || '-'}\`;
                            document.getElementById('pontos').innerHTML = data.pontos?.toFixed(2) || '-';
                        }
                    } catch (error) { console.error(error); }
                }
                
                async function checkTokenStatus() {
                    try {
                        const response = await fetch('/api/auth/status');
                        const data = await response.json();
                        const statusDiv = document.getElementById('tokenStatus');
                        if (data.authenticated && data.tokenValid) {
                            statusDiv.innerHTML = \`<div class="token-status token-valid">✅ Token válido <button class="btn-refresh" onclick="refreshToken()">🔄 Renovar</button></div>\`;
                        } else if (data.authenticated) {
                            statusDiv.innerHTML = \`<div class="token-status token-valid">⚠️ Token expirado <button class="btn-refresh" onclick="refreshToken()">🔄 Renovar</button></div>\`;
                        }
                    } catch (error) { console.error(error); }
                }
                
                async function refreshToken() {
                    try {
                        const response = await fetch('/auth/refresh', { method: 'POST' });
                        if (response.ok) {
                            await checkTokenStatus();
                            await loadTeamStats();
                        }
                    } catch (error) { console.error(error); }
                }
                
                async function callApi(endpoint) {
                    const responseArea = document.getElementById('responseArea');
                    responseArea.innerHTML = '<div style="text-align:center;padding:20px;">🔄 Carregando...</div>';
                    responseArea.classList.add('show');
                    try {
                        const response = await fetch(\`/api/cartola/\${endpoint}\`);
                        const data = await response.json();
                        responseArea.innerHTML = \`
                            <div style="margin-bottom:15px;"><strong>📡 GET /\${endpoint}</strong> <button onclick="copyResponse()" style="margin-left:10px;padding:4px 8px;">📋 Copiar</button> <button onclick="closeResponse()" style="margin-left:5px;padding:4px 8px;">❌ Fechar</button></div>
                            <pre>\${JSON.stringify(data, null, 2)}</pre>
                        \`;
                        lastResponse = data;
                    } catch (error) {
                        responseArea.innerHTML = \`<div style="color:#f44336;">❌ Erro: \${error.message}</div>\`;
                    }
                }
                
                function copyResponse() { if (lastResponse) { navigator.clipboard.writeText(JSON.stringify(lastResponse, null, 2)); alert('Copiado!'); } }
                function closeResponse() { document.getElementById('responseArea').classList.remove('show'); }
                function logout() { if (confirm('Deseja sair?')) window.location.href = '/auth/logout'; }
                
                document.querySelectorAll('.endpoint-item').forEach(el => {
                    el.addEventListener('click', () => callApi(el.dataset.endpoint));
                });
                
                loadUserInfo();
                loadTeamStats();
                checkTokenStatus();
                setInterval(checkTokenStatus, 30000);
                setInterval(loadTeamStats, 60000);
            </script>
        </body>
        </html>
    `);
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
        
        if (!response.ok) throw new Error(`Refresh failed: ${response.status}`);
        
        const tokens = await response.json();
        
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;
        req.session.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Refresh error:', error);
        res.status(500).json({ error: 'Refresh failed' });
    }
});

// Logout
app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// API: Status
app.get('/api/auth/status', (req, res) => {
    const isAuthenticated = !!req.session.accessToken;
    const isValid = isAuthenticated && Date.now() < req.session.tokenExpiry;
    res.json({ authenticated: isAuthenticated, tokenValid: isValid, expiresAt: req.session.tokenExpiry });
});

// API: User info
app.get('/api/user/info', async (req, res) => {
    if (!req.session.accessToken) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const payload = req.session.accessToken.split('.')[1];
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
        res.json({ name: decoded.name, globoId: decoded.globo_id });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

// API: Proxy para Cartola
app.get('/api/cartola/:endpoint(*)', async (req, res) => {
    if (!req.session.accessToken) return res.status(401).json({ error: 'Not authenticated' });
    if (Date.now() >= req.session.tokenExpiry) return res.status(401).json({ error: 'Token expired' });
    
    const endpoint = req.params.endpoint;
    const url = `${config.cartolaApi}/${endpoint}`;
    const publicEndpoints = ['atletas/mercado', 'partidas', 'mercado/status', 'clubes', 'posicoes', 'rodadas'];
    const needsAuth = !publicEndpoints.includes(endpoint) && !endpoint.startsWith('atletas/parciais');
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
        'Accept': 'application/json',
        'X-GLB-Auth': 'oidc',
        'X-GLB-APP': 'cartola_web',
        'Referer': 'https://cartola.globo.com/'
    };
    
    if (needsAuth && req.session.accessToken) {
        headers['Authorization'] = `Bearer ${req.session.accessToken}`;
    }
    
    try {
        const response = await fetch(url, { headers });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'API request failed' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Porta
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em ${baseUrl}`);
    console.log(`📡 Ambiente: ${isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'}`);
});
