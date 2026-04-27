const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getSnapshot, POSICAO_NOME } = require('./cartolaData');
const usage = require('./usage');

// Chave de API fornecida pelo usuário (será usada via env var no deploy real, mas aqui injetamos para teste)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const MODEL_NAME = "gemini-1.5-flash";

const ESQUEMAS = {
    '3-4-3': { GOL: 1, LAT: 0, ZAG: 3, MEI: 4, ATA: 3, TEC: 1 },
    '3-5-2': { GOL: 1, LAT: 0, ZAG: 3, MEI: 5, ATA: 2, TEC: 1 },
    '4-3-3': { GOL: 1, LAT: 2, ZAG: 2, MEI: 3, ATA: 3, TEC: 1 },
    '4-4-2': { GOL: 1, LAT: 2, ZAG: 2, MEI: 4, ATA: 2, TEC: 1 },
    '4-5-1': { GOL: 1, LAT: 2, ZAG: 2, MEI: 5, ATA: 1, TEC: 1 },
    '5-3-2': { GOL: 1, LAT: 2, ZAG: 3, MEI: 3, ATA: 2, TEC: 1 },
    '5-4-1': { GOL: 1, LAT: 2, ZAG: 3, MEI: 4, ATA: 1, TEC: 1 }
};

const PREFERENCIAS = {
    pontos:      'Maximize PONTOS esperados na rodada. Priorize médias altas, atacantes e meias ofensivos, capitão com maior teto.',
    equilibrado: 'Equilibre PONTOS e VALORIZAÇÃO. Combine jogadores com média sólida, custo razoável e potencial de subir de preço.',
    valorizacao: 'Maximize VALORIZAÇÃO de patrimônio. Priorize jogadores com bom score e potencial de ganho.'
};

function compactaAtleta(a) {
    const adv = a.adversario ? { adv: a.adversario.adv, mando: a.adversario.mando } : null;
    const ultimas = (a.historico || []).slice(-10).map(h => ({ r: h.rodada, p: Number(h.pontos.toFixed(1)) }));
    return {
        id: a.atleta_id, nome: a.apelido, pos: a.posicao, clu: a.clube_abrev,
        c$: a.preco_num, med: a.media_num, ult: a.pontos_num,
        jog: a.jogos_num, st: a.status_nome, score: a.score_ia,
        adv, hist: ultimas
    };
}

function buildCandidatos(snapshot, evitarDuvidas, cartoletas) {
    const statusOk = evitarDuvidas ? [7] : [2, 7];
    const pool = snapshot.atletas.filter(a =>
        statusOk.includes(a.status_id) && a.preco_num > 0 && a.preco_num <= cartoletas
    );
    const porPos = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const a of pool) (porPos[a.posicao_id] ||= []).push(a);
    
    // Aumentar pool para o Gemini analisar melhor
    const limites = { 1: 15, 2: 20, 3: 20, 4: 25, 5: 25, 6: 10 };
    const out = [];
    for (const pid of Object.keys(porPos)) {
        const arr = porPos[pid].sort((a, b) => b.score_ia - a.score_ia).slice(0, limites[pid] || 15);
        out.push(...arr);
    }
    return out;
}

async function suggestLineup({ cartoletas = 120, esquema = '4-3-3', preferencia = 'equilibrado', evitarDuvidas = true } = {}) {
    if (!ESQUEMAS[esquema]) throw new Error(`Esquema inválido: ${esquema}`);
    
    const snapshot = await getSnapshot();
    const formacao = ESQUEMAS[esquema];
    const candidatos = buildCandidatos(snapshot, evitarDuvidas, cartoletas).map(compactaAtleta);

    const model = genAI.getGenerativeModel({ 
        model: MODEL_NAME,
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Você é um especialista em Cartola FC. Monte a melhor escalação possível.
Regras:
- Esquema ${esquema}: ${formacao.GOL} GOL, ${formacao.LAT} LAT, ${formacao.ZAG} ZAG, ${formacao.MEI} MEI, ${formacao.ATA} ATA, ${formacao.TEC} TEC.
- Orçamento total: C$ ${cartoletas}.
- Escolha 11 titulares + 1 técnico.
- Escolha 1 Capitão (entre os titulares).
- Escolha 1 Reserva de Luxo (um jogador que NÃO está nos titulares, mas é muito bom).
- Use apenas os IDs fornecidos na lista de candidatos.

Preferência: ${PREFERENCIAS[preferencia]}

Candidatos:
${JSON.stringify(candidatos)}

Responda EXATAMENTE neste formato JSON:
{
  "capitao_id": number,
  "titulares": [{"atleta_id": number, "motivo": "string"}],
  "reserva_de_luxo": {"atleta_id": number, "motivo": "string"},
  "pontos_estimados": number,
  "resumo_estrategia": "string"
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const parsed = JSON.parse(text);

    const byId = new Map(snapshot.atletas.map(a => [a.atleta_id, a]));

    const decorate = (id, extra = {}) => {
        const a = byId.get(id); if (!a) return null;
        return {
            atleta_id: a.atleta_id, apelido: a.apelido,
            posicao: a.posicao, posicao_nome: POSICAO_NOME[a.posicao_id], posicao_id: a.posicao_id,
            clube_abrev: a.clube_abrev, clube_nome: a.clube_nome,
            escudo: a.escudo, escudo_pequeno: a.escudo_pequeno,
            foto: a.foto, foto_pequena: a.foto_pequena,
            preco_num: a.preco_num, media_num: a.media_num,
            variacao_num: a.variacao_num, pontos_num: a.pontos_num,
            jogos_num: a.jogos_num, status_nome: a.status_nome,
            adversario: a.adversario,
            historico: a.historico,
            score_ia: a.score_ia,
            ...extra
        };
    };

    const titulares = (parsed.titulares || []).map(t => decorate(t.atleta_id, { motivo: t.motivo })).filter(Boolean);
    const reservaLuxo = parsed.reserva_de_luxo ? decorate(parsed.reserva_de_luxo.atleta_id, { motivo: parsed.reserva_de_luxo.motivo }) : null;

    const custoTotal = titulares.reduce((s, t) => s + t.preco_num, 0);

    usage.track({
        kind: 'lineup',
        model: MODEL_NAME,
        prompt_tokens: 0, // Gemini SDK doesn't return tokens easily in this call
        completion_tokens: 0
    });

    return {
        meta: {
            rodada: snapshot.rodada_atual,
            esquema, cartoletas, preferencia,
            modelo: MODEL_NAME
        },
        capitao_id: parsed.capitao_id,
        titulares, 
        reserva_de_luxo: reservaLuxo,
        custo_total: Number(custoTotal.toFixed(2)),
        saldo_restante: Number((cartoletas - custoTotal).toFixed(2)),
        pontos_estimados: parsed.pontos_estimados,
        resumo_estrategia: parsed.resumo_estrategia
    };
}

module.exports = { suggestLineup, ESQUEMAS, PREFERENCIAS };
