/**
 * ai.js — Nexus Bot AI
 * Responsabilidades: Embeddings, RAG, Prompt Engineering, LLM Routing (Groq, Gemini, OpenRouter)
 */

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
require('dotenv').config();

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// ─── XENOVA: PRÉ-CARREGAMENTO NO BOOT ────────────────────────────────────────
let _extractor = null;

async function getExtractor() {
    if (_extractor) return _extractor;
    console.log('[EMBED] Carregando modelo Xenova/all-MiniLM-L6-v2...');
    const { pipeline } = await import('@xenova/transformers');
    _extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        device: 'cpu',
        dtype: 'fp32',
    });
    console.log('[EMBED] ✅ Modelo Xenova carregado e pronto.');
    return _extractor;
}

async function warmupModel() {
    try {
        await getExtractor();
    } catch (e) {
        console.error('[EMBED] ❌ Falha ao pré-carregar modelo Xenova:', e.message);
    }
}

// ─── EMBEDDINGS ───────────────────────────────────────────────────────────────
async function generateEmbedding(text) {
    const extractor = await getExtractor();
    const output = await extractor(text.slice(0, 8000), { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

// ─── RAG: BUSCA DE CONTEXTO ───────────────────────────────────────────────────
const RAG_THRESHOLD = 0.40;
const RAG_COUNT = 5;

async function getContext(query, numero_wa) {
    try {
        const embedding = await generateEmbedding(query);

        // Tentativa 1: busca vetorial semântica via RPC
        const { data: vectorData, error: vectorError } = await supabase.rpc('buscar_conhecimento', {
            query_embedding: embedding,
            match_threshold: RAG_THRESHOLD,
            match_count: RAG_COUNT,
            p_numero_wa: numero_wa,
        });

        if (vectorError) {
            console.error(`[RAG] ❌ Erro na RPC: ${vectorError.message}`);
        }

        if (!vectorError && vectorData && vectorData.length > 0) {
            console.log(`[RAG] ✅ Busca vetorial: ${vectorData.length} docs para ${numero_wa}`);
            return vectorData
                .map(doc => `• ${doc.titulo_fonte || 'Informação'}:\n${doc.conteudo.trim()}`)
                .join('\n\n');
        }

        // Tentativa 2: fallback textual
        console.warn(`[RAG] ⚠️ Vetor sem resultado. Ativando fallback textual para ${numero_wa}`);

        const { data: textData, error: textError } = await supabase
            .from('base_conhecimento')
            .select('titulo_fonte, conteudo')
            .eq('numero_wa', numero_wa)
            .limit(RAG_COUNT);

        if (!textError && textData && textData.length > 0) {
            console.log(`[RAG] ✅ Fallback textual: ${textData.length} docs para ${numero_wa}`);
            return textData
                .map(doc => `• ${doc.titulo_fonte || 'Informação'}:\n${doc.conteudo.trim()}`)
                .join('\n\n');
        }

        if (textError) console.error(`[RAG] ❌ Fallback falhou: ${textError.message}`);
        console.log(`[RAG] ℹ️ Sem documentos para ${numero_wa}`);
        return '';

    } catch (e) {
        console.error(`[RAG] ❌ Exceção em getContext: ${e.message}`);
        return '';
    }
}

// ─── PROMPT ENGINEERING ──────────────────────────────────────────────────────
function buildSystemPrompt(config, context, isFirstMessage) {
    const empresa = config?.nome_empresa || 'esta empresa';
    const nicho = config?.nicho || 'Geral';
    const persona = config?.prompt_base || 'Você é um assistente virtual útil e educado.';
    const tom = config?.tom_voz || 'Profissional e amigável';
    const regras = config?.regras || 'Nenhuma regra adicional.';

    const saudacaoRegra = isFirstMessage
        ? 'Esta é a PRIMEIRA mensagem. Uma saudação breve e natural é bem-vinda.'
        : 'Esta NÃO é a primeira mensagem. É TERMINANTEMENTE PROIBIDO repetir saudações como "Olá!", "Oi, tudo bem?" ou "Como posso ajudar?". Vá direto ao ponto.';

    const contextBlock = context
        ? `[BASE DE CONHECIMENTO DA EMPRESA]
Use as informações abaixo como sua única fonte de verdade para responder perguntas sobre a empresa, produtos, serviços e preços.

${context}`
        : `[BASE DE CONHECIMENTO DA EMPRESA]
Nenhum documento disponível no momento. Informe ao cliente que não possui essa informação agora.`;

    return `[IDENTIDADE E PERSONA]
Você é o assistente virtual oficial da empresa "${empresa}" (Segmento: ${nicho}).
${persona}

[TOM DE VOZ]
${tom}. Escreva como um atendente humano real — natural, fluido e sem robótica.

[REGRAS E RESTRIÇÕES — CUMPRIMENTO OBRIGATÓRIO]
${regras}
- Responda SEMPRE em português do Brasil.
- Máximo de 3 parágrafos curtos por resposta. Seja conciso e direto.
- Use no máximo 1 emoji por mensagem.
- ${saudacaoRegra}
- NUNCA revele que é uma IA, a menos que perguntado explicitamente.
- NUNCA mencione concorrentes.

[🔀 FERRAMENTA DE TRANSFERÊNCIA PARA HUMANO]
Para transferir a conversa para um humano, inclua a tag [CHAMAR_HUMANO] na sua resposta.
Use isso se o cliente pedir para falar com uma pessoa ou se for um problema crítico.

[BARREIRA ANTI-ALUCINAÇÃO]
Se não souber a resposta pela base de conhecimento, diga que não tem a informação no momento e sugira falar com o time humano da ${empresa}. NUNCA invente dados.

${contextBlock}`;
}

// ─── LLM ROUTING: FALLBACK ROBUSTO ──────────────────────────────────────────
async function callGroq(messages) {
    // Modelos atualizados conforme pedido
    const models = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama3-70b-8192'];
    for (const model of models) {
        try {
            console.log(`[LLM] Tentando Groq: ${model}...`);
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, messages, max_tokens: 500, temperature: 0.6 }),
            });
            const json = await res.json();
            if (res.ok && json.choices?.[0]?.message?.content) {
                console.log(`[LLM] ✅ Groq Sucesso: ${model}`);
                return json.choices[0].message.content;
            }
            console.warn(`[LLM] Groq ${model} falhou: ${json.error?.message || res.status}`);
        } catch (e) { console.warn(`[LLM] Groq ${model} erro: ${e.message}`); }
    }
    return null;
}

