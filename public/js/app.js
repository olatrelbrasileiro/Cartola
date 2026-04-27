// ========== Estado global ==========
const state = {
    snapshot: null,
    loading: true,
    error: null,
    activeTab: 'mercado',
    filters: {
        busca: '',
        posicao: 'all',
        status: 'ativos',
        clube: 'all',
        sortKey: 'media_num',
        sortDir: 'desc'
    },
    selectedCompare: [], // ids
    chats: { mercado: [], comparar: [] },
    chatLoading: { mercado: false, comparar: false },
    chartCache: new Map()
};

const POS_ABREV = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA', 6: 'TEC' };
const POS_NOME  = { 1: 'Goleiro', 2: 'Lateral', 3: 'Zagueiro', 4: 'Meia', 5: 'Atacante', 6: 'Técnico' };
const POS_ORDEM = { GOL: 0, LAT: 1, ZAG: 2, MEI: 3, ATA: 4, TEC: 5 };

const fmt = (n, d = 2) => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(d);
const fmtSign = (n, d = 2) => (n == null || isNaN(n)) ? '—' : (n >= 0 ? '+' : '') + Number(n).toFixed(d);

function statusBadgeColor(id) {
    if (id === 7) return 'bg-secondary/20 text-secondary border-secondary/30';
    if (id === 2) return 'bg-warning/20 text-warning border-warning/30';
    if (id === 3 || id === 5) return 'bg-danger/20 text-danger border-danger/30';
    return 'bg-surface2 text-muted border-border';
}

function variacaoColor(v) {
    if (v == null) return 'text-muted';
    if (v > 0) return 'text-secondary';
    if (v < 0) return 'text-danger';
    return 'text-muted';
}

function escudoUrl(a) { return a.escudo_pequeno || a.escudo || null; }
function fotoUrl(a)   { return a.foto_pequena   || a.foto   || null; }

// ========== Ícones (re-render lucide quando DOM muda) ==========
function renderIcons() { lucide?.createIcons?.(); }

// ========== Carregamento inicial ==========
async function loadSnapshot() {
    try {
        const r = await fetch('/api/snapshot');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        state.snapshot = await r.json();
        state.loading = false;
        state.error = null;
        renderAll();
    } catch (e) {
        state.error = e.message;
        state.loading = false;
        renderAll();
    }
}

