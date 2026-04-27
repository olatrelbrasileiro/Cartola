const fetch = require('node-fetch');

const BASE = 'https://api.cartola.globo.com';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
    'Accept': 'application/json',
    'X-GLB-Auth': 'oidc',
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

const POSICOES = {
    1: 'GOL',
    2: 'LAT',
    3: 'ZAG',
    4: 'MEI',
    5: 'ATA',
    6: 'TEC'
};

const STATUS_NOMES = {
    2: 'Dúvida',
    3: 'Suspenso',
    5: 'Contundido',
    6: 'Nulo',
    7: 'Provável'
};

async function getMercadoStatus()  { return getCached('mercado/status',     30_000); }
async function getAtletas()        { return getCached('atletas/mercado',    60_000); }
async function getParciais()       { return getCached('atletas/pontuados',  20_000); }
async function getPartidas()       { return getCached('partidas',           60_000); }
async function getClubes()         { return getCached('clubes',            300_000); }
async function getDestaques()      { return getCached('mercado/destaques', 120_000); }

async function getEnrichedAthletes(opts = {}) {
    const [mercado, parciais, clubesData, status] = await Promise.all([
        getAtletas(),
        getParciais().catch(() => ({ atletas: {} })),
        getClubes(),
        getMercadoStatus()
    ]);

    const atletas = mercado.atletas || [];
    const parciaisAtletas = parciais.atletas || {};
    const clubesMap = clubesData || {};

    const enriched = atletas.map(a => {
        const clube = clubesMap[a.clube_id] || {};
        const parcial = parciaisAtletas[a.atleta_id];
        return {
            id: a.atleta_id,
            apelido: a.apelido,
            nome: a.nome,
            posicao: POSICOES[a.posicao_id] || a.posicao_id,
            posicao_id: a.posicao_id,
            clube: clube.nome || clube.abreviacao || `clube_${a.clube_id}`,
            clube_id: a.clube_id,
            preco: a.preco_num,
            variacao: a.variacao_num,
            media: a.media_num,
            jogos: a.jogos_num,
            pontos_ultima: a.pontos_num,
            status: STATUS_NOMES[a.status_id] || `status_${a.status_id}`,
            status_id: a.status_id,
            scout: a.scout || {},
            entrou_em_campo: !!a.entrou_em_campo,
            parcial: parcial ? parcial.pontuacao : null,
            parcial_scout: parcial ? parcial.scout : null,
            foto: a.foto
        };
    });

    return {
        rodada_atual: status.rodada_atual,
        status_mercado: status.status_mercado,
        atletas: enriched
    };
}

function summarizeForLLM(enriched, opts = {}) {
    const { onlyProvavel = true, maxPorPosicao = 12 } = opts;
    const groups = { GOL: [], LAT: [], ZAG: [], MEI: [], ATA: [], TEC: [] };

    let pool = enriched.atletas;
    if (onlyProvavel) {
        pool = pool.filter(a => a.status === 'Provável');
    }

    for (const a of pool) {
        const g = groups[a.posicao];
        if (g) g.push(a);
    }

    for (const k of Object.keys(groups)) {
        groups[k].sort((x, y) => (y.media || 0) - (x.media || 0));
        groups[k] = groups[k].slice(0, maxPorPosicao).map(a => ({
            id: a.id,
            apelido: a.apelido,
            clube: a.clube,
            preco: a.preco,
            media: a.media,
            jogos: a.jogos,
            ult: a.pontos_ultima,
            var: a.variacao,
            status: a.status
        }));
    }

    return {
        rodada_atual: enriched.rodada_atual,
        status_mercado: enriched.status_mercado,
        por_posicao: groups
    };
}

module.exports = {
    BASE,
    HEADERS,
    POSICOES,
    STATUS_NOMES,
    getMercadoStatus,
    getAtletas,
    getParciais,
    getPartidas,
    getClubes,
    getDestaques,
    getEnrichedAthletes,
    summarizeForLLM
};
