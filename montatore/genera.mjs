// Genera il workflow n8n «16 · Montatore» (16-montatore.json) dai pezzi di questa cartella:
//   nodi/comune.js   aiuti comuni, messi in testa a ogni nodo Code
//   nodi/*.js        il corpo di ogni nodo Code
//   prompt/*.md      i prompt di sistema di Claude (entrano solo nei nodi che li usano)
// Uso:  node montatore/genera.mjs      (scrive montatore/16-montatore.json)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const leggi = (...p) => fs.readFileSync(path.join(QUI, ...p), 'utf8');
const COMUNE = leggi('nodi', 'comune.js');
const PROMPT = { PROMPT_CAPIRE: leggi('prompt', 'capire.md').trim(), PROMPT_PIANO: leggi('prompt', 'piano.md').trim(), PROMPT_CONTROLLO: leggi('prompt', 'controllo.md').trim() };

// id stabili (stesso nome = stesso id a ogni generazione)
function uuid(seme) {
  const h = crypto.createHash('sha1').update(`montatore-16:${seme}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const CRED = {
  sheets: { googleSheetsOAuth2Api: { id: 'N0ckGuoYFN0qbSEt', name: 'Google Sheets - Agenzia' } },
  drive: { googleDriveOAuth2Api: { id: 'FCSps1wTGjDI2YUg', name: 'Google Drive - Agenzia' } },
  telegram: { telegramApi: { id: 'OSR2Mp2IrY68ShiL', name: 'Telegram - Bot agenzia' } },
  officina: { httpHeaderAuth: { id: 'EHAwE00jwfTG54AP', name: 'Officina - Chiave' } },
  anthropic: { httpHeaderAuth: { id: 'CSy3VQGj4dTxcjEj', name: 'Anthropic API' } },
  moduli: { httpBasicAuth: { id: 'HgjV31e82sq3vEoP', name: 'n8n - Accesso moduli' } },
};

const nodi = [];
const connessioni = {};
function nodo(nome, tipo, versione, parametri, [x, y], extra = {}) {
  if (nodi.some((n) => n.name === nome)) throw new Error(`nodo doppio: ${nome}`);
  const n = { parameters: parametri, id: uuid(nome), name: nome, type: tipo, typeVersion: versione, position: [x, y], ...extra };
  nodi.push(n);
  return nome;
}
function collega(da, a, uscita = 0) {
  connessioni[da] ??= { main: [] };
  while (connessioni[da].main.length <= uscita) connessioni[da].main.push([]);
  connessioni[da].main[uscita].push({ node: a, type: 'main', index: 0 });
}
function catena(...nomi) {
  for (let i = 0; i < nomi.length - 1; i++) collega(nomi[i], nomi[i + 1]);
}

// Nodo Code: aiuti comuni + i prompt che il corpo usa + il corpo.
export function sorgenteCodice(file) {
  const corpo = leggi('nodi', file);
  let costanti = '';
  for (const [k, v] of Object.entries(PROMPT)) if (corpo.includes(k)) costanti += `const ${k} = ${JSON.stringify(v)};\n`;
  return `${COMUNE}\n${costanti}// ===== ${file} =====\n${corpo}`;
}
function codice(nome, file, pos, extra = {}) {
  return nodo(nome, 'n8n-nodes-base.code', 2, { mode: 'runOnceForAllItems', jsCode: sorgenteCodice(file) }, pos, extra);
}
function se(nome, espressione, pos) {
  return nodo(nome, 'n8n-nodes-base.if', 2.3, {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
      conditions: [{ id: uuid(`${nome}:c`), leftValue: `={{ ${espressione} }}`, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and',
    },
    looseTypeValidation: true,
    options: {},
  }, pos);
}
const RIPROVA = (volte = 3, attesa = 5000) => ({ retryOnFail: true, maxTries: volte, waitBetweenTries: attesa });
function telegram(nome, pos) {
  return nodo(nome, 'n8n-nodes-base.telegram', 1.2, {
    resource: 'message',
    operation: 'sendMessage',
    chatId: "={{ $('Config').first().json.TELEGRAM_CHAT_ID }}",
    text: "={{ String($json.messaggio || '').slice(0, 4000) }}",
    additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true },
  }, pos, { credentials: CRED.telegram, ...RIPROVA(2, 3000), onError: 'continueRegularOutput', webhookId: uuid(`${nome}:webhook`) });
}
function fine(nome, titolo, messaggio, pos) {
  return nodo(nome, 'n8n-nodes-base.form', 2.5, {
    operation: 'completion', respondWith: 'text', completionTitle: titolo, completionMessage: messaggio,
    limitWaitTime: true, limitType: 'afterTimeInterval', resumeAmount: 1, resumeUnit: 'hours',
  }, pos, { webhookId: uuid(`${nome}:webhook`) });
}
function driveElenca(nome, q, pos, campi = 'nextPageToken,files(id,name,mimeType)') {
  return nodo(nome, 'n8n-nodes-base.httpRequest', 4.5, {
    method: 'GET',
    url: 'https://www.googleapis.com/drive/v3/files',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'googleDriveOAuth2Api',
    sendQuery: true,
    specifyQuery: 'keypair',
    queryParameters: { parameters: [
      { name: 'q', value: q },
      { name: 'fields', value: campi },
      { name: 'pageSize', value: '1000' },
      { name: 'orderBy', value: 'name' },
      { name: 'supportsAllDrives', value: 'true' },
      { name: 'includeItemsFromAllDrives', value: 'true' },
    ] },
    options: { timeout: 60000, response: { response: { responseFormat: 'json' } } },
  }, pos, { credentials: CRED.drive, ...RIPROVA(3, 5000), onError: 'continueRegularOutput' });
}
const OFFICINA = "$('Config').first().json.OFFICINA_URL.replace(/\\/+$/, '')";
function officinaJson(nome, percorso, corpo, pos, timeout = 120000) {
  return nodo(nome, 'n8n-nodes-base.httpRequest', 4.5, {
    method: 'POST',
    url: `={{ ${OFFICINA} + ${percorso} }}`,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: `={{ JSON.stringify(${corpo}) }}`,
    options: { timeout },
  }, pos, { credentials: CRED.officina, ...RIPROVA(3, 30000), onError: 'continueRegularOutput' });
}
function officinaMultipart(nome, percorso, parametri, pos, timeout, extra = {}) {
  return nodo(nome, 'n8n-nodes-base.httpRequest', 4.5, {
    method: 'POST',
    url: `={{ ${OFFICINA} + ${percorso} }}`,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    contentType: 'multipart-form-data',
    bodyParameters: { parameters: parametri },
    options: { timeout },
  }, pos, { credentials: CRED.officina, ...RIPROVA(3, 60000), onError: 'continueRegularOutput', ...extra });
}
function officinaScarica(nome, percorso, campo, pos) {
  return nodo(nome, 'n8n-nodes-base.httpRequest', 4.5, {
    method: 'GET',
    url: `={{ ${OFFICINA} + '/file/' + ${percorso} }}`,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    options: { timeout: 300000, response: { response: { responseFormat: 'file', outputPropertyName: campo } } },
  }, pos, { credentials: CRED.officina, ...RIPROVA(3, 10000), onError: 'continueRegularOutput' });
}
function claude(nome, pos, timeout) {
  return nodo(nome, 'n8n-nodes-base.httpRequest', 4.5, {
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [
      { name: 'anthropic-version', value: '2026-10-21' },
      { name: 'anthropic-beta', value: 'server-side-fallback-2026-07-01' },
      { name: 'content-type', value: 'application/json' },
    ] },
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json.corpo) }}',
    options: { timeout },
  }, pos, { credentials: CRED.anthropic, ...RIPROVA(3, 20000), onError: 'continueRegularOutput' });
}
function base64(nome, campo, pos) {
  return nodo(nome, 'n8n-nodes-base.extractFromFile', 1.1, { operation: 'binaryToPropery', binaryPropertyName: campo, destinationKey: 'base64', options: {} }, pos, { onError: 'continueRegularOutput' });
}
function seStesso(nome, pos, aspetta) {
  return nodo(nome, 'n8n-nodes-base.executeWorkflow', 1.3, {
    mode: aspetta ? 'each' : 'once',
    workflowId: { __rl: true, value: '={{ $workflow.id }}', mode: 'id' },
    workflowInputs: { mappingMode: 'defineBelow', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true },
    options: { waitForSubWorkflow: aspetta },
  }, pos, { onError: 'continueRegularOutput' });
}
function driveScarica(nome, idEspr, campo, pos, extra = {}) {
  return nodo(nome, 'n8n-nodes-base.googleDrive', 3, {
    authentication: 'oAuth2', resource: 'file', operation: 'download',
    fileId: { __rl: true, value: `={{ ${idEspr} }}`, mode: 'id' },
    options: { binaryPropertyName: campo },
  }, pos, { credentials: CRED.drive, ...RIPROVA(3, 10000), ...extra });
}

