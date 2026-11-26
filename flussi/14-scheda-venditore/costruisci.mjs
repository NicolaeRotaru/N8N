// 14 · Scheda per il venditore — il motore del sito del venditore (Vercel, ad-mycity/venditore).
//
// Nicola, 26/11/2026: «un sito in cui il venditore inserisce il link Google dell'azienda … preme Analizza e
// deve uscire la scheda del cliente … velocissima, in un minuto, ma completa». Il sito fa da solo le parti
// veloci (link, mappa libera, misura del sito) e passa qui il lavoro di ricerca e giudizio, che fa l'AD col
// piano Max attraverso «90 · Chiedi all'AD». Nessuna API di IA a pagamento (registro: ad.uso-e-crediti).
//
// Due flussi:
//   14  · Scheda per il venditore            POST /webhook/scheda-venditore
//         segreto → forma del lavoro → riga «in_corso» → risponde subito al sito → Chiedi all'AD → riga «pronta»/«errore»
//   14b · Scheda per il venditore: risultato GET  /webhook/scheda-venditore-risultato?lavoro=<uuid>
//         segreto → legge la riga → risponde (non salva le esecuzioni andate bene: il sito chiede ogni 3 secondi)
//
// Il segreto: il sito lo manda nell'intestazione x-scheda-segreto (variabile N8N_SCHEDA_SEGRETO su Vercel).
// Qui c'è solo la sua impronta sha256, controllata due volte: dal webhook (onlyRunIf: chi sbaglia non crea
// nemmeno un'esecuzione) e dal nodo «Segreto giusto?».
// Le schede restano nella tabella «Schede per il venditore»: non si cancella niente, si archivia.
//
// Uso:  node flussi/14-scheda-venditore/costruisci.mjs --impronta <sha256 del segreto> --sdk 14|14b|14c   (stampa il codice SDK per l'MCP)
//       node flussi/14-scheda-venditore/costruisci.mjs --impronta <…> --controlla                  (solo i controlli)

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { condizione, impostazioni, controllaBase } from '../comune.mjs';
import { inSdk } from '../in-sdk.mjs';

export const NOME_14 = '14 · Scheda per il venditore';
export const NOME_14B = '14b · Scheda per il venditore: risultato';
export const PERCORSO_AVVIA = 'scheda-venditore';
export const PERCORSO_RISULTATO = 'scheda-venditore-risultato';
export const TABELLA = 'Schede per il venditore';
export const TABELLA_ID = 'Stmyk8hvuUYE2sHa';
export const NOME_14C = '14c · Venditori della scheda';
export const PERCORSO_VENDITORI = 'venditori-scheda';
export const TABELLA_VENDITORI = 'Venditori della scheda';
export const TABELLA_VENDITORI_ID = 'x2HYV1HU6kis5HVc';
export const CHIEDI_ID = 'fRtCLoVmjbbWo9uB'; // «90 · Chiedi all'AD»
export const AVVISI_ERRORI_ID = 'D3Ugm3sc201nteFX'; // «99 · Avvisi errori»
const QUI = dirname(fileURLToPath(import.meta.url));
const codice = (n) => readFileSync(join(QUI, 'codice', n), 'utf8');

/** Il controllo del segreto, uguale nel webhook e nell'IF. Non lancia mai: un'espressione che fallisce farebbe passare la richiesta. */
export const controlloSegreto = (impronta, dove = '$json.headers') => {
  if (!/^[a-f0-9]{64}$/.test(String(impronta))) throw new Error('serve --impronta: lo sha256 (64 cifre esadecimali) del segreto');
  return `={{ String((${dove} || {})['x-scheda-segreto'] || '').hash('sha256') === '${impronta}' }}`;
};

const tabella = () => ({ __rl: true, mode: 'id', value: TABELLA_ID, cachedResultName: TABELLA });
const tabellaVenditori = () => ({ __rl: true, mode: 'id', value: TABELLA_VENDITORI_ID, cachedResultName: TABELLA_VENDITORI });
const colonne = (nomi, valori) => ({
  mappingMode: 'defineBelow', value: valori, matchingColumns: [],
  schema: nomi.map(([id, type]) => ({ id, displayName: id, required: false, defaultMatch: false, display: true, type, canBeUsedToMatch: true })),
  attemptToConvertTypes: false, convertFieldsToString: false,
});
const rispondi = (nome, corpo, codiceHttp, position) => ({
  id: randomUUID(), name: nome, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.5, position,
  parameters: { respondWith: 'json', responseBody: corpo, options: { responseCode: codiceHttp } },
});
const webhook = (nome, metodo, percorso, impronta, position) => ({
  id: randomUUID(), name: nome, type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position, webhookId: randomUUID(),
  parameters: { httpMethod: metodo, path: percorso, responseMode: 'responseNode', options: { onlyRunIf: controlloSegreto(impronta) } },
});

