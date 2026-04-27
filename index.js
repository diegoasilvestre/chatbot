/**
 * index.js — Nexus Bot AI
 * Responsabilidades: WhatsApp Engine (Baileys), API REST, Memória de Conversa
 */

const express = require('express');
const cors = require('cors');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const {
    generateResponse,
    generateEmbedding,
    scrapeAndSave,
    runDiagnostics,
    warmupModel,
    supabase,
} = require('./ai');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('frontend'));

// ─── ESTADO GLOBAL ────────────────────────────────────────────────────────────
const activeSessions = {};   // { [numero_wa]: sock }
const pendingSessions = {};   // { [numero_wa]: { pairingCode, sock, timestamp } }

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ─── MOTOR DO WHATSAPP (NÃO MODIFICAR AUTH/CONNECT) ─────────────────────────
async function startWhatsApp(numero_wa, res = null) {
    if (activeSessions[numero_wa]) {
        if (res && !res.headersSent) res.json({ status: 'ja_conectado' });
        return;
    }

    const { state, saveCreds } = await useMultiFileAuthState(`auth_info_${numero_wa}`);
    let version = [2, 3000, 1015901307];
    try { const r = await fetchLatestBaileysVersion(); if (r?.version) version = r.version; } catch { }

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Mac OS', 'Safari', '17.0'],
        markOnlineOnConnect: true,
        syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (!sock.authState?.creds?.registered && !pendingSessions[numero_wa]) {
            try {
                await delay(2000);
                const code = await sock.requestPairingCode(numero_wa);
                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log(`[WA] 🔑 Pairing code para ${numero_wa}: ${formattedCode}`);
                pendingSessions[numero_wa] = { pairingCode: formattedCode, sock, timestamp: Date.now() };
                if (res && !res.headersSent) res.json({ success: true, pairingCode: formattedCode });
            } catch (err) {
                console.error('[WA] Erro ao gerar pairing code:', err.message);
                if (res && !res.headersSent) res.status(500).json({ erro: err.message });
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`[WA] Conexão fechada ${numero_wa}. Reconectar: ${shouldReconnect}`);
            delete activeSessions[numero_wa];
            delete pendingSessions[numero_wa];
            if (shouldReconnect) setTimeout(() => startWhatsApp(numero_wa), 5000);
        } else if (connection === 'open') {
            console.log(`[WA] ✅ ${numero_wa} conectado!`);
            activeSessions[numero_wa] = sock;
            delete pendingSessions[numero_wa];
        }
    });

    // ── RECEPÇÃO DE MENSAGENS (FILTROS E DELAY) ───────────────────────────────
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const remoteJid = msg.key.remoteJid;
        if (remoteJid === 'status@broadcast' || remoteJid?.endsWith('@g.us') || remoteJid?.endsWith('@lid')) return;

        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || null;
        if (!textMessage) return;

        try {
            console.log(`[WA] Mensagem de ${remoteJid}. Aguardando 12s delay...`);
            await delay(12000);

            const aiReply = await generateResponse(textMessage, numero_wa, remoteJid);
            const handoffTriggered = aiReply.includes('[CHAMAR_HUMANO]');
            const mensagemLimpa = aiReply.replace(/\[CHAMAR_HUMANO\]/g, '').trim();

            await supabase.from('conversas').insert([
                { loja_id: numero_wa, numero_cliente: remoteJid.split('@')[0], role: 'user', content: textMessage, tipo: 'texto' },
                { loja_id: numero_wa, numero_cliente: remoteJid.split('@')[0], role: 'assistant', content: mensagemLimpa, tipo: 'texto' }
            ]);

            await sock.sendMessage(remoteJid, { text: mensagemLimpa });
            console.log(`[WA] ✅ Resposta enviada para ${remoteJid}`);
        } catch (error) {
            console.error(`[WA] ❌ Erro:`, error);
        }
    });

    return sock;
}

