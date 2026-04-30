// ─────────────────────────────────────────────────────────────────────────────
//  RoboTI BR — app.js  (rebuild completo)
//  Versão: 4.0  |  Design System Dual-Theme · Gestão de Equipe
// ─────────────────────────────────────────────────────────────────────────────

const API = 'https://entries-shipment-fork-hardware.trycloudflare.com';

let state = {
    lojas: [],
    lojaId: null,
    loja: null,
    page: 'dashboard',
    admin: { email: '', logado: false, isSuperAdmin: false },
};

let waPolling = null;
let ocRefreshTimer = null;
let ocListTimer = null;


// ─── AUTENTICAÇÃO ────────────────────────────────────────────────────────────

async function doLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const btn = document.getElementById('loginBtn');
    const errEl = document.getElementById('loginError');

    if (!email || !password) return toast('Preencha todos os campos', 'error');

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Autenticando...';
    btn.disabled = true;
    if (errEl) errEl.style.display = 'none';

    try {
        const data = await api.post('/auth/login', { email, password });

        state.admin.logado = true;
        state.admin.email = data.user.email;
        state.admin.isSuperAdmin = !!data.is_admin;
        state.user = data.user;

        localStorage.setItem('robotibr_session', JSON.stringify({
            admin: state.admin,
            user: state.user,
            lojaId: data.user.numero_wa
        }));

        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appScreen').style.display = 'flex';

        document.getElementById('sidebarUserEmail').textContent = data.user.email;
        document.getElementById('sidebarUserRole').textContent = data.is_admin ? 'Super Admin' : 'Dono da Loja';
        document.getElementById('sidebarUserAvatar').textContent = data.user.email.substring(0, 2).toUpperCase();

        toast('Bem-vindo ao RoboTI BR! ✨');
        await initLojas();
        applyPermissions();

        if (data.is_admin) {
            navigate('clientes');
        } else {
            state.lojaId = data.user.numero_wa;
            state.loja = state.lojas.find(l => l.id === state.lojaId);
            navigate('dashboard');
        }

    } catch (e) {
        if (errEl) {
            errEl.textContent = e.message;
            errEl.style.display = 'block';
        }
        toast(e.message, 'error');
    } finally {
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar no Painel';
        btn.disabled = false;
    }
}

function doLogout() {
    localStorage.removeItem('robotibr_session');
    window.location.reload();
}

