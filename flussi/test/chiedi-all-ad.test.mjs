// Le prove di «Chiedi all'AD»: un lavoro o tanti in una corsa, la memoria (stesso lavoro = nessuna corsa),
// i tetti, la prova, la risposta dell'AD, l'attesa scaduta e il flusso costruito. Dati finti.
// Si lancia con: node --test "flussi/test/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eseguiCodice } from './esegui-codice.mjs';
import { costruisci, controlla, PARTI, ASPETTA, URL_ROUTINE } from '../chiedi-all-ad/costruisci.mjs';

const leggi = (nome) => readFileSync(new URL(`../chiedi-all-ad/codice/${nome}`, import.meta.url), 'utf8');
const PREPARA = leggi('prepara-lavoro.js');
const COMPONI = leggi('componi-risposta.js');
const CFG = { MODALITA: 'vero', ROUTINE_ID: 'trig_x', TETTO_GIORNO: 40, TETTO_ORA: 25, ATTESA_MINUTI: 15, PROVA_ATTESA_MINUTI: 2 };
const lavoro = (extra = {}) => ({ json: { flusso: '04 · Scrivi i testi', compito: 'Scrivi la didascalia', dati: { piatto: 'tortelli' }, schema: { type: 'object' }, ...extra } });
const prepara = (lavori, { cfg = CFG, statico = {} } = {}) => eseguiCodice(PREPARA, { nodi: { Config: [{ json: cfg }], 'Da un altro flusso': lavori }, statico });

