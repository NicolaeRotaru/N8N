// Le prove del 23 · Mani del Pannello: la firma sui 🔴, una volta sola, i canali non collegati,
// la modalità prova, la risposta al Pannello e il flusso costruito. Nessuna rete.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eseguiCodice } from './esegui-codice.mjs';
import { costruisci, controlla } from '../23-mani-pannello/costruisci.mjs';

const leggi = (n) => readFileSync(new URL(`../23-mani-pannello/codice/${n}`, import.meta.url), 'utf8');
const CONTROLLA = leggi('controlla-azione.js');
const ESITO = leggi('esito.js');
const azione = (extra = {}) => ({ azione_id: 'a1', titolo: 'Ricorda il fornaio', canale: 'telegram', testo: 'Chiama il fornaio alle 10', livello: 'giallo', firmata_da: 'nicola', ...extra });
const controlla_ = async (body, { modalita = 'vero', statico = {} } = {}) =>
  (await eseguiCodice(CONTROLLA, { nodi: { Config: [{ json: { MODALITA: modalita } }], 'Ricevi la richiesta': [{ json: { body } }] }, statico }))[0].json;

test('un 🔴 non firmato da Nicola non parte; firmato sì', async () => {
  const auto = await controlla_(azione({ livello: 'rosso', firmata_da: 'auto' }));
  assert.equal(auto.esegui, null);
  assert.match(auto.risposta.dettaglio, /senza la firma di Nicola/);
  const nicola = await controlla_(azione({ livello: 'rosso', firmata_da: 'nicola' }));
  assert.equal(nicola.esegui, 'telegram');
});

test('un livello che non si legge vale rosso', async () => {
  const r = await controlla_(azione({ livello: 'bianco', firmata_da: 'auto' }));
  assert.equal(r.esegui, null);
  assert.match(r.risposta.dettaglio, /🔴/);
});

test('la stessa azione una volta sola', async () => {
  const statico = {};
  assert.equal((await controlla_(azione(), { statico })).esegui, 'telegram');
  const di_nuovo = await controlla_(azione(), { statico });
  assert.equal(di_nuovo.esegui, null);
  assert.match(di_nuovo.risposta.dettaglio, /già eseguita/);
});

test('un canale non collegato resta in coda col motivo', async () => {
  const r = await controlla_(azione({ canale: 'whatsapp' }));
  assert.equal(r.risposta.stato, 'coda');
  assert.match(r.risposta.dettaglio, /«whatsapp» non è ancora collegato/);
});

test('in prova niente parte e non si segna «eseguita»', async () => {
  const statico = {};
  const r = await controlla_(azione(), { modalita: 'prova', statico });
  assert.equal(r.esegui, null);
  assert.equal(r.risposta.stato, 'simulata');
  assert.deepEqual(statico.eseguite, {});
});

test('azione incompleta → coda', async () => {
  assert.equal((await controlla_({ titolo: 'x' })).risposta.stato, 'coda');
});

test('la risposta al Pannello: «fatta» solo se Telegram ha detto ok', async () => {
  const c = await controlla_(azione());
  const fatta = await eseguiCodice(ESITO, { nodi: { 'Controlla la richiesta': [{ json: c }], 'Manda con Telegram': [{ json: { message_id: 7 } }] } });
  assert.equal(fatta[0].json.stato, 'fatta');
  const rotta = await eseguiCodice(ESITO, { nodi: { 'Controlla la richiesta': [{ json: c }], 'Manda con Telegram': [{ json: { error: { message: 'chat not found' } } }] } });
  assert.equal(rotta[0].json.stato, 'coda');
  assert.match(rotta[0].json.dettaglio, /chat not found/);
  const decisa = await eseguiCodice(ESITO, { nodi: { 'Controlla la richiesta': [{ json: { risposta: { stato: 'simulata', dettaglio: 'prova' } } }] } });
  assert.deepEqual(decisa[0].json, { stato: 'simulata', dettaglio: 'prova' });
});

test('il flusso 23: webhook col segreto, risponde al Pannello, Telegram solo verso Nicola, errori al 99', () => {
  const w = costruisci({ telegram: { id: 't', name: 'T' }, chatId: '1', errorWorkflow: 'e', segreto: 's' });
  assert.deepEqual(controlla(w), []);
  w.nodes.find((n) => n.name === 'Manda con Telegram').parameters.chatId = '12345';
  assert.ok(controlla(w).some((p) => /non è quella di Nicola/.test(p)));
});

test('collaudo 25/11: un’azione per un’altra persona non si dice «fatta»', async () => {
  const r = await controlla_(azione({ destinatario: '@cliente_rossi' }));
  assert.equal(r.esegui, null);
  assert.match(r.risposta.dettaglio, /solo a Nicola/);
});