function toggleMobileMenu() {
    const sidebar = document.getElementById('mobileSidebar');
    const overlay = document.getElementById('mobileOverlay');
    if (sidebar && overlay) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

// ─── CAMADA DE API ────────────────────────────────────────────────────────────

const api = {
    async get(path) {
        const r = await fetch(API + path);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    },
    async post(path, body) {
        const r = await fetch(API + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!r.ok) {
            const e = await r.json().catch(() => ({}));
            throw new Error(e.erro || e.error || 'HTTP ' + r.status);
        }
        return r.json();
    },
    async del(path) {
        const r = await fetch(API + path, { method: 'DELETE' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    },
};

// ─── HELPERS DE UI ────────────────────────────────────────────────────────────

function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast-error' : '');
    el.innerHTML = `<span style="margin-right:8px">${type === 'success' ? '✅' : '⚠️'}</span>${msg}`;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

function openModal(html) {
    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('modalOverlay').classList.add('active');
}
function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(inputId + 'Icon');
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        if (icon) icon.className = 'fas fa-eye';
    }
}

function noLojaMsg() {
    return `<div class="empty-state">
        <div class="empty-icon">🏢</div>
        <h3>Nenhum cliente selecionado</h3>
        <p>Crie ou selecione um cliente no menu lateral.</p>
        <button class="btn btn-primary" style="margin-top:20px" onclick="navigate('clientes')">Ir para Gestão de Clientes</button>
    </div>`;
}

function errMsg(e) {
    return `<div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Erro ao carregar</h3>
        <p style="font-family:monospace;font-size:12px;background:var(--muted);padding:8px 12px;border-radius:6px;margin-top:8px">${e.message}</p>
        <button class="btn btn-secondary" style="margin-top:16px" onclick="navigate('diagnostics')">Ver Diagnóstico</button>
    </div>`;
}

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── SELETOR DE LOJA ──────────────────────────────────────────────────────────

function populateLojaSelect() {
    const s = document.getElementById('lojaSelect');
    if (!s) return;
    s.innerHTML = state.lojas.length
        ? state.lojas.map(l => `<option value="${l.id}" ${l.id === state.lojaId ? 'selected' : ''}>${esc(l.nome)}</option>`).join('')
        : '<option value="">— Nenhum cliente —</option>';
}

function onLojaChange() {
    state.lojaId = document.getElementById('lojaSelect').value;
    state.loja = state.lojas.find(l => l.id === state.lojaId) || null;
    const topbar = document.getElementById('lojaNameTopbar');
    if (topbar) topbar.textContent = state.loja ? state.loja.nome : '';
    navigate(state.page === 'clientes' ? 'dashboard' : state.page);
}

// ─── ROTEADOR DE PÁGINAS ──────────────────────────────────────────────────────

const TITLES = {
    dashboard: 'Dashboard',
    agente: 'Agente & Prompt',
    rag: 'Cérebro (RAG)',
    scraping: 'Web Scraping',
    conversas: 'Caixa de Entrada',
    whatsapp: 'Conexão WhatsApp',
    clientes: 'Gestão de Clientes',
    equipe: 'Configurações da Equipe',
    diagnostics: 'Diagnóstico do Sistema',
    contatos: 'Gestão de Leads (CRM)',
    catalogo: 'Catálogo de Produtos',
    more: 'Mais',
};

const PAGES = {
    dashboard: renderDashboard,
    agente: renderAgente,
    rag: renderRAG,
    scraping: renderScraping,
    conversas: renderConversas,
    whatsapp: renderWhatsApp,
    clientes: renderClientes,
    equipe: renderEquipe,
    diagnostics: renderDiagnostics,
    contatos: renderContatos,
    catalogo: renderCatalogo,
    more: renderMore,
};

const PERMISSIONS = {
    superadmin: ['dashboard', 'agente', 'rag', 'scraping', 'conversas', 'whatsapp', 'clientes', 'equipe', 'diagnostics', 'contatos', 'catalogo', 'more'],
    admin: ['dashboard', 'agente', 'rag', 'scraping', 'conversas', 'equipe', 'contatos', 'catalogo', 'more'],
    vendedor: ['dashboard', 'agente', 'conversas', 'contatos', 'more'],
    suporte: ['dashboard', 'agente', 'conversas', 'more']
};

function applyPermissions() {
    const role = state.user?.role?.toLowerCase() || 'vendedor';
    const isAdmin = state.admin?.isSuperAdmin === true;

    const userPermissions = isAdmin ? PERMISSIONS.superadmin : (PERMISSIONS[role] || PERMISSIONS.vendedor);

    // Varre todos os itens de navegação
    Object.keys(TITLES).forEach(page => {
        const el = document.getElementById(`nav-${page}`);
        if (el) {
            if (userPermissions.includes(page)) {
                el.style.display = 'flex';
            } else {
                el.style.display = 'none';
            }
        }
    });

    // Trava o seletor de loja se não for superadmin
    const lojaSelect = document.getElementById('lojaSelect');
    if (lojaSelect) {
        if (isAdmin) {
            lojaSelect.disabled = false;
            lojaSelect.style.opacity = '1';
            lojaSelect.style.cursor = 'pointer';
        } else {
            lojaSelect.disabled = true;
            lojaSelect.style.opacity = '0.7';
            lojaSelect.style.cursor = 'not-allowed';
        }
    }
}



function navigate(page) {
    // Para timers antigos antes de mudar de página
    if (ocRefreshTimer) { clearInterval(ocRefreshTimer); ocRefreshTimer = null; }
    if (ocListTimer) { clearInterval(ocListTimer); ocListTimer = null; }

    // Verifica permissão antes de navegar
    const role = state.user?.role?.toLowerCase() || 'vendedor';
    const isAdmin = state.admin?.isSuperAdmin === true;
    const userPermissions = isAdmin ? PERMISSIONS.superadmin : (PERMISSIONS[role] || PERMISSIONS.vendedor);

    if (!userPermissions.includes(page)) {
        toast('Acesso restrito ao seu cargo.', 'error');
        if (page !== 'dashboard') navigate('dashboard');
        return;
    }

    if (waPolling && page !== 'whatsapp') { clearInterval(waPolling); waPolling = null; }

    state.page = page;

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll(`[data-page="${page}"]`).forEach(n => n.classList.add('active'));

    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = TITLES[page] || page;

    const content = document.getElementById('pageContent');
    if (content) content.innerHTML = '<div class="spinner"></div>';

    if (PAGES[page]) PAGES[page]();

    // Se entrar no chat, inicia o polling
    if (page === 'conversas') {
        ocListTimer = setInterval(ocLoadContacts, 5000);
        ocRefreshTimer = setInterval(() => {
            if (state.selectedChat) ocLoadMessages(state.selectedChat);
        }, 3000);
    }

    if (window.innerWidth <= 992) {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.classList.remove('active');
    }
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('active');
}

// ─── STATUS DO SERVIDOR ───────────────────────────────────────────────────────

async function checkServer() {
    const dot = document.getElementById('serverDot');
    const txt = document.getElementById('serverStatusText');
    const dotSb = document.getElementById('serverDotSidebar');
    const txtSb = document.getElementById('serverStatusTextSidebar');

    try {
        await api.get('/admin/lojas');
        if (dot) { dot.className = 'status-dot online'; }
        if (txt) { txt.textContent = 'Conectado'; }
        if (dotSb) { dotSb.className = 'status-dot online'; }
        if (txtSb) { txtSb.textContent = 'Servidor Online'; }
    } catch {
        if (dot) { dot.className = 'status-dot offline'; }
        if (txt) { txt.textContent = 'Offline'; }
        if (dotSb) { dotSb.className = 'status-dot offline'; }
        if (txtSb) { txtSb.textContent = 'Servidor Offline'; }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

async function renderDashboard() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }
    try {
        const [wa, docs] = await Promise.all([
            api.get('/wa/status/' + state.lojaId),
            api.get('/cliente/rag/' + state.lojaId),
        ]);

        const waStatus = wa.status === 'conectado'
            ? '<span style="color:var(--primary)">● Conectado</span>'
            : '<span style="color:var(--destructive)">○ Desconectado</span>';

        c.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label"><i class="fas fa-comments"></i> Conversas Ativas</div>
                <div class="stat-value">--</div>
                <div style="font-size:11px; color:var(--primary); margin-top:8px">↑ 12% este mês</div>
            </div>
            <div class="stat-card">
                <div class="stat-label"><i class="fas fa-user-plus"></i> Novos Leads</div>
                <div class="stat-value">--</div>
                <div style="font-size:11px; color:var(--primary); margin-top:8px">Capturados via WA</div>
            </div>
            <div class="stat-card">
                <div class="stat-label"><i class="fas fa-brain"></i> Conhecimento</div>
                <div class="stat-value">${docs.length}</div>
                <div style="font-size:11px; color:var(--muted-foreground); margin-top:8px">Documentos ativos</div>
            </div>
            <div class="stat-card">
                <div class="stat-label"><i class="fab fa-whatsapp"></i> Status WA</div>
                <div class="stat-value" style="font-size:18px; margin-top:10px">${waStatus}</div>
                <div style="font-size:11px; color:var(--muted-foreground); margin-top:8px">${esc(state.lojaId)}</div>
            </div>
        </div>

        <div class="card" style="background: linear-gradient(135deg, var(--card) 0%, #1a1f26 100%)">
            <div class="card-title">🚀 Ações Rápidas</div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px">
                <button class="btn btn-primary" onclick="navigate('whatsapp')"><i class="fab fa-whatsapp"></i> Conectar WhatsApp</button>
                <button class="btn btn-secondary" onclick="navigate('agente')"><i class="fas fa-robot"></i> Configurar IA</button>
                <button class="btn btn-secondary" onclick="navigate('rag')"><i class="fas fa-brain"></i> Treinar Cérebro</button>
                <button class="btn btn-ghost" onclick="navigate('conversas')"><i class="fas fa-comment-dots"></i> Abrir Chat</button>
            </div>
        </div>
        `;
    } catch (e) { c.innerHTML = errMsg(e); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  AGENTE & PROMPT
// ══════════════════════════════════════════════════════════════════════════════

async function renderAgente() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }
    try {
        const lojas = await api.get('/admin/lojas');
        const loja = lojas.find(l => l.id === state.lojaId) || {};
        const cfg = loja.config || {};

        c.innerHTML = `
        <div class="card">
            <div class="card-title" style="margin-bottom:20px;text-align:center">🤖 Configurar Agente IA</div>

            <div class="agente-grid">
                <div class="form-group">
                    <label class="form-label">Nome da Empresa</label>
                    <input class="form-input" id="agNome" value="${esc(loja.nome || '')}" placeholder="Ex: Clínica Sorriso">
                </div>
                <div class="form-group">
                    <label class="form-label">Nicho / Segmento</label>
                    <input class="form-input" id="agNicho" value="${esc(cfg.nicho || '')}" placeholder="Ex: Clínica Odontológica, Pet Shop...">
                </div>
                <div class="form-group">
                    <label class="form-label">Tom de Voz</label>
                    <select class="form-input form-select" id="agTom">
                        ${['Profissional e educado', 'Amigável e descontraído', 'Formal e objetivo', 'Entusiasmado e vendedor'].map(t =>
            `<option value="${t}" ${cfg.tom_voz === t ? 'selected' : ''}>${t}</option>`
        ).join('')}
                    </select>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
                <button class="btn btn-secondary" onclick="toggleField('agRegrasContainer')" style="justify-content:center;padding:12px">
                    <i class="fas fa-list-check" style="margin-right:8px"></i> Regras Estritas
                </button>
                <button class="btn btn-secondary" onclick="toggleField('agPromptContainer')" style="justify-content:center;padding:12px">
                    <i class="fas fa-terminal" style="margin-right:8px"></i> Prompt Principal
                </button>
            </div>

            <div id="agRegrasContainer" style="display:none;margin-top:20px;animation:fadeIn 0.3s ease">
                <div class="form-group">
                    <label class="form-label">Regras Estritas (Instruções Proibitivas)</label>
                    <textarea class="form-textarea" id="agRegras" style="height:120px"
                        placeholder="Ex: Nunca revelar preços sem consultar tabela. Nunca falar de concorrentes.">${esc(cfg.regras || '')}</textarea>
                </div>
            </div>

            <div id="agPromptContainer" style="display:none;margin-top:20px;animation:fadeIn 0.3s ease">
                <div class="form-group">
                    <label class="form-label">Prompt Principal — Comportamento e Personalidade</label>
                    <textarea class="form-textarea" id="agPrompt" style="height:250px"
                        placeholder="Ex: Você é a Mia, assistente virtual...">${esc(loja.prompt_base || '')}</textarea>
                </div>
            </div>

            <div style="margin-top:32px;display:flex;flex-direction:column;gap:12px;align-items:center">
                <button class="btn btn-primary" id="btnSalvarAgente" onclick="salvarAgente()" style="width:100%;max-width:300px;justify-content:center;padding:14px">
                    <i class="fas fa-save" style="margin-right:8px"></i> Salvar Configurações
                </button>
                <span id="agenteStatus" style="font-size:12px;color:var(--muted-foreground)"></span>
            </div>
        </div>

        <div class="card" style="background:var(--success-subtle);border-color:rgba(5,150,105,0.2)">
            <div class="card-title" style="margin-bottom:8px;font-size:14px;color:var(--success)">💡 Como escrever um bom prompt</div>
            <p style="font-size:13px;color:var(--muted-foreground);line-height:1.8">
                Pense como se estivesse contratando um funcionário e descrevendo a função dele:<br>
                <strong>① Quem é a empresa</strong> — nome, segmento, diferenciais.<br>
                <strong>② O que a IA deve fazer</strong> — agendar, tirar dúvidas, qualificar leads.<br>
                <strong>③ Como deve falar</strong> — tom, emoji, formalidade.<br>
                <strong>④ O que nunca deve fazer</strong> — inventar preços, mencionar concorrentes.<br><br>
                <em>"Você é a Mia, assistente virtual da PetShop Amigo Fiel. Atenda clientes de forma simpática e agende banho/tosa. Nunca invente preços — diga que vai confirmar com a equipe."</em>
            </p>
        </div>`;
    } catch (e) { c.innerHTML = errMsg(e); }
}

async function salvarAgente() {
    const nome = document.getElementById('agNome').value.trim();
    const prompt_base = document.getElementById('agPrompt').value.trim();
    const nicho = document.getElementById('agNicho').value.trim();
    const tom_voz = document.getElementById('agTom').value;
    const regras = document.getElementById('agRegras').value.trim();
    const btn = document.getElementById('btnSalvarAgente');
    const status = document.getElementById('agenteStatus');

    if (!nome) return toast('Nome da empresa é obrigatório', 'error');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true;
    try {
        await api.post('/admin/lojas/update', { wa_id: state.lojaId, nome, prompt_base, nicho, tom_voz, regras });
        toast('Configurações do agente salvas!');
        if (status) status.textContent = 'Salvo em ' + new Date().toLocaleTimeString('pt-BR');
        await initLojas();
    } catch (e) { toast(e.message, 'error'); }
    finally { btn.innerHTML = '<i class="fas fa-save"></i> Salvar Configurações'; btn.disabled = false; }
}

// ══════════════════════════════════════════════════════════════════════════════
//  BASE DE CONHECIMENTO (RAG)
// ══════════════════════════════════════════════════════════════════════════════

async function renderRAG() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }
    c.innerHTML = `
    <div class="rag-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
        <div class="card">
            <div class="card-title" style="margin-bottom:16px">✏️ Adicionar Texto Manualmente</div>
            <div class="form-group">
                <label class="form-label">Título</label>
                <input class="form-input" id="ragTitulo" placeholder="Ex: Tabela de Preços, Horários de Atendimento...">
            </div>
            <div class="form-group">
                <label class="form-label">Conteúdo</label>
                <textarea class="form-textarea" id="ragConteudo" style="height:180px"
                    placeholder="Cole aqui as informações. A IA usará este texto para responder clientes.&#10;&#10;Exemplos:&#10;- Preços e planos&#10;- Horários de funcionamento&#10;- Endereço e contatos&#10;- FAQ&#10;- Descrição de produtos/serviços"></textarea>
            </div>
            <div style="display:flex;gap:10px">
                <button class="btn btn-primary" id="btnSalvarRAG" onclick="salvarTextoRAG()">
                    <i class="fas fa-save"></i> Salvar no Banco Vetorial
                </button>
                <button class="btn btn-ghost" onclick="navigate('scraping')">
                    <i class="fas fa-globe"></i> Importar de URL
                </button>
            </div>
        </div>
        <div class="card">
            <div class="card-title" style="margin-bottom:16px">📚 Conhecimento Salvo</div>
            <div id="ragList"><div class="spinner"></div></div>
        </div>
    </div>`;
    loadRAGDocs();
}

async function loadRAGDocs() {
    const el = document.getElementById('ragList');
    if (!el) return;
    try {
        const docs = await api.get('/cliente/rag/' + state.lojaId);
        if (!docs.length) {
            el.innerHTML = `<div style="text-align:center;padding:32px 0">
                <p style="font-size:13px;color:var(--muted-foreground);margin-bottom:16px">Nenhum documento salvo ainda.</p>
                <button class="btn btn-primary" onclick="navigate('scraping')">
                    <i class="fas fa-globe"></i> Importar site do cliente
                </button>
            </div>`;
            return;
        }
        el.innerHTML = docs.map(d => `
        <div style="padding:12px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:10px;transition:border-color 0.15s">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
                <div style="flex:1;min-width:0">
                    <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.titulo)}</div>
                    <div style="font-size:11px;color:var(--muted-foreground);margin-top:4px;display:flex;gap:8px;align-items:center">
                        <span class="badge badge-default">${d.tipo === 'web_scraping' ? '🌐 Site' : '✏️ Manual'}</span>
                        ${d.url_fonte ? `<a href="${esc(d.url_fonte)}" target="_blank" style="color:var(--primary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px">${esc(d.url_fonte)}</a>` : ''}
                    </div>
                </div>
                <button class="btn btn-danger" style="padding:4px 10px;font-size:11px;flex-shrink:0" onclick="deletarRAG('${d.id}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>`).join('');
    } catch (e) { el.innerHTML = errMsg(e); }
}

async function salvarTextoRAG() {
    const titulo = document.getElementById('ragTitulo').value.trim();
    const conteudo = document.getElementById('ragConteudo').value.trim();
    if (!titulo || !conteudo) return toast('Preencha título e conteúdo', 'error');
    const btn = document.getElementById('btnSalvarRAG');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true;
    try {
        await api.post('/cliente/importar-texto', { titulo, conteudo, loja_id: state.lojaId });
        toast('Conhecimento salvo e vetorizado!');
        document.getElementById('ragTitulo').value = '';
        document.getElementById('ragConteudo').value = '';
        loadRAGDocs();
    } catch (e) { toast(e.message, 'error'); }
    finally { btn.innerHTML = '<i class="fas fa-save"></i> Salvar no Banco Vetorial'; btn.disabled = false; }
}

