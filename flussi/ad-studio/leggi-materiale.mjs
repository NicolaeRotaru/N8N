// Costruisce il flusso n8n «AD · Leggi materiale (anteprime)».
// Serve all'AD (piano Max) per VEDERE il materiale di un cliente su Drive senza chiamare nessuna IA:
// elenca le cartelle e restituisce le anteprime (miniature Drive) in base64 dentro l'esecuzione.
// Resta SPENTO: si avvia solo a mano (MCP execute_workflow, ingresso webhook). Sola lettura su Drive.
// Uso (foglio: {id, scheda, cliente} per leggere le righe di un cliente): node leggi-materiale.mjs [--manda]   (con --manda lo crea su n8n via API; la chiave la mette il proxy)
const N8N = process.env.N8N_URL || 'https://n8n-shdy.sliplane.app';
const DRIVE = { id: process.argv.includes('--drive') ? process.argv[process.argv.indexOf('--drive') + 1] : 'FCSps1wTGjDI2YUg', name: 'Google Drive - Agenzia' };

const campiElenco = 'files(id,name,mimeType,size,md5Checksum,createdTime,modifiedTime,description,appProperties,thumbnailLink,imageMediaMetadata(width,height,time),videoMediaMetadata(width,height,durationMillis))';
const campiFile = 'id,name,mimeType,size,thumbnailLink,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis)';

