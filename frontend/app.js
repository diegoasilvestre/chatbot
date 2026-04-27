/**
 * app.js — Nexus Bot AI Dashboard Engine
 */

// Se estiver rodando localmente (localhost ou 127.0.0.1), aponte para o IP da VM.
// Caso contrário, use caminhos relativos (mesmo servidor).
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://129.151.46.223:4000'  // Substitua pelo IP real se este não for o atual
    : '';

const SUPABASE_URL = 'https://blznrercpctblwbalovv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsem5yZXJjcGN0Ymx3YmFsb3Z2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njg0MDUzNiwiZXhwIjoyMDkyNDE2NTM2fQ.5FXZkvJ11gG5qtmVqEnu2h-fk8vhx5ShRJqaa2KJwmo';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let activeTab = 'dashboard';

// ─── INICIALIZAÇÃO ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    initLogin();
    initNavigation();
    checkServerStatus();
});

function checkSession() {
    const session = localStorage.getItem('nexus_session');
    if (session) {
        currentUser = JSON.parse(session);
        showDashboard();
    } else {
        showLogin();
    }
}

function checkServerStatus() {
    const dot = document.getElementById('server-status-dot');
    const text = document.getElementById('server-status-text');
    
    fetch(API_BASE + '/wa/status/ping').then(() => {
        dot.classList.add('online');
        text.innerText = 'Servidor Online';
    }).catch(() => {
        dot.classList.remove('online');
        text.innerText = 'Servidor Offline';
    });
}

// ─── NAVEGAÇÃO ───────────────────────────────────────────────────────────────
function initNavigation() {
    document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
        item.onclick = () => {
            const tab = item.getAttribute('data-tab');
            renderView(tab);
        };
    });
}

function showLogin() {
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('dashboard-page').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('dashboard-page').classList.remove('hidden');
    document.getElementById('user-display').innerText = currentUser.user.email;
    
    // Mostra/Esconde área administrativa
    if (currentUser.is_admin) {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    }

    loadClientSelector();
    renderView('dashboard');
}

async function loadClientSelector() {
    const selector = document.getElementById('client-selector');
    selector.innerHTML = '<option value="">Selecione um cliente...</option>';

    if (currentUser.is_admin) {
        const res = await fetch(API_BASE + '/admin/lojas');
        const lojas = await res.json();
        lojas.forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.wa_id;
            opt.innerText = l.nome;
            if (currentUser.numero_wa === l.wa_id) opt.selected = true;
            selector.appendChild(opt);
        });
    } else if (currentUser.numero_wa) {
        const opt = document.createElement('option');
        opt.value = currentUser.numero_wa;
        opt.innerText = currentUser.config?.nome || currentUser.numero_wa;
        opt.selected = true;
        selector.appendChild(opt);
    }

    selector.onchange = (e) => {
        currentUser.numero_wa = e.target.value;
        localStorage.setItem('nexus_session', JSON.stringify(currentUser));
        renderView(activeTab); // Recarrega a view atual com o novo cliente
    };
}

function renderSidebar() {
    document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
        if (item.getAttribute('data-tab') === activeTab) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

async function renderView(tab) {
    activeTab = tab;
    renderSidebar();
    
    const main = document.getElementById('main-view');
    const title = document.getElementById('current-view-title');
    
    // Mapeamento de Títulos
    const titles = {
        'dashboard': 'Dashboard de Insights',
        'config': 'Agente & Prompt',
        'rag': 'Base de Conhecimento',
        'scrape': 'Web Scraping',
        'omnichat': 'Caixa de Entrada',
        'whatsapp': 'Conexão WhatsApp',
        'gestao': 'Gestão de Clientes',
        'diagnostics': 'Diagnóstico do Sistema'
    };
    title.innerText = titles[tab] || tab;
    
    main.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--muted);"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</div>';

    if (!currentUser.numero_wa && !['gestao', 'dashboard'].includes(tab)) {
        main.innerHTML = `
            <div class="card" style="text-align: center; max-width: 500px; margin: 4rem auto;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🏢</div>
                <h2>Nenhum cliente selecionado</h2>
                <p style="color: var(--muted); margin-bottom: 1.5rem;">Selecione um cliente no menu à esquerda para gerenciar.</p>
                <button class="btn-primary" onclick="renderView('gestao')">Ir para Gestão de Clientes</button>
            </div>
        `;
        return;
    }

    switch (tab) {
        case 'dashboard': await viewDashboard(main); break;
        case 'config': await viewConfig(main); break;
        case 'rag': await viewRAG(main); break;
        case 'scrape': await viewScrape(main); break;
        case 'omnichat': await viewOmnichat(main); break;
        case 'whatsapp': await viewWhatsApp(main); break;
        case 'gestao': await viewGestao(main); break;
        case 'diagnostics': await viewDiagnostics(main); break;
    }
}