export function costruisci14({ impronta }) {
  const pos = (i, riga = 0) => [i * 240, riga * 200];
  const nodi = [];
  const collega = {};
  const vai = (da, ...verso) => { collega[da] = { main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) }; };
  nodi.push(
    webhook('Dal sito del venditore', 'POST', PERCORSO_AVVIA, impronta, pos(0)),
    { id: randomUUID(), name: 'Segreto giusto?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(1), parameters: condizione(controlloSegreto(impronta, "$('Dal sito del venditore').first().json.headers")) },
    rispondi('Rifiuta: segreto', '={{ JSON.stringify({ ok: false, errore: "segreto sbagliato" }) }}', 401, pos(2, 1)),
    { id: randomUUID(), name: 'Controlla il lavoro', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(2), parameters: { jsCode: codice('controlla-lavoro.js') } },
    { id: randomUUID(), name: 'Valido?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(3), parameters: condizione('={{ $json.valido === true }}') },
    rispondi('Rifiuta: lavoro storto', '={{ JSON.stringify({ ok: false, errore: $json.motivo }) }}', 400, pos(4, 1)),
    { id: randomUUID(), name: 'Segna: in corso', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos(4),
      parameters: { resource: 'row', operation: 'insert', dataTableId: tabella(),
        columns: colonne([['lavoro', 'string'], ['stato', 'string'], ['nome', 'string'], ['venditore', 'string'], ['prima', 'string'], ['iniziato', 'number']],
          { lavoro: '={{ $json.lavoro }}', stato: 'in_corso', nome: '={{ $json.nome }}', venditore: '={{ $json.venditore }}', prima: '={{ $json.prima }}', iniziato: '={{ $json.iniziato }}' }), options: {} } },
    rispondi('Rispondi: partito', "={{ JSON.stringify({ ok: true, lavoro: $('Controlla il lavoro').first().json.lavoro }) }}", 202, pos(5)),
    { id: randomUUID(), name: "Per l'AD", type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(6),
      parameters: { jsCode: "// Un solo lavoro per «90 · Chiedi all'AD»: { flusso, compito, dati, schema }.\nreturn [{ json: $('Controlla il lavoro').first().json.job }];" } },
    { id: randomUUID(), name: "Chiedi all'AD", type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.3, position: pos(7), onError: 'continueRegularOutput', alwaysOutputData: true,
      parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: CHIEDI_ID, cachedResultName: "90 · Chiedi all'AD" },
        workflowInputs: { mappingMode: 'defineBelow', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true },
        mode: 'once', options: { waitForSubWorkflow: true } } },
    { id: randomUUID(), name: "Componi l'esito", type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(8), parameters: { jsCode: codice('componi-esito.js') } },
    { id: randomUUID(), name: "Segna: l'esito", type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos(9), retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
      parameters: { resource: 'row', operation: 'update', dataTableId: tabella(), matchType: 'allConditions',
        filters: { conditions: [{ keyName: 'lavoro', condition: 'eq', keyValue: '={{ $json.lavoro }}' }] },
        columns: colonne([['stato', 'string'], ['risultato', 'string'], ['avvisi', 'string'], ['errore', 'string'], ['secondi', 'number']],
          { stato: '={{ $json.stato }}', risultato: '={{ $json.risultato }}', avvisi: '={{ $json.avvisi }}', errore: '={{ $json.errore }}', secondi: '={{ $json.secondi }}' }), options: {} } },
  );
  vai('Dal sito del venditore', 'Segreto giusto?');
  vai('Segreto giusto?', 'Controlla il lavoro', 'Rifiuta: segreto');
  vai('Controlla il lavoro', 'Valido?');
  vai('Valido?', 'Segna: in corso', 'Rifiuta: lavoro storto');
  vai('Segna: in corso', 'Rispondi: partito');
  vai('Rispondi: partito', "Per l'AD");
  vai("Per l'AD", "Chiedi all'AD");
  vai("Chiedi all'AD", "Componi l'esito");
  vai("Componi l'esito", "Segna: l'esito");
  nodi.push({ id: randomUUID(), name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -520],
    parameters: { width: 820, height: 300, content: [
      `## ${NOME_14}`, '',
      "**Cosa fa.** Il sito del venditore (Vercel) manda il lavoro di una scheda del cliente. Si segna «in corso» nella tabella «Schede per il venditore», si risponde subito al sito, poi l'AD fa ricerca e giudizio con «90 · Chiedi all'AD» (piano Max, niente API a pagamento) e la riga diventa «pronta» o «errore».", '',
      "**Il segreto.** Intestazione x-scheda-segreto, uguale a N8N_SCHEDA_SEGRETO su Vercel. Qui solo la sua impronta sha256. Per cambiarlo: nuovo segreto su Vercel, nuova impronta con costruisci.mjs.", '',
      "**Conta.** Ogni scheda è una corsa della routine (tetto di «Chiedi all'AD»: 40 al giorno, 25 all'ora, condiviso con gli altri flussi). Lo stesso negozio lo stesso giorno torna dalla memoria, gratis.", '',
      '**Generato** da `N8N/flussi/14-scheda-venditore/costruisci.mjs`.',
    ].join('\n') } });
  return { name: NOME_14, nodes: nodi, connections: collega, settings: impostazioni(AVVISI_ERRORI_ID, { availableInMCP: true, saveDataSuccessExecution: 'all' }) };
}

