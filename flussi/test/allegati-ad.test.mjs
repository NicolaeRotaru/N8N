// Le prove degli allegati di «Chiedi all'AD»: controllo e tetti, la richiesta con i soli indirizzi, le righe con
// l'impronta (mai il gettone), la memoria che non dipende dal gettone, un lavoro senza allegati identico a prima,
// la consegna (testo, immagine, file dell'officina, 404) e i due flussi costruiti. Dati finti.
// Si lancia con: node --test "flussi/test/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { eseguiCodice } from './esegui-codice.mjs';
import { costruisci, controlla, PARTI, ASPETTA, TABELLA_ALLEGATI, URL_ALLEGATI } from '../chiedi-all-ad/costruisci.mjs';
import { costruisciAllegati, controllaAllegati, PERCORSO_ALLEGATI, TABELLA_ALLEGATI as TABELLA_SERVE, COLONNE_ALLEGATI } from '../chiedi-all-ad/allegati.mjs';

const leggi = (nome) => readFileSync(new URL(`../chiedi-all-ad/codice/${nome}`, import.meta.url), 'utf8');
const ALLEGATI = leggi('allegati-lavoro.js');
const PREPARA = leggi('prepara-lavoro.js');
const COSA = leggi('cosa-mandare.js');
const CFG = { MODALITA: 'vero', ROUTINE_ID: 'trig_x', TETTO_GIORNO: 40, TETTO_ORA: 25, ATTESA_MINUTI: 15, PROVA_ATTESA_MINUTI: 2, ALLEGATI_URL: URL_ALLEGATI };
const ESECUZIONE = { resumeUrl: 'https://n8n-shdy.sliplane.app/webhook-waiting/77?signature=x', id: '77' };
const lavoro = (extra = {}) => ({ json: { flusso: '31 · Montatore', compito: 'Scrivi il piano del mese', dati: { mese: '2026-12' }, schema: { type: 'object' }, ...extra } });
const allegatiDi = (lavori) => eseguiCodice(ALLEGATI, { nodi: { 'Da un altro flusso': lavori } });
// Gettoni e impronte come li darebbero i due nodi Crypto: un gettone casuale e il suo SHA-256.
let conta = 0;
const conGettoni = (voci) => voci.map((v) => {
  const gettone = createHash('sha256').update(`g${conta++}`).digest('hex');
  return { json: { ...v.json, gettone, impronta: createHash('sha256').update(gettone).digest('hex') } };
});
const prepara = async (lavori, { cfg = CFG, statico = {}, impronte } = {}) => {
  const imp = impronte ?? conGettoni(await allegatiDi(lavori));
  return eseguiCodice(PREPARA, { nodi: { Config: [{ json: cfg }], 'Da un altro flusso': lavori, Impronte: imp }, statico, execution: ESECUZIONE });
};
const CATALOGO = 'V01.1 · bancone, largo · «Benvenuti da noi» 0,5–2,0 s\n'.repeat(8000); // circa 430 KB
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
// Un'immagine png finta di n byte (comincia come un png vero).
const png = (n) => Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(n - 8, 7)]).toString('base64');
const JPG = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(20, 1)]).toString('base64');
// Valuta l'espressione di un nodo IF ({{ … }}) con un $json dato.
const valuta = (espr, $json) => new Function('$json', `return (${String(espr).replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '')});`)($json);
const PRIMA = readFileSync(new URL('./fixture/prepara-lavoro-prima-degli-allegati.js', import.meta.url), 'utf8');

test('allegati: si controllano e si mettono in fila; senza allegati esce un elemento «nessuno»', async () => {
  assert.deepEqual((await allegatiDi([lavoro()])).map((x) => x.json), [{ nessuno: true }]);
  const fila = await allegatiDi([lavoro({ allegati: [
    { nome: 'catalogo', tipo: 'testo', contenuto: 'ciao' },
    { nome: 'logo', tipo: 'immagine', base64: PNG, mime: 'image/png' },
    { nome: 'provino 1', tipo: 'officina', percorso: '/file/ab12-cd/provino-1.jpg', mime: 'image/jpeg' },
  ] })]);
  assert.deepEqual(fila.map((x) => [x.json.lavoro, x.json.n, x.json.tipo, x.json.nome]), [[0, 0, 'testo', 'catalogo'], [0, 1, 'immagine', 'logo'], [0, 2, 'officina', 'provino 1']]);
  assert.equal(fila[2].json.contenuto, '/file/ab12-cd/provino-1.jpg');
  assert.equal(fila[2].json.mime, 'image/jpeg', 'il tipo del file dell\'officina viene dall\'estensione');
  assert.deepEqual(fila.map((x) => x.json.salvati), [4, PNG.length, 1024], 'si conta quello che va nella tabella');
});

