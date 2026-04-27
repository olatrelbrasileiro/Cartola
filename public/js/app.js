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
        sortKey: 'score_ia',
        sortDir: 'desc'
    },
    assistida: {
        esquema: '4-3-3',
        selecionados: {}, // { slotId: atleta }
        activeSlot: null
    },
    chartCache: new Map()
};

const POS_ABREV = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA', 6: 'TEC' };
const POS_NOME  = { 1: 'Goleiro', 2: 'Lateral', 3: 'Zagueiro', 4: 'Meia', 5: 'Atacante', 6: 'Técnico' };
const POS_ORDEM = { GOL: 0, LAT: 1, ZAG: 2, MEI: 3, ATA: 4, TEC: 5 };

const ESQUEMAS_POS = {
    '4-3-3': [
        { id: 'gol_1', pos: 1, top: '85%', left: '50%' },
        { id: 'zag_1', pos: 3, top: '70%', left: '35%' },
        { id: 'zag_2', pos: 3, top: '70%', left: '65%' },
        { id: 'lat_1', pos: 2, top: '75%', left: '15%' },
        { id: 'lat_2', pos: 2, top: '75%', left: '85%' },
        { id: 'mei_1', pos: 4, top: '50%', left: '50%' },
        { id: 'mei_2', pos: 4, top: '55%', left: '25%' },
        { id: 'mei_3', pos: 4, top: '55%', left: '75%' },
        { id: 'ata_1', pos: 5, top: '25%', left: '50%' },
        { id: 'ata_2', pos: 5, top: '30%', left: '20%' },
        { id: 'ata_3', pos: 5, top: '30%', left: '80%' },
        { id: 'tec_1', pos: 6, top: '92%', left: '85%' }
    ],
    '4-4-2': [
        { id: 'gol_1', pos: 1, top: '85%', left: '50%' },
        { id: 'zag_1', pos: 3, top: '70%', left: '35%' },
        { id: 'zag_2', pos: 3, top: '70%', left: '65%' },
        { id: 'lat_1', pos: 2, top: '75%', left: '15%' },
        { id: 'lat_2', pos: 2, top: '75%', left: '85%' },
        { id: 'mei_1', pos: 4, top: '55%', left: '40%' },
        { id: 'mei_2', pos: 4, top: '55%', left: '60%' },
        { id: 'mei_3', pos: 4, top: '50%', left: '20%' },
        { id: 'mei_4', pos: 4, top: '50%', left: '80%' },
        { id: 'ata_1', pos: 5, top: '25%', left: '40%' },
        { id: 'ata_2', pos: 5, top: '25%', left: '60%' },
        { id: 'tec_1', pos: 6, top: '92%', left: '85%' }
    ]
    // Outros esquemas podem ser adicionados similarmente
};

const fmt = (n, d = 2) => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(d);
const fmtSign = (n, d = 2) => (n == null || isNaN(n)) ? '—' : (n >= 0 ? '+' : '') + Number(n).toFixed(d);

function renderIcons() { lucide?.createIcons?.(); }

async function loadSnapshot() {
    try {
        const r = await fetch('/api/snapshot');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        state.snapshot = await r.json();
        state.loading = false;
        renderAll();
    } catch (e) {
        state.error = e.message;
        state.loading = false;
        renderAll();
    }
}

