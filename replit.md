# Cartola IA

Web app pública sobre Cartola FC: mostra mercado ao vivo, comparador de jogadores, escalação otimizada por IA e chat com analista IA. **Sem login** — usa apenas endpoints públicos da API do Cartola e a IA via Replit AI Integrations.

## Stack

- Node.js 20 + Express 4
- node-fetch v2
- OpenAI SDK (via Replit AI Integrations / Responses API, modelo `gpt-5-mini`)
- Frontend: HTML estático + Tailwind CDN + Chart.js + marked + lucide (SPA vanilla JS)

## Layout do projeto

- `server.js` — Express, rotas REST, proxy público para `api.cartola.globo.com`
- `services/cartolaData.js` — busca pública (mercado, partidas, atletas/mercado, pontuados de rodadas anteriores), monta snapshot completo com fotos/escudos, próximos adversários, histórico das últimas 5 rodadas, mínimo estimado para valorizar e projeção de valorização
- `services/insights.js` — escalação ótima IA (3 preferências: pontos / equilibrado / valorização) com tool calling estruturado, capitão, reservas econômicas e **reserva de luxo**
- `services/chat.js` — chat IA com streaming SSE, contexto rico do mercado e glossário de scouts
- `services/usage.js` — tracker de tokens/custo da sessão e percentual do free tier (~US$ 5/mês)
- `public/index.html` + `public/js/app.js` — SPA com 3 abas (Mercado / Comparar / Escalação IA) e painel lateral de chat destacado

## Endpoints

- `GET /api/snapshot` — mercado completo + atletas enriquecidos (fotos, escudos, próximo adversário, histórico, valorização projetada)
- `GET /api/history` — últimas 5 rodadas pontuadas
- `POST /api/insights/lineup` — escalação IA. Body: `{ cartoletas, esquema, preferencia, evitarDuvidas }`
- `POST /api/chat` — chat SSE. Body: `{ messages:[{role,content}], extraContext? }`
- `GET /api/usage` — uso de tokens/custo da sessão
- `GET /api/cartola/:endpoint` — proxy público (whitelist de endpoints públicos do Cartola)

## IA / Replit AI Integrations

**Importante:** o gateway local `chat/completions` retorna 500 para os modelos GPT-5*. A solução foi migrar para a **Responses API** (`/responses`) que funciona bem.

- Modelo: `gpt-5-mini` (rápido, barato, suficiente para esta app)
- `reasoning: { effort: "minimal" }` — desliga o reasoning extenso (que consome tokens silenciosamente)
- Streaming via eventos `response.output_text.delta` no chat
- Tool calling via `tools` + `tool_choice` na escalação (output em `response.output[]` com `type: "function_call"`)

## Replit Setup

- Workflow `Start application` roda `npm start` na porta `5000` (host `0.0.0.0`)
- `app.set('trust proxy', 1)` ativo
- Cache-Control no-store em dev pra preview iframe não servir stale
- Deploy target: `autoscale` com `npm start`

## Variáveis de ambiente

- `AI_INTEGRATIONS_OPENAI_API_KEY` e `AI_INTEGRATIONS_OPENAI_BASE_URL` — providos automaticamente pela integração
- `PORT` (opcional, default 5000)

## Notas Cartola

- Fotos: `clubes_2026/silhuetas/{CLU}/{FORMATO}.png` (FORMATO substituído por `140x140` ou `50x50`)
- Escudos: `clubes_2026/escudos/{CLU}/{60x60|45x45|30x30}.png`
- `minimo_para_valorizar` real é endpoint premium (GatoMestre); estimamos via blend de média + média das 3 últimas rodadas
- `valorizacao_projetada` = (última pontuação − mínimo estimado) × fator