test('allegati: tetti e forme sbagliate fermano il lavoro col motivo, niente si tronca', async () => {
  const errore = async (allegati) => (await allegatiDi([lavoro({ allegati })]))[0].json.errore || '';
  assert.match(await errore([{ nome: 'grande', tipo: 'testo', contenuto: 'x'.repeat(512 * 1024 + 1) }]), /il massimo per un testo è 524288/);
  assert.equal(await errore([{ nome: 'giusto', tipo: 'testo', contenuto: 'x'.repeat(512 * 1024) }]), '');
  assert.equal(await errore([{ nome: 'al limite', tipo: 'immagine', base64: png(1536 * 1024), mime: 'image/png' }]), '');
  assert.match(await errore([{ nome: 'enorme', tipo: 'immagine', base64: png(1536 * 1024 + 1), mime: 'image/png' }]), /1572865 byte, il massimo per un'immagine è 1572864/);
  assert.match(await errore([{ nome: 'rotta', tipo: 'immagine', base64: 'non è base64!' }]), /non è in base64/);
  assert.match(await errore([{ nome: 'monca', tipo: 'immagine', base64: 'AAAAA' }]), /non è in base64/, 'lunghezza non multipla di 4');
  assert.match(await errore([{ nome: 'finta', tipo: 'immagine', base64: Buffer.from('<html><script>x</script></html>').toString('base64'), mime: 'image/png' }]), /non è un'immagine image\/png/);
  assert.match(await errore([{ nome: 'scambiata', tipo: 'immagine', base64: JPG, mime: 'image/png' }]), /non è un'immagine image\/png/);
  assert.equal(await errore([{ nome: 'jpeg', tipo: 'immagine', base64: JPG, mime: 'image/jpeg' }]), '');
  const riff = (formato) => Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from(formato), Buffer.alloc(12, 1)]).toString('base64');
  assert.equal(await errore([{ nome: 'webp', tipo: 'immagine', base64: riff('WEBP'), mime: 'image/webp' }]), '');
  assert.match(await errore([{ nome: 'wav', tipo: 'immagine', base64: riff('WAVE'), mime: 'image/webp' }]), /non è un'immagine image\/webp/, 'un RIFF qualunque non è un webp');
  assert.match(await errore([{ nome: 'gif', tipo: 'immagine', base64: PNG, mime: 'image/gif' }]), /non ammesso/);
  for (const percorso of ['/file/x/../segreto', '/salute', 'http://officina.internal:8080/file/a/b.jpg', '/file/a/b/c.jpg', '/file//b.jpg', '/progetto/1/catalogo', '/file/a/.nascosto.jpg']) {
    assert.match(await errore([{ nome: 'p', tipo: 'officina', percorso }]), /percorso dell'officina/, percorso);
  }
  for (const percorso of ['/file/a/video.mp4', '/file/a/sottotitoli.srt', '/file/a/senza-estensione']) {
    assert.match(await errore([{ nome: 'p', tipo: 'officina', percorso }]), /solo immagini/, percorso);
  }
  assert.match(await errore([{ nome: 'x', tipo: 'video', contenuto: 'a' }]), /tipo «video» sconosciuto/);
  assert.match(await errore([{ tipo: 'testo', contenuto: 'a' }]), /manca il nome/);
  assert.match(await errore([{ nome: 'vuoto', tipo: 'testo', contenuto: '' }]), /vuoto/);
  assert.equal(await errore(Array.from({ length: 40 }, (_, i) => ({ nome: `t${i}`, tipo: 'testo', contenuto: 'a' }))), '', '40 vanno bene');
  assert.match(await errore(Array.from({ length: 41 }, (_, i) => ({ nome: `t${i}`, tipo: 'testo', contenuto: 'a' }))), /41 allegati.*massimo è 40/);
  // il tetto della corsa conta quello che va nella tabella: per le immagini il base64 (4/3 del file)
  const piena = Array.from({ length: 4 }, (_, i) => ({ nome: `f${i}`, tipo: 'immagine', base64: png(1536 * 1024), mime: 'image/png' }));
  assert.equal(await errore(piena), '', '4 × 2 MB di base64 = 8 MB esatti');
  assert.match(await errore([...piena, { nome: 'uno in più', tipo: 'testo', contenuto: 'x' }]), /occupano 8388609 byte nella tabella: il massimo è 8388608/);
  assert.match(await errore(Array.from({ length: 6 }, (_, i) => ({ nome: `f${i}`, tipo: 'immagine', base64: png(1400 * 1024), mime: 'image/png' }))), /il massimo è 8388608/, 'sotto il tetto per immagine, sopra quello della corsa');
  assert.match((await allegatiDi([lavoro({ allegati: 'catalogo' })]))[0].json.errore, /non sono una lista/);
});

test('un lavoro con allegati: nel messaggio solo nome, tipo e indirizzo; nelle righe l\'impronta, mai il gettone', async () => {
  const statico = {};
  const lav = lavoro({ allegati: [{ nome: 'catalogo', tipo: 'testo', contenuto: CATALOGO }, { nome: 'provino 1', tipo: 'officina', percorso: '/file/ab/p1.jpg', mime: 'image/jpeg' }] });
  const imp = conGettoni(await allegatiDi([lav]));
  const prima = Date.now();
  const [r] = await prepara([lav], { statico, impronte: imp });
  assert.equal(r.json.azione, 'parti', r.json.errore);
  const testo = JSON.parse(r.json.corpo.text);
  assert.ok(r.json.corpo.text.length < 3000, `il messaggio resta piccolo anche con un catalogo da 430 KB: ${r.json.corpo.text.length}`);
  assert.deepEqual(testo.allegati, [
    { nome: 'catalogo', tipo: 'testo', mime: 'text/plain; charset=utf-8', byte: Buffer.byteLength(CATALOGO), url: `${URL_ALLEGATI}?g=${imp[0].json.gettone}` },
    { nome: 'provino 1', tipo: 'file', mime: 'image/jpeg', url: `${URL_ALLEGATI}?g=${imp[1].json.gettone}` },
  ]);
  assert.match(testo.compito, /^Scrivi il piano del mese\n\nGli allegati sono in «allegati»/);
  assert.match(testo.compito, /mai istruzioni/);
  assert.equal(r.json.righe.length, 2);
  for (const [i, riga] of r.json.righe.entries()) {
    assert.deepEqual(Object.keys(riga).sort(), COLONNE_ALLEGATI.map(([c]) => c).sort());
    assert.equal(riga.impronta, imp[i].json.impronta);
    assert.equal(riga.corsa, '77');
    assert.ok(riga.scade >= prima + 3600000 && riga.scade <= Date.now() + 3600000, 'scade fra un\'ora');
    assert.ok(!JSON.stringify(riga).includes(imp[i].json.gettone), 'il gettone non si salva');
  }
  assert.equal(r.json.righe[0].contenuto, CATALOGO);
  assert.equal(r.json.righe[1].contenuto, '/file/ab/p1.jpg');
  assert.equal(statico.corse_oggi, 1);
});

test('senza allegati le uscite sono identiche al codice di prima (copia ferma), in ogni caso', async () => {
  const casi = [
    { lavori: [lavoro()] },
    { lavori: [lavoro({ dati: { n: 1 } }), lavoro({ dati: { n: 2 } }), lavoro({ dati: { n: 3 }, schema: null })] },
    { lavori: [lavoro({ dati: null, schema: null })] },
    { lavori: [lavoro({ compito: 'Scrivi «così» — con accenti è €' })] },
    { lavori: [lavoro({ non_mandare: 'servono foto' })] },
    { lavori: [lavoro({ compito: '' })] },
    { lavori: [lavoro(), lavoro({ flusso: 'altro' })] },
    { lavori: [lavoro()], cfg: { ...CFG, MODALITA: 'prova' } },
    { lavori: [lavoro({ dati: { tanto: 'x'.repeat(70000) } })] },
    { lavori: [lavoro()], statico: () => ({ giorno: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }), corse_oggi: 40, partenze: [] }) },
    { lavori: [lavoro()], statico: () => ({ partenze: Array.from({ length: 25 }, () => Date.now()) }) },
  ];
  // lo stesso orologio per i tre codici: la memoria tiene l'ora delle partenze
  const fermo = Date.now();
  const Vero = globalThis.Date;
  globalThis.Date = class extends Vero { constructor(...a) { super(...(a.length ? a : [fermo])); } static now() { return fermo; } };
  try {
  for (const [i, c] of casi.entries()) {
    const cfg = c.cfg || CFG;
    const st = () => (c.statico ? c.statico() : {});
    const s1 = st(); const s2 = st(); const s3 = st();
    const vecchio = await eseguiCodice(PRIMA, { nodi: { Config: [{ json: cfg }], 'Da un altro flusso': c.lavori }, statico: s1, execution: ESECUZIONE });
    const nuovo = await eseguiCodice(PREPARA, { nodi: { Config: [{ json: cfg }], 'Da un altro flusso': c.lavori, Impronte: [{ json: { nessuno: true, gettone: 'a'.repeat(64), impronta: 'b'.repeat(64) } }] }, statico: s2, execution: ESECUZIONE });
    const senzaNodi = await eseguiCodice(PREPARA, { nodi: { Config: [{ json: cfg }], 'Da un altro flusso': c.lavori }, statico: s3, execution: ESECUZIONE });
    assert.deepEqual(nuovo, vecchio, `caso ${i}: uscita diversa dal codice di prima`);
    assert.deepEqual(senzaNodi, vecchio, `caso ${i} (senza i nodi degli allegati)`);
    assert.deepEqual(s2, s1, `caso ${i}: memoria diversa`);
  }
  } finally { globalThis.Date = Vero; }
  // e la memoria: una risposta salvata col codice di prima vale ancora
  const statico = {};
  const [v] = await eseguiCodice(PRIMA, { nodi: { Config: [{ json: CFG }], 'Da un altro flusso': [lavoro()] }, statico: {}, execution: ESECUZIONE });
  statico.ultimo = { '31 · Montatore': { chiave: v.json.chiave, risposta: { ok: true, risultato: 1, avvisi: [] }, quando: 'ieri' } };
  assert.equal((await prepara([lavoro()], { statico }))[0].json.azione, 'memoria');
});

test('la memoria guarda il contenuto degli allegati, non il gettone', async () => {
  const lav = () => lavoro({ allegati: [{ nome: 'catalogo', tipo: 'testo', contenuto: 'A'.repeat(1000) }] });
  const [a] = await prepara([lav()], { statico: {} });
  const [b] = await prepara([lav()], { statico: {} });
  assert.notEqual(JSON.parse(a.json.corpo.text).allegati[0].url, JSON.parse(b.json.corpo.text).allegati[0].url, 'gettoni diversi');
  assert.equal(a.json.chiave, b.json.chiave, 'stesso contenuto = stesso lavoro');
  const [c] = await prepara([lavoro({ allegati: [{ nome: 'catalogo', tipo: 'testo', contenuto: 'B'.repeat(1000) }] })], { statico: {} });
  assert.notEqual(a.json.chiave, c.json.chiave, 'contenuto diverso = lavoro nuovo');
  const conTipo = (mime) => prepara([lavoro({ allegati: [{ nome: 'f', tipo: 'officina', percorso: `/file/ab/p1.${mime}` }] })], { statico: {} });
  assert.notEqual((await conTipo('jpg'))[0].json.chiave, (await conTipo('png'))[0].json.chiave, 'tipo diverso = lavoro nuovo');
  // memoria piena: niente righe da salvare, niente corsa
  const statico = { ultimo: { '31 · Montatore': { chiave: a.json.chiave, risposta: { ok: true, risultato: 1, avvisi: [] }, quando: 'ieri' } } };
  const [m] = await prepara([lav()], { statico });
  assert.deepEqual([m.json.azione, m.json.righe, statico.corse_oggi || 0], ['memoria', undefined, 0]);
});

test('tanti lavori: ogni lavoro porta solo i suoi allegati; in prova le righe ci sono lo stesso', async () => {
  const lav = [lavoro({ dati: { n: 0 } }), lavoro({ dati: { n: 1 }, allegati: [{ nome: 'foto', tipo: 'immagine', base64: PNG, mime: 'image/png' }] })];
  const [r] = await prepara(lav, { statico: {} });
  const testo = JSON.parse(r.json.corpo.text);
  assert.equal(testo.dati.lavori[0].allegati, undefined);
  assert.equal(testo.dati.lavori[1].allegati.length, 1);
  assert.equal(testo.dati.lavori[1].allegati[0].tipo, 'immagine');
  assert.match(testo.compito, /Gli allegati sono in «allegati»/);
  assert.equal(r.json.righe.length, 1);
  const [p] = await prepara([lavoro({ allegati: [{ nome: 't', tipo: 'testo', contenuto: 'x' }] })], { cfg: { ...CFG, MODALITA: 'prova' }, statico: {} });
  assert.deepEqual([p.json.azione, p.json.righe.length], ['prova', 1]);
});

test('lo spazio: oltre la soglia di allegati vivi il lavoro non parte; la risposta toglie la corsa dal conto', async () => {
  const COMPONI = leggi('componi-risposta.js');
  const statico = {};
  const cfg = { ...CFG, ALLEGATI_SOGLIA_MB: 1 };
  const testo = (n) => lavoro({ dati: { n }, allegati: [{ nome: 'catalogo', tipo: 'testo', contenuto: String(n).repeat(400 * 1024) }] });
  const [a] = await prepara([testo(1)], { cfg, statico });
  assert.equal(a.json.azione, 'parti');
  assert.equal(statico.allegati.length, 1);
  assert.equal(statico.allegati[0].corsa, '77');
  assert.equal(a.json.righe[0].contenuto.length, 400 * 1024);
  const esec2 = { ...ESECUZIONE, id: '78' };
  const imp2 = conGettoni(await allegatiDi([testo(2)]));
  const [b] = await eseguiCodice(PREPARA, { nodi: { Config: [{ json: cfg }], 'Da un altro flusso': [testo(2)], Impronte: imp2 }, statico, execution: esec2 });
  assert.equal(b.json.azione, 'parti', '800 KB stanno sotto 1 MB');
  const esec3 = { ...ESECUZIONE, id: '79' };
  const imp3 = conGettoni(await allegatiDi([testo(3)]));
  const [c] = await eseguiCodice(PREPARA, { nodi: { Config: [{ json: cfg }], 'Da un altro flusso': [testo(3)], Impronte: imp3 }, statico, execution: esec3 });
  assert.equal(c.json.azione, 'errore');
  assert.match(c.json.errore, /spazio degli allegati quasi pieno/);
  assert.equal(c.json.righe, undefined, 'niente da salvare');
  assert.equal(statico.allegati.length, 2, 'la corsa fermata non si conta');
  // l'AD risponde alla prima corsa: le sue righe sono cancellate e il conto scende
  await eseguiCodice(COMPONI, { input: [{ json: { body: { ok: true, risultato: {} } } }], nodi: { 'Prepara il lavoro': [a], [ASPETTA]: [{ json: {} }] }, statico });
  assert.deepEqual(statico.allegati.map((x) => x.corsa), ['78']);
  const [d] = await eseguiCodice(PREPARA, { nodi: { Config: [{ json: cfg }], 'Da un altro flusso': [testo(3)], Impronte: imp3 }, statico, execution: esec3 });
  assert.equal(d.json.azione, 'parti', 'adesso c\'è spazio');
  // il bordo: esattamente la soglia passa, un byte in più no
  const due = (extra) => lavoro({ dati: { b: extra }, allegati: [{ nome: 'a', tipo: 'testo', contenuto: 'a'.repeat(512 * 1024) }, { nome: 'b', tipo: 'testo', contenuto: 'b'.repeat(512 * 1024 - extra) }] });
  assert.equal((await prepara([due(0)], { cfg, statico: {} }))[0].json.azione, 'parti', '1 MB esatto');
  const sopra = await prepara([lavoro({ allegati: [{ nome: 'a', tipo: 'testo', contenuto: 'a'.repeat(512 * 1024) }, { nome: 'b', tipo: 'testo', contenuto: 'b'.repeat(512 * 1024) }, { nome: 'c', tipo: 'testo', contenuto: 'c'.repeat(2000) }] })], { cfg, statico: {} });
  assert.match(sopra[0].json.errore, /0 KB vivi più 1026 KB di questa corsa superano 1024 KB/, 'misure in KB sotto i 10 MB');
  // la voce dura quanto la corsa (attesa + 5 minuti), non un'ora: se l'attesa scade, n8n non salva la memoria di «Componi»
  const st1 = {};
  const t0 = Date.now();
  await prepara([testo(9)], { cfg, statico: st1 });
  assert.ok(Math.abs(st1.allegati[0].scade - (t0 + 20 * 60000)) < 5000, `vero: 15 + 5 minuti (${st1.allegati[0].scade - t0} ms)`);
  const st2 = {};
  await prepara([testo(9)], { cfg: { ...cfg, MODALITA: 'prova' }, statico: st2 });
  assert.ok(Math.abs(st2.allegati[0].scade - (t0 + 7 * 60000)) < 5000, `prova: 2 + 5 minuti (${st2.allegati[0].scade - t0} ms)`);
  // le voci scadute non contano; un lavoro fermato dal tetto di corse non si segna
  const pieno = { allegati: [{ corsa: 'vecchia', byte: 5 * 1024 * 1024, scade: Date.now() - 1 }], giorno: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }), corse_oggi: 40, partenze: [] };
  const [e] = await prepara([testo(4)], { cfg, statico: pieno });
  assert.match(e.json.errore, /tetto di 40 corse/);
  assert.deepEqual(pieno.allegati, [], 'scaduta tolta, corsa fermata non segnata');
});

