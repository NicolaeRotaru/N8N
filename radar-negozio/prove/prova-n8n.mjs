// Prova il workflow dentro un n8n vero, con i servizi finti di finti-servizi.mjs (niente internet, niente chiavi).
// Il trigger Telegram è quello vero: n8n registra il webhook sul Telegram finto, che poi gli manda i messaggi.
//
// Uso:  N8N_DIR=<cartella con node_modules/n8n e node_modules/node> node prove/prova-n8n.mjs
//       (di serie N8N_DIR = prove/.n8n, preparata da prove/prepara-n8n.sh)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { avvia, FOTO, HEIC, TOKEN } from './finti-servizi.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const N8N_DIR = process.env.N8N_DIR || join(QUI, '.n8n');
const NODE = join(N8N_DIR, 'node_modules', 'node', 'bin', 'node');
const N8N = join(N8N_DIR, 'node_modules', 'n8n', 'bin', 'n8n');
const TMP = join(QUI, '.tmp');
const PORTA_N8N = 5688; // non 5679: è la porta interna dei task runner di n8n
const ID_WORKFLOW = 'radarProva000001';

if (!existsSync(NODE) || !existsSync(N8N)) {
  console.error('n8n non trovato in ' + N8N_DIR + ': lancia prove/prepara-n8n.sh oppure imposta N8N_DIR.');
  process.exit(2);
}

// ------------------------------------------------------------------ controlli
let ok = 0;
const falliti = [];
function controlla(condizione, descrizione, dettaglio) {
  if (condizione) {
    ok++;
    console.log('  ✔ ' + descrizione);
  } else {
    falliti.push(descrizione);
    console.log('  ✖ ' + descrizione + (dettaglio !== undefined ? '\n      ' + String(typeof dettaglio === 'string' ? dettaglio : JSON.stringify(dettaglio)).slice(0, 600) : ''));
  }
}