// ---------------------------------------------------------------- CONFIG
export const CONFIG = {
  SHEET_ID: '1nOTwzXkqNsfwortRslKBzsBXh2uIz2G2Lyu13Hufmjo',
  TELEGRAM_CHAT_ID: '1913003037',
  OFFICINA_URL: 'http://officina.internal:8080',
  ANTHROPIC_MODEL: 'claude-opus-5-5',
  MODALITA: 'prova',
  NOME_CARTELLA_PRONTI: 'Pronti (montatore)',
  EFFORT_CAPIRE: 'medium',
  EFFORT_PIANO: 'high',
  EFFORT_CONTROLLO: 'medium',
  USA_CONTROLLO: 'si',
  TRASCRIVI: 'si',
  LINGUA: 'it',
  PROVINI_PER_DOMANDA: 6,
  MAX_MB_FILE: 500,
  MAX_FILE: 400,
  REEL: 8,
  POST: 8,
  STORIE: 16,
};
const valoreConfig = (k, v) => ({ id: uuid(`config:${k}`), name: k, value: v, type: typeof v === 'number' ? 'number' : 'string' });

// ---------------------------------------------------------------- INGRESSI
const COL = (c) => c * 240;
const RIGA = { modulo: 0, giro: 400, carica: 1300, monta: 1700 };

