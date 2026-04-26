// server.js - Versão com IFrame (sem pop-up, sem nova aba)
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
    redirectUri: 'https://cartola.globo.com/login-callback.html',
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

// ============ PÁGINA PRINCIPAL COM IFRAME ============
app.get('/', (req, res) => {
    // Gera state e PKCE para usar no iframe
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
            <title>Cartola Token Manager - Login</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 20px;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                }
                .card {
                    background: white;
                    border-radius: 20px;
                    padding: 30px;
                    margin-bottom: 20px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }
                .logo { font-size: 48px; text-align: center; margin-bottom: 10px; }
                h1 { text-align: center; color: #333; font-size: 24px; }
                .subtitle { text-align: center; color: #666; margin-bottom: 25px; font-size: 14px; }
                .iframe-wrapper {
                    background: #f0f0f0;
                    border-radius: 12px;
                    padding: 5px;
                }
                iframe {
                    width: 100%;
                    height: 550px;
                    border: none;
                    border-radius: 8px;
                }
                .info {
                    background: #e3f2fd;
                    padding: 12px;
                    border-radius: 8px;
                    margin-top: 15px;
                    font-size: 13px;
                    color: #1565c0;
                    text-align: center;
                }
                .status {
                    margin-top: 15px;
                    padding: 12px;
                    border-radius: 8px;
                    text-align: center;
                    display: none;
                }
                .status-success {
                    background: #d4edda;
                    color: #155724;
                    display: block;
                }
                .status-error {
                    background: #f8d7da;
                    color: #721c24;
                    display: block;
                }
                .status-loading {
                    background: #fff3cd;
                    color: #856404;
                    display: block;
                }
                button {
                    background: #4CAF50;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    margin-top: 10px;
                    width: 100%;
                }
                button:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
                .dashboard-link {
                    text-align: center;
                    margin-top: 15px;
                }
                .dashboard-link a {
                    color: #4CAF50;
                    text-decoration: none;
                }
                .footer {
                    text-align: center;
                    margin-top: 20px;
                    font-size: 11px;
                    color: rgba(255,255,255,0.7);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <div class="logo">🏆</div>
                    <h1>Cartola Token Manager</h1>
                    <div class="subtitle">Faça login na sua conta Globo.com</div>
                    
                    <div class="iframe-wrapper">
                        <iframe id="loginFrame" src="${loginUrl}"></iframe>
                    </div>
                    
                    <div class="info">
                        🔐 Faça login no iframe acima. Após autenticar, você será redirecionado automaticamente.
                    </div>
                    
                    <div id="status" class="status"></div>
                    
                    <button id="manualBtn" style="background:#6c757d;">🔄 Já fiz login? Verificar</button>
                    
                    <div class="dashboard-link" id="dashboardLink" style="display: none;">
                        <a href="/dashboard">→ Ir para o Dashboard ←</a>
                    </div>
                </div>
                <div class="footer">
                    🔒 Seus dados são seguros. O token é armazenado apenas durante sua sessão.
                </div>
            </div>
            
            <script>
                let checkInterval = null;
                let isProcessing = false;
                
                function showStatus(message, type) {
                    const statusDiv = document.getElementById('status');
                    statusDiv.innerHTML = message;
                    statusDiv.className = 'status status-' + type;
                }
                
                function hideStatus() {
                    const statusDiv = document.getElementById('status');
                    statusDiv.className = 'status';
                    statusDiv.style.display = 'none';
                }
                
                // Função para capturar o código da URL do iframe
                function checkIframeUrl() {
                    if (isProcessing) return;
                    
                    try {
                        const iframe = document.getElementById('loginFrame');
                        const iframeUrl = iframe.contentWindow.location.href;
                        
                        console.log('Iframe URL:', iframeUrl);
                        
                        // Se a URL contém o código de autorização
                        if (iframeUrl && iframeUrl.includes('login-callback.html?code=')) {
                            isProcessing = true;
                            
                            // Extrai o código e state
                            const codeMatch = iframeUrl.match(/[?&]code=([^&]+)/);
                            const stateMatch = iframeUrl.match(/[?&]state=([^&]+)/);
                            
                            if (codeMatch) {
                                const code = decodeURIComponent(codeMatch[1]);
                                const state = stateMatch ? decodeURIComponent(stateMatch[1]) : '';
                                
                                console.log('Código encontrado! Enviando para o servidor...');
                                showStatus('🔄 Obtendo token de acesso...', 'loading');
                                
                                fetch('/auth/exchange', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ code, state })
                                })
                                .then(response => response.json())
                                .then(result => {
                                    if (result.success) {
                                        showStatus('✅ Login realizado com sucesso! Redirecionando...', 'success');
                                        document.getElementById('dashboardLink').style.display = 'block';
                                        setTimeout(() => {
                                            window.location.href = '/dashboard';
                                        }, 1500);
                                    } else {
                                        showStatus('❌ Erro: ' + result.error, 'error');
                                        isProcessing = false;
                                    }
                                })
                                .catch(error => {
                                    showStatus('❌ Erro de conexão: ' + error.message, 'error');
                                    isProcessing = false;
                                });
                            }
                        }
                    } catch(e) {
                        // Erro de cross-origin é normal - o iframe ainda está no domínio da Globo
                        // Só loga se for um erro diferente
                        if (!e.message || !e.message.includes('cross-origin')) {
                            console.log('Aguardando redirecionamento...');
                        }
                    }
                }
                
                // Botão manual para verificar (caso o automático não funcione)
                document.getElementById('manualBtn').onclick = () => {
                    showStatus('🔍 Verificando...', 'loading');
                    checkIframeUrl();
                };
                
                // Monitora o iframe a cada 500ms
                checkInterval = setInterval(checkIframeUrl, 500);
                
                // Limpa o intervalo quando sair da página
                window.addEventListener('beforeunload', () => {
                    if (checkInterval) clearInterval(checkInterval);
                });
            </script>
        </body>
        </html>
    `);
});

// Rota para trocar código por token
app.post('/auth/exchange', async (req, res) => {
    const { code, state } = req.body;
    
    console.log('Exchange request received');
    console.log('  Code:', code?.substring(0, 50) + '...');
    console.log('  State:', state);
    console.log('  Session state:', req.session.oauthState);
    
    if (state !== req.session.oauthState) {
        console.error('State mismatch!');
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

// Dashboard (página após login)
app.get('/dashboard', (req, res) => {
    if (!req.session.accessToken) {
        return res.redirect('/');
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Dashboard - Cartola</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #f5f5f5;
                }
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
                .container {
                    max-width: 1200px;
                    margin: 30px auto;
                    padding: 0 20px;
                }
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
                .stat-value {
                    font-size: 28px;
                    font-weight: bold;
                    color: #667eea;
                }
                .stat-label {
                    color: #666;
                    margin-top: 5px;
                }
                .endpoint-list {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .endpoint-item {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                    cursor: pointer;
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
                .endpoint-name {
                    font-family: monospace;
                    color: #667eea;
                    font-weight: bold;
                }
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
                .token-valid {
                    background: #d4edda;
                    color: #155724;
                }
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
                    .endpoint-item { flex-direction: column; text-align: center; }
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
                <div class="card">
                    <div id="tokenStatus"></div>
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
                    <div class="endpoint-list">
                        <div class="endpoint-item" data-endpoint="auth/time/info">
                            <div><div class="endpoint-name">GET /auth/time/info</div><div class="endpoint-desc">Informações do seu time</div></div>
                            <span>🔍 Testar →</span>
                        </div>
                        <div class="endpoint-item" data-endpoint="auth/ligas">
                            <div><div class="endpoint-name">GET /auth/ligas</div><div class="endpoint-desc">Suas ligas</div></div>
                            <span>🔍 Testar →</span>
                        </div>
                        <div class="endpoint-item" data-endpoint="atletas/mercado">
                            <div><div class="endpoint-name">GET /atletas/mercado</div><div class="endpoint-desc">Lista de atletas do mercado</div></div>
                            <span>🔍 Testar →</span>
                        </div>
                        <div class="endpoint-item" data-endpoint="partidas">
                            <div><div class="endpoint-name">GET /partidas</div><div class="endpoint-desc">Jogos da rodada</div></div>
                            <span>🔍 Testar →</span>
                        </div>
                        <div class="endpoint-item" data-endpoint="mercado/status">
                            <div><div class="endpoint-name">GET /mercado/status</div><div class="endpoint-desc">Status do mercado</div></div>
                            <span>🔍 Testar →</span>
                        </div>
                    </div>
                    <div id="responseArea" class="response-area"></div>
                </div>
            </div>
            
            <script>
                let lastResponse = null;
                
                async function checkTokenStatus() {
                    try {
                        const response = await fetch('/api/auth/status');
                        const data = await response.json();
                        const statusDiv = document.getElementById('tokenStatus');
                        if (data.authenticated && data.tokenValid) {
                            statusDiv.innerHTML = \`<div class="token-status token-valid">✅ Token válido <button class="refresh-btn" onclick="refreshToken()">🔄 Renovar</button></div>\`;
                        } else if (data.authenticated) {
                            statusDiv.innerHTML = \`<div class="token-status token-valid">⚠️ Token expirado <button class="refresh-btn" onclick="refreshToken()">🔄 Renovar</button></div>\`;
                        }
                    } catch(e) { console.error(e); }
                }
                
                async function refreshToken() {
                    try {
                        const response = await fetch('/auth/refresh', { method: 'POST' });
                        if (response.ok) {
                            checkTokenStatus();
                            loadTeamStats();
                        }
                    } catch(e) { console.error(e); }
                }
                
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
                
                function logout() {
                    if (confirm('Deseja sair?')) {
                        window.location.href = '/auth/logout';
                    }
                }
                
                // Eventos dos endpoints
                document.querySelectorAll('.endpoint-item').forEach(el => {
                    el.addEventListener('click', () => callApi(el.dataset.endpoint));
                });
                
                // Inicialização
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
    
    if (Date.now() >= req.session.tokenExpiry) {
        return res.status(401).json({ error: 'Token expired' });
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
    console.log(`📡 Ambiente: ${isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'}`);
});
