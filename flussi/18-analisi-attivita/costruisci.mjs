#!/usr/bin/env node
// 18 · ANALISI DI UN'ATTIVITÀ — la stessa analisi del giro (flusso 17), fatta su una sola attività.
//
// 24/11/2026 — Nicola: «ci deve essere l'analisi anche sull'azienda nuova che inserisco dentro MyCity:
// quando un nuovo cliente si iscrive, il workflow deve in automatico fare la stessa analisi sul suo
// business. C'è un modulo che inserisce i nuovi clienti o aggiorna gli esistenti: inseriscilo dentro
// questo modulo se è una buona idea».
//
// Come è montato: il 16 (il modulo 12 che parte da solo per le iscrizioni a MyCity) chiama questo
// flusso come ULTIMO passo di ogni iscrizione, comunque sia andata la scheda Clienti, e gli passa la
// lettura del web che il 12 ha appena fatto. Il calcolo sta qui e non dentro il 16 perché:
//   · il 16 si rigenera dal modulo 12: tenerlo uguale al 12 è la sua forza;
//   · la stessa analisi serve anche dopo (fra due settimane, su richiesta), senza rifare la ricerca;
//   · se l'analisi si guasta (database, credito di Claude), la scheda Clienti è già scritta.
//
// Cosa fa: legge dal database di MyCity, SOLO IN LETTURA e senza dati personali, la scheda dell'attività,
// i suoi prodotti, i suoi ordini, le sue recensioni e il confronto con gli altri negozi; calcola a che
// punto è per arrivare al primo incasso, coi segnali del giro; chiede a Claude il commento; lo manda a
// Nicola su Telegram.
//
// Uso: N8N_API_KEY=… node flussi/18-analisi-attivita/costruisci.mjs --manda --marketplace <id> --segreto <id>
//   --marketplace  la credenziale Supabase in sola lettura (la stessa del 17)
//   --segreto      la credenziale Header Auth del webhook (la stessa del 16)
//
// Chi lo fa partire (25/11/2026): il sito al primo abbonamento pagato, sul webhook «Su richiesta». Non più il
// 16 all'iscrizione, e il 18 non chiama più il 19: le bozze partono dal 16 (Nicola: la pagella dopo l'abbonamento).

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NOMI, trovaFlusso } from '../nomi.mjs';
import { collega } from '../chiedi-all-ad/collega.mjs';
import { NOME_CHIEDI } from '../chiedi-all-ad/costruisci.mjs';

export const NOME_18 = NOMI.analisiAttivita;
export const PERCORSO_WEBHOOK_18 = 'mycity-analisi-attivita';
const QUI = dirname(fileURLToPath(import.meta.url));
const codice = (nome) => readFileSync(join(QUI, 'codice', nome), 'utf8');
const NOME_MARKETPLACE = 'Supabase MyCity - Marketplace (lettura)';
const NOME_SEGRETO = 'MyCity - Segreto nuovo cliente';

const ID = "{{ $('Leggi la richiesta').first().json.id }}";
// Le colonne che servono, e solo quelle: niente nomi, telefoni, codici fiscali o IBAN del titolare.
export const LETTURE_18 = [
  ["Leggi l'attività", `profiles?id=eq.${ID}&select=id,role,approval_status,approval_requested_at,approved_at,created_at,store_name,store_description,store_logo,store_media,store_address,store_hours,store_site,store_customization,business_type,business_type_detail,stripe_charges_enabled,stripe_payouts_enabled,stripe_details_submitted`],
  ['Leggi i suoi prodotti', `products?seller_id=eq.${ID}&select=id,name,price,images,status,stock,created_at&order=created_at.desc&limit=1000`],
  ['Leggi i suoi ordini', `orders?seller_id=eq.${ID}&select=id,user_id,total_price,payment_status,payment_method,delivery_status,created_at,delivered_at,canceled_at,payout_at&order=created_at.desc&limit=1000`],
  ['Leggi le sue recensioni', `store_reviews?store_id=eq.${ID}&select=rating,created_at&limit=1000`],
  ['Leggi i prodotti in vendita di tutti', 'products?status=eq.available&select=seller_id&limit=10000'],
  ['Leggi i negozi approvati', 'profiles?role=eq.seller&approval_status=eq.approved&select=id&limit=1000'],
];