nodo('Modulo montatore', 'n8n-nodes-base.formTrigger', 2.5, {
  authentication: 'basicAuth',
  formTitle: 'Montatore',
  formDescription: 'Scrivi il cliente e la cartella del servizio (quella con «video verticali», «video orizzontali» e «foto»). Il montatore guarda tutto il materiale, prepara il piano del mese e monta reel, storie e post. Niente si pubblica senza di voi.',
  formFields: { values: [
    { fieldLabel: 'Cliente', fieldName: 'cliente', fieldType: 'text', placeholder: 'il nome del locale o la colonna «cliente» del foglio, es. El Tropico', requiredField: true },
    { fieldLabel: 'Cartella del servizio', fieldName: 'cartella', fieldType: 'text', placeholder: 'il nome della cartella dentro quella del cliente, es. Servizio novembre (o il link di Drive)', requiredField: true },
    { fieldLabel: 'Mese del piano (AAAA-MM)', fieldName: 'mese', fieldType: 'text', placeholder: 'vuoto = il mese prossimo', requiredField: false },
    { fieldLabel: 'Reel', fieldName: 'reel', fieldType: 'number', defaultValue: String(CONFIG.REEL), requiredField: false },
    { fieldLabel: 'Post e caroselli', fieldName: 'post', fieldType: 'number', defaultValue: String(CONFIG.POST), requiredField: false },
    { fieldLabel: 'Storie', fieldName: 'storie', fieldType: 'number', defaultValue: String(CONFIG.STORIE), requiredField: false },
    { fieldLabel: 'Note: eventi e promozioni del mese decisi dal cliente', fieldName: 'note', fieldType: 'textarea', placeholder: 'es. venerdì 12 serata jazz; dal 1 al 24 menu di Natale', requiredField: false },
  ] },
  options: { appendAttribution: false, buttonLabel: 'Monta il mese', path: 'montatore' },
}, [0, RIGA.modulo], { credentials: CRED.moduli, webhookId: uuid('Modulo montatore:webhook') });

nodo('Quando si richiama da solo', 'n8n-nodes-base.executeWorkflowTrigger', 1.1, { inputSource: 'passthrough' }, [0, RIGA.giro + 300]);

nodo('Config', 'n8n-nodes-base.set', 3.4, {
  mode: 'manual',
  assignments: { assignments: Object.entries(CONFIG).map(([k, v]) => valoreConfig(k, v)) },
  includeOtherFields: true,
  options: {},
}, [COL(1), RIGA.giro]);
collega('Modulo montatore', 'Config');
collega('Quando si richiama da solo', 'Config');