// Telegram rifiuta un messaggio con HTML sbagliato: tag non ammessi, tag non chiusi, < o & non scritti come entità.
function htmlTelegramValido(testo) {
  const ammessi = new Set(['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'a', 'code', 'pre', 'blockquote', 'tg-spoiler']);
  const pila = [];
  const re = /<\/?([a-zA-Z-]+)([^>]*)>|<|&(?!(amp|lt|gt|quot|#\d+);)/g;
  let m;
  while ((m = re.exec(testo))) {
    if (!m[1]) return 'carattere non protetto «' + m[0] + '» in posizione ' + m.index;
    const tag = m[1].toLowerCase();
    if (!ammessi.has(tag)) return 'tag non ammesso <' + tag + '>';
    if (m[0].startsWith('</')) {
      if (pila.pop() !== tag) return 'tag chiuso male </' + tag + '>';
    } else {
      if (tag === 'a' && !/^\s+href="[^"]+"\s*$/.test(m[2])) return 'link scritto male: ' + m[0];
      pila.push(tag);
    }
  }
  if (pila.length) return 'tag non chiusi: ' + pila.join(', ');
  const visibile = testo.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  if (visibile.length > 4096) return 'troppo lungo: ' + visibile.length + ' caratteri';
  return null;
}

// Lo schema dei JSON garantiti da Claude: ogni oggetto con additionalProperties false e tutti i campi in required.
function schemaValido(s, percorso = 'schema') {
  if (!s || typeof s !== 'object') return percorso + ' mancante';
  if (s.type === 'object') {
    if (s.additionalProperties !== false) return percorso + ': manca additionalProperties false';
    const chiavi = Object.keys(s.properties || {});
    const richiesti = s.required || [];
    if (chiavi.length !== richiesti.length || chiavi.some((k) => !richiesti.includes(k))) return percorso + ': required diverso dalle proprietà';
    for (const k of chiavi) {
      const e = schemaValido(s.properties[k], percorso + '.' + k);
      if (e) return e;
    }
  }
  if (s.type === 'array') return schemaValido(s.items, percorso + '[]');
  for (const vietata of ['minimum', 'maximum', 'minLength', 'maxLength', 'multipleOf']) if (vietata in s) return percorso + ': ' + vietata + ' non supportato';
  return null;
}

// ------------------------------------------------------------------ preparazione
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
const { server, stato } = await avvia(9999);

const env = { ...process.env };
for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'GLOBAL_AGENT_HTTP_PROXY', 'GLOBAL_AGENT_HTTPS_PROXY']) delete env[k];
Object.assign(env, {
  PATH: dirname(NODE) + ':' + process.env.PATH,
  N8N_USER_FOLDER: join(TMP, 'home'),
  N8N_ENCRYPTION_KEY: 'prova-radar-negozio-0123456789',
  N8N_PORT: String(PORTA_N8N),
  N8N_LISTEN_ADDRESS: '127.0.0.1',
  WEBHOOK_URL: 'http://127.0.0.1:' + PORTA_N8N + '/',
  N8N_DIAGNOSTICS_ENABLED: 'false',
  N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
  N8N_TEMPLATES_ENABLED: 'false',
  N8N_PERSONALIZATION_ENABLED: 'false',
  N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'false',
  N8N_LOG_LEVEL: process.env.N8N_LOG_LEVEL || 'warn',
  GENERIC_TIMEZONE: 'Europe/Rome',
  TZ: 'Europe/Rome',
  EXECUTIONS_DATA_SAVE_ON_SUCCESS: 'all',
});

function cli(...argomenti) {
  const r = spawnSync(NODE, [N8N, ...argomenti], { env, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error('n8n ' + argomenti.join(' ') + ' è fallito');
  }
  return r.stdout;
}

const credenziali = [
  { id: 'credTelegram0001', name: 'Telegram - Radar negozio', type: 'telegramApi', data: { accessToken: TOKEN, baseUrl: 'http://127.0.0.1:9999/telegram' } },
  { id: 'credClaude000001', name: 'Anthropic - Claude', type: 'anthropicApi', data: { apiKey: 'sk-finta', url: 'https://api.anthropic.com' } },
  { id: 'credGoogle000001', name: 'Google - Chiave API', type: 'httpHeaderAuth', data: { name: 'X-Goog-Api-Key', value: 'chiave-google-finta' } },
];
writeFileSync(join(TMP, 'credenziali.json'), JSON.stringify(credenziali));

// Il workflow di prova è quello vero, con gli indirizzi dei servizi spostati sui servizi finti.
let testo = readFileSync(join(QUI, '..', '09-radar-negozio.json'), 'utf8');
const SOSTITUZIONI = [
  ['https://api.anthropic.com/v1/messages', 'http://127.0.0.1:9999/anthropic/v1/messages', 4],
  ['https://places.googleapis.com/v1/places:searchText', 'http://127.0.0.1:9999/places/v1/places:searchText', 1],
  ['https://www.googleapis.com/pagespeedonline/v5/runPagespeed', 'http://127.0.0.1:9999/pagespeed/v5/runPagespeed', 1],
];
for (const [da, a, volte] of SOSTITUZIONI) {
  const n = testo.split(da).length - 1;
  if (n !== volte) throw new Error('mi aspettavo ' + volte + ' volte ' + da + ', trovate ' + n);
  testo = testo.split(da).join(a);
}
const wf = JSON.parse(testo);
wf.id = ID_WORKFLOW;
const config = wf.nodes.find((n) => n.name === 'Config');
for (const a of config.parameters.assignments.assignments) {
  if (a.name === 'CHAT_AUTORIZZATE') a.value = '111, 222';
  if (a.name === 'CITTA_PREDEFINITA') a.value = 'Torino';
}
writeFileSync(join(TMP, 'workflow.json'), JSON.stringify(wf));

console.log('Preparo n8n in ' + join(TMP, 'home'));
cli('import:credentials', '--input=' + join(TMP, 'credenziali.json'));
cli('import:workflow', '--input=' + join(TMP, 'workflow.json'));
cli('publish:workflow', '--id=' + ID_WORKFLOW);

const n8n = spawn(NODE, [N8N, 'start'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let registroN8n = '';
n8n.stdout.on('data', (d) => (registroN8n += d));
n8n.stderr.on('data', (d) => (registroN8n += d));

const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));
async function finche(condizione, ms, passo = 250) {
  const fine = Date.now() + ms;
  while (Date.now() < fine) {
    if (condizione()) return true;
    await aspetta(passo);
  }
  return condizione();
}

let finito = false;
async function chiudi(codice) {
  if (finito) return;
  finito = true;
  n8n.kill('SIGTERM');
  await finche(() => n8n.exitCode !== null, 15000);
  server.close();
  process.exit(codice);
}

try {
  const pronto = await finche(() => !!stato.webhook, 180000, 500);
  if (!pronto) {
    console.error(registroN8n.slice(-4000));
    throw new Error('n8n non ha registrato il webhook su Telegram');
  }
  console.log('n8n pronto, webhook: ' + stato.webhook + '\n');

  // ---------------------------------------------------------------- aiuti per gli scenari
  let idAggiornamento = 1000;
  async function manda(messaggio) {
    const r = await fetch(stato.webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': stato.segreto },
      body: JSON.stringify({ update_id: ++idAggiornamento, message: { message_id: idAggiornamento, date: Math.floor(Date.now() / 1000), ...messaggio } }),
    });
    if (!r.ok) throw new Error('il webhook ha risposto ' + r.status);
  }
  const persona = (id) => ({ from: { id, is_bot: false, first_name: 'Giulia', last_name: 'Rossi' }, chat: { id, type: 'private' } });
  const fotoTelegram = (prefisso) => [
    { file_id: prefisso + '_s', width: 90, height: 60, file_size: 1500 },
    { file_id: prefisso + '_m', width: 320, height: 215, file_size: 12000 },
    { file_id: prefisso + '_x', width: 800, height: 537, file_size: 40000 },
    { file_id: prefisso + '_y', width: 1280, height: 860, file_size: FOTO.length },
  ];
  async function scenario(nome, nomeScenario, messaggio, attesi, ms = 150000) {
    console.log('▶ ' + nome);
    stato.scenario = (await import('./finti-servizi.mjs')).SCENARI[nomeScenario || 'felice'];
    stato.messaggi = [];
    stato.registro = [];
    await manda(messaggio);
    const arrivati = await finche(() => stato.messaggi.length >= attesi, ms);
    await aspetta(attesi === 1 ? 4000 : 1500); // per vedere se arrivano messaggi in più
    controlla(arrivati && stato.messaggi.length === attesi, attesi + ' messaggi Telegram', stato.messaggi.map((x) => x.text.slice(0, 120)));
    for (const [i, x] of stato.messaggi.entries()) {
      const e = htmlTelegramValido(x.text || '');
      controlla(!e && x.parse_mode === 'HTML', 'messaggio ' + (i + 1) + ': HTML valido per Telegram', e || x.parse_mode);
    }
    return {
      messaggi: stato.messaggi.map((x) => x.text),
      tutti: stato.messaggi,
      claude: stato.registro.filter((r) => r.percorso === '/anthropic/v1/messages'),
      places: stato.registro.filter((r) => r.percorso === '/places/v1/places:searchText'),
      pagespeed: stato.registro.filter((r) => r.percorso === '/pagespeed/v5/runPagespeed'),
      sito: stato.registro.filter((r) => r.percorso.startsWith('/sito/')),
      getFile: stato.registro.filter((r) => r.percorso.endsWith('/getFile')),
    };
  }

  // ---------------------------------------------------------------- 1. chat non autorizzata
  stato.file = { felice_y: FOTO, felice_x: FOTO, felice_m: FOTO, felice_s: FOTO, heic1: HEIC };
  let r = await scenario('Chat non autorizzata', 'felice', { ...persona(999), photo: fotoTelegram('felice') }, 1, 30000);
  controlla(/codice chat è <code>999<\/code>/.test(r.messaggi[0] || ''), 'risponde con il codice chat', r.messaggi[0]);
  controlla(r.tutti[0] && r.tutti[0].chat_id === '999', 'risponde alla chat giusta');
  controlla(r.claude.length === 0 && r.getFile.length === 0, 'nessuna chiamata a Claude e nessun download');

  // ---------------------------------------------------------------- 2. messaggio senza foto
  r = await scenario('Messaggio senza foto', 'felice', { ...persona(111), text: '/start' }, 1, 30000);
  controlla(/foto del negozio/.test(r.messaggi[0] || ''), 'risponde con le istruzioni', r.messaggi[0]);
  controlla(r.claude.length === 0, 'nessuna chiamata a Claude');

  // ---------------------------------------------------------------- 3. tutto bene
  r = await scenario('Pasticceria con tutto (ricerca in pausa e ripresa)', 'felice', { ...persona(111), photo: fotoTelegram('felice'), caption: 'via Po' }, 3);
  const idScaricato = r.getFile[0] && ((r.getFile[0].corpo && r.getFile[0].corpo.file_id) || r.getFile[0].query.file_id);
  controlla(r.getFile.length === 1 && idScaricato === 'felice_y', 'scarica la foto più grande', r.getFile.map((x) => [x.query, x.corpo]));
  controlla(/Ho letto <b>Pasticceria Aurora<\/b> \(pasticceria\)/.test(r.messaggi[0] || ''), 'primo messaggio: «Ho letto…»', r.messaggi[0]);
  controlla(r.claude.length === 4, '4 chiamate a Claude (foto, ricerca, seguito, scheda)', r.claude.length);
  for (const [i, c] of r.claude.entries()) {
    const h = c.intestazioni;
    const b = c.corpo || {};
    controlla(
      h['x-api-key'] === 'sk-finta' && h['anthropic-version'] === '2026-10-21' && h['anthropic-beta'] === 'server-side-fallback-2026-07-01' &&
        b.model === 'claude-opus-5-5' && b.max_tokens === 16000 && b.fallbacks === 'default' && b.output_config && b.output_config.effort === 'medium' &&
        !('temperature' in b) && !('top_p' in b) && !('thinking' in b),
      'Claude ' + (i + 1) + ': intestazioni e parametri giusti',
      { h: { v: h['anthropic-version'], beta: h['anthropic-beta'], key: h['x-api-key'] }, model: b.model, out: b.output_config && b.output_config.effort },
    );
  }
  const [foto, ricerca, seguito, schedaReq] = r.claude.map((c) => c.corpo || {});
  const img = foto.messages && foto.messages[0].content.find((x) => x.type === 'image');
  controlla(img && img.source.media_type === 'image/jpeg' && img.source.data === FOTO.toString('base64'), 'la foto arriva a Claude intera, in base64');
  controlla(foto.messages && /«via Po»/.test(foto.messages[0].content.find((x) => x.type === 'text').text), 'la didascalia arriva a Claude');
  controlla(!schemaValido(foto.output_config && foto.output_config.format && foto.output_config.format.schema), 'schema della lettura foto valido', schemaValido(foto.output_config.format.schema));
  const tipi = (ricerca.tools || []).map((t) => t.type).join(',');
  controlla(tipi === 'web_search_20260209,web_fetch_20260209', 'ricerca: strumenti web giusti', tipi);
  controlla(ricerca.tools && ricerca.tools[0].user_location && ricerca.tools[0].user_location.city === 'Torino', 'ricerca: città per i risultati locali');
  const datiRicerca = ricerca.messages ? ricerca.messages[0].content : '';
  controlla(/Pasticceria Aurora/.test(datiRicerca) && /011 812 3456/.test(datiRicerca) && /instagram\.com\/pasticceria\.aurora/.test(datiRicerca), 'ricerca: riceve nome, telefono e social trovati sul sito', datiRicerca);
  controlla(!ricerca.output_config.format, 'ricerca: senza formato JSON (le citazioni non lo permettono)');
  controlla(
    seguito.messages && seguito.messages.length === 2 && seguito.messages[1].role === 'assistant' && JSON.stringify(seguito.messages[1].content).includes('srvtoolu_1'),
    'seguito: rimanda la risposta in pausa così com\'è, senza messaggi in più',
    seguito.messages && seguito.messages.map((m) => m.role),
  );
  controlla(!schemaValido(schedaReq.output_config && schedaReq.output_config.format && schedaReq.output_config.format.schema), 'schema della scheda valido', schemaValido(schedaReq.output_config.format.schema));
  const datiScheda = schedaReq.messages ? schedaReq.messages[0].content : '';
  controlla(/"stelle": 4.6/.test(datiScheda) && /"velocita": 38/.test(datiScheda) && /circa 1\.200 follower/.test(datiScheda), 'scheda: riceve dati di Google, sito e ricerca', datiScheda.slice(0, 300));
  const pl = r.places[0] || {};
  controlla(
    pl.intestazioni && pl.intestazioni['x-goog-api-key'] === 'chiave-google-finta' && /places\.reviews/.test(pl.intestazioni['x-goog-fieldmask'] || '') &&
      pl.corpo.textQuery === 'Pasticceria Aurora Via Po 12 Torino' && pl.corpo.languageCode === 'it' && pl.corpo.pageSize === 3,
    'Google Places: chiave, campi e ricerca giusti',
    pl.corpo,
  );
  const ps = r.pagespeed[0] || {};
  controlla(ps.query && ps.query.url === 'http://127.0.0.1:9999/sito/aurora' && ps.query.strategy === 'mobile' && ps.intestazioni['x-goog-api-key'] === 'chiave-google-finta', 'PageSpeed: sito giusto, da telefono, con la chiave', ps.query);
  controlla(r.sito.length === 1 && /Mobile/.test(r.sito[0].intestazioni['user-agent'] || ''), 'scarica la home come un telefono');
  const [, m1, m2] = r.messaggi;
  controlla(/Presenza online: 7\/10/.test(m1 || ''), 'scheda: voto totale 7/10', m1);
  controlla(/Google 10\/10/.test(m1 || '') && /Sito 7\/10/.test(m1 || '') && /Social 4\/10/.test(m1 || ''), 'scheda: voti Google 10, sito 7, social 4');
  controlla(/Cosa proporre/.test(m1 || '') && /Web &amp; Digital/.test(m1 || '') && /rompere il ghiaccio/.test(m1 || ''), 'scheda: proposte e rompighiaccio');
  controlla(/© 2019/.test(m2 || '') && /WordPress/.test(m2 || '') && /iubenda/.test(m2 || '') && /P\.IVA ✔/.test(m2 || ''), 'dettagli: copyright, CMS, cookie, P.IVA', m2);
  controlla(/https ✔/.test(m2 || '') && /Velocità da telefono 38\/100 \(pagina pronta in 6,1 s\)/.test(m2 || ''), 'dettagli: https e velocità');
  controlla(/<a href="https:\/\/www\.instagram\.com\/pasticceria\.aurora\/">/.test(m2 || ''), 'dettagli: link al profilo Instagram');
  controlla(!/Caffè Aurora/.test(m2 || ''), 'sceglie la scheda col telefono uguale, non la prima');
  controlla(/3 ricerche web/.test(m2 || ''), 'dettagli: conta le ricerche web', (m2 || '').slice(-200));
  controlla(r.tutti.every((x) => x.anteprima_spenta === true), 'anteprime dei link spente');
  controlla(/\n\n💡 <b>Cosa proporre/.test(m1 || '') && /\n\n<b>Sito<\/b>/.test(m2 || ''), 'righe vuote tra le sezioni');
  controlla(/• TikTok: non trovato\n/.test(m2 || '') && /· 1 fonte ·/.test(m2 || ''), 'profili non trovati in breve, singolare giusto');

  // ---------------------------------------------------------------- 4. nessuna presenza online, ricerca in errore
  r = await scenario('Ferramenta senza nulla online (ricerca social in errore)', 'nessuno', { ...persona(222), photo: fotoTelegram('felice') }, 3, 180000);
  controlla(r.places[0] && r.places[0].corpo.textQuery === 'Ferramenta Bianchi, Torino', 'senza città sulla foto usa CITTA_PREDEFINITA', r.places[0] && r.places[0].corpo);
  controlla(r.claude.filter((c) => c.corpo && c.corpo.tools).length === 3, 'la ricerca in errore viene ritentata 3 volte');
  controlla(r.pagespeed.length === 0 && r.sito.length === 0, 'nessun sito da misurare');
  controlla(/Presenza online: 0\/10/.test(r.messaggi[1] || '') && /🔴/.test(r.messaggi[1] || ''), 'voto totale 0/10, rosso', r.messaggi[1]);
  controlla(/&lt;subito&gt; &amp; bene/.test(r.messaggi[1] || ''), 'i testi di Claude sono protetti per l\'HTML');
  controlla(/Nessuna scheda trovata/.test(r.messaggi[2] || '') && /Nessun sito trovato/.test(r.messaggi[2] || ''), 'dettagli: niente Google, niente sito', r.messaggi[2]);
  controlla(r.tutti[0] && r.tutti[0].chat_id === '222', 'risponde a chi ha mandato la foto');

  // ---------------------------------------------------------------- 5. sito che non si apre
  r = await scenario('Sito che non si apre e PageSpeed in errore', 'sitoGiu', { ...persona(111), photo: fotoTelegram('felice') }, 3);
  controlla(/Sito 1\/10/.test(r.messaggi[1] || ''), 'sito: voto 1/10', r.messaggi[1]);
  controlla(/Non si apre/.test(r.messaggi[2] || ''), 'dettagli: «Non si apre»', r.messaggi[2]);

  // ---------------------------------------------------------------- 6. Facebook al posto del sito
  r = await scenario('Su Google c\'è Facebook al posto del sito', 'facebook', { ...persona(111), photo: fotoTelegram('felice') }, 3);
  controlla(r.sito.length === 0 && r.pagespeed.length === 0, 'Facebook non viene misurato come un sito');
  controlla(/Al posto del sito: <a href="https:\/\/www\.facebook\.com\/pasticceriaaurora">Facebook<\/a>/.test(r.messaggi[2] || ''), 'dettagli: «Al posto del sito: Facebook»', r.messaggi[2]);
  controlla(/sito collegato \(è un profilo Facebook\) 0,5\/1/.test(r.messaggi[2] || ''), 'Google: mezzo punto per il link a Facebook');
  controlla(/Sito 0\/10/.test(r.messaggi[1] || ''), 'sito: voto 0/10');

  // ---------------------------------------------------------------- 7. Claude rifiuta la scheda
  r = await scenario('Claude non scrive la scheda (rifiuto)', 'rifiuto', { ...persona(111), photo: fotoTelegram('felice') }, 3);
  controlla(/La parte scritta da Claude non è arrivata \(Claude non ha voluto rispondere \(cyber\)\)/.test(r.messaggi[1] || ''), 'la scheda esce lo stesso, con l\'avviso', r.messaggi[1]);
  controlla(/Social n\.d\./.test(r.messaggi[1] || '') && /Presenza online: 9\/10/.test(r.messaggi[1] || ''), 'senza Claude: social n.d., totale solo su Google e sito', r.messaggi[1]);
  controlla(/https ✖/.test(r.messaggi[2] || ''), 'http senza https viene segnalato');

  // ---------------------------------------------------------------- 7b. testi lunghissimi e strani da Claude
  r = await scenario('Claude risponde con testi lunghissimi', 'lungo', { ...persona(111), photo: fotoTelegram('felice') }, 3);
  controlla(/Social 10\/10/.test(r.messaggi[1] || ''), 'voto social fuori scala riportato a 10');
  controlla(!/href="javascript/i.test(r.messaggi.join('')), 'nessun link javascript:');
  controlla(r.messaggi.slice(1).every((x) => x.replace(/<[^>]+>/g, '').length <= 4096), 'scheda e dettagli restano dentro il limite di Telegram');

  // ---------------------------------------------------------------- 8. insegna illeggibile
  r = await scenario('Insegna illeggibile', 'illeggibile', { ...persona(111), photo: fotoTelegram('felice') }, 1, 60000);
  controlla(/Non riesco a leggere bene l'insegna: foto mossa/.test(r.messaggi[0] || ''), 'chiede di rifare la foto', r.messaggi[0]);
  controlla(r.claude.length === 1 && r.places.length === 0, 'si ferma dopo la lettura della foto');

  // ---------------------------------------------------------------- 9. foto HEIC mandata come file
  r = await scenario('Foto HEIC mandata come file', 'felice', { ...persona(111), document: { file_id: 'heic1', file_name: 'IMG_0001.HEIC', mime_type: 'image/heic', file_size: HEIC.length } }, 1, 60000);
  controlla(/formato di foto/.test(r.messaggi[0] || ''), 'spiega che il formato non va', r.messaggi[0]);
  controlla(r.claude.length === 0, 'nessuna chiamata a Claude');

  // ---------------------------------------------------------------- 10. file troppo pesante
  r = await scenario('File da 12 MB', 'felice', { ...persona(111), document: { file_id: 'grosso', file_name: 'IMG.jpg', mime_type: 'image/jpeg', file_size: 12 * 1024 * 1024 } }, 1, 30000);
  controlla(/troppo pesante/.test(r.messaggi[0] || ''), 'dice che è troppo pesante', r.messaggi[0]);
  controlla(r.getFile.length === 0, 'non lo scarica nemmeno');

  if (process.env.MOSTRA_MESSAGGI) {
    r = await scenario('Esempio da mostrare', 'felice', { ...persona(111), photo: fotoTelegram('felice') }, 3);
    writeFileSync(join(TMP, 'messaggi-esempio.json'), JSON.stringify(r.messaggi, null, 2));
  }
} catch (e) {
  falliti.push('errore: ' + e.message);
  console.error(e);
}

console.log('\n' + ok + ' controlli superati, ' + falliti.length + ' falliti.');
if (falliti.length) {
  for (const f of falliti) console.log('  ✖ ' + f);
  writeFileSync(join(TMP, 'n8n.log'), registroN8n);
  console.log('Registro di n8n in ' + join(TMP, 'n8n.log'));
}
await chiudi(falliti.length ? 1 : 0);
