// Allegati per l'AD — il flusso che consegna all'AD gli allegati dei lavori di «Chiedi all'AD».
//
// Perché: la routine dell'AD accetta al massimo 64 KB di testo e non riceve immagini dentro il messaggio. I lavori
// grandi (il catalogo di un servizio del montatore) e le immagini (i provini, le foto del 08 e del 12) restano qui:
// nel messaggio va solo un indirizzo con un gettone casuale, e l'AD li scarica con GET (la sua rete arriva a n8n).
//
// Come funziona:
//   - «Chiedi all'AD» salva ogni allegato nella Data table TABELLA_ALLEGATI con l'impronta SHA-256 del gettone
//     (mai il gettone), la corsa e la scadenza (un'ora), e lo cancella appena l'AD risponde;
//   - qui, GET /webhook/PERCORSO?g=<gettone>: gettone di 64 cifre esadecimali → impronta → riga viva → testo, file
//     salvato o file preso dall'officina sulla rete interna. Qualunque altra cosa → 404 senza dettagli;
//   - «Ogni ora» cancella gli avanzi scaduti;
//   - le esecuzioni non si salvano, né riuscite né fallite: le foto dei clienti non restano nello storico di n8n.
//
// Uso: N8N_API_KEY=… node flussi/chiedi-all-ad/allegati.mjs [--manda] [--scrivi copia.json]
//   --manda crea o aggiorna il flusso su n8n SPENTO; la credenziale dell'officina e il 99 si cercano su n8n.
//   La Data table si crea una volta a mano (o col collegamento MCP), con le colonne di COLONNE_ALLEGATI.

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NOMI, trovaFlusso } from '../nomi.mjs';

export const NOME_ALLEGATI = NOMI.allegatiAd;
export const TABELLA_ALLEGATI = "Allegati per l'AD";
export const PERCORSO_ALLEGATI = 'allegati-ad';
export const NOME_CHIAVE_OFFICINA = 'Officina - Chiave';
/** Le colonne della Data table (tutte testo, tranne la scadenza in millisecondi). */
export const COLONNE_ALLEGATI = [['impronta', 'string'], ['corsa', 'string'], ['scade', 'number'], ['nome', 'string'], ['tipo', 'string'], ['mime', 'string'], ['contenuto', 'string']];
const QUI = dirname(fileURLToPath(import.meta.url));
const codice = (nome) => readFileSync(join(QUI, 'codice', nome), 'utf8');
const tabella = () => ({ __rl: true, mode: 'name', value: TABELLA_ALLEGATI });