function renderStatusBar() {
    const el = document.getElementById('statusBar');
    if (state.loading || !state.snapshot) return;
    const s = state.snapshot;
    const aberto = s.status_mercado === 1;
    el.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="relative flex h-3 w-3">
                ${aberto ? `<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>` : ''}
                <span class="relative inline-flex rounded-full h-3 w-3 ${aberto ? 'bg-primary' : 'bg-muted'}"></span>
            </span>
            <span class="font-black uppercase tracking-tighter">Mercado ${aberto ? 'Aberto' : 'Fechado'}</span>
        </div>
        <div class="h-4 w-px bg-border"></div>
        <div class="font-bold">RODADA <span class="text-primary">#${s.rodada_atual}</span></div>
        <div class="ml-auto text-[10px] font-bold text-muted uppercase tracking-widest">Análise baseada em ${s.rodadas_historico.length} rodadas</div>
    `;
}

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
        return f.sortDir === 'asc' ? (va - vb) : (vb - va);
    });
    return out; // Sem limite de 200 conforme solicitado
}

function renderMercadoTable() {
    const root = document.getElementById('mercadoTable');
    if (state.loading) { root.innerHTML = `<div class="p-20 text-center animate-pulse font-bold text-muted">CARREGANDO MERCADO...</div>`; return; }
    const filtered = applyFilters(state.snapshot.atletas);

    root.innerHTML = `
        <div class="rounded-3xl border border-border bg-surface overflow-hidden shadow-2xl">
            <div class="flex flex-wrap gap-3 p-4 border-b border-border bg-surface2/50">
                <input id="ftBusca" value="${state.filters.busca}" placeholder="Buscar craque..." class="flex-1 min-w-[200px] bg-bg border border-border rounded-xl px-4 py-2 text-sm font-bold outline-none focus:border-primary">
                <select id="ftPosicao" class="bg-bg border border-border rounded-xl px-4 py-2 text-sm font-bold outline-none">
                    <option value="all">Todas Posições</option>
                    ${Object.entries(POS_ABREV).map(([id, n]) => `<option value="${id}" ${state.filters.posicao == id ? 'selected' : ''}>${n}</option>`).join('')}
                </select>
                <select id="ftSort" class="bg-bg border border-border rounded-xl px-4 py-2 text-sm font-bold outline-none">
                    <option value="score_ia" ${state.filters.sortKey === 'score_ia' ? 'selected' : ''}>Ordenar por Score IA</option>
                    <option value="preco_num" ${state.filters.sortKey === 'preco_num' ? 'selected' : ''}>Ordenar por Preço</option>
                    <option value="media_num" ${state.filters.sortKey === 'media_num' ? 'selected' : ''}>Ordenar por Média</option>
                </select>
            </div>
            <div class="overflow-x-auto scroll-thin">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="text-[10px] font-black uppercase tracking-widest text-muted border-b border-border">
                            <th class="px-6 py-4">Jogador</th>
                            <th class="px-4 py-4">Confronto</th>
                            <th class="px-4 py-4 text-right">Score IA</th>
                            <th class="px-4 py-4 text-right">Preço</th>
                            <th class="px-4 py-4 text-right">Média</th>
                            <th class="px-4 py-4 text-right">Última</th>
                            <th class="px-6 py-4 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                        ${filtered.map(a => `
                            <tr class="hover:bg-surface2/30 transition-colors group">
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-3">
                                        <div class="h-10 w-10 rounded-full bg-surface2 border border-border overflow-hidden player-silhouette" style="background-image:url('${a.foto}'); background-size:cover"></div>
                                        <div>
                                            <div class="font-black text-sm">${a.apelido}</div>
                                            <div class="text-[10px] font-bold text-muted uppercase">${a.posicao} · ${a.clube_abrev}</div>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-4 py-4">
                                    ${a.adversario ? `
                                        <div class="flex items-center gap-2">
                                            <img src="${a.escudo}" class="h-4 w-4 opacity-50">
                                            <span class="text-[10px] font-black text-muted">VS</span>
                                            <img src="${a.adversario.escudo_adv}" class="h-4 w-4">
                                            <span class="text-[10px] font-bold text-fg">${a.adversario.adv}</span>
                                        </div>
                                    ` : '—'}
                                </td>
                                <td class="px-4 py-4 text-right font-black text-primary">${fmt(a.score_ia, 1)}</td>
                                <td class="px-4 py-4 text-right font-bold text-sm">C$ ${fmt(a.preco_num)}</td>
                                <td class="px-4 py-4 text-right font-bold text-sm">${fmt(a.media_num, 1)}</td>
                                <td class="px-4 py-4 text-right font-bold text-sm ${a.pontos_num >= 0 ? 'text-primary' : 'text-danger'}">${fmt(a.pontos_num, 1)}</td>
                                <td class="px-6 py-4 text-right">
                                    <button onclick="togglePlayerDetail(${a.atleta_id})" class="p-2 rounded-lg bg-surface2 hover:bg-primary hover:text-white transition-all">
                                        <i data-lucide="chevron-down" class="h-4 w-4"></i>
                                    </button>
                                </td>
                            </tr>
                            <tr id="detail-${a.atleta_id}" class="hidden bg-black/40">
                                <td colspan="7" class="px-6 py-6">
                                    <div class="grid md:grid-cols-3 gap-8">
                                        <div class="space-y-4">
                                            <h4 class="text-[10px] font-black uppercase tracking-widest text-primary">Estatísticas Detalhadas</h4>
                                            <div class="grid grid-cols-2 gap-4">
                                                <div class="bg-surface2 p-3 rounded-xl">
                                                    <div class="text-[10px] text-muted font-bold uppercase">Jogos</div>
                                                    <div class="text-lg font-black">${a.jogos_num}</div>
                                                </div>
                                                <div class="bg-surface2 p-3 rounded-xl">
                                                    <div class="text-[10px] text-muted font-bold uppercase">Jogou Última?</div>
                                                    <div class="text-lg font-black ${a.jogou_ultima ? 'text-primary' : 'text-muted'}">${a.jogou_ultima ? 'SIM' : 'NÃO'}</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="md:col-span-2">
                                            <h4 class="text-[10px] font-black uppercase tracking-widest text-primary mb-4">Desempenho Últimas 10 Rodadas</h4>
                                            <canvas id="chart-${a.atleta_id}" height="100"></canvas>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    document.getElementById('ftBusca').addEventListener('input', e => { state.filters.busca = e.target.value; renderMercadoTable(); });
    document.getElementById('ftPosicao').addEventListener('change', e => { state.filters.posicao = e.target.value; renderMercadoTable(); });
    document.getElementById('ftSort').addEventListener('change', e => { state.filters.sortKey = e.target.value; renderMercadoTable(); });
    renderIcons();
}

