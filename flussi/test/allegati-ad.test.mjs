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

test('allegati: si controllano e si mettono in fila; senza allegati esce un elemento «nessuno»', async () => {
  assert.deepEqual((await allegatiDi([lavoro()])).map((x) => x.json), [{ nessuno: true }]);
  const fila = await allegatiDi([lavoro({ allegati: [
    { nome: 'catalogo', tipo: 'testo', contenuto: 'ciao' },
    { nome: 'logo', tipo: 'immagine', base64: PNG, mime: 'image/png' },
    { nome: 'provino 1', tipo: 'officina', percorso: '/file/ab12-cd/provino-1.jpg', mime: 'image/jpeg' },
  ] })]);
  assert.deepEqual(fila.map((x) => [x.json.lavoro, x.json.n, x.json.tipo, x.json.nome]), [[0, 0, 'testo', 'catalogo'], [0, 1, 'immagine', 'logo'], [0, 2, 'officina', 'provino 1']]);
  assert.equal(fila[2].json.contenuto, '/file/ab12-cd/provino-1.jpg');
});

test('allegati: tetti e forme sbagliate fermano il lavoro col motivo, niente si tronca', async () => {
  const errore = async (allegati) => (await allegatiDi([lavoro({ allegati })]))[0].json.errore || '';
  assert.match(await errore([{ nome: 'grande', tipo: 'testo', contenuto: 'x'.repeat(512 * 1024 + 1) }]), /il massimo per un testo è 524288/);
  assert.equal(await errore([{ nome: 'giusto', tipo: 'testo', contenuto: 'x'.repeat(512 * 1024) }]), '');
  assert.match(await errore([{ nome: 'enorme', tipo: 'immagine', base64: Buffer.alloc(1536 * 1024 + 3).toString('base64') }]), /il massimo per un'immagine/);
  assert.match(await errore([{ nome: 'rotta', tipo: 'immagine', base64: 'non è base64!' }]), /non è in base64/);
  assert.match(await errore([{ nome: 'gif', tipo: 'immagine', base64: PNG, mime: 'image/gif' }]), /non ammesso/);
  for (const percorso of ['/file/x/../segreto', '/salute', 'http://officina.internal:8080/file/a/b.jpg', '/file/a/b/c.jpg', '/file//b.jpg', '/progetto/1/catalogo']) {
    assert.match(await errore([{ nome: 'p', tipo: 'officina', percorso }]), /percorso dell'officina/, percorso);
  }
  assert.match(await errore([{ nome: 'x', tipo: 'video', contenuto: 'a' }]), /tipo «video» sconosciuto/);
  assert.match(await errore([{ tipo: 'testo', contenuto: 'a' }]), /manca il nome/);
  assert.match(await errore([{ nome: 'vuoto', tipo: 'testo', contenuto: '' }]), /vuoto/);
  assert.match(await errore(Array.from({ length: 41 }, (_, i) => ({ nome: `t${i}`, tipo: 'testo', contenuto: 'a' }))), /41 allegati.*massimo è 40/);
  const img = Buffer.alloc(1400 * 1024).toString('base64');
  assert.match(await errore(Array.from({ length: 6 }, (_, i) => ({ nome: `f${i}`, tipo: 'immagine', base64: img }))), /massimo è 8388608/);
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

test('senza allegati la richiesta è identica a prima, carattere per carattere, e non ci sono righe', async () => {
  const conNodo = await prepara([lavoro()], { statico: {} });
  const senzaNodo = await eseguiCodice(PREPARA, { nodi: { Config: [{ json: CFG }], 'Da un altro flusso': [lavoro()] }, statico: {}, execution: ESECUZIONE });
  assert.equal(conNodo[0].json.corpo.text, senzaNodo[0].json.corpo.text);
  assert.equal(conNodo[0].json.righe, undefined);
  assert.equal(conNodo[0].json.chiave, senzaNodo[0].json.chiave);
  const piu = [lavoro({ dati: { n: 1 } }), lavoro({ dati: { n: 2 } })];
  const a = await prepara(piu, { statico: {} });
  const b = await eseguiCodice(PREPARA, { nodi: { Config: [{ json: CFG }], 'Da un altro flusso': piu }, statico: {}, execution: ESECUZIONE });
  assert.equal(a[0].json.corpo.text, b[0].json.corpo.text);
});

test('la memoria guarda il contenuto degli allegati, non il gettone', async () => {
  const lav = () => lavoro({ allegati: [{ nome: 'catalogo', tipo: 'testo', contenuto: 'A'.repeat(1000) }] });
  const [a] = await prepara([lav()], { statico: {} });
  const [b] = await prepara([lav()], { statico: {} });
  assert.notEqual(JSON.parse(a.json.corpo.text).allegati[0].url, JSON.parse(b.json.corpo.text).allegati[0].url, 'gettoni diversi');
  assert.equal(a.json.chiave, b.json.chiave, 'stesso contenuto = stesso lavoro');
  const [c] = await prepara([lavoro({ allegati: [{ nome: 'catalogo', tipo: 'testo', contenuto: 'B'.repeat(1000) }] })], { statico: {} });
  assert.notEqual(a.json.chiave, c.json.chiave, 'contenuto diverso = lavoro nuovo');
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
  // le voci scadute non contano; un lavoro fermato dal tetto di corse non si segna
  const pieno = { allegati: [{ corsa: 'vecchia', byte: 5 * 1024 * 1024, scade: Date.now() - 1 }], giorno: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }), corse_oggi: 40, partenze: [] };
  const [e] = await prepara([testo(4)], { cfg, statico: pieno });
  assert.match(e.json.errore, /tetto di 40 corse/);
  assert.deepEqual(pieno.allegati, [], 'scaduta tolta, corsa fermata non segnata');
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
  const cosa = async (riga) => (await eseguiCodice(COSA, { input: [{ json: riga }] }))[0];
  const viva = Date.now() + 60000;
  assert.deepEqual((await cosa({})).json, { azione: '404' }, 'nessuna riga');
  assert.deepEqual((await cosa({ impronta: 'a', scade: Date.now() - 1, tipo: 'testo', contenuto: 'x' })).json, { azione: '404' }, 'scaduta');
  assert.deepEqual((await cosa({ impronta: 'a', scade: viva, tipo: 'testo', contenuto: 'ciao' })).json, { azione: 'testo', contenuto: 'ciao' });
  const img = await cosa({ impronta: 'a', scade: viva, tipo: 'immagine', mime: 'image/png', contenuto: PNG });
  assert.equal(img.json.azione, 'file');
  assert.deepEqual([img.binary.file.data, img.binary.file.mimeType, img.binary.file.fileName], [PNG, 'image/png', 'allegato.png']);
  assert.deepEqual((await cosa({ impronta: 'a', scade: viva, tipo: 'officina', contenuto: '/file/ab/p1.jpg' })).json, { azione: 'officina', percorso: '/file/ab/p1.jpg' });
  assert.deepEqual((await cosa({ impronta: 'a', scade: viva, tipo: 'officina', contenuto: '/file/ab/../x' })).json, { azione: '404' });
  assert.deepEqual((await cosa({ impronta: 'a', scade: viva, tipo: 'officina', contenuto: '/salute' })).json, { azione: '404' });
  assert.deepEqual((await cosa({ impronta: 'a', scade: viva, tipo: 'altro', contenuto: 'x' })).json, { azione: '404' });
});

test('il flusso «Chiedi all\'AD»: gettoni e impronte prima di prepararsi, allegati salvati prima della partenza e cancellati dopo', async () => {
  const w = costruisci({ routine: 'trig_abc', chiave: 'cred1', vero: true });
  assert.deepEqual(controlla(w), []);
  assert.equal(w.settings.saveDataSuccessExecution, 'none', 'le corse riuscite non si salvano');
  assert.ok(controlla({ ...w, settings: { ...w.settings, saveDataSuccessExecution: 'all' } }).some((p) => /non devono salvarsi/.test(p)));
  const dopo = (da, i = 0) => (w.connections[da]?.main?.[i] || []).map((c) => c.node);
  assert.deepEqual([dopo('Config'), dopo('Allegati del lavoro'), dopo('Gettoni'), dopo('Impronte')], [['Allegati del lavoro'], ['Gettoni'], ['Impronte'], ['Prepara il lavoro']]);
  const nodo = (nome) => w.nodes.find((n) => n.name === nome);
  assert.deepEqual([nodo('Gettoni').parameters.action, nodo('Gettoni').parameters.encodingType, nodo('Gettoni').parameters.stringLength], ['generate', 'hex', 64], '256 bit');
  assert.deepEqual([nodo('Impronte').parameters.action, nodo('Impronte').parameters.type], ['hash', 'SHA256']);
  assert.deepEqual([dopo('Deve aspettare?'), dopo('Salva gli allegati?'), dopo('Salva gli allegati?', 1), dopo('Rimetti il lavoro')], [['Salva gli allegati?'], ['Righe degli allegati'], ['Parte davvero?'], ['Parte davvero?']]);
  assert.deepEqual([dopo(ASPETTA), dopo('Partita?', 1), dopo('Cancella gli allegati?'), dopo('Cancella gli allegati?', 1)], [['Cancella gli allegati?'], ['Cancella gli allegati?'], ['Cancella gli allegati'], ['Componi la risposta']]);
  const salva = nodo('Salva gli allegati').parameters;
  assert.deepEqual([salva.operation, salva.dataTableId.value, Object.keys(salva.columns.value).sort()], ['insert', TABELLA_ALLEGATI, COLONNE_ALLEGATI.map(([c]) => c).sort()]);
  const cancella = nodo('Cancella gli allegati');
  assert.deepEqual([cancella.parameters.operation, cancella.parameters.filters.conditions[0].keyName, cancella.executeOnce, cancella.onError], ['deleteRows', 'corsa', true, 'continueRegularOutput']);
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
  assert.equal(nodo("Cerca l'allegato").parameters.filters.conditions[0].keyName, 'impronta', 'si cerca per impronta');
  assert.equal(nodo("Cerca l'allegato").alwaysOutputData, true, 'nessuna riga = un elemento vuoto = 404');
  assert.deepEqual([dopo('Ogni ora'), nodo('Cancella gli scaduti').parameters.filters.conditions[0].condition], [['Cancella gli scaduti'], 'lt']);
  assert.equal(nodo("Dall'officina").credentials.httpHeaderAuth.id, 'cred-officina');
  assert.ok(controllaAllegati(costruisciAllegati({})).some((p) => /credenziale/.test(p)));
  assert.ok(controllaAllegati({ ...w, settings: { ...w.settings, saveDataSuccessExecution: 'all' } }).some((p) => /non devono salvarsi/.test(p)));
});