export function costruisci14b({ impronta }) {
  const pos = (i, riga = 0) => [i * 240, riga * 200];
  const nodi = [];
  const collega = {};
  const vai = (da, ...verso) => { collega[da] = { main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) }; };
  nodi.push(
    webhook('Dal sito: a che punto è?', 'GET', PERCORSO_RISULTATO, impronta, pos(0)),
    { id: randomUUID(), name: 'Segreto giusto?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(1), parameters: condizione(controlloSegreto(impronta, "$('Dal sito: a che punto è?').first().json.headers")) },
    rispondi('Rifiuta: segreto', '={{ JSON.stringify({ stato: "sconosciuto", errore: "segreto sbagliato" }) }}', 401, pos(2, 1)),
    { id: randomUUID(), name: 'Leggi la riga', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos(2), alwaysOutputData: true,
      parameters: { resource: 'row', operation: 'get', dataTableId: tabella(), matchType: 'allConditions',
        filters: { conditions: [{ keyName: 'lavoro', condition: 'eq', keyValue: "={{ String($('Dal sito: a che punto è?').first().json.query.lavoro || '').toLowerCase().slice(0, 36) }}" }] },
        returnAll: false, limit: 1 } },
    { id: randomUUID(), name: 'Componi la risposta', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(3), parameters: { jsCode: codice('componi-risultato.js') } },
    rispondi('Rispondi al sito', '={{ JSON.stringify($json) }}', 200, pos(4)),
  );
  vai('Dal sito: a che punto è?', 'Segreto giusto?');
  vai('Segreto giusto?', 'Leggi la riga', 'Rifiuta: segreto');
  vai('Leggi la riga', 'Componi la risposta');
  vai('Componi la risposta', 'Rispondi al sito');
  nodi.push({ id: randomUUID(), name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -420],
    parameters: { width: 760, height: 220, content: [
      `## ${NOME_14B}`, '',
      "**Cosa fa.** Il sito del venditore chiede ogni 3 secondi a che punto è una scheda. Si legge la riga della tabella «Schede per il venditore» e si risponde. Le esecuzioni andate bene non si salvano (sarebbero centinaia).", '',
      '**Generato** da `N8N/flussi/14-scheda-venditore/costruisci.mjs`.',
    ].join('\n') } });
  return { name: NOME_14B, nodes: nodi, connections: collega, settings: impostazioni(AVVISI_ERRORI_ID, { availableInMCP: true }) };
}


/**
 * 14c · Venditori della scheda — gli account dei venditori (Nicola, 26/11/2026: «ogni venditore ha il suo account,
 * con la sua email e la password»). La password non arriva mai a n8n: il sito manda solo l'impronta scrypt.
 * Quattro azioni: leggi (per entrare), iscrivi (solo con il codice d'invito, controllato dal sito), segna
 * (accesso riuscito o sbagliato: il blocco dopo troppi errori lo calcola il sito), elenco (le schede del venditore).
 * Per sospendere un venditore: stato «sospeso» nella tabella. Per la password dimenticata: stato «reset», e il
 * venditore rifà l'iscrizione con la stessa email. Non si cancella niente.
 */
