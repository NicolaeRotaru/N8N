#!/usr/bin/env node
// 17 · ANALISI DEL MARKETPLACE — il giro dell'AD sui numeri di MyCity, come flusso n8n.
//
// 24/11/2026 — Nicola: «cerca di capire l'analisi che ad-mycity fa sul marketplace (radiografia
// esclusa) e rendila un workflow con n8n».
//
// Ogni mattina alle 8:10 (e quando lo avvii a mano):
//   1. legge dal database di MyCity, SOLO IN LETTURA: ordini, profili (ruolo e stato, niente dati
//      personali), prodotti, carrelli, recensioni, quanti lead di negozi; e guarda se il sito risponde;
//   2. calcola i numeri chiave del giro e le sentinelle, con le stesse soglie dell'AD;
//   3. li confronta col giro prima (▲▼);
//   4. chiede a Claude il commento — il punto adesso, cosa propone, opportunità, rischi — senza dargli
//      il potere di cambiare un numero;
//   5. manda il briefing a Nicola su Telegram;
//   6. se acceso nel Config, salva il riassunto nella memoria dell'AD (la card in alto del Pannello).
//
// Il codice dei nodi sta in codice/*.js (si prova con node --test flussi/test/). Questo programma
// mette insieme il flusso e lo carica su n8n, SPENTO.
//
// Uso: N8N_API_KEY=… node flussi/17-analisi-marketplace/costruisci.mjs [--manda] [--marketplace <id credenziale>] [--scrivi <path>]
// Con --manda prende da n8n (dal modulo 12) la chat Telegram e le credenziali di Telegram e Claude,
// che nel repository non stanno: il repository è pubblico.

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NOMI, trovaFlusso } from '../nomi.mjs';

export const NOME_17 = NOMI.analisiMarketplace;
const QUI = dirname(fileURLToPath(import.meta.url));
const codice = (nome) => readFileSync(join(QUI, 'codice', nome), 'utf8');

export const CREDENZIALE_MARKETPLACE = { id: 'SEGNAPOSTO_SUPABASE_MARKETPLACE', name: 'Supabase MyCity - Marketplace (lettura)' };
export const CREDENZIALE_MEMORIA = { id: 'SEGNAPOSTO_SUPABASE_MEMORIA', name: 'Supabase memoria AD - Briefing' };

// Le colonne che servono, e solo quelle: niente nomi, telefoni, indirizzi o codici fiscali.
export const LETTURE = [
  ['Leggi gli ordini', 'orders?select=id,user_id,seller_id,total_price,payment_status,payment_method,delivery_status,created_at,delivered_at,canceled_at,payout_at&order=created_at.desc&limit=10000'],
  ['Leggi i profili', 'profiles?select=id,role,approval_status,approval_requested_at,approved_at,created_at,store_name,stripe_charges_enabled,stripe_payouts_enabled&limit=10000'],
  ['Leggi i prodotti', 'products?select=id,seller_id,status&limit=10000'],
  ['Leggi i carrelli', 'abandoned_carts?select=recovered,recovery_email_sent_at,last_activity&limit=10000'],
  ['Leggi le recensioni dei prodotti', 'reviews?select=rating,created_at&limit=10000'],
  ['Leggi le recensioni dei negozi', 'store_reviews?select=rating,created_at&limit=10000'],
];

