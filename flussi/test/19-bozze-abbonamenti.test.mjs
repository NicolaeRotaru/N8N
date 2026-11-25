// Le prove del 19 · Bozze dei 3 abbonamenti: la richiesta, le bozze, il listino uguale al sito, il flusso
// costruito e la sua traduzione in codice SDK. Dati finti, costruiti qui.
// Si lancia con: node --test "flussi/test/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { eseguiCodice } from './esegui-codice.mjs';
import { costruisci, controlla, NOME_19, PER_L_ARGOMENTO, SCRIVI } from '../19-bozze-abbonamenti/costruisci.mjs';
import { inSdk } from '../in-sdk.mjs';

const leggi = (nome) => readFileSync(new URL(`../19-bozze-abbonamenti/codice/${nome}`, import.meta.url), 'utf8');
const RICHIESTA = leggi('leggi-richiesta.js');
const BOZZE = leggi('prepara-bozze.js');

const ID = '8e1f3c2a-1111-4222-8333-944455556666';
const risposta = (righe, totale = righe.length) => [{ json: { statusCode: 200, headers: { 'content-range': `0-${Math.max(righe.length - 1, 0)}/${totale}` }, body: righe } }];
const guasto = () => [{ json: { statusCode: 401, headers: {}, body: { message: 'Invalid API key' } } }];
const SCHEDA = { tipo_di_locale: 'bar con colazioni', pubblico: 'impiegati del centro', tono_consigliato: 'cordiale', punti_di_forza: ['brioche fatte in casa'],
  idee_contenuti: ['la colazione delle 7'], cosa_chiedere_al_titolare: ['a che ora apre la domenica?'], dubbi: [], da_confermare: ['orari'] };
const PRIVATI = /IBAN|codice fiscale|legal_|Mario Rossi|333 1234567/i;

// --- La richiesta -------------------------------------------------------------------------------

test('la richiesta arriva dal 18, dal 16 o dal webhook, e si accetta solo un identificativo vero', async () => {
  const da18 = await eseguiCodice(RICHIESTA, { nodi: { 'Da un altro flusso': [{ json: { valida: true, id: ID.toUpperCase(), nome: 'Bar Roma', origine: 'iscrizione su MyCity',
    scheda: { ...SCHEDA, punti_di_forza: ['a', 'b', 'c', 'd', 'e'] } } }] } });
  assert.equal(da18[0].json.valida, true);
  assert.equal(da18[0].json.id, ID);
  assert.equal(da18[0].json.scheda.punti_di_forza.length, 4, 'la scheda piatta del 18 si legge e si accorcia');
  assert.equal(da18[0].json.scheda.tono_consigliato, 'cordiale');
  const comeIl16 = await eseguiCodice(RICHIESTA, { nodi: { 'Da un altro flusso': [{ json: { id: ID, nome: 'Bar Roma',
    scheda: { analisi: { tipo_di_locale: 'bar', idee_contenuti: ['x'] }, da_confermare: ['orari'] } } }] } });
  assert.equal(comeIl16[0].json.scheda.tipo_di_locale, 'bar', 'la scheda con «analisi» dentro si legge');
  assert.deepEqual(comeIl16[0].json.scheda.da_confermare, ['orari']);
  const daWebhook = await eseguiCodice(RICHIESTA, { nodi: { 'Su richiesta': [{ json: { headers: {}, body: { id: ID } } }] } });
  assert.equal(daWebhook[0].json.valida, true);
  assert.equal(daWebhook[0].json.origine, 'su richiesta');
  assert.equal(daWebhook[0].json.scheda, null);
  for (const sbagliato of [`${ID}&select=legal_fiscal_code`, 'abc', '', `${ID},role.eq.admin`]) {
    const r = await eseguiCodice(RICHIESTA, { nodi: { 'Su richiesta': [{ json: { body: { id: sbagliato } } }] } });
    assert.equal(r[0].json.valida, false, sbagliato);
  }
  const diSistema = await eseguiCodice(RICHIESTA, { nodi: { 'Su richiesta': [{ json: { body: { id: '11111111-1111-1111-1111-000000000002' } } }] } });
  assert.equal(diSistema[0].json.valida, false, 'SDG Agenzia e il negozio MyCity non sono clienti');
});

