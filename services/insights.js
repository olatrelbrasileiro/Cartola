const OpenAI = require('openai');
const { getSnapshot, POSICAO_NOME } = require('./cartolaData');
const usage = require('./usage');

const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    timeout: 180_000
});

const MODEL = 'gpt-5-mini';

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
    valorizacao: 'Maximize VALORIZAÇÃO de patrimônio. Priorize jogadores cuja pontuação esperada supere o mínimo para valorizar e que tendem a subir de preço.'
};

function compactaAtleta(a) {
    const adv = a.adversario ? { adv: a.adversario.adv, mando: a.adversario.mando } : null;
    const ultimas = (a.historico || []).slice(-4).map(h => ({ r: h.rodada, p: Number(h.pontos.toFixed(1)) }));
    const scoutTop = Object.fromEntries(
        Object.entries(a.scout || {}).sort((x, y) => y[1] - x[1]).slice(0, 4)
    );
    return {
        id: a.atleta_id, nome: a.apelido, pos: a.posicao, clu: a.clube_abrev,
        c$: a.preco_num, med: a.media_num, var: a.variacao_num, ult: a.pontos_num,
        jog: a.jogos_num, st: a.status_nome,
        min_val: a.minimo_valorizar_est, proj_val: a.valorizacao_projetada,
        adv, sc: scoutTop, hist: ultimas
    };
}

function buildCandidatos(snapshot, evitarDuvidas, cartoletas) {
    const statusOk = evitarDuvidas ? [7] : [2, 7];
    const pool = snapshot.atletas.filter(a =>
        statusOk.includes(a.status_id) && a.preco_num > 0 && a.preco_num <= cartoletas
    );
    const porPos = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const a of pool) (porPos[a.posicao_id] ||= []).push(a);
    const limites = { 1: 8, 2: 12, 3: 12, 4: 16, 5: 16, 6: 5 };
    const out = [];
    for (const pid of Object.keys(porPos)) {
        const arr = porPos[pid].sort((a, b) => b.media_num - a.media_num).slice(0, limites[pid] || 10);
        out.push(...arr);
    }
    return out;
}

const TOOL = {
    type: 'function',
    name: 'montar_escalacao',
    description: 'Devolve a escalação ótima respeitando esquema, orçamento e preferência.',
    strict: true,
    parameters: {
        type: 'object',
        properties: {
            esquema: { type: 'string' },
            capitao_id: { type: 'integer', description: 'atleta_id do capitão (titular com maior teto)' },
            titulares: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        atleta_id: { type: 'integer' },
                        motivo: { type: 'string', description: 'Por que escalar este jogador (1 frase curta)' }
                    },
                    required: ['atleta_id', 'motivo'],
                    additionalProperties: false
                }
            },
            reservas: {
                type: 'array',
                description: 'Banco econômico: até 4 reservas baratas',
                items: {
                    type: 'object',
                    properties: {
                        atleta_id: { type: 'integer' },
                        substitui_posicao: { type: 'string' }
                    },
                    required: ['atleta_id', 'substitui_posicao'],
                    additionalProperties: false
                }
            },
            reserva_de_luxo: {
                type: 'object',
                description: 'Reserva forte que entraria no lugar do titular com pior pontuação esperada.',
                properties: {
                    atleta_id: { type: 'integer' },
                    substitui_atleta_id: { type: 'integer' },
                    motivo: { type: 'string' }
                },
                required: ['atleta_id', 'substitui_atleta_id', 'motivo'],
                additionalProperties: false
            },
            pontos_estimados: { type: 'number', description: 'Pontos esperados do time (titulares + capitão dobrado).' },
            valorizacao_estimada: { type: 'number', description: 'Valorização total estimada em C$.' },
            resumo_estrategia: { type: 'string', description: 'Resumo em markdown (3-5 frases) da estratégia adotada.' }
        },
        required: ['esquema', 'capitao_id', 'titulares', 'reservas', 'reserva_de_luxo', 'pontos_estimados', 'valorizacao_estimada', 'resumo_estrategia'],
        additionalProperties: false
    }
};

