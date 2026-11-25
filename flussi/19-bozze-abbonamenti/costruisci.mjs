#!/usr/bin/env node
// 19 · BOZZE DEI 3 ABBONAMENTI — per un'attività nuova di MyCity, le tre proposte (Base, Business, Premium)
// pronte da mandare, costruite sui suoi dati.
//
// 25/11/2026 — Nicola: «crea un flusso con n8n che analizza la nuova azienda e prepara bozze dei 3
// abbonamenti del sito».
//
// Come è montato: iscrizione su MyCity → 16 (la scheda Clienti col modulo 12) → 18 (l'analisi
// dell'attività) → 19 (le bozze). Il 18, come ultimo passo, chiama questo flusso senza aspettarlo e gli
// passa l'attività con la scheda della ricerca sul web. Le bozze stanno in un flusso a parte perché:
//   · si rifanno da sole quando servono (webhook «Su richiesta»), senza rifare analisi e ricerca;
//   · se si guastano, la scheda e l'analisi sono già arrivate.
//
// Cosa fa: legge dal database di MyCity, SOLO IN LETTURA e senza dati personali del titolare, la vetrina
// dell'attività, i suoi prodotti e i canoni dalle impostazioni del sito; il codice scrive le tre bozze
// coi testi del listino del sito e i dati veri della vetrina; tutto va a Nicola su Telegram (un riepilogo
// e una bozza per abbonamento). Al titolare non parte niente: le bozze le manda Nicola, se vuole.
// Niente IA: «non si paga MAI un'API di IA» (registro dei fatti, ad.uso-e-crediti).
//
// Uso: N8N_API_KEY=… node flussi/19-bozze-abbonamenti/costruisci.mjs --manda --marketplace <id> --segreto <id>
//      node flussi/19-bozze-abbonamenti/costruisci.mjs --sdk <file>   (il codice SDK, per caricarlo col collegamento MCP)
//   --marketplace  la credenziale Supabase in sola lettura (la stessa del 17 e del 18)
//   --segreto      la credenziale Header Auth del webhook (la stessa del 16 e del 18)
//   --telegram, --chat  credenziale e chat di Telegram, quando non si passa da --manda

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NOMI, trovaFlusso } from '../nomi.mjs';

export const NOME_19 = NOMI.bozzeAbbonamenti;
export const PERCORSO_WEBHOOK_19 = 'mycity-bozze-abbonamenti';
const QUI = dirname(fileURLToPath(import.meta.url));
const codice = (nome) => readFileSync(join(QUI, 'codice', nome), 'utf8');
const NOME_MARKETPLACE = 'Supabase MyCity - Marketplace (lettura)';
const NOME_SEGRETO = 'MyCity - Segreto nuovo cliente';
const NOME_TELEGRAM = 'Telegram - Bot agenzia';
const CHAT = "={{ $('Config').first().json.TELEGRAM_CHAT_ID }}";

const ID = "{{ $('Leggi la richiesta').first().json.id }}";
// Le colonne che servono, e solo quelle: niente nomi, telefoni, codici fiscali, IBAN o indirizzi del titolare.
export const LETTURE_19 = [
  ["Leggi l'attività", `profiles?id=eq.${ID}&select=id,role,approval_status,store_name,store_media,store_customization,business_type,business_type_detail`],
  // Gli stessi stati che il sito conta come «in catalogo» (lib/agenzia/leggi-preventivo.ts).
  ['Leggi i suoi prodotti', `products?seller_id=eq.${ID}&status=in.(available,draft,out_of_stock,pending_approval)&select=id,images&limit=2000`],
  ['Leggi i canoni del sito', 'site_settings?id=eq.1&select=agenzia'],
];