export function costruisci14c({ impronta }) {
  const pos = (i, riga = 0) => [i * 240, riga * 200];
  const nodi = [];
  const collega = {};
  const vai = (da, ...verso) => { collega[da] = { main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) }; };
  const caso = (valore) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: randomUUID(), leftValue: '={{ $json.azione }}', rightValue: valore, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' },
    renameOutput: true, outputKey: valore });
  const perEmail = (espr) => ({ conditions: [{ keyName: 'email', condition: 'eq', keyValue: espr }] });
  nodi.push(
    webhook('Dal sito del venditore', 'POST', PERCORSO_VENDITORI, impronta, pos(0)),
    { id: randomUUID(), name: 'Segreto giusto?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(1), parameters: condizione(controlloSegreto(impronta, "$('Dal sito del venditore').first().json.headers")) },
    rispondi('Rifiuta: segreto', '={{ JSON.stringify({ ok: false, errore: "segreto sbagliato" }) }}', 401, pos(2, 2)),
    { id: randomUUID(), name: 'Smista', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(2), parameters: { jsCode: codice('smista-venditori.js') } },
    { id: randomUUID(), name: 'Cosa fare?', type: 'n8n-nodes-base.switch', typeVersion: 3.4, position: pos(3),
      parameters: { mode: 'rules', rules: { values: ['leggi', 'iscrivi', 'segna', 'elenco'].map(caso) }, options: { fallbackOutput: 'extra', renameFallbackOutput: 'storta' } } },
    rispondi('Rifiuta: richiesta storta', '={{ JSON.stringify({ ok: false, errore: $json.motivo || "richiesta storta" }) }}', 400, pos(4, 3)),
    // leggi
    { id: randomUUID(), name: 'Leggi il venditore', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos(4, -1), alwaysOutputData: true,
      parameters: { resource: 'row', operation: 'get', dataTableId: tabellaVenditori(), matchType: 'allConditions', filters: perEmail('={{ $json.email }}'), returnAll: false, limit: 1 } },
    { id: randomUUID(), name: 'Componi il venditore', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(5, -1), parameters: { jsCode: codice('componi-venditore.js') } },
    rispondi('Rispondi: venditore', '={{ JSON.stringify($json) }}', 200, pos(6, -1)),
    // iscrivi
    { id: randomUUID(), name: 'C’è già?', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos(4, 0), alwaysOutputData: true,
      parameters: { resource: 'row', operation: 'get', dataTableId: tabellaVenditori(), matchType: 'allConditions', filters: perEmail('={{ $json.email }}'), returnAll: false, limit: 1 } },
    { id: randomUUID(), name: 'Si può iscrivere?', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(5, 0), parameters: { jsCode: codice('si-puo-iscrivere.js') } },
    { id: randomUUID(), name: 'Iscrivibile?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(6, 0), parameters: condizione('={{ $json.ok === true }}') },
    { id: randomUUID(), name: 'Scrivi il venditore', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos(7, 0),
      parameters: { resource: 'row', operation: 'upsert', dataTableId: tabellaVenditori(), matchType: 'allConditions', filters: perEmail('={{ $json.email }}'),
        columns: colonne([['email', 'string'], ['hash', 'string'], ['stato', 'string'], ['creato', 'number'], ['errori', 'number'], ['bloccato_fino', 'number']],
          { email: '={{ $json.email }}', hash: '={{ $json.hash }}', stato: 'attivo', creato: '={{ $json.creato }}', errori: 0, bloccato_fino: 0 }), options: {} } },
    rispondi('Rispondi: iscritto', '={{ JSON.stringify({ ok: true }) }}', 200, pos(8, 0)),
    rispondi('Rispondi: c’è già', '={{ JSON.stringify({ ok: false, errore: "esiste" }) }}', 409, pos(7, 1)),
    // segna
    { id: randomUUID(), name: 'Segna l’accesso', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos(4, 1),
      parameters: { resource: 'row', operation: 'update', dataTableId: tabellaVenditori(), matchType: 'allConditions', filters: perEmail('={{ $json.email }}'),
        columns: colonne([['errori', 'number'], ['bloccato_fino', 'number'], ['ultimo_accesso', 'number']],
          { errori: '={{ $json.errori }}', bloccato_fino: '={{ $json.bloccato_fino }}', ultimo_accesso: '={{ $json.ultimo_accesso }}' }), options: {} } },
    rispondi('Rispondi: segnato', '={{ JSON.stringify({ ok: true }) }}', 200, pos(5, 1)),
    // elenco
    { id: randomUUID(), name: 'Le sue schede', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos(4, 2), alwaysOutputData: true,
      parameters: { resource: 'row', operation: 'get', dataTableId: tabella(), matchType: 'allConditions',
        filters: { conditions: [{ keyName: 'venditore', condition: 'eq', keyValue: '={{ $json.email }}' }] }, returnAll: false, limit: 20,
        orderBy: true, orderByColumn: 'createdAt', orderByDirection: 'DESC' } },
    { id: randomUUID(), name: 'Componi l’elenco', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(5, 2), parameters: { jsCode: codice('componi-elenco.js') } },
    rispondi('Rispondi: elenco', '={{ JSON.stringify($json) }}', 200, pos(6, 2)),
  );
  vai('Dal sito del venditore', 'Segreto giusto?');
  vai('Segreto giusto?', 'Smista', 'Rifiuta: segreto');
  vai('Smista', 'Cosa fare?');
  vai('Cosa fare?', 'Leggi il venditore', 'C’è già?', 'Segna l’accesso', 'Le sue schede', 'Rifiuta: richiesta storta');
  vai('Leggi il venditore', 'Componi il venditore');
  vai('Componi il venditore', 'Rispondi: venditore');
  vai('C’è già?', 'Si può iscrivere?');
  vai('Si può iscrivere?', 'Iscrivibile?');
  vai('Iscrivibile?', 'Scrivi il venditore', 'Rispondi: c’è già');
  vai('Scrivi il venditore', 'Rispondi: iscritto');
  vai('Segna l’accesso', 'Rispondi: segnato');
  vai('Le sue schede', 'Componi l’elenco');
  vai('Componi l’elenco', 'Rispondi: elenco');
  nodi.push({ id: randomUUID(), name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -620],
    parameters: { width: 820, height: 300, content: [
      `## ${NOME_14C}`, '',
      "**Cosa fa.** Gli account dei venditori del sito «Scheda del cliente»: ognuno entra con la sua email e la sua password. Qui arriva solo l'impronta della password (scrypt), mai la password.", '',
      "**Sospendere un venditore:** nella tabella «Venditori della scheda» metti lo stato a «sospeso». **Password dimenticata:** stato «reset», poi il venditore si iscrive di nuovo con la stessa email e il codice d'invito. Non si cancella niente.", '',
      "**Il segreto** è lo stesso del flusso 14 (intestazione x-scheda-segreto, qui solo l'impronta).", '',
      '**Generato** da `N8N/flussi/14-scheda-venditore/costruisci.mjs`.',
    ].join('\n') } });
  return { name: NOME_14C, nodes: nodi, connections: collega, settings: impostazioni(AVVISI_ERRORI_ID, { availableInMCP: true }) };
}