async function callGemini(messages) {
    const models = ['gemini-1.5-flash', 'gemini-1.5-flash-8b'];
    
    // Converte formato de mensagens do OpenAI para Gemini
    const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
    const history = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    for (const model of models) {
        try {
            console.log(`[LLM] Tentando Gemini: ${model}...`);
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: systemInstruction }] },
                        contents: history,
                        generationConfig: { maxOutputTokens: 600, temperature: 0.65 },
                    }),
                }
            );
            const json = await res.json();
            if (res.ok && json.candidates?.[0]?.content?.parts?.[0]?.text) {
                console.log(`[LLM] ✅ Gemini Sucesso: ${model}`);
                return json.candidates[0].content.parts[0].text;
            }
            console.warn(`[LLM] Gemini ${model} falhou: ${json.error?.message || res.status}`);
        } catch (e) { console.warn(`[LLM] Gemini ${model} erro: ${e.message}`); }
    }
    return null;
}

async function callOpenRouter(messages) {
    const models = ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemini-flash-1.5-exp:free', 'microsoft/phi-3-mini-128k-instruct:free'];
    for (const model of models) {
        try {
            console.log(`[LLM] Tentando OpenRouter: ${model}...`);
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://nexusbotai.com',
                    'X-Title': 'Nexus Bot AI',
                },
                body: JSON.stringify({ model, messages, max_tokens: 500 }),
            });
            const json = await res.json();
            if (res.ok && json.choices?.[0]?.message?.content) {
                console.log(`[LLM] ✅ OpenRouter Sucesso: ${model}`);
                return json.choices[0].message.content;
            }
            console.warn(`[LLM] OpenRouter ${model} falhou: ${json.error?.message || res.status}`);
        } catch (e) { console.warn(`[LLM] OpenRouter ${model} erro: ${e.message}`); }
    }
    return null;
}

