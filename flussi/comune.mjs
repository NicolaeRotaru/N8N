// I pezzi comuni ai flussi che portano in n8n il lavoro meccanico dell'AD (21, 22, 23, 98).
//
// Il repository è pubblico: chat Telegram, credenziali e l'indirizzo del «99 · Avvisi errori» non
// stanno qui. Si prendono da n8n quando si carica il flusso (--manda).

import { randomUUID } from 'node:crypto';
import { NOMI, trovaFlusso } from './nomi.mjs';

// I nomi dei flussi stanno in nomi.mjs: trovaFlusso trova anche il nome di prima della numerazione nuova.
export const NOME_AVVISI_ERRORI = NOMI.avvisiErrori;
export const NOME_MODULO_12 = NOMI.nuovoCliente;
export const NOME_CHIEDI = NOMI.chiediAllAd;
export const CREDENZIALE_MARKETPLACE = { id: 'SEGNAPOSTO_SUPABASE_MARKETPLACE', name: 'Supabase MyCity - Marketplace (lettura)' };

/** Una voce del nodo Config. */
export const voce = ([name, value]) => ({ id: randomUUID(), name, value, type: typeof value === 'number' ? 'number' : 'string' });

/** Il nodo Config (un Set) con le voci date. */
export const nodoConfig = (voci, position = [220, 0]) => ({
  id: randomUUID(), name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position,
  parameters: { mode: 'manual', includeOtherFields: false, options: {}, assignments: { assignments: voci.map(voce) } },
});

/** Una lettura del database di MyCity, sola lettura, che non ferma il flusso se fallisce. */
export const letturaSupabase = (nome, percorso, position, marketplace) => ({
  id: randomUUID(), name: nome, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position,
  executeOnce: true, onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000,
  parameters: { method: 'GET', url: `={{ $('Config').first().json.SUPABASE_URL }}/rest/v1/${percorso}`,
    authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
    sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: 'count=exact' }] },
    options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 30000 } },
  credentials: { supabaseApi: marketplace ? { id: marketplace, name: CREDENZIALE_MARKETPLACE.name } : CREDENZIALE_MARKETPLACE },
});

/** Un IF che passa quando l'espressione è vera. */
export const condizione = (expr) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
  conditions: [{ id: randomUUID(), leftValue: expr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' }, looseTypeValidation: true, options: {} });

/** Il nodo che manda il testo a Nicola su Telegram. */
export const nodoTelegram = (nome, testoExpr, position, telegram) => ({
  id: randomUUID(), name: nome, type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position, onError: 'continueRegularOutput',
  parameters: { resource: 'message', operation: 'sendMessage', chatId: "={{ $('Config').first().json.TELEGRAM_CHAT_ID }}",
    text: testoExpr, additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true } },
  credentials: { telegramApi: telegram || { id: 'DA_IMPOSTARE', name: 'Telegram - Bot agenzia' } },
});

/**
 * Il nodo che chiama il sotto-flusso «Chiedi all'AD» (sessione B): aspetta la risposta (al massimo
 * 15 minuti dentro il sotto-flusso) e non ferma il flusso se si guasta: c'è sempre un ripiego.
 */
export const nodoChiediAllAD = (nome, idChiedi, position) => ({
  id: randomUUID(), name: nome, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.3, position, onError: 'continueRegularOutput',
  parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: idChiedi || 'DA_IMPOSTARE', cachedResultName: NOME_CHIEDI },
    workflowInputs: { mappingMode: 'defineBelow', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true },
    mode: 'once', options: { waitForSubWorkflow: true } },
});

/** Le impostazioni comuni: ogni errore va al 99, gli esiti buoni non si salvano (girano spesso). */
export const impostazioni = (errorWorkflow, extra = {}) => ({
  executionOrder: 'v1', timezone: 'Europe/Rome', saveManualExecutions: true, saveDataErrorExecution: 'all',
  saveDataSuccessExecution: 'none', callerPolicy: 'workflowsFromSameOwner',
  ...(errorWorkflow ? { errorWorkflow } : {}), ...extra,
});

/**
 * I controlli comuni (vuoto = a posto): nomi unici, citazioni $('…') verso nodi che esistono,
 * collegamenti sani, credenziali presenti, chat impostata, e la chiave del marketplace mai usata
 * per scrivere. `scrittureAmmesse` = nomi dei nodi HTTP che possono fare POST (mai sul marketplace).
 */