async function deletarRAG(id) {
    if (!confirm('Deseja excluir este documento da base de conhecimento?')) return;
    try {
        await api.del('/cliente/rag/' + id);
        toast('Documento removido.');
        loadRAGDocs();
    } catch (e) { toast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  WEB SCRAPING
// ══════════════════════════════════════════════════════════════════════════════

async function renderScraping() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }
    c.innerHTML = `
    <div class="scraping-grid">
    <div class="card">
        <div class="card-title" style="margin-bottom:6px">🌐 Importar Conhecimento de Sites</div>
        <p style="font-size:13px;color:var(--muted-foreground);margin-bottom:20px">
            Cole a URL de qualquer página do site do cliente. O sistema extrai o texto automaticamente e salva no banco vetorial.
        </p>
        <div style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end;margin-bottom:12px">
            <div class="form-group" style="margin-bottom:0">
                <label class="form-label">URL da Página</label>
                <input class="form-input" id="scrapeUrl" placeholder="https://www.sitedomeucliente.com.br/servicos" type="url">
            </div>
            <button class="btn btn-primary" onclick="executarScraping()" id="btnScrape">
                <i class="fas fa-download"></i> Importar
            </button>
        </div>
        <div class="form-group">
            <label class="form-label">Título personalizado (opcional)</label>
            <input class="form-input" id="scrapeTitulo" placeholder="Ex: Página de Serviços (deixe vazio para usar o domínio)">
        </div>
        <div id="scrapeResult"></div>
    </div>

    <div class="card">
        <div class="card-title" style="margin-bottom:12px">📋 Quais páginas importar?</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px">
            <div style="padding:14px;background:var(--success-subtle);border:1px solid rgba(5,150,105,0.15);border-radius:var(--radius)">
                <div style="font-weight:700;margin-bottom:8px;color:var(--success)">✅ Alto valor</div>
                <ul style="color:var(--muted-foreground);line-height:2;padding-left:16px">
                    <li>Serviços / produtos</li>
                    <li>Tabela de preços</li>
                    <li>Sobre a empresa</li>
                    <li>FAQ</li>
                    <li>Página de contato</li>
                </ul>
            </div>
            <div style="padding:14px;background:var(--warning-subtle);border:1px solid rgba(217,119,6,0.15);border-radius:var(--radius)">
                <div style="font-weight:700;margin-bottom:8px;color:var(--warning)">⚠️ Geralmente desnecessário</div>
                <ul style="color:var(--muted-foreground);line-height:2;padding-left:16px">
                    <li>Página inicial genérica</li>
                    <li>Blog / notícias antigas</li>
                    <li>Páginas de login</li>
                    <li>Política de privacidade</li>
                </ul>
            </div>
        </div>
    </div>

    <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div class="card-title">Base de Conhecimento Atual</div>
            <span style="font-size:13px;color:var(--muted-foreground)" id="scrapeDocCount">carregando...</span>
        </div>
        <div id="scrapeDocList"><div class="spinner"></div></div>
    </div></div>`;
    loadScrapeDocs();
}

