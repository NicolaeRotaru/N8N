// Le prove del 16 · Attività da visitare: la domanda alla mappa, la fila (catene, categorie escluse, doppioni,
// già su MyCity, già proposte, senza nome), la mappa che non risponde, il lavoro per l'AD, i messaggi e le righe
// della tabella. Mappa finta, nessuna rete.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eseguiCodice } from './esegui-codice.mjs';
import { costruisci, controlla, CONFIG_16, TABELLA_ID } from '../16-attivita-da-visitare/costruisci.mjs';

const leggi = (n) => readFileSync(new URL(`../16-attivita-da-visitare/codice/${n}`, import.meta.url), 'utf8');
const DOMANDA = leggi('prepara-domanda.js');
const FILA = leggi('metti-in-fila.js');
const LAVORO = leggi('prepara-lavoro.js');
const COMPONI = leggi('componi.js');
const RIGHE = leggi('righe-tabella.js');

const cfg = (extra = {}) => [{ json: { MODALITA: 'vero', ...CONFIG_16, ...extra } }];
const C = { lat: CONFIG_16.CENTRO_LAT, lon: CONFIG_16.CENTRO_LON };
// ~111 m per millesimo di grado di latitudine
const nodo = (id, tags, dLatMillesimi = 1, tipo = 'node') => (tipo === 'node'
  ? { type: 'node', id, lat: C.lat + dLatMillesimi / 1000, lon: C.lon, tags }
  : { type: tipo, id, center: { lat: C.lat + dLatMillesimi / 1000, lon: C.lon }, tags });
// La forma vera di n8n (risposta «text» con fullResponse): il testo sta in `data` (collaudo G2: le prove usavano `body`).
const mappa = (elements) => [{ json: { statusCode: 200, statusMessage: 'OK', headers: { 'content-type': 'application/json' }, data: JSON.stringify({ version: 0.6, elements }) } }];
const negozi = (nomi) => [{ json: { statusCode: 200, body: nomi.map((store_name, i) => ({ id: `u${i}`, store_name })) } }];
const proposte = (righe) => (righe.length ? righe.map((json) => ({ json })) : [{ json: {} }]);

const ELEMENTI = [
  nodo(1, { name: 'Macelleria Bersani', shop: 'butcher', phone: '+39 0523 000000', 'addr:street': 'Via Roma', 'addr:housenumber': '10' }, 3),
  nodo(2, { name: 'Bar Sport', amenity: 'bar', website: 'https://barsport.example', 'contact:instagram': 'barsport' }, 40),
  nodo(3, { name: 'Conad City', shop: 'supermarket' }, 2),
  nodo(4, { name: 'Pizzeria Marchio', amenity: 'restaurant', brand: 'Marchio', 'brand:wikidata': 'Q1' }, 2),
  nodo(5, { name: 'Tigotà', shop: 'chemist' }, 2),
  nodo(6, { name: 'Telefonia Rossi', shop: 'mobile_phone' }, 2),
  nodo(7, { name: 'Frutta & Verdura Da Gino', shop: 'greengrocer' }, 5),
  nodo(77, { name: 'Frutta & Verdura Da Gino', shop: 'greengrocer' }, 5.2, 'way'),
  nodo(8, { name: 'Panificio Pane Quotidiano', shop: 'bakery' }, 1),
  nodo(9, { name: 'Enoteca Già Proposta', shop: 'wine' }, 4),
  nodo(10, { shop: 'florist' }, 4),
  nodo(11, { name: 'Negozio Chiuso', shop: 'clothes', opening_hours: 'closed' }, 4),
  nodo(12, { name: 'Ottica Lontana', shop: 'optician' }, 44),
];

const fila = (extra = {}) => eseguiCodice(FILA, { nodi: {
  Config: cfg(extra.cfg),
  'Chiedi alla mappa': extra.mappa || mappa(ELEMENTI),
  'Leggi i negozi di MyCity': extra.negozi || negozi(['Pane Quotidiano', 'Casa Linda']),
  'Leggi le attività già proposte': extra.proposte || proposte([{ osm: 'node/9', stato: 'visitata' }, { osm: 'node/999', stato: 'si' }]),
} });

test('la domanda: raggio e centro dal Config, anche chi non ha nome; un Config storto si ferma', async () => {
  const [{ json: d }] = await eseguiCodice(DOMANDA, { nodi: { Config: cfg() } });
  assert.match(d.domanda, /around:5000,45\.0529,9\.6917/);
  assert.match(d.domanda, /\["shop"\];/, 'si chiede shop senza filtrare il nome: chi non ha nome si conta, non sparisce');
  assert.ok(d.url.startsWith('https://overpass-api.de/api/interpreter?data='));
  await assert.rejects(eseguiCodice(DOMANDA, { nodi: { Config: cfg({ RAGGIO_M: 0 }) } }), /raggio/);
  await assert.rejects(eseguiCodice(DOMANDA, { nodi: { Config: cfg({ CENTRO_LAT: 'x' }) } }), /centro/);
});

