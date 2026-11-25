// Prove della lettura delle pagine da n8n nel 12 e nel 26 (flussi/chiedi-all-ad/leggi-pagine.mjs).
// La parte finale gira sul codice VERO del 12 se FLUSSO_12 indica un flusso esportato (fuori dal repository:
// contiene gli ID del foglio e della chat), es. FLUSSO_12=/tmp/12.json node --test flussi/test/leggi-pagine.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eseguiCodice } from './esegui-codice.mjs';
import { codiceNodo, nodiNuovi, aggiungiLettura, operazioni, ugualiNellaSostanza, N } from '../chiedi-all-ad/leggi-pagine.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const RISPOSTA_AD = JSON.parse(readFileSync(join(QUI, 'fixture', 'ad-ricerca-ora-del-gusto.json'), 'utf8'));
const adattaRisposta = readFileSync(join(QUI, '..', 'chiedi-all-ad', 'codice', 'adatta-risposta.js'), 'utf8').replace('__FORMA__', '"completa"');
const LP = await eseguiCodice(`${codiceNodo('pagine-indirizzi.js')}\n${codiceNodo('pagine-testo.js')}\nreturn { ...LT, ...LI };`);
const EATBU = 'https://oradelgustovialesantambrogiopiacenzapcitalia.eatbu.com/';
const WEEBLY = 'https://oradelgusto.weebly.com/';

// Pagine finte, scritte per la prova (non sono le pagine vere del locale).
const HOME = `<!doctype html><html><head><title>Bar Ora del Gusto &ndash; Piacenza</title>
<meta name="description" content="Caff&egrave;, colazioni e aperitivi in Viale Sant&#39;Ambrogio">
<script type="application/ld+json">{"@type":"CafeOrCoffeeShop","telephone":"+39 0523 337635"}</script>
<style>.x{color:red}</style><script>var traccia = "non deve finire nel testo";</script></head>
<body><nav><a href="/menu">Il nostro men&ugrave;</a> <a href="contatti.html">Contatti</a> <a href="https://altro-sito.it/menu">altro</a>
<a href="mailto:info@oradelgusto.it">scrivici</a> <a href="/foto.jpg">foto</a></nav>
<h1>Bar Ora del Gusto</h1><p>Viale Sant'Ambrogio 6, 29121 Piacenza<br>Telefono: 0523 337635</p>
<p>Aperti dal luned&igrave; al sabato, 6:30 &ndash; 20:00</p></body></html>`;
const MENU = '<html><body><h2>Colazioni</h2><ul><li>Cappuccino</li><li>Brioche alla crema</li></ul></body></html>';
const html = (corpo, extra = {}) => ({ json: { statusCode: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, data: corpo, ...extra } });
const voci = (urls) => urls.map((url) => ({ json: { leggi: true, url } }));

async function dallAD(risposta = RISPOSTA_AD) {
  const [x] = await eseguiCodice(adattaRisposta, { input: [{ json: risposta }] });
  return x;
}
const CONFIG = { json: { MAX_LETTURE: 10 } };
const PREPARA = (sito = '') => ({ json: { richiesta: { nome: 'Ora del Gusto', citta: 'Piacenza', sito } } });

// ── l'indirizzo si può aprire? ─────────────────────────────────────────────────────────────────────
test('indirizzi: si aprono i siti dei locali, mai quelli interni, Meta, mappe o portali', () => {
  for (const u of [EATBU, WEEBLY, 'http://www.pizzeria-esempio.it/menu?x=1', 'oradelgusto.weebly.com', 'https://sub.dominio.co.uk:443/a']) {
    assert.equal(LP.indirizzoSicuro(u).ok, true, u);
  }
  const no = {
    'http://officina.internal:8080/file/x': 'porta non standard', 'http://officina.internal/x': 'rete interna', 'http://localhost/': 'nome senza dominio (rete interna)',
    'http://127.0.0.1/': 'indirizzo IP', 'http://169.254.169.254/latest': 'indirizzo IP', 'http://0x7f.0.0.1/': 'indirizzo IP', 'http://[::1]/': 'indirizzo IP',
    'http://n8n:5678/': 'porta non standard', 'http://n8n/': 'nome senza dominio (rete interna)', 'https://n8n-shdy.sliplane.app/webhook/x': 'servizio della macchina',
    'https://utente:pass@sito.it/': 'indirizzo con utente e password', 'https://www.facebook.com/oradelgusto': 'Facebook/Instagram: non si legge',
    'https://m.instagram.com/x': 'Facebook/Instagram: non si legge', 'https://www.tripadvisor.it/Restaurant': 'mappe o portale: solo frammento',
    'https://www.google.com/maps/place/x': 'mappe o portale: solo frammento', 'https://maps.app.goo.gl/abc': 'mappe o portale: solo frammento',
    'ftp://sito.it/x': 'non è un indirizzo web', 'https://sito.it/foto.jpg': 'non è una pagina', 'https://casa.local/': 'rete interna',
  };
  for (const [u, motivo] of Object.entries(no)) assert.equal(LP.indirizzoSicuro(u).motivo, motivo, u);
  assert.equal(LP.indirizzoSicuro('https://www.google.com/search?q=ora').ok, true, 'Google fuori dalle mappe non è un portale');
});