nodo('Quale lavoro?', 'n8n-nodes-base.switch', 3.2, {
  rules: { values: ['giro', 'carica', 'monta'].map((k) => ({
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: uuid(`lavoro:${k}`), leftValue: "={{ String($json.lavoro || '') }}", rightValue: k, operator: { type: 'string', operation: 'equals' } }],
      combinator: 'and',
    },
    renameOutput: true,
    outputKey: k,
  })) },
  options: { fallbackOutput: 'extra', renameFallbackOutput: 'modulo' },
}, [COL(2), RIGA.giro]);
collega('Config', 'Quale lavoro?');

// ---------------------------------------------------------------- MODULO (risposta in pochi secondi)
nodo('Leggi Clienti', 'n8n-nodes-base.httpRequest', 4.5, {
  method: 'GET',
  url: "={{ \"https://sheets.googleapis.com/v4/spreadsheets/\" + encodeURIComponent($('Config').first().json.SHEET_ID) + '/values/' + encodeURIComponent(\"Clienti!A:AZ\") }}",
  authentication: 'predefinedCredentialType',
  nodeCredentialType: 'googleSheetsOAuth2Api',
  sendQuery: true,
  specifyQuery: 'keypair',
  queryParameters: { parameters: [{ name: 'valueRenderOption', value: 'FORMATTED_VALUE' }, { name: 'majorDimension', value: 'ROWS' }] },
  options: { timeout: 30000, response: { response: { responseFormat: 'json' } } },
}, [COL(3), RIGA.modulo], { credentials: CRED.sheets, ...RIPROVA(3, 5000), onError: 'continueRegularOutput' });
collega('Quale lavoro?', 'Leggi Clienti', 3);
codice('Trova il cliente', 'trova-il-cliente.js', [COL(4), RIGA.modulo]);
se('Cliente trovato?', '$json.ok', [COL(5), RIGA.modulo]);
driveElenca('Cartelle del cliente', "={{ \"'\" + $json.cartella_cliente + \"' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false\" }}", [COL(6), RIGA.modulo]);
codice('Trova la cartella del servizio', 'trova-la-cartella.js', [COL(7), RIGA.modulo]);
se('Cartella trovata?', '$json.ok', [COL(8), RIGA.modulo]);
driveElenca('Elenca il servizio', "={{ \"'\" + $json.servizio.id + \"' in parents and trashed = false\" }}", [COL(9), RIGA.modulo]);
codice('Trova le sottocartelle', 'trova-le-sottocartelle.js', [COL(10), RIGA.modulo]);
se('Cartella leggibile?', '$json.ok', [COL(11), RIGA.modulo]);
driveElenca('Elenca i file', '={{ $json.q }}', [COL(12), RIGA.modulo], 'nextPageToken,files(id,name,mimeType,size,parents,videoMediaMetadata(durationMillis,width,height),imageMediaMetadata(width,height))');
codice('Prepara il lavoro', 'prepara-il-lavoro.js', [COL(13), RIGA.modulo]);
se("C'è materiale?", '$json.ok', [COL(14), RIGA.modulo]);
nodo('Prepara la partenza', 'n8n-nodes-base.code', 2, { mode: 'runOnceForAllItems', jsCode: '// Il giro parte in un\'esecuzione sua: qui passa solo il lavoro.\nreturn [{ json: $input.first().json.lavoro }];\n' }, [COL(15), RIGA.modulo - 100]);
seStesso('Avvia il montaggio', [COL(16), RIGA.modulo - 100], false);
fine('Fine: partito', 'Il montatore è partito', "={{ $('Prepara il lavoro').first().json.messaggio }}", [COL(17), RIGA.modulo - 100]);
fine('Fine: problema', 'Non posso partire', '={{ $json.messaggio }}', [COL(15), RIGA.modulo + 150]);
catena('Leggi Clienti', 'Trova il cliente', 'Cliente trovato?');
collega('Cliente trovato?', 'Cartelle del cliente', 0);
collega('Cliente trovato?', 'Fine: problema', 1);
catena('Cartelle del cliente', 'Trova la cartella del servizio', 'Cartella trovata?');
collega('Cartella trovata?', 'Elenca il servizio', 0);
collega('Cartella trovata?', 'Fine: problema', 1);
catena('Elenca il servizio', 'Trova le sottocartelle', 'Cartella leggibile?');
collega('Cartella leggibile?', 'Elenca i file', 0);
collega('Cartella leggibile?', 'Fine: problema', 1);
catena('Elenca i file', 'Prepara il lavoro', "C'è materiale?");
collega("C'è materiale?", 'Prepara la partenza', 0);
collega("C'è materiale?", 'Fine: problema', 1);
catena('Prepara la partenza', 'Avvia il montaggio', 'Fine: partito');