function togglePlayerDetail(id) {
    const row = document.getElementById(`detail-${id}`);
    const isHidden = row.classList.contains('hidden');
    
    // Fechar outros
    document.querySelectorAll('[id^="detail-"]').forEach(el => el.classList.add('hidden'));
    
    if (isHidden) {
        row.classList.remove('hidden');
        renderPlayerChart(id);
    }
}

function renderPlayerChart(id) {
    const a = state.snapshot.atletas.find(x => x.atleta_id === id);
    if (!a || !a.historico) return;
    
    const ctx = document.getElementById(`chart-${id}`).getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: a.historico.map(h => `R${h.rodada}`),
            datasets: [{
                label: 'Pontos',
                data: a.historico.map(h => h.pontos),
                borderColor: '#0066ff',
                backgroundColor: 'rgba(0, 102, 255, 0.1)',
                fill: true,
                tension: 0.4,
                borderWidth: 3,
                pointRadius: 4,
                pointBackgroundColor: '#0066ff'
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: '#1f1f1f' }, ticks: { color: '#a0a0a0', font: { weight: 'bold' } } },
                x: { grid: { display: false }, ticks: { color: '#a0a0a0', font: { weight: 'bold' } } }
            }
        }
    });
}

function renderAssistida() {
    const slotsContainer = document.getElementById('pitchSlots');
    const slots = ESQUEMAS_POS[state.assistida.esquema] || ESQUEMAS_POS['4-3-3'];
    
    slotsContainer.innerHTML = slots.map(s => {
        const sel = state.assistida.selecionados[s.id];
        return `
            <div onclick="openAssistSelection('${s.id}', ${s.pos})" class="player-slot group" style="top:${s.top}; left:${s.left}">
                <div class="h-12 w-12 rounded-full border-2 ${state.assistida.activeSlot === s.id ? 'border-primary shadow-glow scale-110' : 'border-white/20'} bg-black/60 flex items-center justify-center overflow-hidden transition-all">
                    ${sel ? `<img src="${sel.foto}" class="h-full w-full object-cover">` : `<i data-lucide="plus" class="h-5 w-5 text-white/40 group-hover:text-white"></i>`}
                </div>
                <div class="mt-1 text-[8px] font-black text-center bg-black/80 px-1 rounded uppercase truncate w-16">
                    ${sel ? sel.apelido : POS_ABREV[s.pos]}
                </div>
            </div>
        `;
    }).join('');
    
    const total = Object.values(state.assistida.selecionados).reduce((s, a) => s + a.preco_num, 0);
    document.getElementById('assistTotalCusto').textContent = `C$ ${fmt(total)}`;
    
    const btn = document.getElementById('btnFinalizarAssist');
    const completo = Object.keys(state.assistida.selecionados).length === slots.length;
    btn.className = `bg-primary text-white font-bold rounded-full px-6 py-2 text-sm transition-all ${completo ? 'opacity-100 shadow-glow hover:scale-105' : 'opacity-50 cursor-not-allowed'}`;
    
    renderIcons();
}

