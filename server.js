// server.js - Navegador embutido no site
const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const crypto = require('crypto');

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
app.use(express.static('public'));
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

// ============ PÁGINA PRINCIPAL COM NAVEGADOR EMBUTIDO ============
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
            <title>Cartola Token Manager - Navegador Interno</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #1a1a2e;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                
                /* Cabeçalho do site */
                .site-header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 15px 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 10px;
                }
                .logo { font-size: 20px; font-weight: bold; }
                .token-status {
                    background: rgba(255,255,255,0.2);
                    padding: 5px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                }
                
                /* Barra de ferramentas do navegador */
                .browser-toolbar {
                    background: #2d2d3a;
                    padding: 10px 15px;
                    display: flex;
                    gap: 10px;
                    align-items: center;
                    flex-wrap: wrap;
                    border-bottom: 1px solid #3d3d4a;
                }
                .nav-buttons {
                    display: flex;
                    gap: 5px;
                }
                .nav-btn {
                    background: #3d3d4a;
                    border: none;
                    color: white;
                    width: 36px;
                    height: 36px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                .nav-btn:hover { background: #4d4d5a; }
                .nav-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .url-bar {
                    flex: 1;
                    display: flex;
                    gap: 10px;
                    align-items: center;
                    background: #1a1a2e;
                    border-radius: 30px;
                    padding: 5px 15px;
                }
                .url-input {
                    flex: 1;
                    background: transparent;
                    border: none;
                    color: white;
                    font-size: 14px;
                    padding: 8px 0;
                    outline: none;
                }
                .go-btn {
                    background: #4CAF50;
                    border: none;
                    color: white;
                    width: 70px;
                    padding: 6px 12px;
                    border-radius: 20px;
                    cursor: pointer;
                    font-size: 13px;
                }
                .go-btn:hover { background: #45a049; }
                
                /* Área do navegador (iframe) */
                .browser-container {
                    flex: 1;
                    position: relative;
                    background: white;
                }
                .browser-frame {
                    width: 100%;
                    height: 100%;
                    border: none;
                }
                .loading-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    display: none;
                    align-items: center;
                    justify-content: center;
                }
                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #4CAF50;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                /* Painel de token */
                .token-panel {
                    background: #2d2d3a;
                    padding: 15px 20px;
                    border-top: 1px solid #3d3d4a;
                    display: none;
                }
                .token-panel.show { display: block; }
                .token-title {
                    color: #aaa;
                    font-size: 12px;
                    margin-bottom: 8px;
                }
                .token-value {
                    background: #1a1a2e;
                    color: #4CAF50;
                    padding: 12px;
                    border-radius: 8px;
                    font-family: monospace;
                    font-size: 12px;
                    word-break: break-all;
                    margin-bottom: 10px;
                }
                .dashboard-link {
                    background: #2196F3;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    width: 100%;
                    font-size: 14px;
                }
                
                @media (max-width: 768px) {
                    .browser-toolbar { flex-direction: column; }
                    .url-bar { width: 100%; }
                }
            </style>
        </head>
        <body>
            <div class="site-header">
                <div class="logo">🏆 Cartola Token Manager</div>
                <div class="token-status" id="tokenStatus">🔐 Aguardando login</div>
            </div>
            
            <div class="browser-toolbar">
                <div class="nav-buttons">
                    <button class="nav-btn" id="backBtn" title="Voltar">◀</button>
                    <button class="nav-btn" id="forwardBtn" title="Avançar">▶</button>
                    <button class="nav-btn" id="refreshBtn" title="Atualizar">🔄</button>
                </div>
                <div class="url-bar">
                    <input type="text" class="url-input" id="urlInput" placeholder="Digite uma URL ou faça login..." />
                    <button class="go-btn" id="goBtn">Ir</button>
                </div>
            </div>
            
            <div class="browser-container">
                <iframe class="browser-frame" id="browserFrame" src="${loginUrl}"></iframe>
                <div class="loading-overlay" id="loadingOverlay">
                    <div class="spinner"></div>
                </div>
            </div>
            
            <div class="token-panel" id="tokenPanel">
                <div class="token-title">✅ Token obtido com sucesso!</div>
                <div class="token-value" id="tokenValue"></div>
                <button class="dashboard-link" id="dashboardBtn">📊 Ir para o Dashboard</button>
            </div>
            
            <script>
                const iframe = document.getElementById('browserFrame');
                const urlInput = document.getElementById('urlInput');
                const backBtn = document.getElementById('backBtn');
                const forwardBtn = document.getElementById('forwardBtn');
                const refreshBtn = document.getElementById('refreshBtn');
                const goBtn = document.getElementById('goBtn');
                const loadingOverlay = document.getElementById('loadingOverlay');
                const tokenPanel = document.getElementById('tokenPanel');
                const tokenValue = document.getElementById('tokenValue');
                const tokenStatus = document.getElementById('tokenStatus');
                
                let historyStack = [];
                let historyIndex = -1;
                let isProcessing = false;
                
                // Mostrar loading
                function showLoading(show) {
                    loadingOverlay.style.display = show ? 'flex' : 'none';
                }
                
                // Atualizar URL na barra
                function updateUrlBar() {
                    try {
                        const frameUrl = iframe.contentWindow.location.href;
                        urlInput.value = frameUrl;
                        
                        // Verificar se é a página de callback
                        if (frameUrl.includes('login-callback.html?code=') && !isProcessing) {
                            isProcessing = true;
                            const codeMatch = frameUrl.match(/[?&]code=([^&]+)/);
                            if (codeMatch) {
                                const code = decodeURIComponent(codeMatch[1]);
                                const stateMatch = frameUrl.match(/[?&]state=([^&]+)/);
                                const state = stateMatch ? decodeURIComponent(stateMatch[1]) : '';
                                
                                tokenStatus.innerHTML = '🔄 Obtendo token...';
                                tokenStatus.style.background = 'rgba(255,193,7,0.3)';
                                
                                fetch('/auth/exchange', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ code, state })
                                })
                                .then(response => response.json())
                                .then(result => {
                                    if (result.success) {
                                        tokenStatus.innerHTML = '✅ Token obtido com sucesso!';
                                        tokenStatus.style.background = 'rgba(76,175,80,0.3)';
                                        tokenValue.innerHTML = result.token || 'Token armazenado na sessão';
                                        tokenPanel.classList.add('show');
                                    } else {
                                        tokenStatus.innerHTML = '❌ Erro: ' + result.error;
                                        tokenStatus.style.background = 'rgba(244,67,54,0.3)';
                                        isProcessing = false;
                                    }
                                })
                                .catch(error => {
                                    tokenStatus.innerHTML = '❌ Erro: ' + error.message;
                                    isProcessing = false;
                                });
                            }
                        }
                    } catch(e) {
                        // Erro de cross-origin é normal
                        console.log('Aguardando carregamento...');
                    }
                    showLoading(false);
                }
                
                // Adicionar ao histórico
                function addToHistory(url) {
                    if (historyIndex < historyStack.length - 1) {
                        historyStack = historyStack.slice(0, historyIndex + 1);
                    }
                    historyStack.push(url);
                    historyIndex = historyStack.length - 1;
                    updateNavButtons();
                }
                
                function updateNavButtons() {
                    backBtn.disabled = historyIndex <= 0;
                    forwardBtn.disabled = historyIndex >= historyStack.length - 1;
                }
                
                // Navegar para URL
                function navigateTo(url) {
                    if (!url) return;
                    if (!url.startsWith('http')) {
                        url = 'https://' + url;
                    }
                    iframe.src = url;
                    addToHistory(url);
                    urlInput.value = url;
                    showLoading(true);
                }
                
                // Eventos do iframe
                iframe.addEventListener('load', () => {
                    setTimeout(updateUrlBar, 500);
                    showLoading(false);
                });
                
                iframe.addEventListener('error', () => {
                    showLoading(false);
                });
                
                // Eventos dos botões
                backBtn.onclick = () => {
                    if (historyIndex > 0) {
                        historyIndex--;
                        iframe.src = historyStack[historyIndex];
                        urlInput.value = historyStack[historyIndex];
                        showLoading(true);
                        updateNavButtons();
                    }
                };
                
                forwardBtn.onclick = () => {
                    if (historyIndex < historyStack.length - 1) {
                        historyIndex++;
                        iframe.src = historyStack[historyIndex];
                        urlInput.value = historyStack[historyIndex];
                        showLoading(true);
                        updateNavButtons();
                    }
                };
                
                refreshBtn.onclick = () => {
                    iframe.src = iframe.src;
                    showLoading(true);
                };
                
                goBtn.onclick = () => {
                    navigateTo(urlInput.value);
                };
                
                urlInput.onkeypress = (e) => {
                    if (e.key === 'Enter') navigateTo(urlInput.value);
                };
                
                document.getElementById('dashboardBtn').onclick = () => {
                    window.location.href = '/dashboard';
                };
                
                // Monitorar mudanças de URL periodicamente
                setInterval(updateUrlBar, 1000);
                
                // Adicionar URL inicial ao histórico
                historyStack.push('${loginUrl}');
                historyIndex = 0;
                updateNavButtons();
            </script>
        </body>
        </html>
    `);
});

// Rota para trocar código por token
app.post('/auth/exchange', async (req, res) => {
    const { code, state } = req.body;
    
    console.log('Exchange request:', { code: code?.substring(0, 50), state });
    
    if (!code) {
        return res.status(400).json({ error: 'Código não encontrado' });
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
        let response = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        
        let tokens = await response.json();
        
        if (tokens.error && codeVerifier) {
            params.delete('code_verifier');
            response = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });
            tokens = await response.json();
        }
        
        if (tokens.error) {
            return res.status(400).json({ error: tokens.error_description || tokens.error });
        }
        
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;
        req.session.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
        
        res.json({ success: true, token: tokens.access_token?.substring(0, 50) + '...' });
        
    } catch (error) {
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

// Renovar token
app.post('/auth/refresh', async (req, res) => {
    if (!req.session.refreshToken) return res.status(401).json({ error: 'No refresh token' });
    
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
    if (!req.session.accessToken) return res.status(401).json({ error: 'Not authenticated' });
    
    const endpoint = req.params.endpoint;
    const url = `${config.cartolaApi}/${endpoint}`;
    const publicEndpoints = ['atletas/mercado', 'partidas', 'mercado/status'];
    const needsAuth = !publicEndpoints.includes(endpoint);
    
    const headers = {
        'Authorization': needsAuth ? `Bearer ${req.session.accessToken}` : undefined,
        'X-GLB-Auth': 'oidc',
        'X-GLB-APP': 'cartola_web',
        'User-Agent': 'Mozilla/5.0'
    };
    
    if (!needsAuth) delete headers['Authorization'];
    
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
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em ${baseUrl}`);
});