export function costruisci({ telegram, anthropic, chatId, marketplace } = {}) {
  const credMarketplace = marketplace ? { id: marketplace, name: CREDENZIALE_MARKETPLACE.name } : CREDENZIALE_MARKETPLACE;
  const pos = (i, riga = 0) => [i * 220, riga * 200];
  const nodi = [];
  const collega = {};
  const vai = (da, ...verso) => { collega[da] = { main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) }; };
  const leggi = (nome, i) => ({
    id: randomUUID(), name: nome, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(i),
    executeOnce: true, onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000,
    parameters: { method: 'GET', url: '', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: 'count=exact' }] },
      options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 30000 } },
    credentials: { supabaseApi: credMarketplace },
  });

  nodi.push(
    { id: randomUUID(), name: 'Ogni mattina', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(0, -1),
      parameters: { rule: { interval: [{ field: 'cronExpression', expression: '10 8 * * *' }] } } },
    { id: randomUUID(), name: 'Avvia a mano', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0, 1), parameters: {} },
    { id: randomUUID(), name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: pos(1),
      parameters: { mode: 'manual', includeOtherFields: false, options: {}, assignments: { assignments: [
        ['SUPABASE_URL', 'https://clmpyfvpvfjgeviworth.supabase.co'],
        ['SITO_URL', 'https://mycity-phi.vercel.app'],
        ['TELEGRAM_CHAT_ID', chatId || 'DA_IMPOSTARE'],
        ['CLAUDE_MODEL', 'claude-sonnet-5-5'],
        // Spento di serie: «non si paga MAI un'API di IA» (registro-fatti.json, voce ad.uso-e-crediti,
        // Nicola 1/11/2026). Numeri e segnali non ne hanno bisogno. «si» solo se Nicola decide di pagarla.
        ['COMMENTO_CLAUDE', 'no'],
        // Negozi in attesa concordata con Nicola (non sono churn): «id:AAAA-MM-GG», separati da virgola.
        // Dopo la data tornano normali. Fonte: registro-fatti.json, voce negozi.attesa-concordata.
        ['NEGOZI_IN_ATTESA', 'c0b240c0-2a86-4218-9d0f-5154f08ff929:2026-11-30'],
        ['ORE_ORDINE_FERMO', 2], ['ORE_PAYOUT', 24], ['ORE_CARRELLO', 4], ['GIORNI_NEGOZIO_FERMO', 14],
        ['CALO_SOGLIA', 0.7], ['CALO_MEDIA_MINIMA', 3],
        ['SALVA_NEL_PANNELLO', 'no'],
        ['MEMORIA_URL', ''],
      ].map(([name, value]) => ({ id: randomUUID(), name, value, type: typeof value === 'number' ? 'number' : 'string' })) } } },
  );
  vai('Ogni mattina', 'Config');
  vai('Avvia a mano', 'Config');

  let prima = 'Config';
  let i = 2;
  for (const [nome, percorso] of LETTURE) {
    const n = leggi(nome, i++);
    n.parameters.url = `={{ $('Config').first().json.SUPABASE_URL }}/rest/v1/${percorso}`;
    nodi.push(n); vai(prima, nome); prima = nome;
  }
  const lead = leggi('Leggi i lead dei negozi', i++);
  lead.parameters.method = 'HEAD';
  lead.parameters.url = "={{ $('Config').first().json.SUPABASE_URL }}/rest/v1/merchants_leads?select=*";
  nodi.push(lead); vai(prima, lead.name); prima = lead.name;
  for (const [nome, percorso] of [['Guarda il sito', '/'], ['Guarda il controllo «pronto»', '/api/health/ready']]) {
    nodi.push({ id: randomUUID(), name: nome, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(i++),
      executeOnce: true, onError: 'continueRegularOutput',
      parameters: { method: 'GET', url: `={{ $('Config').first().json.SITO_URL }}${percorso}`,
        options: { response: { response: { fullResponse: true, neverError: true, responseFormat: 'text' } }, timeout: 20000 } } });
    vai(prima, nome); prima = nome;
  }

  nodi.push({ id: randomUUID(), name: 'Calcola i numeri', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(i++),
    parameters: { jsCode: codice('calcola-numeri.js') } });
  vai(prima, 'Calcola i numeri');
  const si = (expr) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
    conditions: [{ id: randomUUID(), leftValue: expr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and' }, looseTypeValidation: true, options: {} });
  nodi.push({ id: randomUUID(), name: 'Commento di Claude?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(i++),
    parameters: si("={{ /^(si|sì)$/i.test(String($('Config').first().json.COMMENTO_CLAUDE ?? '').trim()) }}") });
  vai('Calcola i numeri', 'Commento di Claude?');
  nodi.push({ id: randomUUID(), name: 'Prepara la domanda a Claude', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(i, -1),
    parameters: { jsCode: codice('prepara-claude.js') } });
  nodi.push({ id: randomUUID(), name: 'Chiedi il commento a Claude', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.4, position: pos(i + 1, -1),
    onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 5000,
    parameters: { method: 'POST', url: 'https://api.anthropic.com/v1/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2026-10-21' }, { name: 'anthropic-beta', value: 'server-side-fallback-2026-07-01' }] },
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.richiesta) }}', options: { timeout: 90000 } },
    credentials: { httpHeaderAuth: anthropic || { id: 'DA_IMPOSTARE', name: 'Anthropic API' } } });
  vai('Commento di Claude?', 'Prepara la domanda a Claude', 'Componi il messaggio');
  vai('Prepara la domanda a Claude', 'Chiedi il commento a Claude');
  vai('Chiedi il commento a Claude', 'Componi il messaggio');
  i += 2;
  nodi.push({ id: randomUUID(), name: 'Componi il messaggio', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(i++),
    parameters: { jsCode: codice('componi-messaggio.js') } });
  nodi.push({ id: randomUUID(), name: 'Manda a Nicola', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: pos(i++),
    onError: 'continueRegularOutput',
    parameters: { resource: 'message', operation: 'sendMessage', chatId: "={{ $('Config').first().json.TELEGRAM_CHAT_ID }}",
      text: "={{ $('Componi il messaggio').first().json.messaggio }}",
      additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true } },
    credentials: { telegramApi: telegram || { id: 'DA_IMPOSTARE', name: 'Telegram - Bot agenzia' } } });
  vai('Componi il messaggio', 'Manda a Nicola');
  nodi.push({ id: randomUUID(), name: 'Salvo nel Pannello?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(i++),
    parameters: si("={{ /^(si|sì)$/i.test(String($('Config').first().json.SALVA_NEL_PANNELLO ?? '').trim()) && /^https:\\/\\//.test(String($('Config').first().json.MEMORIA_URL ?? '')) }}") });
  vai('Manda a Nicola', 'Salvo nel Pannello?');
  nodi.push({ id: randomUUID(), name: 'Salva nel Pannello', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(i++),
    onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: "={{ $('Config').first().json.MEMORIA_URL }}/rest/v1/briefings",
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: 'return=minimal' }] },
      sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify($('Componi il messaggio').first().json.riga_pannello) }}",
      options: { timeout: 20000 } },
    credentials: { supabaseApi: CREDENZIALE_MEMORIA } });
  vai('Salvo nel Pannello?', 'Salva nel Pannello');
  nodi.push({ id: randomUUID(), name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -620],
    parameters: { width: 760, height: 380, content: [
      '## 17 · Analisi del marketplace',
      '',
      "**Cosa fa.** Ogni mattina alle 8:10 legge il database di MyCity (solo lettura), calcola i numeri chiave e le sentinelle del giro dell'AD, li confronta col giro prima e manda il briefing a Nicola su Telegram. La radiografia non c'è.",
      '',
      "**Il commento di Claude** (COMMENTO_CLAUDE nel Config) è spento di serie: «non si paga MAI un'API di IA» (registro dei fatti, ad.uso-e-crediti). Si accende con «si» solo se Nicola lo decide.",
      '',
      "**Regole.** I numeri li fa il codice, mai Claude. Una tabella che non si legge è «non misurato», mai zero. Nessun dato personale letto.",
      '',
      "**Per accenderlo.** Apri la credenziale «Supabase MyCity - Marketplace (lettura)» e incolla la chiave del database di MyCity (la stessa di MARKETPLACE_SUPABASE_KEY dell'AD). Poi accendi il flusso.",
      '',
      '**Generato** da `N8N/flussi/17-analisi-marketplace/costruisci.mjs`: le modifiche vanno fatte lì.',
    ].join('\n') } });

  return {
    name: NOME_17, nodes: nodi, connections: collega,
    settings: { executionOrder: 'v1', timezone: 'Europe/Rome', saveManualExecutions: true, saveDataErrorExecution: 'all',
      saveDataSuccessExecution: 'none', callerPolicy: 'workflowsFromSameOwner' },
  };
}