test('la fila: fuori catene, categorie perse, chiusi, doppioni, già su MyCity, già proposte; prima il fresco vicino', async () => {
  const [{ json: r }] = await fila();
  assert.equal(r.letta, true);
  const nomi = r.fila.map((a) => a.nome);
  assert.deepEqual(nomi.slice(0, 2), ['Macelleria Bersani', 'Frutta & Verdura Da Gino'], 'il fresco vicino viene prima');
  for (const fuori of ['Conad City', 'Pizzeria Marchio', 'Tigotà', 'Telefonia Rossi', 'Panificio Pane Quotidiano', 'Enoteca Già Proposta', 'Negozio Chiuso']) {
    assert.ok(!nomi.includes(fuori), `${fuori} non deve stare in fila`);
  }
  assert.equal(nomi.filter((n) => n === 'Frutta & Verdura Da Gino').length, 1, 'punto ed edificio dello stesso negozio contano una volta');
  assert.ok(nomi.indexOf('Bar Sport') > nomi.indexOf('Frutta & Verdura Da Gino'));
  const c = r.conti;
  assert.equal(c.letti, ELEMENTI.length);
  assert.equal(c.catene, 3, 'Conad (per nome), Pizzeria Marchio (marchio), Tigotà (per nome)');
  assert.equal(c.categorie_escluse, 1);
  assert.equal(c.chiuse, 1);
  assert.equal(c.doppioni, 1);
  assert.equal(c.gia_su_mycity, 1);
  assert.equal(c.gia_proposte, 1);
  assert.equal(c.senza_nome, 1, 'chi non ha nome si conta (scorciatoie #11)');
  assert.equal(c.in_fila, 4);
  assert.equal(c.letti, c.senza_nome + c.senza_posizione + c.chiuse + c.catene + c.categorie_escluse + c.doppioni + c.gia_su_mycity + c.gia_proposte + c.fuori_raggio + c.in_fila, 'ogni elemento della mappa finisce in un conto');
  assert.deepEqual(c.stati_finora, { visitata: 1, si: 1 });
  const m = r.fila[0];
  assert.equal(m.osm, 'node/1');
  assert.match(m.perche, /fresco vicino a Pane Quotidiano/);
  assert.match(m.perche, /non ha un sito/);
  assert.equal(m.offerta, 'sito, social');
  assert.equal(m.indirizzo, 'Via Roma 10');
  assert.ok(m.mappa.startsWith('https://www.google.com/maps/search/?api=1&query=Macelleria%20Bersani'));
  const bar = r.fila.find((a) => a.nome === 'Bar Sport');
  assert.equal(bar.offerta, '', 'ha sito e social: non gli si propone di rifarli a scatola chiusa');
});

test('la mappa anche nella forma con `body`', async () => {
  const [{ json: r }] = await fila({ mappa: [{ json: { statusCode: 200, body: JSON.stringify({ elements: ELEMENTI }) } }] });
  assert.equal(r.letta, true);
  assert.equal(r.conti.letti, ELEMENTI.length);
});

test('ogni barriera delle catene vale da sola; il marchio uguale al proprio nome non fa catena (collaudo M11 e m4)', async () => {
  const el = [
    nodo(21, { name: 'Bottega Qualunque', shop: 'deli', brand: 'Marchio Lontano' }, 2),
    nodo(22, { name: 'Altra Bottega', shop: 'deli', 'brand:wikidata': 'Q99' }, 2.5),
    nodo(23, { name: 'Bottega Sola', shop: 'deli', 'operator:wikidata': 'Q98' }, 3),
    nodo(24, { name: 'Pelletterie Pugni', shop: 'bag', brand: 'PUGNI' }, 3.5),
    nodo(25, { name: 'Pinalli', shop: 'cosmetics' }, 4),
    nodo(26, { name: 'La Piadeneria', amenity: 'fast_food' }, 4.5),
    nodo(27, { name: 'Coin', shop: 'department_store' }, 5),
    nodo(28, { name: 'Bar Coin di Mario', amenity: 'bar' }, 5.5),
    nodo(29, { name: 'Poltronesofà', shop: 'furniture', brand: 'Poltronesofà' }, 6),
    nodo(30, { name: 'Crudo', amenity: 'restaurant', brand: 'Crudo' }, 6.5),
    nodo(31, { name: 'LycaMobile', shop: 'convenience' }, 7),
    nodo(32, { name: 'OBI', shop: 'doityourself' }, 7.5),
  ];
  const [{ json: r }] = await fila({ mappa: mappa(el) });
  assert.deepEqual(r.fila.map((a) => a.nome).sort(), ['Bar Coin di Mario', 'Pelletterie Pugni']);
  assert.equal(r.conti.catene, 10);
});

test('categorie: tabaccherie e ricevitorie fuori anche se segnate come alimentari; «shop=yes» e i minimarket dentro (collaudo m2 e m5)', async () => {
  const el = [
    nodo(31, { name: 'Zilli Paola Tabaccheria', shop: 'convenience' }, 2),
    nodo(32, { name: 'Tabacchi Lotto', shop: 'tobacco' }, 2.5),
    nodo(33, { name: 'Ricevitoria del Corso', shop: 'newsagent' }, 3),
    nodo(34, { name: 'Cover Store', shop: 'mobile_phone_accessories' }, 3.5),
    nodo(35, { name: 'Fumetteria', shop: 'yes' }, 4),
    nodo(36, { name: 'Mini Market Piacenza', shop: 'supermarket' }, 4.5),
    nodo(37, { name: 'Rivendita n. 12', shop: 'tobacco' }, 5),
    nodo(38, { name: 'CANON', shop: 'printer_ink' }, 5.5),
    nodo(39, { name: 'gas sales', shop: 'energy' }, 6),
    nodo(40, { name: 'Società locale', shop: 'gas' }, 6.5),
    nodo(41, { name: 'Baccotabacco', shop: 'newsagent' }, 7),
  ];
  const [{ json: r }] = await fila({ mappa: mappa(el) });
  assert.deepEqual(r.fila.map((a) => a.nome), ['Fumetteria'], 'i supermercati restano fuori: sulla mappa la parola copre catene senza marchio, stirerie e telefonia');
  assert.equal(r.conti.categorie_escluse, 10);
});