// ─── AUTH ────────────────────────────────────────────────────────────────────
function initLogin() {
    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('login-error');

        try {
            const res = await fetch(API_BASE + '/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (res.ok) {
                currentUser = data;
                localStorage.setItem('nexus_session', JSON.stringify(data));
                showDashboard();
            } else {
                errorDiv.innerText = data.erro || 'Erro ao entrar';
                errorDiv.classList.remove('hidden');
            }
        } catch (err) {
            errorDiv.innerText = 'Falha na conexão com o servidor';
            errorDiv.classList.remove('hidden');
        }
    });

    document.getElementById('btn-logout').onclick = () => {
        localStorage.removeItem('nexus_session');
        window.location.reload();
    };
}

// ─── VIEWS ───────────────────────────────────────────────────────────────────

async function viewDashboard(container) {
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
            <div class="card">
                <div style="color: var(--muted); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-bottom: 0.5rem;">Total de Mensagens</div>
                <div id="stat-total" style="font-size: 2rem; font-weight: 800;">...</div>
            </div>
            <div class="card">
                <div style="color: var(--muted); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-bottom: 0.5rem;">Interações Usuário</div>
                <div id="stat-user" style="font-size: 2rem; font-weight: 800; color: var(--primary);">...</div>
            </div>
            <div class="card">
                <div style="color: var(--muted); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-bottom: 0.5rem;">Respostas IA</div>
                <div id="stat-ai" style="font-size: 2rem; font-weight: 800; color: #6366f1;">...</div>
            </div>
        </div>
        <div class="card">
            <h3>Bem-vindo ao Roboti BR</h3>
            <p style="color: var(--muted);">Utilize o menu lateral para gerenciar seus assistentes e bases de conhecimento.</p>
        </div>
    `;

    if (currentUser.numero_wa) {
        try {
            const res = await fetch(API_BASE + `/tenant/stats/${currentUser.numero_wa}`);
            const data = await res.json();
            document.getElementById('stat-total').innerText = data.total_mensagens || 0;
            document.getElementById('stat-user').innerText = data.mensagens_usuario || 0;
            document.getElementById('stat-ai').innerText = data.mensagens_ai || 0;
        } catch { }
    } else {
        ['stat-total', 'stat-user', 'stat-ai'].forEach(id => document.getElementById(id).innerText = '0');
    }
}

async function viewConfig(container) {
    const config = currentUser.config || { prompt_base: '', nicho: '', tom_voz: '', regras: '' };
    container.innerHTML = `
        <div class="card">
            <div class="form-group">
                <label>Nicho / Segmento</label>
                <input type="text" id="cfg-nicho" class="input-field" value="${config.nicho || ''}" placeholder="Ex: Pizzaria, Advocacia...">
            </div>
            <div class="form-group" style="margin-top: 1rem;">
                <label>Tom de Voz</label>
                <input type="text" id="cfg-tom" class="input-field" value="${config.tom_voz || ''}" placeholder="Ex: Formal, Amigável...">
            </div>
            <div class="form-group" style="margin-top: 1rem;">
                <label>Prompt Base (Instruções Principais)</label>
                <textarea id="cfg-prompt" class="input-field" style="height: 150px;">${config.prompt_base || ''}</textarea>
            </div>
            <div class="form-group" style="margin-top: 1rem;">
                <label>Regras Adicionais</label>
                <textarea id="cfg-regras" class="input-field" style="height: 100px;">${config.regras || ''}</textarea>
            </div>
            <button id="btn-cfg-save" class="btn-primary" style="margin-top: 1.5rem;">Salvar Alterações</button>
            <div id="cfg-status" style="margin-top: 1rem; font-size: 0.8rem;"></div>
        </div>
    `;

    document.getElementById('btn-cfg-save').onclick = async () => {
        const status = document.getElementById('cfg-status');
        status.innerText = '⏳ Salvando...';
        
        const updates = {
            wa_id: currentUser.numero_wa,
            nicho: document.getElementById('cfg-nicho').value,
            tom_voz: document.getElementById('cfg-tom').value,
            prompt_base: document.getElementById('cfg-prompt').value,
            regras: document.getElementById('cfg-regras').value
        };

        const res = await fetch(API_BASE + '/tenant/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });

        if (res.ok) {
            status.innerHTML = '<span style="color: var(--primary)">✅ Configurações salvas com sucesso!</span>';
            currentUser.config = { ...currentUser.config, ...updates };
            localStorage.setItem('nexus_session', JSON.stringify(currentUser));
        } else {
            status.innerText = '❌ Erro ao salvar.';
        }
    };
}

async function viewWhatsApp(container) {
    container.innerHTML = `
        <div class="card" style="max-width: 600px; margin: 0 auto; text-align: center;">
            <p style="margin-bottom: 2rem;">Conecte seu WhatsApp para que o assistente possa responder mensagens automaticamente.</p>
            
            <div id="wa-connection-status" style="margin: 1rem 0; font-size: 1.25rem; font-weight: 700;">Verificando status...</div>
            
            <div style="margin-top: 2rem;">
                <button id="btn-wa-connect" class="btn-primary" style="padding: 1rem 2rem; font-size: 1rem;">
                    <i class="fa-solid fa-qrcode"></i> Gerar Código de Pareamento
                </button>
            </div>

            <div id="wa-pairing-area" class="hidden">
                <div class="pairing-code-box" id="wa-code">---- ----</div>
                <p style="color: var(--muted); font-size: 0.875rem;">Digite este código no seu WhatsApp:<br><strong>Aparelhos Conectados > Conectar com número de telefone</strong></p>
            </div>
            
            <div style="margin-top: 3rem; padding-top: 2rem; border-top: 1px solid var(--border);">
                <button id="btn-wa-disconnect" style="background: transparent; border: 1px solid #ef4444; color: #ef4444; padding: 0.5rem 1rem; border-radius: var(--radius); cursor: pointer;">
                    Desconectar WhatsApp
                </button>
            </div>
        </div>
    `;

    const statusDiv = document.getElementById('wa-connection-status');
    const updateStatus = async () => {
        try {
            const r = await fetch(API_BASE + `/wa/status/${currentUser.numero_wa}`);
            const s = await r.json();
            statusDiv.innerText = s.status === 'conectado' ? '✅ WHATSAPP CONECTADO' : '❌ DESCONECTADO';
            statusDiv.style.color = s.status === 'conectado' ? 'var(--primary)' : '#ef4444';
        } catch { }
    };
    updateStatus();

    document.getElementById('btn-wa-connect').onclick = async () => {
        statusDiv.innerText = '⏳ Gerando código...';
        const res = await fetch(API_BASE + '/wa/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ numero: currentUser.numero_wa })
        });
        const data = await res.json();
        if (data.pairingCode) {
            document.getElementById('wa-pairing-area').classList.remove('hidden');
            document.getElementById('wa-code').innerText = data.pairingCode;
            statusDiv.innerText = '🔑 Código Gerado';
        }
    };

    document.getElementById('btn-wa-disconnect').onclick = async () => {
        if (confirm('Tem certeza que deseja desconectar?')) {
            await fetch(API_BASE + '/wa/disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ numero: currentUser.numero_wa })
            });
            updateStatus();
        }
    };
}

async function viewRAG(container) {
    container.innerHTML = `
        <div class="card">
            <h3>Adicionar Novo Conhecimento</h3>
            <div class="form-group" style="margin-top: 1rem;">
                <label>Título do Documento</label>
                <input type="text" id="rag-titulo" class="input-field" placeholder="Ex: Política de Reembolso">
            </div>
            <div class="form-group" style="margin-top: 1rem;">
                <label>Conteúdo Textual</label>
                <textarea id="rag-conteudo" class="input-field" style="height: 150px;"></textarea>
            </div>
            <button id="btn-rag-save" class="btn-primary" style="margin-top: 1rem;">Salvar na IA</button>
        </div>
        <div id="rag-list-container"></div>
    `;

    const loadRAG = async () => {
        const res = await fetch(API_BASE + `/cliente/rag/${currentUser.numero_wa}`);
        const data = await res.json();
        const list = document.getElementById('rag-list-container');
        list.innerHTML = `
            <div class="card">
                <h3>Documentos na Base</h3>
                <div style="margin-top: 1rem;">
                    ${data.map(d => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; border-bottom: 1px solid var(--border);">
                            <div>
                                <div style="font-weight: 600;">${d.titulo}</div>
                                <div style="font-size: 0.7rem; color: var(--muted);">${new Date(d.criado_em).toLocaleString()}</div>
                            </div>
                            <button onclick="deleteRAG(${d.id})" style="background: transparent; border: none; color: #ef4444; cursor: pointer;"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    };
    loadRAG();

    document.getElementById('btn-rag-save').onclick = async () => {
        const titulo = document.getElementById('rag-titulo').value;
        const conteudo = document.getElementById('rag-conteudo').value;
        await fetch(API_BASE + '/cliente/importar-texto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titulo, conteudo, loja_id: currentUser.numero_wa })
        });
        renderView('rag');
    };
}

