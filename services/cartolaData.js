const fetch = require('node-fetch');

const BASE = 'https://api.cartola.globo.com';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
    'Accept': 'application/json',
    'X-GLB-APP': 'cartola_web',
    'Referer': 'https://cartola.globo.com/'
};

const cache = new Map();

async function getCached(path, ttlMs) {
    const now = Date.now();
    const hit = cache.get(path);
    if (hit && now - hit.at < ttlMs) return hit.data;
    const res = await fetch(`${BASE}/${path}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`Cartola ${path} -> HTTP ${res.status}`);
    const data = await res.json();
    cache.set(path, { at: now, data });
    return data;
}

const POSICAO_ABREV = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA', 6: 'TEC' };
const POSICAO_NOME  = { 1: 'Goleiro', 2: 'Lateral', 3: 'Zagueiro', 4: 'Meia', 5: 'Atacante', 6: 'Técnico' };
const STATUS_NOME = { 2: 'Dúvida', 3: 'Suspenso', 5: 'Contundido', 6: 'Nulo', 7: 'Provável' };

async function getMercadoStatus()  { return getCached('mercado/status',     30_000); }
async function getAtletas()        { return getCached('atletas/mercado',    60_000); }
async function getParciais()       { return getCached('atletas/pontuados',  20_000); }
async function getPartidas()       { return getCached('partidas',           60_000); }
async function getClubes()         { return getCached('clubes',            300_000); }
async function getDestaques()      { return getCached('mercado/destaques', 120_000); }

async function getPontuadosRodada(rodada) {
    return getCached(`atletas/pontuados/${rodada}`, 10 * 60_000);
}

async function getHistoricoRodadas(rodadas) {
    const results = await Promise.all(
        rodadas.map(r => getPontuadosRodada(r).catch(() => ({ rodada: r, atletas: {} })))
    );
    const porAtleta = new Map();
    for (const { rodada, atletas } of results) {
        for (const [id, info] of Object.entries(atletas || {})) {
            if (!porAtleta.has(id)) porAtleta.set(id, []);
            porAtleta.get(id).push({ rodada, pontos: info.pontuacao ?? 0, scout: info.scout || {} });
        }
    }
    for (const arr of porAtleta.values()) arr.sort((a, b) => a.rodada - b.rodada);
    return { rodadas, porAtleta: Object.fromEntries(porAtleta) };
}

function buildAdversarioMap(partidas, clubes) {
    const map = {};
    for (const p of partidas?.partidas || []) {
        const casa = clubes[p.clube_casa_id];
        const fora = clubes[p.clube_visitante_id];
        if (casa && fora) {
            map[p.clube_casa_id]      = { adv: fora.abreviacao || fora.nome, mando: 'casa', local: p.local || null };
            map[p.clube_visitante_id] = { adv: casa.abreviacao || casa.nome, mando: 'fora', local: p.local || null };
        }
    }
    return map;
}

function fotoFormato(url, formato = '140x140') {
    if (!url) return null;
    return url.replace('FORMATO', formato);
}

function escudo(clube, size = '60x60') {
    return clube?.escudos?.[size] || null;
}

function estimarValorizacaoMinima(atleta, historicoAtleta) {
    if (!atleta || atleta.preco_num <= 0) return null;
    const baseMedia = atleta.media_num || 0;
    const ultimas = (historicoAtleta || []).slice(-3).map(h => h.pontos);
    const mediaRecente = ultimas.length ? ultimas.reduce((a, b) => a + b, 0) / ultimas.length : baseMedia;
    const blend = ultimas.length >= 2 ? (baseMedia * 0.5 + mediaRecente * 0.5) : baseMedia;
    return Number(blend.toFixed(2));
}

function projetarValorizacao(atleta, minimo) {
    if (atleta.preco_num <= 0 || minimo == null) return 0;
    const proxima = atleta.media_num || 0;
    const fator = atleta.preco_num / 8;
    return Number(((proxima - minimo) * 0.55 * fator).toFixed(2));
}

async function getSnapshot() {
    const [status, mercado, partidas] = await Promise.all([
        getMercadoStatus(),
        getAtletas(),
        getPartidas().catch(() => ({ partidas: [] }))
    ]);

    const clubes = mercado.clubes || {};
    const adv = buildAdversarioMap(partidas, clubes);
    const rodadaAtual = status.rodada_atual || 0;
    const rodadasParaHistorico = [];
    for (let r = Math.max(1, rodadaAtual - 5); r < rodadaAtual; r++) rodadasParaHistorico.push(r);
    const historico = rodadasParaHistorico.length
        ? await getHistoricoRodadas(rodadasParaHistorico)
        : { rodadas: [], porAtleta: {} };

    const atletas = (mercado.atletas || []).map(a => {
        const clube = clubes[a.clube_id] || {};
        const histAtleta = historico.porAtleta[a.atleta_id] || [];
        const minVal = estimarValorizacaoMinima(a, histAtleta);
        const projVal = projetarValorizacao(a, minVal);
        return {
            atleta_id: a.atleta_id,
            apelido: a.apelido,
            apelido_abreviado: a.apelido_abreviado,
            nome: a.nome,
            slug: a.slug,
            foto: fotoFormato(a.foto, '140x140'),
            foto_pequena: fotoFormato(a.foto, '50x50'),
            posicao_id: a.posicao_id,
            posicao: POSICAO_ABREV[a.posicao_id] || '?',
            posicao_nome: POSICAO_NOME[a.posicao_id] || '?',
            clube_id: a.clube_id,
            clube_abrev: clube.abreviacao || clube.nome || '?',
            clube_nome: clube.nome_fantasia || clube.nome || '?',
            escudo: escudo(clube, '60x60'),
            escudo_pequeno: escudo(clube, '30x30'),
            preco_num: a.preco_num,
            variacao_num: a.variacao_num,
            media_num: a.media_num,
            pontos_num: a.pontos_num,
            jogos_num: a.jogos_num,
            scout: a.scout || {},
            status_id: a.status_id,
            status_nome: STATUS_NOME[a.status_id] || `?`,
            entrou_em_campo: !!a.entrou_em_campo,
            adversario: adv[a.clube_id] || null,
            historico: histAtleta,
            minimo_valorizar_est: minVal,
            valorizacao_projetada: projVal
        };
    });

    return {
        rodada_atual: rodadaAtual,
        status_mercado: status.status_mercado,
        fechamento: status.fechamento,
        times_escalados: status.times_escalados,
        clubes,
        partidas: partidas.partidas || [],
        rodadas_historico: rodadasParaHistorico,
        atletas
    };
}

module.exports = {
    BASE,
    HEADERS,
    POSICAO_ABREV,
    POSICAO_NOME,
    STATUS_NOME,
    getMercadoStatus,
    getAtletas,
    getParciais,
    getPartidas,
    getClubes,
    getDestaques,
    getPontuadosRodada,
    getHistoricoRodadas,
    getSnapshot,
    buildAdversarioMap,
    fotoFormato,
    escudo
};