test('doppioni: stesso negozio con due nomi o con l’apostrofo scritto diverso (collaudo m1)', async () => {
  const pos = (id, nome, lat, lon, shop) => ({ type: 'node', id, lat, lon, tags: { name: nome, shop } });
  const el = [
    pos(41, 'Groppi', 45.05053, 9.69657, 'bakery'),
    pos(42, 'Panetteria Groppi', 45.05061, 9.69650, 'bakery'),
    pos(43, 'forneria', 45.05057, 9.69646, 'bakery'),
    pos(44, "L' Enoteca - Maison du Cognac", 45.0540, 9.6950, 'wine'),
    pos(45, "L'enoteca - Maison du Cognac", 45.05418, 9.6950, 'wine'), // 20 m: la prende solo il nome scritto uguale
    pos(46, 'Macelleria Vicina', 45.05058, 9.69652, 'butcher'),
    { type: 'node', id: 48, lat: 45.0532, lon: 9.6917, tags: { name: 'Grano e Natura', shop: 'food', 'addr:street': 'Via Calzolai', 'addr:housenumber': '34' } },
    { type: 'node', id: 49, lat: 45.05322, lon: 9.69172, tags: { name: "La ca' di sass", shop: 'food', 'addr:street': 'Via Calzolai', 'addr:housenumber': '36/38' } },
    pos(47, 'Groppi', 45.0600, 9.7000, 'bakery'),
    { type: 'node', id: 50, lat: 45.0560, lon: 9.6900, tags: { name: 'Panetteria', shop: 'bakery', 'addr:housenumber': '10' } },
    { type: 'node', id: 51, lat: 45.05603, lon: 9.6900, tags: { name: 'Panetteria Rossi', shop: 'bakery', 'addr:housenumber': '12' } },
    { type: 'node', id: 54, lat: 45.0580, lon: 9.6900, tags: { name: 'Drogheria', shop: 'chemist' } },
    { type: 'node', id: 55, lat: 45.05805, lon: 9.6900, tags: { name: 'La Pecora Nera', shop: 'chemist' } },
    { type: 'node', id: 56, lat: 45.0590, lon: 9.6900, tags: { name: 'M', shop: 'clothes' } },
    { type: 'node', id: 57, lat: 45.05909, lon: 9.6900, tags: { name: 'Moda M', shop: 'clothes' } },
    { type: 'node', id: 58, lat: 45.0600, lon: 9.6800, tags: { name: 'Macelleria', shop: 'butcher' } },
    { type: 'node', id: 59, lat: 45.06004, lon: 9.6800, tags: { name: 'Bar Sport Centro', amenity: 'bar' } },
    { type: 'node', id: 52, lat: 45.0570, lon: 9.6900, tags: { name: 'Forno Bianchi', shop: 'bakery' } },
    { type: 'node', id: 53, lat: 45.05704, lon: 9.6900, tags: { name: 'Pane di Casa', shop: 'bakery' } },
  ];
  const [{ json: r }] = await fila({ mappa: mappa(el), cfg: { QUANTE_A_SETTIMANA: 30 } });
  assert.equal(r.conti.doppioni, 4);
  const nomi = r.fila.map((a) => a.nome);
  assert.equal(nomi.filter((n) => /Groppi|forneria/.test(n)).length, 2, 'il Groppi lontano 1 km è un altro negozio');
  assert.ok(nomi.includes('Macelleria Vicina'), 'un negozio di altro tipo accanto non è un doppione');
  assert.ok(nomi.includes('Grano e Natura') && nomi.includes("La ca' di sass"), 'due negozi dello stesso tipo a 3 m, con civici diversi, restano due');
  assert.ok(nomi.includes('Panetteria') && nomi.includes('Panetteria Rossi'), 'nome dentro l’altro ma civici diversi: due negozi');
  assert.ok(nomi.includes('Forno Bianchi') && nomi.includes('Pane di Casa'), 'stesso tipo a 4 m con due nomi veri: due negozi');
  assert.ok(nomi.includes('La Pecora Nera') && !nomi.includes('Drogheria'), 'fra due doppioni resta il nome vero, anche se il generico viene prima sulla mappa');
  assert.ok(nomi.includes('M') && nomi.includes('Moda M'), 'un nome di una lettera non è «dentro» un altro nome');
  assert.ok(nomi.includes('Macelleria') && nomi.includes('Bar Sport Centro'), 'un nome generico accanto a un negozio di altro tipo non è un doppione');
  assert.ok(nomi.includes('forneria') === false && nomi.includes('panetteria groppi') === false && nomi.includes('Groppi'), 'del forno Groppi resta il nome vero');
  assert.equal(nomi.filter((n) => /Enoteca/i.test(n)).length, 1);
});

test('gli stati: valgono solo le parole giuste; le frasi e i segni non si indovinano, si contano e si mostrano (collaudo G1, ricollaudo G1-bis)', async () => {
  const righe = [
    ['Visitata', 'A'], ['sì', 'B'], [' si ', 'C'], ['iscritto', 'D'], ['visitata ✓', 'E'], ['', 'F'], ['da_visitare', 'G'],
    ['no grazie', 'H'], ['Sì, iscritta', 'I'], ['boh', 'L'], ['sì, non ancora iscritta', 'M'], ['non visitata', 'N'], ['✅', 'O'], ['ok', 'P'],
  ].map(([stato, nome], k) => ({ osm: `node/${200 + k}`, nome: `Negozio ${nome}`, stato, id: k, createdAt: '2026-11-27T00:45:00.000Z', updatedAt: '2026-11-27T00:45:00.000Z' }));
  const [{ json: r }] = await fila({ proposte: proposte(righe) });
  assert.deepEqual(r.conti.stati_finora, { visitata: 2, si: 2, iscritta: 1, da_visitare: 2, non_capito: 7 });
  assert.equal(r.conti.stati_non_capiti.length, 5, 'al massimo 5 nomi nel messaggio');
  assert.deepEqual(r.conti.stati_non_capiti[0], { nome: 'Negozio H', stato: 'no grazie' });
  const msg = await eseguiCodice(COMPONI, { nodi: { Config: cfg(), 'Metti in fila': [{ json: r }], 'Prepara il lavoro': [{ json: {} }] } });
  assert.match(msg[0].json.messaggio, /14 proposte · 5 visitate · 3 hanno detto sì · 1 iscritte · 7 con uno stato che non capisco: Negozio H \(«no grazie»\), Negozio I \(«Sì, iscritta»\)/);
  assert.match(msg[0].json.messaggio, /scrivi solo visitata, si, no o iscritta/);
});