/** I problemi del flusso costruito (vuoto = a posto). */
export function controlla(w) {
  const problemi = [];
  const nomi = new Set(w.nodes.map((n) => n.name));
  if (nomi.size !== w.nodes.length) problemi.push('due nodi con lo stesso nome');
  for (const n of w.nodes) {
    const s = JSON.stringify(n.parameters || {});
    for (const m of s.matchAll(/\$\(\\"(.+?)\\"\)|\$\('([^']+)'\)/g)) {
      const citato = m[1] ?? m[2];
      if (!nomi.has(citato)) problemi.push(`«${n.name}» cita «${citato}», che non esiste`);
    }
    if (n.type === 'n8n-nodes-base.httpRequest' && n.parameters.method !== 'GET' && n.parameters.method !== 'HEAD' && n.name !== 'Chiedi il commento a Claude' && n.name !== 'Salva nel Pannello') {
      problemi.push(`«${n.name}» scrive (${n.parameters.method}): il database di MyCity si legge e basta`);
    }
    if (n.credentials?.supabaseApi?.name === CREDENZIALE_MARKETPLACE.name && n.parameters.method !== 'GET' && n.parameters.method !== 'HEAD') {
      problemi.push(`«${n.name}» usa la chiave del marketplace per scrivere`);
    }
  }
  for (const [da, uscite] of Object.entries(w.connections)) {
    if (!nomi.has(da)) problemi.push(`collegamento da un nodo che non esiste: «${da}»`);
    for (const ramo of uscite.main || []) for (const v of ramo || []) if (!nomi.has(v.node)) problemi.push(`collegamento verso «${v.node}», che non esiste`);
  }
  for (const n of w.nodes.filter((x) => x.credentials)) {
    for (const c of Object.values(n.credentials)) if (c.id === 'DA_IMPOSTARE') problemi.push(`«${n.name}» non ha la credenziale`);
  }
  if (w.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments.find((a) => a.name === 'TELEGRAM_CHAT_ID').value === 'DA_IMPOSTARE') {
    problemi.push('manca la chat Telegram di Nicola');
  }
  return problemi;
}