// I nomi dei due nodi con cui il 18 chiamava il 19 fino al 25/11/2026: il controllo li vieta.
export const PASSA_ALLE_BOZZE = 'Passa alle bozze';
export const BOZZE = 'Bozze dei 3 abbonamenti (flusso 19)';
// Il commento lo scrive l'AD col piano Max (sotto-flusso «Chiedi all'AD»), mai l'API di Claude a pagamento:
// il nodo HTTP si costruisce e poi collega() lo sostituisce coi tre nodi verso «Chiedi all'AD».
export const COMMENTO = "Dall'AD: commento";
const CHIEDI_COMMENTO = { nodo: 'Chiedi il commento a Claude', cosa: 'commento', forma: 'corpo' };

export const PER_L_ARGOMENTO = "Per l'argomento";
export const SCRIVI = "Scrivi nell'argomento (flusso 97)";
const CHAT = "={{ $('Config').first().json.TELEGRAM_CHAT_ID }}";
// Gli scarti (richiesta senza un'attività vera) vanno nel gruppo «Tecnica»; senza gruppo, nella chat privata.
const CHAT_TECNICA = "={{ $('Config').first().json.CHAT_TECNICA || $('Config').first().json.TELEGRAM_CHAT_ID }}";

export function costruisci({ telegram, chatId, marketplace, segreto, webhookId, chiedi, argomento, chatTecnica } = {}) {
  const pos = (i, riga = 0) => [i * 220, riga * 200];
  const nodi = [];
  const collega_ = {};
  const vai = (da, ...verso) => { collega_[da] = { main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) }; };
  const credTelegram = telegram || { id: 'DA_IMPOSTARE', name: 'Telegram - Bot agenzia' };

  nodi.push(
    { id: randomUUID(), name: 'Da un altro flusso', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1, position: pos(0, -1),
      parameters: { inputSource: 'passthrough' } },
    { id: randomUUID(), name: 'Su richiesta', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos(0, 1), webhookId: webhookId || randomUUID(),
      parameters: { httpMethod: 'POST', path: PERCORSO_WEBHOOK_18, authentication: 'headerAuth', responseMode: 'onReceived', options: {} },
      credentials: { httpHeaderAuth: segreto ? { id: segreto, name: NOME_SEGRETO } : { id: 'DA_IMPOSTARE', name: NOME_SEGRETO } } },
    { id: randomUUID(), name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: pos(1),
      parameters: { mode: 'manual', includeOtherFields: false, options: {}, assignments: { assignments: [
        ['SUPABASE_URL', 'https://clmpyfvpvfjgeviworth.supabase.co'],
        ['TELEGRAM_CHAT_ID', chatId || 'DA_IMPOSTARE'],
        ['CLAUDE_MODEL', 'claude-sonnet-5-5'],
        // Spento di serie: «non si paga MAI un'API di IA» (registro-fatti.json, voce ad.uso-e-crediti,
        // Nicola 1/11/2026). Numeri e segnali non ne hanno bisogno. «si» solo se Nicola decide di pagarla.
        ['COMMENTO_CLAUDE', 'no'],
        ['NEGOZI_IN_ATTESA', 'c0b240c0-2a86-4218-9d0f-5154f08ff929:2026-11-30'],
        ['ORE_ORDINE_FERMO', 2], ['ORE_PAYOUT', 24], ['GIORNI_NEGOZIO_FERMO', 14],
        // Il gruppo «Tecnica», per gli scarti. Vuoto = chat privata.
        ['CHAT_TECNICA', chatTecnica || ''],
      ].map(([name, value]) => ({ id: randomUUID(), name, value, type: typeof value === 'number' ? 'number' : 'string' })) } } },
    { id: randomUUID(), name: 'Leggi la richiesta', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(2),
      parameters: { jsCode: codice('leggi-richiesta.js') } },
  );
  vai('Da un altro flusso', 'Config');
  vai('Su richiesta', 'Config');
  vai('Config', 'Leggi la richiesta');
  const si = (expr) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
    conditions: [{ id: randomUUID(), leftValue: expr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and' }, looseTypeValidation: true, options: {} });
  nodi.push({ id: randomUUID(), name: 'Richiesta valida?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(3), parameters: si('={{ $json.valida }}') });
  vai('Leggi la richiesta', 'Richiesta valida?');
  const esc = (expr) => `String(${expr} ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')`;
  nodi.push({ id: randomUUID(), name: 'Avvisa: richiesta scartata', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: pos(4, 1),
    onError: 'continueRegularOutput',
    parameters: { resource: 'message', operation: 'sendMessage', chatId: CHAT_TECNICA,
      text: `={{ '🏪 <b>Analisi non fatta</b> · ' + ${esc('$json.nome')} + '\\nMotivo: ' + ${esc('$json.motivo')} }}`,
      additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true } },
    credentials: { telegramApi: credTelegram } });

  let prima = 'Richiesta valida?';
  let i = 4;
  for (const [nome, percorso] of LETTURE_18) {
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
  nodi.push({ id: randomUUID(), name: "Calcola l'analisi", type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(i++),
    parameters: { jsCode: codice('calcola-attivita.js') } });
  vai(prima, "Calcola l'analisi");
  nodi.push({ id: randomUUID(), name: 'Commento di Claude?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(i++),
    parameters: si("={{ /^(si|sì)$/i.test(String($('Config').first().json.COMMENTO_CLAUDE ?? '').trim()) }}") });
  vai("Calcola l'analisi", 'Commento di Claude?');
  nodi.push({ id: randomUUID(), name: 'Prepara la domanda a Claude', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(i, -1),
    parameters: { jsCode: codice('prepara-claude.js') } });
  nodi.push({ id: randomUUID(), name: 'Chiedi il commento a Claude', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.4, position: pos(i + 1, -1),
    onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 5000,
    parameters: { method: 'POST', url: 'https://api.anthropic.com/v1/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2026-10-21' }, { name: 'anthropic-beta', value: 'server-side-fallback-2026-07-01' }] },
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.richiesta) }}', options: { timeout: 90000 } } });
  vai('Commento di Claude?', 'Prepara la domanda a Claude', 'Componi il messaggio');
  vai('Prepara la domanda a Claude', 'Chiedi il commento a Claude');
  vai('Chiedi il commento a Claude', 'Componi il messaggio');
  i += 2;
  nodi.push({ id: randomUUID(), name: 'Componi il messaggio', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(i++),
    parameters: { jsCode: codice('componi-messaggio.js') } });
  // Dal 25/11/2026 l'analisi va nell'argomento del negozio, nel gruppo «Attività»: la scrive il 97. Il 18 lo
  // aspetta, così l'argomento di un negozio nuovo lo apre una volta sola.
  if (argomento) {
    nodi.push({ id: randomUUID(), name: PER_L_ARGOMENTO, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(i++),
      parameters: { jsCode: [
        "// 18 · L'analisi porta il negozio a cui appartiene: il 97 la scrive nel suo argomento.",
        "const r = $('Leggi la richiesta').first().json;",
        "const a = $(\"Calcola l'analisi\").first().json;",
        "return [{ json: { id: r.id, nome: a.nome || r.nome, messaggio: $('Componi il messaggio').first().json.messaggio } }];",
      ].join('\n') } });
    nodi.push({ id: randomUUID(), name: SCRIVI, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.3, position: pos(i++),
      onError: 'continueRegularOutput',
      parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: argomento },
        workflowInputs: { mappingMode: 'defineBelow', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true },
        mode: 'once', options: { waitForSubWorkflow: true } } });
    vai('Componi il messaggio', PER_L_ARGOMENTO);
    vai(PER_L_ARGOMENTO, SCRIVI);
  } else {
    nodi.push({ id: randomUUID(), name: 'Manda a Nicola', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: pos(i++),
      onError: 'continueRegularOutput',
      parameters: { resource: 'message', operation: 'sendMessage', chatId: CHAT,
        text: "={{ $('Componi il messaggio').first().json.messaggio }}",
        additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true } },
      credentials: { telegramApi: credTelegram } });
    vai('Componi il messaggio', 'Manda a Nicola');
  }
  // 25/11/2026 — Il 18 non chiama più il 19: le bozze dei tre abbonamenti partono dal 16, all'iscrizione,
  // con l'analisi (Nicola: l'analisi subito, la pagella dopo l'abbonamento). Il 18 parte dal sito al primo
  // abbonamento pagato (mycity, lib/agenzia/abbonamento-attivo-n8n.ts), sul webhook «Su richiesta».
  nodi.push({ id: randomUUID(), name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -660],
    parameters: { width: 760, height: 400, content: [
      "## 18 · Analisi di un'attività",
      '',
      "**Cosa fa.** La stessa analisi del giro (17) su una sola attività di MyCity: a che punto è per arrivare al primo incasso (approvazione, pagamenti con carta, vetrina, prodotti, ordini, incassi, recensioni, confronto con gli altri negozi), coi segnali del giro. Il messaggio va a Nicola su Telegram.",
      '',
      "**Il commento** (COMMENTO_CLAUDE nel Config) è spento di serie. Con «si» lo scrive l'AD col piano Max attraverso il sotto-flusso «Chiedi all'AD», mai l'API di Claude a pagamento (Nicola, 24/11/2026).",
      '',
      "**Chi la fa partire.** Il sito MyCity al primo abbonamento pagato (Nicola, 25/11/2026: la pagella arriva solo dopo l'abbonamento), sul webhook «Su richiesta» (stesso segreto del 16) con `{ \"id\": \"<id MyCity>\" }`. Lo stesso webhook serve per rifarla a mano.",
      '',
      "**Dopo.** Niente: le bozze dei 3 abbonamenti (19) partono dal 16, all'iscrizione.",
      '',
      '**Regole.** Solo lettura, niente dati personali del titolare. I numeri li fa il codice, mai Claude; «non misurato» non è zero.',
      '',
      '**Generato** da `N8N/flussi/18-analisi-attivita/costruisci.mjs`: le modifiche vanno fatte lì.',
    ].join('\n') } });

  const w = {
    name: NOME_18, nodes: nodi, connections: collega_,
    settings: { executionOrder: 'v1', timezone: 'Europe/Rome', saveManualExecutions: false, saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none', callerPolicy: 'workflowsFromSameOwner' },
  };
  return collega(w, { nodi: [CHIEDI_COMMENTO], chiediId: chiedi || 'DA_IMPOSTARE' }).flusso;
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
    if (n.credentials?.supabaseApi && n.parameters.method !== 'GET') problemi.push(`«${n.name}» scrive sul database di MyCity`);
    for (const c of Object.values(n.credentials || {})) if (c.id === 'DA_IMPOSTARE' || String(c.id).startsWith('SEGNAPOSTO')) problemi.push(`«${n.name}» non ha la credenziale`);
  }
  for (const [da, uscite] of Object.entries(w.connections)) {
    if (!nomi.has(da)) problemi.push(`collegamento da un nodo che non esiste: «${da}»`);
    for (const ramo of uscite.main || []) for (const v of ramo || []) if (!nomi.has(v.node)) problemi.push(`collegamento verso «${v.node}», che non esiste`);
  }
  const chiedi = w.nodes.find((n) => n.type === 'n8n-nodes-base.executeWorkflow' && n.name.startsWith("Chiedi all'AD"));
  if (!chiedi) problemi.push("il commento non passa da «Chiedi all'AD»");
  else if (chiedi.parameters.workflowId.value === 'DA_IMPOSTARE') problemi.push("manca l'id del flusso «Chiedi all'AD»");
  if (w.nodes.some((n) => JSON.stringify(n.parameters || {}).includes('api.anthropic.com'))) problemi.push("il 18 chiama l'API di Claude a pagamento");
  // 25/11/2026 — Le bozze partono dal 16 all'iscrizione: se il 18 chiamasse il 19, arriverebbero due volte.
  if (w.nodes.some((n) => n.name === BOZZE || n.name === PASSA_ALLE_BOZZE)) problemi.push('il 18 non deve chiamare il 19: le bozze partono dal 16');
  const scrivi = w.nodes.find((n) => n.name === SCRIVI);
  if (scrivi && scrivi.parameters?.options?.waitForSubWorkflow !== true) problemi.push("il 18 deve aspettare il 97, se no l'argomento di un negozio nuovo si apre due volte");
  for (const n of w.nodes) if (n.type === 'n8n-nodes-base.telegram' && ![CHAT, CHAT_TECNICA].includes(n.parameters.chatId)) problemi.push(`«${n.name}» scrive a una chat che non è nel Config`);
  const webhook = w.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
  if (!webhook || webhook.parameters.authentication !== 'headerAuth') problemi.push('il webhook non chiede il segreto');
  if (w.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments.find((a) => a.name === 'TELEGRAM_CHAT_ID').value === 'DA_IMPOSTARE') {
    problemi.push('manca la chat Telegram di Nicola');
  }
  return problemi;
}

