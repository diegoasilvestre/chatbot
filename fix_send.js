const fs = require('fs');
let content = fs.readFileSync('index.js', 'utf8');
const oldBlock = `app.post('/chat/send-manual', async (req, res) => {
    const { numero_wa, telefone_cliente, mensagem } = req.body;
    try {
        const sock = activeSessions[numero_wa];
        if (!sock) return res.status(400).json({ erro: 'WhatsApp não conectado.' });

        const cleanPhone = String(telefone_cliente).replace(/\\D/g, '');
        
        // Tenta primeiro o formato padrão
        let jid = \`\${cleanPhone}@s.whatsapp.net\`;
        
        // Se o número for muito longo (LID), ajusta o sufixo
        if (cleanPhone.length > 13) {
            jid = \`\${cleanPhone}@lid\`;
        }

        console.log(\`[CHAT] 🚀 Tentativa de envio para JID: \${jid}\`);
        
        try {
            await sock.sendMessage(jid, { text: mensagem });
        } catch (err) {
            console.log(\`[CHAT] 🔄 Falha no primeiro JID, tentando fallback...\`);
            // Fallback: se tentou .net e falhou, tenta .lid (ou vice-versa)
            const fallbackJid = jid.endsWith('@lid') ? \`\${cleanPhone}@s.whatsapp.net\` : \`\${cleanPhone}@lid\`;
            await sock.sendMessage(fallbackJid, { text: mensagem });
            jid = fallbackJid;
        }

        const isUUID = /^[0-9a-fA-F-]{36}$/.test(telefone_cliente);
        let convId = null;

        if (isUUID) {
            convId = telefone_cliente;
        } else {
            const { data: contato } = await supabase.from('contatos_crm').select('id').eq('numero_wa', numero_wa).eq('telefone_cliente', telefone_cliente).maybeSingle();
            if (contato) {
                const { data: conv } = await supabase.from('conversas').select('id').eq('numero_wa', numero_wa).eq('contato_id', contato.id).maybeSingle();
                if (conv) convId = conv.id;
            }
        }

        if (convId) {
            await supabase.from('conversas').update({ ia_ativa: false }).eq('id', convId);
            await supabase.from('mensagens').insert([{
                conversa_id: convId,
                remetente_tipo: 'humano',
                conteudo: mensagem
            }]);
        }
        res.json({ ok: true });
    } catch (e) {
        console.error(\`[CHAT] ❌ Erro definitivo no envio: \${e.message}\`);
        res.status(500).json({ erro: e.message });
    }
});\`;

const newBlock = \`app.post('/chat/send-manual', async (req, res) => {
    const { numero_wa, telefone_cliente, mensagem } = req.body;
    try {
        const sock = activeSessions[numero_wa];
        if (!sock) return res.status(400).json({ erro: 'WhatsApp não conectado.' });

        const isUUID = /^[0-9a-fA-F-]{36}$/.test(telefone_cliente);
        let realPhone = telefone_cliente;
        let convId = isUUID ? telefone_cliente : null;

        if (isUUID) {
            const { data: conv } = await supabase.from('conversas').select('id, contatos_crm(telefone_cliente)').eq('id', telefone_cliente).maybeSingle();
            if (conv && conv.contatos_crm) {
                realPhone = conv.contatos_crm.telefone_cliente;
                convId = conv.id;
            }
        } else {
            const { data: contato } = await supabase.from('contatos_crm').select('id').eq('numero_wa', numero_wa).eq('telefone_cliente', telefone_cliente).maybeSingle();
            if (contato) {
                const { data: conv } = await supabase.from('conversas').select('id').eq('numero_wa', numero_wa).eq('contato_id', contato.id).maybeSingle();
                if (conv) convId = conv.id;
            }
        }

        const cleanPhone = String(realPhone).replace(/\\\\D/g, '');
        let jid = \\\`\\\${cleanPhone}@s.whatsapp.net\\\`;
        if (cleanPhone.length > 13) jid = \\\`\\\${cleanPhone}@lid\\\`;

        console.log(\\\`[CHAT] 🚀 Enviando para \\\${realPhone} (JID: \\\${jid})\\\`);
        
        try {
            await sock.sendMessage(jid, { text: mensagem });
        } catch (err) {
            const fallbackJid = jid.endsWith('@lid') ? \\\`\\\${cleanPhone}@s.whatsapp.net\\\` : \\\`\\\${cleanPhone}@lid\\\`;
            await sock.sendMessage(fallbackJid, { text: mensagem });
        }

        if (convId) {
            await supabase.from('conversas').update({ ia_ativa: false }).eq('id', convId);
            await supabase.from('mensagens').insert([{
                conversa_id: convId,
                remetente_tipo: 'humano',
                conteudo: mensagem
            }]);
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});\`;

content = content.replace(oldBlock, newBlock);
fs.writeFileSync('index.js', content);