// --- Le bozze -------------------------------------------------------------------------------------

// Una risposta già fatta (risposta() o guasto()) passa com'è; righe semplici diventano una risposta.
const giaPronta = (v) => Array.isArray(v) && v.length > 0 && v[0] && typeof v[0] === 'object' && 'json' in v[0];
function negozio({ attivita = {}, prodotti = [{ images: [] }, { images: ['a'] }, { images: [] }], agenzia = { nome: 'MyCity' }, scheda = SCHEDA } = {}) {
  return {
    'Leggi la richiesta': [{ json: { valida: true, id: ID, nome: 'Bar Roma', origine: 'iscrizione su MyCity', scheda } }],
    "Leggi l'attività": attivita === null ? risposta([]) : risposta([{ id: ID, role: 'seller', approval_status: 'pending', store_name: 'Bar Roma', store_media: [],
      store_customization: { socials: { instagram: 'barroma' } }, business_type: 'bar', ...attivita }]),
    'Leggi i suoi prodotti': giaPronta(prodotti) ? prodotti : risposta(prodotti),
    'Leggi i canoni del sito': giaPronta(agenzia) ? agenzia : risposta([{ agenzia }]),
  };
}
const bozze = async (nodi) => (await eseguiCodice(BOZZE, { nodi })).map((x) => x.json.messaggio);
const dentro = (m) => (/<pre>([\s\S]*)<\/pre>/.exec(m) || [, ''])[1];
function tagGiusti(m) {
  for (const t of ['b', 'i', 'pre']) assert.equal((m.match(new RegExp(`<${t}>`, 'g')) || []).length, (m.match(new RegExp(`</${t}>`, 'g')) || []).length, `tag <${t}> aperti e chiusi: ${m.slice(0, 60)}`);
}

test('un bar senza foto né sito: quattro messaggi, il Business consigliato, i numeri veri della vetrina', async () => {
  const m = await bozze(negozio());
  assert.equal(m.length, 4, 'riepilogo + Base + Business + Premium');
  assert.match(m[0], /Consigliato: ⭐ <b>Business<\/b>/);
  assert.match(m[0], /Prodotti in catalogo: 3, senza foto: 2/);
  assert.match(m[1], /^<b>Bozza Base<\/b> · 300 € al mese, primo mese 150 €/);
  assert.match(m[2], /^⭐ <b>Bozza Business<\/b> · 500 € al mese, primo mese 250 €/);
  assert.match(m[3], /^<b>Bozza Premium<\/b> · 999 € al mese, primo mese 499,50 €/);
  assert.match(dentro(m[1]), /i prodotti principali fra i 2 senza foto/, 'il Base fotografa i prodotti principali, come dice il listino');
  assert.match(dentro(m[2]), /i tuoi 2 prodotti senza foto/);
  assert.doesNotMatch(dentro(m[1]), /Si parte con un video/, 'il video al mese non è nel Base');
  assert.match(dentro(m[2]), /un video del bancone e delle colazioni/);
  assert.match(dentro(m[1]), /8 post al mese/);
  assert.match(dentro(m[2]), /12 post al mese/);
  assert.match(dentro(m[3]), /20 post al mese/);
  assert.match(dentro(m[1]), /Oggi non hai un sito tutto tuo/);
  assert.match(dentro(m[2]), /circa 17 € al giorno: l’incasso di 6 colazioni/, 'il pareggio come sul sito: 500 € / 30 giorni / colazione da 3 €');
  assert.match(dentro(m[1]), /disdici quando vuoi, con 30 giorni di preavviso/);
  for (const x of m) { tagGiusti(x); assert.ok(x.length <= 3900, 'sta in un messaggio di Telegram'); assert.doesNotMatch(x, PRIVATI); }
});