test('indirizzi nel testo: anche senza https://, mai le email né i nomi di file', () => {
  const t = 'Siti: oradelgusto.weebly.com e https://x.it/menu). Scrivi a info@oradelgusto.it, file risposta.json, a.b';
  assert.deepEqual(LP.indirizziIn(t), ['oradelgusto.weebly.com', 'https://x.it/menu']);
});

test('dalla pagina al testo: titolo, descrizione, dati strutturati e corpo; niente script né stili', () => {
  const t = LP.htmlInTesto(HOME);
  assert.match(t, /Titolo della pagina: Bar Ora del Gusto – Piacenza/);
  assert.match(t, /Descrizione della pagina: Caffè, colazioni e aperitivi in Viale Sant'Ambrogio/);
  assert.match(t, /"telephone":"\+39 0523 337635"/);
  assert.match(t, /Viale Sant'Ambrogio 6, 29121 Piacenza\nTelefono: 0523 337635/);
  assert.match(t, /Aperti dal lunedì al sabato, 6:30 – 20:00/);
  assert.doesNotMatch(t, /non deve finire|color:red|</);
  assert.equal(LP.htmlInTesto('<p>\u200bMercoled\u00ec 17.00 &#8203;&mdash; 21.00</p>'), 'Mercoledì 17.00 — 21.00', 'via gli spazi invisibili');
});

test('collegamenti relativi e sottopagine dello stesso sito', () => {
  assert.equal(LP.assoluto('contatti.html', 'https://a.it/chi/siamo'), 'https://a.it/chi/contatti.html');
  assert.equal(LP.assoluto('../menu/', 'https://a.it/x/y/z'), 'https://a.it/x/menu/');
  assert.equal(LP.assoluto('/menu#pranzo', 'https://a.it/x'), 'https://a.it/menu');
  assert.equal(LP.assoluto('//b.it/q', 'https://a.it/'), 'https://b.it/q');
  assert.equal(LP.assoluto('mailto:x@a.it', 'https://a.it/'), '');
  assert.deepEqual(LP.sottopagine(HOME, EATBU), [`${EATBU}menu`, `${EATBU}contatti.html`]);
});

// ── i nodi, uno per uno ───────────────────────────────────────────────────────────────────────────
test('Pagine da leggere: dalla risposta vera di Ora del Gusto escono i due siti del locale', async () => {
  const fuori = await eseguiCodice(codiceNodo('pagine-da-leggere.js'), { input: [await dallAD()], nodi: { Config: [CONFIG], 'Prepara la ricerca': [PREPARA()] } });
  assert.deepEqual(fuori.map((x) => x.json.url), [WEEBLY, EATBU]);
  assert.ok(fuori.every((x) => x.json.leggi === true));
});

test('Pagine da leggere: prima il sito dichiarato, poi la riga PAGINE DA LEGGERE; gli indirizzi pericolosi restano fuori', async () => {
  const risposta = { ...RISPOSTA_AD, risultato: `${RISPOSTA_AD.risultato}\nPAGINE DA LEGGERE: http://officina.internal:8080/file/x https://localhost/ https://www.facebook.com/x https://www.tripadvisor.it/y https://bar-esempio.it/menu` };
  const fuori = await eseguiCodice(codiceNodo('pagine-da-leggere.js'), { input: [await dallAD(risposta)], nodi: { Config: [CONFIG], 'Prepara la ricerca': [PREPARA('https://sito-dichiarato.it')] } });
  assert.deepEqual(fuori.map((x) => x.json.url), ['https://sito-dichiarato.it/', 'https://bar-esempio.it/menu', WEEBLY, EATBU]);
  const motivi = Object.fromEntries(fuori[0].json.scartati.map((s) => [s.url, s.motivo]));
  assert.equal(motivi['http://officina.internal:8080/file/x'], 'porta non standard');
  assert.equal(motivi['https://www.facebook.com/x'], 'Facebook/Instagram: non si legge');
  assert.equal(motivi['https://www.tripadvisor.it/y'], 'mappe o portale: solo frammento');
});

test('Pagine da leggere: al massimo MAX_LETTURE, e niente quando la ricerca non è dell\'AD o l\'AD non risponde', async () => {
  const tanti = { ...RISPOSTA_AD, risultato: `PAGINE DA LEGGERE: ${Array.from({ length: 15 }, (_, i) => `https://s${i}.it/`).join(' ')}` };
  const fuori = await eseguiCodice(codiceNodo('pagine-da-leggere.js'), { input: [await dallAD(tanti)], nodi: { Config: [{ json: { MAX_LETTURE: 4 } }], 'Prepara la ricerca': [PREPARA()] } });
  assert.equal(fuori.length, 4);
  const api = { json: { statusCode: 200, body: { content: [{ type: 'text', text: WEEBLY }], stop_reason: 'end_turn' } } };
  const [a] = await eseguiCodice(codiceNodo('pagine-da-leggere.js'), { input: [api], nodi: { Config: [CONFIG], 'Prepara la ricerca': [PREPARA()] } });
  assert.equal(a.json.leggi, false);
  const [b] = await eseguiCodice(codiceNodo('pagine-da-leggere.js'), { input: [await dallAD({ ok: false, errore: 'tempo scaduto' })], nodi: { Config: [CONFIG], 'Prepara la ricerca': [PREPARA()] } });
  assert.equal(b.json.leggi, false);
});

test('Sottopagine da leggere: prima i rinvii (passati dal controllo), poi menu e contatti dello stesso sito', async () => {
  const richieste = voci([EATBU, 'http://oradelgusto.weebly.com/', 'https://bar-esempio.it/']);
  const scaricate = [html(HOME), { json: { statusCode: 301, headers: { location: 'https://oradelgusto.weebly.com/' }, data: '' } },
    { json: { statusCode: 302, headers: { location: 'http://officina.internal:8080/segreto' }, data: '' } }];
  const fuori = await eseguiCodice(codiceNodo('sottopagine-da-leggere.js'), { input: scaricate, nodi: { Config: [CONFIG], 'Pagine da leggere': richieste } });
  assert.deepEqual(fuori.map((x) => x.json.url), [WEEBLY, `${EATBU}menu`, `${EATBU}contatti.html`]);
  const pochi = await eseguiCodice(codiceNodo('sottopagine-da-leggere.js'), { input: [html(HOME)], nodi: { Config: [{ json: { MAX_LETTURE: 2 } }], 'Pagine da leggere': voci([EATBU]) } });
  assert.deepEqual(pochi.map((x) => x.json.url), [`${EATBU}menu`]);
});

async function catenaNuova({ http1, http2 }) {
  const dall = await dallAD();
  const base = { Config: [CONFIG], 'Prepara la ricerca': [PREPARA()], "Dall'AD: la ricerca": [dall] };
  const scelte = await eseguiCodice(codiceNodo('pagine-da-leggere.js'), { input: [dall], nodi: base });
  const nodi = { ...base, 'Pagine da leggere': scelte, 'Scarica le pagine': http1(scelte) };
  const sotto = await eseguiCodice(codiceNodo('sottopagine-da-leggere.js'), { input: nodi['Scarica le pagine'], nodi });
  nodi['Sottopagine da leggere'] = sotto;
  if (sotto[0].json.leggi) nodi['Scarica le sottopagine'] = http2(sotto);
  const [messa] = await eseguiCodice(codiceNodo('metti-le-pagine.js'), { input: [{ json: {} }], nodi });
  return { dall, messa, nodi };
}
const SITI = {
  http1: (scelte) => scelte.map((x) => (x.json.url === EATBU ? html(HOME) : { json: { error: { message: 'getaddrinfo ENOTFOUND oradelgusto.weebly.com' } } })),
  http2: (sotto) => sotto.map((x) => (x.json.url.endsWith('/menu') ? html(MENU) : { json: { statusCode: 404, headers: {}, data: 'non trovata' } })),
};

test('Metti le pagine nella risposta: pagine lette come blocchi, testo accorciato negli appunti, avvisi sulle pagine perse', async () => {
  const { dall, messa } = await catenaNuova(SITI);
  const b = messa.json.body;
  assert.equal(messa.json.statusCode, 200);
  const blocchi = b.content.filter((x) => x.type === 'web_fetch_tool_result');
  assert.deepEqual(blocchi.map((x) => x.content.url), [EATBU, `${EATBU}menu`]);
  assert.match(blocchi[0].content.content.source.data, /Telefono: 0523 337635/);
  const testi = b.content.filter((x) => x.type === 'text').map((x) => x.text).join('');
  assert.ok(testi.startsWith(dall.json.body.content[0].text), 'gli appunti dell\'AD restano in testa');
  assert.match(testi, new RegExp(`--- PAGINA: ${EATBU.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ---\\n[\\s\\S]*Telefono: 0523 337635`));
  assert.match(testi, /Pagine che n8n non è riuscito a leggere: https:\/\/oradelgusto\.weebly\.com\/ \(getaddrinfo ENOTFOUND/);
  assert.equal(b.usage.server_tool_use.web_fetch_requests, 2);
  assert.ok(b.avvisi.some((a) => /^n8n: 2 pagine non si sono aperte: oradelgusto\.weebly\.com/.test(a)), JSON.stringify(b.avvisi));
  assert.deepEqual(b.pagine_da_n8n.lette, [EATBU, `${EATBU}menu`]);
});

test('Metti le pagine nella risposta: gli appunti restano sotto i 30.000 caratteri anche con pagine enormi', async () => {
  const enorme = `<p>${'Lorem ipsum dolor sit amet. '.repeat(4000)}</p>`;
  const { messa } = await catenaNuova({ http1: (s) => s.map(() => html(enorme)), http2: (s) => s.map(() => html(enorme)) });
  const testi = messa.json.body.content.filter((x) => x.type === 'text').map((x) => x.text).join('');
  assert.ok(Array.from(testi).length <= 30000, `appunti di ${Array.from(testi).length} caratteri`);
  for (const x of messa.json.body.content.filter((y) => y.type === 'web_fetch_tool_result')) assert.ok(x.content.content.source.data.length <= 30000);
});

test('Metti le pagine nella risposta: se l\'AD non ha risposto, o non c\'era niente da leggere, passa la risposta com\'era', async () => {
  const errore = { json: { statusCode: 503, body: { error: { type: 'ad', message: 'AD: tempo scaduto' } } } };
  const [a] = await eseguiCodice(codiceNodo('metti-le-pagine.js'), { nodi: { "Dall'AD: la ricerca": [errore] } });
  assert.deepEqual(a.json, errore.json);
  const dall = await dallAD();
  const [b] = await eseguiCodice(codiceNodo('metti-le-pagine.js'), { nodi: { "Dall'AD: la ricerca": [dall], 'Pagine da leggere': [{ json: { leggi: false, scartati: [] } }] } });
  assert.deepEqual(b.json, dall.json);
});

test('Metti le pagine nella risposta: un rinvio seguito non è una pagina persa', async () => {
  const dall = await dallAD();
  const nodi = { "Dall'AD: la ricerca": [dall], 'Pagine da leggere': voci(['http://oradelgusto.weebly.com/']),
    'Scarica le pagine': [{ json: { statusCode: 301, headers: { location: WEEBLY }, data: '' } }],
    'Sottopagine da leggere': voci([WEEBLY]), 'Scarica le sottopagine': [html(HOME)] };
  const [m] = await eseguiCodice(codiceNodo('metti-le-pagine.js'), { nodi });
  assert.deepEqual(m.json.body.pagine_da_n8n.non_lette, []);
  assert.deepEqual(m.json.body.pagine_da_n8n.lette, [WEEBLY]);
});

// ── l'anteprima e il compito ──────────────────────────────────────────────────────────────────────
const ANTEPRIMA = ['🔎 <b>Nuovo cliente: anteprima</b> · Ora del Gusto', 'Ricerche web: 0 · pagine lette: 2 · costo stimato 0,00 $', '',
  '• <b>telefono</b>: 0523 337635 — ✅ <i>oradelgusto…</i>', '', '🔸 Da confermare: orari',
  "Correggi nelle pagine del modulo che si aprono nel browser; nell'ultima pagina scegli Conferma o Annulla."].join('\n');

test("Ritocca l'anteprima: dice che la ricerca l'ha fatta l'AD e porta gli avvisi utili, prima dell'ultima riga", async () => {
  const { messa, dall } = await catenaNuova(SITI);
  const scheda = { json: { statusCode: 200, body: { content: [{ type: 'text', text: '{}' }], avvisi: ['Due indirizzi diversi: <chiedere>'] } } };
  const [r] = await eseguiCodice(codiceNodo('ritocca-anteprima.js'), { input: [{ json: { ok: true, messaggio_anteprima: ANTEPRIMA, campi: { x: 1 } } }],
    nodi: { "Dall'AD: la ricerca": [dall], 'Metti le pagine nella risposta': [messa], "Dall'AD: la scheda": [scheda] } });
  const m = r.json.messaggio_anteprima;
  assert.equal(r.json.campi.x, 1, 'il resto passa com\'è');
  assert.match(m, /^Ricerca sul web: fatta dall'AD · pagine lette da n8n: 2$/m);
  assert.doesNotMatch(m, /Ricerche web: 0|costo stimato/);
  const righe = m.split('\n');
  assert.match(righe[righe.length - 1], /^Correggi nelle pagine/);
  const avvisi = righe[righe.length - 2];
  assert.match(avvisi, /^ℹ️ /);
  assert.match(avvisi, /n8n: 2 pagine non si sono aperte/);
  assert.match(avvisi, /L'AD: Due indirizzi diversi per lo stesso nome/);
  assert.match(avvisi, /L'AD: Due indirizzi diversi: &lt;chiedere&gt;/);
  assert.doesNotMatch(avvisi, /vanno permessi nella rete/, 'con le pagine lette da n8n, la rete chiusa non è più un avviso');
});

test("Ritocca l'anteprima: senza pagine lette l'avviso sulla rete resta; senza l'AD non cambia niente; non supera i 3850 caratteri", async () => {
  const dall = await dallAD();
  const [a] = await eseguiCodice(codiceNodo('ritocca-anteprima.js'), { input: [{ json: { messaggio_anteprima: ANTEPRIMA } }], nodi: { "Dall'AD: la ricerca": [dall] } });
  assert.match(a.json.messaggio_anteprima, /vanno permessi nella rete/);
  const [b] = await eseguiCodice(codiceNodo('ritocca-anteprima.js'), { input: [{ json: { messaggio_anteprima: ANTEPRIMA } }] });
  assert.equal(b.json.messaggio_anteprima, ANTEPRIMA);
  const lungo = { ...dall.json, body: { ...dall.json.body, avvisi: Array.from({ length: 40 }, (_, i) => `avviso ${i} & ${'x'.repeat(150)}`) } };
  const pieno = ANTEPRIMA.replace('• <b>telefono</b>', `${'riga\n'.repeat(700)}• <b>telefono</b>`);
  const [c] = await eseguiCodice(codiceNodo('ritocca-anteprima.js'), { input: [{ json: { messaggio_anteprima: pieno } }], nodi: { "Dall'AD: la ricerca": [{ json: lungo }] } });
  assert.ok(Array.from(c.json.messaggio_anteprima).length <= 3850, String(Array.from(c.json.messaggio_anteprima).length));
  assert.doesNotMatch(c.json.messaggio_anteprima, /&[a-z]*…/, 'mai un\'entità HTML tagliata a metà');
});

test('Chiedi gli indirizzi delle pagine: una riga nel compito, una volta sola', async () => {
  const [a] = await eseguiCodice(codiceNodo('indirizzi-nel-compito.js'), { input: [{ json: { flusso: '12', compito: 'Sei il ricercatore.', dati: {} } }] });
  assert.match(a.json.compito, /^Sei il ricercatore\.\n\nLE PAGINE LE SCARICA n8n\n[\s\S]*«PAGINE DA LEGGERE:»/);
  const [b] = await eseguiCodice(codiceNodo('indirizzi-nel-compito.js'), { input: [a] });
  assert.equal(b.json.compito, a.json.compito);
  const [c] = await eseguiCodice(codiceNodo('indirizzi-nel-compito.js'), { input: [{ json: { compito: 'x', non_mandare: 'foto' } }] });
  assert.equal(c.json.compito, 'x');
});

// ── il montaggio nel flusso ───────────────────────────────────────────────────────────────────────
const nodo = (name, type = 'n8n-nodes-base.code') => ({ id: name, name, type, typeVersion: 2, position: [0, 0], parameters: {} });
const finto = () => ({ name: '11 · Nuovo cliente', nodes: ['Config', 'Prepara la ricerca', "Per l'AD: la ricerca", "Chiedi all'AD: la ricerca", "Dall'AD: la ricerca", 'Leggi la ricerca',
  'Controlla la proposta', 'Proposta pronta?'].map((n) => nodo(n)),
connections: {
  "Per l'AD: la ricerca": { main: [[{ node: "Chiedi all'AD: la ricerca", type: 'main', index: 0 }]] },
  "Chiedi all'AD: la ricerca": { main: [[{ node: "Dall'AD: la ricerca", type: 'main', index: 0 }]] },
  "Dall'AD: la ricerca": { main: [[{ node: 'Leggi la ricerca', type: 'main', index: 0 }]] },
  'Controlla la proposta': { main: [[{ node: 'Proposta pronta?', type: 'main', index: 0 }]] },
} });
const dove = (w, da) => (w.connections[da]?.main || []).map((r) => (r || []).map((c) => c.node));

test('montaggio: i nodi nuovi fra la ricerca e la sua lettura, e fra il controllo e l\'anteprima', () => {
  const prima = finto();
  const { flusso: w, modifiche } = aggiungiLettura(prima);
  assert.equal(prima.nodes.length, 8, "l'originale non si tocca");
  assert.equal(w.nodes.length, 8 + nodiNuovi().length);
  assert.ok(modifiche.length);
  assert.deepEqual(dove(w, "Per l'AD: la ricerca"), [[N.compito]]);
  assert.deepEqual(dove(w, N.compito), [["Chiedi all'AD: la ricerca"]]);
  assert.deepEqual(dove(w, "Dall'AD: la ricerca"), [[N.scegli]]);
  assert.deepEqual(dove(w, N.ci), [[N.scarica], [N.metti]]);
  assert.deepEqual(dove(w, N.ciSotto), [[N.scaricaSotto], [N.metti]]);
  assert.deepEqual(dove(w, N.scaricaSotto), [[N.metti]]);
  assert.deepEqual(dove(w, N.metti), [['Leggi la ricerca']]);
  assert.deepEqual(dove(w, 'Controlla la proposta'), [[N.ritocca]]);
  assert.deepEqual(dove(w, N.ritocca), [['Proposta pronta?']]);
  const scarica = w.nodes.find((n) => n.name === N.scarica);
  assert.equal(scarica.parameters.options.redirect.redirect.followRedirects, false, 'i rinvii non si seguono alla cieca');
  assert.equal(scarica.onError, 'continueRegularOutput');
  for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.code' && x.parameters.jsCode)) assert.doesNotMatch(n.parameters.jsCode, /__INDIRIZZI__|__TESTO__|__COMUNE__/);
  // Rilanciato: niente da cambiare. Con un nodo mancante o un collegamento diverso: si ferma.
  assert.deepEqual(aggiungiLettura(w).modifiche, []);
  const mezzo = structuredClone(w); mezzo.nodes = mezzo.nodes.filter((n) => n.name !== N.metti);
  assert.throws(() => aggiungiLettura(mezzo), /solo una parte/);
  const cambiato = finto(); cambiato.connections["Dall'AD: la ricerca"].main[0].push({ node: 'Altro', type: 'main', index: 0 });
  assert.throws(() => aggiungiLettura(cambiato), /è cambiato/);
});

test('il codice dei nodi non ha caratteri invisibili (si incolla anche a mano senza perderli)', () => {
  for (const n of nodiNuovi()) {
    const testoNodo = JSON.stringify(n.parameters);
    assert.doesNotMatch(testoNodo, /[\u00a0\u202f\u200b-\u200d\u2060\ufeff]/, n.name);
  }
});

test('montaggio: un flusso salvato da n8n (chiavi riordinate, spazi speciali come caratteri, id dei bivi nuovi) resta uguale', () => {
  const { flusso: w } = aggiungiLettura(finto());
  const comeN8n = structuredClone(w);
  const ordina = (v) => (Array.isArray(v) ? v.map(ordina) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().reverse().map((k) => [k, ordina(v[k])])) : v);
  for (const n of comeN8n.nodes) {
    n.parameters = ordina(n.parameters);
    if (n.parameters.jsCode) n.parameters.jsCode = n.parameters.jsCode.replace(/\\u00a0/g, '\u00a0').replace(/\\u202f/g, '\u202f');
    for (const c of n.parameters.conditions?.conditions || []) c.id = 'altro-id';
  }
  assert.ok(comeN8n.nodes.some((n) => /\u00a0/.test(n.parameters.jsCode || '')), 'la prova deve davvero avere uno spazio speciale vero');
  assert.deepEqual(aggiungiLettura(comeN8n).modifiche, []);
  // Ma una differenza vera si vede ancora.
  const cambiato = structuredClone(comeN8n);
  cambiato.nodes.find((n) => n.name === N.scarica).parameters.options.redirect.redirect.followRedirects = true;
  assert.deepEqual(aggiungiLettura(cambiato).modifiche, [`«${N.scarica}» aggiornato`]);
  assert.equal(ugualiNellaSostanza({ a: 'x\u00a0y' }, { a: 'x\\u00a0y' }), true);
  assert.equal(ugualiNellaSostanza({ a: 'x y' }, { a: 'x\\u00a0y' }), false);
});

test('montaggio: le operazioni a pezzi rifanno lo stesso flusso', () => {
  const prima = finto();
  const { flusso: dopo } = aggiungiLettura(prima);
  const ops = operazioni(prima, dopo);
  // Rigioca le operazioni come farebbe n8n e confronta collegamenti e nodi.
  const w = structuredClone(prima);
  for (const op of ops) {
    if (op.type === 'addNode') w.nodes.push({ ...op.node });
    else if (op.type === 'setNodeSettings') Object.assign(w.nodes.find((n) => n.name === op.nodeName), op.settings);
    else if (op.type === 'removeConnection') { const r = w.connections[op.source].main[op.sourceIndex]; r.splice(r.findIndex((c) => c.node === op.target), 1); }
    else if (op.type === 'addConnection') {
      const u = (w.connections[op.source] = w.connections[op.source] || { main: [] });
      while (u.main.length <= op.sourceIndex) u.main.push([]);
      u.main[op.sourceIndex].push({ node: op.target, type: 'main', index: op.targetIndex });
    } else throw new Error(`operazione inattesa ${op.type}`);
  }
  const ordina = (x) => JSON.stringify(Object.fromEntries(Object.entries(x.connections).sort().map(([k, v]) => [k, v.main.map((r) => r.map((c) => c.node).sort())])));
  assert.equal(ordina(w), ordina(dopo));
  assert.deepEqual(w.nodes.map((n) => n.name).sort(), dopo.nodes.map((n) => n.name).sort());
  assert.equal(w.nodes.find((n) => n.name === N.scarica).onError, 'continueRegularOutput');
});

// ── sul codice VERO del 12 (con FLUSSO_12) ───────────────────────────────────────────────────────
const FILE_12 = process.env.FLUSSO_12;
const vero = FILE_12 && existsSync(FILE_12) ? (() => { const x = JSON.parse(readFileSync(FILE_12, 'utf8')); return x.workflow || x; })() : null;

test('sul 12 vero: con la catena vecchia ogni dato del web è «non trovato», con quella nuova il telefono e l\'indirizzo sono confermati', { skip: vero ? false : 'FLUSSO_12 non indicato: prova sul codice vero saltata' }, async () => {
  const js = (nome) => vero.nodes.find((n) => n.name === nome).parameters.jsCode;
  const cfg = Object.fromEntries(vero.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments.map((a) => [a.name, a.value]));
  const base = { prova: false, modalita: 'nuovo', chiave: '', cerca_web: true, richiesta: { nome: 'Ora del Gusto', citta: 'Piacenza', sito: '' },
    incollati: { scheda_google: '', pagina_facebook: '', appunti: 'Arrivata da MyCity: si è iscritta come attività sul marketplace.' },
    foto: [], uso_iniziale: { input: 0, output: 0, cache_scrittura: 0, cache_lettura: 0, ricerche: 0, letture: 0 }, avvisi_ingresso: [],
    corpo: { model: 'claude-sonnet-5-5', messages: [{ role: 'user', content: 'cerca' }] } };
  const nodiBase = { Config: [{ json: cfg }], 'Prepara la ricerca': [{ json: base }] };
  const dall = (await eseguiCodice(js("Dall'AD: la ricerca"), { input: [{ json: RISPOSTA_AD }] }))[0];
  // La scheda che l'AD scrive leggendo le pagine: la stessa per le due catene.
  const scheda = { campi: [
    { campo: 'telefono', valore: '0523 337635', fonte: EATBU, citazione: 'Telefono: 0523 337635', altre_fonti: [] },
    { campo: 'indirizzo', valore: "Viale Sant'Ambrogio 6, 29121 Piacenza", fonte: EATBU, citazione: "Viale Sant'Ambrogio 6, 29121 Piacenza", altre_fonti: [] },
    { campo: 'tono_di_voce', valore: 'cordiale e semplice', fonte: 'proposta', citazione: '', altre_fonti: [] },
  ], sito_ufficiale: EATBU, frasi_da_verificare: [], analisi: ['tipo: bar caffetteria'] };
  const dallScheda = (await eseguiCodice(js("Dall'AD: la scheda"), { input: [{ json: { ok: true, flusso: '12', risultato: scheda, avvisi: [] } }] }))[0];
  const foglio = { json: { values: [['cliente', 'nome_locale', 'attivo', 'indirizzo', 'telefono', 'campi_da_confermare']] } };
  const controlla = async (letta) => (await eseguiCodice(js('Controlla la proposta'), { input: [dallScheda],
    nodi: { ...nodiBase, 'Leggi la ricerca': [letta], 'Leggi il foglio Clienti': [foglio] } }))[0].json;

  // Catena vecchia: «Dall'AD: la ricerca» → «Leggi la ricerca».
  const lettaVecchia = (await eseguiCodice(js('Leggi la ricerca'), { input: [dall], nodi: nodiBase }))[0];
  const vecchia = await controlla(lettaVecchia);
  assert.equal(vecchia.campi.telefono.stato, 'non_trovata', JSON.stringify(vecchia.campi.telefono));
  assert.equal(vecchia.campi.indirizzo.stato, 'non_trovata');

  // Catena nuova: «Dall'AD: la ricerca» → lettura delle pagine → «Leggi la ricerca».
  const { messa, nodi } = await catenaNuova(SITI);
  const lettaNuova = (await eseguiCodice(js('Leggi la ricerca'), { input: [messa], nodi: nodiBase }))[0];
  assert.equal(lettaNuova.json.ok, true, lettaNuova.json.motivo_stop);
  assert.match(lettaNuova.json.corpo2.messages[0].content, /--- PAGINA: https:\/\/oradelgusto[\s\S]*Telefono: 0523 337635/, "l'AD della scheda vede il testo delle pagine");
  const nuova = await controlla(lettaNuova);
  assert.equal(nuova.campi.telefono.stato, 'confermato', JSON.stringify(nuova.campi.telefono));
  assert.equal(nuova.campi.indirizzo.stato, 'confermato', JSON.stringify(nuova.campi.indirizzo));
  assert.equal(nuova.campi.telefono.valore, '0523 337635');

  // La richiesta della scheda all'AD sta nei 64 KB della routine.
  const lavoro = (await eseguiCodice(js("Per l'AD: la scheda"), { input: [lettaNuova] }))[0].json;
  const byte = Buffer.byteLength(JSON.stringify({ ...lavoro, rispondi_a: 'https://n8n-shdy.sliplane.app/webhook-waiting/99999?signature=' + 'a'.repeat(64) }), 'utf8');
  assert.ok(byte < 65536 - 512, `richiesta della scheda di ${byte} byte`);

  // L'anteprima finale.
  const [r] = await eseguiCodice(codiceNodo('ritocca-anteprima.js'), { input: [{ json: nuova }], nodi: { ...nodi, 'Metti le pagine nella risposta': [messa], "Dall'AD: la scheda": [dallScheda] } });
  assert.match(r.json.messaggio_anteprima, /Ricerca sul web: fatta dall'AD · pagine lette da n8n: 2/);
  assert.match(r.json.messaggio_anteprima, /telefono<\/b>: 0523 337635 — ✅/);
});
