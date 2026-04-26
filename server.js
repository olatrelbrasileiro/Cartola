// server.js - Backend completo para autenticação Cartola FC
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
    redirectUri: `${baseUrl}/callback`,
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

// Rota inicial
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dashboard (protegido)
app.get('/dashboard', (req, res) => {
    if (!req.session.accessToken) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Iniciar login OAuth
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
    
    const authUrl = `${config.authUrl}?${params.toString()}`;
    console.log('Redirecting to:', authUrl);
    res.redirect(authUrl);
});

// Callback OAuth
app.get('/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;
    
    if (error) {
        console.error('OAuth error:', error, error_description);
        return res.status(400).send(`Erro: ${error} - ${error_description}`);
    }
    
    if (state !== req.session.oauthState) {
        console.error('State mismatch');
        return res.status(400).send('Erro de segurança: state inválido');
    }
    
    if (!code) {
        return res.status(400).send('Código de autorização não encontrado');
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
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
        }
        
        const tokens = await response.json();
        
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;
        req.session.idToken = tokens.id_token;
        req.session.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
        
        console.log('Authentication successful!');
        res.redirect('/dashboard');
        
    } catch (error) {
        console.error('Token exchange error:', error);
        res.status(500).send('Erro ao obter token de acesso');
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
        
        if (!response.ok) {
            throw new Error(`Refresh failed: ${response.status}`);
        }
        
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
    
    res.json({
        authenticated: isAuthenticated,
        tokenValid: isValid,
        expiresAt: req.session.tokenExpiry
    });
});

// API: User info
app.get('/api/user/info', async (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
        // Decodifica o token
        const payload = req.session.accessToken.split('.')[1];
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
        
        // Busca informações adicionais
        const response = await fetch(config.userInfoUrl, {
            headers: { 'Authorization': `Bearer ${req.session.accessToken}` }
        });
        
        let userInfo = {};
        if (response.ok) {
            userInfo = await response.json();
        }
        
        res.json({
            name: decoded.name || userInfo.name,
            email: decoded.email || userInfo.email,
            globoId: decoded.globo_id,
            globeId: decoded.globe_id,
            ...userInfo
        });
        
    } catch (error) {
        console.error('User info error:', error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
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
    
    // Para APIs públicas, não precisa de token
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
        console.error('API proxy error:', error);
        res.status(500).json({ error: 'API request failed' });
    }
});

// Health check para Render
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Porta
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em ${baseUrl}`);
    console.log(`📡 Ambiente: ${isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'}`);
});