test('solo frasi vere: con foto, video e sito non si parla di quello che c\'è già, e il Base è il consigliato', async () => {
  const m = await bozze(negozio({
    attivita: { store_media: [1, 2, 3].map((n) => ({ type: 'image', url: `https://x/${n}.jpg` })).concat({ type: 'video', url: 'https://x/v.mp4' }),
      store_customization: { socials: { website: 'https://barroma.it', google_maps: 'https://maps.google.com/x', instagram: 'barroma' } } },
    prodotti: [{ images: ['a'] }, { images: ['b'] }], scheda: null }));
  assert.match(m[0], /Consigliato: ⭐ <b>Base<\/b>/);
  for (const x of m.slice(1)) {
    const t = dentro(x);
    assert.doesNotMatch(t, /senza foto|copertina \(|Oggi non hai un sito|Si parte con un video/, 'niente lavori su quello che c\'è già');
    assert.match(t, /ci mettiamo dentro il sito che hai già/);
    assert.match(t, /Partiamo da Instagram, la scheda Google e il sito/);
    assert.doesNotMatch(t, /quello che si dice di voi|idee come/, 'senza ricerca sul web niente punti di forza né idee');
  }
  assert.match(m[0], /La scheda della ricerca sul web non è arrivata/);
});

test('un catalogo da 150 prodotti va sul Premium', async () => {
  const tanti = Array.from({ length: 150 }, () => ({ images: ['a'] }));
  const m = await bozze(negozio({ prodotti: risposta(tanti) }));
  assert.match(m[0], /Consigliato: ⭐ <b>Premium<\/b>, perché ha 150 prodotti/);
  assert.match(m[3], /^⭐ <b>Bozza Premium<\/b>/);
});

test('i canoni si leggono dalle impostazioni del sito, con le stesse regole del sito', async () => {
  const m = await bozze(negozio({ agenzia: { abbonamenti: { base: 25000, business: 300, premium: null } } }));
  assert.match(m[1], /250 € al mese, primo mese 125 €/, 'un canone valido scritto da Nicola vale');
  assert.match(m[2], /canone su richiesta/, 'un canone in euro invece che in centesimi diventa «su richiesta», mai «3,00 €»');
  assert.match(dentro(m[2]), /su richiesta/);
  assert.doesNotMatch(dentro(m[2]), /Per ripagarlo/);
  assert.match(m[3], /canone su richiesta/);
  assert.match(m[0], /il canone è «su richiesta»/);
  const senza = await bozze(negozio({ agenzia: guasto() }));
  assert.match(senza[1], /300 € al mese/, 'impostazioni illeggibili: il listino, e lo dice');
  assert.match(senza[0], /I canoni sono quelli del listino: le impostazioni del sito non si leggono \(risposta 401\)/);
});

test('una lettura che si guasta non diventa un numero inventato', async () => {
  const m = await bozze(negozio({ prodotti: guasto() }));
  assert.match(m[0], /Prodotti in catalogo: non misurato/);
  assert.match(m[0], /I prodotti non si sono letti/);
  for (const x of m.slice(1)) assert.doesNotMatch(dentro(x), /senza foto/);
  const nessuna = await bozze(negozio({ attivita: null }));
  assert.equal(nessuna.length, 1);
  assert.match(nessuna[0], /Bozze non fatte.*\nMotivo: l'attività non c'è nel database di MyCity/);
  const illeggibile = await bozze({ ...negozio(), "Leggi l'attività": guasto() });
  assert.match(illeggibile[0], /la scheda dell'attività non si legge \(risposta 401\)/);
});

test('i testi del web e del titolare arrivano protetti, e il riepilogo lungo si accorcia senza rompere l\'HTML', async () => {
  const lungo = 'x'.repeat(200);
  const m = await bozze(negozio({ attivita: { store_name: 'Bar <Roma> & Co' },
    scheda: { ...SCHEDA, punti_di_forza: [`<b>${lungo}`, lungo, lungo, lungo], cosa_chiedere_al_titolare: Array(5).fill(lungo), dubbi: Array(4).fill(lungo),
      tipo_di_locale: lungo, pubblico: lungo, tono_consigliato: lungo.slice(0, 120) } }));
  assert.match(m[0], /Bar &lt;Roma&gt; &amp; Co/);
  assert.doesNotMatch(m.join('\n'), /<b>x/, 'un tag scritto nel web non diventa HTML');
  for (const x of m) { tagGiusti(x); assert.ok(x.length <= 3900, `messaggio di ${x.length} caratteri`); }
  assert.match(m[0], /Prima di mandare/, 'i controlli per Nicola restano anche quando si accorcia');
});

// --- Il listino è quello del sito -------------------------------------------------------------------

const SITO = process.env.MYCITY_REPO ? `${process.env.MYCITY_REPO}/lib/agenzia/preventivo.ts`
  : new URL('../../../mycity/lib/agenzia/preventivo.ts', import.meta.url).pathname;

test('il listino copiato nel 19 è parola per parola quello del sito', { skip: existsSync(SITO) ? false : `il sito non è qui accanto (${SITO}): prova saltata` }, () => {
  const sito = readFileSync(SITO, 'utf8');
  const listino = /\/\/ LISTINO-INIZIO[\s\S]*?\/\/ LISTINO-FINE/.exec(BOZZE)[0];
  const testi = [...listino.matchAll(/'([^'\n]{15,})'/g)].map((x) => x[1]);
  assert.ok(testi.length >= 20, 'il listino ha i suoi testi');
  for (const t of testi) assert.ok(sito.includes(t), `sul sito non c'è più: «${t}»`);
  const conTrattino = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '_');
  for (const [f, centesimi] of [...listino.matchAll(/(\w+): \{\n\s+nome: '\w+',\n\s+prezzoMese: (\d+)/g)].map((x) => [x[1], x[2]])) {
    assert.match(sito, new RegExp(`${f}: \\{\\s+nome: '\\w+',\\s+prezzoMese: ${conTrattino(centesimi)},`), `il canone del ${f} è cambiato sul sito`);
  }
  for (const [tipo, centesimi] of [...listino.matchAll(/(\w+): \{ centesimi: (\d+)/g)].map((x) => [x[1], x[2]])) {
    assert.match(sito, new RegExp(`${tipo}: \\{ centesimi: ${conTrattino(centesimi)},`), `lo scontrino di partenza del tipo ${tipo} è cambiato sul sito`);
  }
  assert.match(sito, /SERVIZI_AGENZIA = \['foto_video', 'sito_web', 'social', 'analisi'\] as const/, 'i servizi del sito sono cambiati');
  assert.match(sito, /ABBONAMENTI = \['base', 'business', 'premium'\] as const/, 'gli abbonamenti del sito sono cambiati');
  assert.match(sito, /FOTO_LOCALE_CONSIGLIATE = 3;/);
  assert.match(sito, /PRODOTTI_PER_IL_PREMIUM = 150;/);
  assert.match(sito, /preavvisoGiorni: 30,/);
  assert.match(sito, /primoMeseFrazione: 0\.5,/);
});

// --- Il flusso costruito --------------------------------------------------------------------------

const PEZZI = { telegram: { id: 'tg', name: 'Telegram - Bot agenzia' }, chatId: '123', marketplace: 'sb', segreto: 'hd' };

test('il flusso costruito è a posto, e i controlli fermano chi scrive a qualcun altro', () => {
  const w = costruisci(PEZZI);
  assert.equal(w.name, NOME_19);
  assert.deepEqual(controlla(w), []);
  assert.ok(controlla(costruisci()).some((p) => /credenziale/.test(p)), 'senza credenziali lo dice');
  const sm = (fn) => { const x = costruisci(PEZZI); fn(x); return controlla(x); };
  assert.ok(sm((x) => x.nodes.push({ name: 'Manda al titolare', type: 'n8n-nodes-base.whatsApp', parameters: {} })).some((p) => /whatsApp/.test(p)));
  assert.ok(sm((x) => { x.nodes.find((n) => n.name === 'Manda a Nicola').parameters.chatId = '999'; }).some((p) => /chat che non è quella di Nicola/.test(p)));
  assert.ok(sm((x) => { x.nodes.find((n) => n.name === 'Leggi i suoi prodotti').parameters.method = 'POST'; }).some((p) => /non è una lettura/.test(p)));
  assert.ok(sm((x) => { x.nodes.find((n) => n.name === 'Leggi i suoi prodotti').parameters.url = 'https://api.anthropic.com/v1/messages'; }).some((p) => /non è il database/.test(p)));
  assert.ok(sm((x) => { const n = x.nodes.find((y) => y.name === "Leggi l'attività"); n.parameters.url += ',legal_fiscal_code'; }).some((p) => /dati personali/.test(p)));
  const webhook = w.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
  assert.equal(webhook.parameters.authentication, 'headerAuth');
  // Il riepilogo e le tre bozze partono uno per uno: il nodo di Telegram legge il messaggio di ogni voce.
  assert.equal(w.nodes.find((n) => n.name === 'Manda a Nicola').parameters.text, '={{ $json.messaggio }}');
  assert.equal(w.connections['Richiesta valida?'].main[1][0].node, 'Avvisa: richiesta scartata');
});

test('la traduzione in codice SDK porta ogni nodo e ogni collegamento', () => {
  const w = costruisci(PEZZI);
  const codice = inSdk(w);
  assert.equal((codice.match(/= (node|trigger)\(/g) || []).length, w.nodes.length - 1, 'un nodo SDK per ogni nodo, tranne la nota');
  assert.equal((codice.match(/= sticky\(/g) || []).length, 1);
  assert.equal((codice.match(/= trigger\(/g) || []).length, 2, 'i due modi di partire');
  const collegamenti = Object.values(w.connections).flatMap((u) => u.main.flat()).length;
  assert.equal((codice.match(/\.to\(/g) || []).length, collegamenti);
  assert.match(codice, /\.output\(1\)\.to\(/, 'il ramo «no» dell\'if esce dalla seconda uscita');
  assert.match(codice, /export default workflow\(/);
  assert.ok(codice.includes(JSON.stringify(leggi('prepara-bozze.js'))), 'il codice del nodo passa intero');
});

// --- Le bozze nell'argomento del negozio (flusso 97) e gli scarti in Tecnica ---------------------

test("col 20 le bozze vanno nell'argomento del negozio, col suo nome; gli scarti vanno in Tecnica", async () => {
  const w = costruisci({ ...PEZZI, argomento: 'id20' });
  assert.deepEqual(controlla(w), []);
  assert.equal(w.nodes.find((n) => n.name === 'Manda a Nicola'), undefined);
  assert.equal(w.connections['Prepara le bozze'].main[0][0].node, PER_L_ARGOMENTO);
  assert.equal(w.connections[PER_L_ARGOMENTO].main[0][0].node, SCRIVI);
  assert.equal(w.nodes.find((n) => n.name === SCRIVI).parameters.workflowId.value, 'id20');
  const per = w.nodes.find((n) => n.name === PER_L_ARGOMENTO).parameters.jsCode;
  const out = await eseguiCodice(per, { input: [{ json: { messaggio: 'riepilogo' } }, { json: { messaggio: 'Base' } }], nodi: {
    'Leggi la richiesta': [{ json: { id: ID, nome: '' } }], "Leggi l'attività": risposta([{ store_name: 'Ora del Gusto' }]) } });
  assert.deepEqual(out.map((x) => x.json), [{ id: ID, nome: 'Ora del Gusto', messaggio: 'riepilogo' }, { id: ID, nome: 'Ora del Gusto', messaggio: 'Base' }]);
  const scarto = w.nodes.find((n) => n.name === 'Avvisa: richiesta scartata');
  assert.match(scarto.parameters.chatId, /CHAT_TECNICA \|\| \$\('Config'\)\.first\(\)\.json\.TELEGRAM_CHAT_ID/);
  const sm = (fn) => { const x = costruisci({ ...PEZZI, argomento: 'id20' }); fn(x); return controlla(x); };
  assert.ok(sm((x) => { x.nodes.find((n) => n.name === SCRIVI).name = 'Chiama un altro flusso'; x.connections[PER_L_ARGOMENTO].main[0][0].node = 'Chiama un altro flusso'; }).some((p) => /non è il 97/.test(p)));
});