// ---------------------------------------------------------------- GIRO (esecuzione lunga, lanciata dal modulo)
const G = RIGA.giro;
codice('Inizio del giro', 'inizio-del-giro.js', [COL(3), G]);
collega('Quale lavoro?', 'Inizio del giro', 0);
telegram('Telegram: si parte', [COL(4), G]);
officinaJson('Officina: nuovo progetto', "'/progetto'", "{ nome: $('Config').first().json.cliente.nome_locale + ' · ' + $('Config').first().json.servizio.nome }", [COL(5), G]);
codice('Un file alla volta', 'un-file-alla-volta.js', [COL(6), G]);
se('Progetto creato?', '$json.fermo !== true', [COL(7), G]);
seStesso('Carica il file', [COL(8), G], true);
codice('Esito dei caricamenti', 'esito-dei-caricamenti.js', [COL(9), G]);
telegram('Telegram: materiale guardato', [COL(10), G]);
se('Qualcosa caricato?', "$('Esito dei caricamenti').first().json.ok", [COL(11), G]);
officinaMultipart('Officina: catalogo', "'/progetto/' + $('Officina: nuovo progetto').first().json.progetto + '/catalogo'", [{ parameterType: 'formData', name: 'dati', value: '{}' }], [COL(12), G], 1800000);
codice('Provini da scaricare', 'provini-da-scaricare.js', [COL(13), G]);
se('Catalogo pronto?', '$json.fermo !== true', [COL(14), G]);
officinaScarica('Scarica il provino', '$json.percorso', 'provino', [COL(15), G]);
base64('Provino in base64', 'provino', [COL(16), G]);
codice('Domande sul materiale', 'domande-sul-materiale.js', [COL(17), G]);
claude('Claude: guarda il materiale', [COL(18), G], 600000);
codice("Leggi cosa c'è", 'leggi-cosa-ce.js', [COL(19), G]);
claude('Claude: piano del mese', [COL(20), G], 900000);
codice('Leggi il piano', 'leggi-il-piano.js', [COL(21), G]);
se('Piano scritto?', '$json.ok', [COL(22), G]);
officinaJson('Officina: controlla il piano', "'/progetto/' + $('Officina: nuovo progetto').first().json.progetto + '/piano'", "{ piano: $json.piano, mese: $('Config').first().json.mese.chiave, richiesta: $('Config').first().json.richiesta, oggi: $now.setZone('Europe/Rome').toFormat('yyyy-MM-dd') }", [COL(23), G]);
se('Serve una correzione?', "Array.isArray($json.problemi) && $json.problemi.some((p) => p.gravita === 'blocca')", [COL(24), G]);
codice('Domanda di correzione', 'domanda-di-correzione.js', [COL(25), G - 150]);
claude('Claude: correggi il piano', [COL(26), G - 150], 900000);
codice('Leggi la correzione', 'leggi-la-correzione.js', [COL(27), G - 150]);
officinaJson('Officina: ricontrolla il piano', "'/progetto/' + $('Officina: nuovo progetto').first().json.progetto + '/piano'", "{ piano: $json.piano, mese: $('Config').first().json.mese.chiave, richiesta: $('Config').first().json.richiesta, oggi: $now.setZone('Europe/Rome').toFormat('yyyy-MM-dd') }", [COL(28), G - 150]);
codice('Piano finale', 'piano-finale.js', [COL(29), G]);
se('Piano pronto?', '$json.ok', [COL(30), G]);
codice('Messaggi del piano', 'messaggi.js', [COL(31), G - 150]);
telegram('Telegram: il piano', [COL(32), G - 150]);
driveElenca("Cartelle d'uscita", "={{ \"'\" + $('Config').first().json.servizio.id + \"' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false\" }}", [COL(31), G + 50]);
codice("Trova la cartella d'uscita", 'trova-la-cartella-duscita.js', [COL(32), G + 50]);
se('Va creata?', '$json.crea', [COL(33), G + 50]);
nodo("Crea la cartella d'uscita", 'n8n-nodes-base.httpRequest', 4.5, {
  method: 'POST',
  url: 'https://www.googleapis.com/drive/v3/files',
  authentication: 'predefinedCredentialType',
  nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true,
  specifyQuery: 'keypair',
  queryParameters: { parameters: [{ name: 'supportsAllDrives', value: 'true' }, { name: 'fields', value: 'id,name' }] },
  sendBody: true,
  contentType: 'json',
  specifyBody: 'json',
  jsonBody: "={{ JSON.stringify({ name: $json.nome, mimeType: 'application/vnd.google-apps.folder', parents: [$json.dentro] }) }}",
  options: { timeout: 60000, response: { response: { responseFormat: 'json' } } },
}, [COL(34), G], { credentials: CRED.drive, onError: 'continueRegularOutput' });
codice('Contenuti da montare', 'contenuti-da-montare.js', [COL(35), G + 50]);
se('Si monta?', '$json.fermo !== true', [COL(36), G + 50]);
seStesso('Monta il contenuto', [COL(37), G + 50], true);
codice('Esito dei montaggi', 'esito-dei-montaggi.js', [COL(38), G + 50]);
codice('Messaggi finali', 'messaggi.js', [COL(39), G - 100]);
telegram('Telegram: riepilogo', [COL(40), G - 100]);
se('Scrivo nel Calendario?', '$json.scrivi', [COL(39), G + 50]);
codice('Righe del Calendario', 'righe-del-calendario.js', [COL(40), G + 50]);
nodo('Scrivi nel Calendario', 'n8n-nodes-base.googleSheets', 4.7, {
  authentication: 'oAuth2',
  resource: 'sheet',
  operation: 'append',
  documentId: { __rl: true, value: "={{ $('Config').first().json.SHEET_ID }}", mode: 'id' },
  sheetName: { __rl: true, value: 'Calendario', mode: 'name' },
  columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: false },
  options: { cellFormat: 'RAW', useAppend: true, handlingExtraData: 'ignoreIt' },
}, [COL(41), G + 50], { credentials: CRED.sheets, ...RIPROVA(2, 5000), onError: 'continueRegularOutput' });
se('Chiudo il progetto?', '$json.chiudi', [COL(39), G + 200]);
officinaJson('Officina: chiudi il progetto', "'/progetto/' + $json.progetto + '/chiudi'", '{}', [COL(40), G + 200]);
codice('Messaggio di stop', 'messaggi.js', [COL(13), G + 250]);
telegram('Telegram: giro fermo', [COL(14), G + 250]);

