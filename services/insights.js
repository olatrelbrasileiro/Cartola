const OpenAI = require('openai');
const { getEnrichedAthletes, summarizeForLLM, getPartidas } = require('./cartolaData');

const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
});

const ESQUEMAS = {
    '4-3-3':  { GOL: 1, LAT: 2, ZAG: 2, MEI: 3, ATA: 3, TEC: 1 },
    '4-4-2':  { GOL: 1, LAT: 2, ZAG: 2, MEI: 4, ATA: 2, TEC: 1 },
    '3-5-2':  { GOL: 1, LAT: 2, ZAG: 3, MEI: 3, ATA: 2, TEC: 1 },
    '3-4-3':  { GOL: 1, LAT: 2, ZAG: 3, MEI: 2, ATA: 3, TEC: 1 },
    '5-3-2':  { GOL: 1, LAT: 0, ZAG: 5, MEI: 3, ATA: 2, TEC: 1 },
    '5-4-1':  { GOL: 1, LAT: 0, ZAG: 5, MEI: 4, ATA: 1, TEC: 1 }
};

function buildLineupContext({ enriched, partidas }) {
    const summary = summarizeForLLM(enriched, { onlyProvavel: true, maxPorPosicao: 10 });

    const jogos = (partidas?.partidas || []).slice(0, 10).map(p => ({
        casa: p.clube_casa_id,
        fora: p.clube_visitante_id,
        local: p.local || null
    }));

    return { ...summary, partidas_resumo: jogos };
}

async function suggestLineup({ cartoletas = 100, esquema = '4-3-3', estilo = 'equilibrado' } = {}) {
    const enriched = await getEnrichedAthletes();
    const partidas = await getPartidas().catch(() => null);
    const context = buildLineupContext({ enriched, partidas });

    const formacao = ESQUEMAS[esquema] || ESQUEMAS['4-3-3'];

    const system = `Você é um analista do Cartola FC. Recebe uma lista resumida de atletas prováveis (ordenados por média) e deve sugerir UMA escalação que respeite estritamente o orçamento e o esquema tático informados. Use APENAS atletas presentes na lista. Sempre responda em JSON válido.`;

    const user = `Monte a melhor escalação para a rodada ${context.rodada_atual} usando apenas atletas prováveis da lista a seguir.

Restrições:
- Orçamento máximo: ${cartoletas} cartoletas (soma dos preços não pode ultrapassar).
- Esquema: ${esquema} (${formacao.GOL} GOL, ${formacao.LAT} LAT, ${formacao.ZAG} ZAG, ${formacao.MEI} MEI, ${formacao.ATA} ATA, ${formacao.TEC} TEC).
- Estilo: ${estilo}. "agressivo" = priorize médias altas e atacantes; "valorização" = priorize variação positiva e jogos em casa; "equilibrado" = mistura média alta + custo baixo + mando.
- Diversifique clubes quando possível.
- Escolha um capitão (dobra a pontuação) entre os jogadores mais consistentes do time montado.

DADOS:
${JSON.stringify(context, null, 0)}

Responda em JSON com este formato exato:
{
  "rodada": ${context.rodada_atual},
  "esquema": "${esquema}",
  "custo_total": <número>,
  "capitao_id": <id>,
  "escalacao": [
    { "id": <id>, "apelido": "...", "posicao": "GOL|LAT|ZAG|MEI|ATA|TEC", "clube": "...", "preco": <num>, "media": <num>, "motivo": "..." }
  ],
  "raciocinio": "Resumo curto (3-4 frases) explicando a estratégia e os trade-offs."
}`;

    const completion = await openai.chat.completions.create({
        model: 'gpt-5.4',
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 8192
    });

    const raw = completion.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        return { error: 'invalid_json', raw };
    }

    return {
        meta: {
            rodada: context.rodada_atual,
            status_mercado: context.status_mercado,
            esquema,
            cartoletas,
            estilo,
            modelo: 'gpt-5.4'
        },
        sugestao: parsed
    };
}

async function analyzePlayer(atletaId) {
    const enriched = await getEnrichedAthletes();
    const a = enriched.atletas.find(x => x.id === Number(atletaId));
    if (!a) throw new Error('Atleta não encontrado no mercado atual');

    const completion = await openai.chat.completions.create({
        model: 'gpt-5.4',
        messages: [
            { role: 'system', content: 'Você é um analista do Cartola FC. Avalie o atleta em 4 frases curtas, em português. Foque em: forma recente, custo-benefício, contexto da próxima partida e se vale escalar.' },
            { role: 'user', content: `Atleta: ${JSON.stringify(a)}` }
        ],
        max_completion_tokens: 600
    });

    return {
        atleta: a,
        analise: completion.choices?.[0]?.message?.content || ''
    };
}

module.exports = { suggestLineup, analyzePlayer, ESQUEMAS };