// ─── ROTAS AUTH ───────────────────────────────────────────────────────────────
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    console.log(`[AUTH] Tentativa de login: ${email}`);

    try {
        // 1. Admin Fixo
        if (email === 'admin@robotibr.com.br' && password === 'admin123') {
            console.log(`[AUTH] ✅ Login Admin Fixo`);
            return res.json({ user: { email, id: 'admin' }, is_admin: true });
        }

        // 2. Tentar Supabase Auth (Logins criados no Dashboard do Supabase)
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (!authError && authData.user) {
            console.log(`[AUTH] ✅ Login via Supabase Auth: ${email}`);
            
            // Tenta buscar o numero_wa vinculado a este email na agentes_config
            const { data: loja } = await supabase
                .from('agentes_config')
                .select('*')
                .eq('email_dono', email)
                .maybeSingle();

            return res.json({
                user: { email: email, id: authData.user.id },
                is_admin: false,
                numero_wa: loja ? loja.numero_wa : null,
                config: loja ? {
                    nome: loja.nome_empresa,
                    nicho: loja.nicho,
                    tom_voz: loja.tom_voz,
                    regras: loja.regras,
                    prompt_base: loja.prompt_base
                } : null,
                msg: loja ? null : 'Aviso: Usuário autenticado mas sem número WA vinculado na agentes_config.'
            });
        }

        // 3. Fallback: Busca na tabela agentes_config (Legado ou Custom)
        // Usamos um bloco try/catch específico para a query caso as colunas não existam
        let loja = null;
        try {
            const { data, error } = await supabase
                .from('agentes_config')
                .select('*')
                .or(`email_dono.eq.${email},numero_wa.eq.${email}`)
                .maybeSingle();
            
            if (!error && data) loja = data;
        } catch (queryErr) {
            console.warn(`[AUTH] ⚠️ Erro na query de fallback (provavelmente colunas ausentes): ${queryErr.message}`);
        }

        if (loja) {
            // Verifica senha (se a coluna existir)
            if (loja.senha_cliente === password || loja.numero_wa === password) {
                console.log(`[AUTH] ✅ Login Sucesso via Tabela: ${loja.numero_wa}`);
                return res.json({
                    user: { email: email, id: loja.numero_wa },
                    is_admin: false,
                    numero_wa: loja.numero_wa,
                    config: {
                        nome: loja.nome_empresa,
                        nicho: loja.nicho,
                        tom_voz: loja.tom_voz,
                        regras: loja.regras,
                        prompt_base: loja.prompt_base
                    }
                });
            }
        }

        console.warn(`[AUTH] ❌ Falha no login para: ${email}`);
        return res.status(401).json({ 
            erro: 'Credenciais inválidas ou usuário não encontrado no Supabase Auth.',
            detalhes: 'Certifique-se de que o login foi criado em Auth > Users no Supabase.'
        });

    } catch (e) {
        console.error(`[AUTH] ❌ Erro crítico no login:`, e.message);
        res.status(500).json({ erro: 'Erro interno ao processar login. Verifique os logs do servidor.' });
    }
});

// ─── ROTAS ADMIN ─────────────────────────────────────────────────────────────
app.get('/admin/lojas', async (req, res) => {
    const { data, error } = await supabase.from('agentes_config').select('*');
    if (error) return res.status(500).json({ erro: error.message });
    res.json(data.map(c => ({
        id: c.numero_wa, nome: c.nome_empresa, wa_id: c.numero_wa,
        ativa: c.ativo, prompt_base: c.prompt_base,
        config: { nicho: c.nicho, tom_voz: c.tom_voz, regras: c.regras },
    })));
});

app.post('/admin/lojas', async (req, res) => {
    const { nome, wa_id, prompt_base, nicho, tom_voz, regras } = req.body;
    if (!wa_id) return res.status(400).json({ erro: 'wa_id obrigatório' });
    
    const { data, error } = await supabase
        .from('agentes_config')
        .upsert({ 
            numero_wa: wa_id, nome_empresa: nome, 
            prompt_base: prompt_base || 'Você é um assistente virtual útil.',
            nicho, tom_voz, regras, ativo: true
        }, { onConflict: 'numero_wa' })
        .select().single();
        
    if (error) return res.status(500).json({ erro: error.message });
    
    // FORMATO DE RETORNO ORIGINAL PARA NÃO QUEBRAR O FRONTEND
    res.json({ id: data.numero_wa, nome: data.nome_empresa, wa_id: data.numero_wa });
});

app.post('/admin/lojas/update', async (req, res) => {
    const { wa_id, ...updates } = req.body;
    const { error } = await supabase.from('agentes_config').update(updates).eq('numero_wa', wa_id);
    if (error) return res.status(500).json({ erro: error.message });
    res.json({ ok: true });
});

// ─── ROTAS TENANT (CLIENTE) ──────────────────────────────────────────────────
app.get('/tenant/stats/:numero_wa', async (req, res) => {
    const { numero_wa } = req.params;
    const { data: convs, error } = await supabase.from('conversas').select('role').eq('loja_id', numero_wa);
    if (error) return res.status(500).json({ erro: error.message });
    
    const total = convs.length;
    const userMsgs = convs.filter(m => m.role === 'user').length;
    const aiMsgs = convs.filter(m => m.role === 'assistant').length;
    
    res.json({ total_mensagens: total, mensagens_usuario: userMsgs, mensagens_ai: aiMsgs });
});

