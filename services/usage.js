// Tracker simples de uso da IA na sessão do servidor.
// O Replit AI Integrations não expõe quota; mostramos consumo aproximado e
// aviso sobre o teto do plano gratuito.

const PRICING = {
    'gpt-5.4':       { in: 1.25 / 1e6,  out: 10.0 / 1e6 },
    'gpt-5':         { in: 1.25 / 1e6,  out: 10.0 / 1e6 },
    'gpt-5-mini':    { in: 0.25 / 1e6,  out: 2.0  / 1e6 },
    'gpt-5-nano':    { in: 0.05 / 1e6,  out: 0.40 / 1e6 }
};

const DEFAULT_PRICE = PRICING['gpt-5-mini'];

const FREE_TIER_USD = 5.0;

const usage = {
    started_at: Date.now(),
    requests: 0,
    chat_streams: 0,
    lineup_calls: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
    last_error: null
};

function track({ kind, model, prompt_tokens = 0, completion_tokens = 0 }) {
    usage.requests += 1;
    if (kind === 'chat') usage.chat_streams += 1;
    if (kind === 'lineup') usage.lineup_calls += 1;
    usage.prompt_tokens += prompt_tokens;
    usage.completion_tokens += completion_tokens;
    usage.total_tokens += prompt_tokens + completion_tokens;
    const p = PRICING[model] || PRICING['gpt-5.4'];
    usage.estimated_cost_usd = Number(
        (usage.estimated_cost_usd + prompt_tokens * p.in + completion_tokens * p.out).toFixed(6)
    );
}

function setError(msg) {
    usage.last_error = String(msg).slice(0, 200);
}

function snapshot() {
    const cost = usage.estimated_cost_usd;
    return {
        ...usage,
        free_tier_usd: FREE_TIER_USD,
        free_tier_pct_used: Math.min(100, Number(((cost / FREE_TIER_USD) * 100).toFixed(2))),
        provider: 'Replit AI Integrations (OpenAI gpt-5-mini via Responses API)',
        note: 'Estimativa baseada em tokens consumidos durante a sessão deste servidor. O teto real é o cap mensal de créditos da sua conta Replit (~US$ 5/mês no plano gratuito).'
    };
}

module.exports = { track, setError, snapshot };