// ========== Status bar ==========
function renderStatusBar() {
    const el = document.getElementById('statusBar');
    if (state.loading || !state.snapshot) {
        el.innerHTML = `<div class="skel h-4 w-full max-w-md rounded"></div>`;
        return;
    }
    const s = state.snapshot;
    const aberto = s.status_mercado === 1;
    const f = s.fechamento;
    const prazo = f ? new Date(f.ano, f.mes - 1, f.dia, f.hora, f.minuto)
        .toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
    el.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="relative flex h-2 w-2">
                ${aberto ? `<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>` : ''}
                <span class="relative inline-flex rounded-full h-2 w-2 ${aberto ? 'bg-secondary' : 'bg-muted'}"></span>
            </span>
            <span class="font-medium">Mercado ${aberto ? 'aberto' : 'fechado'}</span>
        </div>
        <div class="h-4 w-px bg-border"></div>
        <div><span class="text-muted">Rodada </span><span class="font-bold text-primary">#${s.rodada_atual}</span></div>
        ${prazo ? `<div class="h-4 w-px bg-border"></div><div class="flex items-center gap-1.5 text-muted"><i data-lucide="clock" class="h-3.5 w-3.5"></i> Fechamento: <span class="text-fg font-medium">${prazo}</span></div>` : ''}
        ${typeof s.times_escalados === 'number' ? `<div class="h-4 w-px bg-border"></div><div class="text-muted"><span class="text-fg font-medium">${s.times_escalados.toLocaleString('pt-BR')}</span> times escalados</div>` : ''}
        <div class="ml-auto text-xs text-muted">Histórico: rodadas ${s.rodadas_historico.join(', ') || '—'}</div>
    `;
    renderIcons();
}

// ========== Filtros + tabela do mercado ==========
function applyFilters(arr) {
    const f = state.filters;
    let out = arr.filter(a => a.preco_num > 0);
    if (f.status === 'ativos')   out = out.filter(a => [2, 7].includes(a.status_id));
    else if (f.status !== 'all') out = out.filter(a => a.status_id === Number(f.status));
    if (f.posicao !== 'all') out = out.filter(a => a.posicao_id === Number(f.posicao));
    if (f.clube !== 'all')   out = out.filter(a => a.clube_id === Number(f.clube));
    if (f.busca.trim())      out = out.filter(a => a.apelido.toLowerCase().includes(f.busca.trim().toLowerCase()));
    out.sort((a, b) => {
        const va = a[f.sortKey], vb = b[f.sortKey];
        if (typeof va === 'string') return f.sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        return f.sortDir === 'asc' ? (va - vb) : (vb - va);
    });
    return out.slice(0, 200);
}

function renderFilterBar(target = 'mercado') {
    if (!state.snapshot) return '';
    const clubes = Object.values(state.snapshot.clubes || {})
        .filter((v, i, a) => a.findIndex(x => x.id === v.id) === i)
        .sort((a, b) => (a.nome_fantasia || a.nome).localeCompare(b.nome_fantasia || b.nome));
    return `
        <div class="flex flex-wrap gap-2 border-b border-border p-3 bg-surface2/30">
            <div class="relative min-w-[180px] flex-1">
                <i data-lucide="search" class="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"></i>
                <input id="ftBusca" value="${state.filters.busca}" placeholder="Buscar jogador…"
                    class="w-full rounded-md border border-border bg-bg pl-8 pr-3 py-1.5 text-sm focus:border-primary focus:outline-none">
            </div>
            <select id="ftPosicao" class="rounded-md border border-border bg-bg px-2 py-1.5 text-sm">
                <option value="all">Posição</option>
                ${Object.entries(POS_ABREV).filter(([id]) => id !== '6').map(([id, ab]) =>
                    `<option value="${id}" ${state.filters.posicao === id ? 'selected' : ''}>${ab}</option>`).join('')}
            </select>
            <select id="ftStatus" class="rounded-md border border-border bg-bg px-2 py-1.5 text-sm">
                <option value="ativos"   ${state.filters.status === 'ativos' ? 'selected' : ''}>Prováveis + dúvidas</option>
                <option value="7"        ${state.filters.status === '7' ? 'selected' : ''}>Só prováveis</option>
                <option value="2"        ${state.filters.status === '2' ? 'selected' : ''}>Só dúvidas</option>
                <option value="all"      ${state.filters.status === 'all' ? 'selected' : ''}>Todos</option>
            </select>
            <select id="ftClube" class="rounded-md border border-border bg-bg px-2 py-1.5 text-sm max-w-[160px]">
                <option value="all">Todos os clubes</option>
                ${clubes.map(c => `<option value="${c.id}" ${state.filters.clube == c.id ? 'selected' : ''}>${c.nome_fantasia || c.nome}</option>`).join('')}
            </select>
        </div>
    `;
}

function sortBtn(key, label, align = 'left') {
    const active = state.filters.sortKey === key;
    return `<button data-sort="${key}" class="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider ${active ? 'text-primary' : 'text-muted hover:text-fg'} ${align === 'right' ? 'ml-auto' : ''}">
        ${label} <i data-lucide="arrow-up-down" class="h-3 w-3"></i>
    </button>`;
}

function renderMercadoTable() {
    const root = document.getElementById('mercadoTable');
    if (state.loading) { root.innerHTML = `<div class="rounded-xl border border-border bg-surface p-8 text-center text-muted">Carregando mercado…</div>`; return; }
    if (state.error)   { root.innerHTML = `<div class="rounded-xl border border-danger/40 bg-surface p-6 text-center text-danger">Erro: ${state.error}</div>`; return; }
    const filtered = applyFilters(state.snapshot.atletas);

    root.innerHTML = `
    <div class="rounded-xl border border-border bg-surface shadow-card">
        ${renderFilterBar('mercado')}
        <div class="overflow-x-auto scroll-thin">
            <table class="w-full text-sm">
                <thead><tr class="border-b border-border text-left bg-surface2/40">
                    <th class="px-3 py-2">${sortBtn('apelido', 'Jogador')}</th>
                    <th class="px-2 py-2 hidden md:table-cell">Pos</th>
                    <th class="px-2 py-2 hidden md:table-cell">Próximo</th>
                    <th class="px-2 py-2 text-right">${sortBtn('preco_num', 'C$', 'right')}</th>
                    <th class="px-2 py-2 text-right hidden sm:table-cell">${sortBtn('variacao_num', 'Var', 'right')}</th>
                    <th class="px-2 py-2 text-right">${sortBtn('media_num', 'Méd', 'right')}</th>
                    <th class="px-2 py-2 text-right hidden sm:table-cell">${sortBtn('pontos_num', 'Últ', 'right')}</th>
                    <th class="px-2 py-2 text-right hidden lg:table-cell" title="Mínimo estimado para valorizar">Mín. val</th>
                    <th class="px-2 py-2 text-right hidden lg:table-cell" title="Valorização projetada para a rodada">Proj. C$</th>
                    <th class="px-2 py-2 hidden md:table-cell">Status</th>
                    <th class="px-2 py-2 w-10"></th>
                </tr></thead>
                <tbody>
                    ${filtered.map(rowAtleta).join('')}
                </tbody>
            </table>
        </div>
        <div class="border-t border-border px-3 py-2 text-xs text-muted">Mostrando ${filtered.length} jogadores (limite 200)</div>
    </div>`;

    // Eventos
    document.getElementById('ftBusca').addEventListener('input',   e => { state.filters.busca = e.target.value; renderMercadoTable(); });
    document.getElementById('ftPosicao').addEventListener('change', e => { state.filters.posicao = e.target.value; renderMercadoTable(); });
    document.getElementById('ftStatus').addEventListener('change',  e => { state.filters.status = e.target.value; renderMercadoTable(); });
    document.getElementById('ftClube').addEventListener('change',   e => { state.filters.clube = e.target.value; renderMercadoTable(); });
    root.querySelectorAll('button[data-sort]').forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.sort;
        if (state.filters.sortKey === k) state.filters.sortDir = state.filters.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.filters.sortKey = k; state.filters.sortDir = k === 'apelido' ? 'asc' : 'desc'; }
        renderMercadoTable();
    }));
    root.querySelectorAll('button[data-detalhe]').forEach(b => b.addEventListener('click', () => openPlayerDetail(Number(b.dataset.detalhe))));
    renderIcons();
}

function rowAtleta(a) {
    const adv = a.adversario;
    const advHtml = adv ? `<span class="${adv.mando === 'casa' ? 'text-secondary' : 'text-muted'}">${adv.mando === 'casa' ? 'vs' : '@'}</span> <span class="font-medium">${adv.adv}</span>` : `<span class="text-muted">—</span>`;
    const photo = fotoUrl(a);
    const escudo = escudoUrl(a);
    return `
    <tr class="border-b border-border/60 hover:bg-surface2/40 transition-colors">
        <td class="px-3 py-2">
            <div class="flex items-center gap-2.5">
                <div class="player-photo h-9 w-9 rounded-full overflow-hidden flex-shrink-0 border border-border" ${photo ? `style="background-image:url('${photo}'); background-size:cover; background-position:center"` : ''}></div>
                <div class="min-w-0">
                    <div class="font-medium truncate max-w-[140px]">${a.apelido}</div>
                    <div class="text-xs text-muted flex items-center gap-1">
                        ${escudo ? `<img src="${escudo}" alt="" class="h-3 w-3" onerror="this.style.display='none'">` : ''}
                        <span>${a.clube_abrev}</span>
                    </div>
                </div>
            </div>
        </td>
        <td class="px-2 py-2 hidden md:table-cell"><span class="badge border border-border bg-surface2 text-fg">${a.posicao}</span></td>
        <td class="px-2 py-2 hidden md:table-cell text-xs">${advHtml}</td>
        <td class="px-2 py-2 text-right font-mono">${fmt(a.preco_num)}</td>
        <td class="px-2 py-2 text-right font-mono hidden sm:table-cell ${variacaoColor(a.variacao_num)}">${fmtSign(a.variacao_num)}</td>
        <td class="px-2 py-2 text-right font-mono font-semibold text-primary">${fmt(a.media_num, 1)}</td>
        <td class="px-2 py-2 text-right font-mono hidden sm:table-cell">${fmt(a.pontos_num, 1)}</td>
        <td class="px-2 py-2 text-right font-mono hidden lg:table-cell text-muted">${fmt(a.minimo_valorizar_est, 1)}</td>
        <td class="px-2 py-2 text-right font-mono hidden lg:table-cell ${variacaoColor(a.valorizacao_projetada)}">${fmtSign(a.valorizacao_projetada)}</td>
        <td class="px-2 py-2 hidden md:table-cell"><span class="badge border ${statusBadgeColor(a.status_id)}">${a.status_nome}</span></td>
        <td class="px-2 py-2 text-right">
            <button data-detalhe="${a.atleta_id}" class="text-muted hover:text-primary" title="Detalhes"><i data-lucide="line-chart" class="h-4 w-4"></i></button>
        </td>
    </tr>`;
}

// ========== Detalhe do jogador (modal com sparkline) ==========
function openPlayerDetail(id) {
    const a = state.snapshot.atletas.find(x => x.atleta_id === id);
    if (!a) return;
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4';
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    const photo = a.foto || a.foto_pequena || '';
    const escudo = a.escudo || a.escudo_pequeno || '';
    const adv = a.adversario;
    const scout = Object.entries(a.scout || {}).sort((x, y) => y[1] - x[1]);
    modal.innerHTML = `
    <div class="bg-surface border border-border rounded-xl shadow-card max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto scroll-thin">
        <div class="flex items-start gap-4">
            <div class="h-20 w-20 rounded-full bg-surface2 overflow-hidden flex-shrink-0 border border-border player-photo" ${photo ? `style="background-image:url('${photo}'); background-size:cover; background-position:center"` : ''}></div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                    ${escudo ? `<img src="${escudo}" class="h-5 w-5" onerror="this.style.display='none'">` : ''}
                    <span class="text-sm text-muted">${a.clube_nome}</span>
                </div>
                <h2 class="text-2xl font-bold leading-tight">${a.apelido}</h2>
                <p class="text-sm text-muted">${a.nome || ''}</p>
                <div class="flex items-center gap-2 mt-2 flex-wrap">
                    <span class="badge border border-border bg-surface2 text-fg">${a.posicao_nome}</span>
                    <span class="badge border ${statusBadgeColor(a.status_id)}">${a.status_nome}</span>
                    ${adv ? `<span class="chip"><i data-lucide="map-pin" class="h-3 w-3 ${adv.mando === 'casa' ? 'text-secondary' : 'text-muted'}"></i> ${adv.mando === 'casa' ? 'vs' : '@'} ${adv.adv}</span>` : ''}
                </div>
            </div>
            <button onclick="this.closest('.fixed').remove()" class="text-muted hover:text-fg"><i data-lucide="x" class="h-5 w-5"></i></button>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div class="rounded-lg bg-surface2 p-3"><div class="text-[10px] text-muted uppercase tracking-wider">Preço</div><div class="font-mono font-bold text-lg">C$ ${fmt(a.preco_num)}</div></div>
            <div class="rounded-lg bg-surface2 p-3"><div class="text-[10px] text-muted uppercase tracking-wider">Média</div><div class="font-mono font-bold text-lg text-primary">${fmt(a.media_num, 2)}</div></div>
            <div class="rounded-lg bg-surface2 p-3"><div class="text-[10px] text-muted uppercase tracking-wider">Última</div><div class="font-mono font-bold text-lg">${fmt(a.pontos_num, 2)}</div></div>
            <div class="rounded-lg bg-surface2 p-3"><div class="text-[10px] text-muted uppercase tracking-wider">Jogos</div><div class="font-mono font-bold text-lg">${a.jogos_num}</div></div>
            <div class="rounded-lg bg-surface2 p-3"><div class="text-[10px] text-muted uppercase tracking-wider">Variação últ.</div><div class="font-mono font-bold ${variacaoColor(a.variacao_num)}">${fmtSign(a.variacao_num)}</div></div>
            <div class="rounded-lg bg-surface2 p-3"><div class="text-[10px] text-muted uppercase tracking-wider">Mín p/ valorizar</div><div class="font-mono font-bold">${fmt(a.minimo_valorizar_est, 1)}</div></div>
            <div class="rounded-lg bg-surface2 p-3"><div class="text-[10px] text-muted uppercase tracking-wider">Proj. valor.</div><div class="font-mono font-bold ${variacaoColor(a.valorizacao_projetada)}">${fmtSign(a.valorizacao_projetada)}</div></div>
            <div class="rounded-lg bg-surface2 p-3"><div class="text-[10px] text-muted uppercase tracking-wider">Em campo últ.</div><div class="font-bold ${a.entrou_em_campo ? 'text-secondary' : 'text-muted'}">${a.entrou_em_campo ? 'Sim' : 'Não'}</div></div>
        </div>

        <div class="rounded-lg border border-border bg-surface2 p-4">
            <div class="text-xs text-muted uppercase tracking-wider mb-2">Histórico de pontuação (rodadas anteriores)</div>
            ${a.historico?.length ? `<canvas id="histChart" height="120"></canvas>` : `<p class="text-sm text-muted italic">Sem histórico disponível.</p>`}
        </div>

        ${scout.length ? `
        <div class="rounded-lg border border-border bg-surface2 p-4">
            <div class="text-xs text-muted uppercase tracking-wider mb-2">Scouts da última rodada</div>
            <div class="flex flex-wrap gap-2">
                ${scout.map(([k, v]) => `<span class="chip"><span class="text-primary font-semibold">${k}</span><span class="text-muted">×${v}</span></span>`).join('')}
            </div>
        </div>` : ''}
    </div>`;
    document.body.appendChild(modal);
    renderIcons();
    if (a.historico?.length) {
        const ctx = modal.querySelector('#histChart');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: a.historico.map(h => `R${h.rodada}`),
                datasets: [{
                    data: a.historico.map(h => h.pontos),
                    borderColor: '#fee03b',
                    backgroundColor: 'rgba(254,224,59,.15)',
                    tension: .35,
                    fill: true,
                    pointBackgroundColor: '#fee03b',
                    pointRadius: 4
                }]
            },
            options: {
                plugins: { legend: { display: false }, tooltip: { backgroundColor: '#161f22', borderColor: '#22302f', borderWidth: 1 } },
                scales: { y: { ticks: { color: '#7b8a87' }, grid: { color: '#22302f' } }, x: { ticks: { color: '#7b8a87' }, grid: { display: false } } }
            }
        });
    }
}

// ========== Tabs ==========
function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('[data-view]').forEach(s => {
        const isActive = s.getAttribute('data-view') === tab;
        s.classList.toggle('hidden', !isActive);
        if (isActive) s.classList.add('grid'); else s.classList.remove('grid');
        if (tab === 'escalacao' && isActive) { s.classList.remove('grid'); s.classList.add('block'); }
    });
    document.querySelectorAll('.tab-btn').forEach(b => {
        const active = b.dataset.tab === tab;
        b.classList.toggle('bg-surface', active);
        b.classList.toggle('text-fg', active);
        b.classList.toggle('text-muted', !active);
    });
    renderIcons();
}
window.switchTab = switchTab;

// ========== Comparar ==========
function toggleCompare(id) {
    const idx = state.selectedCompare.indexOf(id);
    if (idx >= 0) state.selectedCompare.splice(idx, 1);
    else if (state.selectedCompare.length < 4) state.selectedCompare.push(id);
    renderCompare();
}
window.toggleCompare = toggleCompare;

function buildCompareContext() {
    if (state.selectedCompare.length < 2) return null;
    const linhas = state.selectedCompare.map(id => {
        const a = state.snapshot.atletas.find(x => x.atleta_id === id); if (!a) return null;
        const adv = a.adversario ? ` próximo: ${a.adversario.adv} (${a.adversario.mando})` : '';
        return `${a.apelido} (${a.posicao_nome}, ${a.clube_nome}) — preço C$${fmt(a.preco_num)}, média ${fmt(a.media_num)}, última ${fmt(a.pontos_num)}, jogos ${a.jogos_num}, status ${a.status_nome}, var ${fmtSign(a.variacao_num)}, mín-val ${fmt(a.minimo_valorizar_est, 1)}, proj-val ${fmtSign(a.valorizacao_projetada)}.${adv}`;
    }).filter(Boolean);
    return `O usuário está comparando estes jogadores:\n${linhas.join('\n')}\n\nDê uma recomendação técnica de qual escolher e por quê, considerando preço x retorno e cenário da rodada.`;
}

function renderCompare() {
    const root = document.querySelector('[data-view="comparar"] > div');
    const sel = document.getElementById('compareSelected');
    if (!state.snapshot) return;

    const selectedAtletas = state.selectedCompare.map(id => state.snapshot.atletas.find(a => a.atleta_id === id)).filter(Boolean);
    sel.innerHTML = selectedAtletas.length ? `
        <div class="rounded-xl border border-border bg-surface p-4 shadow-card">
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                ${selectedAtletas.map(a => `
                    <div class="relative rounded-lg border border-border bg-surface2 p-3">
                        <button onclick="toggleCompare(${a.atleta_id})" class="absolute right-2 top-2 text-muted hover:text-danger"><i data-lucide="x" class="h-4 w-4"></i></button>
                        <div class="flex items-center gap-2 mb-2">
                            <div class="player-photo h-10 w-10 rounded-full overflow-hidden border border-border" ${a.foto ? `style="background-image:url('${a.foto}'); background-size:cover"` : ''}></div>
                            <div class="min-w-0">
                                <div class="font-semibold truncate">${a.apelido}</div>
                                <div class="text-xs text-muted">${a.posicao_nome} · ${a.clube_abrev}</div>
                            </div>
                        </div>
                        <dl class="grid grid-cols-2 gap-y-1 text-xs">
                            <dt class="text-muted">Preço</dt><dd class="text-right font-mono">C$ ${fmt(a.preco_num)}</dd>
                            <dt class="text-muted">Média</dt><dd class="text-right font-mono text-primary">${fmt(a.media_num)}</dd>
                            <dt class="text-muted">Última</dt><dd class="text-right font-mono">${fmt(a.pontos_num)}</dd>
                            <dt class="text-muted">Variação</dt><dd class="text-right font-mono ${variacaoColor(a.variacao_num)}">${fmtSign(a.variacao_num)}</dd>
                            <dt class="text-muted">Mín. val.</dt><dd class="text-right font-mono">${fmt(a.minimo_valorizar_est, 1)}</dd>
                            <dt class="text-muted">Proj. val.</dt><dd class="text-right font-mono ${variacaoColor(a.valorizacao_projetada)}">${fmtSign(a.valorizacao_projetada)}</dd>
                            <dt class="text-muted">Status</dt><dd class="text-right"><span class="badge border ${statusBadgeColor(a.status_id)}">${a.status_nome}</span></dd>
                            <dt class="text-muted">Próximo</dt><dd class="text-right text-xs">${a.adversario ? `${a.adversario.mando === 'casa' ? 'vs' : '@'} ${a.adversario.adv}` : '—'}</dd>
                        </dl>
                    </div>
                `).join('')}
            </div>
            ${selectedAtletas.length < 2 ? `<p class="mt-3 text-xs text-muted">Selecione pelo menos 2 jogadores para a IA comparar.</p>` : ''}
            <div class="mt-3 flex justify-end"><button onclick="state.selectedCompare=[]; renderCompare()" class="text-xs text-muted hover:text-fg">Limpar seleção</button></div>
        </div>
    ` : `<div class="rounded-xl border border-dashed border-border bg-surface/40 p-6 text-center text-sm text-muted">Selecione até 4 jogadores na tabela abaixo.</div>`;

    const filtered = applyFilters(state.snapshot.atletas);
    const tbl = document.getElementById('compareTable');
    tbl.innerHTML = `
    <div class="rounded-xl border border-border bg-surface shadow-card">
        ${renderFilterBar('comparar')}
        <div class="overflow-x-auto scroll-thin max-h-[60vh]">
            <table class="w-full text-sm">
                <thead class="sticky top-0 bg-surface2"><tr class="border-b border-border text-left">
                    <th class="px-2 py-2 w-10"></th>
                    <th class="px-3 py-2">Jogador</th>
                    <th class="px-2 py-2 hidden md:table-cell">Pos</th>
                    <th class="px-2 py-2 text-right">C$</th>
                    <th class="px-2 py-2 text-right">Méd</th>
                    <th class="px-2 py-2 hidden md:table-cell">Status</th>
                </tr></thead>
                <tbody>
                ${filtered.map(a => {
                    const sel = state.selectedCompare.includes(a.atleta_id);
                    return `<tr class="border-b border-border/60 hover:bg-surface2/40 ${sel ? 'bg-primary/10' : ''}">
                        <td class="px-2 py-2"><button onclick="toggleCompare(${a.atleta_id})" class="h-6 w-6 rounded ${sel ? 'bg-primary text-bg' : 'border border-border text-muted hover:text-fg'} text-xs">${sel ? '✓' : '+'}</button></td>
                        <td class="px-3 py-2"><div class="font-medium">${a.apelido}</div><div class="text-xs text-muted">${a.clube_abrev}</div></td>
                        <td class="px-2 py-2 hidden md:table-cell"><span class="badge border border-border bg-surface2">${a.posicao}</span></td>
                        <td class="px-2 py-2 text-right font-mono">${fmt(a.preco_num)}</td>
                        <td class="px-2 py-2 text-right font-mono text-primary">${fmt(a.media_num, 1)}</td>
                        <td class="px-2 py-2 hidden md:table-cell"><span class="badge border ${statusBadgeColor(a.status_id)}">${a.status_nome}</span></td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>
        </div>
    </div>`;

    document.getElementById('ftBusca')?.addEventListener('input',   e => { state.filters.busca = e.target.value; renderCompare(); });
    document.getElementById('ftPosicao')?.addEventListener('change', e => { state.filters.posicao = e.target.value; renderCompare(); });
    document.getElementById('ftStatus')?.addEventListener('change',  e => { state.filters.status = e.target.value; renderCompare(); });
    document.getElementById('ftClube')?.addEventListener('change',   e => { state.filters.clube = e.target.value; renderCompare(); });
    renderIcons();

    // Re-render chat panel with comparison context
    mountChat('comparar', buildCompareContext());
}

// ========== Chat ==========
const SUGESTOES = [
    'Quem são os 3 melhores capitães da rodada?',
    'Mitos baratos (até C$ 8) com bom potencial?',
    'Vale escalar atacante de time visitante?',
    'Quem tende a valorizar mais nessa rodada?'
];

function mountChat(target, extraContext = null) {
    const containerId = target === 'mercado' ? 'chatPanel' : 'chatPanelCompare';
    const container = document.getElementById(containerId);
    container._extraContext = extraContext;
    container._target = target;
    renderChat(container);
}

function renderChat(container) {
    const target = container._target;
    const msgs = state.chats[target];
    const loading = state.chatLoading[target];

    container.innerHTML = `
    <div class="flex h-full min-h-0 flex-col rounded-xl border-2 border-primary/30 bg-surface shadow-glow">
        <div class="flex items-center justify-between gap-2 border-b border-border px-4 py-3 bg-cap rounded-t-[10px]">
            <div class="flex items-center gap-2">
                <div class="flex h-7 w-7 items-center justify-center rounded-md bg-cta">
                    <i data-lucide="sparkles" class="h-3.5 w-3.5 text-bg"></i>
                </div>
                <div>
                    <div class="text-sm font-bold">Cartola IA</div>
                    <div class="text-[10px] text-muted uppercase tracking-widest">${target === 'comparar' && container._extraContext ? 'análise comparativa' : 'analista da rodada'}</div>
                </div>
            </div>
            ${msgs.length ? `<button onclick="clearChat('${target}')" class="text-xs text-muted hover:text-fg flex items-center gap-1"><i data-lucide="rotate-ccw" class="h-3 w-3"></i> Limpar</button>` : ''}
        </div>
        <div id="chatBody-${target}" class="flex-1 overflow-y-auto scroll-thin px-4 py-4 space-y-3 min-h-[300px]">
            ${msgs.length === 0 ? `
                <p class="text-sm text-muted">Pergunte sobre jogadores, capitães, valorização, mando, scouts… A IA tem acesso ao mercado ao vivo, partidas e histórico das últimas rodadas.</p>
                <div class="space-y-2">
                    ${SUGESTOES.map(s => `<button onclick="sendChat('${target}', ${JSON.stringify(s)})" class="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-left text-sm hover:border-primary/50 hover:bg-surface2/80 transition-colors">${s}</button>`).join('')}
                </div>
            ` : msgs.map(renderMsg).join('')}
            ${loading && msgs[msgs.length - 1]?.role === 'user' ? `<div class="flex items-center gap-2 text-sm text-muted"><span class="flex gap-1"><span class="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-primary"></span><span class="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-primary"></span><span class="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-primary"></span></span> pensando…</div>` : ''}
        </div>
        <form class="border-t border-border p-3" onsubmit="event.preventDefault(); const i = this.querySelector('textarea'); sendChat('${target}', i.value); i.value=''">
            <div class="flex gap-2">
                <textarea rows="2" placeholder="Pergunte sobre jogadores, capitão, mando…" class="flex-1 min-h-[44px] resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm focus:border-primary focus:outline-none" ${loading ? 'disabled' : ''} onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.form.requestSubmit()}"></textarea>
                <button type="submit" ${loading ? 'disabled' : ''} class="bg-cta text-bg font-semibold rounded-md px-3 disabled:opacity-50"><i data-lucide="${loading ? 'loader-2' : 'send'}" class="h-4 w-4 ${loading ? 'animate-spin' : ''}"></i></button>
            </div>
        </form>
    </div>`;

    const body = container.querySelector(`#chatBody-${target}`);
    body.scrollTop = body.scrollHeight;
    renderIcons();
}

function renderMsg(m) {
    if (m.role === 'user') {
        return `<div class="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm bg-primary/15 px-3 py-2 text-sm whitespace-pre-wrap">${escapeHtml(m.content)}</div>`;
    }
    const html = marked.parse(m.content || '…', { breaks: true, gfm: true });
    return `<div class="max-w-[95%] rounded-2xl rounded-tl-sm bg-surface2 px-3 py-2 text-sm prose-chat">${html}</div>`;
}
function escapeHtml(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

window.clearChat = (target) => { state.chats[target] = []; renderChat(target === 'mercado' ? document.getElementById('chatPanel') : document.getElementById('chatPanelCompare')); };

window.sendChat = async (target, text) => {
    text = String(text || '').trim();
    if (!text || state.chatLoading[target]) return;
    const container = target === 'mercado' ? document.getElementById('chatPanel') : document.getElementById('chatPanelCompare');
    const extraContext = container._extraContext;
    state.chats[target].push({ role: 'user', content: text });
    state.chatLoading[target] = true;
    renderChat(container);

    let assistantText = '';
    let pushedAssistant = false;
    const upsert = (chunk) => {
        assistantText += chunk;
        if (!pushedAssistant) { state.chats[target].push({ role: 'assistant', content: assistantText }); pushedAssistant = true; }
        else state.chats[target][state.chats[target].length - 1].content = assistantText;
        const body = container.querySelector(`#chatBody-${target}`);
        if (body) {
            const wasNearBottom = body.scrollTop + body.clientHeight + 100 >= body.scrollHeight;
            // re-render only the body; cheap full re-render is OK here
            renderChat(container);
            const b2 = container.querySelector(`#chatBody-${target}`);
            if (b2 && wasNearBottom) b2.scrollTop = b2.scrollHeight;
        }
    };

    try {
        const r = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: state.chats[target].slice(-12), extraContext })
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
            upsert(`\n\n_⚠️ Erro: ${err.error}_`);
            return;
        }
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buffer = '';
        while (true) {
            const { value, done } = await reader.read(); if (done) break;
            buffer += dec.decode(value, { stream: true });
            let nl;
            while ((nl = buffer.indexOf('\n\n')) !== -1) {
                const block = buffer.slice(0, nl); buffer = buffer.slice(nl + 2);
                for (const line of block.split('\n')) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;
                    try {
                        const j = JSON.parse(data);
                        if (j.error) upsert(`\n\n_⚠️ ${j.error}_`);
                        else if (j.delta) upsert(j.delta);
                    } catch {}
                }
            }
        }
    } catch (e) {
        upsert(`\n\n_⚠️ Falha: ${e.message}_`);
    } finally {
        state.chatLoading[target] = false;
        renderChat(container);
        refreshUsage();
    }
};