window.deleteRAG = async (id) => {
    if (confirm('Deletar este documento?')) {
        await fetch(API_BASE + `/cliente/rag/${id}`, { method: 'DELETE' });
        renderView('rag');
    }
};

async function viewScrape(container) {
    container.innerHTML = `
        <div class="card">
            <h3>Web Scraping Automático</h3>
            <p style="color: var(--muted); margin-bottom: 1.5rem;">Insira a URL do seu site para que a IA aprenda sobre seus produtos e serviços.</p>
            <div class="form-group">
                <label>URL do Site</label>
                <input type="url" id="scrape-url" class="input-field" placeholder="https://sua-empresa.com.br">
            </div>
            <button id="btn-scrape" class="btn-primary" style="margin-top: 1rem;">Iniciar Captura de Dados</button>
            <div id="scrape-status" style="margin-top: 1rem; font-size: 0.875rem;"></div>
        </div>
    `;

    document.getElementById('btn-scrape').onclick = async () => {
        const url = document.getElementById('scrape-url').value;
        const status = document.getElementById('scrape-status');
        status.innerHTML = '⏳ <span style="color: var(--primary)">Processando site... Isso pode levar alguns minutos.</span>';
        const res = await fetch(API_BASE + '/cliente/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, loja_id: currentUser.numero_wa })
        });
        const data = await res.json();
        status.innerHTML = data.ok ? '<span style="color: var(--primary)">✅ Captura concluída! IA atualizada.</span>' : '<span style="color: #ef4444;">❌ Erro: ' + data.erro + '</span>';
    };
}