function openAssistSelection(slotId, posId) {
    state.assistida.activeSlot = slotId;
    const list = document.getElementById('assistPlayerList');
    const info = document.getElementById('assistSelectionInfo');
    
    info.innerHTML = `Escolhendo <span class="text-primary font-black">${POS_NOME[posId]}</span>`;
    
    const atletas = state.snapshot.atletas
        .filter(a => a.posicao_id === posId && a.status_id === 7)
        .sort((a, b) => b.score_ia - a.score_ia);
        
    list.innerHTML = atletas.map(a => `
        <div onclick="selectAssistPlayer(${a.atleta_id})" class="flex items-center gap-3 p-2 rounded-xl bg-surface2/50 border border-transparent hover:border-primary cursor-pointer transition-all">
            <img src="${a.foto}" class="h-8 w-8 rounded-full bg-black">
            <div class="flex-1">
                <div class="text-xs font-black">${a.apelido}</div>
                <div class="text-[10px] text-muted font-bold">${a.clube_abrev} · Score ${fmt(a.score_ia, 1)}</div>
            </div>
            <div class="text-xs font-bold">C$ ${fmt(a.preco_num)}</div>
        </div>
    `).join('');
    
    renderAssistida();
}

function selectAssistPlayer(id) {
    const a = state.snapshot.atletas.find(x => x.atleta_id === id);
    if (a && state.assistida.activeSlot) {
        state.assistida.selecionados[state.assistida.activeSlot] = a;
        state.assistida.activeSlot = null;
        document.getElementById('assistPlayerList').innerHTML = '';
        document.getElementById('assistSelectionInfo').textContent = 'Jogador selecionado! Escolha outra posição.';
        renderAssistida();
    }
}

