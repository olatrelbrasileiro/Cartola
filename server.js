const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const { suggestLineup, ESQUEMAS, PREFERENCIAS } = require('./services/insights');
const { streamChat } = require('./services/chat');
const usage = require('./services/usage');
const { getSnapshot, getHistoricoRodadas, BASE: CARTOLA_BASE, HEADERS: CARTOLA_HEADERS } = require('./services/cartolaData');

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    next();
});
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============ Snapshot completo ============
app.get('/api/snapshot', async (req, res) => {
    try {
        const snap = await getSnapshot();
        res.json(snap);
    } catch (e) {
        console.error('snapshot erro:', e);
        res.status(502).json({ error: e.message });
    }
});

// ============ Histórico de pontuação por rodada ============
app.get('/api/history', async (req, res) => {
    try {
        const rodadasParam = String(req.query.rodadas || '').split(',').filter(Boolean).map(n => Number(n)).filter(Number.isFinite);
        if (!rodadasParam.length) return res.status(400).json({ error: 'Use ?rodadas=12,13,14' });
        if (rodadasParam.length > 12) return res.status(400).json({ error: 'Máx. 12 rodadas por chamada' });
        const out = await getHistoricoRodadas(rodadasParam);
        res.json(out);
    } catch (e) {
        res.status(502).json({ error: e.message });
    }
});

// ============ Insights de escalação ============
app.post('/api/insights/lineup', async (req, res) => {
    try {
        const cartoletas = Number(req.body?.cartoletas) || 120;
        const esquema = String(req.body?.esquema || '4-3-3');
        const preferencia = String(req.body?.preferencia || 'equilibrado');
        const evitarDuvidas = req.body?.evitarDuvidas !== false;
        if (!ESQUEMAS[esquema]) {
            return res.status(400).json({ error: 'esquema_invalido', validos: Object.keys(ESQUEMAS) });
        }
        if (!PREFERENCIAS[preferencia]) {
            return res.status(400).json({ error: 'preferencia_invalida', validos: Object.keys(PREFERENCIAS) });
        }
        const result = await suggestLineup({ cartoletas, esquema, preferencia, evitarDuvidas });
        res.json(result);
    } catch (e) {
        console.error('lineup erro:', e);
        usage.setError(e.message);
        res.status(500).json({ error: e.message });
    }
});

// ============ Chat com IA (streaming SSE) ============
app.post('/api/chat', async (req, res) => {
    try {
        const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
        if (!messages || !messages.length) return res.status(400).json({ error: 'messages obrigatório' });
        const sanitized = messages
            .filter(m => m && ['user', 'assistant', 'system'].includes(m.role) && typeof m.content === 'string')
            .map(m => ({ role: m.role, content: m.content.slice(0, 8000) }))
            .slice(-30);
        const extraContext = typeof req.body?.extraContext === 'string' ? req.body.extraContext.slice(0, 8000) : null;
        await streamChat({ messages: sanitized, extraContext }, res);
    } catch (e) {
        console.error('chat erro:', e);
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

// ============ Uso da IA na sessão ============
app.get('/api/usage', (req, res) => {
    res.json(usage.snapshot());
});

// ============ Proxy genérico (somente endpoints públicos) ============
const ALLOWED_PUBLIC = [
    /^mercado\/status$/,
    /^mercado\/destaques$/,
    /^atletas\/mercado$/,
    /^atletas\/pontuados$/,
    /^atletas\/pontuados\/\d+$/,
    /^partidas$/,
    /^partidas\/\d+$/,
    /^clubes$/,
    /^posicoes$/,
    /^esquemas$/,
    /^pos-rodada\/destaques$/
];
app.get('/api/cartola/:endpoint(*)', async (req, res) => {
    const endpoint = req.params.endpoint;
    if (!ALLOWED_PUBLIC.some(rx => rx.test(endpoint))) {
        return res.status(403).json({ error: 'endpoint_nao_publico', endpoint });
    }
    try {
        const qs = new URLSearchParams(req.query).toString();
        const url = `${CARTOLA_BASE}/${endpoint}${qs ? '?' + qs : ''}`;
        const r = await fetch(url, { headers: CARTOLA_HEADERS });
        const text = await r.text();
        res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(text);
    } catch (e) {
        res.status(502).json({ error: e.message });
    }
});

// ============ Health ============
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cartola IA rodando em :${PORT}`);
});
