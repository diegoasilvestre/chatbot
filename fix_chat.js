const fs = require('fs');
let content = fs.readFileSync('frontend/app.js', 'utf8');

const newFunction = `async function ocSendMessage(id) {
    const inp = document.getElementById('ocInput_' + id);
    const sendBtn = document.getElementById('ocSendBtn_' + id);
    if (!inp || !inp.value.trim()) return;
    const text = inp.value.trim();
    inp.value = '';
    inp.style.height = 'auto';

    _ocIaStates[id] = false;
    const sw = document.querySelector(\`#ocIaBtn_\${id} .oc-switch\`);
    const lbl = document.getElementById(\`ocIaLabel_\${id}\`);
    const btn = document.getElementById(\`ocIaBtn_\${id}\`);
    const banner = document.getElementById(\`ocBanner_\${id}\`);
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
}`;

// Substitui a função antiga (busca por padrão aproximado)
content = content.replace(/async function ocSendMessage\(id\) \{[\s\S]*?\}\n\nfunction ocHandleKey/g, newFunction + "\n\nfunction ocHandleKey");

fs.writeFileSync('frontend/app.js', content);
console.log('Frontend atualizado com sucesso!');