async function principale(argv) {
  const valore = (nome) => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : undefined; };
  let pezzi = {};
  let api = null;
  if (argv.includes('--manda')) {
    api = await import('../n8n-api.mjs');
    const m12 = trovaFlusso(await api.elencoFlussi(), NOMI.nuovoCliente);
    if (!m12) throw new Error('Non trovo il modulo 12 su n8n: da lì prendo chat e credenziali.');
    const tg = m12.nodes.find((n) => n.type === 'n8n-nodes-base.telegram')?.credentials?.telegramApi;
    const an = m12.nodes.find((n) => n.name === 'Cerca il locale con Claude')?.credentials?.httpHeaderAuth;
    const chat = m12.nodes.find((n) => n.name === 'Config')?.parameters?.assignments?.assignments?.find((a) => a.name === 'TELEGRAM_CHAT_ID')?.value;
    pezzi = { telegram: tg, anthropic: an, chatId: chat ? String(chat) : undefined, marketplace: valore('--marketplace') };
  }
  const w = costruisci(pezzi);
  if (valore('--scrivi')) writeFileSync(valore('--scrivi'), JSON.stringify(w, null, 2));
  const problemi = controlla(w).filter((p) => argv.includes('--manda') || !/credenziale|chat Telegram/.test(p));
  if (problemi.length) { console.error('Il 17 non va bene:\n- ' + problemi.join('\n- ')); process.exit(1); }
  console.log(`17 costruito: ${w.nodes.length} nodi, controlli a posto.`);
  if (api) {
    const esito = await api.creaOAggiorna(w);
    console.log(`${esito.creato ? 'Creato' : 'Aggiornato'} su n8n: id ${esito.id}, ${esito.attivo ? 'ACCESO' : 'spento'}.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principale(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