catena('Inizio del giro', 'Telegram: si parte', 'Officina: nuovo progetto', 'Un file alla volta', 'Progetto creato?');
collega('Progetto creato?', 'Carica il file', 0);
collega('Progetto creato?', 'Messaggio di stop', 1);
catena('Carica il file', 'Esito dei caricamenti', 'Telegram: materiale guardato', 'Qualcosa caricato?');
collega('Qualcosa caricato?', 'Officina: catalogo', 0);
catena('Officina: catalogo', 'Provini da scaricare', 'Catalogo pronto?');
collega('Catalogo pronto?', 'Scarica il provino', 0);
collega('Catalogo pronto?', 'Messaggio di stop', 1);
catena('Scarica il provino', 'Provino in base64', 'Domande sul materiale', 'Claude: guarda il materiale', "Leggi cosa c'è", 'Claude: piano del mese', 'Leggi il piano', 'Piano scritto?');
collega('Piano scritto?', 'Officina: controlla il piano', 0);
collega('Piano scritto?', 'Messaggio di stop', 1);
catena('Officina: controlla il piano', 'Serve una correzione?');
collega('Serve una correzione?', 'Domanda di correzione', 0);
collega('Serve una correzione?', 'Piano finale', 1);
catena('Domanda di correzione', 'Claude: correggi il piano', 'Leggi la correzione', 'Officina: ricontrolla il piano', 'Piano finale', 'Piano pronto?');
collega('Piano pronto?', 'Messaggi del piano', 0);
collega('Piano pronto?', "Cartelle d'uscita", 0);
collega('Piano pronto?', 'Messaggio di stop', 1);
catena('Messaggi del piano', 'Telegram: il piano');
catena("Cartelle d'uscita", "Trova la cartella d'uscita", 'Va creata?');
collega('Va creata?', "Crea la cartella d'uscita", 0);
collega('Va creata?', 'Contenuti da montare', 1);
catena("Crea la cartella d'uscita", 'Contenuti da montare', 'Si monta?');
collega('Si monta?', 'Monta il contenuto', 0);
collega('Si monta?', 'Messaggio di stop', 1);
catena('Monta il contenuto', 'Esito dei montaggi');
collega('Esito dei montaggi', 'Messaggi finali');
collega('Esito dei montaggi', 'Scrivo nel Calendario?');
collega('Esito dei montaggi', 'Chiudo il progetto?');
catena('Messaggi finali', 'Telegram: riepilogo');
collega('Scrivo nel Calendario?', 'Righe del Calendario', 0);
catena('Righe del Calendario', 'Scrivi nel Calendario');
collega('Chiudo il progetto?', 'Officina: chiudi il progetto', 0);
catena('Messaggio di stop', 'Telegram: giro fermo');

