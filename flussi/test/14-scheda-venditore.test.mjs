// Le prove del 14 · Scheda per il venditore: il segreto, la forma del lavoro, l'esito nella tabella. Nessuna rete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { eseguiCodice } from './esegui-codice.mjs';
import { costruisci14, costruisci14b, controlla, controlloSegreto } from '../14-scheda-venditore/costruisci.mjs';

const leggi = (n) => readFileSync(new URL(`../14-scheda-venditore/codice/${n}`, import.meta.url), 'utf8');
const IMPRONTA = createHash('sha256').update('segreto-di-prova-lungo-abbastanza-per-il-test').digest('hex');
const lavoro = (extra = {}) => ({ lavoro: '1b4e28ba-2fa1-11d2-883f-0016d3cca427', nome: 'Bar Prova', prima: { nome: 'Bar Prova', campi: [] },
  flusso: 'x', compito: 'Sei l’AD. '.repeat(10), dati: { oggi: '2026-11-26' }, schema: { type: 'object' }, ...extra });
const controllaLavoro = async (body) => (await eseguiCodice(leggi('controlla-lavoro.js'), { nodi: { 'Dal sito del venditore': [{ json: { body } }] } }))[0].json;

test('i due flussi passano i controlli: niente rete, niente API a pagamento, segreto controllato due volte, niente cancellazioni', () => {
  for (const w of [costruisci14({ impronta: IMPRONTA }), costruisci14b({ impronta: IMPRONTA })]) assert.deepEqual(controlla(w), [], w.name);
});

test('senza impronta valida il flusso non si costruisce', () => {
  assert.throws(() => costruisci14({ impronta: 'corta' }), /impronta/);
});

test('il controllo del segreto non lancia mai, anche senza intestazione (un errore farebbe passare la richiesta)', () => {
  const expr = controlloSegreto(IMPRONTA).replace(/^=\{\{|\}\}$/g, '');
  // Imita l'estensione .hash() di n8n sulle stringhe.
  const valuta = (headers) => { const $json = { headers }; String.prototype.hash = function (a) { return createHash(a).update(String(this)).digest('hex'); }; try { return eval(expr); } finally { delete String.prototype.hash; } };
  assert.equal(valuta({}), false);
  assert.equal(valuta(undefined), false);
  assert.equal(valuta({ 'x-scheda-segreto': 'sbagliato' }), false);
  assert.equal(valuta({ 'x-scheda-segreto': 'segreto-di-prova-lungo-abbastanza-per-il-test' }), true);
});

test('un lavoro storto non parte: codice, compito, dati, prima scheda', async () => {
  assert.equal((await controllaLavoro(lavoro({ lavoro: '../x' }))).valido, false);
  assert.equal((await controllaLavoro(lavoro({ compito: 'corto' }))).valido, false);
  assert.equal((await controllaLavoro(lavoro({ dati: null }))).valido, false);
  assert.equal((await controllaLavoro(lavoro({ prima: undefined }))).valido, false);
  assert.match((await controllaLavoro(lavoro({ dati: { x: 'a'.repeat(70000) } }))).motivo, /64 KB/);
});

test('un lavoro buono: il job per «Chiedi all’AD» porta sempre il nome del flusso 14, mai quello mandato dal sito', async () => {
  const r = await controllaLavoro(lavoro({ flusso: '26 · Nuovo cliente da MyCity' }));
  assert.equal(r.valido, true);
  assert.equal(r.job.flusso, '14 · Scheda per il venditore');
  assert.equal(typeof r.prima, 'string');
});

const esito = async (risposta) => (await eseguiCodice(leggi('componi-esito.js'), {
  input: [{ json: risposta }], nodi: { 'Controlla il lavoro': [{ json: { lavoro: 'abc', iniziato: Date.now() - 42000 } }] } }))[0].json;

test('l’esito: pronta solo con un risultato vero; la prova e gli errori diventano «errore» col motivo', async () => {
  const ok = await esito({ ok: true, risultato: { consigliato: 'base' }, avvisi: ['una nota'] });
  assert.equal(ok.stato, 'pronta');
  assert.deepEqual(JSON.parse(ok.risultato), { consigliato: 'base' });
  assert.ok(ok.secondi >= 41 && ok.secondi <= 44);
  assert.equal((await esito({ ok: false, prova: true })).stato, 'errore');
  assert.match((await esito({ ok: false, errore: 'tetto di corse raggiunto' })).errore, /tetto/);
  assert.equal((await esito({ ok: true, risultato: null })).stato, 'errore');
});

test('il risultato: una riga che non c’è è «sconosciuto»', async () => {
  const r = async (riga) => (await eseguiCodice(leggi('componi-risultato.js'), { input: [{ json: riga }] }))[0].json;
  assert.equal((await r({})).stato, 'sconosciuto');
  assert.equal((await r({ lavoro: 'abc', stato: 'pronta', risultato: '{}', prima: '{}' })).stato, 'pronta');
});