async function gerarEscalacao() {
    const cartoletas = Number(document.getElementById('inCartoletas').value);
    const esquema = document.getElementById('inEsquema').value;
    const preferencia = document.getElementById('inPreferencia').value;
    const btn = document.getElementById('btnGerar');
    const result = document.getElementById('lineupResult');
    
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="h-5 w-5 animate-spin"></i> CALCULANDO...`;
    result.innerHTML = `<div class="p-20 text-center font-black text-muted animate-pulse">O GEMINI ESTÁ ANALISANDO MILHARES DE SCOUTS E CONFRONTOS...</div>`;
    
    try {
        const r = await fetch('/api/insights/lineup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cartoletas, esquema, preferencia })
        });
        const data = await r.json();
        renderLineup(data);
    } catch (e) {
        result.innerHTML = `<div class="p-10 text-center text-danger font-bold">ERRO: ${e.message}</div>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="zap" class="h-5 w-5"></i> GERAR ESCALAÇÃO`;
        renderIcons();
    }
}

function renderLineup(data) {
    const root = document.getElementById('lineupResult');
    const card = (a, opts = {}) => `
        <div class="rounded-2xl border ${opts.captain ? 'border-primary bg-primary/5 shadow-glow' : 'border-border bg-surface2'} p-4 relative overflow-hidden">
            ${opts.captain ? `<div class="absolute top-0 right-0 bg-primary text-white text-[8px] font-black px-2 py-1 rounded-bl-lg">CAPITÃO</div>` : ''}
            ${opts.luxo ? `<div class="absolute top-0 right-0 bg-white text-black text-[8px] font-black px-2 py-1 rounded-bl-lg">RESERVA DE LUXO</div>` : ''}
            <div class="flex items-center gap-4">
                <div class="h-12 w-12 rounded-full bg-black border border-border overflow-hidden" style="background-image:url('${a.foto}'); background-size:cover"></div>
                <div class="flex-1">
                    <div class="text-[10px] font-black text-primary uppercase">${a.posicao} · ${a.clube_abrev}</div>
                    <div class="font-black text-lg leading-tight">${a.apelido}</div>
                    <div class="mt-1 flex gap-3 text-[10px] font-bold text-muted">
                        <span>SCORE <span class="text-fg">${fmt(a.score_ia, 1)}</span></span>
                        <span>PREÇO <span class="text-fg">C$ ${fmt(a.preco_num)}</span></span>
                    </div>
                </div>
            </div>
            <p class="mt-3 text-[10px] text-muted italic font-medium leading-relaxed">"${a.motivo}"</p>
        </div>
    `;

    root.innerHTML = `
        <div class="space-y-8">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="bg-surface border border-border p-4 rounded-2xl text-center">
                    <div class="text-[10px] font-black text-muted uppercase">Custo Total</div>
                    <div class="text-2xl font-black text-primary">C$ ${fmt(data.custo_total)}</div>
                </div>
                <div class="bg-surface border border-border p-4 rounded-2xl text-center">
                    <div class="text-[10px] font-black text-muted uppercase">Saldo</div>
                    <div class="text-2xl font-black">C$ ${fmt(data.saldo_restante)}</div>
                </div>
                <div class="bg-surface border border-border p-4 rounded-2xl text-center">
                    <div class="text-[10px] font-black text-muted uppercase">Pontos Esperados</div>
                    <div class="text-2xl font-black text-primary">${fmt(data.pontos_estimados, 1)}</div>
                </div>
                <div class="bg-surface border border-border p-4 rounded-2xl text-center">
                    <div class="text-[10px] font-black text-muted uppercase">Esquema</div>
                    <div class="text-2xl font-black">${data.meta.esquema}</div>
                </div>
            </div>

            <div class="space-y-4">
                <h3 class="text-xl font-black flex items-center gap-2"><i data-lucide="users" class="text-primary"></i> TITULARES</h3>
                <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${data.titulares.map(t => card(t, { captain: t.atleta_id === data.capitao_id })).join('')}
                </div>
            </div>

            ${data.reserva_de_luxo ? `
                <div class="space-y-4">
                    <h3 class="text-xl font-black flex items-center gap-2"><i data-lucide="star" class="text-white"></i> RESERVA DE LUXO</h3>
                    <div class="max-w-md">${card(data.reserva_de_luxo, { luxo: true })}</div>
                </div>
            ` : ''}

            <div class="bg-surface border border-border p-6 rounded-3xl">
                <h3 class="text-xl font-black mb-4">ANÁLISE DO GURU</h3>
                <div class="prose prose-invert max-w-none text-sm font-medium text-muted leading-relaxed">
                    ${marked.parse(data.resumo_estrategia)}
                </div>
            </div>
        </div>
    `;
    renderIcons();
}

function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('section[data-view]').forEach(s => s.classList.add('hidden'));
    document.querySelector(`section[data-view="${tab}"]`).classList.remove('hidden');
    
    document.querySelectorAll('.tab-btn').forEach(b => {
        if (b.dataset.tab === tab) b.classList.add('bg-primary', 'text-white');
        else b.classList.remove('bg-primary', 'text-white');
    });
    
    if (tab === 'mercado') renderMercadoTable();
    if (tab === 'assistida') renderAssistida();
    renderIcons();
}

function renderAll() {
    renderStatusBar();
    if (state.activeTab === 'mercado') renderMercadoTable();
    if (state.activeTab === 'assistida') renderAssistida();
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    document.getElementById('btnGerar').addEventListener('click', gerarEscalacao);
    document.getElementById('assistEsquema').addEventListener('change', e => {
        state.assistida.esquema = e.target.value;
        state.assistida.selecionados = {};
        renderAssistida();
    });
    
    loadSnapshot();
    setInterval(loadSnapshot, 60000);
});
