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
// La moodboard di Scatti di G (moodboard/sdg.md) entra nel prompt del piano e in quello della correzione della regia:
// è il linguaggio del marchio, vale per ogni video.
const MOODBOARD = `<moodboard>\n${leggi('moodboard', 'sdg.md').trim()}\n</moodboard>`;
const PROMPT = {
  PROMPT_CAPIRE: leggi('prompt', 'capire.md').trim(),
  PROMPT_PIANO: `${leggi('prompt', 'piano.md').trim()}\n\n${MOODBOARD}`,
  PROMPT_CONTROLLO: leggi('prompt', 'controllo.md').trim(),
  PROMPT_RITOCCO: `${leggi('prompt', 'ritocco.md').trim()}\n\n${MOODBOARD}`,
};

// Lo schema della regia di Scatti di G, uguale per il piano del mese e per i ritocchi (entra solo nei nodi che lo usano).
// Le coperture sono codici («V07.2», «F03») con facoltativa la posizione del soggetto dopo uno spazio («V07.2 sinistra»).
const SCHEMA_REGIA = {
  type: 'object',
  properties: {
    battute: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fonte: { type: 'string' },
          inizio: { type: 'number' },
          fine: { type: 'number' },
          immagini: { type: 'number' },
          nome: { type: 'string' },
          ruolo: { type: 'string' },
          posizione_volto: { type: 'string', enum: ['', 'sinistra', 'centro', 'destra', 'intera'] },
          coperture: { type: 'array', items: { type: 'string' } },
        },
        required: ['fonte', 'inizio', 'fine', 'immagini', 'nome', 'ruolo', 'posizione_volto', 'coperture'],
        additionalProperties: false,
      },
    },
    coperture_riserva: { type: 'array', items: { type: 'string' } },
    titolo: { type: 'string' },
    scritte: { type: 'array', items: { type: 'object', properties: { testo: { type: 'string' }, battuta: { type: 'integer' } }, required: ['testo', 'battuta'], additionalProperties: false } },
    chiusura: { type: 'string' },
    musica: { type: 'boolean' },
  },
  required: ['battute', 'coperture_riserva', 'titolo', 'scritte', 'chiusura', 'musica'],
  additionalProperties: false,
};
const COSTANTI = { ...PROMPT, SCHEMA_REGIA };

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
  for (const [k, v] of Object.entries(COSTANTI)) if (corpo.includes(k)) costanti += `const ${k} = ${JSON.stringify(v)};\n`;
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
function seStesso(nome, pos, aspetta, unoPerElemento = aspetta) {
  return nodo(nome, 'n8n-nodes-base.executeWorkflow', 1.3, {
    mode: unoPerElemento ? 'each' : 'once',
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
  // regia e stile dei reel (moodboard di Scatti di G); LUT della camera se il girato è in log (vuoto = nessuna)
  STILE_VIDEO: 'sdg',
  LUT: '',
  // revisione su Telegram: una scheda per contenuto con ✅ Approva / ✏️ Correggi («no» = come prima, righe scritte dal giro)
  REVISIONE: 'telegram',
  ATTESA_REVISIONE_GIORNI: 7,
  MAX_RITOCCHI: 3,
  EFFORT_RITOCCO: 'medium',
  // il guardiano delle cartelle: un servizio nuovo nella cartella Drive di un cliente parte da solo dopo QUIETE_MINUTI
  AVVIO_DA_CARTELLA: 'si',
  QUIETE_MINUTI: 30,
  TRASCRIVI: 'si',
  LINGUA: 'it',
  PROVINI_PER_DOMANDA: 6,
  MAX_MB_FILE: 500,
  MAX_FILE: 400,
  REEL: 10,
  POST: 8,
  STORIE: 16,
};
const valoreConfig = (k, v) => ({ id: uuid(`config:${k}`), name: k, value: v, type: typeof v === 'number' ? 'number' : 'string' });

// ---------------------------------------------------------------- INGRESSI
const COL = (c) => c * 240;
const RIGA = { modulo: 0, giro: 400, carica: 1300, monta: 1700, rivedi: 2150, guarda: 2700 };

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

// le uscite dello smistatore, in ordine; l'ultima (fallback) è il modulo
const LAVORI = ['giro', 'carica', 'monta', 'rivedi', 'guarda', 'avvia'];
const USCITA = Object.fromEntries([...LAVORI, 'modulo'].map((k, i) => [k, i]));
nodo('Quale lavoro?', 'n8n-nodes-base.switch', 3.2, {
  rules: { values: LAVORI.map((k) => ({
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
collega('Quale lavoro?', 'Leggi Clienti', USCITA.modulo);
// il guardiano delle cartelle entra nello stesso percorso del modulo (cliente + cartella), senza la pagina del modulo
collega('Quale lavoro?', 'Leggi Clienti', USCITA.avvia);
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
// dal guardiano delle cartelle non c'è una pagina del modulo da chiudere: i problemi vanno su Telegram
const DAL_MODULO = "$('Config').first().json.origine !== 'cartella'";
se('Dal modulo?', DAL_MODULO, [COL(16), RIGA.modulo + 150]);
se('Dal modulo (partito)?', DAL_MODULO, [COL(17), RIGA.modulo - 250]);
nodo('Telegram: non parto', 'n8n-nodes-base.telegram', 1.2, {
  resource: 'message',
  operation: 'sendMessage',
  chatId: "={{ $('Config').first().json.TELEGRAM_CHAT_ID }}",
  text: "={{ ('⚠️ Servizio nuovo nella cartella di ' + String($('Config').first().json.cliente || '') + ', ma non parto: ' + String($json.messaggio || '')).slice(0, 4000) }}",
  additionalFields: { appendAttribution: false, disable_web_page_preview: true },
}, [COL(17), RIGA.modulo + 300], { credentials: CRED.telegram, ...RIPROVA(2, 3000), onError: 'continueRegularOutput', webhookId: uuid('Telegram: non parto:webhook') });
collega('Dal modulo?', 'Fine: problema', 0);
collega('Dal modulo?', 'Telegram: non parto', 1);
catena('Leggi Clienti', 'Trova il cliente', 'Cliente trovato?');
collega('Cliente trovato?', 'Cartelle del cliente', 0);
collega('Cliente trovato?', 'Dal modulo?', 1);
catena('Cartelle del cliente', 'Trova la cartella del servizio', 'Cartella trovata?');
collega('Cartella trovata?', 'Elenca il servizio', 0);
collega('Cartella trovata?', 'Dal modulo?', 1);
catena('Elenca il servizio', 'Trova le sottocartelle', 'Cartella leggibile?');
collega('Cartella leggibile?', 'Elenca i file', 0);
collega('Cartella leggibile?', 'Dal modulo?', 1);
catena('Elenca i file', 'Prepara il lavoro', "C'è materiale?");
collega("C'è materiale?", 'Prepara la partenza', 0);
collega("C'è materiale?", 'Dal modulo?', 1);
catena('Prepara la partenza', 'Avvia il montaggio', 'Dal modulo (partito)?');
collega('Dal modulo (partito)?', 'Fine: partito', 0);

// ---------------------------------------------------------------- GIRO (esecuzione lunga, lanciata dal modulo)
const G = RIGA.giro;
codice('Inizio del giro', 'inizio-del-giro.js', [COL(3), G]);
collega('Quale lavoro?', 'Inizio del giro', USCITA.giro);
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
// il controllo del piano usa lo stesso stile (e quindi lo stesso ritmo) del montaggio dei reel con la regia
const CORPO_PIANO = "{ piano: $json.piano, mese: $('Config').first().json.mese.chiave, richiesta: $('Config').first().json.richiesta, oggi: $now.setZone('Europe/Rome').toFormat('yyyy-MM-dd'), stile: String($('Config').first().json.STILE_VIDEO || 'sdg'), marchio: $('Config').first().json.cliente.marchio, marchio_valido: $('Config').first().json.cliente.marchio_valido !== false }";
officinaJson('Officina: controlla il piano', "'/progetto/' + $('Officina: nuovo progetto').first().json.progetto + '/piano'", CORPO_PIANO, [COL(23), G]);
se('Serve una correzione?', "Array.isArray($json.problemi) && $json.problemi.some((p) => p.gravita === 'blocca')", [COL(24), G]);
codice('Domanda di correzione', 'domanda-di-correzione.js', [COL(25), G - 150]);
claude('Claude: correggi il piano', [COL(26), G - 150], 900000);
codice('Leggi la correzione', 'leggi-la-correzione.js', [COL(27), G - 150]);
officinaJson('Officina: ricontrolla il piano', "'/progetto/' + $('Officina: nuovo progetto').first().json.progetto + '/piano'", CORPO_PIANO, [COL(28), G - 150]);
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
se('Ci sono schede?', 'Array.isArray($json.schede) && $json.schede.length > 0', [COL(39), G + 350]);
codice('Schede da rivedere', 'schede-da-rivedere.js', [COL(40), G + 350]);
seStesso('Manda le schede', [COL(41), G + 350], false, true);
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
collega('Esito dei montaggi', 'Ci sono schede?');
catena('Messaggi finali', 'Telegram: riepilogo');
collega('Scrivo nel Calendario?', 'Righe del Calendario', 0);
catena('Righe del Calendario', 'Scrivi nel Calendario');
collega('Chiudo il progetto?', 'Officina: chiudi il progetto', 0);
catena('Messaggio di stop', 'Telegram: giro fermo');
collega('Ci sono schede?', 'Schede da rivedere', 0);
catena('Schede da rivedere', 'Manda le schede');

// ---------------------------------------------------------------- CARICA (un file: Drive → officina)
const C = RIGA.carica;
driveScarica('Scarica il file', "$('Config').first().json.file.id", 'file', [COL(3), C], { onError: 'continueErrorOutput' });
collega('Quale lavoro?', 'Scarica il file', USCITA.carica);
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
collega('Quale lavoro?', 'Da dove arriva il logo?', USCITA.monta);
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

// ---------------------------------------------------------------- RIVEDI (un contenuto: scheda su Telegram, Approva o Correggi)
// Un'esecuzione per contenuto, lanciata dal giro senza aspettarla: resta in attesa della risposta del team (fino a
// ATTESA_REVISIONE_GIORNI). Approva → riga del Calendario (in attivo). Correggi → nota → Claude riscrive la regia →
// l'esecuzione «monta» rimonta (versione 2, 3…) → una scheda nuova. Il progetto nell'officina resta per i ritocchi.
const V = RIGA.rivedi;
function telegramDa(nome, espressione, pos, html = true) {
  return nodo(nome, 'n8n-nodes-base.telegram', 1.2, {
    resource: 'message',
    operation: 'sendMessage',
    chatId: "={{ $('Config').first().json.TELEGRAM_CHAT_ID }}",
    text: `={{ String(${espressione} || '').slice(0, 4000) }}`,
    additionalFields: { appendAttribution: false, ...(html ? { parse_mode: 'HTML' } : {}), disable_web_page_preview: true },
  }, pos, { credentials: CRED.telegram, ...RIPROVA(2, 3000), onError: 'continueRegularOutput', webhookId: uuid(`${nome}:webhook`) });
}
function telegramMedia(nome, operazione, pos) {
  return nodo(nome, 'n8n-nodes-base.telegram', 1.2, {
    resource: 'message',
    operation: operazione,
    chatId: "={{ $('Config').first().json.TELEGRAM_CHAT_ID }}",
    binaryData: true,
    binaryPropertyName: 'anteprima',
    additionalFields: { caption: "={{ $('Prepara la scheda').first().json.didascalia_anteprima }}", disable_notification: true },
  }, pos, { credentials: CRED.telegram, ...RIPROVA(2, 3000), onError: 'continueRegularOutput', webhookId: uuid(`${nome}:webhook`) });
}
codice('Prepara la scheda', 'prepara-la-scheda.js', [COL(3), V]);
collega('Quale lavoro?', 'Prepara la scheda', USCITA.rivedi);
se("C'è l'anteprima?", '$json.anteprima', [COL(4), V]);
driveScarica("Scarica l'anteprima", "$('Prepara la scheda').first().json.anteprima_id", 'anteprima', [COL(5), V - 150], { onError: 'continueRegularOutput' });
se("È un video?", "$('Prepara la scheda').first().json.anteprima_video", [COL(6), V - 150]);
telegramMedia('Telegram: il video', 'sendVideo', [COL(7), V - 250]);
telegramMedia('Telegram: la foto', 'sendPhoto', [COL(7), V - 100]);
nodo('Chiedi: va bene?', 'n8n-nodes-base.telegram', 1.2, {
  resource: 'message',
  operation: 'sendAndWait',
  chatId: "={{ $('Config').first().json.TELEGRAM_CHAT_ID }}",
  message: "={{ $('Prepara la scheda').first().json.messaggio_scheda }}",
  responseType: 'approval',
  approvalOptions: { values: { approvalType: 'double', approveLabel: '✅ Approva', disapproveLabel: '✏️ Correggi' } },
  options: {
    limitWaitTime: { values: { limitType: 'afterTimeInterval', resumeAmount: "={{ Number($('Config').first().json.ATTESA_REVISIONE_GIORNI) || 7 }}", resumeUnit: 'days' } },
    appendAttribution: false,
  },
}, [COL(8), V], { credentials: CRED.telegram, onError: 'continueRegularOutput', webhookId: uuid('Chiedi: va bene?:webhook') });
codice('Decisione sulla scheda', 'decisione-sulla-scheda.js', [COL(9), V]);
nodo('Cosa ha deciso?', 'n8n-nodes-base.switch', 3.2, {
  rules: { values: ['approva', 'correggi'].map((k) => ({
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: uuid(`decisione:${k}`), leftValue: "={{ String($json.esito || '') }}", rightValue: k, operator: { type: 'string', operation: 'equals' } }],
      combinator: 'and',
    },
    renameOutput: true,
    outputKey: k,
  })) },
  options: { fallbackOutput: 'extra', renameFallbackOutput: 'niente' },
}, [COL(10), V]);
// Approva
codice('Riga approvata', 'riga-approvata.js', [COL(11), V - 200]);
se('Scrivo la riga?', '$json.scrivi', [COL(12), V - 200]);
nodo('Riga per il foglio', 'n8n-nodes-base.code', 2, { mode: 'runOnceForAllItems', jsCode: "// Solo i campi della riga (il foglio mette ogni campo nella colonna con lo stesso nome).\nreturn [{ json: $('Riga approvata').first().json.riga }];" }, [COL(13), V - 280]);
nodo('Scrivi la riga approvata', 'n8n-nodes-base.googleSheets', 4.7, {
  authentication: 'oAuth2',
  resource: 'sheet',
  operation: 'append',
  documentId: { __rl: true, value: "={{ $('Config').first().json.SHEET_ID }}", mode: 'id' },
  sheetName: { __rl: true, value: 'Calendario', mode: 'name' },
  columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: false },
  options: { cellFormat: 'RAW', useAppend: true, handlingExtraData: 'ignoreIt' },
}, [COL(14), V - 280], { credentials: CRED.sheets, ...RIPROVA(2, 5000), onError: 'continueRegularOutput' });
telegramDa('Telegram: approvato', "$('Riga approvata').first().json.messaggio + ($('Scrivi la riga approvata').isExecuted && $('Scrivi la riga approvata').first().json.error ? '\\n⚠️ Ma il Calendario non ha accettato la riga: scrivetela a mano.' : '')", [COL(15), V - 200]);
// Correggi
nodo('Chiedi: cosa cambio?', 'n8n-nodes-base.telegram', 1.2, {
  resource: 'message',
  operation: 'sendAndWait',
  chatId: "={{ $('Config').first().json.TELEGRAM_CHAT_ID }}",
  message: "={{ '✏️ Cosa cambio in «' + String((($('Config').first().json.esito || {}).contenuto || {}).titolo || 'questo contenuto').replace(/[_*`\\[]/g, ' ') + '»? Scrivilo come lo diresti a voce (es. «togli la scena del bancone», «più corto», «metti prima la ragazza che ride»).' }}",
  responseType: 'freeText',
  options: {
    limitWaitTime: { values: { limitType: 'afterTimeInterval', resumeAmount: 2, resumeUnit: 'days' } },
    appendAttribution: false,
  },
}, [COL(11), V + 100], { credentials: CRED.telegram, onError: 'continueRegularOutput', webhookId: uuid('Chiedi: cosa cambio?:webhook') });
codice('Domanda di ritocco', 'domanda-di-ritocco.js', [COL(12), V + 100]);
se('Ritocco possibile?', '$json.ok', [COL(13), V + 100]);
claude('Claude: ritocca la regia', [COL(14), V + 50], 600000);
codice('Leggi il ritocco', 'leggi-il-ritocco.js', [COL(15), V + 50]);
se('Ritocco pronto?', '$json.ok', [COL(16), V + 50]);
nodo('Da rimontare', 'n8n-nodes-base.code', 2, { mode: 'runOnceForAllItems', jsCode: "// Il contenuto ritoccato va all'esecuzione «monta», come quelli del giro.\nreturn [{ json: $('Leggi il ritocco').first().json.monta }];" }, [COL(17), V]);
seStesso('Rimonta il contenuto', [COL(18), V], true);
codice('Esito del ritocco', 'esito-del-ritocco.js', [COL(19), V]);
telegram('Telegram: ritocco', [COL(20), V - 100]);
se('Scheda nuova?', '$json.ok', [COL(20), V + 50]);
nodo('Scheda nuova', 'n8n-nodes-base.code', 2, { mode: 'runOnceForAllItems', jsCode: "// La versione rimontata torna in revisione con una scheda sua.\nreturn [{ json: $('Esito del ritocco').first().json.scheda }];" }, [COL(21), V + 50]);
seStesso('Manda la scheda nuova', [COL(22), V + 50], false, true);
telegram('Telegram: niente ritocco', [COL(14), V + 200]);
// Nessuna risposta
nodo('Nessuna risposta', 'n8n-nodes-base.code', 2, { mode: 'runOnceForAllItems', jsCode: "// Niente risposta entro il tempo (o Telegram non ha preso la scheda): il contenuto resta su Drive, fuori dal Calendario.\nconst J = $('Config').first().json;\nconst c = (J.esito || {}).contenuto || {};\nconst d = $input.first().json || {};\nconst giorni = Number(J.ATTESA_REVISIONE_GIORNI) || 7;\nconst nome = String(((J.giro || {}).cliente || {}).nome_locale || '') + ' · ' + String(c.titolo || '');\nconst esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');\nreturn [{ json: { messaggio: d.esito === 'errore' ? '⚠️ <b>Scheda non partita</b> · ' + esc(nome) + '\\nTelegram non l\\'ha accettata (' + esc(String(d.errore || '').slice(0, 200)) + '). Il contenuto è su Drive, non nel Calendario.' : '⏳ <b>Nessuna risposta in ' + giorni + ' giorni</b> · ' + esc(nome) + '\\nIl contenuto resta su Drive, non è nel Calendario.' } }];" }, [COL(11), V + 300]);
telegram('Telegram: nessuna risposta', [COL(12), V + 300]);

catena('Prepara la scheda', "C'è l'anteprima?");
collega("C'è l'anteprima?", "Scarica l'anteprima", 0);
collega("C'è l'anteprima?", 'Chiedi: va bene?', 1);
catena("Scarica l'anteprima", 'È un video?');
collega('È un video?', 'Telegram: il video', 0);
collega('È un video?', 'Telegram: la foto', 1);
collega('Telegram: il video', 'Chiedi: va bene?');
collega('Telegram: la foto', 'Chiedi: va bene?');
catena('Chiedi: va bene?', 'Decisione sulla scheda', 'Cosa ha deciso?');
collega('Cosa ha deciso?', 'Riga approvata', 0);
collega('Cosa ha deciso?', 'Chiedi: cosa cambio?', 1);
collega('Cosa ha deciso?', 'Nessuna risposta', 2);
catena('Riga approvata', 'Scrivo la riga?');
collega('Scrivo la riga?', 'Riga per il foglio', 0);
collega('Scrivo la riga?', 'Telegram: approvato', 1);
catena('Riga per il foglio', 'Scrivi la riga approvata', 'Telegram: approvato');
catena('Chiedi: cosa cambio?', 'Domanda di ritocco', 'Ritocco possibile?');
collega('Ritocco possibile?', 'Claude: ritocca la regia', 0);
collega('Ritocco possibile?', 'Telegram: niente ritocco', 1);
catena('Claude: ritocca la regia', 'Leggi il ritocco', 'Ritocco pronto?');
collega('Ritocco pronto?', 'Da rimontare', 0);
collega('Ritocco pronto?', 'Telegram: niente ritocco', 1);
catena('Da rimontare', 'Rimonta il contenuto', 'Esito del ritocco');
collega('Esito del ritocco', 'Telegram: ritocco');
collega('Esito del ritocco', 'Scheda nuova?');
collega('Scheda nuova?', 'Scheda nuova', 0);
catena('Scheda nuova', 'Manda la scheda nuova');
catena('Nessuna risposta', 'Telegram: nessuna risposta');

// ---------------------------------------------------------------- GUARDA (il guardiano delle cartelle, ogni 15 minuti)
// Cerca nelle cartelle Drive dei clienti attivi le cartelle create da quando il workflow è acceso; quando un servizio
// ha del materiale e da QUIETE_MINUTI non arriva niente di nuovo, parte il montaggio come dal modulo. Una volta sola.
const W = RIGA.guarda;
nodo('Ogni 15 minuti', 'n8n-nodes-base.scheduleTrigger', 1.2, { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } }, [0, W]);
nodo('Segna: guarda', 'n8n-nodes-base.code', 2, { mode: 'runOnceForAllItems', jsCode: "// Il giro del guardiano passa da Config come gli altri lavori.\nreturn [{ json: { lavoro: 'guarda' } }];" }, [COL(1) - 120, W]);
catena('Ogni 15 minuti', 'Segna: guarda', 'Config');
nodo('Guarda: leggi Clienti', 'n8n-nodes-base.httpRequest', 4.5, {
  method: 'GET',
  url: "={{ \"https://sheets.googleapis.com/v4/spreadsheets/\" + encodeURIComponent($('Config').first().json.SHEET_ID) + '/values/' + encodeURIComponent(\"Clienti!A:AZ\") }}",
  authentication: 'predefinedCredentialType',
  nodeCredentialType: 'googleSheetsOAuth2Api',
  sendQuery: true,
  specifyQuery: 'keypair',
  queryParameters: { parameters: [{ name: 'valueRenderOption', value: 'FORMATTED_VALUE' }, { name: 'majorDimension', value: 'ROWS' }] },
  options: { timeout: 30000, response: { response: { responseFormat: 'json' } } },
}, [COL(3), W], { credentials: CRED.sheets, ...RIPROVA(2, 5000), onError: 'continueRegularOutput' });
collega('Quale lavoro?', 'Guarda: leggi Clienti', USCITA.guarda);
codice('Guarda: cartelle dei clienti', 'guarda-clienti.js', [COL(4), W]);
driveElenca('Guarda: servizi dei clienti', "={{ \"'\" + $json.cartella_cliente + \"' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false and createdTime > '\" + $json.dopo + \"'\" }}", [COL(5), W], 'nextPageToken,files(id,name,createdTime)');
codice('Guarda: servizi nuovi', 'guarda-servizi.js', [COL(6), W]);
driveElenca('Guarda: dentro il servizio', "={{ \"'\" + $json.servizio_id + \"' in parents and trashed = false\" }}", [COL(7), W], 'nextPageToken,files(id,name,mimeType,createdTime)');
codice('Guarda: sottocartelle', 'guarda-sottocartelle.js', [COL(8), W]);
driveElenca('Guarda: dentro le sottocartelle', "={{ \"'\" + $json.cartella + \"' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'\" }}", [COL(9), W], 'nextPageToken,files(id,name,mimeType,createdTime)');
codice('Guarda: servizi pronti', 'guarda-pronti.js', [COL(10), W]);
seStesso('Guarda: avvia il montaggio', [COL(11), W - 80], false, true);
telegram('Telegram: servizio nuovo', [COL(11), W + 80]);
catena('Guarda: leggi Clienti', 'Guarda: cartelle dei clienti', 'Guarda: servizi dei clienti', 'Guarda: servizi nuovi', 'Guarda: dentro il servizio', 'Guarda: sottocartelle', 'Guarda: dentro le sottocartelle', 'Guarda: servizi pronti');
collega('Guarda: servizi pronti', 'Guarda: avvia il montaggio');
collega('Guarda: servizi pronti', 'Telegram: servizio nuovo');

// ---------------------------------------------------------------- NOTE
const nota = (nome, testo, pos, l, a, colore) => nodo(nome, 'n8n-nodes-base.stickyNote', 1, { content: testo, height: a, width: l, color: colore }, pos);
nota('Nota 01 - LEGGIMI', leggi('note', '01-leggimi.md'), [-40, -560], 900, 480, 6);
nota('Nota 02 - Giro', leggi('note', '02-giro.md'), [COL(3) - 40, RIGA.giro - 520], 1300, 300, 5);
nota('Nota 03 - Carica', leggi('note', '03-carica.md'), [COL(3) - 40, RIGA.carica - 260], 1000, 220, 4);
nota('Nota 04 - Monta', leggi('note', '04-monta.md'), [COL(3) - 40, RIGA.monta + 160], 1200, 240, 3);
nota('Nota 05 - Rivedi', leggi('note', '05-rivedi.md'), [COL(3) - 40, RIGA.rivedi - 520], 1300, 240, 6);
nota('Nota 06 - Guarda', leggi('note', '06-guarda.md'), [COL(3) - 40, RIGA.guarda + 160], 1200, 220, 5);

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