async function principale(argv) {
  const valore = (nome) => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : undefined; };
  let pezzi = { marketplace: valore('--marketplace'), segreto: valore('--segreto'), argomento: valore('--argomento'), chatTecnica: valore('--tecnica') };
  let api = null;
  if (argv.includes('--manda')) {
    api = await import('../n8n-api.mjs');
    const tutti = await api.elencoFlussi();
    const m12 = trovaFlusso(tutti, NOMI.nuovoCliente);
    if (!m12) throw new Error('Non trovo il modulo 12 su n8n: da lì prendo chat e credenziali.');
    const gia = trovaFlusso(tutti, NOME_18);
    pezzi = { ...pezzi,
      telegram: m12.nodes.find((n) => n.type === 'n8n-nodes-base.telegram')?.credentials?.telegramApi,
      chiedi: trovaFlusso(tutti, NOME_CHIEDI)?.id,
      chatId: String(m12.nodes.find((n) => n.name === 'Config')?.parameters?.assignments?.assignments?.find((a) => a.name === 'TELEGRAM_CHAT_ID')?.value || ''),
      webhookId: gia?.nodes?.find((n) => n.name === 'Su richiesta')?.webhookId,
      argomento: pezzi.argomento || trovaFlusso(tutti, NOMI.argomentoAttivita)?.id,
      chatTecnica: pezzi.chatTecnica ?? gia?.nodes?.find((n) => n.name === 'Config')?.parameters?.assignments?.assignments?.find((a) => a.name === 'CHAT_TECNICA')?.value };
  }
  const w = costruisci(pezzi);
  if (valore('--scrivi')) writeFileSync(valore('--scrivi'), JSON.stringify(w, null, 2));
  const problemi = controlla(w).filter((p) => argv.includes('--manda') || !/credenziale|chat Telegram|Chiedi all'AD»$/.test(p));
  if (problemi.length) { console.error('Il 18 non va bene:\n- ' + problemi.join('\n- ')); process.exit(1); }
  console.log(`18 costruito: ${w.nodes.length} nodi, controlli a posto.`);
  if (api) {
    const esito = await api.creaOAggiorna(w);
    console.log(`${esito.creato ? 'Creato' : 'Aggiornato'} su n8n: id ${esito.id}, ${esito.attivo ? 'ACCESO' : 'spento'}.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principale(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
