#!/usr/bin/env node
// 16 · ATTIVITÀ DA VISITARE — la macchina che trova i clienti di MyCity.
//
// Nicola, 27/11/2026: «sei in grado di creare anche una macchina che trova clienti per mycity?» … «fallo».
// Il buco che chiude: c'era la scheda del cliente (14, l'agente incolla il link di Google Maps) e c'era il
// preventivo (20), ma nessuno trovava le attività da visitare e le metteva in fila. La regola era già scritta e
// mai eseguita (ad-mycity registro-fatti: negozi.ingresso — «la squadra mappa tutti i negozi di fresco entro
// 5 km e li mette in fila per chi conviene di più; dossier completo sui primi 10»).
//
// Ogni lunedì alle 7:10: chiede alla mappa libera (OpenStreetMap, servizio Overpass: gratis, licenza ODbL) le
// attività entro 5 km da Pane Quotidiano; toglie catene, categorie dove MyCity non entra, doppioni, negozi già
// su MyCity (sola lettura) e attività già proposte; le mette in fila; sulle prime 10 chiede all'AD il dossier
// (90 · Chiedi all'AD, piano Max, nessuna API a pagamento); manda la lista a Nicola su Telegram e la scrive
// nella tabella «Attività da visitare», dove chi visita segna lo stato.
//
// Trova e prepara, non scrive mai alle attività: il primo contatto lo fa una persona (privacy, art. 130 del
// Codice; regole di WhatsApp; CONTESTO_BUSINESS §4.8).
//
// Uso: N8N_API_KEY=… node flussi/16-attivita-da-visitare/costruisci.mjs [--manda] [--vero] [--scrivi <path>]

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nodoConfig, condizione, nodoTelegram, nodoChiediAllAD, letturaSupabase, impostazioni, controllaBase, principaleComune } from '../comune.mjs';
import { NOMI } from '../nomi.mjs';

export const NOME_16 = NOMI.attivitaDaVisitare;
export const TABELLA = 'Attività da visitare';
export const TABELLA_ID = 'ym5WaeuBbBf0ZuQe';
const QUI = dirname(fileURLToPath(import.meta.url));
const codice = (nome) => readFileSync(join(QUI, 'codice', nome), 'utf8');

// Il centro: Pane Quotidiano, Via Calzolai 25 (ad-mycity registro-fatti: negozio.faro). Il listino: registro-fatti
// sdg.abbonamenti (26/11, il più recente), sdg.pagamento e pricing.commissione al 27/11/2026 — se cambiano lì, si cambia qui.
export const CONFIG_16 = {
  CENTRO_NOME: 'Pane Quotidiano (Via Calzolai 25)',
  CENTRO_LAT: 45.0529,
  CENTRO_LON: 9.6917,
  RAGGIO_M: 5000,
  QUANTE_A_SETTIMANA: 10,
  OVERPASS_URL: 'https://overpass-api.de/api/interpreter',
  LISTINO: 'Vetrina su MyCity: il 10% sui prodotti venduti tramite il sito. ' +
    'Tre abbonamenti mensili ai servizi di MyCity, fatti col partner SDG (foto e video, social, sito web, scheda Google, in misura crescente): ' +
    'Base 300 €, Business 500 €, Premium 999 € al mese. Primo mese a metà prezzo, nessun vincolo, disdetta con 30 giorni di preavviso; per ora si pagano in contanti, di persona.',
};

const tabella = () => ({ __rl: true, mode: 'id', value: TABELLA_ID, cachedResultName: TABELLA });
const COLONNE = [['osm', 'string'], ['settimana', 'string'], ['proposta_il', 'string'], ['nome', 'string'], ['tipo', 'string'], ['segmento', 'string'],
  ['indirizzo', 'string'], ['telefono', 'string'], ['sito', 'string'], ['distanza_m', 'number'], ['punteggio', 'number'], ['perche', 'string'],
  ['offerta', 'string'], ['mappa', 'string'], ['dossier', 'string'], ['stato', 'string'], ['esito', 'string']];