async function suggestLineup({ cartoletas = 120, esquema = '4-3-3', preferencia = 'equilibrado', evitarDuvidas = true } = {}) {
    if (!ESQUEMAS[esquema]) throw new Error(`Esquema inválido: ${esquema}`);
    if (!PREFERENCIAS[preferencia]) preferencia = 'equilibrado';

    const snapshot = await getSnapshot();
    const formacao = ESQUEMAS[esquema];
    const candidatos = buildCandidatos(snapshot, evitarDuvidas, cartoletas).map(compactaAtleta);

    const system = `Você é um especialista em Cartola FC. Receba os candidatos (jogadores) e devolva a melhor escalação respeitando RIGOROSAMENTE:
- Esquema ${esquema}: ${formacao.GOL} GOL, ${formacao.LAT} LAT, ${formacao.ZAG} ZAG, ${formacao.MEI} MEI, ${formacao.ATA} ATA, ${formacao.TEC} TEC.
- Soma do preço dos 11 titulares + 1 técnico ≤ ${cartoletas} cartoletas.
- Use apenas ids existentes na lista; NUNCA invente jogadores.
- Preferência: ${preferencia.toUpperCase()} — ${PREFERENCIAS[preferencia]}
- Capitão: titular com maior teto na rodada.
- Reserva de luxo: 1 jogador forte fora dos titulares que entraria caso seu pior titular falhe.

Considere TODOS os campos: c$, med, var, ult, jog, st, min_val, proj_val, adv (mando), sc (scouts) e hist (histórico).
Devolva SOMENTE pela tool montar_escalacao.`;

    const userMsg = `Orçamento: C$ ${cartoletas.toFixed(2)}
Esquema: ${esquema}
Preferência: ${preferencia}
Rodada: ${snapshot.rodada_atual}
Histórico cobre rodadas: ${snapshot.rodadas_historico.join(', ') || 'nenhum'}

Candidatos (${candidatos.length}):
${JSON.stringify(candidatos)}`;

    const response = await openai.responses.create({
        model: MODEL,
        input: [
            { role: 'system', content: system },
            { role: 'user', content: userMsg }
        ],
        tools: [TOOL],
        tool_choice: { type: 'function', name: 'montar_escalacao' },
        reasoning: { effort: 'minimal' },
        max_output_tokens: 6000
    });

    usage.track({
        kind: 'lineup',
        model: MODEL,
        prompt_tokens: response.usage?.input_tokens || 0,
        completion_tokens: response.usage?.output_tokens || 0
    });

    const fnCall = (response.output || []).find(o => o.type === 'function_call' && o.name === 'montar_escalacao');
    if (!fnCall) throw new Error(`IA não devolveu escalação estruturada (status: ${response.status})`);
    const parsed = JSON.parse(fnCall.arguments);
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
            valorizacao_projetada: a.valorizacao_projetada,
            minimo_valorizar_est: a.minimo_valorizar_est,
            historico: a.historico,
            ...extra
        };
    };

    const titulares = (parsed.titulares || []).map(t => decorate(t.atleta_id, { motivo: t.motivo })).filter(Boolean);
    const reservas = (parsed.reservas || []).map(r => decorate(r.atleta_id, { substitui_posicao: r.substitui_posicao || null })).filter(Boolean);
    const reservaLuxo = parsed.reserva_de_luxo
        ? decorate(parsed.reserva_de_luxo.atleta_id, {
            substitui_atleta_id: parsed.reserva_de_luxo.substitui_atleta_id,
            motivo: parsed.reserva_de_luxo.motivo
        })
        : null;

    const custoTotal = titulares.reduce((s, t) => s + t.preco_num, 0);
    const valorizacaoCalc = titulares.reduce((s, t) => s + (t.valorizacao_projetada || 0), 0);

    return {
        meta: {
            rodada: snapshot.rodada_atual,
            status_mercado: snapshot.status_mercado,
            esquema, cartoletas, preferencia, evitarDuvidas,
            modelo: MODEL,
            tokens_in: response.usage?.input_tokens || 0,
            tokens_out: response.usage?.output_tokens || 0
        },
        capitao_id: parsed.capitao_id,
        titulares, reservas, reserva_de_luxo: reservaLuxo,
        custo_total: Number(custoTotal.toFixed(2)),
        saldo_restante: Number((cartoletas - custoTotal).toFixed(2)),
        pontos_estimados: parsed.pontos_estimados,
        valorizacao_ia: parsed.valorizacao_estimada,
        valorizacao_calculada: Number(valorizacaoCalc.toFixed(2)),
        resumo_estrategia: parsed.resumo_estrategia
    };
}

module.exports = { suggestLineup, ESQUEMAS, PREFERENCIAS };
