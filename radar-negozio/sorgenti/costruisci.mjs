// Costruisce il workflow n8n «09 - Radar negozio» a partire dai file in sorgenti/nodi/.
// Uso:  node sorgenti/costruisci.mjs        (scrive ../09-radar-negozio.json)
// Il JSON prodotto è quello da importare in n8n. Non modificarlo a mano: cambia i sorgenti e ricostruisci.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const USCITA = join(QUI, '..', '09-radar-negozio.json');

const COMUNE = { claude: readFileSync(join(QUI, 'comune', 'claude.js'), 'utf8').trim() };
function codice(file) {
  let js = readFileSync(join(QUI, 'nodi', file), 'utf8');
  js = js.replace(/^\/\/ @comune (\w+)\s*$/m, (_, nome) => {
    if (!COMUNE[nome]) throw new Error('blocco comune sconosciuto: ' + nome);
    return COMUNE[nome];
  });
  return js.trim() + '\n';
}

// Identificativi stabili: ricostruire non cambia gli id dei nodi.
function uuid(seme) {
  const h = createHash('sha256').update('radar-negozio:' + seme).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const CRED = {
  telegram: { telegramApi: { id: null, name: 'Telegram - Radar negozio' } },
  claude: { anthropicApi: { id: null, name: 'Anthropic - Claude' } },
  google: { httpHeaderAuth: { id: null, name: 'Google - Chiave API' } },
  fogli: { googleSheetsOAuth2Api: { id: null, name: 'Google Sheets' } },
};

const nodi = [];
function nodo(nome, tipo, versione, posizione, parametri, extra = {}) {
  nodi.push({ parameters: parametri, id: uuid(nome), name: nome, type: tipo, typeVersion: versione, position: posizione, ...extra });
}
const code = (nome, pos, file) => nodo(nome, 'n8n-nodes-base.code', 2, pos, { jsCode: codice(file) });

function se(nome, pos, sinistra, operatore, destra, opzioni = {}) {
  const condizione = { id: uuid(nome + ':cond'), leftValue: sinistra, operator: operatore };
  if (destra !== undefined) condizione.rightValue = destra;
  nodo(nome, 'n8n-nodes-base.if', 2.2, pos, {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: opzioni.loose ? 'loose' : 'strict', version: 2 },
      conditions: [condizione],
      combinator: 'and',
    },
    looseTypeValidation: !!opzioni.loose,
    options: {},
  });
}
const uguale = { type: 'string', operation: 'equals' };