export function costruisci({ telegram, chatId, marketplace, segreto, webhookId } = {}) {
  const pos = (i, riga = 0) => [i * 220, riga * 200];
  const nodi = [];
  const collega = {};
  const vai = (da, ...verso) => { collega[da] = { main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) }; };
  const credTelegram = telegram || { id: 'DA_IMPOSTARE', name: NOME_TELEGRAM };
  const telegramA = (nome, posizione, testo) => ({ id: randomUUID(), name: nome, type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: posizione,
    onError: 'continueRegularOutput',
    parameters: { resource: 'message', operation: 'sendMessage', chatId: CHAT, text: testo,
      additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true } },
    credentials: { telegramApi: credTelegram } });

  nodi.push(
    { id: randomUUID(), name: 'Da un altro flusso', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1, position: pos(0, -1),
      parameters: { inputSource: 'passthrough' } },
    { id: randomUUID(), name: 'Su richiesta', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos(0, 1), webhookId: webhookId || randomUUID(),
      parameters: { httpMethod: 'POST', path: PERCORSO_WEBHOOK_19, authentication: 'headerAuth', responseMode: 'onReceived', options: {} },
      credentials: { httpHeaderAuth: segreto ? { id: segreto, name: NOME_SEGRETO } : { id: 'DA_IMPOSTARE', name: NOME_SEGRETO } } },
    { id: randomUUID(), name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: pos(1),
      parameters: { mode: 'manual', includeOtherFields: false, options: {}, assignments: { assignments: [
        ['SUPABASE_URL', 'https://clmpyfvpvfjgeviworth.supabase.co'],
        ['TELEGRAM_CHAT_ID', chatId || 'DA_IMPOSTARE'],
      ].map(([name, value]) => ({ id: randomUUID(), name, value, type: 'string' })) } } },
    { id: randomUUID(), name: 'Leggi la richiesta', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(2),
      parameters: { jsCode: codice('leggi-richiesta.js') } },
  );
  vai('Da un altro flusso', 'Config');
  vai('Su richiesta', 'Config');
  vai('Config', 'Leggi la richiesta');
  nodi.push({ id: randomUUID(), name: 'Richiesta valida?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(3),
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
      conditions: [{ id: randomUUID(), leftValue: '={{ $json.valida }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and' }, looseTypeValidation: true, options: {} } });
  vai('Leggi la richiesta', 'Richiesta valida?');
  const esc = (expr) => `String(${expr} ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')`;
  nodi.push(telegramA('Avvisa: richiesta scartata', pos(4, 1), `={{ '📝 <b>Bozze non fatte</b> · ' + ${esc('$json.nome')} + '\\nMotivo: ' + ${esc('$json.motivo')} }}`));

  let prima = 'Richiesta valida?';
  let i = 4;
  for (const [nome, percorso] of LETTURE_19) {
    nodi.push({ id: randomUUID(), name: nome, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(i++),
      executeOnce: true, onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000,
      parameters: { method: 'GET', url: `={{ $('Config').first().json.SUPABASE_URL }}/rest/v1/${percorso}`,
        authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
        sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: 'count=exact' }] },
        options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 30000 } },
      credentials: { supabaseApi: marketplace ? { id: marketplace, name: NOME_MARKETPLACE } : { id: 'SEGNAPOSTO_SUPABASE_MARKETPLACE', name: NOME_MARKETPLACE } } });
    if (prima === 'Richiesta valida?') vai(prima, nome, 'Avvisa: richiesta scartata'); else vai(prima, nome);
    prima = nome;
  }
  nodi.push({ id: randomUUID(), name: 'Prepara le bozze', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(i++),
    parameters: { jsCode: codice('prepara-bozze.js') } });
  vai(prima, 'Prepara le bozze');
  // Un messaggio per voce: il riepilogo, poi Base, Business e Premium (il codice ne esce con quattro).
  nodi.push(telegramA('Manda a Nicola', pos(i++), '={{ $json.messaggio }}'));
  vai('Prepara le bozze', 'Manda a Nicola');
  nodi.push({ id: randomUUID(), name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -660],
    parameters: { width: 760, height: 420, content: [
      '## 19 · Bozze dei 3 abbonamenti',
      '',
      "**Cosa fa.** Per un'attività di MyCity prepara le tre proposte di abbonamento (Base, Business, Premium) coi testi del listino del sito e i dati veri della sua vetrina: prodotti senza foto, foto del locale, video, sito, social e scheda Google indicati, più la ricerca sul web del modulo 12 se c'è. Segna quella consigliata con la stessa regola del sito. I canoni li legge dalle impostazioni del sito.",
      '',
      "**Dove vanno.** A Nicola su Telegram: un riepilogo e una bozza per abbonamento, da copiare su WhatsApp dopo averla letta. **Al titolare non parte niente.** Niente IA a pagamento: le scrive il codice.",
      '',
      "**Chi lo fa partire.** Il 18 (analisi di un'attività), come ultimo passo. Oppure il webhook «Su richiesta» (stesso segreto del 16) con `{ \"id\": \"<id MyCity>\" }`.",
      '',
      '**Generato** da `N8N/flussi/19-bozze-abbonamenti/costruisci.mjs`: le modifiche vanno fatte lì. Il listino nel codice è copiato dal sito: una prova lo confronta.',
    ].join('\n') } });

  return {
    name: NOME_19, nodes: nodi, connections: collega,
    settings: { executionOrder: 'v1', timezone: 'Europe/Rome', saveManualExecutions: false, saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none', callerPolicy: 'workflowsFromSameOwner' },
  };
}