export function controllaBase(w, { scrittureAmmesse = [] } = {}) {
  const problemi = [];
  const nomi = new Set(w.nodes.map((n) => n.name));
  if (nomi.size !== w.nodes.length) problemi.push('due nodi con lo stesso nome');
  for (const n of w.nodes) {
    const s = JSON.stringify(n.parameters || {});
    for (const m of s.matchAll(/\$\(\\"(.+?)\\"\)|\$\('([^']+)'\)/g)) {
      const citato = m[1] ?? m[2];
      if (!nomi.has(citato)) problemi.push(`«${n.name}» cita «${citato}», che non esiste`);
    }
    const metodo = n.parameters?.method || 'GET';
    if (n.type === 'n8n-nodes-base.httpRequest' && !['GET', 'HEAD'].includes(metodo) && !scrittureAmmesse.includes(n.name)) {
      problemi.push(`«${n.name}» scrive (${metodo}) e non è tra le scritture ammesse`);
    }
    if (n.credentials?.supabaseApi?.name === CREDENZIALE_MARKETPLACE.name && !['GET', 'HEAD'].includes(metodo)) {
      problemi.push(`«${n.name}» usa la chiave del marketplace per scrivere`);
    }
    for (const c of Object.values(n.credentials || {})) if (c.id === 'DA_IMPOSTARE') problemi.push(`«${n.name}» non ha la credenziale`);
  }
  for (const [da, uscite] of Object.entries(w.connections)) {
    if (!nomi.has(da)) problemi.push(`collegamento da un nodo che non esiste: «${da}»`);
    for (const ramo of uscite.main || []) for (const v of ramo || []) if (!nomi.has(v.node)) problemi.push(`collegamento verso «${v.node}», che non esiste`);
  }
  for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.executeWorkflow')) {
    if (n.parameters.workflowId?.value === 'DA_IMPOSTARE') problemi.push(`«${n.name}» non sa quale flusso chiamare`);
  }
  const cfg = w.nodes.find((n) => n.name === 'Config');
  const chat = cfg?.parameters?.assignments?.assignments?.find((a) => a.name === 'TELEGRAM_CHAT_ID');
  if (chat && chat.value === 'DA_IMPOSTARE') problemi.push('manca la chat Telegram di Nicola');
  if (!w.settings?.errorWorkflow) problemi.push('gli errori non vanno al «99 · Avvisi errori»');
  return problemi;
}

/** Da n8n: chat e credenziale Telegram (dal modulo 12) e l'id del 99. Mai scritti nel repository. */
export async function pezziDaN8n(api) {
  const elenco = await api.elencoFlussi();
  const m12 = trovaFlusso(elenco, NOME_MODULO_12);
  if (!m12) throw new Error(`Non trovo «${NOME_MODULO_12}» su n8n: da lì prendo chat e credenziale Telegram.`);
  const avvisi = trovaFlusso(elenco, NOME_AVVISI_ERRORI);
  if (!avvisi) throw new Error(`Non trovo «${NOME_AVVISI_ERRORI}» su n8n.`);
  const telegram = m12.nodes.find((n) => n.type === 'n8n-nodes-base.telegram')?.credentials?.telegramApi;
  const chat = m12.nodes.find((n) => n.name === 'Config')?.parameters?.assignments?.assignments?.find((a) => a.name === 'TELEGRAM_CHAT_ID')?.value;
  const chiedi = trovaFlusso(elenco, NOME_CHIEDI)?.id;
  return { telegram, chatId: chat ? String(chat) : undefined, errorWorkflow: avvisi.id, chiedi, elenco };
}

/** La riga di comando comune: costruisce, controlla, e con --manda carica su n8n SPENTO. */
export async function principaleComune(argv, { nome, costruisci, controlla, conMarketplace = false, famiglia }) {
  const valore = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const manda = argv.includes('--manda');
  let pezzi = {};
  let api = null;
  if (manda) {
    api = await import('./n8n-api.mjs');
    pezzi = await pezziDaN8n(api);
    if (conMarketplace) pezzi.marketplace = valore('--marketplace') || trovaFlusso(pezzi.elenco, NOMI.analisiMarketplace)
      ?.nodes?.find((n) => n.credentials?.supabaseApi?.name === CREDENZIALE_MARKETPLACE.name)?.credentials?.supabaseApi?.id;
  }
  const w = costruisci({ ...pezzi, vero: argv.includes('--vero') });
  if (valore('--scrivi')) (await import('node:fs')).writeFileSync(valore('--scrivi'), JSON.stringify(w, null, 2));
  const problemi = controlla(w).filter((p) => manda || !/credenziale|chat Telegram|99 · Avvisi errori|quale flusso chiamare/.test(p));
  if (problemi.length) { console.error(`${nome} non va bene:\n- ` + problemi.join('\n- ')); process.exit(1); }
  console.log(`${nome} costruito: ${w.nodes.length} nodi, controlli a posto.`);
  if (api) {
    const esito = await api.creaOAggiorna(w);
    console.log(`${esito.creato ? 'Creato' : 'Aggiornato'} su n8n: id ${esito.id}, ${esito.attivo ? 'ACCESO' : 'spento'}.`);
    if (famiglia) console.log(`Etichetta «${famiglia}»: ${(await api.etichetta(esito.id, [famiglia])) ? 'messa' : 'non trovata su n8n'}.`);
  }
  return w;
}
