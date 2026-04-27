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
                    <p>Catálogo extraído do bundle oficial. Clique para testar — endpoints com parâmetros (<code>:id</code>, <code>:rodada</code> etc.) abrem um prompt.</p>
                    <div style="margin:15px 0;">
                        <input id="apiFilter" placeholder="🔎 Filtrar endpoint..." style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;" />
                    </div>
                    <div id="apiGroups"></div>
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
                    responseArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    try {
                        const response = await fetch(\`/api/cartola/\${endpoint}\`);
                        const text = await response.text();
                        let data;
                        try { data = JSON.parse(text); } catch(_) { data = text; }
                        responseArea.innerHTML = \`
                            <div style="margin-bottom:15px;">
                                <strong>📡 \${response.status} GET /\${endpoint}</strong>
                                <button onclick="copyResponse()" style="margin-left:10px;padding:4px 8px;">📋 Copiar</button>
                                <button onclick="closeResponse()" style="margin-left:5px;padding:4px 8px;">❌ Fechar</button>
                            </div>
                            <pre>\${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}</pre>
                        \`;
                        lastResponse = data;
                    } catch(e) {
                        responseArea.innerHTML = \`<div style="color:#f44336;">❌ Erro: \${e.message}</div>\`;
                    }
                }
                
                function copyResponse() { if (lastResponse) { navigator.clipboard.writeText(typeof lastResponse === 'string' ? lastResponse : JSON.stringify(lastResponse, null, 2)); alert('Copiado!'); } }
                function closeResponse() { document.getElementById('responseArea').classList.remove('show'); }
                async function logout() { await fetch('/auth/logout'); window.location.href = '/'; }

                function resolveEndpoint(template) {
                    // Substitui :param por valores via prompt
                    if (template.includes('?')) {
                        const [base, qs] = template.split('?');
                        const val = prompt(\`Informe o valor para "?\${qs}"\`, '');
                        if (val === null) return null;
                        return \`\${base}?\${qs}\${encodeURIComponent(val)}\`;
                    }
                    return template.replace(/:([a-zA-Z_]+)/g, (_, name) => {
                        const v = prompt(\`Informe o valor para :\${name}\`, '');
                        return v === null ? '' : encodeURIComponent(v);
                    });
                }

                const groupLabels = {
                    'meu-time':  '🏆 Meu Time',
                    'atletas':   '⚽ Atletas',
                    'mercado':   '💰 Mercado',
                    'partidas':  '🗓️ Partidas',
                    'clubes':    '🏟️ Clubes',
                    'ligas':     '🏅 Ligas',
                    'time':      '👤 Times',
                    'busca':     '🔎 Busca',
                    'social':    '👥 Social',
                    'meta':      '📰 Meta'
                };

                async function loadCatalog() {
                    const container = document.getElementById('apiGroups');
                    container.innerHTML = '<div style="padding:15px;color:#666;">Carregando catálogo...</div>';
                    try {
                        const r = await fetch('/api/catalog');
                        const data = await r.json();
                        const groups = {};
                        for (const ep of data.endpoints) {
                            (groups[ep.group] ||= []).push(ep);
                        }
                        container.innerHTML = '';
                        const order = ['meu-time','atletas','mercado','partidas','clubes','ligas','time','busca','social','meta'];
                        for (const g of order) {
                            if (!groups[g]) continue;
                            const section = document.createElement('div');
                            section.style.marginBottom = '20px';
                            section.innerHTML = \`<h3 style="margin-bottom:10px;color:#444;">\${groupLabels[g] || g}</h3>\`;
                            const list = document.createElement('div');
                            list.className = 'api-list';
                            for (const ep of groups[g]) {
                                const item = document.createElement('div');
                                item.className = 'api-item';
                                item.dataset.endpoint = ep.path;
                                item.dataset.method = ep.method;
                                item.dataset.search = (ep.path + ' ' + ep.desc).toLowerCase();
                                const lock = ep.authRequired ? '🔒 ' : '';
                                item.innerHTML = \`
                                    <div>
                                        <div class="api-name">\${lock}\${ep.method} /\${ep.path}</div>
                                        <div class="api-desc" style="font-size:12px;color:#666;">\${ep.desc}</div>
                                    </div>
                                    <span>🔍 Testar →</span>
                                \`;
                                item.addEventListener('click', () => {
                                    if (ep.method !== 'GET') {
                                        alert('Este endpoint usa ' + ep.method + ' — ainda não suportado pelo painel.');
                                        return;
                                    }
                                    const resolved = resolveEndpoint(ep.path);
                                    if (resolved) callApi(resolved);
                                });
                                list.appendChild(item);
                            }
                            section.appendChild(list);
                            container.appendChild(section);
                        }
                    } catch(e) {
                        container.innerHTML = '<div style="color:#f44336;padding:15px;">Erro carregando catálogo: ' + e.message + '</div>';
                    }
                }

                document.getElementById('apiFilter').addEventListener('input', (e) => {
                    const q = e.target.value.toLowerCase().trim();
                    document.querySelectorAll('.api-item').forEach(el => {
                        el.style.display = !q || el.dataset.search.includes(q) ? '' : 'none';
                    });
                });

                loadCatalog();
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

// ============ Catálogo de endpoints da API do Cartola ============
// Extraído do bundle main.js do app oficial. authRequired indica se o endpoint
// exige Bearer token (rota /auth/* ou /logged/*).
const cartolaCatalog = [
    // --- Mercado / dados públicos ---
    { path: 'mercado/status',           method: 'GET', authRequired: false, group: 'mercado',   desc: 'Status do mercado, rodada atual, fechamento' },
    { path: 'mercado/destaques',        method: 'GET', authRequired: false, group: 'mercado',   desc: 'Atletas mais escalados / destaques do mercado' },
    { path: 'atletas/mercado',          method: 'GET', authRequired: false, group: 'atletas',   desc: 'Lista completa de atletas disponíveis no mercado (preço, scout, status)' },
    { path: 'atletas/pontuados',        method: 'GET', authRequired: false, group: 'atletas',   desc: 'Pontuação parcial dos atletas na rodada em andamento' },
    { path: 'atletas/pontuados/:rodada',method: 'GET', authRequired: false, group: 'atletas',   desc: 'Pontuação consolidada dos atletas em uma rodada específica' },
    { path: 'atletas/status',           method: 'GET', authRequired: false, group: 'atletas',   desc: 'Tabela de status possíveis (provável, dúvida, contundido, suspenso, nulo)' },
    { path: 'clubes',                   method: 'GET', authRequired: false, group: 'clubes',    desc: 'Cadastro de todos os clubes' },
    { path: 'clubes/mercado',           method: 'GET', authRequired: false, group: 'clubes',    desc: 'Clubes ativos no mercado atual' },
    { path: 'posicoes',                 method: 'GET', authRequired: false, group: 'clubes',    desc: 'Tabela de posições (gol, lat, zag, mei, ata, tec)' },
    { path: 'partidas',                 method: 'GET', authRequired: false, group: 'partidas',  desc: 'Partidas da rodada atual' },
    { path: 'partidas/:rodada',         method: 'GET', authRequired: false, group: 'partidas',  desc: 'Partidas de uma rodada específica' },
    { path: 'rodadas',                  method: 'GET', authRequired: false, group: 'partidas',  desc: 'Lista de rodadas com início e fim' },
    { path: 'pos-rodada/destaques',     method: 'GET', authRequired: false, group: 'mercado',   desc: 'Destaques pós-rodada (seleção da rodada, mito etc.)' },
    { path: 'patrocinadores',           method: 'GET', authRequired: false, group: 'mercado',   desc: 'Patrocinadores das ligas' },
    { path: 'busca?q=',                 method: 'GET', authRequired: false, group: 'busca',     desc: 'Busca global (times e ligas)' },
    { path: 'times?q=',                 method: 'GET', authRequired: false, group: 'busca',     desc: 'Busca de times por nome' },
    { path: 'ligas?q=',                 method: 'GET', authRequired: false, group: 'busca',     desc: 'Busca de ligas por nome' },
    { path: 'ligas/destaques',          method: 'GET', authRequired: false, group: 'ligas',     desc: 'Ligas em destaque' },
    { path: 'ligas/ultimas',            method: 'GET', authRequired: false, group: 'ligas',     desc: 'Últimas ligas criadas' },
    { path: 'time/id/:id',              method: 'GET', authRequired: false, group: 'time',      desc: 'Time público pelo id' },
    { path: 'time/substituicoes/:id',                method: 'GET', authRequired: false, group: 'time', desc: 'Substituições já feitas pelo time na rodada atual' },
    { path: 'time/substituicoes/:id/:rodada',        method: 'GET', authRequired: false, group: 'time', desc: 'Substituições de um time em uma rodada específica' },
    { path: 'liga/:liga_id/times',      method: 'GET', authRequired: false, group: 'ligas',     desc: 'Times participantes de uma liga' },
    { path: 'termodeuso/:serviceId',    method: 'GET', authRequired: false, group: 'meta',      desc: 'Termo de uso de um serviço' },

    // --- Endpoints autenticados (precisam do Bearer) ---
    { path: 'auth/time/info',           method: 'GET', authRequired: true,  group: 'meu-time',  desc: 'Informações completas do meu time (escalação, patrimônio, pontos)' },
    { path: 'auth/time',                method: 'GET', authRequired: true,  group: 'meu-time',  desc: 'Resumo do meu time' },
    { path: 'auth/time/historico/',     method: 'GET', authRequired: true,  group: 'meu-time',  desc: 'Histórico de pontuação do meu time' },
    { path: 'auth/time/pro',            method: 'GET', authRequired: true,  group: 'meu-time',  desc: 'Status Cartola PRO do meu time' },
    { path: 'auth/time/patrocinadores', method: 'GET', authRequired: true,  group: 'meu-time',  desc: 'Patrocinadores do meu time' },
    { path: 'auth/time/salvar',         method: 'POST',authRequired: true,  group: 'meu-time',  desc: 'Salvar escalação' },
    { path: 'auth/time/substituicoes',  method: 'GET', authRequired: true,  group: 'meu-time',  desc: 'Substituições disponíveis' },
    { path: 'auth/stats/historico',     method: 'GET', authRequired: true,  group: 'meu-time',  desc: 'Estatísticas históricas do meu time' },
    { path: 'auth/mercado/atleta/:idAtleta/pontuacao', method: 'GET', authRequired: true, group: 'atletas', desc: 'Histórico de pontuação de um atleta' },
    { path: 'auth/gatomestre/atletas',  method: 'GET', authRequired: true,  group: 'atletas',   desc: 'Análises do Gato Mestre por atleta' },
    { path: 'auth/noticias',            method: 'GET', authRequired: true,  group: 'meta',      desc: 'Feed de notícias do Cartola' },
    { path: 'auth/aviso',               method: 'GET', authRequired: true,  group: 'meta',      desc: 'Avisos para o usuário logado' },
    { path: 'auth/amigos',              method: 'GET', authRequired: true,  group: 'social',    desc: 'Amigos do usuário' },
    { path: 'auth/convites',            method: 'GET', authRequired: true,  group: 'social',    desc: 'Convites recebidos' },
    { path: 'auth/ligas',               method: 'GET', authRequired: true,  group: 'ligas',     desc: 'Ligas em que estou' },
    { path: 'auth/liga/:slug',          method: 'GET', authRequired: true,  group: 'ligas',     desc: 'Detalhes de uma liga' },
    { path: 'auth/reativar/ligas',      method: 'GET', authRequired: true,  group: 'ligas',     desc: 'Ligas elegíveis para reativação' },
    { path: 'logged/stats/atletas',     method: 'GET', authRequired: true,  group: 'atletas',   desc: 'Stats agregadas de atletas para usuário logado' },
    { path: 'logged/ligas/campeoes-nacionais', method: 'GET', authRequired: true, group: 'ligas', desc: 'Campeões das ligas nacionais' },
    { path: 'logged/liga/?search=',     method: 'GET', authRequired: true,  group: 'ligas',     desc: 'Busca de ligas (logado)' },
    { path: 'logged/time/?search=',     method: 'GET', authRequired: true,  group: 'busca',     desc: 'Busca de times (logado)' }
];

const authRequiredPaths = new Set(
    cartolaCatalog
        .filter(e => e.authRequired)
        .map(e => e.path.split(/[?:]/)[0].replace(/\/$/, ''))
);

function endpointNeedsAuth(endpoint) {
    const clean = endpoint.split('?')[0].replace(/\/$/, '');
    if (clean.startsWith('auth/') || clean.startsWith('logged/')) return true;
    for (const prefix of authRequiredPaths) {
        if (clean === prefix || clean.startsWith(prefix + '/')) return true;
    }
    return false;
}

// ============ API: Catálogo de endpoints ============
app.get('/api/catalog', (req, res) => {
    res.json({
        baseUrl: config.cartolaApi,
        proxyBase: '/api/cartola/',
        total: cartolaCatalog.length,
        endpoints: cartolaCatalog
    });
});

// ============ API: Proxy para Cartola ============
app.get('/api/cartola/:endpoint(*)', async (req, res) => {
    const endpoint = req.params.endpoint;
    const needsAuth = endpointNeedsAuth(endpoint);

    if (needsAuth && !req.session.accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const qs = req.url.includes('?') ? '?' + req.url.split('?').slice(1).join('?') : '';
    const url = `${config.cartolaApi}/${endpoint}${qs}`;

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
        const text = await response.text();
        res.status(response.status);
        try {
            res.json(JSON.parse(text));
        } catch (_) {
            res.type(response.headers.get('content-type') || 'text/plain').send(text);
        }
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
