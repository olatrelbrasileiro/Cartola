const OpenAI = require('openai');
const { getSnapshot, POSICAO_ABREV, STATUS_NOME } = require('./cartolaData');
const usage = require('./usage');

const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    timeout: 120_000
});

const MODEL = 'gpt-5-mini';

function atletaToLine(a) {
    const adv = a.adversario ? ` | ${a.adversario.mando === 'casa' ? 'vs' : '@'} ${a.adversario.adv}` : '';
    const last = (a.historico || []).slice(-4).map(h => h.pontos.toFixed(1)).join(',');
    const scoutTop = Object.entries(a.scout || {})
        .sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => `${k}:${v}`).join(',');
    const ptsLine = last ? ` | últ:${last}` : '';
    const scoutLine = scoutTop ? ` | sc:${scoutTop}` : '';
    return `#${a.atleta_id} ${a.apelido} (${POSICAO_ABREV[a.posicao_id]}, ${a.clube_abrev}) ` +
        `C$${a.preco_num.toFixed(2)} méd:${a.media_num.toFixed(1)} ` +
        `var:${a.variacao_num.toFixed(2)} jog:${a.jogos_num} ${STATUS_NOME[a.status_id]}` +
        `${adv}${ptsLine}${scoutLine}`;
}

function buildSystem(snapshot, max = 70) {
    const tops = snapshot.atletas
        .filter(a => [2, 7].includes(a.status_id) && a.preco_num > 0)
        .sort((a, b) => b.media_num - a.media_num)
        .slice(0, max);
    const linhas = tops.map(atletaToLine);
    const mercadoTxt = `Rodada ${snapshot.rodada_atual}, mercado ${snapshot.status_mercado === 1 ? 'ABERTO' : 'FECHADO'}, histórico das rodadas ${snapshot.rodadas_historico.join(', ') || '—'}.`;

    return `Você é o "Cartola IA", analista do Cartola FC. Use APENAS os dados abaixo. Se a resposta não estiver nos dados, diga claramente. Seja direto, técnico e use markdown (tabelas/listas) quando útil.

${mercadoTxt}

Top ${linhas.length} atletas (#id apelido (POS, CLU) C$preço méd:média var:variação jog:jogos status | mando | últ:últimas pontuações | sc:scouts):
${linhas.join('\n')}

Glossário scout: G=gol, A=assistência, FT=finalização trave, FD=finalização defendida, FF=finalização fora, FS=falta sofrida, PE=passe errado, PI=impedimento, I=interceptação, RB=roubo de bola, SG=sem sofrer gol, DE=defesa, GS=gol sofrido, FC=falta cometida, GC=gol contra, CA=amarelo, CV=vermelho, DP=defesa de pênalti.`;
}

function messagesToInput(system, messages, extraContext) {
    const arr = [{ role: 'system', content: system }];
    if (extraContext) arr.push({ role: 'system', content: `Contexto adicional do usuário:\n${extraContext}` });
    for (const m of messages) {
        if (!m || !m.content) continue;
        arr.push({ role: m.role, content: m.content });
    }
    return arr;
}

async function streamChat({ messages, extraContext }, res) {
    const snapshot = await getSnapshot();
    const system = buildSystem(snapshot);
    const input = messagesToInput(system, messages, extraContext);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let promptTokens = 0;
    let completionTokens = 0;

    try {
        const stream = await openai.responses.create({
            model: MODEL,
            input,
            stream: true,
            reasoning: { effort: 'minimal' },
            max_output_tokens: 4096
        });

        for await (const event of stream) {
            if (event.type === 'response.output_text.delta' && event.delta) {
                res.write(`data: ${JSON.stringify({ delta: event.delta })}\n\n`);
            } else if (event.type === 'response.completed') {
                const u = event.response?.usage;
                if (u) {
                    promptTokens = u.input_tokens || 0;
                    completionTokens = u.output_tokens || 0;
                }
            } else if (event.type === 'response.failed' || event.type === 'response.incomplete') {
                const reason = event.response?.incomplete_details?.reason || event.response?.error?.message || 'incomplete';
                res.write(`data: ${JSON.stringify({ delta: `\n\n_⚠️ resposta incompleta: ${reason}_` })}\n\n`);
            }
        }
        res.write(`data: [DONE]\n\n`);
        res.end();
        usage.track({ kind: 'chat', model: MODEL, prompt_tokens: promptTokens, completion_tokens: completionTokens });
    } catch (err) {
        console.error('chat stream erro:', err);
        usage.setError(err.message);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
    }
}

module.exports = { streamChat, buildSystem };