app.post('/tenant/config', async (req, res) => {
    const { wa_id, ...updates } = req.body;
    if (!wa_id) return res.status(400).json({ erro: 'wa_id obrigatório' });
    
    const { error } = await supabase.from('agentes_config').update(updates).eq('numero_wa', wa_id);
    if (error) return res.status(500).json({ erro: error.message });
    res.json({ ok: true });
});

// ─── OUTRAS ROTAS ────────────────────────────────────────────────────────────
app.post('/wa/connect', async (req, res) => {
    const { numero } = req.body;
    if (activeSessions[numero]) return res.json({ status: 'ja_conectado' });
    try { await startWhatsApp(numero, res); } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/wa/status/ping', (req, res) => {
    res.json({ ok: true });
});

app.get('/wa/status/:numero_wa', (req, res) => {
    const n = req.params.numero_wa;
    if (activeSessions[n]) return res.json({ status: 'conectado', numero: n });
    if (pendingSessions[n]) return res.json({ status: 'aguardando', numero: n, pairingCode: pendingSessions[n].pairingCode });
    res.json({ status: 'desconectado', numero: n });
});

app.post('/wa/disconnect', async (req, res) => {
    const { numero } = req.body;
    const sock = activeSessions[numero];
    if (sock) { try { await sock.logout(); } catch { } }
    delete activeSessions[numero];
    delete pendingSessions[numero];
    res.json({ ok: true });
});

app.get('/chat/conversas/:numero_wa', async (req, res) => {
    const { data, error } = await supabase.from('conversas').select('*').eq('loja_id', req.params.numero_wa).order('created_at', { ascending: false });
    if (error) return res.status(500).json({ erro: error.message });
    const uniq = []; const seen = new Set();
    for (const c of data) { if (!seen.has(c.numero_cliente)) { seen.add(c.numero_cliente); uniq.push({ id: c.id, contatos: { telefone: c.numero_cliente }, atualizado_em: c.created_at }); } }
    res.json(uniq);
});

app.get('/chat/mensagens/:numero_cliente', async (req, res) => {
    const { data, error } = await supabase.from('conversas').select('*').eq('numero_cliente', req.params.numero_cliente).order('created_at', { ascending: true });
    if (error) return res.status(500).json({ erro: error.message });
    res.json(data.map(m => ({ id: m.id, remetente_tipo: m.role === 'user' ? 'user' : 'ai', conteudo: m.content, criado_em: m.created_at })));
});

app.post('/chat/send-manual', async (req, res) => {
    const { numero_wa, telefone_cliente, mensagem } = req.body;
    const sock = activeSessions[numero_wa];
    if (!sock) return res.status(500).json({ erro: 'WA desconectado' });
    await sock.sendMessage(`${telefone_cliente}@s.whatsapp.net`, { text: mensagem });
    await supabase.from('conversas').insert([{ loja_id: numero_wa, numero_cliente: telefone_cliente, role: 'assistant', content: mensagem, tipo: 'atendimento_manual' }]);
    res.json({ ok: true });
});

app.post('/cliente/importar-texto', async (req, res) => {
    const { titulo, conteudo, loja_id } = req.body;
    const embedding = await generateEmbedding(conteudo);
    await supabase.from('base_conhecimento').insert([{ numero_wa: loja_id, tipo_fonte: 'texto_manual', titulo_fonte: titulo, conteudo, embedding }]);
    res.json({ ok: true });
});

app.get('/cliente/rag/:numero_wa', async (req, res) => {
    const { data, error } = await supabase.from('base_conhecimento').select('id, tipo_fonte as tipo, titulo_fonte as titulo, url_fonte, criado_em').eq('numero_wa', req.params.numero_wa).order('criado_em', { ascending: false });
    res.json(data || []);
});

app.delete('/cliente/rag/:id', async (req, res) => {
    await supabase.from('base_conhecimento').delete().eq('id', req.params.id);
    res.json({ ok: true });
});

app.post('/cliente/scrape', async (req, res) => {
    const { url, loja_id, titulo } = req.body;
    const result = await scrapeAndSave(url, loja_id, titulo);
    res.json(result);
});

app.get('/admin/diagnostics/:numero_wa', async (req, res) => {
    res.json(await runDiagnostics(req.params.numero_wa));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
    console.log(`\n🚀 Nexus Bot AI — porta ${PORT}`);
    await warmupModel();
});