// ---------------------------------------------------------------- CARICA (un file: Drive → officina)
const C = RIGA.carica;
driveScarica('Scarica il file', "$('Config').first().json.file.id", 'file', [COL(3), C], { onError: 'continueErrorOutput' });
collega('Quale lavoro?', 'Scarica il file', 1);
officinaMultipart('Officina: carica il materiale', "'/progetto/' + $('Config').first().json.progetto + '/materiale'", [
  { parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'file' },
  { parameterType: 'formData', name: 'dati', value: "={{ JSON.stringify({ cartella: $('Config').first().json.file.cartella, nome: $('Config').first().json.file.nome, drive_id: $('Config').first().json.file.id, trascrivi: $('Config').first().json.trascrivi, lingua: $('Config').first().json.lingua }) }}" },
], [COL(4), C], 3600000, { ...RIPROVA(3, 30000), onError: 'continueErrorOutput' });
codice('Esito del file', 'esito-del-file.js', [COL(5), C]);
codice('Errore del file', 'errore-del-file.js', [COL(5), C + 150]);
collega('Scarica il file', 'Officina: carica il materiale', 0);
collega('Scarica il file', 'Errore del file', 1);
collega('Officina: carica il materiale', 'Esito del file', 0);
collega('Officina: carica il materiale', 'Errore del file', 1);

// ---------------------------------------------------------------- MONTA (un contenuto: officina → Drive)
const M = RIGA.monta;
nodo('Da dove arriva il logo?', 'n8n-nodes-base.switch', 3.2, {
  rules: { values: ['drive', 'url'].map((k) => ({
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: uuid(`logo:${k}`), leftValue: "={{ String(($('Config').first().json.logo || {}).tipo || '') }}", rightValue: k, operator: { type: 'string', operation: 'equals' } }],
      combinator: 'and',
    },
    renameOutput: true,
    outputKey: k,
  })) },
  options: { fallbackOutput: 'extra', renameFallbackOutput: 'nessuno' },
}, [COL(3), M]);
collega('Quale lavoro?', 'Da dove arriva il logo?', 2);
driveScarica('Scarica il logo', "$('Config').first().json.logo.id", 'logo', [COL(4), M - 150], { onError: 'continueRegularOutput' });
nodo('Scarica il logo dal sito', 'n8n-nodes-base.httpRequest', 4.5, {
  url: "={{ $('Config').first().json.logo.url }}",
  options: { timeout: 60000, response: { response: { responseFormat: 'file', outputPropertyName: 'logo' } } },
}, [COL(4), M], { ...RIPROVA(3, 5000), onError: 'continueRegularOutput' });
se('Serve la musica?', "!!($('Config').first().json.contenuto.musica && $('Config').first().json.musica && $('Config').first().json.musica.id)", [COL(5), M]);
driveScarica('Scarica la musica', "$('Config').first().json.musica.id", 'musica', [COL(6), M - 150], { onError: 'continueRegularOutput' });
codice('Unisci i file', 'unisci-i-file.js', [COL(7), M]);
const conFile = (campo, condizione) => ({
  parameterType: `={{ $json.${condizione} ? 'formBinaryData' : 'formData' }}`,
  name: `={{ $json.${condizione} ? '${campo}' : 'campo_vuoto_${campo}' }}`,
  inputDataFieldName: campo,
  value: '',
});
officinaMultipart('Officina: monta', "'/progetto/' + $('Config').first().json.progetto + '/monta'", [
  { parameterType: 'formData', name: 'dati', value: '={{ $json.dati }}' },
  conFile('logo', 'con_logo'),
  conFile('musica', 'con_musica'),
], [COL(8), M], 1800000, RIPROVA(2, 60000));
codice('Esito del montaggio', 'esito-del-montaggio.js', [COL(9), M]);
se('Controllo con Claude?', '$json.controlla', [COL(10), M]);
officinaScarica('Scarica i fotogrammi', '$json.fotogrammi', 'fotogrammi', [COL(11), M - 150]);
base64('Fotogrammi in base64', 'fotogrammi', [COL(12), M - 150]);
codice('Domanda di controllo', 'domanda-di-controllo.js', [COL(13), M - 150]);
claude('Claude: controlla il video', [COL(14), M - 150], 300000);
codice('Leggi il controllo', 'leggi-il-controllo.js', [COL(15), M - 150]);
codice('File da caricare', 'file-da-caricare.js', [COL(16), M]);
se('Ci sono file?', '$json.salta !== true', [COL(17), M]);
officinaScarica("Scarica dall'officina", '$json.percorso', 'data', [COL(18), M]);
nodo('Carica su Drive', 'n8n-nodes-base.googleDrive', 3, {
  authentication: 'oAuth2', resource: 'file', operation: 'upload', inputDataFieldName: 'data',
  name: "={{ $('File da caricare').item.json.nome_file }}",
  driveId: { __rl: true, value: 'My Drive', mode: 'list', cachedResultName: 'My Drive' },
  folderId: { __rl: true, value: "={{ $('Config').first().json.cartella_uscita }}", mode: 'id' },
  options: {},
}, [COL(19), M], { credentials: CRED.drive, ...RIPROVA(3, 10000), onError: 'continueRegularOutput' });
codice('Esito del contenuto', 'esito-del-contenuto.js', [COL(20), M]);