async function loadScrapeDocs() {
    const el = document.getElementById('scrapeDocList');
    const countEl = document.getElementById('scrapeDocCount');
    if (!el) return;
    try {
        const docs = await api.get('/cliente/rag/' + state.lojaId);
        if (countEl) countEl.textContent = `${docs.length} documento${docs.length !== 1 ? 's' : ''}`;
        if (!docs.length) { el.innerHTML = '<p style="font-size:13px;color:var(--muted-foreground)">Nenhum documento salvo ainda.</p>'; return; }
        el.innerHTML = docs.map(d => `
        <div style="padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.titulo)}</div>
                ${d.url_fonte ? `<div style="font-size:11px;color:var(--muted-foreground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.url_fonte)}</div>` : ''}
            </div>
            <span class="badge badge-default" style="flex-shrink:0">${d.tipo === 'web_scraping' ? '🌐 Site' : '✏️ Manual'}</span>
            <button class="btn btn-danger" style="padding:4px 10px;font-size:11px;flex-shrink:0" onclick="deletarRAGScrape('${d.id}')">✕</button>
        </div>`).join('');
    } catch (e) { el.innerHTML = errMsg(e); }
}

async function deletarRAGScrape(id) {
    if (!confirm('Remover este documento?')) return;
    try {
        await api.del('/cliente/rag/' + id);
        toast('Documento removido.');
        loadScrapeDocs();
    } catch (e) { toast(e.message, 'error'); }
}

async function executarScraping() {
    const url = document.getElementById('scrapeUrl').value.trim();
    const titulo = document.getElementById('scrapeTitulo').value.trim() || null;
    const resultEl = document.getElementById('scrapeResult');
    const btn = document.getElementById('btnScrape');

    if (!url) return toast('Cole uma URL válida', 'error');
    try { new URL(url); } catch { return toast('URL inválida — inclua https://', 'error'); }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando...'; btn.disabled = true;
    resultEl.innerHTML = `
    <div style="padding:14px;background:var(--muted);border-radius:var(--radius);font-size:13px;color:var(--muted-foreground);margin-top:12px">
        ⏳ Acessando <strong>${esc(url)}</strong>...<br>
        <small>Isso pode levar alguns segundos.</small>
    </div>`;
    try {
        const r = await api.post('/cliente/scrape', { url, loja_id: state.lojaId, titulo });
        if (r.ok) {
            resultEl.innerHTML = `
            <div style="padding:14px;background:var(--success-subtle);border:1px solid rgba(5,150,105,0.2);border-radius:var(--radius);font-size:13px;margin-top:12px">
                ✅ <strong>Importado com sucesso!</strong><br>
                Título: <em>${esc(r.titulo)}</em> — ${r.chunks} parte${r.chunks !== 1 ? 's' : ''} salva${r.chunks !== 1 ? 's' : ''}.
            </div>`;
            document.getElementById('scrapeUrl').value = '';
            document.getElementById('scrapeTitulo').value = '';
            loadScrapeDocs();
        } else {
            resultEl.innerHTML = `<div style="padding:14px;background:var(--destructive-subtle);border:1px solid rgba(220,38,38,0.2);border-radius:var(--radius);font-size:13px;margin-top:12px;color:var(--destructive)">❌ Erro: ${esc(r.errors?.join(', ') || 'Falha desconhecida')}</div>`;
        }
    } catch (e) {
        resultEl.innerHTML = `<div style="padding:14px;background:var(--destructive-subtle);border:1px solid rgba(220,38,38,0.2);border-radius:var(--radius);font-size:13px;margin-top:12px;color:var(--destructive)">❌ ${esc(e.message)}</div>`;
    } finally {
        btn.innerHTML = '<i class="fas fa-download"></i> Importar'; btn.disabled = false;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CAIXA DE ENTRADA — OMNICHAT
// ══════════════════════════════════════════════════════════════════════════════

let _ocContacts = [];
let _ocActiveId = null;
let _ocIaStates = {};

async function renderConversas() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }

    c.innerHTML = `
    <div class="omnichat-layout" id="omnichatLayout">
        <!-- Coluna 1: Contatos -->
        <div class="oc-sidebar-panel">
            <div class="oc-panel-header">
                <span class="oc-panel-title">Caixa de Conversas</span>
                <div style="display:flex;align-items:center;gap:8px">
                    <span class="oc-counter" id="ocBadge">0</span>
                    <button class="sidebar-logout-btn" style="padding:4px" onclick="ocLoadContacts()" title="Atualizar">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
            </div>
            <div class="oc-search-bar">
                <input class="oc-search-input" type="text" id="ocSearch" placeholder="Buscar por nome ou número..." oninput="ocFilterContacts(this.value)">
            </div>
            <div class="oc-contact-list" id="ocContactList">
                <div class="spinner" style="margin:24px auto"></div>
            </div>
        </div>

        <!-- Coluna 2: Chat -->
        <div class="oc-chat-panel" id="ocChatPanel">
            <div class="empty-state" style="height:100%; display:flex; flex-direction:column; justify-content:center">
                <div style="font-size:48px; opacity:0.1; margin-bottom:16px"><i class="fas fa-comment-dots"></i></div>
                <h3 style="font-size:16px; color:var(--muted-foreground)">Selecione uma conversa</h3>
                <p style="font-size:12px; color:var(--sidebar-muted)">Clique em um contato na lateral para gerenciar o atendimento.</p>
            </div>
        </div>

        <!-- Coluna 3: CRM Profile -->
        <div class="oc-crm-panel" id="ocCrmPanel">
            <div style="text-align:center; padding-top:40px; color:var(--sidebar-muted)">
                <i class="fas fa-user-circle" style="font-size:48px; opacity:0.1; margin-bottom:12px"></i>
                <div style="font-size:12px">Perfil do Lead</div>
            </div>
        </div>
    </div>`;

    _ocActiveId = null;
    await ocLoadContacts();

    if (ocRefreshTimer) clearInterval(ocRefreshTimer);
    ocRefreshTimer = setInterval(() => {
        if (state.page === 'conversas') ocLoadContacts();
    }, 3000); // Polling acelerado para 3s
}

function ocInitials(name) {
    return String(name || '?').split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

async function ocLoadContacts() {
    try {
        const data = await api.get('/chat/conversas/' + state.lojaId);
        _ocContacts = Array.isArray(data) ? data : [];
        _ocContacts.forEach(c => {
            if (_ocIaStates[c.id] === undefined) _ocIaStates[c.id] = c.ia_ativa !== false;
        });
        const badge = document.getElementById('ocBadge');
        if (badge) badge.textContent = _ocContacts.length;
        ocRenderContactList(_ocContacts);
        if (_ocActiveId) ocSilentRefreshMessages(_ocActiveId);
    } catch (e) {
        const el = document.getElementById('ocContactList');
        if (el) el.innerHTML = `<div style="padding:20px;font-size:13px;color:var(--muted-foreground);text-align:center">
            <div style="margin-bottom:8px">⚠️ Sem conversas ainda</div>
            <div style="font-size:12px">As conversas aparecerão aqui assim que clientes enviarem mensagens via WhatsApp.</div>
        </div>`;
    }
}

function ocRenderContactList(list) {
    const el = document.getElementById('ocContactList');
    if (!el) return;
    if (!list.length) {
        el.innerHTML = `<div style="padding:32px 16px;text-align:center;font-size:13px;color:var(--muted-foreground)">
            Nenhuma conversa encontrada
        </div>`;
        return;
    }
    el.innerHTML = list.map(c => {
        const ia = _ocIaStates[c.id] !== false;
        const active = _ocActiveId === c.id;
        const when = c.atualizado_em
            ? new Date(c.atualizado_em).toLocaleDateString('pt-BR') === new Date().toLocaleDateString('pt-BR')
                ? new Date(c.atualizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : 'Ontem'
            : '';

        const badgeHtml = ia
            ? `<span class="crm-score-badge" style="font-size:9px; padding:2px 6px">IA ATIVA</span>`
            : `<span class="crm-score-badge" style="font-size:9px; padding:2px 6px; background:var(--warning); color:#000">AGUARDANDO</span>`;

        return `<div class="oc-contact-item${active ? ' active' : ''}" onclick="ocSelectContact('${esc(c.id)}')">
            <div class="sidebar-user-avatar" style="width:40px; height:40px; font-size:12px; margin-right:12px">${ocInitials(c.nome)}</div>
            <div class="oc-contact-body">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px">
                    <div class="oc-contact-name">${esc(c.nome || c.numero_cliente)}</div>
                    <span class="oc-contact-time" style="font-size:10px">${when}</span>
                </div>
                <div class="oc-contact-preview" style="font-size:12px; margin-bottom:6px">${esc(c.ultima_msg || '—')}</div>
                ${badgeHtml}
            </div>
        </div>`;
    }).join('');
}

function ocFilterContacts(q) {
    const filtered = _ocContacts.filter(c =>
        (c.nome || '').toLowerCase().includes(q.toLowerCase()) ||
        (c.numero_cliente || '').includes(q)
    );
    ocRenderContactList(filtered);
}

async function ocSelectContact(id) {
    _ocActiveId = id;
    ocRenderContactList(_ocContacts);

    const layout = document.getElementById('omnichatLayout');
    if (layout) layout.classList.add('chat-open');

    const panel = document.getElementById('ocChatPanel');
    if (!panel) return;
    const contact = _ocContacts.find(c => c.id === id);
    if (!contact) return;
    const ia = _ocIaStates[id] !== false;

    panel.innerHTML = `
    <div class="oc-chat-header">
        <button class="oc-back-btn" onclick="backToContacts()"><i class="fas fa-arrow-left"></i></button>
        <div class="sidebar-user-avatar" style="width:40px; height:40px; margin-right:12px">${ocInitials(contact.nome)}</div>
        <div style="flex:1">
            <div style="font-size:15px; font-weight:700; color:var(--foreground)">${esc(contact.nome || contact.numero_cliente)}</div>
            <div style="font-size:11px; color:var(--sidebar-muted)">${esc(contact.numero_cliente)}</div>
        </div>
        <button class="oc-ia-toggle-btn${!ia ? ' off' : ''}" id="ocIaBtn_${esc(id)}" onclick="ocToggleIA('${esc(id)}')">
            <div class="oc-switch${!ia ? ' off' : ''}"></div>
            <span id="ocIaLabel_${esc(id)}">${ia ? 'IA ativa' : 'IA pausada'}</span>
        </button>
    </div>

    <div class="oc-messages-area" id="ocMsgs_${esc(id)}">
        <div class="spinner" style="margin:40px auto"></div>
    </div>

    <div class="oc-quick-actions">
        <button class="btn-quick" onclick="ocSendQuick('Saudação', '${esc(id)}')">👋 Saudação</button>
        <button class="btn-quick" onclick="ocSendQuick('Catálogo', '${esc(id)}')">📂 Catálogo</button>
        <button class="btn-quick" onclick="ocSendQuick('Pix', '${esc(id)}')">💰 Pix</button>
        <button class="btn-quick" onclick="ocSendQuick('Aguardar Atendente', '${esc(id)}')">👨‍💻 Aguardar</button>
    </div>

    <div class="oc-composer" style="padding:20px; background:var(--card); border-top:1px solid var(--border); display:flex; gap:12px; align-items:end">
        <button class="btn-logout" style="padding:10px; border-radius:10px" title="Anexar"><i class="fas fa-paperclip"></i></button>
        <textarea class="form-input" id="ocInput_${esc(id)}" 
            placeholder="Digite sua mensagem aqui..." 
            style="min-height:44px; max-height:150px; border-radius:12px; resize:none"
            onkeydown="ocHandleKey(event,'${esc(id)}')"
            oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
        <button class="btn btn-primary" style="height:44px; width:44px; padding:0" onclick="ocSendMessage('${esc(id)}')">
            <i class="fas fa-paper-plane"></i>
        </button>
    </div>`;

    ocRenderCrmProfile(contact.numero_cliente);
    await ocLoadMessages(id);
}

function backToContacts() {
    const layout = document.getElementById('omnichatLayout');
    if (layout) layout.classList.remove('chat-open');
    _ocActiveId = null;
}

async function ocRenderCrmProfile(telefone) {
    const el = document.getElementById('ocCrmPanel');
    if (!el) return;
    el.innerHTML = '<div class="spinner" style="margin:40px auto"></div>';

    try {
        const crm = await api.get(`/chat/contato/${state.lojaId}/${telefone}`);

        el.innerHTML = `
        <div class="crm-section" style="text-align:center; margin-bottom:32px">
            <div class="sidebar-user-avatar" style="width:80px; height:80px; font-size:24px; margin:0 auto 16px">${ocInitials(crm.nome || telefone)}</div>
            <div style="font-size:18px; font-weight:700; color:var(--foreground)">${esc(crm.nome || 'Lead s/ Nome')}</div>
            <div style="font-size:12px; color:var(--sidebar-muted)">${esc(telefone)}</div>
        </div>

        <div class="crm-section">
            <div class="crm-label">Status do CRM</div>
            <div class="crm-value"><span class="crm-score-badge">${esc(crm.status || 'Lead')}</span></div>
        </div>

        <div class="crm-section">
            <div class="crm-label">Intenção de Compra</div>
            <div class="crm-value" style="color:var(--primary)">Alta - Consultando Preço</div>
        </div>

        <div class="crm-section">
            <div class="crm-label">Lead Score</div>
            <div class="crm-value">🔥 ${crm.lead_score || 0} / 100</div>
        </div>

        <div class="crm-section">
            <div class="crm-label">Memória do Contato</div>
            <div class="crm-memory-box">
                ${esc(crm.memoria_ia || 'A IA ainda não gerou um resumo para este contato.')}
            </div>
        </div>

        <div style="margin-top:auto; padding-top:20px">
            <button class="btn btn-secondary" style="width:100%; justify-content:center; margin-bottom:10px" onclick="toast('Em breve: Editar dados CRM')">
                <i class="fas fa-edit" style="margin-right:8px"></i> Editar Perfil
            </button>
            <button class="btn btn-primary" style="width:100%; justify-content:center" onclick="ocToggleIA('${esc(telefone)}')">
                <i class="fas fa-hand-holding-hand" style="margin-right:8px"></i> Assumir Atendimento
            </button>
        </div>`;
    } catch (e) {
        el.innerHTML = `<div style="padding:20px; font-size:12px; color:var(--destructive)">Erro ao carregar CRM.</div>`;
    }
}

async function ocSendQuick(type, id) {
    const inp = document.getElementById('ocInput_' + id);
    if (!inp) return;
    let text = '';
    if (type === 'Saudação') text = 'Olá! Tudo bem? Como posso te ajudar hoje?';
    if (type === 'Catálogo') text = 'Vou te enviar nosso catálogo de produtos atualizado. Um momento...';
    if (type === 'Pix') text = 'Nossa chave Pix é o nosso CNPJ: 12.345.678/0001-90';
    if (type === 'Aguardar Atendente') text = 'Um de nossos especialistas já vai te atender. Por favor, aguarde um momento.';

    inp.value = text;
    inp.focus();
}

async function ocLoadMessages(id) {
    const el = document.getElementById('ocMsgs_' + id);
    if (!el) return;
    try {
        const msgs = await api.get(`/chat/mensagens/${state.lojaId}/${id}`);
        if (!msgs.length) {
            el.innerHTML = `<div style="text-align:center;padding:40px;font-size:13px;color:var(--muted-foreground)">Nenhuma mensagem ainda.</div>`;
            return;
        }
        el.innerHTML = msgs.map(m => renderBubble(m)).join('');
        el.scrollTop = el.scrollHeight;
    } catch (e) {
        el.innerHTML = `<div style="padding:20px;font-size:13px;color:var(--muted-foreground)">Erro: ${esc(e.message)}</div>`;
    }
}

async function ocSilentRefreshMessages(id) {
    const el = document.getElementById('ocMsgs_' + id);
    if (!el) return;
    try {
        const msgs = await api.get(`/chat/mensagens/${state.lojaId}/${id}`);
        if (!msgs.length) return;
        const wasAtBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 60;
        el.innerHTML = msgs.map(m => renderBubble(m)).join('');
        if (wasAtBottom) el.scrollTop = el.scrollHeight;
    } catch { }
}

function renderBubble(m) {
    let bubbleClass = '';
    let icon = '';
    let label = '';

    if (m.remetente_tipo === 'user') {
        bubbleClass = 'user';
    } else if (m.remetente_tipo === 'assistant' || m.remetente_tipo === 'bot') {
        bubbleClass = 'assistant';
        icon = '<i class="fas fa-robot" style="margin-right:4px;font-size:10px"></i>';
        label = 'IA';
    } else {
        bubbleClass = 'human';
        icon = '<i class="fas fa-user-tie" style="margin-right:4px;font-size:10px"></i>';
        label = 'Você';
    }

    return `
    <div class="oc-msg-row ${bubbleClass}">
        <div class="oc-bubble ${bubbleClass}">
            <div style="font-size:10px;font-weight:700;margin-bottom:2px;opacity:0.7;display:flex;align-items:center">
                ${icon} ${label}
            </div>
            ${esc(m.conteudo).replace(/\n/g, '<br>')}
        </div>
        <div class="oc-msg-time">${new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
    </div>`;
}

async function ocToggleIA(id) {
    _ocIaStates[id] = !_ocIaStates[id];
    const ia = _ocIaStates[id];
    const sw = document.querySelector(`#ocIaBtn_${id} .oc-switch`);
    const lbl = document.getElementById(`ocIaLabel_${id}`);
    const btn = document.getElementById(`ocIaBtn_${id}`);
    const banner = document.getElementById(`ocBanner_${id}`);
    if (sw) sw.className = 'oc-switch' + (ia ? '' : ' off');
    if (lbl) lbl.textContent = ia ? 'IA ativa' : 'IA pausada';
    if (btn) btn.className = 'oc-ia-toggle-btn' + (ia ? '' : ' off');
    if (banner) banner.className = 'oc-handoff-banner' + (ia ? '' : ' visible');
    ocRenderContactList(_ocContacts);
    try {
        await api.post('/chat/toggle-ia', { loja_id: state.lojaId, numero_cliente: id, ia_ativa: ia });
        toast(ia ? '✅ IA reativada para este contato.' : '⏸️ IA pausada — modo manual ativo.');
    } catch (e) { toast(e.message, 'error'); }
}

function ocCloseChat() {
    const layout = document.getElementById('omnichatLayout');
    if (layout) layout.classList.remove('chat-open');
    _ocActiveId = null;
    ocRenderContactList(_ocContacts);
}

async function ocSendMessage(id) {
    const inp = document.getElementById('ocInput_' + id);
    const sendBtn = document.getElementById('ocSendBtn_' + id);
    if (!inp || !inp.value.trim()) return;
    const text = inp.value.trim();
    inp.value = '';
    inp.style.height = 'auto';

    _ocIaStates[id] = false;
    const sw = document.querySelector(`#ocIaBtn_${id} .oc-switch`);
    const lbl = document.getElementById(`ocIaLabel_${id}`);
    const btn = document.getElementById(`ocIaBtn_${id}`);
    const banner = document.getElementById(`ocBanner_${id}`);
    if (sw) sw.className = 'oc-switch off';
    if (lbl) lbl.textContent = 'IA pausada';
    if (btn) btn.className = 'oc-ia-toggle-btn off';
    if (banner) banner.className = 'oc-handoff-banner visible';

    const msgsArea = document.getElementById('ocMsgs_' + id);
    const tempId = 'temp-' + Date.now();
    if (msgsArea) {
        msgsArea.innerHTML += renderBubble({
            remetente_tipo: 'humano',
            conteudo: text,
            criado_em: new Date().toISOString(),
            _tempId: tempId
        });
        msgsArea.scrollTop = msgsArea.scrollHeight;
    }

    if (sendBtn) { sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; sendBtn.disabled = true; }
    try {
        await api.post('/chat/send-manual', {
            numero_wa: state.lojaId,
            telefone_cliente: id,
            mensagem: text,
        });

        const cont = _ocContacts.find(x => x.id === id);
        if (cont) { cont.ultima_msg = text; cont.atualizado_em = new Date().toISOString(); }
        ocRenderContactList(_ocContacts);
    } catch (e) {
        toast('Erro: ' + e.message, 'error');
        inp.value = text;
    } finally {
        if (sendBtn) { sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>'; sendBtn.disabled = false; }
    }
}

function ocHandleKey(e, id) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ocSendMessage(id); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CONEXÃO WHATSAPP
// ══════════════════════════════════════════════════════════════════════════════

async function renderWhatsApp() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }
    if (waPolling) { clearInterval(waPolling); waPolling = null; }

    c.innerHTML = `
    <div class="whatsapp-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start">
        <div class="card wa-status-card" id="waStatusCard"><div class="spinner"></div></div>
        <div>
            <div class="card">
                <div class="card-title" style="margin-bottom:16px">📱 Conectar Dispositivo</div>
                <div style="font-size:13px;color:var(--muted-foreground);margin-bottom:20px;line-height:2">
                    <strong>Passo 1:</strong> Clique em "Gerar Código"<br>
                    <strong>Passo 2:</strong> Abra o WhatsApp no celular<br>
                    <strong>Passo 3:</strong> Vá em <strong>Aparelhos Conectados → Conectar com número</strong><br>
                    <strong>Passo 4:</strong> Digite o código de 8 dígitos
                </div>
                <div class="form-group">
                    <label class="form-label">Número do Cliente (ID)</label>
                    <input class="form-input" id="waNumero" value="${esc(state.lojaId)}" disabled style="background:var(--muted);font-weight:700;font-family:'JetBrains Mono',monospace">
                </div>
                <div id="pairingCodeBox" style="display:none;margin-bottom:20px">
                    <label class="form-label">Código de Pareamento</label>
                    <div class="pairing-code" id="pairingCodeValue" title="Clique para copiar"
                        onclick="navigator.clipboard.writeText(this.textContent.replace(/-/g,''));toast('Código copiado!')">----</div>
                    <p style="font-size:12px;color:var(--muted-foreground);text-align:center;margin-top:8px">Clique no código para copiar</p>
                </div>
                <div style="display:flex;flex-direction:column;gap:8px">
                    <button class="btn btn-primary" style="justify-content:center" onclick="conectarWA()" id="btnWA">
                        <i class="fab fa-whatsapp"></i> Gerar Código de Pareamento
                    </button>
                    <button class="btn btn-danger" style="justify-content:center;display:none" onclick="desconectarWA()" id="btnDesconectar">
                        <i class="fas fa-unlink"></i> Desconectar WhatsApp
                    </button>
                </div>
            </div>
        </div>
    </div>`;

    loadWAStatus();
    waPolling = setInterval(loadWAStatus, 4000);
}

async function loadWAStatus() {
    try {
        const wa = await api.get('/wa/status/' + state.lojaId);
        const card = document.getElementById('waStatusCard');
        if (!card) { clearInterval(waPolling); waPolling = null; return; }
        const btnWA = document.getElementById('btnWA');
        const btnD = document.getElementById('btnDesconectar');
        const pairingBox = document.getElementById('pairingCodeBox');

        if (wa.status === 'conectado') {
            card.innerHTML = `
            <div class="wa-status-icon">📱</div>
            <div style="font-size:20px;font-weight:700;color:var(--success);font-family:'Space Grotesk',sans-serif">Conectado!</div>
            <div style="font-size:13px;color:var(--muted-foreground);margin:8px 0">Número: ${esc(wa.numero)}</div>
            <span class="badge badge-success" style="margin-top:4px">● Operante — IA respondendo</span>`;
            if (btnWA) btnWA.style.display = 'none';
            if (btnD) btnD.style.display = 'flex';
            if (pairingBox) pairingBox.style.display = 'none';
        } else if (wa.status === 'aguardando') {
            card.innerHTML = `
            <div class="wa-status-icon">⏳</div>
            <div style="font-size:18px;font-weight:700;font-family:'Space Grotesk',sans-serif">Aguardando Pareamento</div>
            <div style="font-size:13px;color:var(--muted-foreground);margin-top:10px">Digite o código no WhatsApp do celular.</div>`;
            if (wa.pairingCode) {
                const val = document.getElementById('pairingCodeValue');
                if (val) val.textContent = wa.pairingCode;
                if (pairingBox) pairingBox.style.display = 'block';
            }
        } else {
            card.innerHTML = `
            <div class="wa-status-icon">🔌</div>
            <div style="font-size:18px;font-weight:700;font-family:'Space Grotesk',sans-serif">Desconectado</div>
            <div style="font-size:13px;color:var(--muted-foreground);margin-top:10px">Gere o código para conectar o WhatsApp.</div>`;
            if (btnWA) btnWA.style.display = 'flex';
            if (btnD) btnD.style.display = 'none';
        }
    } catch { /* silencioso */ }
}

async function conectarWA() {
    const numero = document.getElementById('waNumero').value;
    const btn = document.getElementById('btnWA');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aguardando...'; btn.disabled = true;
    try {
        const r = await api.post('/wa/connect', { numero });
        if (r.pairingCode) {
            const box = document.getElementById('pairingCodeBox');
            const val = document.getElementById('pairingCodeValue');
            if (val) val.textContent = r.pairingCode;
            if (box) box.style.display = 'block';
            toast('Código gerado! Digite-o no WhatsApp.');
        } else if (r.status === 'ja_conectado') {
            toast('Este cliente já está conectado!');
        }
    } catch (e) { toast(e.message, 'error'); }
    finally { btn.innerHTML = '<i class="fab fa-whatsapp"></i> Gerar Código de Pareamento'; btn.disabled = false; }
}

async function desconectarWA() {
    if (!confirm('Deseja desconectar o WhatsApp deste cliente?')) return;
    try {
        await api.post('/wa/disconnect', { numero: state.lojaId });
        toast('WhatsApp desconectado.');
        renderWhatsApp();
    } catch (e) { toast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  GESTÃO DE CLIENTES
// ══════════════════════════════════════════════════════════════════════════════

async function renderClientes() {
    const c = document.getElementById('pageContent');
    c.innerHTML = `
    <div class="card" style="margin-bottom:24px">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:20px; flex-wrap:wrap">
            <div style="flex:1; min-width:200px">
                <div class="card-title" style="margin-bottom:4px">Gestão de Clientes</div>
                <div style="font-size:13px; color:var(--muted-foreground)">Gerencie instâncias e configurações de cada empresa.</div>
            </div>
            
            <!-- SEARCH ENGINE: CLIENTES -->
            <div style="position:relative; width:100%; max-width:340px">
                <i class="fas fa-search" style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--muted-foreground); font-size:13px"></i>
                <input type="text" class="form-input" id="searchClientes" 
                    placeholder="Buscar empresa ou ID..." 
                    style="padding-left:40px; border-radius:100px; background:var(--muted); height:42px"
                    oninput="ocFilterGlobalList('searchClientes', 'clientesListBody', 'tr')">
            </div>

            <button class="btn btn-primary" onclick="openModalNovaLoja()" style="height:42px; border-radius:100px; padding:0 24px">
                <i class="fas fa-plus"></i> Novo Cliente
            </button>
        </div>
    </div>

    <div class="card" style="padding:0; overflow:hidden">
        <div id="clientesList"><div class="spinner"></div></div>
    </div>`;
    loadClientes();
}

async function loadClientes() {
    const el = document.getElementById('clientesList');
    try {
        const lojas = await api.get('/admin/lojas');
        state.lojas = lojas;
        if (!lojas.length) {
            el.innerHTML = `<div style="text-align:center; padding:32px; font-size:13px; color:var(--muted-foreground)">
                Nenhum cliente cadastrado ainda.<br>
                <button class="btn btn-primary" style="margin-top:16px" onclick="openModalNovaLoja()">+ Criar primeiro cliente</button>
            </div>`;
            return;
        }
        el.innerHTML = `
        <div class="table-responsive">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Empresa</th>
                        <th>WhatsApp ID</th>
                        <th>Status</th>
                        <th style="text-align:right">Ações</th>
                    </tr>
                </thead>
                <tbody id="clientesListBody">
                    ${lojas.map(l => `
                    <tr>
                        <td>
                            <div style="display:flex;align-items:center;gap:12px">
                                <div style="background:var(--primary-subtle);border:1px solid rgba(197,160,89,0.2);border-radius:8px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--primary);flex-shrink:0">
                                    ${l.nome.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <div style="font-weight:700;font-size:14px">${esc(l.nome)}</div>
                                    <div style="font-size:11px;color:var(--muted-foreground)">Desde ${new Date(l.criado_em || Date.now()).toLocaleDateString('pt-BR')}</div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <code style="background:var(--muted);padding:4px 8px;border-radius:4px;font-size:12px;font-family:'JetBrains Mono',monospace">${esc(l.wa_id)}</code>
                        </td>
                        <td>
                            <div style="display:flex;align-items:center;gap:6px">
                                <div class="status-dot ${l.ativa ? 'online' : 'offline'}"></div>
                                <span style="font-size:12px;font-weight:600;color:${l.ativa ? 'var(--success)' : 'var(--muted-foreground)'}">
                                    ${l.ativa ? 'Ativo' : 'Inativo'}
                                </span>
                            </div>
                        </td>
                        <td style="text-align:right">
                            <div style="display:flex;gap:8px;justify-content:flex-end">
                                <button class="btn btn-primary" style="padding:6px 12px;font-size:12px" onclick="selecionarCliente('${esc(l.id)}')" title="Selecionar">
                                    <i class="fas fa-external-link-alt"></i>
                                </button>
                                <button class="btn btn-ghost" style="padding:6px 12px;font-size:12px" onclick="editarCliente('${esc(l.id)}')" title="Editar">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-danger" style="padding:6px 12px;font-size:12px" onclick="excluirCliente('${esc(l.id)}')" title="Excluir">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
    } catch (e) { el.innerHTML = errMsg(e); }
}

function selecionarCliente(id) {
    state.lojaId = id;
    state.loja = state.lojas.find(l => l.id === id) || null;
    const sel = document.getElementById('lojaSelect');
    if (sel) sel.value = id;
    const topbar = document.getElementById('lojaNameTopbar');
    if (topbar && state.loja) topbar.textContent = state.loja.nome;
    toast('✅ Cliente selecionado: ' + (state.loja?.nome || id));
    navigate('dashboard');
}

async function excluirCliente(id) {
    if (!confirm('⚠️ TEM CERTEZA? Isso excluirá permanentemente o cliente, conversas e a base de conhecimento.')) return;
    try {
        await api.del('/admin/lojas/' + id);
        toast('🗑️ Cliente excluído com sucesso!');
        await initLojas();
        loadClientes();
        if (state.lojaId === id) {
            state.lojaId = state.lojas.length ? state.lojas[0].id : null;
            state.loja = state.lojas.length ? state.lojas[0] : null;
            populateLojaSelect();
        }
    } catch (e) { toast(e.message, 'error'); }
}

function editarCliente(id) {
    const loja = state.lojas.find(l => l.id === id);
    if (!loja) return;
    openModal(`
    <div style="margin-bottom:24px">
        <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px">✏️ Editar Cliente</div>
        <div style="font-size:13px;color:var(--muted-foreground)">Atualize os dados básicos da empresa.</div>
    </div>

    <div class="form-group">
        <label class="form-label">Nome da Empresa</label>
        <input class="form-input" id="eNome" value="${esc(loja.nome)}">
    </div>
    <div class="form-group">
        <label class="form-label">Número WhatsApp (ID)</label>
        <div style="display:flex;gap:8px">
            <input class="form-input" value="${esc(loja.wa_id)}" disabled style="background:var(--muted);font-family:'JetBrains Mono',monospace;flex:1">
            <div style="padding:10px;background:var(--muted);border-radius:6px;color:var(--muted-foreground);font-size:14px;display:flex;align-items:center">
                <i class="fas fa-lock"></i>
            </div>
        </div>
        <small style="color:var(--muted-foreground);margin-top:6px;display:block">O ID do WhatsApp não pode ser alterado após o cadastro.</small>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:32px">
        <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarEdicaoCliente('${esc(id)}')">
            <i class="fas fa-save"></i> Salvar Alterações
        </button>
    </div>`);
}

async function salvarEdicaoCliente(id) {
    const nome = document.getElementById('eNome').value.trim();
    if (!nome) return toast('Nome é obrigatório', 'error');
    try {
        await api.post('/admin/lojas/update', { wa_id: id, nome });
        toast('Cliente atualizado!');
        closeModal();
        await initLojas();
        loadClientes();
    } catch (e) { toast(e.message, 'error'); }
}

function openModalNovaLoja() {
    openModal(`
    <div style="margin-bottom:24px">
        <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px">🏢 Novo Cliente</div>
        <div style="font-size:13px;color:var(--muted-foreground)">Cadastre uma nova empresa e configure o bot inicial.</div>
    </div>

    <div class="form-group">
        <label class="form-label">Nome da Empresa</label>
        <input class="form-input" id="mNome" placeholder="Ex: Clínica Sorriso">
    </div>
    <div class="form-group">
        <label class="form-label">Número do WhatsApp (ID)</label>
        <input class="form-input" id="mWaId" placeholder="5511999999999" style="font-family:'JetBrains Mono',monospace">
        <small style="color:var(--muted-foreground);margin-top:6px;display:block">Use apenas números com DDD (ex: 5511...)</small>
    </div>
    <div class="form-group">
        <label class="form-label">Prompt inicial da IA</label>
        <textarea class="form-textarea" id="mPrompt" style="height:100px"
            placeholder="Ex: Você é a assistente virtual da Clínica Sorriso..."></textarea>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:32px">
        <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="btnCriarLoja" onclick="criarLoja()">
            <i class="fas fa-plus"></i> Criar Cliente
        </button>
    </div>`);
}

async function criarLoja() {
    const nome = document.getElementById('mNome').value.trim();
    const wa_id = document.getElementById('mWaId').value.trim().replace(/\D/g, '');
    const prompt_base = document.getElementById('mPrompt').value.trim();
    if (!nome || !wa_id) return toast('Nome e número WhatsApp são obrigatórios', 'error');
    const btn = document.getElementById('btnCriarLoja');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando...'; btn.disabled = true;
    try {
        await api.post('/admin/lojas', { nome, wa_id, prompt_base });
        toast('✅ Cliente criado com sucesso!');
        closeModal();
        await initLojas();
        state.lojaId = wa_id;
        state.loja = state.lojas.find(l => l.id === wa_id) || null;
        populateLojaSelect();
        navigate('agente');
    } catch (e) { toast(e.message, 'error'); btn.innerHTML = '<i class="fas fa-plus"></i> Criar Cliente'; btn.disabled = false; }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CONFIGURAÇÕES DA EQUIPE
// ══════════════════════════════════════════════════════════════════════════════

async function renderEquipe() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }

    // Dados mock enquanto a API não existe — serão substituídos pela resposta real
    const mockUsers = [
        { id: '1', nome: 'João Silva', email: 'joao@empresa.com', cargo: 'Admin', criado_em: new Date(Date.now() - 86400000 * 30).toISOString() },
        { id: '2', nome: 'Maria Santos', email: 'maria@empresa.com', cargo: 'Vendedor', criado_em: new Date(Date.now() - 86400000 * 15).toISOString() },
        { id: '3', nome: 'Carlos Oliveira', email: 'carlos@empresa.com', cargo: 'Suporte', criado_em: new Date(Date.now() - 86400000 * 7).toISOString() },
    ];

    let users = mockUsers;
    try {
        const data = await api.get('/admin/equipe/' + state.lojaId);
        if (Array.isArray(data) && data.length) users = data;
    } catch { /* usa mock */ }

    const cargoBadge = cargo => ({
        'Admin': 'badge-danger',
        'Vendedor': 'badge-warning',
        'Suporte': 'badge-default',
    }[cargo] || 'badge-default');

    function ocFilterGlobalList(inputId, targetBodyId, rowSelector) {
        const q = document.getElementById(inputId).value.toLowerCase();
        const rows = document.querySelectorAll(`#${targetBodyId} ${rowSelector}`);
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(q) ? '' : 'none';
        });
    }

    const cargoIcon = cargo => ({
        'Admin': '👑',
        'Vendedor': '💼',
        'Suporte': '🎧',
    }[cargo] || '👤');

    const admins = users.filter(u => u.cargo === 'Admin').length;
    const operators = users.filter(u => u.cargo !== 'Admin').length;

    c.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:24px">
        <div>
            <h2 style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.03em;color:var(--foreground)">
                Configurações da Equipe
            </h2>
            <p style="font-size:13px;color:var(--muted-foreground);margin-top:4px">
                Gerencie os membros, permissões e acessos ao painel.
            </p>
        </div>
        <button class="btn btn-primary" onclick="openModalConvidarUsuario()">
            <i class="fas fa-user-plus"></i> Convidar Usuário
        </button>
    </div>

    <div class="stats-grid" style="margin-bottom:24px">
        <div class="stat-card">
            <div class="stat-label"><i class="fas fa-users" style="color:var(--primary)"></i> Total de Membros</div>
            <div class="stat-value">${users.length}</div>
            <div class="stat-trend">Equipe ativa</div>
        </div>
        <div class="stat-card">
            <div class="stat-label"><i class="fas fa-shield-alt" style="color:var(--primary)"></i> Administradores</div>
            <div class="stat-value">${admins}</div>
            <div class="stat-trend">Acesso total</div>
        </div>
        <div class="stat-card">
            <div class="stat-label"><i class="fas fa-headset" style="color:var(--primary)"></i> Operadores</div>
            <div class="stat-value">${operators}</div>
            <div class="stat-trend">Vendedores + Suporte</div>
        </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px">
            <div class="card-title">Membros da Equipe</div>
            
            <!-- SEARCH ENGINE: EQUIPE -->
            <div style="position:relative; width:100%; max-width:300px">
                <i class="fas fa-search" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--muted-foreground); font-size:12px"></i>
                <input type="text" class="form-input" id="searchEquipe" 
                    placeholder="Buscar por nome ou e-mail..." 
                    style="padding-left:34px; border-radius:100px; background:var(--muted); height:36px; font-size:12px"
                    oninput="ocFilterGlobalList('searchEquipe', 'equipeListBody', 'tr')">
            </div>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Usuário</th>
                        <th>E-mail</th>
                        <th>Cargo</th>
                        <th>Membro desde</th>
                        <th style="text-align:right">Ações</th>
                    </tr>
                </thead>
                <tbody id="equipeListBody">
                    ${users.map(u => `
                    <tr>
                        <td>
                            <div style="display:flex;align-items:center;gap:10px">
                                <div style="width:36px;height:36px;border-radius:50%;background:var(--primary-subtle);border:1px solid rgba(197,160,89,0.2);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--primary);flex-shrink:0">
                                    ${(u.nome || 'U').substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <div style="font-weight:700;font-size:14px">${esc(u.nome)}</div>
                                    <div style="font-size:11px;color:var(--muted-foreground);margin-top:1px">${cargoIcon(u.cargo)}</div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <span style="font-size:13px;color:var(--muted-foreground)">${esc(u.email)}</span>
                        </td>
                        <td>
                            <span class="badge ${cargoBadge(u.cargo)}">${esc(u.cargo)}</span>
                        </td>
                        <td style="font-size:12px;color:var(--muted-foreground)">
                            ${new Date(u.criado_em || Date.now()).toLocaleDateString('pt-BR')}
                        </td>
                        <td style="text-align:right">
                            <div style="display:flex;gap:6px;justify-content:flex-end">
                                <button class="btn btn-ghost" style="padding:5px 10px;font-size:12px"
                                    onclick="editarUsuarioEquipe('${esc(u.id)}','${esc(u.nome)}','${esc(u.email)}','${esc(u.cargo)}')"
                                    title="Editar">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-danger" style="padding:5px 10px;font-size:12px"
                                    onclick="removerUsuarioEquipe('${esc(u.id)}','${esc(u.nome)}')"
                                    title="Remover">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>
    </div>

    <div class="card" style="background:var(--primary-subtle);border-color:rgba(197,160,89,0.2);margin-top:0">
        <div class="card-title" style="font-size:14px;margin-bottom:10px">🔐 Níveis de Permissão</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px">
            <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
                <div style="font-weight:700;font-size:13px;margin-bottom:6px">👑 Admin</div>
                <div style="font-size:12px;color:var(--muted-foreground);line-height:1.7">Acesso total: configurações, equipe, clientes e relatórios.</div>
            </div>
            <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
                <div style="font-weight:700;font-size:13px;margin-bottom:6px">💼 Vendedor</div>
                <div style="font-size:12px;color:var(--muted-foreground);line-height:1.7">Caixa de entrada, Base de Conhecimento e Dashboard.</div>
            </div>
            <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
                <div style="font-weight:700;font-size:13px;margin-bottom:6px">🎧 Suporte</div>
                <div style="font-size:12px;color:var(--muted-foreground);line-height:1.7">Somente Caixa de Entrada — visualiza e responde conversas.</div>
            </div>
        </div>
    </div>`;
}

function openModalConvidarUsuario() {
    openModal(`
    <div style="margin-bottom:24px">
        <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px">Convidar Usuário</div>
        <div style="font-size:13px;color:var(--muted-foreground)">Adicione um novo membro à equipe de atendimento.</div>
    </div>

    <div class="form-group">
        <label class="form-label">Nome Completo</label>
        <input class="form-input" id="euNome" placeholder="Ex: Ana Carvalho">
    </div>
    <div class="form-group">
        <label class="form-label">E-mail</label>
        <input class="form-input" id="euEmail" type="email" placeholder="ana@suaempresa.com">
    </div>
    <div class="form-group">
        <label class="form-label">Senha Inicial</label>
        <div class="input-with-toggle">
            <input class="form-input" id="euSenha" type="password" placeholder="Mínimo 8 caracteres">
            <button class="input-toggle-btn" type="button" onclick="togglePasswordVisibility('euSenha')">
                <i class="fas fa-eye" id="euSenhaIcon"></i>
            </button>
        </div>
    </div>
    <div class="form-group">
        <label class="form-label">Cargo / Permissão</label>
        <select class="form-input form-select" id="euCargo">
            <option value="Suporte">🎧 Suporte — Visualiza e responde conversas</option>
            <option value="Vendedor">💼 Vendedor — Gerencia leads e conversas</option>
            <option value="Admin">👑 Admin — Acesso total ao painel</option>
        </select>
    </div>

    <div style="background:var(--primary-subtle);border:1px solid rgba(197,160,89,0.2);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:24px;font-size:12px;color:var(--muted-foreground);line-height:1.7">
        <strong style="color:var(--foreground)">ℹ️ Sobre as permissões:</strong><br>
        A senha inicial deve ser alterada pelo usuário no primeiro acesso.<br>
        Admins têm acesso irrestrito — conceda com critério.
    </div>

    <div style="display:flex;justify-content:flex-end;gap:12px">
        <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="btnConvidar" onclick="convidarUsuario()">
            <i class="fas fa-user-plus"></i> Convidar
        </button>
    </div>`);
}

async function convidarUsuario() {
    const nome = document.getElementById('euNome').value.trim();
    const email = document.getElementById('euEmail').value.trim();
    const senha = document.getElementById('euSenha').value;
    const cargo = document.getElementById('euCargo').value;

    if (!nome || !email || !senha) return toast('Preencha todos os campos', 'error');
    if (senha.length < 8) return toast('A senha deve ter ao menos 8 caracteres', 'error');

    const btn = document.getElementById('btnConvidar');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Convidando...'; btn.disabled = true;

    try {
        await api.post('/admin/equipe/convidar', { nome, email, senha, cargo, loja_id: state.lojaId });
        toast(`✅ ${nome} adicionado à equipe!`);
        closeModal();
        renderEquipe();
    } catch (e) {
        toast(e.message || 'Erro ao convidar usuário', 'error');
    } finally {
        if (btn) { btn.innerHTML = '<i class="fas fa-user-plus"></i> Convidar'; btn.disabled = false; }
    }
}

function editarUsuarioEquipe(id, nome, email, cargo) {
    openModal(`
    <div style="margin-bottom:24px">
        <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px">Editar Membro</div>
        <div style="font-size:13px;color:var(--muted-foreground)">Atualize as informações e permissões de <strong>${esc(nome)}</strong>.</div>
    </div>

    <div class="form-group">
        <label class="form-label">Nome Completo</label>
        <input class="form-input" id="emNome" value="${esc(nome)}">
    </div>
    <div class="form-group">
        <label class="form-label">E-mail</label>
        <input class="form-input" id="emEmail" value="${esc(email)}" disabled style="background:var(--muted);opacity:0.7">
        <small style="color:var(--muted-foreground);margin-top:4px;display:block">O e-mail não pode ser alterado.</small>
    </div>
    <div class="form-group">
        <label class="form-label">Cargo / Permissão</label>
        <select class="form-input form-select" id="emCargo">
            <option value="Suporte"  ${cargo === 'Suporte' ? 'selected' : ''}>🎧 Suporte</option>
            <option value="Vendedor" ${cargo === 'Vendedor' ? 'selected' : ''}>💼 Vendedor</option>
            <option value="Admin"    ${cargo === 'Admin' ? 'selected' : ''}>👑 Admin</option>
        </select>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:32px">
        <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarEdicaoUsuario('${esc(id)}')">
            <i class="fas fa-save"></i> Salvar Alterações
        </button>
    </div>`);
}

async function salvarEdicaoUsuario(id) {
    const nome = document.getElementById('emNome').value.trim();
    const cargo = document.getElementById('emCargo').value;
    if (!nome) return toast('Nome é obrigatório', 'error');
    try {
        await api.post('/admin/equipe/update', { id, nome, cargo, loja_id: state.lojaId });
        toast('Membro atualizado com sucesso!');
        closeModal();
        renderEquipe();
    } catch (e) {
        toast(e.message || 'Erro ao atualizar', 'error');
    }
}

async function removerUsuarioEquipe(id, nome) {
    if (!confirm(`Deseja remover ${nome} da equipe? Esta ação não pode ser desfeita.`)) return;
    try {
        await api.del('/admin/equipe/' + id);
        toast(`${nome} removido da equipe.`);
        renderEquipe();
    } catch (e) {
        toast(e.message || 'Erro ao remover membro', 'error');
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  DIAGNÓSTICO
// ══════════════════════════════════════════════════════════════════════════════

async function renderDiagnostics() {
    const c = document.getElementById('pageContent');
    c.innerHTML = `
    <div class="card">
        <div class="card-title" style="margin-bottom:8px">🔧 Diagnóstico do Sistema</div>
        <p style="font-size:13px;color:var(--muted-foreground);margin-bottom:20px">
            Verifica conectividade com os LLMs (Groq, Gemini), Supabase e a base RAG do cliente selecionado.
        </p>
        <button class="btn btn-primary" onclick="executarDiagnostico()" id="btnDiag">
            <i class="fas fa-play"></i> Executar Diagnóstico
        </button>
        <div id="diagResult" style="margin-top:24px"></div>
    </div>

    <div class="card">
        <div class="card-title" style="margin-bottom:12px">ℹ️ Informações da Sessão</div>
        <div style="font-size:13px;line-height:2.2;font-family:'JetBrains Mono',monospace">
            <div>Cliente ativo: <strong style="color:var(--primary)">${esc(state.lojaId || 'nenhum')}</strong></div>
            <div>Servidor: <strong>${API}</strong></div>
            <div>Versão: <strong>4.0</strong></div>
            <div>Tema: <strong id="diagTheme">${document.documentElement.getAttribute('data-theme') || 'light'}</strong></div>
        </div>
    </div>`;
}

async function executarDiagnostico() {
    const btn = document.getElementById('btnDiag');
    const el = document.getElementById('diagResult');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...'; btn.disabled = true;
    el.innerHTML = '<div class="spinner"></div>';
    try {
        const id = state.lojaId || 'nenhum';
        const d = await api.get('/admin/diagnostics/' + id);
        const icon = v => {
            if (typeof v === 'string' && (v.startsWith('ok') || v.includes('documentos') || v === 'chave configurada')) return '✅';
            if (v === 'chave não configurada') return '⚠️';
            return '❌';
        };
        el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div style="padding:16px;background:var(--muted);border-radius:var(--radius);font-size:13px;line-height:2.2;border:1px solid var(--border)">
                <div style="font-weight:700;margin-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--primary)">LLMs</div>
                <div>${icon(d.llm?.groq)} Groq: <code style="background:var(--card);padding:2px 6px;border-radius:4px;font-family:'JetBrains Mono',monospace">${d.llm?.groq}</code></div>
                <div>${icon(d.llm?.gemini)} Gemini: <code style="background:var(--card);padding:2px 6px;border-radius:4px;font-family:'JetBrains Mono',monospace">${d.llm?.gemini}</code></div>
                <div>${icon(d.llm?.openrouter)} OpenRouter: <code style="background:var(--card);padding:2px 6px;border-radius:4px;font-family:'JetBrains Mono',monospace">${d.llm?.openrouter || '—'}</code></div>
            </div>
            <div style="padding:16px;background:var(--muted);border-radius:var(--radius);font-size:13px;line-height:2.2;border:1px solid var(--border)">
                <div style="font-weight:700;margin-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--primary)">Supabase & RAG</div>
                <div>${icon(d.supabase?.agentes_config)} agentes_config: <code style="background:var(--card);padding:2px 6px;border-radius:4px;font-family:'JetBrains Mono',monospace">${d.supabase?.agentes_config}</code></div>
                <div>${icon(d.rag?.documentos)} Documentos: <code style="background:var(--card);padding:2px 6px;border-radius:4px;font-family:'JetBrains Mono',monospace">${d.rag?.documentos}</code></div>
                <div>${icon(d.rag?.rpc_buscar_conhecimento)} Função RPC: <code style="background:var(--card);padding:2px 6px;border-radius:4px;font-family:'JetBrains Mono',monospace">${d.rag?.rpc_buscar_conhecimento}</code></div>
            </div>
        </div>
        <div style="font-size:11px;color:var(--muted-foreground);margin-top:12px">Verificado em: ${d.timestamp}</div>`;
    } catch (e) {
        el.innerHTML = `<div style="padding:14px;background:var(--destructive-subtle);border:1px solid rgba(220,38,38,0.2);border-radius:var(--radius);font-size:13px;color:var(--destructive)">${e.message}</div>`;
    } finally { btn.innerHTML = '<i class="fas fa-play"></i> Executar Diagnóstico'; btn.disabled = false; }
}

// ══════════════════════════════════════════════════════════════════════════════
//  MORE (mobile)
// ══════════════════════════════════════════════════════════════════════════════

async function renderMore() {
    const c = document.getElementById('pageContent');
    const isAdmin = state.admin?.isSuperAdmin === true;
    const roleLabel = isAdmin ? '👑 Super Admin' : (state.user?.role === 'admin' ? '💼 Dono da Loja' : '💼 Gestor');

    // Mapeamento de ícones e descrições para o menu "Mais"
    const menuConfig = {
        agente: { icon: 'fa-robot', title: 'Agente & Prompt', sub: 'Comportamento da IA' },
        rag: { icon: 'fa-brain', title: 'Cérebro (RAG)', sub: 'Base de conhecimento' },
        scraping: { icon: 'fa-globe', title: 'Web Scraping', sub: 'Extração de dados' },
        whatsapp: { icon: 'fa-whatsapp', title: 'WhatsApp', sub: 'Conexão e status' },
        clientes: { icon: 'fa-building', title: 'Gestão de Clientes', sub: 'Administrar lojas' },
        equipe: { icon: 'fa-user-shield', title: 'Permissões', sub: 'Membros e cargos' },
        diagnostics: { icon: 'fa-tools', title: 'Diagnóstico', sub: 'Saúde do sistema' },
        contatos: { icon: 'fa-users', title: 'Leads', sub: 'Gestão de contatos' },
        catalogo: { icon: 'fa-shopping-bag', title: 'Catálogo', sub: 'Produtos e preços' }
    };

    const role = state.user?.role?.toLowerCase() || 'vendedor';
    const userPermissions = isAdmin ? PERMISSIONS.superadmin : (PERMISSIONS[role] || PERMISSIONS.vendedor);

    // Filtrar páginas que já estão na bottom nav para não repetir (dashboard, whatsapp, conversas, rag)
    const hiddenPages = ['dashboard', 'conversas', 'whatsapp', 'rag', 'more'];
    const extraPages = userPermissions.filter(p => !hiddenPages.includes(p));

    let menuHtml = '';
    extraPages.forEach(page => {
        const conf = menuConfig[page];
        if (conf) {
            menuHtml += `
            <div class="more-item" onclick="navigate('${page}')">
                <i class="fas ${conf.icon}"></i>
                <div class="more-item-content">
                    <div class="more-item-title">${conf.title}</div>
                    <div class="more-item-sub">${conf.sub}</div>
                </div>
                <i class="fas fa-chevron-right more-arrow"></i>
            </div>`;
        }
    });

    c.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:14px;background:var(--secondary)">
            <div class="sidebar-user-avatar" style="width:50px;height:50px;font-size:18px">${(state.user?.email || 'AD').substring(0, 2).toUpperCase()}</div>
            <div>
                <div style="font-weight:700;font-size:16px">${esc(state.user?.email || '')}</div>
                <div style="font-size:12px;color:var(--muted-foreground)">${roleLabel}</div>
            </div>
        </div>

        <div class="more-menu">
            ${menuHtml}
            
            <div class="more-item" onclick="toggleTheme()">
                <i class="fas fa-adjust"></i>
                <div class="more-item-content">
                    <div class="more-item-title">Alternar Tema</div>
                    <div class="more-item-sub">Modo claro / escuro</div>
                </div>
                <i class="fas fa-chevron-right more-arrow"></i>
            </div>

            <div class="more-item" onclick="window.location.reload()">
                <i class="fas fa-sync"></i>
                <div class="more-item-content">
                    <div class="more-item-title">Recarregar Painel</div>
                    <div class="more-item-sub">Atualizar dados</div>
                </div>
                <i class="fas fa-chevron-right more-arrow"></i>
            </div>
            
            <div class="more-item" onclick="doLogout()" style="color:var(--destructive)">
                <i class="fas fa-sign-out-alt"></i>
                <div class="more-item-content">
                    <div class="more-item-title">Sair</div>
                    <div class="more-item-sub">Encerrar sessão</div>
                </div>
                <i class="fas fa-chevron-right more-arrow"></i>
            </div>
        </div>
    </div>

    <div class="card" style="margin-top:16px">
        <div class="card-title" style="margin-bottom:16px">Status do Sistema</div>
        <div style="display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--muted);border-radius:8px;border:1px solid var(--border)">
                <div style="font-size:13px;font-weight:600">Servidor Backend</div>
                <div style="display:flex;align-items:center;gap:8px">
                    <div id="serverDotMore" class="status-dot online"></div>
                    <span id="serverStatusTextMore" style="font-size:12px;color:var(--muted-foreground)">Conectado</span>
                </div>
            </div>
            <div style="font-size:11px;color:var(--muted-foreground);text-align:center">
                Versão 4.0.5 — RoboTI BR by WavePod
            </div>
        </div>
    </div>`;

    try {
        await api.get('/admin/lojas');
        const dot = document.getElementById('serverDotMore');
        const txt = document.getElementById('serverStatusTextMore');
        if (dot) dot.className = 'status-dot online';
        if (txt) txt.textContent = 'Online';
    } catch {
        const dot = document.getElementById('serverDotMore');
        const txt = document.getElementById('serverStatusTextMore');
        if (dot) dot.className = 'status-dot offline';
        if (txt) txt.textContent = 'Offline';
    }
}

function toggleField(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const isHidden = el.style.display === 'none';
    if (isHidden) {
        document.getElementById('agRegrasContainer').style.display = 'none';
        document.getElementById('agPromptContainer').style.display = 'none';
    }
    el.style.display = isHidden ? 'block' : 'none';
    if (isHidden) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ─── INICIALIZAÇÃO ──────────────────────────────────────────────────────────


async function initLojas() {
    try {
        const lojas = await api.get('/admin/lojas');
        state.lojas = lojas;
        if (lojas.length && !state.lojaId) {
            state.lojaId = lojas[0].id;
            state.loja = lojas[0];
        }
        populateLojaSelect();
        const topbar = document.getElementById('lojaNameTopbar');
        if (topbar) topbar.textContent = state.loja ? state.loja.nome : '';
    } catch (e) { console.error('[RoboTI] Erro ao carregar lojas:', e); }
} async function renderContatos() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }
    c.innerHTML = `<div class="card">
        <div class="card-title">Gestão de Leads (CRM)</div>
        <p style="color:var(--muted-foreground); margin-bottom: 24px">Leads capturados e qualificados pela IA.</p>
        <div class="empty-state">
            <div class="empty-icon" style="color:var(--primary); font-size: 48px"><i class="fas fa-users"></i></div>
            <h3>Módulo em Integração</h3>
            <p>Estamos sincronizando os dados da tabela <code>contatos_crm</code> com o painel.</p>
        </div>
    </div>`;
}

async function renderCatalogo() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }

    try {
        const produtos = await api.get('/cliente/catalogo/' + state.lojaId);

        c.innerHTML = `
        <div class="card" style="margin-bottom:24px">
            <div style="display:flex; justify-content:space-between; align-items:center">
                <div>
                    <h2 class="card-title" style="margin-bottom:4px">Catálogo de Produtos</h2>
                    <p style="font-size:13px; color:var(--muted-foreground)">Gerencie os produtos que a IA está autorizada a consultar e oferecer.</p>
                </div>
                <button class="btn btn-primary" onclick="openModalProduto()">
                    <i class="fas fa-plus"></i> Novo Produto
                </button>
            </div>
        </div>

        <div class="card">
            <div style="overflow-x:auto">
                <table style="width:100%; border-collapse:collapse; font-size:14px">
                    <thead>
                        <tr style="border-bottom:1px solid var(--border); text-align:left">
                            <th style="padding:16px; color:var(--sidebar-muted); font-size:11px; text-transform:uppercase">Produto</th>
                            <th style="padding:16px; color:var(--sidebar-muted); font-size:11px; text-transform:uppercase">SKU</th>
                            <th style="padding:16px; color:var(--sidebar-muted); font-size:11px; text-transform:uppercase">Preço</th>
                            <th style="padding:16px; color:var(--sidebar-muted); font-size:11px; text-transform:uppercase">IA</th>
                            <th style="padding:16px; color:var(--sidebar-muted); font-size:11px; text-transform:uppercase; text-align:right">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="catalogoList">
                        ${produtos.map(p => `
                            <tr style="border-bottom:1px solid var(--border)">
                                <td style="padding:16px">
                                    <div style="font-weight:600">${esc(p.nome_produto)}</div>
                                    <div style="font-size:12px; color:var(--muted-foreground)">${esc(p.descricao || '')}</div>
                                </td>
                                <td style="padding:16px; font-family:'JetBrains Mono'">${esc(p.sku || '--')}</td>
                                <td style="padding:16px; font-weight:700; color:var(--primary)">R$ ${Number(p.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td style="padding:16px">
                                    <span class="crm-score-badge" style="background:${p.disponivel_para_ia ? 'var(--primary-glow)' : 'var(--muted)'}; color:${p.disponivel_para_ia ? 'var(--primary)' : 'var(--sidebar-muted)'}">
                                        ${p.disponivel_para_ia ? 'AUTORIZADO' : 'OCULTO'}
                                    </span>
                                </td>
                                <td style="padding:16px; text-align:right">
                                    <button class="btn-logout" onclick="openModalProduto('${p.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                                    <button class="btn-logout" style="color:var(--destructive)" onclick="deleteProduto('${p.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                        ${!produtos.length ? '<tr><td colspan="5" style="padding:40px; text-align:center; color:var(--sidebar-muted)">Nenhum produto cadastrado.</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>`;
    } catch (e) { c.innerHTML = errMsg(e); }
}

async function openModalProduto(id = null) {
    let p = { nome_produto: '', descricao: '', preco: '', sku: '', disponivel_para_ia: true };
    if (id) {
        try {
            const produtos = await api.get('/cliente/catalogo/' + state.lojaId);
            p = produtos.find(item => item.id === id) || p;
        } catch (e) { toast('Erro ao carregar produto', 'error'); return; }
    }

    const html = `
    <h2 class="card-title" style="margin-bottom:24px">${id ? 'Editar' : 'Novo'} Produto</h2>
    <div class="form-group">
        <label>Nome do Produto</label>
        <input type="text" class="form-input" id="p_nome" value="${esc(p.nome_produto)}" placeholder="Ex: iPhone 15 Pro">
    </div>
    <div class="form-group">
        <label>SKU (Código)</label>
        <input type="text" class="form-input" id="p_sku" value="${esc(p.sku)}" placeholder="Ex: IPH15P-256">
    </div>
    <div class="form-group">
        <label>Preço (R$)</label>
        <input type="number" step="0.01" class="form-input" id="p_preco" value="${p.preco}" placeholder="0,00">
    </div>
    <div class="form-group">
        <label>Descrição para a IA</label>
        <textarea class="form-textarea" id="p_desc" placeholder="Detalhes técnicos, cores, garantias...">${esc(p.descricao)}</textarea>
    </div>
    <div class="form-group" style="display:flex; align-items:center; gap:10px">
        <input type="checkbox" id="p_ia" ${p.disponivel_para_ia ? 'checked' : ''} style="width:20px; height:20px; accent-color:var(--primary)">
        <label style="margin:0">Disponível para consulta da IA</label>
    </div>
    <div style="display:flex; gap:12px; margin-top:32px">
        <button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="saveProduto('${id || ''}')">Salvar Produto</button>
    </div>`;
    openModal(html);
}

async function saveProduto(id) {
    const payload = {
        id: id || undefined,
        numero_wa: state.lojaId,
        nome_produto: document.getElementById('p_nome').value,
        sku: document.getElementById('p_sku').value,
        preco: parseFloat(document.getElementById('p_preco').value) || 0,
        descricao: document.getElementById('p_desc').value,
        disponivel_para_ia: document.getElementById('p_ia').checked
    };

    if (!payload.nome_produto) { toast('Nome é obrigatório', 'error'); return; }

    try {
        await api.post('/cliente/catalogo', payload);
        toast('✅ Produto salvo com sucesso!');
        closeModal();
        renderCatalogo();
    } catch (e) { toast(e.message, 'error'); }
}

async function deleteProduto(id) {
    if (!confirm('Deseja realmente excluir este produto?')) return;
    try {
        await api.delete('/cliente/catalogo/' + id);
        toast('🗑️ Produto excluído.');
        renderCatalogo();
    } catch (e) { toast(e.message, 'error'); }
}





function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';

    html.setAttribute('data-theme', next);
    localStorage.setItem('robotibr_theme', next);
    _applyThemeIcons(next);
    toast(`Modo ${next === 'dark' ? 'Escuro' : 'Claro'} ativado`);
}

function _applyThemeIcons(theme) {
    const isDark = theme === 'dark';

    // Login Screen icons
    const loginIcon = document.getElementById('loginThemeIcon');
    const loginLabel = document.getElementById('loginThemeLabel');
    if (loginIcon) loginIcon.textContent = isDark ? '☀️' : '🌙';
    if (loginLabel) loginLabel.textContent = isDark ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro';

    // Topbar icon
    const topbarIcon = document.getElementById('themeToggleIcon');
    if (topbarIcon) topbarIcon.textContent = isDark ? '☀️' : '🌙';
}

async function init() {
    // 1. Aplica tema salvo (o anti-flash no HTML já aplica, mas atualizamos ícones aqui)
    const savedTheme = localStorage.getItem('robotibr_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    _applyThemeIcons(savedTheme);

    // 2. Verifica sessão salva
    const saved = localStorage.getItem('robotibr_session');
    if (saved) {
        try {
            const session = JSON.parse(saved);
            state.admin = session.admin;
            state.user = session.user;
            state.lojaId = session.lojaId;

            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('appScreen').style.display = 'flex';

            document.getElementById('sidebarUserEmail').textContent = state.user.email;

            const isAdmin = state.admin?.isSuperAdmin === true;
            const roleLabel = isAdmin ? 'Super Admin' : (state.user.role === 'admin' ? 'Dono da Loja' : (state.user.role.charAt(0).toUpperCase() + state.user.role.slice(1)));

            document.getElementById('sidebarUserRole').textContent = roleLabel;
            document.getElementById('sidebarUserAvatar').textContent =
                state.user.email.substring(0, 2).toUpperCase();

            applyPermissions();
        } catch {
            localStorage.removeItem('robotibr_session');
        }
    }

    // 3. Fecha modal ao clicar fora
    const overlay = document.getElementById('modalOverlay');
    if (overlay) {
        overlay.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeModal();
        });
    }

    // 4. Polling de status do servidor
    checkServer();
    setInterval(checkServer, 15000);

    // 5. Carrega lojas
    await initLojas();

    // 6. Rota inicial
    if (state.admin.logado || saved) {
        const isAdmin = state.admin?.email === 'diegoasilvestre@live.com';
        navigate(isAdmin ? 'clientes' : 'dashboard');
    }
}

document.addEventListener('DOMContentLoaded', init);