const fs = require('fs');
let content = fs.readFileSync('index.js', 'utf8');

// 1. Injeta a função de resolução de JID no topo ou antes das rotas
const resolverFunc = \`
// --- RESOLVEDOR DE IDENTIDADE SÊNIOR ---
async function resolveChatData(idOrPhone, numero_wa) {
    const isUUID = /^[0-9a-fA-F-]{36}$/.test(idOrPhone);
    let convId = null;
    let telefoneReal = null;

    if (isUUID) {
        const { data: conv } = await supabase.from('conversas')
            .select('id, contatos_crm(telefone_cliente)')
            .eq('id', idOrPhone)
            .maybeSingle();
        if (conv) {
            convId = conv.id;
            telefoneReal = conv.contatos_crm?.telefone_cliente;
        }
    } else {
        const { data: contato } = await supabase.from('contatos_crm')
            .select('id, telefone_cliente')
            .eq('numero_wa', numero_wa)
            .eq('telefone_cliente', idOrPhone)
            .maybeSingle();
        if (contato) {
            telefoneReal = contato.telefone_cliente;
            const { data: conv } = await supabase.from('conversas')
                .select('id')
                .eq('numero_wa', numero_wa)
                .eq('contato_id', contato.id)
                .maybeSingle();
            if (conv) convId = conv.id;
        }
    }

    if (!telefoneReal) return null;

    const clean = String(telefoneReal).replace(/\\\\D/g, '');
    const jid = clean.length > 13 ? \\\`\\\${clean}@lid\\\` : \\\`\\\${clean}@s.whatsapp.net\\\`;
    
    return { convId, telefoneReal, jid, clean };
}
\`;

// 2. Substitui o bloco de send-manual para usar o resolver
const sendManualOld = /app\\.post\\('\\/chat\\/send-manual',[\\s\\S]*?\\}\\);/s;
const sendManualNew = \`app.post('/chat/send-manual', async (req, res) => {
    const { numero_wa, telefone_cliente, mensagem } = req.body;
    try {
        const sock = activeSessions[numero_wa];
        if (!sock) return res.status(400).json({ erro: 'WhatsApp não conectado.' });

        const chat = await resolveChatData(telefone_cliente, numero_wa);
        if (!chat) return res.status(404).json({ erro: 'Contato não encontrado para envio.' });

        console.log(\\\`[CHAT] 🚀 Enviando para \\\${chat.telefoneReal} (JID: \\\${chat.jid})\\\`);
        
        try {
            await sock.sendMessage(chat.jid, { text: mensagem });
        } catch (err) {
            const fallbackJid = chat.jid.endsWith('@lid') ? \\\`\\\${chat.clean}@s.whatsapp.net\\\` : \\\`\\\${chat.clean}@lid\\\`;
            await sock.sendMessage(fallbackJid, { text: mensagem });
        }

        if (chat.convId) {
            await supabase.from('conversas').update({ ia_ativa: false }).eq('id', chat.convId);
            await supabase.from('mensagens').insert([{
                conversa_id: chat.convId,
                remetente_tipo: 'humano',
                conteudo: mensagem
            }]);
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});\`;

// 3. Substitui o toggle-ia
const toggleIaOld = /app\\.post\\('\\/chat\\/toggle-ia',[\\s\\S]*?\\}\\);/s;
const toggleIaNew = \`app.post('/chat/toggle-ia', async (req, res) => {
    const { loja_id, numero_cliente, ia_ativa } = req.body;
    try {
        const chat = await resolveChatData(numero_cliente, loja_id);
        if (chat && chat.convId) {
            await supabase.from('conversas').update({ ia_ativa }).eq('id', chat.convId);
            console.log(\\\`[CHAT] 🤖 IA \\\${ia_ativa ? 'ATIVADA' : 'DESATIVADA'} para conversa \\\${chat.convId}\\\`);
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});\`;

// Inserção da função antes das rotas
if (!content.includes('resolveChatData')) {
    content = content.replace("app.post('/chat/conversas/:numero_wa'", resolverFunc + "\\napp.post('/chat/conversas/:numero_wa'");
}

content = content.replace(sendManualOld, sendManualNew);
content = content.replace(toggleIaOld, toggleIaNew);

fs.writeFileSync('index.js', content);