collega('Da dove arriva il logo?', 'Scarica il logo', 0);
collega('Da dove arriva il logo?', 'Scarica il logo dal sito', 1);
collega('Da dove arriva il logo?', 'Serve la musica?', 2);
collega('Scarica il logo', 'Serve la musica?');
collega('Scarica il logo dal sito', 'Serve la musica?');
collega('Serve la musica?', 'Scarica la musica', 0);
collega('Serve la musica?', 'Unisci i file', 1);
collega('Scarica la musica', 'Unisci i file');
catena('Unisci i file', 'Officina: monta', 'Esito del montaggio', 'Controllo con Claude?');
collega('Controllo con Claude?', 'Scarica i fotogrammi', 0);
collega('Controllo con Claude?', 'File da caricare', 1);
catena('Scarica i fotogrammi', 'Fotogrammi in base64', 'Domanda di controllo', 'Claude: controlla il video', 'Leggi il controllo', 'File da caricare', 'Ci sono file?');
collega('Ci sono file?', "Scarica dall'officina", 0);
collega('Ci sono file?', 'Esito del contenuto', 1);
catena("Scarica dall'officina", 'Carica su Drive', 'Esito del contenuto');

// ---------------------------------------------------------------- NOTE
const nota = (nome, testo, pos, l, a, colore) => nodo(nome, 'n8n-nodes-base.stickyNote', 1, { content: testo, height: a, width: l, color: colore }, pos);
nota('Nota 01 - LEGGIMI', leggi('note', '01-leggimi.md'), [-40, -560], 900, 480, 6);
nota('Nota 02 - Giro', leggi('note', '02-giro.md'), [COL(3) - 40, RIGA.giro - 520], 1300, 300, 5);
nota('Nota 03 - Carica', leggi('note', '03-carica.md'), [COL(3) - 40, RIGA.carica - 260], 1000, 220, 4);
nota('Nota 04 - Monta', leggi('note', '04-monta.md'), [COL(3) - 40, RIGA.monta + 160], 1200, 240, 3);

export const workflow = {
  name: '16 · Montatore',
  nodes: nodi,
  connections: connessioni,
  settings: { executionOrder: 'v1', timezone: 'Europe/Rome', callerPolicy: 'workflowsFromSameOwner', errorWorkflow: 'D3Ugm3sc201nteFX', saveManualExecutions: true, saveDataErrorExecution: 'all', saveDataSuccessExecution: 'none', binaryMode: 'separate' },
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const uscita = path.join(QUI, '16-montatore.json');
  fs.writeFileSync(uscita, `${JSON.stringify(workflow, null, 2)}\n`);
  console.log(`scritto ${path.relative(process.cwd(), uscita)}: ${nodi.length} nodi`);
}