// ========== Escalação IA ==========
async function gerarEscalacao() {
    const cartoletas = Number(document.getElementById('inCartoletas').value);
    const esquema = document.getElementById('inEsquema').value;
    const preferencia = document.getElementById('inPreferencia').value;
    const evitarDuvidas = document.getElementById('inEvitarDuvidas').checked;
    const btn = document.getElementById('btnGerar');
    const result = document.getElementById('lineupResult');
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="h-4 w-4 animate-spin"></i> Gerando…`;
    renderIcons();
    result.innerHTML = `<div class="rounded-xl border border-border bg-surface p-8 text-center text-muted">🤖 Analisando mercado, scouts, partidas e histórico das últimas rodadas… (até 30s)</div>`;
    try {
        const r = await fetch('/api/insights/lineup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cartoletas, esquema, preferencia, evitarDuvidas })
        });
        const data = await r.json();
        if (!r.ok || data.error) { result.innerHTML = `<div class="rounded-xl border border-danger/40 bg-surface p-6 text-danger">❌ ${data.error || r.status}</div>`; return; }
        renderLineup(data);
    } catch (e) {
        result.innerHTML = `<div class="rounded-xl border border-danger/40 bg-surface p-6 text-danger">❌ ${e.message}</div>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="sparkles" class="h-4 w-4"></i> Gerar com IA`;
        renderIcons();
        refreshUsage();
    }
}
window.gerarEscalacao = gerarEscalacao;

function renderLineup(data) {
    const root = document.getElementById('lineupResult');
    const titulares = [...data.titulares].sort((a, b) => (POS_ORDEM[a.posicao] ?? 9) - (POS_ORDEM[b.posicao] ?? 9));
    const totalProjVal = data.valorizacao_calculada;
    const card = (a, opts = {}) => `
        <div class="rounded-lg border ${opts.captain ? 'border-primary/60 bg-cap shadow-glow' : opts.luxo ? 'border-secondary/60 bg-lux' : 'border-border bg-surface2'} p-3">
            <div class="flex items-start gap-3">
                <div class="player-photo h-12 w-12 rounded-full overflow-hidden border border-border flex-shrink-0" ${a.foto_pequena || a.foto ? `style="background-image:url('${a.foto || a.foto_pequena}'); background-size:cover; background-position:center"` : ''}></div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <span class="badge border border-border bg-surface text-fg">${a.posicao}</span>
                        ${opts.captain ? `<span class="badge bg-primary text-bg flex items-center gap-1"><i data-lucide="crown" class="h-3 w-3"></i> Capitão</span>` : ''}
                        ${opts.luxo ? `<span class="badge bg-secondary text-bg flex items-center gap-1"><i data-lucide="star" class="h-3 w-3"></i> Reserva de luxo</span>` : ''}
                        <span class="ml-auto text-sm font-mono">C$ ${fmt(a.preco_num)}</span>
                    </div>
                    <div class="mt-1 flex items-center gap-2">
                        ${a.escudo_pequeno ? `<img src="${a.escudo_pequeno}" class="h-4 w-4" onerror="this.style.display='none'">` : ''}
                        <div class="font-semibold">${a.apelido}</div>
                        <span class="text-xs text-muted">${a.clube_abrev}</span>
                    </div>
                    <div class="mt-1 flex items-center gap-3 text-xs">
                        <span class="text-muted">méd <span class="font-mono text-primary">${fmt(a.media_num, 1)}</span></span>
                        <span class="text-muted">últ <span class="font-mono">${fmt(a.pontos_num, 1)}</span></span>
                        <span class="text-muted">var <span class="font-mono ${variacaoColor(a.variacao_num)}">${fmtSign(a.variacao_num)}</span></span>
                        <span class="text-muted">proj <span class="font-mono ${variacaoColor(a.valorizacao_projetada)}">${fmtSign(a.valorizacao_projetada)}</span></span>
                        ${a.adversario ? `<span class="text-muted">${a.adversario.mando === 'casa' ? 'vs' : '@'} <span class="text-fg">${a.adversario.adv}</span></span>` : ''}
                    </div>
                    ${a.motivo ? `<p class="mt-2 text-xs text-muted italic">"${a.motivo}"</p>` : ''}
                </div>
            </div>
        </div>`;

    root.innerHTML = `
        <div class="space-y-4">
            <div class="rounded-xl border border-primary/30 bg-cap p-4 shadow-glow grid gap-4 sm:grid-cols-5">
                <div><div class="text-[10px] uppercase tracking-widest text-muted">Esquema</div><div class="text-xl font-bold">${data.meta.esquema}</div></div>
                <div><div class="text-[10px] uppercase tracking-widest text-muted">Custo total</div><div class="text-xl font-bold font-mono">C$ ${fmt(data.custo_total)}</div></div>
                <div><div class="text-[10px] uppercase tracking-widest text-muted">Saldo</div><div class="text-xl font-bold font-mono ${data.saldo_restante >= 0 ? 'text-secondary' : 'text-danger'}">C$ ${fmt(data.saldo_restante)}</div></div>
                <div><div class="text-[10px] uppercase tracking-widest text-muted">Pontos esperados</div><div class="text-xl font-bold font-mono text-primary">${fmt(data.pontos_estimados, 1)}</div></div>
                <div><div class="text-[10px] uppercase tracking-widest text-muted">Valorização</div><div class="text-xl font-bold font-mono ${totalProjVal >= 0 ? 'text-secondary' : 'text-danger'}">${fmtSign(totalProjVal)}</div><div class="text-[10px] text-muted">IA estimou ${fmtSign(data.valorizacao_ia)}</div></div>
            </div>

            <div class="rounded-xl border border-border bg-surface p-5 shadow-card">
                <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Titulares (${titulares.length})</h2>
                <div class="grid gap-2 lg:grid-cols-2">${titulares.map(t => card(t, { captain: t.atleta_id === data.capitao_id })).join('')}</div>
            </div>

            ${data.reserva_de_luxo ? `
            <div class="rounded-xl border border-secondary/40 bg-surface p-5 shadow-card">
                <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-secondary flex items-center gap-2"><i data-lucide="star" class="h-4 w-4"></i> Reserva de luxo</h2>
                <p class="text-xs text-muted mb-3">Entra no lugar do titular com pior pontuação esperada.</p>
                ${card(data.reserva_de_luxo, { luxo: true })}
                ${data.reserva_de_luxo.substitui_atleta_id ? (() => {
                    const sub = data.titulares.find(t => t.atleta_id === data.reserva_de_luxo.substitui_atleta_id);
                    return sub ? `<p class="mt-3 text-xs text-muted">Substituiria: <span class="text-fg font-medium">${sub.apelido}</span> (${sub.posicao})</p>` : '';
                })() : ''}
            </div>` : ''}

            ${data.reservas?.length ? `
            <div class="rounded-xl border border-border bg-surface p-5 shadow-card">
                <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Banco econômico</h2>
                <div class="grid gap-2 sm:grid-cols-2">${data.reservas.map(b => card(b)).join('')}</div>
            </div>` : ''}

            <div class="rounded-xl border border-border bg-surface p-5 shadow-card">
                <h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">Estratégia</h2>
                <div class="prose-chat text-sm">${marked.parse(data.resumo_estrategia || '')}</div>
            </div>

            <div class="text-xs text-muted text-right">Modelo: ${data.meta.modelo} · ${data.meta.tokens_in}+${data.meta.tokens_out} tokens · preferência <span class="text-fg font-medium">${data.meta.preferencia}</span></div>
        </div>`;
    renderIcons();
}

// ========== Uso da IA ==========
async function refreshUsage() {
    try {
        const r = await fetch('/api/usage');
        const u = await r.json();
        const mini = document.getElementById('usageMini');
        if (mini) mini.textContent = `IA: ${u.requests} req · $${u.estimated_cost_usd.toFixed(4)}`;
        if (!document.getElementById('usageModal').classList.contains('hidden')) renderUsageBody(u);
    } catch {}
}
function renderUsageBody(u) {
    const body = document.getElementById('usageBody');
    const pct = u.free_tier_pct_used;
    body.innerHTML = `
        <div class="grid grid-cols-2 gap-2 text-center">
            <div class="rounded-lg bg-surface2 p-3"><div class="text-[10px] text-muted uppercase tracking-wider">Requisições</div><div class="font-mono font-bold text-lg">${u.requests}</div></div>
            <div class="rounded-lg bg-surface2 p-3"><div class="text-[10px] text-muted uppercase tracking-wider">Tokens totais</div><div class="font-mono font-bold text-lg">${u.total_tokens.toLocaleString('pt-BR')}</div></div>
            <div class="rounded-lg bg-surface2 p-3"><div class="text-[10px] text-muted uppercase tracking-wider">Chats</div><div class="font-mono font-bold">${u.chat_streams}</div></div>
            <div class="rounded-lg bg-surface2 p-3"><div class="text-[10px] text-muted uppercase tracking-wider">Escalações</div><div class="font-mono font-bold">${u.lineup_calls}</div></div>
        </div>
        <div>
            <div class="flex justify-between text-xs mb-1"><span class="text-muted">Custo estimado da sessão</span><span class="font-mono font-bold">$${u.estimated_cost_usd.toFixed(4)} / $${u.free_tier_usd.toFixed(2)}</span></div>
            <div class="h-2 rounded-full bg-surface2 overflow-hidden"><div class="h-full bg-cta" style="width:${Math.max(2, pct)}%"></div></div>
            <div class="text-[10px] text-muted mt-1">${pct.toFixed(2)}% do teto mensal gratuito (referência)</div>
        </div>
        ${u.last_error ? `<div class="rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger">⚠️ Último erro: ${u.last_error}</div>` : ''}
    `;
    document.getElementById('usageProvider').textContent = u.provider;
    document.getElementById('usageNote').textContent = u.note;
}
window.openUsage = () => {
    document.getElementById('usageModal').classList.remove('hidden');
    fetch('/api/usage').then(r => r.json()).then(renderUsageBody);
    renderIcons();
};
window.closeUsage = () => document.getElementById('usageModal').classList.add('hidden');

// ========== Render orquestrador ==========
function renderAll() {
    renderStatusBar();
    if (state.activeTab === 'mercado') renderMercadoTable();
    if (state.activeTab === 'comparar') renderCompare();
    mountChat('mercado');
    mountChat('comparar', buildCompareContext());
    renderIcons();
}

// ========== Boot ==========
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    document.getElementById('usageBtn').addEventListener('click', () => openUsage());
    document.getElementById('btnGerar').addEventListener('click', gerarEscalacao);
    switchTab('mercado');
    renderIcons();
    loadSnapshot();
    refreshUsage();
    setInterval(refreshUsage, 15000);
    setInterval(() => { if (!document.hidden) loadSnapshot(); }, 60000);
});
