// server.js - Código completo e funcional para autenticação Cartola FC
const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const crypto = require('crypto');

const app = express();

// Configuração
const isProduction = process.env.NODE_ENV === 'production';
const baseUrl = isProduction 
    ? process.env.RENDER_EXTERNAL_URL || 'https://seu-app.onrender.com'
    : 'http://localhost:3000';

const config = {
    clientId: 'cartola-web@apps.globoid',
    redirectUri: 'https://cartola.globo.com/login-callback.html',
    authUrl: 'https://goidc.globo.com/auth/realms/globo.com/protocol/openid-connect/auth',
    tokenUrl: 'https://goidc.globo.com/auth/realms/globo.com/protocol/openid-connect/token',
    cartolaApi: 'https://api.cartola.globo.com'
};

app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { secure: isProduction, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

function generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

// ============ PÁGINA PRINCIPAL ============
app.get('/', (req, res) => {
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
    
    const loginUrl = `${config.authUrl}?${params.toString()}`;
    
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
                    padding: 20px;
                }
                .container { max-width: 550px; margin: 0 auto; }
                .card {
                    background: white;
                    border-radius: 20px;
                    padding: 30px;
                    margin-bottom: 20px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }
                .logo { font-size: 48px; text-align: center; }
                h1 { text-align: center; color: #333; font-size: 22px; margin: 10px 0; }
                .subtitle { text-align: center; color: #666; margin-bottom: 25px; font-size: 13px; }
                .info {
                    background: #e3f2fd;
                    padding: 12px;
                    border-radius: 8px;
                    margin: 15px 0;
                    font-size: 13px;
                    color: #1565c0;
                    text-align: center;
                }
                button {
                    background: #4CAF50;
                    color: white;
                    border: none;
                    padding: 14px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    width: 100%;
                    font-size: 16px;
                    font-weight: bold;
                    margin: 5px 0;
                }
                button:hover { background: #45a049; transform: translateY(-1px); }
                .btn-secondary { background: #6c757d; }
                .btn-secondary:hover { background: #5a6268; }
                .btn-warning { background: #ff9800; }
                .btn-warning:hover { background: #e68900; }
                .url-box {
                    background: #f8f9fa;
                    border-radius: 12px;
                    padding: 15px;
                    margin: 15px 0;
                }
                input {
                    width: 100%;
                    padding: 12px;
                    margin: 10px 0;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    font-family: monospace;
                    font-size: 11px;
                }
                .status {
                    margin-top: 15px;
                    padding: 12px;
                    border-radius: 8px;
                    text-align: center;
                    display: none;
                }
                .status-success { background: #d4edda; color: #155724; display: block; }
                .status-error { background: #f8d7da; color: #721c24; display: block; }
                .status-loading { background: #fff3cd; color: #856404; display: block; }
                .status-info { background: #d1ecf1; color: #0c5460; display: block; }
                .token-display {
                    background: #263238;
                    color: #a6c1ff;
                    padding: 12px;
                    border-radius: 8px;
                    font-family: monospace;
                    font-size: 11px;
                    word-break: break-all;
                    margin-top: 15px;
                    max-height: 200px;
                    overflow: auto;
                }
                .footer { text-align: center; margin-top: 20px; font-size: 11px; color: rgba(255,255,255,0.7); }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <div class="logo">🏆</div>
                    <h1>Cartola Token Manager</h1>
                    <div class="subtitle">Obtenha seu token de acesso à API do Cartola FC</div>
                    
                    <div class="info">
                        🔐 Clique no botão abaixo para fazer login na Globo.com
                    </div>
                    
                    <button id="loginBtn">🔑 Fazer login</button>
                    
                    <div id="manualBox" style="display: none;">
                        <div class="url-box">
                            <p><strong>📋 Passo 2: Cole a URL de retorno</strong></p>
                            <p style="font-size: 12px; margin-bottom: 10px;">Após fazer login, copie a URL da página e cole abaixo:</p>
                            <input type="text" id="callbackUrl" placeholder="https://cartola.globo.com/login-callback.html?code=..." />
                            <button id="exchangeBtn" class="btn-secondary">🔄 Obter token</button>
                        </div>
                    </div>
                    
                    <div id="status" class="status"></div>
                    <div id="tokenDisplay" class="token-display" style="display: none;"></div>
                    
                    <button id="dashboardBtn" style="background: #2196F3; display: none;">📊 Ir para o Dashboard</button>
                </div>
                <div class="footer">
                    🔒 O token é armazenado apenas durante sua sessão.
                </div>
            </div>
            
            <script>
                let loginWindow = null;
                
                function showStatus(message, type) {
                    const statusDiv = document.getElementById('status');
                    statusDiv.innerHTML = message;
                    statusDiv.className = 'status status-' + type;
                    setTimeout(() => {
                        if (type !== 'loading') {
                            setTimeout(() => {
                                if (statusDiv.className === 'status status-' + type) {
                                    statusDiv.style.display = 'none';
                                    statusDiv.className = 'status';
                                }
                            }, 5000);
                        }
                    }, 100);
                }
                
                function showToken(token) {
                    const tokenDiv = document.getElementById('tokenDisplay');
                    tokenDiv.innerHTML = '<strong>✅ Token obtido com sucesso!</strong><br><br>' + token;
                    tokenDiv.style.display = 'block';
                    document.getElementById('dashboardBtn').style.display = 'block';
                }
                
                document.getElementById('loginBtn').onclick = async () => {
                    showStatus('🔄 Gerando link de login...', 'loading');
                    
                    const response = await fetch('/auth/login-url');
                    const data = await response.json();
                    
                    loginWindow = window.open(data.url, 'cartola_login', 'width=500,height=600,toolbar=no,location=yes');
                    
                    if (!loginWindow) {
                        showStatus('⚠️ Pop-up bloqueado! <a href="' + data.url + '" target="_blank">Clique aqui para abrir manualmente</a>', 'error');
                    } else {
                        showStatus('✅ Janela de login aberta! Faça login e depois cole a URL da página de retorno.', 'success');
                        document.getElementById('manualBox').style.display = 'block';
                    }
                };
                
                document.getElementById('exchangeBtn').onclick = async () => {
                    const url = document.getElementById('callbackUrl').value;
                    
                    if (!url) {
                        showStatus('❌ Por favor, cole a URL da página de callback', 'error');
                        return;
                    }
                    
                    const codeMatch = url.match(/[?&]code=([^&]+)/);
                    const stateMatch = url.match(/[?&]state=([^&]+)/);
                    
                    if (!codeMatch) {
                        showStatus('❌ URL inválida. Não foi possível encontrar o código.', 'error');
                        return;
                    }
                    
                    const code = decodeURIComponent(codeMatch[1]);
                    const state = stateMatch ? decodeURIComponent(stateMatch[1]) : '';
                    
                    showStatus('🔄 Obtendo token...', 'loading');
                    
                    const response = await fetch('/auth/exchange', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code, state })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        showStatus('✅ Token obtido com sucesso!', 'success');
                        showToken(result.token || 'Token armazenado na sessão');
                        setTimeout(() => {
                            window.location.href = '/dashboard';
                        }, 2000);
                    } else {
                        showStatus('❌ Erro: ' + result.error, 'error');
                    }
                };
                
                document.getElementById('dashboardBtn').onclick = () => {
                    window.location.href = '/dashboard';
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

// Trocar código por token (com fallback para state inválido)
app.post('/auth/exchange', async (req, res) => {
    const { code, state } = req.body;
    
    console.log('📥 Exchange request:', { code: code?.substring(0, 50), state, sessionState: req.session.oauthState });
    
    if (!code) {
        return res.status(400).json({ error: 'Código não encontrado' });
    }
    
    // Se o state não bate, ainda tentamos (fluxo manual)
    if (req.session.oauthState && state !== req.session.oauthState) {
        console.warn('⚠️ State mismatch, continuing anyway');
    }
    
    const codeVerifier = req.session.codeVerifier || '';
    
    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code: code,
        redirect_uri: config.redirectUri,
        code_verifier: codeVerifier
    });
    
    try {
        console.log('🔄 Exchanging code for token...');
        let response = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        
        let tokens = await response.json();
        
        // Se falhar, tenta sem code_verifier
        if (tokens.error && codeVerifier) {
            console.log('Retrying without code_verifier...');
            params.delete('code_verifier');
            response = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });
            tokens = await response.json();
        }
        
        if (tokens.error) {
            console.error('Token error:', tokens);
            return res.status(400).json({ error: tokens.error_description || tokens.error });
        }
        
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;
        req.session.idToken = tokens.id_token;
        req.session.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
        
        console.log('✅ Authentication successful!');
        res.json({ success: true, token: tokens.access_token?.substring(0, 50) + '...' });
        
    } catch (error) {
        console.error('Token exchange error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Dashboard
app.get('/dashboard', (req, res) => {
    if (!req.session.accessToken) {
        return res.redirect('/');
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Dashboard - Cartola Manager</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
                .header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 20px;
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
                .btn-logout {
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    padding: 8px 16px;
                    border-radius: 8px;
                    cursor: pointer;
                }
                .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                .card {
                    background: white;
                    border-radius: 12px;
                    padding: 25px;
                    margin-bottom: 25px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                }
                .card h2 {
                    margin-bottom: 20px;
                    border-bottom: 2px solid #667eea;
                    display: inline-block;
                    padding-bottom: 5px;
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
                .api-list { display: flex; flex-direction: column; gap: 10px; }
                .api-item {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 10px;
                    transition: all 0.3s;
                }
                .api-item:hover { background: #e9ecef; transform: translateX(5px); }
                .api-name { font-family: monospace; color: #667eea; font-weight: bold; }
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
                .token-valid { background: #d4edda; color: #155724; }
                .refresh-btn {
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
                    .api-item { flex-direction: column; text-align: center; }
                }
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
                <div class="card" id="tokenStatusCard">
                    <div id="tokenStatus" class="token-status token-valid">✅ Token válido</div>
                </div>
                
                <div class="card">
                    <h2>📊 Seu Time</h2>
                    <div class="stats-grid" id="statsGrid">
                        <div class="stat-card"><div class="stat-value" id="timeName">-</div><div class="stat-label">Nome do Time</div></div>
                        <div class="stat-card"><div class="stat-value" id="patrimonio">-</div><div class="stat-label">Patrimônio (C$)</div></div>
                        <div class="stat-card"><div class="stat-value" id="pontos">-</div><div class="stat-label">Pontuação Total</div></div>
                    </div>
                </div>
                
                <div class="card">
                    <h2>📡 APIs do Cartola</h2>
                    <p>Clique em qualquer endpoint para testar:</p>
                    <div class="api-list">
                        <div class="api-item" data-endpoint="auth/time/info"><div><div class="api-name">GET /auth/time/info</div><div class="api-desc" style="font-size:12px;color:#666;">Informações do seu time</div></div><span>🔍 Testar →</span></div>
                        <div class="api-item" data-endpoint="atletas/mercado"><div><div class="api-name">GET /atletas/mercado</div><div class="api-desc" style="font-size:12px;color:#666;">Lista de atletas do mercado</div></div><span>🔍 Testar →</span></div>
                        <div class="api-item" data-endpoint="partidas"><div><div class="api-name">GET /partidas</div><div class="api-desc" style="font-size:12px;color:#666;">Jogos da rodada</div></div><span>🔍 Testar →</span></div>
                        <div class="api-item" data-endpoint="mercado/status"><div><div class="api-name">GET /mercado/status</div><div class="api-desc" style="font-size:12px;color:#666;">Status do mercado</div></div><span>🔍 Testar →</span></div>
                    </div>
                    <div id="responseArea" class="response-area"></div>
                </div>
            </div>
            
            <script>
                let lastResponse = null;
                
                async function loadTeamStats() {
                    try {
                        const response = await fetch('/api/cartola/auth/time/info');
                        if (response.ok) {
                            const data = await response.json();
                            if (data.time) {
                                document.getElementById('timeName').innerHTML = data.time.nome || '-';
                                document.getElementById('patrimonio').innerHTML = \`C\$ \${data.patrimonio?.toFixed(2) || '-'}\`;
                                document.getElementById('pontos').innerHTML = data.pontos?.toFixed(2) || '-';
                            }
                        }
                    } catch(e) { console.error(e); }
                }
                
                async function callApi(endpoint) {
                    const responseArea = document.getElementById('responseArea');
                    responseArea.innerHTML = '<div style="text-align:center;padding:20px;">🔄 Carregando...</div>';
                    responseArea.classList.add('show');
                    try {
                        const response = await fetch(\`/api/cartola/\${endpoint}\`);
                        const data = await response.json();
                        responseArea.innerHTML = \`
                            <div style="margin-bottom:15px;">
                                <strong>📡 GET /\${endpoint}</strong>
                                <button onclick="copyResponse()" style="margin-left:10px;padding:4px 8px;">📋 Copiar</button>
                                <button onclick="closeResponse()" style="margin-left:5px;padding:4px 8px;">❌ Fechar</button>
                            </div>
                            <pre>\${JSON.stringify(data, null, 2)}</pre>
                        \`;
                        lastResponse = data;
                    } catch(e) {
                        responseArea.innerHTML = \`<div style="color:#f44336;">❌ Erro: \${e.message}</div>\`;
                    }
                }
                
                function copyResponse() {
                    if (lastResponse) {
                        navigator.clipboard.writeText(JSON.stringify(lastResponse, null, 2));
                        alert('Copiado!');
                    }
                }
                
                function closeResponse() {
                    document.getElementById('responseArea').classList.remove('show');
                }
                
                async function logout() {
                    if (confirm('Deseja sair?')) {
                        await fetch('/auth/logout');
                        window.location.href = '/';
                    }
                }
                
                document.querySelectorAll('.api-item').forEach(el => {
                    el.addEventListener('click', () => callApi(el.dataset.endpoint));
                });
                
                loadTeamStats();
                setInterval(loadTeamStats, 30000);
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
        
        const tokens = await response.json();
        
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;
        req.session.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
        
        res.json({ success: true });
        
    } catch (error) {
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
    res.json({ authenticated: isAuthenticated, tokenValid: isValid });
});

// API: Proxy para Cartola
app.get('/api/cartola/:endpoint(*)', async (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const endpoint = req.params.endpoint;
    const url = `${config.cartolaApi}/${endpoint}`;
    const publicEndpoints = ['atletas/mercado', 'partidas', 'mercado/status', 'clubes', 'posicoes'];
    const needsAuth = !publicEndpoints.includes(endpoint);
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
        'Accept': 'application/json',
        'X-GLB-Auth': 'oidc',
        'X-GLB-APP': 'cartola_web',
        'Referer': 'https://cartola.globo.com/'
    };
    
    if (needsAuth) {
        headers['Authorization'] = `Bearer ${req.session.accessToken}`;
    }
    
    try {
        const response = await fetch(url, { headers });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em ${baseUrl}`);
});
