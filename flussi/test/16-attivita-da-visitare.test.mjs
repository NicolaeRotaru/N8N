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
const mappa = (elements) => [{ json: { statusCode: 200, body: JSON.stringify({ version: 0.6, elements }) } }];
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

test('quante a settimana: il tetto del Config, mai oltre 30', async () => {
  const [{ json: r }] = await fila({ cfg: { QUANTE_A_SETTIMANA: 2 } });
  assert.equal(r.fila.length, 2);
  const tanti = Array.from({ length: 40 }, (_, i) => nodo(1000 + i, { name: `Bottega numero ${i}`, shop: 'deli' }, (i % 9) + 1));
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
  // Le mutazioni che il controllo deve fermare.
  const conWhatsapp = { ...w, nodes: [...w.nodes, { name: 'Scrivi al negozio', type: 'n8n-nodes-base.whatsApp', parameters: {} }] };
  assert.ok(controlla(conWhatsapp).some((p) => /scriverebbe fuori/.test(p)));
  const conCancella = { ...w, nodes: w.nodes.map((n) => (n.name === 'Scrivi nella tabella' ? { ...n, parameters: { ...n.parameters, operation: 'deleteRows' } } : n)) };
  assert.ok(controlla(conCancella).some((p) => /non si cancella/.test(p)));
  const altraChat = { ...w, nodes: w.nodes.map((n) => (n.name === 'Manda a Nicola' ? { ...n, parameters: { ...n.parameters, chatId: '12345' } } : n)) };
  assert.ok(controlla(altraChat).some((p) => /chat di Nicola/.test(p)));
});