async function viewOmnichat(container) {
    container.innerHTML = `
        <div class="chat-container">
            <div class="chat-list">
                <div style="padding: 1rem; border-bottom: 1px solid var(--border); font-weight: 700;">Conversas</div>
                <div id="contact-list" style="overflow-y: auto; height: calc(100% - 50px);"></div>
            </div>
            <div class="chat-main" id="chat-main">
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--muted);">
                    Selecione um contato para visualizar a conversa
                </div>
            </div>
        </div>
    `;

    const res = await fetch(API_BASE + `/chat/conversas/${currentUser.numero_wa}`);
    const contacts = await res.json();
    const list = document.getElementById('contact-list');
    list.innerHTML = contacts.map(c => `
        <div class="contact-item" onclick="openChat('${c.contatos.telefone}')" style="padding: 1rem; border-bottom: 1px solid var(--border); cursor: pointer;">
            <div style="font-weight: 600;">${c.contatos.telefone}</div>
            <div style="font-size: 0.7rem; color: var(--muted);">Ver histórico</div>
        </div>
    `).join('');
}

window.openChat = async (telefone) => {
    const main = document.getElementById('chat-main');
    main.innerHTML = `
        <div style="padding: 1rem; border-bottom: 1px solid var(--border); font-weight: 700; display: flex; justify-content: space-between;">
            <span>${telefone}</span>
            <span style="color: var(--primary); font-size: 0.75rem;">● IA ATIVA</span>
        </div>
        <div class="chat-messages" id="chat-messages"></div>
        <div style="padding: 1rem; border-top: 1px solid var(--border); display: flex; gap: 0.5rem;">
            <input type="text" id="chat-input" class="input-field" placeholder="Digite uma mensagem manual...">
            <button id="btn-send" class="btn-primary" style="width: 100px;">Enviar</button>
        </div>
    `;

    const loadMessages = async () => {
        const res = await fetch(API_BASE + `/chat/mensagens/${telefone}`);
        const msgs = await res.json();
        const box = document.getElementById('chat-messages');
        box.innerHTML = msgs.map(m => `
            <div class="msg ${m.remetente_tipo === 'user' ? 'user' : 'ai'}">${m.conteudo}</div>
        `).join('');
        box.scrollTop = box.scrollHeight;
    };
    loadMessages();

    document.getElementById('btn-send').onclick = async () => {
        const msg = document.getElementById('chat-input').value;
        if (!msg) return;
        await fetch(API_BASE + '/chat/send-manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ numero_wa: currentUser.numero_wa, telefone_cliente: telefone, mensagem: msg })
        });
        document.getElementById('chat-input').value = '';
        loadMessages();
    };
};

