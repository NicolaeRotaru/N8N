// AD · Calendario e Meta (a mano) — sorgente SDK del flusso n8n (creato il 26/11/2026 via MCP).
//
// A cosa serve: lo strumento con cui l'AD (sessione Claude sul piano Max) legge e corregge le righe del
// Calendario «Social Clienti» e fa chiamate puntuali all'API di Meta (leggere i post di un account,
// cancellarne uno). Spento, senza indirizzo pubblico: si avvia solo con lo strumento MCP execute_workflow.
// Nessuna IA a pagamento.
//
// Ingresso (corpo JSON del webhook):
//   { modo: 'leggi',    cliente: 'tropico-latino', ids?: [...], campi?: [...] }
//   { modo: 'aggiorna', righe: [{ id, ...colonne }] }            // per id: aggiorna, o aggiunge se manca
//   { modo: 'meta',     metodo: 'GET'|'DELETE'|'POST', percorso: '<id>/<edge>', query?: {}, pagina?: '<page id>' }
//     con «pagina» la chiamata usa il token della pagina (serve per cancellare i post Facebook).
//
// Attenzione: con «pagina» il token della pagina finisce nei dati dell'esecuzione salvata in n8n.
// Questo repository è pubblico: l'ID del foglio NON va scritto qui. Prima di caricare il flusso
// sostituisci <SHEET_ID> con il valore SHEET_ID del Config del flusso 01.

import { workflow, node, trigger, switchCase, expr } from '@n8n/workflow-sdk';

const SHEET = '<SHEET_ID>';
const GS_CRED = { googleSheetsOAuth2Api: { name: 'Google Sheets - Agenzia' } };
const META_CRED = { httpHeaderAuth: { name: 'Meta - System User' } };

const richiesta = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2,
  config: { name: 'Richiesta', parameters: { httpMethod: 'POST', path: 'ad-calendario-a-mano', options: {} } }
});

const controlla = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Controlla la richiesta',
    parameters: {
      jsCode: `const b = $input.first().json.body || {};
const modo = String(b.modo || '');
if (!['leggi', 'aggiorna', 'meta'].includes(modo)) throw new Error('modo deve essere leggi, aggiorna o meta');
if (modo === 'leggi') return [{ json: { modo, cliente: String(b.cliente || '').trim() } }];
if (modo === 'aggiorna') {
  const righe = Array.isArray(b.righe) ? b.righe : [];
  if (!righe.length) throw new Error('Mancano le righe da aggiornare');
  const vietate = ['row_number', 'modo'];
  return righe.map((r) => {
    if (!r || !String(r.id || '').trim()) throw new Error('Ogni riga vuole il suo id');
    const out = {};
    for (const [k, v] of Object.entries(r)) if (!vietate.includes(k)) out[k] = v === null || v === undefined ? '' : String(v);
    return { json: { modo, riga: out } };
  });
}
const metodo = String(b.metodo || 'GET').toUpperCase();
if (!['GET', 'DELETE', 'POST'].includes(metodo)) throw new Error('metodo non ammesso');
const percorso = String(b.percorso || '').replace(/^\\/+/, '');
if (!/^[A-Za-z0-9_\\/]+$/.test(percorso)) throw new Error('percorso non valido');
return [{ json: { modo, metodo, percorso, query: b.query || {}, pagina: String(b.pagina || '') } }];`,
    },
  },
});

const smista = switchCase({
  version: 3.2,
  config: {
    name: 'Smista',
    parameters: {
      rules: { values: [
        { outputKey: 'leggi', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.modo }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'leggi' }], combinator: 'and' } },
        { outputKey: 'aggiorna', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.modo }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'aggiorna' }], combinator: 'and' } },
        { outputKey: 'meta', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.modo }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'meta' }], combinator: 'and' } }
      ] },
      options: {},
    },
  },
});

