# Cartola Auth

OAuth authentication helper for the Cartola FC API. Lets a user log in with Globo.com (OIDC + PKCE), stores their access/refresh tokens in a server-side session, and exposes a small UI plus a proxy that forwards authenticated requests to `api.cartola.globo.com`.

## Stack

- Node.js 20
- Express 4 + express-session
- node-fetch v2
- Static assets in `public/` (landing page, dashboard)

## Project Layout

- `server.js` — Express server, OAuth login/callback, dashboard, Cartola API proxy
- `public/` — Static landing page and assets
- `package.json` — Dependencies and `start`/`dev` scripts
- `render.yaml` — Original Render deployment config (kept for reference)

## Replit Setup

- Workflow `Start application` runs `npm start` and listens on port `5000` (host `0.0.0.0`) so the Replit web preview can reach it.
- `app.set('trust proxy', 1)` is enabled because requests come through Replit's proxy.
- Cache-Control no-store headers are sent in development to avoid the iframe preview serving stale content.
- Deployment target is `autoscale` with run command `npm start`.

## Environment Variables

- `SESSION_SECRET` (optional) — session signing secret. A random one is generated on boot if unset (sessions reset on every restart).
- `PORT` (optional) — defaults to `5000`.
- `NODE_ENV=production` enables secure cookies in production.

## OAuth Notes

The OAuth client `cartola-web@apps.globoid` uses Globo's OpenID Connect provider with PKCE. The redirect URI is fixed to `https://cartola.globo.com/login-callback.html` (the Cartola web app). After login the user is sent back to this app's `/callback` route to exchange the code for tokens.

## Cartola API Catalog

The full list of endpoints used by the Cartola web app was extracted from the official `main.js` bundle and exposed at `GET /api/catalog`. Each entry has `path`, `method`, `authRequired`, `group`, and `desc`. The proxy `GET /api/cartola/<endpoint>` automatically attaches the Bearer token for any path under `auth/*` or `logged/*`.

Most useful for AI/lineup features:

- `mercado/status` — current round and market state
- `atletas/mercado` — full list of athletes with price, scout, status, position, club
- `atletas/pontuados` and `atletas/pontuados/:rodada` — live and historical scoring
- `atletas/status` — status table (provável/dúvida/contundido/suspenso/nulo)
- `clubes`, `clubes/mercado`, `posicoes` — reference tables
- `partidas`, `partidas/:rodada`, `rodadas` — fixtures
- `mercado/destaques`, `pos-rodada/destaques` — most picked / round highlights
- `auth/time/info` (auth) — my full team
- `auth/mercado/atleta/:idAtleta/pontuacao` (auth) — per-athlete scoring history
- `auth/gatomestre/atletas` (auth) — Gato Mestre analytics per athlete

## AI Insights (Apr 2026)

- `services/cartolaData.js`: cliente com cache (TTL 20s–5min) para endpoints públicos do Cartola (`mercado/status`, `atletas/mercado`, `atletas/pontuados`, `partidas`, `clubes`, `mercado/destaques`). Enriquecimento dos atletas com nome do clube, posição em texto, status legível e parcial da rodada.
- `services/insights.js`: usa o SDK `openai` apontando para `AI_INTEGRATIONS_OPENAI_BASE_URL` / `AI_INTEGRATIONS_OPENAI_API_KEY`. Modelo `gpt-5.4`, `response_format: json_object`, `max_completion_tokens: 8192` (sem `temperature` — restrição do gpt-5+). Função `suggestLineup({ cartoletas, esquema, estilo })` filtra atletas prováveis, top 10 por posição por média, e pede escalação que respeite orçamento + esquema. Função `analyzePlayer(id)` para análise pontual.
- Rotas: `GET /api/insights/lineup?cartoletas=&esquema=&estilo=` e `GET /api/insights/player/:id`. Esquemas válidos: 4-3-3, 4-4-2, 3-5-2, 3-4-3, 5-3-2, 5-4-1.
- UI: `public/index.html` reescrito como landing "Cartola IA" com painel para gerar escalação (sem login). Login Globo permanece opcional para o dashboard de catálogo.
- Integração instalada via blueprint `javascript_openai_ai_integrations` (gerenciada pela Replit, sem chave própria; cobrada nos créditos). Os arquivos template em `.replit_integration_files/` (TypeScript + Drizzle) NÃO são usados — projeto é JS puro e usa o SDK direto.