export function costruisciAllegati({ officina, errori, webhookId } = {}) {
  const pos = (i, riga = 0) => [i * 240, riga * 200];
  const nodi = [];
  const collega = {};
  const vai = (da, ...verso) => { collega[da] = { main: verso.map((v) => (v ? [].concat(v).map((n) => ({ node: n, type: 'main', index: 0 })) : [])) }; };
  const uguale = (valore, chiave) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: randomUUID(), leftValue: '={{ $json.azione }}', rightValue: valore, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' },
  renameOutput: true, outputKey: chiave });
  const vero = (expr) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
    conditions: [{ id: randomUUID(), leftValue: expr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and' }, looseTypeValidation: true, options: {} });
  const rispondi = (nome, p, parametri) => ({ id: randomUUID(), name: nome, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: p, parameters: parametri });
  const senzaCache = { name: 'cache-control', value: 'no-store' };

  nodi.push(
    { id: randomUUID(), name: "L'AD chiede un allegato", type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos(0), webhookId: webhookId || randomUUID(),
      parameters: { httpMethod: 'GET', path: PERCORSO_ALLEGATI, responseMode: 'responseNode', options: {} } },
    { id: randomUUID(), name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: pos(1), executeOnce: true,
      parameters: { mode: 'manual', includeOtherFields: true, options: {}, assignments: { assignments: [
        { id: randomUUID(), name: 'OFFICINA_URL', value: 'http://officina.internal:8080', type: 'string' },
      ] } } },
    // Solo 64 cifre esadecimali: tutto il resto è 404 senza toccare la tabella.
    { id: randomUUID(), name: 'Gettone valido?', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(2),
      parameters: { jsCode: "// Il gettone arriva in ?g=… : 64 cifre esadecimali, nient'altro.\nconst g = String((($('L\\'AD chiede un allegato').first().json || {}).query || {}).g || '');\nconst ok = /^[a-f0-9]{64}$/.test(g);\nreturn [{ json: { ok, gettone: ok ? g : '' } }];" } },
    { id: randomUUID(), name: 'Gettone ben fatto?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(3), parameters: vero('={{ $json.ok === true }}') },
    { id: randomUUID(), name: 'Impronta del gettone', type: 'n8n-nodes-base.crypto', typeVersion: 1, position: pos(4, -1),
      parameters: { action: 'hash', type: 'SHA256', value: '={{ $json.gettone }}', dataPropertyName: 'impronta', encoding: 'hex' } },
    { id: randomUUID(), name: "Cerca l'allegato", type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos(5, -1), alwaysOutputData: true,
      parameters: { resource: 'row', operation: 'get', dataTableId: tabella(), matchType: 'allConditions',
        filters: { conditions: [{ keyName: 'impronta', condition: 'eq', keyValue: '={{ $json.impronta }}' }] }, returnAll: false, limit: 1 } },
    { id: randomUUID(), name: 'Cosa mandare', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(6, -1), parameters: { jsCode: codice('cosa-mandare.js') } },
    { id: randomUUID(), name: 'Che allegato è?', type: 'n8n-nodes-base.switch', typeVersion: 3.2, position: pos(7, -1),
      parameters: { mode: 'rules', rules: { values: [uguale('testo', 'testo'), uguale('file', 'file'), uguale('officina', 'officina')] },
        options: { fallbackOutput: 'extra', renameFallbackOutput: 'niente' } } },
    rispondi('Rispondi col testo', pos(8, -3), { respondWith: 'text', responseBody: '={{ $json.contenuto }}',
      options: { responseCode: 200, responseHeaders: { entries: [{ name: 'content-type', value: 'text/plain; charset=utf-8' }, senzaCache] } } }),
    rispondi('Rispondi col file', pos(10, -2), { respondWith: 'binary', inputDataFieldName: 'file', options: { responseCode: 200, responseHeaders: { entries: [senzaCache] } } }),
    { id: randomUUID(), name: "Dall'officina", type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(8, -1), onError: 'continueRegularOutput',
      parameters: { method: 'GET', url: "={{ String($('Config').first().json.OFFICINA_URL).replace(/\\/+$/, '') + $json.percorso }}",
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        options: { timeout: 60000, response: { response: { responseFormat: 'file', outputPropertyName: 'file' } } } },
      credentials: { httpHeaderAuth: { id: officina || 'DA_IMPOSTARE', name: NOME_CHIAVE_OFFICINA } } },
    { id: randomUUID(), name: 'Il file è arrivato?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(9, -1),
      parameters: vero('={{ !!($binary && $binary.file) && !$json.error }}') },
    rispondi('Rispondi 404', pos(10, 1), { respondWith: 'noData', options: { responseCode: 404, responseHeaders: { entries: [senzaCache] } } }),
    { id: randomUUID(), name: 'Ogni ora', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(0, 3),
      parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } } },
    { id: randomUUID(), name: 'Cancella gli scaduti', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos(1, 3), onError: 'continueRegularOutput',
      parameters: { resource: 'row', operation: 'deleteRows', dataTableId: tabella(), matchType: 'allConditions',
        filters: { conditions: [{ keyName: 'scade', condition: 'lt', keyValue: '={{ Date.now() }}' }] }, options: {} } },
  );
  vai("L'AD chiede un allegato", 'Config');
  vai('Config', 'Gettone valido?');
  vai('Gettone valido?', 'Gettone ben fatto?');
  vai('Gettone ben fatto?', 'Impronta del gettone', 'Rispondi 404');
  vai('Impronta del gettone', "Cerca l'allegato");
  vai("Cerca l'allegato", 'Cosa mandare');
  vai('Cosa mandare', 'Che allegato è?');
  vai('Che allegato è?', 'Rispondi col testo', 'Rispondi col file', "Dall'officina", 'Rispondi 404');
  vai("Dall'officina", 'Il file è arrivato?');
  vai('Il file è arrivato?', 'Rispondi col file', 'Rispondi 404');
  vai('Ogni ora', 'Cancella gli scaduti');

  nodi.push({ id: randomUUID(), name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -900],
    parameters: { width: 860, height: 420, content: [
      "## Allegati per l'AD",
      '',
      "**Cosa fa.** Consegna all'AD gli allegati dei lavori di «Chiedi all'AD» (testi lunghi, immagini, file dell'officina), che non ci stanno nei 64 KB della routine.",
      '',
      `**Indirizzo.** GET \`/webhook/${PERCORSO_ALLEGATI}?g=<gettone>\`. Il gettone ha 256 bit; nella tabella «${TABELLA_ALLEGATI}» c'è solo la sua impronta SHA-256. Gettone sbagliato o scaduto: 404 senza dettagli.`,
      '',
      "**Quanto restano.** Un'ora al massimo; «Chiedi all'AD» li cancella appena l'AD risponde; «Ogni ora» toglie gli avanzi.",
      '',
      '**Niente storico.** Le esecuzioni non si salvano: le foto dei clienti non restano in n8n.',
      '',
      '**Generato** da `N8N/flussi/chiedi-all-ad/allegati.mjs`: le modifiche vanno fatte lì.',
    ].join('\n') } });

  return {
    name: NOME_ALLEGATI, nodes: nodi, connections: collega,
    settings: { executionOrder: 'v1', timezone: 'Europe/Rome', saveManualExecutions: false, saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none', saveExecutionProgress: false, callerPolicy: 'workflowsFromSameOwner', ...(errori ? { errorWorkflow: errori } : {}) },
  };
}