/** I problemi del flusso costruito (vuoto = a posto). */
export function controlla(w) {
  const problemi = [];
  const nomi = new Set(w.nodes.map((n) => n.name));
  if (nomi.size !== w.nodes.length) problemi.push('due nodi con lo stesso nome');
  const ammessi = new Set(['n8n-nodes-base.executeWorkflowTrigger', 'n8n-nodes-base.webhook', 'n8n-nodes-base.set', 'n8n-nodes-base.code',
    'n8n-nodes-base.if', 'n8n-nodes-base.httpRequest', 'n8n-nodes-base.telegram', 'n8n-nodes-base.stickyNote']);
  for (const n of w.nodes) {
    const s = JSON.stringify(n.parameters || {});
    for (const m of s.matchAll(/\$\(\\"(.+?)\\"\)|\$\('([^']+)'\)/g)) {
      const citato = m[1] ?? m[2];
      if (!nomi.has(citato)) problemi.push(`«${n.name}» cita «${citato}», che non esiste`);
    }
    // Le bozze non partono mai da sole: niente nodi che scrivono a qualcuno che non sia Nicola.
    if (!ammessi.has(n.type)) problemi.push(`«${n.name}» è un nodo di tipo ${n.type}, che qui non serve`);
    if (n.type === 'n8n-nodes-base.telegram' && n.parameters.chatId !== CHAT) problemi.push(`«${n.name}» scrive a una chat che non è quella di Nicola nel Config`);
    if (n.type === 'n8n-nodes-base.httpRequest') {
      if (n.parameters.method !== 'GET') problemi.push(`«${n.name}» non è una lettura`);
      if (!String(n.parameters.url).startsWith("={{ $('Config').first().json.SUPABASE_URL }}/rest/v1/")) problemi.push(`«${n.name}» chiama un indirizzo che non è il database di MyCity`);
      if (/legal_|iban|fiscal|phone|email|first_name|last_name|birth/i.test(n.parameters.url)) problemi.push(`«${n.name}» legge dati personali del titolare`);
    }
    for (const c of Object.values(n.credentials || {})) if (c.id === 'DA_IMPOSTARE' || String(c.id).startsWith('SEGNAPOSTO')) problemi.push(`«${n.name}» non ha la credenziale`);
  }
  for (const [da, uscite] of Object.entries(w.connections)) {
    if (!nomi.has(da)) problemi.push(`collegamento da un nodo che non esiste: «${da}»`);
    for (const ramo of uscite.main || []) for (const v of ramo || []) if (!nomi.has(v.node)) problemi.push(`collegamento verso «${v.node}», che non esiste`);
  }
  const webhook = w.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
  if (!webhook || webhook.parameters.authentication !== 'headerAuth') problemi.push('il webhook non chiede il segreto');
  if (w.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments.find((a) => a.name === 'TELEGRAM_CHAT_ID').value === 'DA_IMPOSTARE') {
    problemi.push('manca la chat Telegram di Nicola');
  }
  return problemi;
}

async function principale(argv) {
  const valore = (nome) => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : undefined; };
  let pezzi = { marketplace: valore('--marketplace'), segreto: valore('--segreto'), chatId: valore('--chat'),
    telegram: valore('--telegram') ? { id: valore('--telegram'), name: NOME_TELEGRAM } : undefined };
  let api = null;
  if (argv.includes('--manda')) {
    api = await import('../n8n-api.mjs');
    const tutti = await api.elencoFlussi();
    const m12 = trovaFlusso(tutti, NOMI.nuovoCliente);
    if (!m12) throw new Error('Non trovo il modulo 12 su n8n: da lì prendo chat e credenziali.');
    const gia = trovaFlusso(tutti, NOME_19);
    pezzi = { ...pezzi,
      telegram: m12.nodes.find((n) => n.type === 'n8n-nodes-base.telegram')?.credentials?.telegramApi,
      chatId: String(m12.nodes.find((n) => n.name === 'Config')?.parameters?.assignments?.assignments?.find((a) => a.name === 'TELEGRAM_CHAT_ID')?.value || ''),
      webhookId: gia?.nodes?.find((n) => n.name === 'Su richiesta')?.webhookId };
  }
  const w = costruisci(pezzi);
  if (valore('--scrivi')) writeFileSync(valore('--scrivi'), JSON.stringify(w, null, 2));
  const completo = argv.includes('--manda') || argv.includes('--sdk');
  const problemi = controlla(w).filter((p) => completo || !/credenziale|chat Telegram/.test(p));
  if (problemi.length) { console.error('Il 19 non va bene:\n- ' + problemi.join('\n- ')); process.exit(1); }
  if (valore('--sdk')) {
    const { inSdk } = await import('../in-sdk.mjs');
    writeFileSync(valore('--sdk'), inSdk(w));
    console.log(`Codice SDK scritto in ${valore('--sdk')}.`);
  }
  console.log(`19 costruito: ${w.nodes.length} nodi, controlli a posto.`);
  if (api) {
    const esito = await api.creaOAggiorna(w);
    console.log(`${esito.creato ? 'Creato' : 'Aggiornato'} su n8n: id ${esito.id}, ${esito.attivo ? 'ACCESO' : 'spento'}.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principale(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