const leggi = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: { name: 'Leggi il Calendario', parameters: { authentication: 'oAuth2', resource: 'sheet', operation: 'read', documentId: { __rl: true, value: SHEET, mode: 'id' }, sheetName: { __rl: true, value: 'Calendario', mode: 'name' }, options: {} }, credentials: GS_CRED },
});

const filtra = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Tieni il cliente',
    parameters: {
      jsCode: `const req = $('Controlla la richiesta').first().json;
const corpo = $('Richiesta').first().json.body || {};
const ids = Array.isArray(corpo.ids) ? corpo.ids.map(String) : [];
const campi = Array.isArray(corpo.campi) ? corpo.campi.map(String) : [];
let righe = $input.all().map((i) => i.json).filter((r) => !req.cliente || String(r.cliente || '').trim() === req.cliente);
if (ids.length) righe = righe.filter((r) => ids.includes(String(r.id || '').trim()));
if (campi.length) righe = righe.map((r) => Object.fromEntries(campi.map((c) => [c, r[c]])));
return [{ json: { quante: righe.length, righe } }];`,
    },
  },
});

const soloRiga = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Solo i campi della riga', parameters: { jsCode: 'return $input.all().map((i) => ({ json: i.json.riga }));' } },
});

const aggiorna = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Aggiorna le righe',
    parameters: {
      authentication: 'oAuth2', resource: 'sheet', operation: 'appendOrUpdate', documentId: { __rl: true, value: SHEET, mode: 'id' }, sheetName: { __rl: true, value: 'Calendario', mode: 'name' },
      columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: ['id'], schema: [] },
      options: {},
    },
    credentials: GS_CRED,
  },
});

const servePagina = switchCase({
  version: 3.2,
  config: {
    name: 'Serve il token della pagina?',
    parameters: {
      rules: { values: [
        { outputKey: 'pagina', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.pagina }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true } }], combinator: 'and' } },
        { outputKey: 'diretta', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.pagina }}'), operator: { type: 'string', operation: 'empty', singleValue: true } }], combinator: 'and' } },
      ] },
      options: {},
    },
  },
});

const tokenPagina = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Token della pagina',
    parameters: {
      url: expr('https://graph.facebook.com/v26.0/{{ $json.pagina }}'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendQuery: true,
      queryParameters: { parameters: [{ name: 'fields', value: 'access_token' }] },
      options: { timeout: 60000 },
    },
    credentials: META_CRED,
  },
});

const chiamaConPagina = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Chiama Meta come pagina',
    parameters: {
      method: expr("{{ $('Controlla la richiesta').first().json.metodo }}"),
      url: expr("https://graph.facebook.com/v26.0/{{ $('Controlla la richiesta').first().json.percorso }}"),
      sendQuery: true,
      specifyQuery: 'json',
      jsonQuery: expr("{{ JSON.stringify(Object.assign({}, $('Controlla la richiesta').first().json.query, { access_token: $json.access_token })) }}"),
      options: { timeout: 60000, response: { response: { neverError: true, fullResponse: true } } },
    },
  },
});

const chiamaDiretta = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Chiama Meta',
    parameters: {
      method: expr('{{ $json.metodo }}'),
      url: expr('https://graph.facebook.com/v26.0/{{ $json.percorso }}'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendQuery: true,
      specifyQuery: 'json',
      jsonQuery: expr('{{ JSON.stringify($json.query || {}) }}'),
      options: { timeout: 60000, response: { response: { neverError: true, fullResponse: true } } },
    },
    credentials: META_CRED,
  },
});

export default workflow('ad-calendario-a-mano', 'AD · Calendario e Meta (a mano)')
  .add(richiesta)
  .to(controlla)
  .to(smista
    .onCase(0, leggi.to(filtra))
    .onCase(1, soloRiga.to(aggiorna))
    .onCase(2, servePagina
      .onCase(0, tokenPagina.to(chiamaConPagina))
      .onCase(1, chiamaDiretta)));
