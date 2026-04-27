// server.js - Código COMPLETO
const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const crypto = require('crypto');

const app = express();

const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 5000;
const baseUrl = isProduction 
    ? process.env.RENDER_EXTERNAL_URL || process.env.REPLIT_DEV_DOMAIN || 'https://seu-app.onrender.com'
    : process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:${PORT}`;

app.set('trust proxy', 1);

if (!isProduction) {
    app.use((req, res, next) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        next();
    });
}

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
    cookie: { secure: isProduction, httpOnly: true, maxAge: 24 * 60 * 60 * 1000, sameSite: 'lax' }
}));

function generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

// ============ ROTA DE LOGIN ============
app.get('/auth/login', (req, res) => {
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
    res.redirect(loginUrl);
});

// ============ CALLBACK (onde o usuário volta após login) ============
app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    
    if (!code) {
        return res.status(400).send('Código não encontrado');
    }
    
    // Verifica state (opcional, mas recomendado)
    if (state !== req.session.oauthState) {
        console.warn('State mismatch. Session:', req.session.oauthState, 'Received:', state);
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
        
        // Se falhar, tenta sem code_verifier
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
            return res.status(400).send('Erro ao obter token: ' + tokens.error_description);
        }
        
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;
        req.session.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
        
        res.redirect('/dashboard');
        
    } catch (error) {
        res.status(500).send('Erro: ' + error.message);
    }
});

// ============ PÁGINA PRINCIPAL ============
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
                    max-width: 500px;
                    width: 100%;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }
                .logo { font-size: 64px; margin-bottom: 20px; }
                h1 { color: #333; margin-bottom: 10px; }
                p { color: #666; margin-bottom: 30px; }
                .btn-login {
                    background: #4CAF50;
                    color: white;
                    border: none;
                    padding: 15px 30px;
                    border-radius: 50px;
                    font-size: 18px;
                    cursor: pointer;
                    text-decoration: none;
                    display: inline-block;
                }
                .btn-login:hover { background: #45a049; transform: translateY(-2px); }
                .info {
                    margin-top: 30px;
                    padding: 15px;
                    background: #e3f2fd;
                    border-radius: 10px;
                    font-size: 13px;
                    color: #1565c0;
                }
                .footer { margin-top: 30px; font-size: 12px; color: #999; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">🏆</div>
                <h1>Cartola Token Manager</h1>
                <p>Clique no botão abaixo para fazer login</p>
                <a href="/auth/login" class="btn-login">🔑 Entrar com Globo.com</a>
                <div class="info">
                    🔐 Você será redirecionado para o login da Globo.com
                </div>
                <div class="footer">
                    Após o login, você será redirecionado de volta e seu token será obtido automaticamente.
                </div>
            </div>
        </body>
        </html>
    `);
});

// ============ DASHBOARD ============
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
                .header-content { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; }
                .logo { font-size: 24px; font-weight: bold; }
                .btn-logout { background: rgba(255,255,255,0.2); border: none; color: white; padding: 8px 16px; border-radius: 8px; cursor: pointer; }
                .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                .card { background: white; border-radius: 12px; padding: 25px; margin-bottom: 25px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
                .card h2 { margin-bottom: 20px; border-bottom: 2px solid #667eea; display: inline-block; padding-bottom: 5px; }
                .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 20px; }
                .stat-card { background: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center; }
                .stat-value { font-size: 28px; font-weight: bold; color: #667eea; }
                .stat-label { color: #666; margin-top: 5px; }
                .api-list { display: flex; flex-direction: column; gap: 10px; }
                .api-item { background: #f8f9fa; padding: 15px; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; transition: all 0.3s; }
                .api-item:hover { background: #e9ecef; transform: translateX(5px); }
                .api-name { font-family: monospace; color: #667eea; font-weight: bold; }
                .response-area { background: #263238; color: #a6c1ff; padding: 20px; border-radius: 8px; font-family: monospace; font-size: 12px; overflow-x: auto; margin-top: 20px; display: none; max-height: 400px; overflow-y: auto; }
                .response-area.show { display: block; }
                .token-status { padding: 12px; border-radius: 8px; margin-bottom: 20px; }
                .token-valid { background: #d4edda; color: #155724; }
                .refresh-btn { background: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; margin-left: 10px; }
                @media (max-width: 768px) { .header-content { flex-direction: column; text-align: center; } .api-item { flex-direction: column; text-align: center; } }
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
                
                function copyResponse() { if (lastResponse) { navigator.clipboard.writeText(JSON.stringify(lastResponse, null, 2)); alert('Copiado!'); } }
                function closeResponse() { document.getElementById('responseArea').classList.remove('show'); }
                async function logout() { await fetch('/auth/logout'); window.location.href = '/'; }
                
                document.querySelectorAll('.api-item').forEach(el => {
                    el.addEventListener('click', () => callApi(el.dataset.endpoint));
                });
                
                loadTeamStats();
                checkTokenStatus();
                setInterval(checkTokenStatus, 30000);
                setInterval(loadTeamStats, 60000);
            </script>
        </body>
        </html>
    `);
});

// ============ API: Status do Token ============
app.get('/api/auth/status', (req, res) => {
    const isAuthenticated = !!req.session.accessToken;
    const isValid = isAuthenticated && Date.now() < req.session.tokenExpiry;
    res.json({ authenticated: isAuthenticated, tokenValid: isValid, expiresAt: req.session.tokenExpiry });
});

// ============ API: Renovar Token ============
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

// ============ API: Logout ============
app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ============ API: Proxy para Cartola ============
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

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando em ${baseUrl} (porta ${PORT})`);
});