test('un lavoro: parte la routine, col testo che la routine si aspetta e l\'indirizzo di ritorno', async () => {
  const statico = {};
  const [r] = await prepara([lavoro()], { statico });
  assert.equal(r.json.azione, 'parti');
  const testo = JSON.parse(r.json.corpo.text);
  assert.deepEqual(Object.keys(testo).sort(), ['compito', 'dati', 'flusso', 'rispondi_a', 'schema']);
  assert.match(testo.rispondi_a, /^https:\/\/n8n-shdy\.sliplane\.app\/webhook-waiting\//);
  assert.equal(statico.corse_oggi, 1);
  assert.equal(statico.partenze.length, 1);
});

test('tanti lavori: una corsa sola, con la lista e lo schema dei risultati', async () => {
  const statico = {};
  const out = await prepara([lavoro({ dati: { n: 1 } }), lavoro({ dati: { n: 2 } }), lavoro({ dati: { n: 3 } })], { statico });
  assert.equal(out.length, 1);
  assert.equal(out[0].json.n_lavori, 3);
  const testo = JSON.parse(out[0].json.corpo.text);
  assert.equal(testo.dati.lavori.length, 3);
  assert.deepEqual(testo.dati.lavori.map((l) => l.indice), [0, 1, 2]);
  assert.ok(testo.schema.properties.risultati);
  assert.equal(statico.corse_oggi, 1, 'tre lavori contano una corsa');
});

test('stesso compito e stessi dati dell\'ultima volta: niente corsa, si ridà la risposta di allora', async () => {
  const statico = {};
  const [primo] = await prepara([lavoro()], { statico });
  // L'AD risponde e la risposta si tiene in memoria.
  await eseguiCodice(COMPONI, { input: [{ json: { headers: {}, body: { ok: true, flusso: 'x', risultato: { testo: 'ciao' }, avvisi: [] } } }],
    nodi: { 'Prepara il lavoro': [primo], [ASPETTA]: [{ json: {} }] }, statico });
  const [secondo] = await prepara([lavoro()], { statico });
  assert.equal(secondo.json.azione, 'memoria');
  assert.equal(statico.corse_oggi, 1, 'la seconda volta non si conta');
  const [fine] = await eseguiCodice(COMPONI, { input: [secondo], nodi: { 'Prepara il lavoro': [secondo] }, statico });
  assert.equal(fine.json.ok, true);
  assert.equal(fine.json.dalla_memoria, true);
  assert.deepEqual(fine.json.risultato, { testo: 'ciao' });
  const [diverso] = await prepara([lavoro({ dati: { piatto: 'anolini' } })], { statico });
  assert.equal(diverso.json.azione, 'parti', 'dati diversi = lavoro nuovo');
});

test('i tetti: 40 corse al giorno, 25 nell\'ultima ora; il giorno nuovo riparte da zero', async () => {
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const [giorno] = await prepara([lavoro()], { statico: { giorno: oggi, corse_oggi: 40, partenze: [] } });
  assert.equal(giorno.json.azione, 'errore');
  assert.match(giorno.json.errore, /40 corse al giorno/);
  const pieno = Array.from({ length: 25 }, () => Date.now() - 60000);
  const [ora] = await prepara([lavoro()], { statico: { giorno: oggi, corse_oggi: 25, partenze: pieno } });
  assert.match(ora.json.errore, /25 corse in un'ora/);
  const vecchie = Array.from({ length: 25 }, () => Date.now() - 2 * 3600000);
  const statico = { giorno: '2000-01-01', corse_oggi: 40, partenze: vecchie };
  const [ieri] = await prepara([lavoro()], { statico });
  assert.equal(ieri.json.azione, 'parti');
  assert.equal(statico.corse_oggi, 1);
  assert.equal(statico.partenze.length, 1, 'le partenze di più di un\'ora fa non contano');
  // Un tetto all'ora sopra 29 non passa: la routine ne accetta 30.
  const [sopra] = await prepara([lavoro()], { cfg: { ...CFG, TETTO_ORA: 50 }, statico: { giorno: oggi, corse_oggi: 0, partenze: Array.from({ length: 29 }, () => Date.now()) } });
  assert.equal(sopra.json.azione, 'errore');
});

test('MODALITA = prova: la routine non parte e non si conta', async () => {
  const statico = {};
  const [r] = await prepara([lavoro()], { cfg: { ...CFG, MODALITA: 'prova' }, statico });
  assert.equal(r.json.azione, 'prova');
  assert.equal(r.json.corpo, undefined);
  assert.equal(statico.corse_oggi || 0, 0);
  const [fine] = await eseguiCodice(COMPONI, { input: [r], nodi: { 'Prepara il lavoro': [r], [ASPETTA]: [r] }, statico });
  assert.equal(fine.json.ok, false);
  assert.equal(fine.json.prova, true);
});

test('lavori sbagliati o troppo grandi non partono', async () => {
  const [senza] = await prepara([lavoro({ compito: '  ' })]);
  assert.equal(senza.json.azione, 'errore');
  const [grande] = await prepara([lavoro({ dati: { foto: 'x'.repeat(70000) } })]);
  assert.equal(grande.json.azione, 'errore');
  assert.match(grande.json.errore, /troppo grande/);
});

test('la risposta dell\'AD torna divisa per lavoro, nello stesso ordine', async () => {
  const [prep] = await prepara([lavoro({ dati: 1 }), lavoro({ dati: 2 })]);
  const risposta = { ok: true, flusso: 'x', avvisi: ['un avviso'], risultato: { risultati: [{ indice: 1, risultato: 'due' }, { indice: 0, risultato: 'uno' }] } };
  const out = await eseguiCodice(COMPONI, { input: [{ json: { headers: {}, body: risposta } }], nodi: { 'Prepara il lavoro': [prep], [ASPETTA]: [{ json: {} }] } });
  assert.deepEqual(out.map((o) => o.json.risultato), ['uno', 'due']);
  assert.ok(out.every((o) => o.json.ok && o.json.avvisi[0] === 'un avviso'));
  const manca = { ...risposta, risultato: { risultati: [{ indice: 0, risultato: 'uno' }] } };
  const parziale = await eseguiCodice(COMPONI, { input: [{ json: { body: manca } }], nodi: { 'Prepara il lavoro': [prep], [ASPETTA]: [{ json: {} }] } });
  assert.equal(parziale[1].json.ok, false, 'un lavoro senza risposta è un errore, non un vuoto');
});

test('gli errori: routine non partita, AD che non risponde, AD che dice no', async () => {
  const statico = {};
  const [prep] = await prepara([lavoro()], { statico });
  assert.equal(statico.corse_oggi, 1);
  const [nonPartita] = await eseguiCodice(COMPONI, { input: [{ json: { statusCode: 401, body: { error: { message: 'invalid token' } } } }], nodi: { 'Prepara il lavoro': [prep], [PARTI]: [{ json: {} }] }, statico });
  assert.equal(statico.corse_oggi, 0, 'una corsa non partita non si conta');
  assert.equal(statico.partenze.length, 0);
  assert.equal(nonPartita.json.ok, false);
  assert.match(nonPartita.json.errore, /non è partita \(codice 401\)/);
  // L'attesa scade: al nodo dopo arriva la risposta della partenza, non quella dell'AD.
  const partita = { statusCode: 200, body: { type: 'routine_fire', claude_code_session_id: 's' } };
  const [scaduta] = await eseguiCodice(COMPONI, { input: [{ json: partita }], nodi: { 'Prepara il lavoro': [prep], [PARTI]: [{ json: partita }], [ASPETTA]: [{ json: partita }] } });
  assert.match(scaduta.json.errore, /non ha risposto in tempo/);
  const [no] = await eseguiCodice(COMPONI, { input: [{ json: { body: { ok: false, flusso: 'x', errore: 'dati mancanti' } } }], nodi: { 'Prepara il lavoro': [prep], [ASPETTA]: [{ json: {} }] } });
  assert.equal(no.json.errore, 'dati mancanti');
});

test('il flusso costruito: attesa con tempo massimo, nessuna chiamata a pagamento, tetti dentro i limiti', () => {
  const w = costruisci({ routine: 'trig_abc', chiave: 'cred1', vero: true });
  assert.deepEqual(controlla(w), []);
  const parti = w.nodes.find((n) => n.name === PARTI);
  assert.ok(parti.parameters.url.startsWith(`=${URL_ROUTINE}`));
  assert.equal(parti.credentials.httpHeaderAuth.id, 'cred1');
  assert.ok(!JSON.stringify(w).includes('/v1/messages'));
  assert.deepEqual(controlla(costruisci({ chiave: 'c' })), [], 'in prova l\'id della routine può mancare');
  assert.ok(controlla(costruisci({ chiave: 'c', vero: true })).some((p) => /routine/.test(p)));
  assert.ok(controlla(costruisci({ routine: 'trig_a' })).some((p) => /credenziale/.test(p)));
});
