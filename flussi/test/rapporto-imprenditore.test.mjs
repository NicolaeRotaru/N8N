// Le prove del rapporto dell'imprenditore (flusso 26, 26/11/2026): i fatti dalle fonti, i freni delle fonti a pagamento,
// le sezioni nuove dell'AD e il lavoro per «Chiedi all'AD» sotto i 64 KB. Contratto: 16-nuovo-cliente-da-mycity/CONTRATTO-RAPPORTO.md.
// Girano senza n8n e senza rete: il codice dei nodi si esegue su risposte finte delle fonti.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCodice } from './esegui-codice.mjs';
import {
  CODICE_FATTI_PREPARA, CODICE_FATTI_POSIZIONE, CODICE_FATTI_COMPONI, CODICE_FATTI_CONCORRENTI, CODICE_FATTI_PROFILI_CONCORRENTI,
  FONTI_A_PAGAMENTO, FONTI_RADAR, N, USER_AGENT, nodiFatti, controllaFatti, vociConfig,
} from '../16-nuovo-cliente-da-mycity/fatti.mjs';
import { CODICE_PREPARA_BUSINESS, CODICE_UNISCI_BUSINESS, CODICE_SCHEDA_SITO, CODICE_RICHIESTA } from '../16-nuovo-cliente-da-mycity/genera.mjs';

const LAT = 45.0526;
const LON = 9.693;
const modulo = (extra = {}) => ({ nome_locale: 'Bar Roma', citta: 'Piacenza', tipo_dichiarato: 'bar o caffetteria', indirizzo_dichiarato: 'Via Roma 1, 29121 Piacenza',
  lat_dichiarata: null, lon_dichiarata: null, sito: 'https://www.barroma.it', appunti: '', ...extra });
const configBase = (extra = {}) => Object.fromEntries([...vociConfig(), ['MODALITA', 'prova'], ...Object.entries(extra)]);

async function prepara({ cfg = {}, f = {}, statico = {}, nodi = {} } = {}) {
  const [{ json }] = await eseguiCodice(CODICE_FATTI_PREPARA, { input: [{ json: { id: 'x', nome: 'Bar Roma' } }], statico,
    nodi: { Config: [{ json: configBase(cfg) }], 'Modulo nuovo cliente': [{ json: modulo(f) }], ...nodi } });
  return json;
}

// --- I FRENI DELLE FONTI A PAGAMENTO: con la voce a «no» o la credenziale finta non parte nessuna chiamata -----------------

test('freni: di serie nessuna fonte a pagamento parte (voci «no», credenziali «finte»)', async () => {
  const cfg = configBase();
  for (const f of Object.values(FONTI_A_PAGAMENTO)) { assert.equal(cfg[f.voce], 'no'); assert.equal(cfg[f.stato], 'finta'); }
  const j = await prepara();
  assert.deepEqual(j.fatti_piano.chiama, { google: false, tripadvisor: false, dataforseo: false, instagram: false });
  assert.match(j.fatti_piano.spente.google.motivo, /FONTE_GOOGLE = no/);
});

test('freni: voce a «si» ma credenziale finta → niente chiamata', async () => {
  const j = await prepara({ cfg: { FONTE_GOOGLE: 'si', FONTE_DATAFORSEO: 'si', FONTE_TRIPADVISOR: 'si', FONTE_INSTAGRAM: 'si' } });
  assert.deepEqual(j.fatti_piano.chiama, { google: false, tripadvisor: false, dataforseo: false, instagram: false });
  assert.match(j.fatti_piano.spente.dataforseo.motivo, /credenziale finta/);
});

test('freni: credenziale collegata ma voce «no» → niente chiamata', async () => {
  const j = await prepara({ cfg: { CREDENZIALE_GOOGLE: 'collegata', CREDENZIALE_DATAFORSEO: 'collegata' } });
  assert.equal(j.fatti_piano.chiama.google, false);
  assert.equal(j.fatti_piano.chiama.dataforseo, false);
});

test('freni: voce «si» e credenziale collegata → parte, e si conta; al tetto del giorno si ferma', async () => {
  const statico = {};
  const cfg = { FONTE_GOOGLE: 'si', CREDENZIALE_GOOGLE: 'collegata', TETTO_GOOGLE_GIORNO: 2 };
  assert.equal((await prepara({ cfg, statico })).fatti_piano.chiama.google, true);
  assert.equal((await prepara({ cfg, statico })).fatti_piano.chiama.google, true);
  const terza = await prepara({ cfg, statico });
  assert.equal(terza.fatti_piano.chiama.google, false);
  assert.match(terza.fatti_piano.spente.google.motivo, /tetto del giorno/);
  assert.equal(statico.fonti_rapporto.chiamate.google, 2, 'una corsa fermata non si conta');
});

test('freni: TripAdvisor solo per bar, ristoranti e hotel; Instagram solo con il profilo e l\'account di MyCity', async () => {
  const cfg = { FONTE_TRIPADVISOR: 'si', CREDENZIALE_TRIPADVISOR: 'collegata', FONTE_INSTAGRAM: 'si', CREDENZIALE_INSTAGRAM: 'collegata' };
  const ferramenta = await prepara({ cfg, f: { tipo_dichiarato: 'ferramenta' } });
  assert.equal(ferramenta.fatti_piano.chiama.tripadvisor, false);
  assert.match(ferramenta.fatti_piano.spente.tripadvisor.motivo, /solo per bar/);
  assert.equal((await prepara({ cfg })).fatti_piano.chiama.tripadvisor, true);
  assert.match((await prepara({ cfg })).fatti_piano.spente.instagram.motivo, /profilo Instagram/);
  const corpus = { 'Leggi la ricerca': [{ json: { corpus: { pagine: { a: { url: 'https://www.barroma.it/', testo: 'Seguici su instagram.com/bar_roma_pc' } } } } }] };
  assert.match((await prepara({ cfg, nodi: corpus })).fatti_piano.spente.instagram.motivo, /INSTAGRAM_ID_MYCITY/);
  const ok = await prepara({ cfg: { ...cfg, INSTAGRAM_ID_MYCITY: '17841400000000000' }, nodi: corpus });
  assert.equal(ok.fatti_piano.chiama.instagram, true);
  assert.equal(ok.fatti_piano.profilo_instagram, 'bar_roma_pc');
});