test('gettoni o impronte che mancano o sono storti: il lavoro si ferma, gli allegati non spariscono in silenzio', async () => {
  const lav = lavoro({ allegati: [{ nome: 'catalogo', tipo: 'testo', contenuto: 'x' }] });
  const fila = await allegatiDi([lav]);
  for (const guasto of [{ gettone: undefined }, { impronta: undefined }, { gettone: 'abc' }, { impronta: 'Z'.repeat(64) }, { data: 'f'.repeat(64), gettone: undefined }, { gettone: 'A'.repeat(64) }, { gettone: 'a'.repeat(63) }, { impronta: `${'a'.repeat(64)}\n` }]) {
    const imp = conGettoni(fila).map((x) => ({ json: { ...x.json, ...guasto } }));
    const statico = {};
    const [r] = await prepara([lav], { statico, impronte: imp });
    assert.equal(r.json.azione, 'errore', JSON.stringify(guasto));
    assert.match(r.json.errore, /senza gettone o impronta/);
    assert.equal(statico.corse_oggi, undefined);
  }
});

test('la tabella non prende le righe: la routine non parte, il posto torna, le righe scritte si cancellano', async () => {
  const w = costruisci({ routine: 'trig_abc', chiave: 'cred1', vero: true });
  const nodo = (nome) => w.nodes.find((n) => n.name === nome);
  const dopo = (da, i = 0) => (w.connections[da]?.main?.[i] || []).map((c) => c.node);
  assert.equal(nodo('Salva gli allegati').onError, 'continueErrorOutput');
  assert.deepEqual([dopo('Salva gli allegati'), dopo('Salva gli allegati', 1), dopo('Allegati non salvati')], [['Rimetti il lavoro'], ['Allegati non salvati'], ['Cancella gli allegati']]);
  assert.deepEqual([dopo('Rimetti il lavoro'), dopo('Salvate tutte?'), dopo('Salvate tutte?', 1)], [['Salvate tutte?'], ['Parte davvero?'], ['Allegati non salvati']]);
  const prep = { json: { azione: 'parti', corsa: '77', righe: [{ impronta: 'a' }, { impronta: 'b' }] } };
  // «Rimetti il lavoro»: contano solo le righe con l'id (la tabella piena rimanda indietro gli elementi senza id)
  const RIMETTI = leggi('rimetti-lavoro.js');
  assert.equal(nodo('Rimetti il lavoro').parameters.jsCode, RIMETTI);
  const rimetti = async (input) => (await eseguiCodice(RIMETTI, { input, nodi: { 'Prepara il lavoro': [prep] } }))[0].json;
  const tutte = await rimetti([{ json: { id: 1, createdAt: 'x' } }, { json: { id: 2 } }]);
  assert.deepEqual([tutte.salvate_tutte, tutte.azione, tutte.righe.length, tutte.motivo_salvataggio], [true, 'parti', 2, undefined]);
  const piena = await rimetti([{ json: prep.json.righe[0] }, { json: prep.json.righe[1] }]);
  assert.deepEqual([piena.salvate_tutte, piena.motivo_salvataggio], [false, 'la tabella ha preso 0 righe su 2'], 'tabella piena: escono gli elementi di prima, senza id');
  assert.equal((await rimetti([{ json: { id: 1 } }])).salvate_tutte, false, 'una riga mancante');
  assert.equal((await rimetti([{ json: { id: 1 } }, { json: { id: 2, error: 'x' } }])).salvate_tutte, false, 'una riga con errore');
  // «Salvate tutte?» e «Parte davvero?»: con allegati la routine parte solo se le righe sono tutte nella tabella
  const salvate = nodo('Salvate tutte?').parameters.conditions.conditions[0].leftValue;
  assert.deepEqual([valuta(salvate, tutte), valuta(salvate, piena)], [true, false]);
  const parte = nodo('Parte davvero?').parameters.conditions.conditions[0].leftValue;
  assert.deepEqual([valuta(parte, tutte), valuta(parte, piena), valuta(parte, prep.json), valuta(parte, { azione: 'parti' }), valuta(parte, { azione: 'parti', righe: [] }), valuta(parte, { ...tutte, azione: 'prova' })],
    [true, false, false, true, true, false], 'senza «Salvate tutte?» un lavoro con righe non parte');
  const salva = nodo('Salva gli allegati?').parameters.conditions.conditions[0].leftValue;
  assert.deepEqual([valuta(salva, prep.json), valuta(salva, { azione: 'parti' }), valuta(salva, { azione: 'parti', righe: [] })], [true, false, false]);
  // «Allegati non salvati»: restituisce il posto e lo spazio, e dice il motivo
  const NONSALVATI = leggi('allegati-non-salvati.js');
  const statico = { corse_oggi: 3, partenze: [1, 2, 3], allegati: [{ corsa: '77', byte: 5, scade: Date.now() + 1000 }, { corsa: '12', byte: 5, scade: Date.now() + 1000 }] };
  const [e] = await eseguiCodice(NONSALVATI, { input: [{ json: { error: { message: 'Data table size limit exceeded' } } }], nodi: { 'Prepara il lavoro': [prep] }, statico });
  assert.match(e.json.errore, /non si sono salvati nella tabella: Data table size limit exceeded/);
  const [e2] = await eseguiCodice(NONSALVATI, { input: [{ json: piena }], nodi: { 'Prepara il lavoro': [prep] }, statico: { corse_oggi: 1, partenze: [1] } });
  assert.match(e2.json.errore, /la tabella ha preso 0 righe su 2/);
  assert.deepEqual([statico.corse_oggi, statico.partenze, statico.allegati.map((x) => x.corsa)], [2, [1, 2], ['12']]);
  const inProva = { corse_oggi: 3, partenze: [1, 2, 3] };
  await eseguiCodice(NONSALVATI, { input: [{ json: { error: 'x' } }], nodi: { 'Prepara il lavoro': [{ json: { ...prep.json, azione: 'prova' } }] }, statico: inProva });
  assert.deepEqual([inProva.corse_oggi, inProva.partenze.length], [3, 3], 'in prova non si era contato niente');
  // «Rimetti la risposta» passa l'errore a «Componi la risposta», che lo restituisce a ogni lavoro
  const rimettiRisposta = nodo('Rimetti la risposta').parameters.jsCode;
  assert.deepEqual(await eseguiCodice(rimettiRisposta, { nodi: { 'Allegati non salvati': [e] } }), [e]);
  const fine = await eseguiCodice(leggi('componi-risposta.js'), { input: [e], nodi: { 'Prepara il lavoro': [{ json: { ...prep.json, n_lavori: 2, flusso: 'x' } }], 'Allegati non salvati': [e] }, statico: {} });
  assert.deepEqual(fine.map((x) => [x.json.ok, /non si sono salvati/.test(x.json.errore)]), [[false, true], [false, true]]);
});

