// server.js - Com rota /auth/login corrigida
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

// ============ ROTA DE LOGIN (CORRIGIDA) ============
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

// Rota de callback (onde o usuário é redirecionado após login)
app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    
    if (!code) {
        return res.status(400).send('Código não encontrado');
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
        const response = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        
        const tokens = await response.json();
        
        if (tokens.error) {
            return res.status(400).send('Erro: ' + tokens.error_description);
        }
        
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;
        req.session.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
        
        res.redirect('/dashboard');
        
    } catch (error) {
        res.status(500).send('Erro ao obter token: ' + error.message);
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
                setInterval(loadStats, 30000);
            </script>
        </body>
        </html>
    `);
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

// Logout
app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em ${baseUrl}`);
});