test('freni nel flusso: ogni chiamata a pagamento è spenta con la credenziale finta, e si arriva solo dal sì del suo IF coi tre freni', () => {
  const { nodi, collegamenti } = nodiFatti([0, 0]);
  const w = { nodes: [{ name: 'Config', parameters: { assignments: { assignments: vociConfig().map(([name, value]) => ({ name, value })) } } }, ...nodi], connections: collegamenti };
  assert.deepEqual(controllaFatti(w), []);
  for (const f of Object.values(FONTI_A_PAGAMENTO)) for (const n of f.nodi) {
    const nodo = nodi.find((x) => x.name === n);
    assert.equal(nodo.disabled, true, `${n} deve essere spento`);
    assert.equal(nodo.credentials, undefined, `${n} senza credenziale`);
  }
});

test('freni nel flusso: se qualcuno toglie un freno, il controllo lo vede (rosso)', () => {
  const base = () => { const { nodi, collegamenti } = nodiFatti([0, 0]); return { nodes: [{ name: 'Config', parameters: { assignments: { assignments: vociConfig().map(([name, value]) => ({ name, value })) } } }, ...nodi], connections: collegamenti }; };
  // 1. Google collegato direttamente, senza passare dall'IF.
  const a = base();
  a.connections[N.scaricaRadar] = { main: [[{ node: N.google, type: 'main', index: 0 }]] };
  assert.ok(controllaFatti(a).some((p) => /senza i freni di google/.test(p)));
  // 2. L'IF non controlla più la voce del Config.
  const b = base();
  b.nodes.find((n) => n.name === N.ifDataforseo).parameters.conditions.conditions[0].leftValue = '={{ true }}';
  assert.ok(controllaFatti(b).some((p) => /freni di dataforseo/.test(p)));
  // 3. Un nodo acceso con la credenziale finta.
  const c = base();
  delete c.nodes.find((n) => n.name === N.instagram).disabled;
  assert.ok(controllaFatti(c).some((p) => /acceso con la credenziale finta/.test(p)));
  // 4. A Google si chiede più del place_id.
  const d = base();
  d.nodes.find((n) => n.name === N.google).parameters.headerParameters.parameters[0].value = 'places.id,places.rating';
  assert.ok(controllaFatti(d).some((p) => /più del place_id/.test(p)));
  // 5. Una chiamata a Google in più, fuori dalla sua fonte.
  const e = base();
  e.nodes.push({ name: 'Furbo', type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://places.googleapis.com/v1/places:searchNearby' } });
  assert.ok(controllaFatti(e).some((p) => /fuori dal loro IF|solo OpenStreetMap/.test(p)));
});

test('con la credenziale vera il nodo è acceso e collegato; --fonti-accese mette «si» solo dove c\'è la credenziale, TripAdvisor mai', () => {
  const credenziali = { google: 'cred-g', tripadvisor: 'cred-t' };
  const { nodi } = nodiFatti([0, 0], { credenziali });
  const g = nodi.find((n) => n.name === N.google);
  assert.equal(g.disabled, undefined);
  assert.deepEqual(g.credentials, { httpHeaderAuth: { id: 'cred-g', name: 'Rapporto - Google Places (chiave)' } });
  const cfg = Object.fromEntries(vociConfig({ credenziali, accese: ['google', 'tripadvisor', 'dataforseo'] }));
  assert.equal(cfg.FONTE_GOOGLE, 'si');
  assert.equal(cfg.FONTE_TRIPADVISOR, 'no');
  assert.equal(cfg.FONTE_DATAFORSEO, 'no', 'senza credenziale vera resta spenta');
  assert.equal(cfg.CREDENZIALE_GOOGLE, 'collegata');
  assert.equal(cfg.CREDENZIALE_DATAFORSEO, 'finta');
});

test('le fonti gratis si presentano con un nome di programma generico; OpenStreetMap una richiesta al secondo; meteo da MET Norway', () => {
  const { nodi } = nodiFatti([0, 0]);
  const http = nodi.filter((n) => n.type === 'n8n-nodes-base.httpRequest' && !n.disabled);
  for (const n of [N.nominatim, N.overpass, N.meteo, N.scaricaRadar]) {
    const ua = nodi.find((x) => x.name === n).parameters.headerParameters.parameters.find((p) => p.name === 'User-Agent').value;
    assert.equal(ua, USER_AGENT);
    assert.doesNotMatch(ua, /@|nicola|sdg/i);
  }
  const attesa = nodi.find((n) => n.name === N.aspetta1);
  assert.deepEqual([attesa.parameters.amount, attesa.parameters.unit], [1, 'seconds']);
  assert.equal(nodi.find((n) => n.name === N.scaricaRadar).parameters.options.batching.batch.batchInterval, 1000);
  assert.match(nodi.find((n) => n.name === N.meteo).parameters.url, /meteo_url/);
  assert.equal(http.some((n) => /open-meteo/i.test(JSON.stringify(n.parameters))), false);
  assert.deepEqual(FONTI_RADAR.map((f) => f.id).sort(), ['cciaa-emilia-bandi', 'comune-eventi', 'comune-imprese', 'sagre-provincia', 'unionecommercianti-bandi']);
});

// --- POSIZIONE ----------------------------------------------------------------------------------------------------------

test('posizione: le coordinate del sito MyCity valgono subito; senza, si cerca l\'indirizzo; con la sola città i vicini non si contano', async () => {
  const conCoord = await prepara({ f: { lat_dichiarata: LAT, lon_dichiarata: LON } });
  assert.equal(conCoord.fatti_piano.cerca_indirizzo, false);
  const p1 = (await eseguiCodice(CODICE_FATTI_POSIZIONE, { nodi: { 'Fatti · Prepara': [{ json: conCoord }] } }))[0].json.fatti_posizione;
  assert.equal(p1.buona, true);
  assert.match(p1.overpass_query, /around:400,45\.0526,9\.693/);
  assert.equal(p1.meteo_url, 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=45.0526&lon=9.693');
  const senza = await prepara();
  assert.equal(senza.fatti_piano.cerca_indirizzo, true);
  assert.equal(senza.fatti_piano.query_indirizzo, 'Via Roma 1, 29121 Piacenza');
  const trovata = { statusCode: 200, body: [{ lat: '45.05', lon: '9.69', addresstype: 'building', osm_type: 'way', osm_id: 42 }] };
  const p2 = (await eseguiCodice(CODICE_FATTI_POSIZIONE, { nodi: { 'Fatti · Prepara': [{ json: senza }], "Fatti · OSM: cerca l'indirizzo": [{ json: trovata }] } }))[0].json.fatti_posizione;
  assert.equal(p2.posizione.fonte, 'https://www.openstreetmap.org/way/42');
  assert.equal(p2.posizione.precisione, 'indirizzo');
  const citta = { statusCode: 200, body: [{ lat: '45.05', lon: '9.69', addresstype: 'city', osm_type: 'relation', osm_id: 1 }] };
  const p3 = (await eseguiCodice(CODICE_FATTI_POSIZIONE, { nodi: { 'Fatti · Prepara': [{ json: senza }], "Fatti · OSM: cerca l'indirizzo": [{ json: citta }] } }))[0].json.fatti_posizione;
  assert.equal(p3.buona, false);
  assert.match(p3.motivo, /solo la città/);
  const nessuno = await prepara({ f: { indirizzo_dichiarato: '' } });
  const p4 = (await eseguiCodice(CODICE_FATTI_POSIZIONE, { nodi: { 'Fatti · Prepara': [{ json: nessuno }] } }))[0].json.fatti_posizione;
  assert.match(p4.motivo, /non ha dichiarato un indirizzo/);
});

test('dal sito MyCity arrivano indirizzo, tipo e coordinate (se ci sono)', async () => {
  const input = [{ json: { body: { tipo: 'nuovo-cliente', origine: 'mycity', attivita: { id: 'c0b240c0-2a86-4218-9d0f-5154f08ff929', nome: 'Bar Roma', tipo: 'bar', indirizzo: 'Via Roma 1', lat: 45.05, lon: '9.69' } } } }];
  const [{ json }] = await eseguiCodice(CODICE_RICHIESTA, { input, statico: {} });
  assert.equal(json.indirizzo_dichiarato, 'Via Roma 1');
  assert.equal(json.tipo_dichiarato, 'bar');
  assert.equal(json.lat_dichiarata, 45.05);
  assert.equal(json.lon_dichiarata, 9.69);
  const [{ json: senza }] = await eseguiCodice(CODICE_RICHIESTA, { input: [{ json: { body: { ...input[0].json.body, attivita: { ...input[0].json.body.attivita, id: 'altro-id-123', lat: null, lon: '' } } } }], statico: {} });
  assert.equal(senza.lat_dichiarata, null);
  assert.equal(senza.lon_dichiarata, null);
});

// --- I FATTI: dalle risposte delle fonti al contratto --------------------------------------------------------------------

const elemento = (id, tags, dLat = 0.0005, dLon = 0) => ({ type: 'node', id, lat: LAT + dLat, lon: LON + dLon, tags });
const OVERPASS = { statusCode: 200, body: { elements: [
  elemento(1, { amenity: 'bar', name: 'Bar Roma' }, 0.00001),
  elemento(2, { amenity: 'cafe', name: 'Caffè Duomo', opening_hours: 'Mo-Sa 07:00-20:00', website: 'https://www.caffeduomo.it', 'contact:instagram': 'https://instagram.com/caffeduomo' }, 0.001),
  elemento(3, { amenity: 'bar', name: 'Bar Facebook', website: 'https://www.facebook.com/barfb' }, 0.0015),
  elemento(4, { amenity: 'bar', name: 'Bar Interno', website: 'http://officina.internal:8080/' }, 0.002),
  elemento(5, { amenity: 'bar' }, 0.0012),
  elemento(6, { highway: 'bus_stop' }), elemento(7, { highway: 'bus_stop' }), elemento(8, { amenity: 'parking' }), elemento(9, { shop: 'bakery', name: 'Forno' }),
  elemento(10, { amenity: 'bar', name: 'Bar Lontano' }, 0.02),
] } };
const ora = (giorni, h) => new Date(Date.now() + giorni * 86400000 + h * 3600000).toISOString();
const METEO = { statusCode: 200, body: { properties: { timeseries: Array.from({ length: 48 }, (_, i) => ({ time: ora(0, i),
  data: { instant: { details: { air_temperature: 5 + (i % 10) } }, next_1_hours: { summary: { symbol_code: i % 2 ? 'rain' : 'cloudy' }, details: { precipitation_amount: 0.5 } } } })) } } };
const PAGINA_RADAR = '<html><body><h2>Mercatino di Natale in piazza Cavalli sabato e domenica</h2><a href="/x">Sagra del tortello a Bobbio il prossimo fine settimana</a></body></html>';
const HTML_SITO = '<html><head><title>Bar Roma · Piacenza</title><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Colazioni e aperitivi in centro."><script type="application/ld+json">{"@context":"https://schema.org","@type":["CafeOrCoffeeShop","LocalBusiness"]}</script></head><body>Ciao</body></html>';
const nodiFattiFinti = async ({ cfg = {}, f = {}, extra = {}, statico = {} } = {}) => {
  const json = await prepara({ cfg, f: { lat_dichiarata: LAT, lon_dichiarata: LON, ...f }, statico });
  const pos = (await eseguiCodice(CODICE_FATTI_POSIZIONE, { nodi: { 'Fatti · Prepara': [{ json }] } }))[0].json;
  const base = {
    Config: [{ json: configBase(cfg) }], 'Modulo nuovo cliente': [{ json: modulo({ lat_dichiarata: LAT, lon_dichiarata: LON, ...f }) }],
    'Fatti · Prepara': [{ json }], 'Fatti · Posizione': [{ json: pos }], 'Fatti · OSM: intorno': [{ json: OVERPASS }], 'Fatti · Meteo MET Norway': [{ json: METEO }],
    'Fatti · Fonti del radar': FONTI_RADAR.map((x) => ({ json: x })),
    'Fatti · Scarica eventi e bandi': FONTI_RADAR.map((x, i) => ({ json: { statusCode: 200, body: PAGINA_RADAR }, pairedItem: { item: i } })),
    'Pagine da leggere': [{ json: { url: 'https://www.barroma.it/' } }, { json: { url: 'https://www.barroma.it/menu' } }],
    'Scarica le pagine': [{ json: { statusCode: 200, data: HTML_SITO }, pairedItem: { item: 0 } }, { json: { statusCode: 200, data: '<html>menu</html>' }, pairedItem: { item: 1 } }],
  };
  const conc = await eseguiCodice(CODICE_FATTI_CONCORRENTI, { nodi: base });
  base['Fatti · Siti dei concorrenti'] = conc;
  return { ...base, ...extra };
};
const componi = async (opz) => (await eseguiCodice(CODICE_FATTI_COMPONI, { nodi: await nodiFattiFinti(opz) }))[0].json;

test('fatti: ogni blocco ha stato, fonte, fonte_nome, letto_il e parte; i dati veri dalle fonti gratis', async () => {
  const j = await componi();
  const f = j.fatti;
  assert.equal(f.versione, 1);
  for (const [k, b] of Object.entries(f)) {
    if (['versione', 'raccolti_il'].includes(k)) continue;
    assert.ok(['letto', 'vuoto', 'spento', 'non_applicabile', 'errore'].includes(b.stato), k);
    assert.ok(Number.isInteger(b.parte) && b.parte >= 1 && b.parte <= 12, `${k}: parte`);
    if (b.stato === 'letto') { assert.ok(b.letto_il, `${k}: letto_il`); assert.ok(b.fonte_nome, `${k}: fonte_nome`); assert.ok(b.dati, `${k}: dati`); }
    else { assert.ok(b.motivo, `${k}: motivo`); assert.equal(b.dati, null, `${k}: niente dati senza lettura`); }
  }
  // vicini: lei esclusa, senza nome non in elenco, fuori raggio fuori.
  assert.equal(f.vicini.stato, 'letto');
  assert.equal(f.vicini.licenza, 'ODbL');
  assert.equal(f.vicini.dati.concorrenti.numero, 4);
  assert.deepEqual(f.vicini.dati.concorrenti.elenco.map((c) => c.nome), ['Caffè Duomo', 'Bar Facebook', 'Bar Interno']);
  assert.equal(f.vicini.dati.concorrenti.elenco[0].fonte, 'https://www.openstreetmap.org/node/2');
  assert.equal(f.vicini.dati.concorrenti.elenco[0].orari_osm, 'Mo-Sa 07:00-20:00');
  assert.equal(f.vicini.dati.concorrenti.elenco[1].orari_osm, null, 'orari mancanti su OSM: null, non inventati');
  for (const b of Object.values(f)) if (b && typeof b === 'object') assert.ok(!b.conserva_fino_al, 'nessun dato con scadenza');
  assert.equal(f.vicini.dati.servizi.fermate_bus, 2);
  assert.equal(f.vicini.dati.servizi.scuole, 0, 'contate, nessuna: zero vero');
  assert.equal(f.vicini.dati.servizi_parte, 4);
  // meteo: MET Norway, citato.
  assert.equal(f.meteo.fonte_nome, 'MET Norway (api.met.no)');
  assert.equal(f.meteo.licenza, 'CC BY 4.0');
  assert.ok(f.meteo.dati.giorni.length >= 2 && f.meteo.dati.giorni.length <= 7);
  assert.ok(f.meteo.dati.giorni.every((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.data) && typeof g.max_c === 'number'));
  // eventi e bandi dalle pagine del radar.
  assert.equal(f.eventi.stato, 'letto');
  assert.ok(f.eventi.dati.elenco.length <= 8 && f.bandi.dati.elenco.length <= 6);
  assert.match(f.eventi.dati.elenco[0].titolo, /Mercatino di Natale/);
  // sito: controlli sulle pagine già scaricate.
  assert.deepEqual(f.sito.dati, { indirizzo: 'https://www.barroma.it/', https: true, viewport_mobile: true, titolo: 'Bar Roma · Piacenza', descrizione: true,
    descrizione_caratteri: 32, dati_strutturati: ['CafeOrCoffeeShop', 'LocalBusiness'] });
  // le fonti a pagamento spente: «spento» col motivo, mai zero.
  for (const k of ['google', 'tripadvisor', 'recensioni', 'ricerche', 'instagram']) { assert.equal(f[k].stato, 'spento', k); assert.match(f[k].motivo, /Config|finta/); }
});

test('fatti: una fonte che non risponde è «errore» col motivo, mai zero; senza posizione vicini e meteo sono «vuoto»', async () => {
  const j = await componi({ extra: { 'Fatti · OSM: intorno': [{ json: { statusCode: 504, body: '' } }], 'Fatti · Meteo MET Norway': [{ json: { error: { message: 'timeout' } } }],
    'Fatti · Scarica eventi e bandi': FONTI_RADAR.map((x, i) => ({ json: { statusCode: 500 }, pairedItem: { item: i } })) } });
  assert.equal(j.fatti.vicini.stato, 'errore');
  assert.match(j.fatti.vicini.motivo, /504/);
  assert.equal(j.fatti.vicini.dati, null);
  assert.equal(j.fatti.meteo.stato, 'errore');
  assert.equal(j.fatti.eventi.stato, 'errore');
  const senza = await componi({ f: { lat_dichiarata: null, lon_dichiarata: null, indirizzo_dichiarato: '' } });
  assert.equal(senza.fatti.vicini.stato, 'vuoto');
  assert.equal(senza.fatti.meteo.stato, 'vuoto');
  assert.equal(senza.fatti.posizione.stato, 'vuoto');
});

test('Google: anche se la risposta porta voto, recensioni e orari, si tiene SOLO il place_id (parere legale)', async () => {
  const cfg = { FONTE_GOOGLE: 'si', CREDENZIALE_GOOGLE: 'collegata' };
  const risposta = { statusCode: 200, body: { places: [{ id: 'ChIJabcdefghijklmnop', rating: 4.6, userRatingCount: 300, displayName: { text: 'Bar Roma' }, regularOpeningHours: {} }] } };
  const j = await componi({ cfg, extra: { 'Fatti · Google: la scheda': [{ json: risposta }] } });
  assert.deepEqual(j.fatti.google.dati, { place_id: 'ChIJabcdefghijklmnop' });
  assert.equal(j.fatti.google.conserva_fino_al, null);
  assert.equal(JSON.stringify(j).includes('4.6'), false);
  assert.equal(JSON.stringify(j).includes('300'), false);
});

test('DataForSEO: al sito solo i numeri, i testi solo all\'AD e mai il nome di chi scrive; niente scadenze', async () => {
  const cfg = { FONTE_DATAFORSEO: 'si', CREDENZIALE_DATAFORSEO: 'collegata' };
  const items = Array.from({ length: 5 }, (_, i) => ({ rating: { value: i < 4 ? 5 : 2 }, review_text: `Servizio veloce e caffè ottimo, ci torno sempre ${i}`, profile_name: 'Mario Rossi',
    profile_url: 'https://maps.google.com/u/1', owner_answer: i === 0 ? 'Grazie!' : null, timestamp: '2026-11-2' + i + ' 10:00:00 +00:00' }));
  const compito = (result) => ({ statusCode: 200, body: { tasks: [{ id: 't1', status_code: 20000, result }] } });
  const extra = {
    'Fatti · DataForSEO: prendi le recensioni': [{ json: compito([{ items }]) }],
    'Fatti · DataForSEO: volumi': [{ json: compito([{ keyword: 'bar piacenza', search_volume: 1900 }, { keyword: 'bar roma piacenza', search_volume: null }]) }],
    'Fatti · DataForSEO: posizione': [{ json: compito([{ items: [{ type: 'organic', url: 'https://altro.it', rank_group: 1 }, { type: 'organic', url: 'https://www.caffeduomo.it/', rank_group: 2 }, { type: 'organic', url: 'https://www.barroma.it/', rank_group: 3 }] }]) }],
  };
  const j = await componi({ cfg, extra });
  // AD, 26/11: niente voto medio né stelle, niente dati con scadenza.
  assert.deepEqual(j.fatti.recensioni.dati, { lette: 5, con_risposta: 1, ultima_il: '2026-11-24' });
  assert.equal(j.fatti.recensioni.conserva_fino_al, null);
  assert.equal(JSON.stringify(j.fatti).includes('voto_medio'), false);
  assert.equal(JSON.stringify(j.fatti).includes('Servizio veloce'), false, 'i testi non vanno al sito');
  assert.equal(JSON.stringify(j).includes('Mario'), false, 'mai il nome di chi scrive');
  assert.equal(JSON.stringify(j).includes('maps.google'), false);
  assert.equal(j.fatti_per_ad.testi_recensioni.length, 5);
  assert.deepEqual(j.fatti.ricerche.dati.parole[0], { parola: 'bar piacenza', ricerche_al_mese: 1900, posizione: 3 });
  assert.equal(j.fatti.ricerche.dati.parole[1].ricerche_al_mese, null);
  // Parte 12: la posizione del concorrente sulla stessa ricerca.
  assert.equal(j.fatti.concorrenti_canali.dati.elenco.find((c) => c.nome === 'Caffè Duomo').posizione_google, 2);
});

// --- PARTE 12: I CONCORRENTI SUI SOCIAL E SUL WEB ---------------------------------------------------------------------------

test('concorrenti: si legge solo il sito che OpenStreetMap indica, e mai Meta o indirizzi interni', async () => {
  const nodi = await nodiFattiFinti();
  const uscita = nodi['Fatti · Siti dei concorrenti'].map((x) => x.json);
  assert.deepEqual(uscita.map((x) => x.url), ['https://www.caffeduomo.it/']);
  const elenco = uscita[0].concorrenti;
  assert.deepEqual(elenco.map((c) => c.nome), ['Caffè Duomo', 'Bar Facebook', 'Bar Interno']);
  assert.match(elenco[1].sito_motivo, /Facebook/);
  assert.match(elenco[2].sito_motivo, /interna|porta/);
  assert.equal(elenco[0].profilo_osm, 'caffeduomo');
});

test('concorrenti: senza Instagram acceso il blocco c\'è lo stesso (sito, distanza), con il motivo; con Instagram i numeri del contratto', async () => {
  const sitoConc = '<html><head><meta name="viewport" content="width=device-width"></head><body><a href="/menu">Menu</a><a href="/prenota">Prenota</a> Il caffè del Duomo</body></html>';
  const extra = { 'Fatti · Scarica i siti dei concorrenti': [{ json: { statusCode: 200, body: sitoConc }, pairedItem: { item: 0 } }] };
  const spento = await componi({ extra });
  const duomo = spento.fatti.concorrenti_canali.dati.elenco[0];
  assert.equal(spento.fatti.concorrenti_canali.parte, 12);
  assert.deepEqual(duomo.sito, { c_e: true, indirizzo: 'https://www.caffeduomo.it/', livello: 'medio', https: true, viewport_mobile: true, motivo: null });
  assert.equal(duomo.instagram, null);
  assert.match(duomo.instagram_motivo, /FONTE_INSTAGRAM/);
  assert.match(spento.fatti_per_ad.siti_dei_concorrenti[0].testo, /caffè del Duomo/);

  const cfg = { FONTE_INSTAGRAM: 'si', CREDENZIALE_INSTAGRAM: 'collegata', INSTAGRAM_ID_MYCITY: '17841400000000000' };
  const nodi = await nodiFattiFinti({ cfg, extra });
  // Il profilo di MyCity non serve per i concorrenti: chiama.instagram dipende dal profilo dell'attività stessa; qui lo forziamo.
  nodi['Fatti · Prepara'][0].json.fatti_piano.chiama.instagram = true;
  nodi['Fatti · Instagram dei concorrenti'] = await eseguiCodice(CODICE_FATTI_PROFILI_CONCORRENTI, { nodi });
  assert.deepEqual(nodi['Fatti · Instagram dei concorrenti'].map((x) => x.json.profilo), ['caffeduomo']);
  const post = (g, h, tipo, prodotto, like, link) => ({ timestamp: ora(-g, h), media_type: tipo, media_product_type: prodotto, like_count: like, comments_count: 1, permalink: link });
  nodi['Fatti · Instagram: concorrenti'] = [{ json: { statusCode: 200, body: { business_discovery: { username: 'caffeduomo', followers_count: 2300, media_count: 400, media: { data: [
    post(1, 0, 'VIDEO', 'REELS', 400, 'https://www.instagram.com/reel/AAA/'), post(2, 0, 'IMAGE', 'FEED', 20, 'https://www.instagram.com/p/BBB/'),
    post(3, 0, 'CAROUSEL_ALBUM', 'FEED', 60, 'https://www.instagram.com/p/CCC/'), post(60, 0, 'IMAGE', 'FEED', 900, 'https://www.instagram.com/p/DDD/'),
  ] } } } }, pairedItem: { item: 0 } }];
  const j = (await eseguiCodice(CODICE_FATTI_COMPONI, { nodi }))[0].json;
  const ig = j.fatti.concorrenti_canali.dati.elenco[0].instagram;
  assert.equal(ig.follower, 2300);
  assert.equal(ig.post_ultimi_30_giorni, 3);
  assert.deepEqual(ig.formati, { reel: 1, foto: 1, carosello: 1 });
  assert.equal(ig.interazioni_medie, Math.round((401 + 21 + 61 + 901) / 4));
  assert.deepEqual(ig.migliori.map((m) => m.link), ['https://www.instagram.com/p/DDD/', 'https://www.instagram.com/reel/AAA/', 'https://www.instagram.com/p/CCC/']);
  assert.equal(Object.values(ig.orari).reduce((a, b) => a + b, 0), 3);
});

// --- LE SEZIONI NUOVE DELL'AD -----------------------------------------------------------------------------------------------

const rispostaAd = (extra) => ({ content: [{ type: 'text', text: JSON.stringify({ situazione: [], mercato: [], clienti: [], opportunita: [], rischi: [], prime_mosse: [], ...extra }) }] });
async function unisci(fatti, letta) {
  const prima = { id: 'x', scheda: { analisi: {} }, fatti, fatti_per_ad: { testi_recensioni: [{ stelle: 5, testo: 'segreto' }] }, richiesta: {} };
  return (await eseguiCodice(CODICE_UNISCI_BUSINESS, { input: [{ json: rispostaAd(letta) }], nodi: { "Prepara l'analisi del business": [{ json: prima }], 'Modulo nuovo cliente': [{ json: { sito: '' } }] } }))[0].json;
}

test("AD: le sezioni nuove si ricontrollano sui fatti (concorrenti veri, numeri dai fatti, temi da almeno 3 recensioni)", async () => {
  const { fatti } = await componi();
  fatti.recensioni = { stato: 'letto', dati: { lette: 10 }, parte: 4 };
  const j = await unisci(fatti, {
    reputazione_temi: [{ tema: 'servizio veloce', tono: 'positivo', quante: 6, fonte: 'https://dataforseo.com/' }, { tema: 'prezzi alti', tono: 'negativo', quante: 2, fonte: 'https://dataforseo.com/' },
      { tema: 'troppe', tono: 'misto', quante: 40, fonte: 'https://dataforseo.com/' }],
    confronto_concorrenti: [{ nome: 'Caffè Duomo', distanza_m: 5, voto: 4.9, recensioni: 999, differenza: 'Ha un sito con le prenotazioni', fonte: 'https://www.caffeduomo.it/', meglio: 'Pubblica reel ogni settimana', peggio: null, fonte_canali: 'https://www.caffeduomo.it/' },
      { nome: 'Bar Inventato', distanza_m: 10, voto: null, recensioni: null, differenza: 'Non esiste nei fatti', fonte: 'https://x.it/', meglio: null, peggio: null, fonte_canali: null }],
    idee_dal_confronto: [{ idea: 'Un reel della colazione', perche: 'Il Caffè Duomo fa reel e ha più interazioni', servizio: 'foto_video', fonte: 'https://www.caffeduomo.it/' }],
    occasioni: [{ quando: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), cosa: 'Mercatino di Natale', perche_conta: 'Più gente in centro', fonte: 'https://www.comune.piacenza.it/it/categorie-eventi/76806' },
      { quando: '2020-01-01', cosa: 'Evento vecchio', perche_conta: 'Data passata', fonte: 'https://www.comune.piacenza.it/' }],
    soldi_pubblici: [{ bando: 'Bando digitale PI26', ente: 'Camera di Commercio', scadenza: '2027-02-30', per_chi: 'Piccole imprese che si digitalizzano', fonte: 'https://www.emilia.camcom.it/x' },
      { bando: 'Bando con telefono', ente: 'Ente', scadenza: null, per_chi: 'Chiama 0523 123456 subito', fonte: 'https://www.emilia.camcom.it/x' }],
    piano_30_giorni: [{ settimana: 2, azione: 'Servizio foto della colazione', servizio: 'foto_video', fonte: 'https://www.barroma.it/' }, { settimana: 1, azione: 'Sistemare la descrizione del sito', servizio: 'sito_web', fonte: 'https://www.barroma.it/' },
      { settimana: 5, azione: 'Settimana che non esiste', servizio: null, fonte: 'https://www.barroma.it/' }],
  });
  const b = j.scheda.analisi.business;
  assert.deepEqual(b.reputazione_temi, [{ tema: 'servizio veloce', tono: 'positivo', quante: 6, fonte: 'https://dataforseo.com/' }]);
  assert.equal(b.confronto_concorrenti.length, 1);
  assert.deepEqual([b.confronto_concorrenti[0].distanza_m, b.confronto_concorrenti[0].voto, b.confronto_concorrenti[0].recensioni], [fatti.vicini.dati.concorrenti.elenco[0].distanza_m, null, null]);
  assert.equal(b.confronto_concorrenti[0].meglio, 'Pubblica reel ogni settimana');
  assert.equal(b.idee_dal_confronto.length, 1);
  assert.equal(b.occasioni.length, 2);
  assert.equal(b.occasioni[1].quando, null, 'una data passata non vale');
  assert.deepEqual(b.soldi_pubblici.map((x) => x.scadenza), [null], 'data impossibile = null; il bando col telefono fuori');
  assert.deepEqual(b.piano_30_giorni.map((x) => x.settimana), [1, 2]);
  assert.equal(b.parti.idee_dal_confronto, 12);
  // I fatti vanno nella scheda; i testi per l'AD no.
  assert.equal(j.scheda.analisi.fatti.vicini.stato, 'letto');
  assert.equal(JSON.stringify(j).includes('segreto'), false);
  assert.equal('fatti_per_ad' in j, false);
});

test('AD: senza recensioni lette i temi non escono, anche se l\'AD li scrive', async () => {
  const { fatti } = await componi();
  const j = await unisci(fatti, { reputazione_temi: [{ tema: 'servizio veloce', tono: 'positivo', quante: 6, fonte: 'https://dataforseo.com/' }],
    piano_30_giorni: [{ settimana: 1, azione: 'Sistemare la descrizione del sito', servizio: 'sito_web', fonte: 'https://www.barroma.it/' }] });
  assert.deepEqual(j.scheda.analisi.business.reputazione_temi, []);
});

test('la scheda al sito porta i fatti (numeri con fonte), mai i testi per l\'AD', async () => {
  const { fatti } = await componi();
  const nodi = { Config: [{ json: { MODALITA: 'vero' } }], 'Modulo nuovo cliente': [{ json: { id_mycity: 'c0b240c0-2a86-4218-9d0f-5154f08ff929' } }] };
  const [{ json }] = await eseguiCodice(CODICE_SCHEDA_SITO, { input: [{ json: { scheda: { analisi: { fatti, business_fatta_il: 'x' } } } }], nodi });
  assert.equal(json.mandare, true);
  assert.equal(json.corpo.analisi.fatti.meteo.fonte_nome, 'MET Norway (api.met.no)');
  assert.equal('fatti_per_ad' in json.corpo.analisi, false);
});

// --- IL LAVORO PER «CHIEDI ALL'AD» SOTTO I 64 KB ---------------------------------------------------------------------------

test("il lavoro per l'AD con i fatti pieni, i testi delle recensioni e pagine lunghe resta sotto i 64 KB", async () => {
  const j = await componi();
  const lunga = 'Qualità è perché più caffè '.repeat(3000);
  j.fatti_per_ad = { testi_recensioni: Array.from({ length: 40 }, () => ({ stelle: 5, testo: 'è'.repeat(220) })),
    siti_dei_concorrenti: Array.from({ length: 5 }, (_, i) => ({ nome: `Bar ${i}`, url: `https://bar${i}.it/`, testo: 'à'.repeat(700) })) };
  const pagine = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`p${i}`, { url: i < 4 ? `https://www.barroma.it/p${i}` : `https://portale${i}.it/`, testo: lunga }]));
  const [{ json }] = await eseguiCodice(CODICE_PREPARA_BUSINESS, { input: [{ json: j }], nodi: { Config: [{ json: { CLAUDE_MODEL: 'm' } }],
    'Modulo nuovo cliente': [{ json: { nome_locale: 'Bar Roma', citta: 'Piacenza', sito: 'https://www.barroma.it' } }], 'Leggi la ricerca': [{ json: { corpus: { pagine } } }] } });
  const lavoro = JSON.stringify({ compito: json.richiesta.system, dati: { messaggio: json.richiesta.messages[0].content }, schema: json.richiesta.output_config.format.schema });
  const peso = Buffer.byteLength(lavoro, 'utf8');
  assert.ok(peso < 62000, `il lavoro pesa ${peso} byte`);
  const messaggio = json.richiesta.messages[0].content;
  assert.match(messaggio, /"fatti"/);
  assert.match(messaggio, /MET Norway/);
  assert.match(messaggio, /testi_recensioni/);
  assert.match(json.richiesta.system, /almeno 3 recensioni/);
  assert.match(json.richiesta.system, /Mai dati di Google/);
  // Le pagine del sito ci sono ancora, accorciate.
  assert.match(messaggio, /barroma\.it\/p0/);
});

