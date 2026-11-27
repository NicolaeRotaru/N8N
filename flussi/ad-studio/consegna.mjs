// Costruisce i tre flussi n8n con cui l'AD consegna i contenuti che ha prodotto (piano Max, nessuna API di IA):
//
//   carica   «AD · Carica su Drive»          — mette su Drive i file preparati dall'AD. I file arrivano DENTRO il nodo
//                                              «Prepara» (base64), scritto via API prima di ogni corsa e svuotato dopo:
//                                              nessun indirizzo pubblico, nessuna chiave nuova.
//   proponi  «AD · Proponi nel Calendario»   — scrive la riga nel Calendario in stato da_approvare (il flusso 01 la
//                                              ignora), manda l'anteprima su Telegram e sotto la domanda coi tasti
//                                              Approva / Rifiuta. Non aspetta: il tocco lo riceve «tasti».
//                                              Con {riepilogo:{lotto}} manda invece l'elenco del gruppo col tasto
//                                              «Approva tutti».
//   tasti    «AD · Tasti su Telegram»        — ACCESO: riceve i tocchi sui tasti (Telegram Trigger, solo callback_query),
//                                              conta solo quelli della chat di Nicola, rilegge la riga e la passa ad
//                                              approvato o bozza solo se è ancora da_approvare. Poi la domanda diventa
//                                              la riga di stato («Approvato: esce sab 28/11 alle 21:30»), senza tasti.
//
// Nicola, 27/11/2026 ~03:00: il vecchio tasto era un link (sendAndWait di n8n): «Apri link», poi il browser, per
// ogni contenuto. Con callback_data il tocco resta dentro Telegram.
//
// carica e proponi restano SPENTI: si avviano solo a mano (MCP execute_workflow, ingresso webhook). tasti è acceso.
// Il repository è pubblico: ID del foglio e della chat Telegram NON stanno qui, si passano a riga di comando
// (si leggono dal Config del flusso 04).
//
// Uso: node consegna.mjs carica --json
//      node consegna.mjs proponi --json --foglio <SHEET_ID> --chat <TELEGRAM_CHAT_ID>
//      node consegna.mjs tasti   --json --foglio <SHEET_ID> --chat <TELEGRAM_CHAT_ID>
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const qui = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d = '') => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const DRIVE = { id: arg('--drive', 'FCSps1wTGjDI2YUg'), name: 'Google Drive - Agenzia' };
const SHEETS = { id: arg('--sheets', 'N0ckGuoYFN0qbSEt'), name: 'Google Sheets - Agenzia' };
const TELEGRAM = { id: arg('--telegram', 'OSR2Mp2IrY68ShiL'), name: 'Telegram - Bot agenzia' };
const MY_DRIVE = { __rl: true, value: 'My Drive', mode: 'list', cachedResultName: 'My Drive' };
const schema = JSON.parse(readFileSync(path.join(qui, 'schema-calendario.json'), 'utf8'));
const impostazioni = { executionOrder: 'v1', availableInMCP: true, saveManualExecutions: true, saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' };
const webhook = (id, percorso, uuid) => ({ id, name: 'Richiesta', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: uuid, parameters: { httpMethod: 'POST', path: percorso, options: {} } });
const codice = (id, name, pos, righe) => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos, parameters: { jsCode: righe.join('\n') } });
const se = (id, name, pos, espressione) => ({ id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: pos,
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, combinator: 'and',
    conditions: [{ id: id + 'c', leftValue: espressione, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } });
const collega = (coppie) => {
  const c = {};
  for (const [da, a, uscita = 0] of coppie) {
    c[da] ??= { main: [] };
    while (c[da].main.length <= uscita) c[da].main.push([]);
    c[da].main[uscita].push({ node: a, type: 'main', index: 0 });
  }
  return c;
};

// ───────────────────────────────────────────── carica
export const SEGNAPOSTO_FILE = 'const FILE = []; // __FILE__ (lo riempie l\'AD prima della corsa e lo svuota dopo)';
function flussoCarica() {
  const nodi = [
    webhook('c1', 'ad-carica-drive', 'b7f3c1de-4d57-4a8e-9c1e-ad1e66e00002'),
    codice('c2', 'Prepara', [220, 0], [
      SEGNAPOSTO_FILE,
      "const b = $input.first().json.body || {};",
      "if (b.crea_cartella) {",
      "  const c = b.crea_cartella;",
      "  if (!c.nome || !c.dentro) throw new Error('crea_cartella vuole «nome» e «dentro»');",
      "  return [{ json: { azione: 'cartella', nome: String(c.nome), dentro: String(c.dentro) } }];",
      "}",
      "// Cestino (non cancellazione): solo file che stanno nella cartella indicata, cioè quelli che l'AD ha caricato lì.",
      "if (Array.isArray(b.cestina) && b.cestina.length) {",
      "  if (!b.cartella) throw new Error('cestina vuole anche «cartella»: si toccano solo i file di quella cartella');",
      "  return b.cestina.map((id) => ({ json: { azione: 'cestina', id: String(id), cartella: String(b.cartella) } }));",
      "}",
      "if (!b.cartella) throw new Error('Serve «cartella»: l\\'ID della cartella Drive di arrivo');",
      "if (!FILE.length) throw new Error('Nel nodo Prepara non ci sono file: l\\'AD li scrive prima della corsa');",
      "const out = [];",
      "for (const f of FILE) {",
      "  const dati = await this.helpers.prepareBinaryData(Buffer.from(f.b64, 'base64'), f.nome, f.mime);",
      "  out.push({ json: { azione: 'carica', nome: f.nome, cartella: String(b.cartella) }, binary: { data: dati } });",
      "}",
      "return out;"]),
    se('c3', 'Cartella nuova?', [440, 0], "={{ $json.azione === 'cartella' }}"),
    { id: 'c4', name: 'Crea la cartella', type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position: [660, -100], credentials: { googleDriveOAuth2Api: DRIVE },
      parameters: { authentication: 'oAuth2', resource: 'folder', operation: 'create', name: '={{ $json.nome }}', driveId: MY_DRIVE, folderId: { __rl: true, value: '={{ $json.dentro }}', mode: 'id' }, options: {} } },
    { id: 'c5', name: 'Carica il file', type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position: [660, 100], credentials: { googleDriveOAuth2Api: DRIVE },
      parameters: { authentication: 'oAuth2', resource: 'file', operation: 'upload', inputDataFieldName: 'data', name: '={{ $json.nome }}', driveId: MY_DRIVE, folderId: { __rl: true, value: '={{ $json.cartella }}', mode: 'id' }, options: {} } },
    se('c6', 'Da cestinare?', [330, 220], "={{ $json.azione === 'cestina' }}"),
    { id: 'c7', name: 'Leggi dove sta', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.5, position: [550, 300], credentials: { googleDriveOAuth2Api: DRIVE },
      parameters: { method: 'GET', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
        url: "={{ 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent($json.id) + '?fields=id,name,parents&supportsAllDrives=true' }}", options: { timeout: 60000 } } },
    se('c8', 'È nella cartella giusta?', [770, 300], "={{ ($json.parents || []).includes($('Da cestinare?').itemMatching($itemIndex).json.cartella) }}"),
    { id: 'c9', name: 'Sposta nel cestino', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.5, position: [990, 300], credentials: { googleDriveOAuth2Api: DRIVE },
      parameters: { method: 'PATCH', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
        url: "={{ 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent($json.id) + '?fields=id,name,trashed&supportsAllDrives=true' }}",
        sendBody: true, specifyBody: 'json', jsonBody: '{"trashed": true}', options: { timeout: 60000 } } },
  ];
  return { name: 'AD · Carica su Drive', nodes: nodi, settings: impostazioni,
    connections: collega([['Richiesta', 'Prepara'], ['Prepara', 'Da cestinare?'], ['Da cestinare?', 'Leggi dove sta', 0], ['Da cestinare?', 'Cartella nuova?', 1],
      ['Leggi dove sta', 'È nella cartella giusta?'], ['È nella cartella giusta?', 'Sposta nel cestino', 0],
      ['Cartella nuova?', 'Crea la cartella', 0], ['Cartella nuova?', 'Carica il file', 1]]) };
}

// ───────────────────────────────────────────── proponi e tasti: pezzi in comune
const controllaFoglioChat = (foglio, chat) => {
  if (!foglio || !chat) throw new Error('proponi e tasti vogliono --foglio e --chat');
  if (!/^-?\d+$/.test(chat)) throw new Error('--chat deve essere un numero');
};
// «sab 28/11 alle 21:30» da «2026-11-28 21:30»: la stessa forma delle didascalie su Telegram.
const QUANDO = [
  "const quando = (d) => {",
  "  const m = /^(\\d{4})-(\\d{2})-(\\d{2}) (\\d{2}):(\\d{2})$/.exec(String(d || '').trim());",
  "  if (!m) return String(d || '');",
  "  const g = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];",
  "  return g + ' ' + (+m[3]) + '/' + (+m[2]) + ' alle ' + m[4] + ':' + m[5];",
  "};",
];
// L'impronta della versione mostrata: file e ora. Va nel tasto, così il tasto di un'anteprima vecchia non approva
// la versione riproposta dopo (collaudo del 27/11, D4). Sei caratteri [0-9a-z], FNV-1a a 32 bit.
const FIRMA = [
  "const firma = (r) => {",
  "  const s = String(r.media || '').trim() + '|' + String(r.data_ora || '').trim();",
  "  let h = 2166136261;",
  "  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }",
  "  return h.toString(36).padStart(7, '0').slice(-6);",
  "};",
];
// Le righe di un gruppo che «Approva tutti» può approvare: ancora da approvare, ora non passata, id non doppio.
// La usano sia il riepilogo (quello che Nicola legge) sia il tocco (quello che si scrive): così i due numeri coincidono.
const GRUPPO = [
  "const scegliGruppo = (tutte, lotto, ora) => {",
  "  const conta = {};",
  "  for (const r of tutte) { const k = String(r.id || '').trim(); if (k) conta[k] = (conta[k] || 0) + 1; }",
  "  const segno = '[lotto ' + lotto + ']';",
  "  const nel = tutte.filter((r) => String(r.id || '').trim() && r.stato === 'da_approvare' && String(r.note || '').includes(segno))",
  "    .sort((a, b) => String(a.data_ora).localeCompare(String(b.data_ora)));",
  "  const doppie = nel.filter((r) => conta[String(r.id).trim()] > 1);",
  "  const passate = nel.filter((r) => !(conta[String(r.id).trim()] > 1) && !(String(r.data_ora || '') > ora));",
  "  const buone = nel.filter((r) => !doppie.includes(r) && !passate.includes(r));",
  "  return { buone, passate, doppie };",
  "};",
  "const ADESSO = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 16);",
];
// Il segno del gruppo nelle note della riga: «[lotto tropico-latino-1127-0124]». Lo legge «Approva tutti».
const LOTTO = '^[a-z0-9][a-z0-9-]{0,39}$';
const foglioDi = (foglio) => ({ documento: { __rl: true, value: foglio, mode: 'id' }, scheda: { __rl: true, value: 'Calendario', mode: 'name' } });
const aggiornaRiga = (foglio, id, name, pos, valori, operazione = 'update') => ({ id, name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.7, position: pos, credentials: { googleSheetsOAuth2Api: SHEETS },
  parameters: { authentication: 'oAuth2', resource: 'sheet', operation: operazione, documentId: foglioDi(foglio).documento, sheetName: foglioDi(foglio).scheda,
    columns: { mappingMode: 'defineBelow', value: valori, matchingColumns: ['id'], schema }, options: {} } });
const leggiCalendario = (foglio, id, name, pos) => ({ id, name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.7, position: pos, credentials: { googleSheetsOAuth2Api: SHEETS },
  alwaysOutputData: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
  parameters: { authentication: 'oAuth2', resource: 'sheet', operation: 'read', documentId: foglioDi(foglio).documento, sheetName: foglioDi(foglio).scheda, options: {} } });
const tasti = (righe) => ({ rows: righe.map((bottoni) => ({ row: { buttons: bottoni.map(([testo, dato]) => ({ text: testo, additionalFields: { callback_data: dato } })) } })) });
// Un messaggio Telegram che non parte non deve lasciare a metà la proposta: si riprova due volte.
const RIPROVA = { retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 };

// ───────────────────────────────────────────── proponi
function flussoProponi(foglio, chat) {
  controllaFoglioChat(foglio, chat);
  // «brief» non si scrive: sulle righe-idea del piano del mese resta quello che c'era.
  const campi = ['id', 'cliente', 'tipo', 'piattaforme', 'data_ora', 'didascalia', 'primo_commento', 'media', 'copertina', 'stato', 'errore', 'note'];
  const P = "$('Controlla la proposta').first().json";
  const nodi = [
    webhook('p1', 'ad-proponi-calendario', 'b7f3c1de-4d57-4a8e-9c1e-ad1e66e00003'),
    codice('p2', 'Controlla la proposta', [220, 0], [
      ...FIRMA,
      "const b = $input.first().json.body || {};",
      "const testo = (v) => (v === null || v === undefined ? '' : String(v)).trim();",
      "const lotto = testo(b.lotto || (b.riepilogo && b.riepilogo.lotto)).toLowerCase();",
      `if (lotto && !new RegExp('${LOTTO}').test(lotto)) throw new Error('lotto non valido: solo lettere minuscole, cifre e trattini, al massimo 40');`,
      "// Il riepilogo del gruppo: l'elenco di quello che è ancora da approvare, col tasto «Approva tutti».",
      "if (b.riepilogo) {",
      "  if (!lotto) throw new Error('Il riepilogo vuole riepilogo.lotto');",
      "  return [{ json: { modo: 'riepilogo', lotto, nome: testo(b.riepilogo.nome) } }];",
      "}",
      "const r = Object.assign({}, b.riga || {});",
      "for (const k of ['id', 'cliente', 'tipo', 'data_ora', 'media']) if (!testo(r[k])) throw new Error('Manca «' + k + '» nella riga');",
      "r.id = testo(r.id);",
      "if (!['post', 'carosello', 'reel', 'storia'].includes(r.tipo)) throw new Error('tipo non valido: ' + r.tipo);",
      "if (!/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$/.test(r.data_ora)) throw new Error('data_ora deve essere AAAA-MM-GG HH:MM');",
      "if (r.tipo !== 'storia' && !testo(r.didascalia)) throw new Error('Manca la didascalia');",
      "if (r.tipo === 'reel' && !testo(r.copertina)) throw new Error('Il reel vuole la copertina');",
      "const versione = firma(r);",
      "// Il tasto porta id e versione: Telegram ne accetta al massimo 64 byte («ok:» e «:versione» compresi).",
      "if (new TextEncoder().encode('ok:' + r.id + ':' + versione).length > 64) throw new Error('id della riga troppo lungo per il tasto di Telegram (massimo 54 byte)');",
      "// La riga nasce SEMPRE da approvare: il flusso 01 la ignora finché il team non preme Approva.",
      "r.stato = 'da_approvare'; r.errore = '';",
      "r.piattaforme = testo(r.piattaforme) || 'ig+fb';",
      "// Il segno del gruppo NON si scrive qui: lo scrive «Segna il gruppo» solo dopo che anteprima e domanda sono arrivate.",
      "// Così «Approva tutti» non approva mai un contenuto che Nicola non ha visto (collaudo del 27/11, D1).",
      "const segno = lotto ? '[lotto ' + lotto + ']' : '';",
      "r.note = testo(r.note).split(/\\s*\\[lotto [a-z0-9-]+\\]/).join('').trim();",
      "const a = b.anteprima || {};",
      "if (!a.file_id) throw new Error('Manca anteprima.file_id');",
      "return [{ json: { modo: 'proposta', riga: r, versione, lotto, note_col_gruppo: segno ? (r.note ? r.note + ' ' : '') + segno : '', anteprima: { file_id: String(a.file_id), video: a.tipo === 'video' }, didascalia_telegram: testo(b.didascalia_telegram).slice(0, 1000), messaggio: testo(b.messaggio).slice(0, 3900) || ('Approvi la riga ' + r.id + '?') } }];"]),
    se('p20', 'È il riepilogo?', [440, 0], "={{ $json.modo === 'riepilogo' }}"),
    aggiornaRiga(foglio, 'p3', 'Scrivi la riga nel Calendario', [660, 100], Object.fromEntries(campi.map((k) => [k, `={{ $json.riga.${k} ?? '' }}`])), 'appendOrUpdate'),
    { id: 'p4', name: 'Scarica l\'anteprima', type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position: [880, 100], credentials: { googleDriveOAuth2Api: DRIVE },
      parameters: { authentication: 'oAuth2', resource: 'file', operation: 'download', fileId: { __rl: true, value: `={{ ${P}.anteprima.file_id }}`, mode: 'id' }, options: { binaryPropertyName: 'data' } } },
    se('p5', 'È un video?', [1100, 100], `={{ ${P}.anteprima.video }}`),
    { id: 'p6', name: 'Manda il video', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [1320, 0], credentials: { telegramApi: TELEGRAM }, ...RIPROVA,
      parameters: { resource: 'message', operation: 'sendVideo', chatId: chat, binaryData: true, binaryPropertyName: 'data', additionalFields: { caption: `={{ ${P}.didascalia_telegram }}` } } },
    { id: 'p7', name: 'Manda la foto', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [1320, 200], credentials: { telegramApi: TELEGRAM }, ...RIPROVA,
      parameters: { resource: 'message', operation: 'sendPhoto', chatId: chat, binaryData: true, binaryPropertyName: 'data', additionalFields: { caption: `={{ ${P}.didascalia_telegram }}` } } },
    // Prima era sendAndWait: n8n ci mette tasti-link verso /webhook-waiting, e ogni tocco apriva il browser.
    // Ora i tasti portano callback_data e il tocco lo riceve il flusso «AD · Tasti su Telegram». Qui non si aspetta.
    { id: 'p8', name: 'Chiedi Approva o Rifiuta', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [1540, 100], credentials: { telegramApi: TELEGRAM }, ...RIPROVA,
      parameters: { resource: 'message', operation: 'sendMessage', chatId: chat, text: `={{ ${P}.messaggio }}`, replyMarkup: 'inlineKeyboard',
        inlineKeyboard: tasti([[['Approva', `={{ 'ok:' + ${P}.riga.id + ':' + ${P}.versione }}`], ['Rifiuta', `={{ 'no:' + ${P}.riga.id + ':' + ${P}.versione }}`]]]),
        additionalFields: { appendAttribution: false, reply_to_message_id: '={{ $json.result.message_id }}' } } },
    se('p25', 'Ha un gruppo?', [1760, 100], `={{ !!${P}.lotto }}`),
    { ...aggiornaRiga(foglio, 'p26', 'Segna il gruppo', [1980, 0], { id: `={{ ${P}.riga.id }}`, note: `={{ ${P}.note_col_gruppo }}` }), retryOnFail: true, maxTries: 3, waitBetweenTries: 2000 },
    leggiCalendario(foglio, 'p21', 'Leggi il gruppo', [660, -150]),
    codice('p22', 'Prepara il riepilogo', [880, -150], [
      ...QUANDO,
      ...GRUPPO,
      "const req = $('Controlla la proposta').first().json;",
      "const { buone, passate, doppie } = scegliGruppo($input.all().map((i) => i.json || {}), req.lotto, ADESSO);",
      "if (!buone.length) return [{ json: { manda: false, quanti: 0, lotto: req.lotto, passate: passate.length, doppie: doppie.length, messaggio: 'Nel gruppo ' + req.lotto + ' non resta niente da approvare: non ho mandato il riepilogo.' } }];",
      "const n = buone.length;",
      "const nome = req.nome || String(buone[0].cliente || '');",
      "const lista = buone.slice(0, 60).map((r) => '- ' + quando(r.data_ora) + ', ' + (r.tipo || 'contenuto')).join('\\n') + (n > 60 ? '\\n- e altri ' + (n - 60) : '');",
      "const fuori = (passate.length ? '\\n\\nNon sono nel tasto ' + passate.length + (passate.length === 1 ? ' contenuto con l\\'ora già passata.' : ' contenuti con l\\'ora già passata.') : '')",
      "  + (doppie.length ? '\\n\\nNon sono nel tasto ' + doppie.length + ' righe che compaiono due volte nel Calendario: vanno sistemate a mano.' : '');",
      "const testo = nome + ': ' + n + (n === 1 ? ' contenuto ancora da approvare.' : ' contenuti ancora da approvare.') + '\\n\\n' + lista + fuori",
      "  + '\\n\\nSe li hai guardati e vanno bene tutti, tocca il tasto qui sotto. Puoi anche approvarli uno per uno.';",
      "return [{ json: { manda: true, quanti: n, lotto: req.lotto, testo, tasto: n === 1 ? 'Approva questo' : 'Approva tutti e ' + n } }];"]),
    se('p23', 'C\'è da approvare?', [1100, -150], '={{ $json.manda }}'),
    { id: 'p24', name: 'Manda il riepilogo', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [1320, -250], credentials: { telegramApi: TELEGRAM }, ...RIPROVA,
      parameters: { resource: 'message', operation: 'sendMessage', chatId: chat, text: '={{ $json.testo }}', replyMarkup: 'inlineKeyboard',
        inlineKeyboard: tasti([[['={{ $json.tasto }}', "={{ 'tutti:' + $json.lotto }}"]]]),
        additionalFields: { appendAttribution: false } } },
  ];
  return { name: 'AD · Proponi nel Calendario', nodes: nodi, settings: impostazioni,
    connections: collega([['Richiesta', 'Controlla la proposta'], ['Controlla la proposta', 'È il riepilogo?'],
      ['È il riepilogo?', 'Leggi il gruppo', 0], ['Leggi il gruppo', 'Prepara il riepilogo'], ['Prepara il riepilogo', 'C\'è da approvare?'], ['C\'è da approvare?', 'Manda il riepilogo', 0],
      ['È il riepilogo?', 'Scrivi la riga nel Calendario', 1], ['Scrivi la riga nel Calendario', 'Scarica l\'anteprima'],
      ['Scarica l\'anteprima', 'È un video?'], ['È un video?', 'Manda il video', 0], ['È un video?', 'Manda la foto', 1], ['Manda il video', 'Chiedi Approva o Rifiuta'], ['Manda la foto', 'Chiedi Approva o Rifiuta'],
      ['Chiedi Approva o Rifiuta', 'Ha un gruppo?'], ['Ha un gruppo?', 'Segna il gruppo', 0]]) };
}

// ───────────────────────────────────────────── tasti
function flussoTasti(foglio, chat) {
  controllaFoglioChat(foglio, chat);
  const D = "$('Una risposta sola').first().json";
  const nodi = [
    // Solo callback_query: i messaggi scritti al bot non svegliano questo flusso.
    { id: 't1', name: 'Tocco su Telegram', type: 'n8n-nodes-base.telegramTrigger', typeVersion: 1.5, position: [0, 0], webhookId: 'b7f3c1de-4d57-4a8e-9c1e-ad1e66e00004', credentials: { telegramApi: TELEGRAM },
      parameters: { updates: ['callback_query'], additionalFields: {} } },
    codice('t2', 'Leggi il tocco', [220, 0], [
      `const CHAT = '${chat}';`,
      "const cq = ($input.first().json || {}).callback_query || {};",
      "const msg = cq.message || {};",
      "const base = { query_id: String(cq.id || ''), chat_id: String((msg.chat && msg.chat.id) || ''), message_id: String(msg.message_id || '') };",
      "// Conta solo chi approva davvero: la chat di Nicola. Un tocco da chiunque altro non tocca il Calendario.",
      "if (String((cq.from && cq.from.id) || '') !== CHAT) return [{ json: { ...base, azione: 'ignora', motivo: 'Questo tasto non è per te.' } }];",
      "const dato = String(cq.data || '');",
      "let m = /^(ok|no):(.{1,54}):([0-9a-z]{6})$/.exec(dato);",
      "if (m) return [{ json: { ...base, azione: m[1] === 'ok' ? 'approva' : 'rifiuta', id: m[2], versione: m[3] } }];",
      `m = new RegExp('^tutti:(${LOTTO.slice(1, -1)})$').exec(dato);`,
      "if (m) return [{ json: { ...base, azione: 'tutti', lotto: m[1] } }];",
      "return [{ json: { ...base, azione: 'ignora', motivo: 'Tasto non riconosciuto.' } }];"]),
    // «Approva tutti» aspetta 5 secondi prima di leggere il foglio: un «Rifiuta» toccato appena prima ha il tempo di
    // finire di scrivere, e non viene scavalcato (collaudo del 27/11, D2).
    se('t12', 'È «Approva tutti»?', [440, 0], "={{ $json.azione === 'tutti' }}"),
    { id: 't13', name: 'Aspetta i tocchi in corso', type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: [660, -100], webhookId: 'b7f3c1de-4d57-4a8e-9c1e-ad1e66e00005',
      parameters: { resume: 'timeInterval', amount: 5, unit: 'seconds' } },
    leggiCalendario(foglio, 't3', 'Leggi il Calendario', [880, 0]),
    codice('t4', 'Decidi', [1100, 0], [
      ...QUANDO,
      ...FIRMA,
      ...GRUPPO,
      "const t = $('Leggi il tocco').first().json;",
      "const tutte = $input.all().map((i) => i.json || {}).filter((r) => String(r.id || '').trim());",
      "const ora = ADESSO;",
      "const risposta = (righe, avviso, testo) => [{ json: { ...t, righe, avviso: avviso.slice(0, 200), testo: testo ? testo.slice(0, 4000) : '' } }];",
      "if (t.azione === 'ignora') return risposta([], t.motivo, '');",
      "if (t.azione === 'tutti') {",
      "  const { buone, passate, doppie } = scegliGruppo(tutte, t.lotto, ora);",
      "  const fuori = (passate.length ? '\\n\\nNon approvati perché l\\'ora è già passata: ' + passate.length + '.' : '') + (doppie.length ? '\\n\\nNon toccati perché compaiono due volte nel Calendario: ' + doppie.length + '. Vanno sistemati a mano.' : '');",
      "  if (!buone.length) return risposta([], 'Niente da approvare in questo gruppo.', 'Questo gruppo non ha più contenuti da approvare: quelli decisi uno per uno restano come li hai lasciati.' + fuori);",
      "  const righe = buone.map((r) => ({ id: String(r.id).trim(), stato: 'approvato', note: String(r.note || '') + ' | approvato su Telegram (tutti) ' + ora }));",
      "  const lista = buone.slice(0, 60).map((r) => '- ' + quando(r.data_ora) + ', ' + (r.tipo || 'contenuto')).join('\\n') + (buone.length > 60 ? '\\n- e altri ' + (buone.length - 60) : '');",
      "  return risposta(righe, 'Approvati: ' + buone.length, 'Approvati ' + buone.length + (buone.length === 1 ? ' contenuto' : ' contenuti') + '. Escono all\\'ora scritta:\\n\\n' + lista + fuori);",
      "}",
      "const stesse = tutte.filter((x) => String(x.id).trim() === t.id);",
      "if (!stesse.length) return risposta([], 'Non lo trovo più nel Calendario.', 'Non trovo più questo contenuto nel Calendario: non ho toccato niente.');",
      "if (stesse.length > 1) return risposta([], 'Questo contenuto compare due volte nel Calendario.', 'Questo contenuto compare ' + stesse.length + ' volte nel Calendario: non l\\'ho toccato. Le righe doppie vanno sistemate a mano.');",
      "const r = stesse[0];",
      "// Si tocca la riga solo se è ancora da approvare: se qualcuno l'ha già cambiata nel foglio, vince il foglio.",
      "if (r.stato !== 'da_approvare') {",
      "  const gia = { approvato: 'Già approvato: esce ' + quando(r.data_ora) + '.', bozza: 'Già rifiutato: è tornato in bozza e non esce.', pubblicato: 'Già pubblicato.' }[r.stato]",
      "    || ('È in stato «' + (r.stato || 'vuoto') + '»: non l\\'ho toccato.');",
      "  return risposta([], 'Era già deciso.', gia);",
      "}",
      "if (firma(r) !== t.versione) return risposta([], 'Tasto di una versione vecchia.', 'Questo tasto è di una versione vecchia: il contenuto è stato riproposto dopo. Usa i tasti sotto l\\'anteprima più recente.');",
      "const note = String(r.note || '');",
      "if (t.azione === 'rifiuta') return risposta([{ id: t.id, stato: 'bozza', note: note + ' | rifiutato su Telegram ' + ora }], 'Rifiutato', 'Rifiutato: torna in bozza e non esce.');",
      "// Regola della procedura: chi non viene approvato prima della sua ora non esce. Approvarlo dopo lo farebbe uscire fuori orario.",
      "if (!(String(r.data_ora || '') > ora)) return risposta([], 'L\\'ora è già passata.', 'La sua ora (' + quando(r.data_ora) + ') è già passata: non l\\'ho approvato, così non esce in ritardo. Se vuoi farlo uscire, chiedi di spostarlo a un\\'altra ora.');",
      "return risposta([{ id: t.id, stato: 'approvato', note: note + ' | approvato su Telegram ' + ora }], 'Approvato', 'Approvato: esce ' + quando(r.data_ora) + '.');"]),
    se('t5', 'C\'è da segnare?', [1320, 0], '={{ $json.righe.length > 0 }}'),
    codice('t6', 'Una riga per voce', [1540, -100], ["return $('Decidi').first().json.righe.map((r) => ({ json: r }));"]),
    { ...aggiornaRiga(foglio, 't7', 'Segna nel Calendario', [1760, -100], { id: '={{ $json.id }}', stato: '={{ $json.stato }}', note: '={{ $json.note }}' }), retryOnFail: true, maxTries: 3, waitBetweenTries: 2000 },
    codice('t8', 'Una risposta sola', [1980, 0], ["return [{ json: $('Decidi').first().json }];"]),
    // Toglie la rotellina dal tasto e mostra l'avviso in alto. Se il tocco è troppo vecchio Telegram dice di no: si va avanti.
    { id: 't9', name: 'Rispondi al tocco', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [2200, 0], credentials: { telegramApi: TELEGRAM }, onError: 'continueRegularOutput',
      parameters: { resource: 'callback', operation: 'answerQuery', queryId: `={{ ${D}.query_id }}`, additionalFields: { text: `={{ ${D}.avviso }}` } } },
    se('t10', 'Va cambiato il messaggio?', [2420, 0], `={{ !!${D}.testo }}`),
    // La domanda diventa la riga di stato. Senza replyMarkup Telegram toglie i tasti.
    { id: 't11', name: 'Cambia il messaggio', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [2640, -100], credentials: { telegramApi: TELEGRAM }, onError: 'continueRegularOutput',
      parameters: { resource: 'message', operation: 'editMessageText', messageType: 'message', chatId: `={{ ${D}.chat_id }}`, messageId: `={{ ${D}.message_id }}`, text: `={{ ${D}.testo }}`, replyMarkup: 'none', additionalFields: {} } },
  ];
  return { name: 'AD · Tasti su Telegram', nodes: nodi, settings: { ...impostazioni, errorWorkflow: arg('--errori', 'D3Ugm3sc201nteFX'), timezone: 'Europe/Rome' },
    connections: collega([['Tocco su Telegram', 'Leggi il tocco'], ['Leggi il tocco', 'È «Approva tutti»?'],
      ['È «Approva tutti»?', 'Aspetta i tocchi in corso', 0], ['Aspetta i tocchi in corso', 'Leggi il Calendario'], ['È «Approva tutti»?', 'Leggi il Calendario', 1],
      ['Leggi il Calendario', 'Decidi'], ['Decidi', 'C\'è da segnare?'],
      ['C\'è da segnare?', 'Una riga per voce', 0], ['Una riga per voce', 'Segna nel Calendario'], ['Segna nel Calendario', 'Una risposta sola'], ['C\'è da segnare?', 'Una risposta sola', 1],
      ['Una risposta sola', 'Rispondi al tocco'], ['Rispondi al tocco', 'Va cambiato il messaggio?'], ['Va cambiato il messaggio?', 'Cambia il messaggio', 0]]) };
}

const quale = process.argv[2];
const flusso = quale === 'carica' ? flussoCarica()
  : quale === 'proponi' ? flussoProponi(arg('--foglio'), arg('--chat'))
  : quale === 'tasti' ? flussoTasti(arg('--foglio'), arg('--chat')) : null;
if (!flusso) { console.error('Uso: node consegna.mjs carica|proponi|tasti --json [--foglio ID --chat ID]'); process.exit(1); }
if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(flusso));
else console.log(flusso.name, '·', flusso.nodes.length, 'nodi. Aggiungi --json per stamparlo.');