test('tabella che non risponde: niente lista, e il messaggio lo dice (collaudo m7)', async () => {
  const [{ json: r }] = await fila({ proposte: [{ json: { error: { message: 'Data table not found' } } }] });
  assert.equal(r.letta, false);
  assert.match(r.motivo, /tabella «Attività da visitare» non ha risposto/);
  const msg = await eseguiCodice(COMPONI, { nodi: { Config: cfg(), 'Metti in fila': [{ json: r }], 'Prepara il lavoro': [{ json: {} }] } });
  assert.match(msg[0].json.messaggio, /tabella «Attività da visitare» non ha risposto/);
  assert.deepEqual(await eseguiCodice(RIGHE, { nodi: { Config: cfg(), 'Metti in fila': [{ json: r }], 'Componi i messaggi': [{ json: { settimana: '2026-11-30' } }] } }), []);
});

test('terzo collaudo: la boutique «Metrò» non è il Metro all’ingrosso; elenco vuoto = mappa guasta (n.1 e n.5)', async () => {
  const el = [
    { type: 'node', id: 61, lat: 45.0540, lon: 9.6930, tags: { name: 'Metrò', shop: 'clothes', clothes: 'men', 'addr:street': 'Via Camillo Cavour', 'addr:housenumber': '35' } },
    { type: 'node', id: 63, lat: 45.0541, lon: 9.6931, tags: { name: 'Metrò', shop: 'clothes', clothes: 'women', 'addr:street': 'Via Camillo Cavour', 'addr:housenumber': '40' } },
    nodo(62, { name: 'Metro', shop: 'wholesale' }, 4),
    nodo(64, { name: 'Unknown', shop: 'clothes' }, 5),
  ];
  const [{ json: r }] = await fila({ mappa: mappa(el) });
  assert.deepEqual(r.fila.map((a) => a.indirizzo).sort(), ['Via Camillo Cavour 35', 'Via Camillo Cavour 40'], 'due negozi con lo stesso nome e civici diversi restano due');
  assert.equal(r.conti.catene, 0);
  assert.equal(r.conti.senza_nome, 1, '«Unknown» non è un nome');
  const [{ json: v }] = await fila({ mappa: mappa([]) });
  assert.equal(v.letta, false);
  assert.match(v.motivo, /senza nessuna attività/);
  const msg = await eseguiCodice(COMPONI, { nodi: { Config: cfg(), 'Metti in fila': [{ json: v }], 'Prepara il lavoro': [{ json: {} }] } });
  assert.doesNotMatch(msg[0].json.messaggio, /\b0 attività/);
});

test('terzo collaudo: il 429 vero arriva come errore, e si dice in italiano (n.2)', async () => {
  for (const errore of [
    'Try spacing your requests out using the batching settings under "Options"',
    { message: 'The service is receiving too many requests from you', description: 'Try spacing your requests out', httpCode: '429' },
  ]) {
    const [{ json: r }] = await fila({ mappa: [{ json: { error: errore } }] });
    assert.equal(r.letta, false);
    assert.equal(r.motivo, 'la mappa ha detto «troppe richieste» anche dopo 3 tentativi');
  }
  const [{ json: t }] = await fila({ mappa: [{ json: { error: { message: 'timeout of 150000ms exceeded', code: 'ETIMEDOUT' } } }] });
  assert.match(t.motivo, /non ha risposto in tempo/);
});

