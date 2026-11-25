// Costruisce i due flussi n8n con cui l'AD consegna i contenuti che ha prodotto (piano Max, nessuna API di IA):
//
//   carica   «AD · Carica su Drive»          — mette su Drive i file preparati dall'AD. I file arrivano DENTRO il nodo
//                                              «Prepara» (base64), scritto via API prima di ogni corsa e svuotato dopo:
//                                              nessun indirizzo pubblico, nessuna chiave nuova.
//   proponi  «AD · Proponi nel Calendario»   — scrive la riga nel Calendario in stato da_approvare (il flusso 01 la
//                                              ignora), manda l'anteprima su Telegram e aspetta Approva / Rifiuta.
//                                              Approva → approvato (il 01 la pubblica all'ora scritta). Rifiuta → bozza.
//
// Restano SPENTI: si avviano solo a mano (MCP execute_workflow, ingresso webhook).
// Il repository è pubblico: ID del foglio e della chat Telegram NON stanno qui, si passano a riga di comando
// (lo script ad-studio.sh li legge dal Config del flusso 04).
//
// Uso: node consegna.mjs carica --json
//      node consegna.mjs proponi --json --foglio <SHEET_ID> --chat <TELEGRAM_CHAT_ID>
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

// ───────────────────────────────────────────── proponi
function flussoProponi(foglio, chat) {
  if (!foglio || !chat) throw new Error('proponi vuole --foglio e --chat');
  const documento = { __rl: true, value: foglio, mode: 'id' };
  const scheda = { __rl: true, value: 'Calendario', mode: 'name' };
  const aggiorna = (id, name, pos, valori) => ({ id, name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.7, position: pos, credentials: { googleSheetsOAuth2Api: SHEETS },
    parameters: { authentication: 'oAuth2', resource: 'sheet', operation: id === 'p3' ? 'appendOrUpdate' : 'update', documentId: documento, sheetName: scheda,
      columns: { mappingMode: 'defineBelow', value: valori, matchingColumns: ['id'], schema }, options: {} } });
  // «brief» non si scrive: sulle righe-idea del piano del mese resta quello che c'era.
  const campi = ['id', 'cliente', 'tipo', 'piattaforme', 'data_ora', 'didascalia', 'primo_commento', 'media', 'copertina', 'stato', 'errore', 'note'];
  const nodi = [
    webhook('p1', 'ad-proponi-calendario', 'b7f3c1de-4d57-4a8e-9c1e-ad1e66e00003'),
    codice('p2', 'Controlla la proposta', [220, 0], [
      "const b = $input.first().json.body || {};",
      "const r = Object.assign({}, b.riga || {});",
      "const testo = (v) => (v === null || v === undefined ? '' : String(v)).trim();",
      "for (const k of ['id', 'cliente', 'tipo', 'data_ora', 'media']) if (!testo(r[k])) throw new Error('Manca «' + k + '» nella riga');",
      "if (!['post', 'carosello', 'reel', 'storia'].includes(r.tipo)) throw new Error('tipo non valido: ' + r.tipo);",
      "if (!/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$/.test(r.data_ora)) throw new Error('data_ora deve essere AAAA-MM-GG HH:MM');",
      "if (r.tipo !== 'storia' && !testo(r.didascalia)) throw new Error('Manca la didascalia');",
      "if (r.tipo === 'reel' && !testo(r.copertina)) throw new Error('Il reel vuole la copertina');",
      "// La riga nasce SEMPRE da approvare: il flusso 01 la ignora finché il team non preme Approva.",
      "r.stato = 'da_approvare'; r.errore = '';",
      "r.piattaforme = testo(r.piattaforme) || 'ig+fb';",
      "const a = b.anteprima || {};",
      "if (!a.file_id) throw new Error('Manca anteprima.file_id');",
      "return [{ json: { riga: r, anteprima: { file_id: String(a.file_id), video: a.tipo === 'video' }, didascalia_telegram: testo(b.didascalia_telegram).slice(0, 1000), messaggio: testo(b.messaggio).slice(0, 3900) || ('Approvi la riga ' + r.id + '?') } }];"]),
    aggiorna('p3', 'Scrivi la riga nel Calendario', [440, 0], Object.fromEntries(campi.map((k) => [k, `={{ $json.riga.${k} ?? '' }}`]))),
    { id: 'p4', name: 'Scarica l\'anteprima', type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position: [660, 0], credentials: { googleDriveOAuth2Api: DRIVE },
      parameters: { authentication: 'oAuth2', resource: 'file', operation: 'download', fileId: { __rl: true, value: "={{ $('Controlla la proposta').first().json.anteprima.file_id }}", mode: 'id' }, options: { binaryPropertyName: 'data' } } },
    se('p5', 'È un video?', [880, 0], "={{ $('Controlla la proposta').first().json.anteprima.video }}"),
    { id: 'p6', name: 'Manda il video', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [1100, -100], credentials: { telegramApi: TELEGRAM },
      parameters: { resource: 'message', operation: 'sendVideo', chatId: chat, binaryData: true, binaryPropertyName: 'data', additionalFields: { caption: "={{ $('Controlla la proposta').first().json.didascalia_telegram }}" } } },
    { id: 'p7', name: 'Manda la foto', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [1100, 100], credentials: { telegramApi: TELEGRAM },
      parameters: { resource: 'message', operation: 'sendPhoto', chatId: chat, binaryData: true, binaryPropertyName: 'data', additionalFields: { caption: "={{ $('Controlla la proposta').first().json.didascalia_telegram }}" } } },
    { id: 'p8', name: 'Chiedi Approva o Rifiuta', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [1320, 0], credentials: { telegramApi: TELEGRAM },
      parameters: { resource: 'message', operation: 'sendAndWait', chatId: chat, message: "={{ $('Controlla la proposta').first().json.messaggio }}", responseType: 'approval',
        approvalOptions: { values: { approvalType: 'double', approveLabel: '✅ Approva', disapproveLabel: '❌ Rifiuta' } },
        options: { limitWaitTime: { values: { limitType: 'afterTimeInterval', resumeAmount: 96, resumeUnit: 'hours' } }, appendAttribution: false } } },
    { id: 'p9', name: 'Rileggi la riga', type: 'n8n-nodes-base.googleSheets', typeVersion: 4.7, position: [1540, 0], credentials: { googleSheetsOAuth2Api: SHEETS }, alwaysOutputData: true,
      parameters: { authentication: 'oAuth2', resource: 'sheet', operation: 'read', documentId: documento, sheetName: scheda,
        filtersUI: { values: [{ lookupColumn: 'id', lookupValue: "={{ $('Controlla la proposta').first().json.riga.id }}" }] }, combineFilters: 'AND', options: { returnFirstMatch: true } } },
    codice('p10', 'Decidi', [1760, 0], [
      "const scelta = $('Chiedi Approva o Rifiuta').first().json || {};",
      "const approvato = (scelta.data && scelta.data.approved) ?? scelta.approved;",
      "const riga = $input.first().json || {};",
      "const id = $('Controlla la proposta').first().json.riga.id;",
      "const ora = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 16);",
      "const note = String(riga.note || '');",
      "// Si tocca la riga solo se è ancora da approvare: se qualcuno l'ha già cambiata nel foglio, vince il foglio.",
      "if (riga.stato !== 'da_approvare') return [{ json: { id, cambia: false, messaggio: 'La riga ' + id + ' non era più da approvare (' + (riga.stato || 'sparita') + '): non l\\'ho toccata.' } }];",
      "if (approvato === true) return [{ json: { id, cambia: true, stato: 'approvato', note: note + ' | approvato su Telegram ' + ora, messaggio: '✅ ' + id + ' approvata: esce il ' + riga.data_ora + '.' } }];",
      "if (approvato === false) return [{ json: { id, cambia: true, stato: 'bozza', note: note + ' | rifiutato su Telegram ' + ora, messaggio: '❌ ' + id + ' rifiutata: torna in bozza.' } }];",
      "return [{ json: { id, cambia: false, messaggio: '⏳ ' + id + ': nessuna risposta entro 96 ore, resta da approvare (si approva anche dal foglio).' } }];"]),
    se('p11', 'Va cambiata?', [1980, 0], '={{ $json.cambia }}'),
    aggiorna('p12', 'Segna la decisione', [2200, -100], { id: '={{ $json.id }}', stato: '={{ $json.stato }}', note: '={{ $json.note }}' }),
    { id: 'p13', name: 'Conferma su Telegram', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [2420, 0], credentials: { telegramApi: TELEGRAM },
      parameters: { resource: 'message', operation: 'sendMessage', chatId: chat, text: "={{ $('Decidi').first().json.messaggio }}", additionalFields: { appendAttribution: false } } },
  ];
  return { name: 'AD · Proponi nel Calendario', nodes: nodi, settings: impostazioni,
    connections: collega([['Richiesta', 'Controlla la proposta'], ['Controlla la proposta', 'Scrivi la riga nel Calendario'], ['Scrivi la riga nel Calendario', 'Scarica l\'anteprima'],
      ['Scarica l\'anteprima', 'È un video?'], ['È un video?', 'Manda il video', 0], ['È un video?', 'Manda la foto', 1], ['Manda il video', 'Chiedi Approva o Rifiuta'], ['Manda la foto', 'Chiedi Approva o Rifiuta'],
      ['Chiedi Approva o Rifiuta', 'Rileggi la riga'], ['Rileggi la riga', 'Decidi'], ['Decidi', 'Va cambiata?'], ['Va cambiata?', 'Segna la decisione', 0], ['Va cambiata?', 'Conferma su Telegram', 1], ['Segna la decisione', 'Conferma su Telegram']]) };
}

const quale = process.argv[2];
const flusso = quale === 'carica' ? flussoCarica() : quale === 'proponi' ? flussoProponi(arg('--foglio'), arg('--chat')) : null;
if (!flusso) { console.error('Uso: node consegna.mjs carica|proponi --json [--foglio ID --chat ID]'); process.exit(1); }
if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(flusso));
else console.log(flusso.name, '·', flusso.nodes.length, 'nodi. Aggiungi --json per stamparlo.');