// --- Dal collaudo del 26/11/2026 --------------------------------------------------------------------------------------------

test('collaudo: i siti dei concorrenti solo in https, mai portali, elenchi o pagine di Google (un nome scritto su OSM può puntare dentro)', async () => {
  const con = (website) => ({ ...OVERPASS, body: { elements: [elemento(1, { amenity: 'bar', name: 'Bar Roma' }, 0.00001), elemento(2, { amenity: 'bar', name: 'Altro Bar', website }, 0.001)] } });
  for (const [website, letto] of [['http://fuf.me/', true], ['https://www.paginegialle.it/bar', false], ['https://bar.business.site/', false], ['https://www.google.com/search?q=bar', false],
    ['https://www.booking.com/x', false], ['http://metadata.attaccante.it:8080/', false], ['https://www.altrobar.it/', true]]) {
    const nodi = await nodiFattiFinti({ extra: {} });
    nodi['Fatti · OSM: intorno'] = [{ json: con(website) }];
    const uscita = (await eseguiCodice(CODICE_FATTI_CONCORRENTI, { nodi })).map((x) => x.json);
    const url = uscita[0].salta ? null : uscita[0].url;
    if (letto) assert.match(url, /^https:\/\//, `${website} si legge solo in https`);
    else assert.equal(url, null, `${website} non si legge`);
  }
});

test('collaudo: nel confronto coi concorrenti niente voti di Google e fonti solo dai fatti di quel concorrente', async () => {
  const { fatti } = await componi();
  const j = await unisci(fatti, { confronto_concorrenti: [
    { nome: 'Caffè Duomo', distanza_m: 1, voto: null, recensioni: null, differenza: 'Su Google Maps ha 4,7 su 5 con tante recensioni', fonte: 'https://www.google.com/maps/place/x',
      meglio: 'Ha il menu online sul suo sito', peggio: null, fonte_canali: 'https://www.facebook.com/caffeduomo' },
    { nome: 'Caffè Duomo', distanza_m: 1, voto: null, recensioni: null, differenza: 'Ha un sito con le prenotazioni', fonte: 'https://www.google.com/maps/place/x', meglio: 'Molto amato, 812 recensioni', peggio: null, fonte_canali: null }] });
  const c = j.scheda.analisi.business.confronto_concorrenti;
  assert.equal(c.length, 1, 'la frase sui voti di Google non esce');
  assert.equal(c[0].fonte, 'https://www.openstreetmap.org/node/2', 'la fonte di Google diventa quella dei fatti');
  assert.equal(c[0].meglio, null);
  assert.equal(JSON.stringify(c).includes('google'), false);
  assert.equal(JSON.stringify(c).includes('facebook'), false);
});

test('collaudo: senza dati di pioggia la pioggia è null, non zero; Overpass troncato si dice', async () => {
  const senzaPioggia = { statusCode: 200, body: { properties: { timeseries: [{ time: ora(0, 1), data: { instant: { details: { air_temperature: 4 } } } }] } } };
  const j = await componi({ extra: { 'Fatti · Meteo MET Norway': [{ json: senzaPioggia }] } });
  assert.equal(j.fatti.meteo.dati.giorni[0].pioggia_mm, null);
  assert.equal(j.fatti.vicini.dati.troncato, false);
});

test("regola delle 15:00 («non si cancella mai»): una scheda senza campi è «parziale» e non porta sezioni vuote da scrivere sopra quelle piene", async () => {
  const nodi = { Config: [{ json: { MODALITA: 'vero' } }], 'Modulo nuovo cliente': [{ json: { id_mycity: 'c0b240c0-2a86-4218-9d0f-5154f08ff929' } }], 'Controlla la proposta': [{ json: { ok: false } }] };
  const [{ json }] = await eseguiCodice(CODICE_SCHEDA_SITO, { input: [{ json: { scheda: { analisi: { business_fatta_il: '2026-11-26T15:00:00Z', business_avvisi: [] } } } }], nodi });
  assert.equal(json.mandare, true);
  assert.equal(json.corpo.parziale, true);
  assert.deepEqual(json.corpo.campi, {});
  assert.equal('business' in json.corpo.analisi, false, 'nessuna sezione vuota');
  assert.equal('giudizio_sito' in json.corpo.analisi, false);
  // Senza niente da dire, niente parte.
  const [{ json: niente }] = await eseguiCodice(CODICE_SCHEDA_SITO, { input: [{ json: { scheda: null } }], nodi });
  assert.equal(niente.mandare, false);
});

test("piano dei 30 giorni: la proposta (cosa facciamo noi) c'è solo con un servizio, senza prezzi", async () => {
  const { fatti } = await componi();
  const j = await unisci(fatti, { piano_30_giorni: [
    { settimana: 1, azione: 'Foto nuove della colazione', servizio: 'foto_video', proposta: 'Un servizio fotografico della colazione per il menu e i social', fonte: 'https://www.barroma.it/' },
    { settimana: 2, azione: 'Rispondere alle recensioni', servizio: null, proposta: 'Lo facciamo noi', fonte: 'https://www.barroma.it/' },
    { settimana: 3, azione: 'Sito nuovo con prenotazioni', servizio: 'sito_web', proposta: 'Sito nuovo a 990 euro', fonte: 'https://www.barroma.it/' }] });
  assert.deepEqual(j.scheda.analisi.business.piano_30_giorni.map((x) => x.proposta), ['Un servizio fotografico della colazione per il menu e i social', null, null]);
});

test('dalla generazione a secco sul 12 vero: i nodi Google Sheets e Drive del 12 non sono chiamate a pagamento di Google Places', () => {
  const { nodi, collegamenti } = nodiFatti([0, 0]);
  const w = { nodes: [{ name: 'Config', parameters: { assignments: { assignments: vociConfig().map(([name, value]) => ({ name, value })) } } }, ...nodi,
    { name: 'Leggi il foglio Clienti', type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://sheets.googleapis.com/v4/spreadsheets/x/values/A1' } },
    { name: 'Cerca la cartella del cliente', type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://www.googleapis.com/drive/v3/files' } }], connections: collegamenti };
  assert.deepEqual(controllaFatti(w), []);
  // Dal collaudo della #25: tutto Google a pagamento resta segnalato (al contrario: esenti solo Sheets e Drive), con le maiuscole,
  // con l'URL in un'espressione o nei parametri, e anche nei nodi HTTP degli strumenti.
  const furbi = [
    { type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://places.googleapis.com/v1/places:searchText' } },
    { type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://maps.googleapis.com/maps/api/geocode/json' } },
    { type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://www.googleapis.com/geolocation/v1/geolocate' } },
    { type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://solar.googleapis.com/v1/buildingInsights:findClosest' } },
    { type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://PLACES.GOOGLEAPIS.COM/v1/places' } },
    { type: 'n8n-nodes-base.httpRequest', parameters: { url: "={{ 'https://places.googleapis.com/v1/' + $json.id }}" } },
    { type: 'n8n-nodes-base.httpRequest', parameters: { url: '={{ $json.base }}', queryParameters: { parameters: [{ name: 'u', value: 'https://maps.googleapis.com/maps/api/place/details/json' }] } } },
    { type: 'n8n-nodes-base.httpRequestTool', parameters: { url: 'https://routes.googleapis.com/directions/v2:computeRoutes' } },
    { type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://www.googleapis.com/drive/../geolocation/v1/geolocate' } },
    { type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://fakesheets.googleapis.com/v1/x' } },
  ];
  for (const f of furbi) {
    const prova = { ...w, nodes: [...w.nodes, { name: 'Furbo', ...f }] };
    assert.ok(controllaFatti(prova).some((p) => /fuori dal loro IF/.test(p)), JSON.stringify(f.parameters));
  }
});

test("AD, 26/11: solo https. Un sito dichiarato in http che non si apre in https diventa «sito non protetto» nei fatti, e l'AD lo sa", async () => {
  const j = await componi({ f: { sito: 'http://www.barvecchio.it' }, extra: { 'Pagine da leggere': [{ json: { url: 'https://www.barvecchio.it/' } }], 'Scarica le pagine': [{ json: { error: { message: 'ECONNREFUSED' } }, pairedItem: { item: 0 } }] } });
  assert.equal(j.fatti.sito.stato, 'letto');
  assert.equal(j.fatti.sito.dati.https, false);
  assert.match(j.fatti.sito.motivo, /non è protetto/);
  const [{ json }] = await eseguiCodice(CODICE_PREPARA_BUSINESS, { input: [{ json: j }], nodi: { Config: [{ json: {} }], 'Modulo nuovo cliente': [{ json: { nome_locale: 'Bar Vecchio', sito: 'http://www.barvecchio.it' } }] } });
  assert.match(json.richiesta.system, /https è false/);
});