export function controlla(w) {
  const problemi = controllaBase(w);
  const tipi = w.nodes.map((n) => n.type);
  if (tipi.includes('n8n-nodes-base.httpRequest')) problemi.push('il 14 non chiama la rete: il lavoro va a «Chiedi all\'AD»');
  if (JSON.stringify(w).includes('api.anthropic.com')) problemi.push("il 14 non chiama l'API di Claude (a pagamento)");
  const wh = w.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
  if (!wh?.parameters?.options?.onlyRunIf?.includes(".hash('sha256')")) problemi.push('il webhook non controlla il segreto');
  if (!w.nodes.some((n) => n.name === 'Segreto giusto?')) problemi.push('manca il secondo controllo del segreto');
  if (JSON.stringify(w).match(/deleteRows|"operation":"clear"|"operation":"delete"/)) problemi.push('nella tabella non si cancella niente');
  return problemi;
}

function principale(argv) {
  const i = argv.indexOf('--impronta');
  const impronta = i >= 0 ? argv[i + 1] : '';
  const quale = argv[argv.indexOf('--sdk') + 1];
  const flussi = { '14': costruisci14({ impronta }), '14b': costruisci14b({ impronta }), '14c': costruisci14c({ impronta }) };
  const problemi = Object.values(flussi).flatMap((w) => controlla(w).map((p) => `${w.name}: ${p}`));
  if (problemi.length) { console.error(`✗ ${problemi.join('\n✗ ')}`); return 1; }
  if (argv.includes('--sdk')) { console.log(inSdk(flussi[quale])); return 0; }
  console.log(`✓ ${Object.keys(flussi).length} flussi a posto`);
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) process.exit(principale(process.argv.slice(2)));