async function viewGestao(container) {
    const res = await fetch(API_BASE + '/admin/lojas');
    const lojas = await res.json();

    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <h2>Clientes Cadastrados</h2>
            <button class="btn-primary" onclick="openModalCliente()">+ Novo Cliente</button>
        </div>
        <div class="card">
            <table style="width: 100%;">
                <thead>
                    <tr>
                        <th>Empresa</th>
                        <th>WhatsApp</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${lojas.map(l => `
                        <tr>
                            <td>${l.nome}</td>
                            <td>${l.wa_id}</td>
                            <td><span class="badge ${l.ativa ? 'badge-success' : ''}">${l.ativa ? 'Ativo' : 'Inativo'}</span></td>
                            <td><button class="btn-primary" style="padding: 4px 8px;" onclick="selectClient('${l.wa_id}')">Gerenciar</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

window.selectClient = (wa_id) => {
    document.getElementById('client-selector').value = wa_id;
    document.getElementById('client-selector').dispatchEvent(new Event('change'));
    renderView('dashboard');
};

window.openModalCliente = () => {
    const nome = prompt("Nome da Empresa:");
    const wa_id = prompt("Número WA (DDI + DDD + Numero):");
    if (nome && wa_id) {
        fetch(API_BASE + '/admin/lojas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, wa_id })
        }).then(() => renderView('gestao'));
    }
};

async function viewDiagnostics(container) {
    container.innerHTML = `
        <div class="card">
            <h3>Diagnóstico de Conexão</h3>
            <div id="diag-results" style="margin-top: 1rem; font-family: monospace; font-size: 0.8rem; background: #000; padding: 1rem; border-radius: var(--radius);">
                Rodando testes...
            </div>
        </div>
    `;
    const res = await fetch(API_BASE + `/admin/diagnostics/${currentUser.numero_wa || 'none'}`);
    const data = await res.json();
    document.getElementById('diag-results').innerText = JSON.stringify(data, null, 2);
}
