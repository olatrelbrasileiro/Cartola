// server.js - Versão com Proxy para contornar bloqueio de iframe
const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { proxy } = require('httpproxy'); // Não precisa instalar, vamos fazer manual

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

// ============ PROXY PARA O IFRAME (contorna bloqueio) ============
app.get('/proxy/*', async (req, res) => {
    const targetUrl = req.params[0];
    console.log('Proxy request for:', targetUrl);
    
    try {
        // Busca o conteúdo da URL alvo
        const response = await fetch(decodeURIComponent(targetUrl), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        let content = await response.text();
        
        // Modifica o conteúdo para substituir URLs relativas
        const baseUrlProxy = `${baseUrl}/proxy/`;
        content = content.replace(/href="\//g, `href="${baseUrlProxy}`);
        content = content.replace(/src="\//g, `src="${baseUrlProxy}`);
        content = content.replace(/action="\//g, `action="${baseUrlProxy}`);
        
        // Remove headers que bloqueiam iframe
        res.removeHeader('X-Frame-Options');
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
        res.send(content);
        
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).send('Proxy error');
    }
});

// ============ PÁGINA PRINCIPAL ============
app.get('/', (req, res) => {
    // Gera state e PKCE
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
    
    // Usa o proxy para o iframe
    const proxyLoginUrl = `/proxy/${encodeURIComponent(loginUrl)}`;
    
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
                .container { max-width: 650px; margin: 0 auto; }
                .card {
                    background: white;
                    border-radius: 20px;
                    padding: 25px;
                    margin-bottom: 20px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }
                .logo { font-size: 48px; text-align: center; }
                h1 { text-align: center; color: #333; font-size: 22px; margin: 10px 0; }
                .subtitle { text-align: center; color: #666; margin-bottom: 20px; font-size: 13px; }
                .iframe-wrapper {
                    background: #f0f0f0;
                    border-radius: 12px;
                    padding: 5px;
                    overflow: hidden;
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
                .status-success { background: #d4edda; color: #155724; display: block; }
                .status-error { background: #f8d7da; color: #721c24; display: block; }
                .status-loading { background: #fff3cd; color: #856404; display: block; }
                button {
                    background: #6c757d;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    width: 100%;
                    margin-top: 10px;
                }
                button:hover { background: #5a6268; }
                .dashboard-link { text-align: center; margin-top: 15px; }
                .dashboard-link a { color: #4CAF50; text-decoration: none; }
                .footer { text-align: center; margin-top: 20px; font-size: 11px; color: rgba(255,255,255,0.7); }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <div class="logo">🏆</div>
                    <h1>Cartola Token Manager</h1>
                    <div class="subtitle">Faça login na sua conta Globo.com</div>
                    
                    <div class="iframe-wrapper">
                        <iframe id="loginFrame" src="${proxyLoginUrl}"></iframe>
                    </div>
                    
                    <div class="info">
                        🔐 Faça login no iframe acima. Após autenticar, você será redirecionado automaticamente.
                    </div>
                    
                    <div id="status" class="status"></div>
                    <button id="manualBtn">🔄 Verificar login manualmente</button>
                    
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
                }
                
                async function checkAuth() {
                    if (isProcessing) return;
                    
                    try {
                        const response = await fetch('/api/auth/status');
                        const data = await response.json();
                        
                        if (data.authenticated && data.tokenValid) {
                            isProcessing = true;
                            showStatus('✅ Login detectado! Redirecionando...', 'success');
                            setTimeout(() => {
                                window.location.href = '/dashboard';
                            }, 1000);
                        }
                    } catch(e) {
                        console.log('Verificando...');
                    }
                }
                
                document.getElementById('manualBtn').onclick = async () => {
                    showStatus('🔍 Verificando autenticação...', 'loading');
                    await checkAuth();
                    if (!isProcessing) {
                        showStatus('⚠️ Ainda não detectado. Complete o login no iframe.', 'error');
                        setTimeout(() => hideStatus(), 3000);
                    }
                };
                
                // Verifica a cada 2 segundos
                checkInterval = setInterval(checkAuth, 2000);
                
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
    
    console.log('Exchange request:', { code: code?.substring(0, 50), state });
    
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

// Rota para receber callback (via fetch do iframe)
app.post('/api/callback', (req, res) => {
    const { code, state } = req.body;
    res.json({ received: true });
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
                .token-status { padding: 12px; border-radius: 8px; margin-bottom: 20px; }
                .token-valid { background: #d4edda; color: #155724; }
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
                    <div id="tokenStatus" class="token-status token-valid">✅ Token válido</div>
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
    const publicEndpoints = ['atletas/mercado', 'partidas', 'mercado/status'];
    const needsAuth = !publicEndpoints.includes(endpoint);
    
    const headers = {
        'Authorization': `Bearer ${req.session.accessToken}`,
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