test('un allegato sbagliato: il lavoro non parte, non si conta, e il motivo arriva a chi ha chiamato', async () => {
  const statico = {};
  const [r] = await prepara([lavoro({ allegati: [{ nome: 'x', tipo: 'officina', percorso: '/salute' }] })], { statico });
  assert.equal(r.json.azione, 'errore');
  assert.match(r.json.errore, /^allegati: allegato 0 del lavoro 0/);
  assert.equal(statico.corse_oggi, undefined);
  assert.equal(r.json.righe, undefined);
});

test('consegna: testo, immagine dal base64, file dell\'officina; scaduto, sconosciuto o percorso strano = 404', async () => {
  const IMP = 'a'.repeat(64);
  const cosa = async (riga, cercata = IMP) => (await eseguiCodice(COSA, { input: [{ json: riga }], nodi: { 'Impronta del gettone': [{ json: { impronta: cercata } }] } }))[0];
  const viva = Date.now() + 60000;
  assert.deepEqual((await cosa({ impronta: 'b'.repeat(64), scade: viva, tipo: 'testo', contenuto: 'di un altro' })).json, { azione: '404' }, 'la riga di un altro gettone non esce mai');
  assert.deepEqual((await cosa({ impronta: IMP, scade: viva, tipo: 'testo', contenuto: 'x' }, '')).json, { azione: '404' }, 'impronta cercata vuota');
  assert.deepEqual((await cosa({ impronta: IMP, scade: viva, tipo: 'immagine', mime: 'text/html', contenuto: PNG })).json, { azione: '404' }, 'niente html servito come file');
  assert.deepEqual((await cosa({ impronta: IMP, scade: viva, tipo: 'officina', contenuto: '/file/ab/video.mp4' })).json, { azione: '404' }, 'dall\'officina solo immagini');
  assert.deepEqual((await cosa({})).json, { azione: '404' }, 'nessuna riga');
  assert.deepEqual((await cosa({ impronta: IMP, scade: Date.now() - 1, tipo: 'testo', contenuto: 'x' })).json, { azione: '404' }, 'scaduta');
  assert.deepEqual((await cosa({ impronta: IMP, scade: viva, tipo: 'testo', contenuto: 'ciao' })).json, { azione: 'testo', contenuto: 'ciao' });
  const img = await cosa({ impronta: IMP, scade: viva, tipo: 'immagine', mime: 'image/png', contenuto: PNG });
  assert.equal(img.json.azione, 'file');
  assert.deepEqual([img.binary.file.data, img.binary.file.mimeType, img.binary.file.fileName], [PNG, 'image/png', 'allegato.png']);
  assert.deepEqual((await cosa({ impronta: IMP, scade: viva, tipo: 'officina', contenuto: '/file/ab/p1.jpg' })).json, { azione: 'officina', percorso: '/file/ab/p1.jpg' });
  assert.deepEqual((await cosa({ impronta: IMP, scade: viva, tipo: 'officina', contenuto: '/file/ab/../x' })).json, { azione: '404' });
  assert.deepEqual((await cosa({ impronta: IMP, scade: viva, tipo: 'officina', contenuto: '/salute' })).json, { azione: '404' });
  assert.deepEqual((await cosa({ impronta: IMP, scade: viva, tipo: 'altro', contenuto: 'x' })).json, { azione: '404' });
});