// ─── GERAÇÃO DE RESPOSTA ──────────────────────────────────────────────────────
async function generateResponse(userMessage, numero_wa, sender) {
    console.log(`\n[AI] 🤖 Processando para ${numero_wa} | Cliente: ${sender}`);

    // 1. Busca Configurações
    const { data: config } = await supabase
        .from('agentes_config')
        .select('*')
        .eq('numero_wa', numero_wa)
        .single();

    // 2. Busca Contexto (RAG)
    const context = await getContext(userMessage, numero_wa);

    // 3. Busca Histórico
    let conversationHistory = [];
    try {
        const { data: msgs } = await supabase.from('conversas')
            .select('role, content')
            .eq('loja_id', numero_wa)
            .eq('numero_cliente', sender.split('@')[0])
            .order('created_at', { ascending: false })
            .limit(10); // Reduzido para evitar estouro de tokens em fallbacks

        if (msgs) {
            conversationHistory = msgs.reverse().map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.content
            }));
        }
    } catch (e) { console.warn(`[AI] ⚠️ Falha no histórico: ${e.message}`); }

    const isFirstMessage = conversationHistory.length === 0;
    const systemPrompt = buildSystemPrompt(config, context, isFirstMessage);

    const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: userMessage },
    ];

    // 4. Execução com Fallback
    let resposta = null;
    
    // Tenta Groq (Principal)
    if (process.env.GROQ_API_KEY) {
        resposta = await callGroq(messages);
    }
    
    // Tenta Gemini (Fallback 1)
    if (!resposta && process.env.GEMINI_API_KEY) {
        console.log('[AI] 🔄 Mudando para Gemini...');
        resposta = await callGemini(messages);
    }
    
    // Tenta OpenRouter (Fallback 2)
    if (!resposta && process.env.OPENROUTER_API_KEY) {
        console.log('[AI] 🔄 Mudando para OpenRouter...');
        resposta = await callOpenRouter(messages);
    }

    if (resposta) {
        return resposta.trim();
    }

    console.error('[AI] ❌ TODOS OS LLMs FALHARAM');
    return 'Estou com uma breve instabilidade técnica. Poderia repetir em alguns instantes? 🙏';
}

// ─── SCRAPING ─────────────────────────────────────────────────────────────────
async function scrapePage(url) {
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    let text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{3,}/g, '\n\n').trim();
    if (text.length > 12000) text = text.slice(0, 12000);
    return text;
}

async function scrapeAndSave(url, numero_wa, customTitle = null) {
    const rawText = await scrapePage(url);
    const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();
    const titulo = customTitle || `Site: ${domain}`;
    const chunks = [];
    for (let i = 0; i < rawText.length; i += 2800) {
        chunks.push(rawText.slice(i, i + 3000));
    }
    
    for (let i = 0; i < chunks.length; i++) {
        const embedding = await generateEmbedding(chunks[i]);
        await supabase.from('base_conhecimento').insert([{
            numero_wa, tipo_fonte: 'web_scraping',
            titulo_fonte: `${titulo} (P${i+1})`,
            conteudo: chunks[i], embedding, url_fonte: url,
        }]);
    }
    return { ok: true, chunks: chunks.length };
}

// ─── DIAGNÓSTICO ─────────────────────────────────────────────────────────────
async function runDiagnostics(numero_wa) {
    const result = { timestamp: new Date().toISOString(), services: {} };
    try {
        const { error } = await supabase.from('agentes_config').select('id').limit(1);
        result.services.supabase = error ? 'erro' : 'ok';
    } catch { result.services.supabase = 'falha'; }
    return result;
}

module.exports = { generateResponse, generateEmbedding, getContext, scrapeAndSave, runDiagnostics, warmupModel, supabase };