function claude(nome, pos, campo, timeout) {
  nodo(
    nome,
    'n8n-nodes-base.httpRequest',
    4.2,
    pos,
    {
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'anthropicApi',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'anthropic-version', value: '2026-10-21' },
          { name: 'anthropic-beta', value: 'server-side-fallback-2026-07-01' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={{ JSON.stringify($json.${campo}) }}`,
      options: { timeout },
    },
    { credentials: CRED.claude, retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueRegularOutput' },
  );
}

function telegram(nome, pos, chat, testo, extra = {}) {
  nodo(
    nome,
    'n8n-nodes-base.telegram',
    1.2,
    pos,
    {
      chatId: chat,
      text: testo,
      additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true },
    },
    { credentials: CRED.telegram, ...extra },
  );
}

function nota(nome, pos, larghezza, altezza, colore, testo) {
  nodo(nome, 'n8n-nodes-base.stickyNote', 1, pos, { content: testo, height: altezza, width: larghezza, color: colore });
}

// ------------------------------------------------------------------ note
nota('Nota: come funziona', [-460, -120], 400, 560, 4,
  '## 📸 Radar negozio\n' +
  'Fai la foto a un negozio e mandala al bot Telegram dell\'agenzia.\n' +
  'In 2-3 minuti arriva la scheda: **Google, sito e social**, con un voto, cosa proporre e una frase per rompere il ghiaccio.\n\n' +
  '**Prima di attivarlo**\n' +
  '1. Nodo **Config**: `CHAT_AUTORIZZATE` (i codici chat di chi può usarlo; il bot ti dice il tuo) e `CITTA_PREDEFINITA`.\n' +
  '2. Credenziali: *Telegram - Radar negozio* (un bot dedicato), *Anthropic - Claude*, *Google - Chiave API* (Header Auth, nome `X-Goog-Api-Key`).\n' +
  '3. Premi **Publish**.\n\n' +
  'Guida completa: `radar-negozio/LEGGIMI.md` nel repository N8N.\n' +
  'Non modificare il codice dei nodi qui: si cambia in `radar-negozio/sorgenti/` e si ricostruisce.');
nota('Nota 1', [200, -120], 1980, 760, 7, '### 1 · La foto\nChi scrive, se c\'è una foto, cosa ci legge Claude (nome, tipo, contatti, adesivi).');
nota('Nota 2', [1800, -120], 640, 760, 5, '### 2 · Google\nCerca il negozio su Google Maps e dà un voto alla scheda con regole fisse.');
nota('Nota 3', [2460, -120], 820, 760, 6, '### 3 · Sito\nScarica la home e la misura con Google PageSpeed (da telefono).');
nota('Nota 4', [3360, -120], 1260, 760, 3, '### 4 · Social\nClaude cerca sul web Instagram, Facebook, TikTok e le altre piattaforme.');
nota('Nota 5', [4680, -120], 1720, 760, 2, '### 5 · La scheda\nClaude scrive la scheda; arrivano due messaggi.\nPer tenere lo storico nel foglio «Prospetti»: configura e **attiva** il nodo «Salva nel foglio Prospetti» (di serie è spento).');

// ------------------------------------------------------------------ 1 · la foto
// La foto NON si scarica nel trigger: lo fa «Scarica la foto», solo per le chat autorizzate e nella misura più grande.
nodo('Foto dal telefono', 'n8n-nodes-base.telegramTrigger', 1.2, [0, 300], {
  updates: ['message'],
  additionalFields: {},
}, { credentials: CRED.telegram, webhookId: '7d0b2f4e-5a8c-4e61-9a3b-2c1f0e8d6b47' });

nodo('Config', 'n8n-nodes-base.set', 3.4, [240, 300], {
  mode: 'manual',
  assignments: {
    assignments: [
      { id: uuid('cfg1'), name: 'CHAT_AUTORIZZATE', value: '', type: 'string' },
      { id: uuid('cfg2'), name: 'CITTA_PREDEFINITA', value: '', type: 'string' },
      { id: uuid('cfg3'), name: 'CLAUDE_MODELLO', value: 'claude-opus-5-5', type: 'string' },
      { id: uuid('cfg4'), name: 'CLAUDE_EFFORT', value: 'medium', type: 'string' },
    ],
  },
  includeOtherFields: true,
  include: 'all',
  options: {},
});

code('Controlla messaggio', [480, 300], 'controlla-messaggio.js');
se('Si analizza?', [720, 300], '={{ $json.azione || \'\' }}', uguale, 'analizza');
nodo('Scarica la foto', 'n8n-nodes-base.telegram', 1.2, [940, 200], {
  resource: 'file',
  operation: 'get',
  fileId: '={{ $json.file_id }}',
  download: true,
  additionalFields: {},
}, { credentials: CRED.telegram, retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, onError: 'continueRegularOutput' });
code('Prepara lettura foto', [1160, 200], 'prepara-lettura-foto.js');
se('Foto pronta?', [1380, 200], '={{ $json.azione || \'\' }}', uguale, 'analizza');
claude('Claude: leggi la foto', [1600, 120], 'richiesta', 180000);
code('Leggi risposta foto', [1820, 120], 'leggi-risposta-foto.js');
se('Foto letta?', [2040, 120], '={{ $json.azione || \'\' }}', uguale, 'analizza');
telegram('Rispondi', [1820, 480], '={{ $json.chat_id }}', '={{ $json.testo }}', { retryOnFail: true, maxTries: 2, waitBetweenTries: 3000 });

// ------------------------------------------------------------------ 2 · Google
telegram('Avvisa: sto analizzando', [1840, 60], '={{ $json.chat_id }}', '={{ $json.testo }}', { onError: 'continueRegularOutput' });
nodo('Google: cerca il negozio', 'n8n-nodes-base.httpRequest', 4.2, [2060, 200], {
  method: 'POST',
  url: 'https://places.googleapis.com/v1/places:searchText',
  authentication: 'genericCredentialType',
  genericAuthType: 'httpHeaderAuth',
  sendHeaders: true,
  headerParameters: {
    parameters: [
      {
        name: 'X-Goog-FieldMask',
        value: [
          'places.id', 'places.displayName', 'places.formattedAddress', 'places.googleMapsUri', 'places.primaryTypeDisplayName',
          'places.businessStatus', 'places.rating', 'places.userRatingCount', 'places.websiteUri', 'places.nationalPhoneNumber',
          'places.internationalPhoneNumber', 'places.regularOpeningHours', 'places.photos', 'places.reviews', 'places.editorialSummary',
        ].join(','),
      },
    ],
  },
  sendBody: true,
  specifyBody: 'json',
  jsonBody: "={{ JSON.stringify({ textQuery: $('Leggi risposta foto').first().json.ricerca.query, languageCode: 'it', regionCode: 'IT', pageSize: 3 }) }}",
  options: { timeout: 30000 },
}, { credentials: CRED.google, retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, onError: 'continueRegularOutput' });
code('Scegli scheda Google', [2280, 200], 'scegli-scheda-google.js');

// ------------------------------------------------------------------ 3 · sito
se('C\'è un sito da controllare?', [2500, 200], '={{ $json.sito_tipo || \'\' }}', uguale, 'proprio');
nodo('Sito: scarica la home', 'n8n-nodes-base.httpRequest', 4.2, [2720, 60], {
  url: '={{ $json.sito_url }}',
  sendHeaders: true,
  headerParameters: {
    parameters: [
      { name: 'User-Agent', value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' },
      { name: 'Accept', value: 'text/html,application/xhtml+xml' },
      { name: 'Accept-Language', value: 'it-IT,it;q=0.9' },
    ],
  },
  options: {
    timeout: 20000,
    response: { response: { fullResponse: true, neverError: true, responseFormat: 'text' } },
  },
}, { onError: 'continueRegularOutput' });
nodo('Sito: misura velocità', 'n8n-nodes-base.httpRequest', 4.2, [2940, 60], {
  url: "=https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url={{ encodeURIComponent($('Scegli scheda Google').first().json.sito_url) }}&strategy=mobile&category=performance&category=seo&category=accessibility&category=best-practices&locale=it",
  authentication: 'genericCredentialType',
  genericAuthType: 'httpHeaderAuth',
  options: { timeout: 120000 },
}, { credentials: CRED.google, onError: 'continueRegularOutput' });
code('Analizza il sito', [3160, 200], 'analizza-sito.js');

// ------------------------------------------------------------------ 4 · social
code('Prepara ricerca social', [3400, 200], 'prepara-ricerca.js');
claude('Claude: cerca social', [3620, 200], 'richiesta_ricerca', 600000);
se('Ricerca in pausa?', [3840, 200], '={{ $json.stop_reason || \'\' }}', uguale, 'pause_turn');
code('Prepara seguito ricerca', [4060, 60], 'prepara-seguito-ricerca.js');
claude('Claude: continua ricerca', [4280, 60], 'richiesta_seguito', 600000);
code('Leggi ricerca', [4500, 200], 'leggi-ricerca.js');

// ------------------------------------------------------------------ 5 · scheda
code('Prepara scheda', [4720, 200], 'prepara-scheda.js');
claude('Claude: scrivi la scheda', [4940, 200], 'richiesta_scheda', 300000);
code('Componi messaggi', [5160, 200], 'componi-messaggi.js');
telegram('Manda la scheda', [5380, 200], '={{ $json.chat_id }}', '={{ $json.messaggio_1 }}', { retryOnFail: true, maxTries: 2, waitBetweenTries: 3000 });
telegram('Manda i dettagli', [5600, 200], "={{ $('Componi messaggi').first().json.chat_id }}", "={{ $('Componi messaggi').first().json.messaggio_2 }}", { retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, onError: 'continueRegularOutput' });
nodo('Prepara riga', 'n8n-nodes-base.code', 2, [5820, 200], {
  jsCode: "// La riga per il foglio «Prospetti»: le intestazioni del foglio devono avere questi stessi nomi.\nreturn [{ json: $('Componi messaggi').first().json.riga }];\n",
});
// Spento di serie: n8n non pubblica un workflow con un nodo attivo senza credenziali.
nodo('Salva nel foglio Prospetti', 'n8n-nodes-base.googleSheets', 4.5, [6040, 200], {
  operation: 'append',
  documentId: { __rl: true, value: '', mode: 'url' },
  sheetName: { __rl: true, value: 'Prospetti', mode: 'name' },
  columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [] },
  options: {},
}, { credentials: CRED.fogli, onError: 'continueRegularOutput', disabled: true });

// ------------------------------------------------------------------ collegamenti
const C = {};
function collega(da, a, uscita = 0) {
  C[da] = C[da] || { main: [] };
  while (C[da].main.length <= uscita) C[da].main.push([]);
  C[da].main[uscita].push({ node: a, type: 'main', index: 0 });
}
collega('Foto dal telefono', 'Config');
collega('Config', 'Controlla messaggio');
collega('Controlla messaggio', 'Si analizza?');
collega('Si analizza?', 'Scarica la foto', 0);
collega('Si analizza?', 'Rispondi', 1);
collega('Scarica la foto', 'Prepara lettura foto');
collega('Prepara lettura foto', 'Foto pronta?');
collega('Foto pronta?', 'Claude: leggi la foto', 0);
collega('Foto pronta?', 'Rispondi', 1);
collega('Claude: leggi la foto', 'Leggi risposta foto');
collega('Leggi risposta foto', 'Foto letta?');
collega('Foto letta?', 'Avvisa: sto analizzando', 0);
collega('Foto letta?', 'Rispondi', 1);
collega('Avvisa: sto analizzando', 'Google: cerca il negozio');
collega('Google: cerca il negozio', 'Scegli scheda Google');
collega('Scegli scheda Google', 'C\'è un sito da controllare?');
collega('C\'è un sito da controllare?', 'Sito: scarica la home', 0);
collega('C\'è un sito da controllare?', 'Analizza il sito', 1);
collega('Sito: scarica la home', 'Sito: misura velocità');
collega('Sito: misura velocità', 'Analizza il sito');
collega('Analizza il sito', 'Prepara ricerca social');
collega('Prepara ricerca social', 'Claude: cerca social');
collega('Claude: cerca social', 'Ricerca in pausa?');
collega('Ricerca in pausa?', 'Prepara seguito ricerca', 0);
collega('Ricerca in pausa?', 'Leggi ricerca', 1);
collega('Prepara seguito ricerca', 'Claude: continua ricerca');
collega('Claude: continua ricerca', 'Leggi ricerca');
collega('Leggi ricerca', 'Prepara scheda');
collega('Prepara scheda', 'Claude: scrivi la scheda');
collega('Claude: scrivi la scheda', 'Componi messaggi');
collega('Componi messaggi', 'Manda la scheda');
collega('Manda la scheda', 'Manda i dettagli');
collega('Manda i dettagli', 'Prepara riga');
collega('Prepara riga', 'Salva nel foglio Prospetti');

// Le sezioni 2-5 stanno a destra della sezione 1.
const SEZIONE_1 = new Set([
  'Foto dal telefono', 'Config', 'Controlla messaggio', 'Si analizza?', 'Scarica la foto', 'Prepara lettura foto',
  'Foto pronta?', 'Claude: leggi la foto', 'Leggi risposta foto', 'Foto letta?', 'Rispondi', 'Nota: come funziona', 'Nota 1',
]);
for (const n of nodi) if (!SEZIONE_1.has(n.name)) n.position = [n.position[0] + 400, n.position[1]];

const nomi = new Set(nodi.map((n) => n.name));
for (const [da, { main }] of Object.entries(C)) {
  if (!nomi.has(da)) throw new Error('collegamento da un nodo inesistente: ' + da);
  for (const uscita of main) for (const c of uscita) if (!nomi.has(c.node)) throw new Error('collegamento verso un nodo inesistente: ' + c.node);
}

const workflow = {
  name: '09 - Radar negozio',
  nodes: nodi,
  pinData: {},
  connections: C,
  active: false,
  settings: { executionOrder: 'v1' },
  meta: { templateCredsSetupCompleted: false },
  tags: [],
};

writeFileSync(USCITA, JSON.stringify(workflow, null, 2) + '\n');
console.log('Scritto ' + USCITA + ' (' + nodi.length + ' nodi)');