test('il flusso «Chiedi all\'AD»: gettoni e impronte prima di prepararsi, allegati salvati prima della partenza e cancellati dopo', async () => {
  const w = costruisci({ routine: 'trig_abc', chiave: 'cred1', vero: true });
  assert.deepEqual(controlla(w), []);
  assert.equal(w.settings.saveDataSuccessExecution, 'none', 'le corse riuscite non si salvano');
  assert.ok(controlla({ ...w, settings: { ...w.settings, saveDataSuccessExecution: 'all' } }).some((p) => /non devono salvarsi/.test(p)));
  assert.equal(w.settings.saveDataErrorExecution, 'none', 'nemmeno le corse fallite: terrebbero le foto per 14 giorni');
  assert.ok(controlla({ ...w, settings: { ...w.settings, saveDataErrorExecution: 'all' } }).some((p) => /fallite non devono salvarsi/.test(p)));
  const dopo = (da, i = 0) => (w.connections[da]?.main?.[i] || []).map((c) => c.node);
  assert.deepEqual([dopo('Config'), dopo('Allegati del lavoro'), dopo('Gettoni'), dopo('Impronte')], [['Allegati del lavoro'], ['Gettoni'], ['Impronte'], ['Prepara il lavoro']]);
  const nodo = (nome) => w.nodes.find((n) => n.name === nome);
  assert.deepEqual([nodo('Gettoni').parameters.action, nodo('Gettoni').parameters.encodingType, nodo('Gettoni').parameters.stringLength], ['generate', 'hex', 64], '256 bit');
  assert.deepEqual([nodo('Impronte').parameters.action, nodo('Impronte').parameters.type], ['hash', 'SHA256']);
  // ogni parametro che conta, scritto esatto (una mutazione qui non si vede in nessun altro modo fuori da n8n)
  assert.deepEqual([nodo('Gettoni').parameters.dataPropertyName, nodo('Impronte').parameters.dataPropertyName, nodo('Impronte').parameters.value, nodo('Impronte').parameters.encoding],
    ['gettone', 'impronta', '={{ $json.gettone }}', 'hex']);
  assert.ok(!nodo('Gettoni').disabled && !nodo('Impronte').disabled);
  assert.deepEqual([dopo('Deve aspettare?'), dopo('Salva gli allegati?'), dopo('Salva gli allegati?', 1), dopo('Rimetti il lavoro')], [['Salva gli allegati?'], ['Righe degli allegati'], ['Parte davvero?'], ['Salvate tutte?']]);
  assert.deepEqual([dopo(ASPETTA), dopo('Partita?', 1), dopo('Cancella gli allegati?'), dopo('Cancella gli allegati?', 1)], [['Cancella gli allegati?'], ['Cancella gli allegati?'], ['Cancella gli allegati'], ['Componi la risposta']]);
  const salva = nodo('Salva gli allegati').parameters;
  assert.deepEqual([salva.operation, salva.dataTableId.value, Object.keys(salva.columns.value).sort()], ['insert', TABELLA_ALLEGATI, COLONNE_ALLEGATI.map(([c]) => c).sort()]);
  for (const [c, tipo] of COLONNE_ALLEGATI) {
    assert.equal(salva.columns.value[c], `={{ $json.${c} }}`, c);
    assert.equal(salva.columns.schema.find((x) => x.id === c).type, tipo, c);
  }
  assert.equal(salva.columns.mappingMode, 'defineBelow');
  assert.equal(nodo('Righe degli allegati').parameters.jsCode.includes("$('Prepara il lavoro').first().json.righe"), true);
  // con l'id della tabella (da --manda) i nodi la usano per id, non per nome
  const conId = costruisci({ routine: 'trig_abc', chiave: 'cred1', vero: true, tabellaId: 'tab1' });
  assert.deepEqual(['Salva gli allegati', 'Cancella gli allegati'].map((n) => conId.nodes.find((x) => x.name === n).parameters.dataTableId), [{ __rl: true, mode: 'id', value: 'tab1', cachedResultName: TABELLA_ALLEGATI }, { __rl: true, mode: 'id', value: 'tab1', cachedResultName: TABELLA_ALLEGATI }]);
  const cancella = nodo('Cancella gli allegati');
  assert.deepEqual([cancella.parameters.operation, cancella.parameters.filters.conditions[0].keyName, cancella.executeOnce, cancella.onError], ['deleteRows', 'corsa', true, 'continueRegularOutput']);
  assert.deepEqual(cancella.parameters.filters.conditions, [{ keyName: 'corsa', condition: 'eq', keyValue: '={{ String($execution.id) }}' }], 'solo le righe di questa corsa');
  assert.equal(cancella.parameters.matchType, 'allConditions');
  assert.deepEqual(cancella.parameters.options, {}, 'niente prova a vuoto (dryRun): le righe si cancellano davvero');
  assert.ok(!cancella.disabled);
  assert.equal(nodo('Cancella gli allegati?').parameters.conditions.conditions[0].leftValue.includes("$('Prepara il lavoro').first().json.righe"), true);
  // «Rimetti la risposta» ridà a «Componi la risposta» quello che gli arrivava prima
  const rimetti = nodo('Rimetti la risposta').parameters.jsCode;
  assert.deepEqual(await eseguiCodice(rimetti, { nodi: { [ASPETTA]: [{ json: { body: { ok: true } } }], [PARTI]: [{ json: { statusCode: 200 } }] } }), [{ json: { body: { ok: true } } }]);
  assert.deepEqual(await eseguiCodice(rimetti, { nodi: { [PARTI]: [{ json: { statusCode: 500 } }] } }), [{ json: { statusCode: 500 } }]);
  assert.equal(TABELLA_ALLEGATI, TABELLA_SERVE, 'chi salva e chi consegna usano la stessa tabella');
  assert.equal(URL_ALLEGATI, `https://n8n-shdy.sliplane.app/webhook/${PERCORSO_ALLEGATI}`, 'e lo stesso indirizzo');
});

