const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getSnapshot } = require('./cartolaData');
const usage = require('./usage');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const MODEL_NAME = "gemini-1.5-flash";

function atletaToLine(a) {
    const adv = a.adversario ? `${a.adversario.mando === 'casa' ? 'vs' : '@'}${a.adversario.adv}` : 'sem jogo';
    const hist = (a.historico || []).slice(-10).map(h => h.pontos.toFixed(1)).join(',');
    return `ID:${a.atleta_id} | ${a.apelido} (${a.posicao}) | ${a.clube_abrev} | C$${a.preco_num} | Méd:${a.media_num} | Score:${a.score_ia} | Status:${a.status_nome} | Adv:${adv} | Hist:[${hist}]`;
}

async function streamChat({ messages, extraContext }, res) {
    try {
        const snapshot = await getSnapshot();
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const topAtletas = snapshot.atletas
            .filter(a => a.preco_num > 0)
            .sort((a, b) => b.score_ia - a.score_ia)
            .slice(0, 100);

        const systemPrompt = `Você é o Guru do Cartola IA. Ajude o usuário a mitar!\nContexto da Rodada #${snapshot.rodada_atual}:\nMercado: ${snapshot.status_mercado === 1 ? 'ABERTO' : 'FECHADO'}\nAtletas em destaque (Top 100 por Score IA):\n${topAtletas.map(atletaToLine).join('\n')}\n\nInstruções:\n- Seja direto, use termos do Cartola (mitar, zicar, cartoletas).\n- Analise o histórico de 10 rodadas e o score IA.\n- Se o usuário perguntar de um jogador específico fora do top 100, diga que não tem os dados detalhados agora mas pode analisar os que estão na lista.\n- Use Markdown para tabelas e negrito.`;

        const chat = model.startChat({
            history: [
                { role: "user", parts: [{ text: systemPrompt + (extraContext ? "\nContexto extra: " + extraContext : "") }] },
                { role: "model", parts: [{ text: "Entendido! Sou o Guru do Cartola IA. Como posso te ajudar a mitar hoje?" }] },
                ...messages.slice(-10).map(m => ({
                    role: m.role === "assistant" ? "model" : "user",
                    parts: [{ text: m.content }]
                }))
            ]
        });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const lastMsg = messages[messages.length - 1].content;
        const result = await chat.sendMessageStream(lastMsg);

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            res.write(`data: ${JSON.stringify({ delta: chunkText })}\n\n`);
        }

        usage.track({
            kind: 'chat',
            model: MODEL_NAME,
            prompt_tokens: 0,
            completion_tokens: 0
        });

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (e) {
        console.error('Gemini Chat Error:', e);
        usage.setError(e.message);
        if (!res.headersSent) {
            res.status(500).json({ error: e.message });
        } else {
            res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
            res.end();
        }
    }
}

module.exports = { streamChat };