const nodi = [
  { id: 'a1', name: 'Richiesta', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: 'b7f3c1de-4d57-4a8e-9c1e-ad1e66e00001',
    parameters: { httpMethod: 'POST', path: 'ad-leggi-materiale', options: {} } },
  { id: 'a2', name: 'Cosa leggere', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0],
    parameters: { jsCode: [
      "const b = $input.first().json.body || $input.first().json || {};",
      "const lato = Math.min(Math.max(Number(b.lato) || 1600, 200), 3200);",
      "const out = [];",
      "for (const c of (b.cartelle || [])) out.push({ json: { tipo: 'elenco', id: String(c) } });",
      "for (const f of (b.file || [])) out.push({ json: { tipo: 'anteprima', id: String(f), lato } });",
      "for (const f of (b.interi || [])) out.push({ json: { tipo: 'anteprima', id: String(f), intero: true } });",
      "if (b.foglio && b.foglio.id) out.push({ json: { tipo: 'foglio', id: String(b.foglio.id), scheda: String(b.foglio.scheda || 'Calendario'), filtro: b.foglio.cliente ? String(b.foglio.cliente) : '' } });",
      "for (const u of (b.url || [])) { if (!/^https:\\/\\//.test(String(u))) throw new Error('Solo indirizzi https'); out.push({ json: { tipo: 'url', url: String(u) } }); }",
      "if (!out.length) throw new Error('Serve «cartelle», «file», «interi» o «url» nel corpo della richiesta');",
      "if (out.length > 60) throw new Error('Al massimo 60 voci per volta');",
      "return out;" ].join('\n') } },
  { id: 'a3', name: 'Chiedi a Drive', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.5, position: [440, 0],
    credentials: { googleDriveOAuth2Api: DRIVE },
    parameters: { method: 'GET', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
      url: "={{ $json.tipo === 'elenco' ? 'https://www.googleapis.com/drive/v3/files?pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=name&q=' + encodeURIComponent(\"'\" + $json.id + \"' in parents and trashed = false\") + '&fields=' + encodeURIComponent('" + campiElenco + "') : 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent($json.id) + '?supportsAllDrives=true&fields=' + encodeURIComponent('" + campiFile + "') }}",
      options: { timeout: 60000, response: { response: { responseFormat: 'json' } } } } },
  { id: 'a4', name: 'Metti insieme', type: 'n8n-nodes-base.code', typeVersion: 2, position: [660, 0],
    parameters: { jsCode: [
      "const richieste = $('È un indirizzo web?').all(1, 0);",
      "return $input.all().map((it, i) => {",
      "  const r = richieste[i].json;",
      "  if (r.tipo === 'elenco') return { json: { tipo: 'elenco', cartella: r.id, files: it.json.files || [] } };",
      "  const link = String(it.json.thumbnailLink || '');",
      "  return { json: { tipo: 'anteprima', id: r.id, name: it.json.name, mimeType: it.json.mimeType, size: it.json.size,",
      "    misure: it.json.imageMediaMetadata || it.json.videoMediaMetadata || null,",
      "    miniatura: r.intero ? 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(r.id) + '?alt=media&supportsAllDrives=true' : (link ? link.replace(/=s\\d+$/, '') + '=s' + r.lato : '') } };",
      "});" ].join('\n') } },
  { id: 'a5', name: 'È un\'anteprima?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [880, 0],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, combinator: 'and',
      conditions: [ { id: 'c1', leftValue: "={{ $json.tipo === 'anteprima' && !!$json.miniatura }}", rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } } ] }, options: {} } },
  { id: 'a6', name: 'Scarica la miniatura', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.5, position: [1100, -100],
    credentials: { googleDriveOAuth2Api: DRIVE },
    parameters: { method: 'GET', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api', url: '={{ $json.miniatura }}',
      options: { timeout: 60000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } } } },
  { id: 'a7', name: 'In base64', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1320, -100],
    parameters: { jsCode: [
      "const meta = $('È un\\'anteprima?').all(0, 0);",
      "const out = [];",
      "const items = $input.all();",
      "for (let i = 0; i < items.length; i++) {",
      "  const buf = await this.helpers.getBinaryDataBuffer(i, 'data');",
      "  const m = (meta[i] || {}).json || {};",
      "  out.push({ json: { tipo: 'anteprima', id: m.id, name: m.name, mimeType: m.mimeType, misure: m.misure, byte: buf.length, b64: buf.toString('base64') } });",
      "}",
      "return out;" ].join('\n') } },
];
nodi.push(
  { id: 'a8', name: 'È un indirizzo web?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [330, 200],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, combinator: 'and',
      conditions: [ { id: 'c2', leftValue: "={{ $json.tipo === 'url' }}", rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } } ] }, options: {} } },
  { id: 'a9', name: 'Scarica dall\'indirizzo', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.5, position: [550, 300],
    parameters: { method: 'GET', url: '={{ $json.url }}', options: { timeout: 60000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } } } },
  { id: 'a10', name: 'Indirizzo in base64', type: 'n8n-nodes-base.code', typeVersion: 2, position: [770, 300],
    parameters: { jsCode: [
      "const meta = $('È un indirizzo web?').all(0, 0);",
      "const out = [];",
      "const items = $input.all();",
      "for (let i = 0; i < items.length; i++) {",
      "  const buf = await this.helpers.getBinaryDataBuffer(i, 'data');",
      "  const u = ((meta[i] || {}).json || {}).url || '';",
      "  out.push({ json: { tipo: 'url', url: u, name: u.split('/').pop().split('?')[0] || 'file', mimeType: (items[i].binary.data || {}).mimeType, byte: buf.length, b64: buf.toString('base64') } });",
      "}",
      "return out;" ].join('\n') } },
);
const SHEETS = { id: 'N0ckGuoYFN0qbSEt', name: 'Google Sheets - Agenzia' };
nodi.push(
  { id: 'a11', name: 'È un foglio?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [330, -200],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, combinator: 'and',
      conditions: [ { id: 'c3', leftValue: "={{ $json.tipo === 'foglio' }}", rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } } ] }, options: {} } },
  { id: 'a12', name: 'Leggi il foglio', type: 'n8n-nodes-base.googleSheets', typeVersion: 4.7, position: [550, -300], credentials: { googleSheetsOAuth2Api: SHEETS },
    parameters: { authentication: 'oAuth2', resource: 'sheet', operation: 'read', documentId: { __rl: true, value: '={{ $json.id }}', mode: 'id' }, sheetName: { __rl: true, value: '={{ $json.scheda }}', mode: 'name' }, options: {} } },
  { id: 'a13', name: 'Righe del foglio', type: 'n8n-nodes-base.code', typeVersion: 2, position: [770, -300],
    parameters: { jsCode: [
      "const f = $('È un foglio?').first().json;",
      "const righe = $input.all().map((x) => x.json).filter((r) => !f.filtro || r.cliente === f.filtro);",
      "return [{ json: { tipo: 'foglio', scheda: f.scheda, righe } }];" ].join('\n') } },
);
const connessioni = {
  'Richiesta': { main: [[{ node: 'Cosa leggere', type: 'main', index: 0 }]] },
  'Cosa leggere': { main: [[{ node: 'È un foglio?', type: 'main', index: 0 }]] },
  'È un foglio?': { main: [[{ node: 'Leggi il foglio', type: 'main', index: 0 }], [{ node: 'È un indirizzo web?', type: 'main', index: 0 }]] },
  'Leggi il foglio': { main: [[{ node: 'Righe del foglio', type: 'main', index: 0 }]] },
  'È un indirizzo web?': { main: [[{ node: 'Scarica dall\'indirizzo', type: 'main', index: 0 }], [{ node: 'Chiedi a Drive', type: 'main', index: 0 }]] },
  'Scarica dall\'indirizzo': { main: [[{ node: 'Indirizzo in base64', type: 'main', index: 0 }]] },
  'Chiedi a Drive': { main: [[{ node: 'Metti insieme', type: 'main', index: 0 }]] },
  'Metti insieme': { main: [[{ node: 'È un\'anteprima?', type: 'main', index: 0 }]] },
  'È un\'anteprima?': { main: [[{ node: 'Scarica la miniatura', type: 'main', index: 0 }], []] },
  'Scarica la miniatura': { main: [[{ node: 'In base64', type: 'main', index: 0 }]] },
};
const flusso = { name: 'AD · Leggi materiale (anteprime)', nodes: nodi, connections: connessioni,
  settings: { executionOrder: 'v1', availableInMCP: true, saveManualExecutions: true, saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' } };

if (process.argv.includes('--manda')) {
  const id = process.argv.includes('--id') ? process.argv[process.argv.indexOf('--id') + 1] : '';
  const r = await fetch(N8N + '/api/v1/workflows' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', headers: { 'content-type': 'application/json', 'X-N8N-API-KEY': 'dal-proxy' }, body: JSON.stringify(flusso) });
  const j = await r.json(); console.log(r.status, j.id || j.message, j.name || '');
} else if (process.argv.includes("--json")) process.stdout.write(JSON.stringify(flusso));
else console.log(JSON.stringify(flusso).length, "byte; --json stampa il flusso, --manda lo crea su n8n");