test('terzo collaudo: righe doppie contano una volta; un nome già proposto non torna col punto ridisegnato; le emoji non si spezzano (n.3, n.6, n.7)', async () => {
  const base = [{ osm: 'node/301', nome: 'Polleria Bonatti', indirizzo: 'Via Calzolai 40', stato: 'no' }, { osm: 'node/302', nome: 'Forno Due', stato: 'visitata' }, { osm: 'node/304', nome: 'Macelleria', stato: 'no' },
    { osm: 'node/305', nome: "L'Arte della Pizza", indirizzo: 'Via Camillo Cavour 58', stato: 'da_visitare' }, { osm: 'node/306', nome: 'Lavasecco', indirizzo: 'Via Pietro Giordani 15', stato: 'da_visitare' },
    { osm: 'node/307', nome: 'Macelleria', indirizzo: 'Via Roma', stato: 'no' }];
  const righe = [...base, ...base, { osm: 'node/303', nome: `${'x'.repeat(59)}😀😀`, stato: `${'y'.repeat(59)}😀😀` }];
  const el = [nodo(1234, { name: 'Polleria Bonatti', shop: 'butcher', 'addr:street': 'Via Calzolai', 'addr:housenumber': '40' }, 3), nodo(1235, { name: 'Macelleria', shop: 'butcher' }, 9),
    nodo(1236, { name: "L'Arte della Pizza", amenity: 'restaurant', 'addr:street': 'Corso Vittorio Emanuele Secondo', 'addr:housenumber': '137' }, 12),
    nodo(1237, { name: 'Lavasecco', shop: 'dry_cleaning', 'addr:street': 'Via Campagna', 'addr:housenumber': '54' }, 15),
    nodo(1238, { name: 'Polleria Bonatti', shop: 'butcher' }, 30),
    nodo(1239, { name: "L'Arte della Pizza", amenity: 'restaurant', 'addr:street': 'Via Camillo Cavour', 'addr:housenumber': '60' }, 18),
    nodo(1240, { name: 'Macelleria', shop: 'butcher', 'addr:street': 'Via Roma', 'addr:housenumber': '50' }, 21)];
  const [{ json: r }] = await fila({ mappa: mappa(el), proposte: proposte(righe) });
  assert.deepEqual(r.conti.stati_finora, { no: 3, visitata: 1, non_capito: 1, da_visitare: 2 });
  assert.equal(r.conti.proposte_finora, 7);
  assert.ok(r.fila.some((a) => a.osm === 'node/1239'), 'stesso nome e stessa via ma civico diverso: un altro negozio');
  assert.ok(r.fila.some((a) => a.osm === 'node/1240'), 'un nome generico non riconosce un negozio come già proposto');
  assert.ok(r.fila.some((a) => a.nome === "L'Arte della Pizza") && r.fila.some((a) => a.nome === 'Lavasecco'), 'stesso nome in un’altra via: è un altro negozio, non si perde');
  assert.ok(r.fila.some((a) => a.osm === 'node/1238'), 'stesso nome senza indirizzo: non c’è la prova che sia lo stesso, resta in fila');
  assert.ok(r.fila.some((a) => a.nome === 'Macelleria'), 'un nome generico già proposto non blocca un’altra macelleria');
  assert.ok(!r.fila.some((a) => a.osm === 'node/1234'), 'già proposta: stesso nome e stesso indirizzo, anche se la mappa le ha cambiato identificativo');
  assert.equal(r.conti.gia_proposte, 1);
  const nc = r.conti.stati_non_capiti[0];
  for (const v of [nc.nome, nc.stato]) assert.doesNotMatch(v, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  const msg = await eseguiCodice(COMPONI, { nodi: { Config: cfg(), 'Metti in fila': [{ json: r }], 'Prepara il lavoro': [{ json: {} }] } });
  assert.match(msg[0].json.messaggio, /7 proposte · 4 visitate · 0 hanno detto sì · 0 iscritte · 1 con uno stato/, 'il «no» conta fra le visitate');
});

test('terzo collaudo: dossier solo per alcune, identificativo senza «node/», avvisi e fonte dell’AD (n.4)', async () => {
  const f = await filaPronta();
  const parziale = [{ json: { ok: true, avvisi: ['Due indirizzi della mappa sono vecchi'], risultato: { schede: f.fila.slice(0, 2).map((a, k) => ({ osm: k === 0 ? a.osm.split('/')[1] : a.osm, chi_e: `Scheda ${k}`, cosa_ci_guadagna: 'g', come_convincerlo: 'c', cosa_proporre: 'p', fonte: 'https://esempio.it/a?b=1&c=2' })) } } }];
  const out = await eseguiCodice(COMPONI, { nodi: { Config: cfg(), 'Metti in fila': [{ json: f }], 'Prepara il lavoro': [{ json: {} }], 'Chiedi all’AD i dossier': parziale } });
  const tutto = out.map((o) => o.json.messaggio).join('\n');
  assert.match(tutto, new RegExp(`Senza il dossier dell’AD: ${f.fila.length - 2} attività su ${f.fila.length}`));
  assert.equal((tutto.match(/<i>Senza il dossier dell’AD\.<\/i>/g) || []).length, f.fila.length - 2, 'e lo dice sotto ogni attività senza dossier');
  assert.match(tutto, /Chi è: Scheda 0/, 'riconosciuta anche senza «node/»');
  assert.match(tutto, /Avvisi dell’AD: Due indirizzi della mappa sono vecchi/);
  assert.match(tutto, /<a href="https:\/\/esempio\.it\/a\?b=1&amp;c=2">Fonte del dossier<\/a>/);
  const righe = await eseguiCodice(RIGHE, { nodi: { Config: cfg(), 'Metti in fila': [{ json: f }], 'Componi i messaggi': [{ json: { settimana: '2026-11-30' } }], 'Chiedi all’AD i dossier': parziale } });
  assert.match(righe[0].json.dossier, /Chi è: Scheda 0/);
  assert.match(righe[0].json.dossier, /Fonte: https:\/\/esempio\.it/);
});

test('terzo collaudo: ogni testo che arriva da fuori è protetto nell’HTML di Telegram (n.10)', async () => {
  const brutto = 'A<b>&"x';
  const f = { letta: true, fila: [{ osm: 'node/1', nome: brutto, tipo: brutto, indirizzo: brutto, telefono: brutto, perche: brutto, offerta: brutto, distanza_m: 10, mappa: 'https://www.google.com/maps/search/?api=1&query=A"<b>' }],
    conti: { letti: 1, in_fila: 1, per_segmento: {}, negozi_mycity_letti: 1, proposte_finora: 1, stati_finora: { non_capito: 1 }, stati_non_capiti: [{ nome: brutto, stato: brutto }] } };
  const ad = [{ json: { ok: true, avvisi: [brutto], risultato: { schede: [{ osm: 'node/1', chi_e: brutto, cosa_vende: brutto, cosa_ci_guadagna: brutto, come_convincerlo: brutto, cosa_proporre: brutto, attenzione: brutto }] } } }];
  const pulito = (m) => m.replace(/<\/?(b|i)>|<a href="[^"<>]*">|<\/a>/g, '');
  const out = await eseguiCodice(COMPONI, { nodi: { Config: cfg(), 'Metti in fila': [{ json: f }], 'Prepara il lavoro': [{ json: {} }], 'Chiedi all’AD i dossier': ad } });
  for (const o of out) { assert.doesNotMatch(pulito(o.json.messaggio), /[<>"]/); assert.doesNotMatch(o.json.messaggio, /&(?!amp;|lt;|gt;|quot;)/); }
  const senza = await eseguiCodice(COMPONI, { nodi: { Config: cfg(), 'Metti in fila': [{ json: f }], 'Prepara il lavoro': [{ json: {} }], 'Chiedi all’AD i dossier': [{ json: { ok: false, errore: brutto } }] } });
  for (const o of senza) assert.doesNotMatch(pulito(o.json.messaggio), /[<>"]/);
  const nonLetta = await eseguiCodice(COMPONI, { nodi: { Config: cfg(), 'Metti in fila': [{ json: { letta: false, motivo: brutto, fila: [], conti: null } }], 'Prepara il lavoro': [{ json: {} }] } });
  assert.doesNotMatch(pulito(nonLetta[0].json.messaggio), /[<>"]/);
});

test('quante a settimana: il tetto del Config, mai oltre 30', async () => {
  const [{ json: r }] = await fila({ cfg: { QUANTE_A_SETTIMANA: 2 } });
  assert.equal(r.fila.length, 2);
  const tanti = Array.from({ length: 40 }, (_, i) => nodo(1000 + i, { name: `Bottega numero ${i}`, shop: 'deli' }, 1 + i * 0.2)); // 22 m l'una dall'altra
  const [{ json: t }] = await fila({ cfg: { QUANTE_A_SETTIMANA: 500 }, mappa: mappa(tanti) });
  assert.equal(t.fila.length, 30);
});

test('mappa che non risponde: «non letta», mai «zero attività» (scorciatoie #10)', async () => {
  for (const [nome, risposta, attesa] of [
    ['429', [{ json: { statusCode: 429, body: 'rate limited' } }], /429/],
    ['errore di rete', [{ json: { error: { message: 'ECONNRESET' } } }], /non ha risposto/],
    ['html', [{ json: { statusCode: 200, body: '<html>errore</html>' } }], /illeggibile/],
    ['remark', [{ json: { statusCode: 200, body: JSON.stringify({ elements: [], remark: 'runtime error: Query timed out' }) } }], /fermata/],
  ]) {
    const [{ json: r }] = await fila({ mappa: risposta });
    assert.equal(r.letta, false, nome);
    assert.match(r.motivo, attesa, nome);
    assert.equal(r.conti, null);
  }
});

test('il database di MyCity che non risponde non ferma la fila, e il messaggio lo dice', async () => {
  const [{ json: r }] = await fila({ negozi: [{ json: { statusCode: 500, body: 'errore' } }] });
  assert.equal(r.letta, true);
  assert.equal(r.conti.negozi_mycity_letti, 0);
  const msg = await eseguiCodice(COMPONI, { nodi: { Config: cfg(), 'Metti in fila': [{ json: r }], 'Prepara il lavoro': [{ json: {} }] } });
  assert.match(msg[0].json.messaggio, /database di MyCity non ha risposto/);
});

const filaPronta = async () => (await fila())[0].json;

test('il lavoro per l’AD: in prova o senza mappa non parte; in vero porta le attività e il listino', async () => {
  const f = await filaPronta();
  const [{ json: v }] = await eseguiCodice(LAVORO, { nodi: { Config: cfg(), 'Metti in fila': [{ json: f }] } });
  assert.equal(v.flusso, '16 · Attività da visitare');
  assert.equal(v.non_mandare, undefined);
  assert.equal(v.dati.attivita.length, f.fila.length);
  assert.match(v.dati.listino, /10%/);
  assert.match(v.compito, /non suggerire mai messaggi WhatsApp o email a freddo/);
  assert.match(v.compito, /Non dire mai «zero commissioni»/);
  for (const [k, def] of Object.entries(v.schema.properties.schede.items.properties)) if (k !== 'osm') assert.equal(def.maxLength, 500, `${k}: il tetto dichiarato all’AD (ricollaudo R9)`);
  const [{ json: p }] = await eseguiCodice(LAVORO, { nodi: { Config: cfg({ MODALITA: 'prova' }), 'Metti in fila': [{ json: f }] } });
  assert.match(p.non_mandare, /prova/);
  const [{ json: n }] = await eseguiCodice(LAVORO, { nodi: { Config: cfg(), 'Metti in fila': [{ json: { letta: false, fila: [] } }] } });
  assert.match(n.non_mandare, /mappa/);
  const [{ json: z }] = await eseguiCodice(LAVORO, { nodi: { Config: cfg(), 'Metti in fila': [{ json: { letta: true, fila: [] } }] } });
  assert.match(z.non_mandare, /nessuna attività/);
});

test('il tetto dei 64 KB si misura in byte, non in caratteri (scorciatoie #39)', async () => {
  const lunga = 'è'.repeat(1500); // 1500 caratteri, 3000 byte
  const f = { letta: true, fila: Array.from({ length: 30 }, (_, i) => ({ osm: `node/${i}`, nome: `N${i}`, perche: lunga })) };
  const [{ json: l }] = await eseguiCodice(LAVORO, { nodi: { Config: cfg(), 'Metti in fila': [{ json: f }] } });
  assert.ok(Buffer.byteLength(JSON.stringify(l), 'utf8') <= 50000, 'sta sotto i 50.000 byte');
  assert.ok(JSON.stringify(l).length < 50000);
  assert.ok(l.dati.attivita.length < 30 && l.dati.attivita.length > 0);
});

const ad = (f) => [{ json: { ok: true, risultato: { schede: f.fila.map((a) => ({ osm: a.osm, chi_e: `Bottega storica <${a.nome}>`, cosa_vende: 'carne', cosa_ci_guadagna: 'clienti nuovi', come_convincerlo: 'canone sospeso', cosa_proporre: 'vetrina', attenzione: '' })) } } }];

test('i messaggi: col dossier dell’AD, testo protetto, mai oltre il limite di Telegram', async () => {
  const f = await filaPronta();
  const out = await eseguiCodice(COMPONI, { nodi: { Config: cfg(), 'Metti in fila': [{ json: f }], 'Prepara il lavoro': [{ json: {} }], 'Chiedi all’AD i dossier': ad(f) } });
  const tutto = out.map((o) => o.json.messaggio).join('\n');
  assert.ok(out.every((o) => o.json.manda === true && o.json.con_dossier === true));
  assert.match(tutto, /Sulla mappa ci sono 13 attività entro 5 km/);
  assert.match(tutto, /Bottega storica &lt;Macelleria Bersani&gt;/);
  assert.match(tutto, /Frutta &amp; Verdura Da Gino/);
  assert.match(tutto, /Il conto finora: 2 proposte · 2 visitate · 1 hanno detto sì · 0 iscritte/);
  assert.match(tutto, /niente messaggi automatici/);
  assert.ok(out.every((o) => o.json.messaggio.length <= 4096));
  // Trenta attività con dossier lunghi: più messaggi, ognuno sotto il limite.
  const tante = { ...f, fila: Array.from({ length: 30 }, (_, i) => ({ ...f.fila[0], osm: `node/${i}`, nome: `Bottega ${i}` })) };
  const lungo = [{ json: { ok: true, risultato: { schede: tante.fila.map((a) => ({ osm: a.osm, chi_e: 'x'.repeat(300), cosa_ci_guadagna: 'y'.repeat(300), come_convincerlo: 'z'.repeat(300), cosa_proporre: 'w'.repeat(300) })) } } }];
  const molti = await eseguiCodice(COMPONI, { nodi: { Config: cfg(), 'Metti in fila': [{ json: tante }], 'Prepara il lavoro': [{ json: {} }], 'Chiedi all’AD i dossier': lungo } });
  assert.ok(molti.length > 1);
  assert.ok(molti.every((o) => o.json.messaggio.length <= 4096));
  assert.equal(molti.map((o) => o.json.messaggio).join('').match(/Apri su Google Maps/g).length, 30, 'nessuna attività persa fra un messaggio e l’altro');
});

test('dossier molto più lunghi del chiesto: nessun tag tagliato, nessun messaggio oltre 4.096, nessuna attività persa (collaudo m6, M7, M8)', async () => {
  const f = await filaPronta();
  // Le lunghezze da 200 a 400 fanno blocchi di circa 2.000 caratteri: due insieme cadono fra 4.096 e 4.300 (collaudo M8).
  for (const lung of [...Array.from({ length: 29 }, (_, k) => 200 + k * 7), 665, 700, 2000, 5000]) {
    const lungo = [{ json: { ok: true, risultato: { schede: f.fila.map((a) => ({ osm: a.osm, chi_e: 'à'.repeat(lung), cosa_vende: 'v'.repeat(lung), cosa_ci_guadagna: 'g&'.repeat(lung), come_convincerlo: 'c<'.repeat(lung), cosa_proporre: 'p'.repeat(lung), attenzione: 'a'.repeat(lung) })) } } }];
    const out = await eseguiCodice(COMPONI, { nodi: { Config: cfg(), 'Metti in fila': [{ json: f }], 'Prepara il lavoro': [{ json: {} }], 'Chiedi all’AD i dossier': lungo } });
    for (const o of out) {
      const m = o.json.messaggio;
      assert.ok(m.length <= 4096, `campi da ${lung}: messaggio di ${m.length}`);
      for (const tag of ['b', 'i', 'a']) assert.equal((m.match(new RegExp(`<${tag}[ >]`, 'g')) || []).length, (m.match(new RegExp(`</${tag}>`, 'g')) || []).length, `campi da ${lung}: <${tag}> aperti e chiusi`);
      assert.doesNotMatch(m.replace(/<\/?(b|i)>|<a href="[^"<>]*">|<\/a>/g, ''), /[<>]/, `campi da ${lung}: niente < o > fuori dai tag`);
    }
    assert.equal(out.map((o) => o.json.messaggio).join('').match(/Apri su Google Maps/g).length, f.fila.length, `campi da ${lung}: tutti i link`);
  }
});

test('un campo tagliato non spezza mai un’emoji a metà (ricollaudo)', async () => {
  const f = await filaPronta();
  const emoji = [{ json: { ok: true, risultato: { schede: f.fila.map((a) => ({ osm: a.osm, chi_e: `${'x'.repeat(498)}😀😀😀`, cosa_ci_guadagna: '😀'.repeat(600), come_convincerlo: 'c', cosa_proporre: 'p' })) } } }];
  const out = await eseguiCodice(COMPONI, { nodi: { Config: cfg(), 'Metti in fila': [{ json: f }], 'Prepara il lavoro': [{ json: {} }], 'Chiedi all’AD i dossier': emoji } });
  for (const o of out) assert.doesNotMatch(o.json.messaggio, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/, 'nessuna metà di emoji');
});

test('i messaggi senza AD e con la mappa non letta: lo dicono; in prova non si manda', async () => {
  const f = await filaPronta();
  const senza = await eseguiCodice(COMPONI, { nodi: { Config: cfg(), 'Metti in fila': [{ json: f }], 'Prepara il lavoro': [{ json: { non_mandare: 'x' } }], 'Chiedi all’AD i dossier': [{ json: { ok: false, errore: 'tetto delle corse raggiunto' } }] } });
  assert.match(senza[0].json.messaggio, /Senza il dossier dell’AD: tetto delle corse raggiunto/);
  assert.match(senza.map((o) => o.json.messaggio).join(''), /Da proporre: sito, social \(da verificare/);
  const nonLetta = await eseguiCodice(COMPONI, { nodi: { Config: cfg(), 'Metti in fila': [{ json: { letta: false, motivo: 'la mappa ha risposto 504', fila: [], conti: null } }], 'Prepara il lavoro': [{ json: {} }] } });
  assert.equal(nonLetta.length, 1);
  assert.match(nonLetta[0].json.messaggio, /la mappa ha risposto 504/);
  assert.match(nonLetta[0].json.messaggio, /Non vuol dire che non ci sono attività/);
  assert.doesNotMatch(nonLetta[0].json.messaggio, /\b0 attività/);
  const prova = await eseguiCodice(COMPONI, { nodi: { Config: cfg({ MODALITA: 'prova' }), 'Metti in fila': [{ json: f }], 'Prepara il lavoro': [{ json: {} }] } });
  assert.ok(prova.every((o) => o.json.manda === false));
  assert.match(prova[0].json.messaggio, /· prova/);
});

test('le righe della tabella: solo in vero e con la mappa letta; stato «da_visitare» e il dossier dentro', async () => {
  const f = await filaPronta();
  const m = [{ json: { settimana: '2026-11-30' } }];
  const righe = await eseguiCodice(RIGHE, { nodi: { Config: cfg(), 'Metti in fila': [{ json: f }], 'Componi i messaggi': m, 'Chiedi all’AD i dossier': ad(f) } });
  assert.equal(righe.length, f.fila.length);
  assert.equal(righe[0].json.osm, 'node/1');
  assert.equal(righe[0].json.stato, 'da_visitare');
  assert.equal(righe[0].json.settimana, '2026-11-30');
  assert.match(righe[0].json.dossier, /Chi è: Bottega storica/);
  assert.match(righe[0].json.proposta_il, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.deepEqual(await eseguiCodice(RIGHE, { nodi: { Config: cfg({ MODALITA: 'prova' }), 'Metti in fila': [{ json: f }], 'Componi i messaggi': m } }), []);
  assert.deepEqual(await eseguiCodice(RIGHE, { nodi: { Config: cfg(), 'Metti in fila': [{ json: { letta: false, fila: [] } }], 'Componi i messaggi': m } }), []);
});

test('il flusso: controlli a posto, lunedì alle 7:10, tabella giusta, nessuna cancellazione, nessun canale verso le attività', () => {
  const w = costruisci({ telegram: { id: 't', name: 'Telegram' }, chatId: '1', errorWorkflow: 'e', chiedi: 'c', marketplace: 'm' });
  assert.deepEqual(controlla(w), []);
  assert.equal(w.name, '16 · Attività da visitare');
  assert.equal(w.nodes.find((n) => n.type === 'n8n-nodes-base.scheduleTrigger').parameters.rule.interval[0].expression, '10 7 * * 1');
  assert.equal(w.settings.timezone, 'Europe/Rome');
  const tabelle = w.nodes.filter((n) => n.type === 'n8n-nodes-base.dataTable');
  assert.ok(tabelle.every((n) => n.parameters.dataTableId.value === TABELLA_ID));
  assert.deepEqual(tabelle.map((n) => n.parameters.operation).sort(), ['get', 'insert']);
  const cfgNodo = w.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments;
  assert.equal(cfgNodo.find((a) => a.name === 'MODALITA').value, 'prova', 'nasce in prova');
  // I due punti che fanno girare il flusso dentro n8n e che le prove del codice non vedono (collaudo M9 e M10).
  const lettura = w.nodes.find((n) => n.name === 'Leggi le attività già proposte');
  assert.equal(lettura.alwaysOutputData, true, 'il primo lunedì la tabella è vuota: senza questa riga il flusso si ferma');
  assert.equal(lettura.parameters.returnAll, true, 'senza returnAll n8n ne legge 50: dalla settimana 6 le proposte tornerebbero in fila');
  assert.equal(lettura.executeOnce, true);
  assert.equal(lettura.onError, undefined, 'tabella che non risponde: il flusso si ferma e avvisa il 99; con «continua» n8n passa avanti l’uscita di prima (ricollaudo m7)');
  assert.equal(w.nodes.find((n) => n.name === 'Chiedi alla mappa').onError, 'continueRegularOutput', 'mappa che non risponde: il messaggio «la lista non c’è» deve arrivare (ricollaudo R2)');
  const mappaNodo = w.nodes.find((n) => n.name === 'Chiedi alla mappa');
  assert.equal(mappaNodo.parameters.options.response.response.neverError, false, 'con neverError un 429 non si riprova (collaudo m8)');
  assert.equal(mappaNodo.retryOnFail, true);
  assert.equal(mappaNodo.parameters.options.response.response.responseFormat, 'text', 'il codice legge il testo in `data`');
  assert.equal(w.nodes.find((n) => n.name === 'Metti in fila').executeOnce, true);
  // Le mutazioni che il controllo deve fermare.
  const conWhatsapp = { ...w, nodes: [...w.nodes, { name: 'Scrivi al negozio', type: 'n8n-nodes-base.whatsApp', parameters: {} }] };
  assert.ok(controlla(conWhatsapp).some((p) => /scriverebbe fuori/.test(p)));
  const conCancella = { ...w, nodes: w.nodes.map((n) => (n.name === 'Scrivi nella tabella' ? { ...n, parameters: { ...n.parameters, operation: 'deleteRows' } } : n)) };
  assert.ok(controlla(conCancella).some((p) => /non si cancella/.test(p)));
  const altraChat = { ...w, nodes: w.nodes.map((n) => (n.name === 'Manda a Nicola' ? { ...n, parameters: { ...n.parameters, chatId: '12345' } } : n)) };
  assert.ok(controlla(altraChat).some((p) => /chat di Nicola/.test(p)));
});