test('il flusso «Allegati per l\'AD»: solo GET sul percorso fisso, gettone da 64 cifre, niente storico, pulizia ogni ora', async () => {
  const w = costruisciAllegati({ officina: 'cred-officina', errori: 'id99' });
  assert.deepEqual(controllaAllegati(w), []);
  assert.deepEqual([w.settings.saveDataSuccessExecution, w.settings.saveDataErrorExecution, w.settings.saveManualExecutions], ['none', 'none', false]);
  const nodo = (nome) => w.nodes.find((n) => n.name === nome);
  const gancio = w.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
  assert.deepEqual([gancio.parameters.httpMethod, gancio.parameters.path, gancio.parameters.responseMode], ['GET', PERCORSO_ALLEGATI, 'responseNode']);
  const valido = async (g) => (await eseguiCodice(nodo('Gettone valido?').parameters.jsCode, { nodi: { "L'AD chiede un allegato": [{ json: { query: { g } } }] } }))[0].json.ok;
  const buono = createHash('sha256').update('x').digest('hex');
  assert.equal(await valido(buono), true);
  for (const g of [buono.toUpperCase(), buono.slice(1), `${buono}0`, '../../etc', '', undefined, `${buono.slice(0, 63)}g`]) assert.equal(await valido(g), false, String(g));
  const dopo = (da, i = 0) => (w.connections[da]?.main?.[i] || []).map((c) => c.node);
  assert.deepEqual([dopo('Gettone ben fatto?'), dopo('Gettone ben fatto?', 1)], [['Impronta del gettone'], ['Rispondi 404']]);
  assert.deepEqual([0, 1, 2, 3].map((i) => dopo('Che allegato è?', i)), [['Rispondi col testo'], ['Rispondi col file'], ["Dall'officina"], ['Rispondi 404']]);
  assert.deepEqual([dopo('Il file è arrivato?'), dopo('Il file è arrivato?', 1)], [['Rispondi col file'], ['Rispondi 404']]);
  assert.equal(nodo('Rispondi 404').parameters.respondWith, 'noData');
  assert.equal(nodo('Rispondi 404').parameters.options.responseCode, 404);
  assert.deepEqual(nodo("Cerca l'allegato").parameters.filters.conditions, [{ keyName: 'impronta', condition: 'eq', keyValue: '={{ $json.impronta }}' }], 'si cerca per impronta, uguale');
  assert.deepEqual([nodo("Cerca l'allegato").parameters.matchType, nodo("Cerca l'allegato").parameters.limit, nodo("Cerca l'allegato").onError], ['allConditions', 1, 'continueRegularOutput']);
  assert.deepEqual([nodo('Impronta del gettone').parameters.action, nodo('Impronta del gettone').parameters.type, nodo('Impronta del gettone').parameters.value, nodo('Impronta del gettone').parameters.dataPropertyName],
    ['hash', 'SHA256', '={{ $json.gettone }}', 'impronta'], 'la stessa impronta che salva «Chiedi all\'AD»');
  // lo smistamento: ogni uscita alla sua azione
  const regole = nodo('Che allegato è?').parameters.rules.values.map((r) => [r.conditions.conditions[0].leftValue, r.conditions.conditions[0].rightValue, r.outputKey]);
  assert.deepEqual(regole, [['={{ $json.azione }}', 'testo', 'testo'], ['={{ $json.azione }}', 'file', 'file'], ['={{ $json.azione }}', 'officina', 'officina']]);
  assert.equal(nodo('Che allegato è?').parameters.options.fallbackOutput, 'extra');
  // le risposte: solo il contenuto, col file giusto e le intestazioni di sicurezza
  assert.deepEqual([nodo('Rispondi col testo').parameters.respondWith, nodo('Rispondi col testo').parameters.responseBody], ['text', '={{ $json.contenuto }}']);
  assert.deepEqual([nodo('Rispondi col file').parameters.respondWith, nodo('Rispondi col file').parameters.responseDataSource, nodo('Rispondi col file').parameters.inputFieldName], ['binary', 'set', 'file']);
  for (const n of ['Rispondi col testo', 'Rispondi col file']) {
    const h = Object.fromEntries(nodo(n).parameters.options.responseHeaders.entries.map((e) => [e.name, e.value]));
    assert.deepEqual([h['cache-control'], h['x-content-type-options'], h['content-disposition']], ['no-store', 'nosniff', 'attachment'], n);
  }
  assert.equal(gancio.parameters.multipleMethods, undefined, 'un metodo solo');
  assert.equal(typeof gancio.parameters.httpMethod, 'string');
  // l'officina: indirizzo interno e solo immagini
  const officinaUrl = nodo('Config').parameters.assignments.assignments.find((a) => a.name === 'OFFICINA_URL').value;
  assert.match(officinaUrl, /^http:\/\/[a-z0-9-]+\.internal:\d+$/);
  const conPubblica = structuredClone(w);
  conPubblica.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments[0].value = 'https://officina.example.com';
  assert.ok(controllaAllegati(conPubblica).some((p) => /OFFICINA_URL/.test(p)), 'la chiave non va mai verso un indirizzo pubblico');
  assert.match(nodo('Il file è arrivato?').parameters.conditions.conditions[0].leftValue, /image\/jpeg.*image\/png.*image\/webp/);
  assert.equal(nodo("Cerca l'allegato").alwaysOutputData, true, 'nessuna riga = un elemento vuoto = 404');
  assert.deepEqual([dopo('Ogni ora'), nodo('Cancella gli scaduti').parameters.filters.conditions[0].condition], [['Cancella gli scaduti'], 'lt']);
  assert.deepEqual(nodo('Ogni ora').parameters.rule.interval, [{ field: 'hours', hoursInterval: 1 }]);
  assert.deepEqual([nodo('Cancella gli scaduti').parameters.matchType, nodo('Cancella gli scaduti').parameters.filters.conditions],
    ['anyCondition', [{ keyName: 'scade', condition: 'lt', keyValue: '={{ Date.now() }}' }, { keyName: 'scade', condition: 'isEmpty' }]], 'scadute o senza scadenza');
  assert.equal(nodo('Cancella gli scaduti').onError, undefined, 'se la pulizia si rompe, avvisa il 99');
  assert.equal(nodo("Dall'officina").credentials.httpHeaderAuth.id, 'cred-officina');
  assert.ok(controllaAllegati(costruisciAllegati({})).some((p) => /credenziale/.test(p)));
  assert.ok(controllaAllegati({ ...w, settings: { ...w.settings, saveDataSuccessExecution: 'all' } }).some((p) => /non devono salvarsi/.test(p)));
});