export function costruisci({ telegram, chatId, errorWorkflow, chiedi, marketplace, vero = false } = {}) {
  const pos = (i, riga = 0) => [i * 220, riga * 200];
  const nodi = [];
  const collega = {};
  const vai = (da, ...verso) => { collega[da] = { main: [verso.filter(Boolean).map((v) => ({ node: v, type: 'main', index: 0 }))] }; };
  nodi.push(
    { id: randomUUID(), name: 'Ogni lunedì alle 7:10', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(0, -1),
      parameters: { rule: { interval: [{ field: 'cronExpression', expression: '10 7 * * 1' }] } } },
    { id: randomUUID(), name: 'Avvia a mano', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0, 1), parameters: {} },
    nodoConfig([['MODALITA', vero ? 'vero' : 'prova'], ['TELEGRAM_CHAT_ID', chatId || 'DA_IMPOSTARE'], ['SUPABASE_URL', 'https://clmpyfvpvfjgeviworth.supabase.co'],
      ...Object.entries(CONFIG_16)], pos(1)),
    { id: randomUUID(), name: 'Prepara la domanda', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(2), parameters: { jsCode: codice('prepara-domanda.js') } },
    // Senza neverError un 429 o un 504 di Overpass è un errore del nodo: così la riprova scatta davvero (collaudo m8).
    // Dopo 3 tentativi esce un elemento con `error`, che «Metti in fila» legge come «mappa non letta».
    { id: randomUUID(), name: 'Chiedi alla mappa', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(3),
      onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
      parameters: { method: 'GET', url: '={{ $json.url }}', sendHeaders: true,
        headerParameters: { parameters: [{ name: 'User-Agent', value: 'MyCity-Piacenza/1.0 (attivita-da-visitare; n8n)' }, { name: 'Accept', value: 'application/json' }] },
        options: { response: { response: { fullResponse: true, neverError: false, responseFormat: 'text' } }, timeout: 150000 } } },
    letturaSupabase('Leggi i negozi di MyCity', 'profiles?select=id,store_name&role=eq.seller&limit=10000', pos(4), marketplace),
    { id: randomUUID(), name: 'Leggi le attività già proposte', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos(5), alwaysOutputData: true, executeOnce: true,
      onError: 'continueRegularOutput', parameters: { resource: 'row', operation: 'get', dataTableId: tabella(), returnAll: true } },
    { id: randomUUID(), name: 'Metti in fila', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(6), executeOnce: true, parameters: { jsCode: codice('metti-in-fila.js') } },
    { id: randomUUID(), name: 'Prepara il lavoro', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(7), parameters: { jsCode: codice('prepara-lavoro.js') } },
    nodoChiediAllAD('Chiedi all’AD i dossier', chiedi, pos(8)),
    { id: randomUUID(), name: 'Componi i messaggi', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(9), executeOnce: true, parameters: { jsCode: codice('componi.js') } },
    { id: randomUUID(), name: 'Da mandare?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(10, -1),
      parameters: condizione('={{ $json.manda === true }}') },
    nodoTelegram('Manda a Nicola', '={{ $json.messaggio }}', pos(11, -1), telegram),
    { id: randomUUID(), name: 'Righe per la tabella', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(10, 1), executeOnce: true, parameters: { jsCode: codice('righe-tabella.js') } },
    { id: randomUUID(), name: 'Scrivi nella tabella', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos(11, 1), retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
      parameters: { resource: 'row', operation: 'insert', dataTableId: tabella(),
        columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [],
          schema: COLONNE.map(([id, type]) => ({ id, displayName: id, required: false, defaultMatch: false, display: true, type, canBeUsedToMatch: true })),
          attemptToConvertTypes: false, convertFieldsToString: false }, options: {} } },
  );
  const fila = ['Config', 'Prepara la domanda', 'Chiedi alla mappa', 'Leggi i negozi di MyCity', 'Leggi le attività già proposte', 'Metti in fila', 'Prepara il lavoro', 'Chiedi all’AD i dossier', 'Componi i messaggi'];
  vai('Ogni lunedì alle 7:10', 'Config');
  vai('Avvia a mano', 'Config');
  for (let k = 0; k < fila.length - 1; k++) vai(fila[k], fila[k + 1]);
  vai('Componi i messaggi', 'Da mandare?', 'Righe per la tabella');
  vai('Da mandare?', 'Manda a Nicola');
  vai('Righe per la tabella', 'Scrivi nella tabella');
  nodi.push({ id: randomUUID(), name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -700],
    parameters: { width: 900, height: 420, content: [
      '## 16 · Attività da visitare',
      '',
      "**Cosa fa.** Ogni lunedì alle 7:10 prende dalla mappa libera (OpenStreetMap) le attività entro 5 km da Pane Quotidiano, toglie catene, categorie dove MyCity non entra, doppioni, negozi già su MyCity e attività già proposte, e le mette in fila: prima il fresco vicino al forno, poi regali, cura della persona, bar e ristoranti, artigiani. Sulle prime 10 l'AD scrive il dossier (90 · Chiedi all'AD).",
      '',
      "**Cosa manda.** La lista a Nicola su Telegram e una riga per attività nella tabella «Attività da visitare». Solo con MODALITA = vero.",
      '',
      "**Cosa fai tu.** Dopo la visita scrivi nella tabella lo stato: visitata, si, no o iscritta. Non si cancella niente. Il lunedì dopo il messaggio porta il conto.",
      '',
      "**Mai.** Messaggi automatici alle attività: il primo contatto lo fa una persona.",
      '',
      '**Generato** da `N8N/flussi/16-attivita-da-visitare/costruisci.mjs`. Centro, raggio, quante a settimana e listino stanno nel Config.',
    ].join('\n') } });
  return { name: NOME_16, nodes: nodi, connections: collega, settings: impostazioni(errorWorkflow, { availableInMCP: true }) };
}

export function controlla(w) {
  const problemi = controllaBase(w);
  if (JSON.stringify(w).match(/deleteRows|"operation":"(clear|delete|deleteRows)"/)) problemi.push('nella tabella non si cancella niente');
  // Nessun canale verso le attività: questo flusso parla solo con Nicola.
  const canali = w.nodes.filter((n) => /whatsapp|gmail|emailSend|sendGrid|mailgun|twilio|resend/i.test(n.type) || /graph\.facebook\.com|api\.resend\.com|api\.twilio\.com/.test(JSON.stringify(n.parameters || {})));
  for (const n of canali) problemi.push(`«${n.name}» scriverebbe fuori: il flusso 16 parla solo con Nicola`);
  const tg = w.nodes.filter((n) => n.type === 'n8n-nodes-base.telegram');
  for (const n of tg) if (!/TELEGRAM_CHAT_ID/.test(n.parameters.chatId)) problemi.push(`«${n.name}» non scrive alla chat di Nicola`);
  return problemi;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principaleComune(process.argv.slice(2), { nome: '16', costruisci, controlla, conMarketplace: true, famiglia: '1x clienti e materiali' })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