/** I problemi del flusso costruito (vuoto = a posto). */
export function controllaAllegati(w) {
  const problemi = [];
  const nomi = new Set(w.nodes.map((n) => n.name));
  if (nomi.size !== w.nodes.length) problemi.push('due nodi con lo stesso nome');
  for (const n of w.nodes) {
    const s = JSON.stringify(n.parameters || {});
    for (const m of s.matchAll(/\$\(\\"(.+?)\\"\)|\$\('((?:[^'\\]|\\.)+)'\)/g)) {
      const citato = (m[1] ?? m[2]).replace(/\\\\'/g, "'").replace(/\\'/g, "'");
      if (!nomi.has(citato)) problemi.push(`«${n.name}» cita «${citato}», che non esiste`);
    }
    if (s.includes('api.anthropic.com')) problemi.push(`«${n.name}» chiama l'API di Claude`);
    for (const c of Object.values(n.credentials || {})) if (c.id === 'DA_IMPOSTARE') problemi.push(`«${n.name}» non ha la credenziale`);
  }
  for (const [da, uscite] of Object.entries(w.connections)) {
    if (!nomi.has(da)) problemi.push(`collegamento da un nodo che non esiste: «${da}»`);
    for (const ramo of uscite.main || []) for (const v of ramo || []) if (!nomi.has(v.node)) problemi.push(`collegamento verso «${v.node}», che non esiste`);
  }
  const gancio = w.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
  if (!gancio || gancio.parameters.httpMethod !== 'GET' || gancio.parameters.path !== PERCORSO_ALLEGATI) problemi.push('il webhook deve essere GET sul percorso fisso');
  if (w.settings.saveDataSuccessExecution !== 'none' || w.settings.saveDataErrorExecution !== 'none') problemi.push('le esecuzioni non devono salvarsi');
  if (!w.settings.errorWorkflow) problemi.push('gli errori non vanno al «99 · Avvisi errori»');
  return problemi;
}

async function principale(argv) {
  const valore = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  let pezzi = {};
  let api = null;
  if (argv.includes('--manda')) {
    api = await import('../n8n-api.mjs');
    const tutti = await api.elencoFlussi();
    const gia = trovaFlusso(tutti, NOME_ALLEGATI);
    const vecchio = gia ? await api.leggiFlusso(gia.id) : null;
    // La credenziale dell'officina la usa già il montatore: si prende da lì (mai scritta nel repository).
    const conOfficina = tutti.flatMap((w) => w.nodes || []).find((n) => n.credentials?.httpHeaderAuth?.name === NOME_CHIAVE_OFFICINA);
    pezzi = { officina: conOfficina?.credentials?.httpHeaderAuth?.id, errori: trovaFlusso(tutti, NOMI.avvisiErrori)?.id,
      webhookId: vecchio?.nodes?.find((n) => n.type === 'n8n-nodes-base.webhook')?.webhookId };
  }
  const w = costruisciAllegati(pezzi);
  if (valore('--scrivi')) writeFileSync(valore('--scrivi'), JSON.stringify(w, null, 2));
  const problemi = controllaAllegati(w).filter((p) => argv.includes('--manda') || !/credenziale|99 · Avvisi errori/.test(p));
  if (problemi.length) { console.error(`«${NOME_ALLEGATI}» non va bene:\n- ` + problemi.join('\n- ')); process.exit(1); }
  console.log(`«${NOME_ALLEGATI}» costruito: ${w.nodes.length} nodi, controlli a posto.`);
  if (api) {
    const esito = await api.creaOAggiorna(w);
    console.log(`${esito.creato ? 'Creato' : 'Aggiornato'} su n8n: id ${esito.id}, ${esito.attivo ? 'ACCESO' : 'spento'}.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principale(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
