// Le prove del 21 · Sentinella dei dati. Dati finti costruiti qui, più la copia (senza dati
// personali) degli ordini veri del 25/11/2026: nessun database, nessun n8n.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eseguiCodice } from './esegui-codice.mjs';
import { costruisci, controlla, LETTURE_21 } from '../21-sentinella-dati/costruisci.mjs';
import { CREDENZIALE_MARKETPLACE } from '../comune.mjs';

const CODICE = readFileSync(new URL('../21-sentinella-dati/codice/valuta-sentinelle.js', import.meta.url), 'utf8');
const ORA = 3600000;
const fa = (ore) => new Date(Date.now() - ore * ORA).toISOString();
const risposta = (righe) => [{ json: { statusCode: 200, headers: { 'content-range': `0-${Math.max(righe.length - 1, 0)}/${righe.length}` }, body: righe } }];
const errore400 = [{ json: { statusCode: 400, body: { message: 'column abandoned_carts.id does not exist' } } }];
const config = (extra = {}) => [{ json: { MODALITA: 'vero', NEGOZI_IN_ATTESA: '', ORE_PAYOUT: 24, ORE_CARRELLO: 4, ORE_ORDINE_FERMO: 2,
  GIORNI_NEGOZIO_FERMO: 14, CALO_SOGLIA: 0.7, CALO_MEDIA_MINIMA: 3, GIORNI_MARKETPLACE_FERMO: '3,7,14,30', ...extra } }];

const base = (extra = {}) => ({
  Config: config(),
  'Leggi gli ordini': risposta([]),
  'Leggi i negozi': risposta([]),
  'Leggi i carrelli': risposta([]),
  'Leggi le recensioni dei prodotti': risposta([]),
  'Leggi le recensioni dei negozi': risposta([]),
  ...extra,
});
const esegui = async (nodi, statico = {}) => (await eseguiCodice(CODICE, { nodi, statico }))[0].json;

test('i carrelli si contano dalle colonne che esistono (il guasto del cervello: select=id → 400)', async () => {
  const r = await esegui(base({ 'Leggi i carrelli': risposta([
    { recovered: false, recovery_email_sent_at: null, last_activity: fa(6) },
    { recovered: false, recovery_email_sent_at: null, last_activity: fa(30) },
    { recovered: false, recovery_email_sent_at: fa(1), last_activity: fa(30) }, // email già partita
    { recovered: true, recovery_email_sent_at: null, last_activity: fa(30) }, // recuperato
    { recovered: false, recovery_email_sent_at: null, last_activity: fa(1) }, // troppo fresco
  ]) }));
  assert.equal(r.numeri.carrelli_da_recuperare, 2);
  assert.ok(r.sentinelle.some((s) => s.id === 'carrelli'));
});

test('se la lettura dei carrelli fallisce è «non misurato», mai zero, e lo dice', async () => {
  const r = await esegui(base({ 'Leggi i carrelli': errore400 }));
  assert.equal(r.numeri.carrelli_da_recuperare, null);
  assert.ok(r.gap.some((g) => /carrelli: non letti \(risposta 400/.test(g)));
});

test('la lettura dei carrelli nel flusso non chiede la colonna id', () => {
  const carrelli = LETTURE_21.find(([n]) => n === 'Leggi i carrelli')[1];
  assert.doesNotMatch(carrelli, /select=[^&]*\bid\b/);
});

test('gli ordini veri del 25/11: 4 oltre lo slot (il cervello cercava expected_delivery, che non esiste)', async () => {
  // Copia degli ordini veri, senza dati personali. Alle 12:10 UTC del 25/11 erano tutti oltre lo slot.
  const veri = [
    { seller_id: 'c0b240c0', created_at: '2026-06-24T08:28:40Z', delivery_slot: 'Stasera · 18:00–20:00', delivery_status: 'CANCELED', payment_status: 'PENDING', payment_method: 'cod', canceled_at: '2026-07-03T15:38:22Z' },
    { seller_id: 'c0b240c0', created_at: '2026-11-13T13:56:48Z', delivery_slot: 'Oggi · 16:30–18:00', delivery_status: 'READY', payment_status: 'PENDING', payment_method: 'cod' },
    { seller_id: 'c0b240c0', created_at: '2026-11-16T09:55:32Z', delivery_slot: 'Oggi · 11:00–13:00', delivery_status: 'NEW', payment_status: 'PENDING', payment_method: 'cod' },
    { seller_id: 'c0b240c0', created_at: '2026-11-21T01:23:51Z', delivery_slot: 'Oggi · 9:00–11:00', delivery_status: 'READY', payment_status: 'PENDING', payment_method: 'cod' },
    { seller_id: 'c0b240c0', created_at: '2026-11-23T19:07:37Z', delivery_slot: 'Domani · 11:00–13:00', delivery_status: 'NEW', payment_status: 'PENDING', payment_method: 'cod' },
  ];
  const r = await esegui(base({ 'Leggi gli ordini': risposta(veri) }));
  assert.equal(r.numeri.ordini_in_ritardo, 4);
  assert.equal(r.numeri.pagati_senza_payout, 0);
  assert.ok(r.sentinelle.some((s) => s.id === 'consegne-in-ritardo'));
});

test("lo slot si legge nell'ora di Piacenza: «Domani» è il giorno dopo, d'inverno e d'estate", async () => {
  // Uno script minimo che espone scadenzaSlot dal codice vero, senza copiarla.
  const solo = CODICE.split('// ---- i numeri')[0] + '\nreturn [{ json: { f: [scadenzaSlot(\'Domani · 11:00–13:00\', \'2026-11-23T19:07:37Z\'), scadenzaSlot(\'Oggi · 9:00–11:00\', \'2026-07-10T06:00:00Z\'), scadenzaSlot(\'Stasera · 18:00–20:00\', \'2026-03-28T23:30:00Z\'), scadenzaSlot(\'quando vuoi\', \'2026-07-10T06:00:00Z\')] } }];';
  const [{ json: { f } }] = await eseguiCodice(solo, { nodi: base() });
  assert.equal(new Date(f[0]).toISOString(), '2026-11-24T12:00:00.000Z'); // 13:00 a Piacenza, inverno (+1)
  assert.equal(new Date(f[1]).toISOString(), '2026-07-10T09:00:00.000Z'); // 11:00 a Piacenza, estate (+2)
  // 23:30 UTC del 28/3 = 00:30 del 29/3 a Piacenza, giorno del cambio d'ora: 20:00 estive = 18:00 UTC
  assert.equal(new Date(f[2]).toISOString(), '2026-03-29T18:00:00.000Z');
  assert.ok(Number.isNaN(f[3]));
});

test('un ordine con lo slot ancora davanti non è in ritardo; uno consegnato nemmeno', async () => {
  const domani = new Date(Date.now() + 30 * ORA);
  const r = await esegui(base({ 'Leggi gli ordini': risposta([
    { seller_id: 's', created_at: fa(0.5), delivery_slot: 'Domani · 20:00–22:00', delivery_status: 'NEW', payment_status: 'PENDING' },
    { seller_id: 's', created_at: fa(48), delivery_slot: 'Oggi · 9:00–11:00', delivery_status: 'DELIVERED', delivered_at: fa(40), payment_status: 'PAID', payment_method: 'cod' },
  ]) }));
  assert.ok(domani);
  assert.equal(r.numeri.ordini_in_ritardo, 0);
});

test('payout fermo: carta pagata da più di 24 ore senza payout; i contanti no', async () => {
  const r = await esegui(base({ 'Leggi gli ordini': risposta([
    { seller_id: 's', created_at: fa(30), payment_status: 'PAID', payment_method: 'card', delivery_status: 'DELIVERED', delivered_at: fa(29) },
    { seller_id: 's', created_at: fa(30), payment_status: 'PAID', payment_method: 'cod', delivery_status: 'DELIVERED', delivered_at: fa(29) },
    { seller_id: '11111111-1111-1111-1111-000000000001', created_at: fa(30), payment_status: 'PAID', payment_method: 'card', delivery_status: 'DELIVERED', delivered_at: fa(29) },
  ]) }));
  assert.equal(r.numeri.pagati_senza_payout, 1);
  assert.equal(r.sentinelle.find((s) => s.id === 'payout-fermo').colore, '🔴');
});

test("l'avviso parte solo quando qualcosa cambia, e dice cosa è rientrato", async () => {
  const statico = {};
  const conCarrello = base({ 'Leggi i carrelli': risposta([{ recovered: false, recovery_email_sent_at: null, last_activity: fa(6) }]) });
  const primo = await esegui(conCarrello, statico);
  assert.equal(primo.manda, true);
  const secondo = await esegui(conCarrello, statico);
  assert.equal(secondo.manda, false, 'stesso stato: zitto');
  const terzo = await esegui(base(), statico);
  assert.equal(terzo.manda, true);
  assert.deepEqual(terzo.rientrate, ['carrelli']);
  assert.match(terzo.messaggio, /Rientrate: carrelli/);
});

test('in MODALITA prova non manda mai, ma ricorda; passando a vero manda lo stato vero', async () => {
  const statico = {};
  const prova = await esegui({ ...base(), Config: config({ MODALITA: 'prova' }) }, statico);
  assert.equal(prova.cambiato, true);
  assert.equal(prova.manda, false);
  const vero = await esegui(base(), statico);
  assert.equal(vero.manda, true, 'il cambio di modalità conta come cambiamento');
});

test('un giro cieco lo dice e non spegne le sentinelle accese prima', async () => {
  const statico = {};
  await esegui(base({ 'Leggi i carrelli': risposta([{ recovered: false, recovery_email_sent_at: null, last_activity: fa(6) }]) }), statico);
  const giu = [{ json: { error: { message: 'getaddrinfo ENOTFOUND' } } }];
  const cieco = await esegui({ Config: config(), 'Leggi gli ordini': giu, 'Leggi i negozi': giu, 'Leggi i carrelli': giu,
    'Leggi le recensioni dei prodotti': giu, 'Leggi le recensioni dei negozi': giu }, statico);
  assert.equal(cieco.cieco, true);
  assert.equal(cieco.manda, true);
  assert.match(cieco.messaggio, /Non riesco a leggere il database/);
  assert.deepEqual(statico.ultime_accese, ['carrelli']);
});

test('negozio fermo: approvato da più di 14 giorni senza ordini, tranne quelli in attesa concordata', async () => {
  const r = await esegui({ ...base({ 'Leggi i negozi': risposta([
    { id: 'a', role: 'seller', approval_status: 'approved', approved_at: fa(24 * 30), store_name: 'Bottega Ferma' },
    { id: 'b', role: 'seller', approval_status: 'approved', approved_at: fa(24 * 30), store_name: 'In Attesa' },
    { id: 'c', role: 'seller', approval_status: 'approved', approved_at: fa(24 * 3), store_name: 'Appena Arrivato' },
  ]) }), Config: config({ NEGOZI_IN_ATTESA: 'b:2999-12-31' }) });
  assert.deepEqual(r.negozi_fermi, ['Bottega Ferma']);
});

test('recensione bassa: al primo giro fissa la base, poi suona solo sulle nuove', async () => {
  const statico = {};
  const vecchia = { rating: 1, created_at: fa(100) }; // lo stesso istante nei due giri
  const vecchie = risposta([vecchia]);
  const primo = await esegui(base({ 'Leggi le recensioni dei prodotti': vecchie }), statico);
  assert.equal(primo.numeri.recensioni_basse_nuove, 0);
  const secondo = await esegui(base({ 'Leggi le recensioni dei prodotti': risposta([vecchia, { rating: 2, created_at: fa(1) }]) }), statico);
  assert.equal(secondo.numeri.recensioni_basse_nuove, 1);
});

test('il flusso 21: ogni 15 minuti, sola lettura, errori al 99, controlli a posto', () => {
  const w = costruisci({ telegram: { id: 't', name: 'T' }, chatId: '1', marketplace: 'm', errorWorkflow: 'e' });
  assert.deepEqual(controlla(w), []);
  const trigger = w.nodes.find((n) => n.type === 'n8n-nodes-base.scheduleTrigger');
  assert.deepEqual(trigger.parameters.rule.interval[0], { field: 'minutes', minutesInterval: 15 });
  for (const n of w.nodes.filter((x) => x.credentials?.supabaseApi)) {
    assert.equal(n.parameters.method, 'GET');
    assert.equal(n.credentials.supabaseApi.name, CREDENZIALE_MARKETPLACE.name);
  }
  assert.equal(w.settings.errorWorkflow, 'e');
  assert.equal(w.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments.find((a) => a.name === 'MODALITA').value, 'prova');
});

test('il controllo ferma un flusso che scrive sul marketplace', () => {
  const w = costruisci({ telegram: { id: 't', name: 'T' }, chatId: '1', marketplace: 'm', errorWorkflow: 'e' });
  w.nodes.find((n) => n.name === 'Leggi i carrelli').parameters.method = 'PATCH';
  assert.ok(controlla(w).some((p) => /marketplace per scrivere/.test(p)));
});

test('collaudo 25/11: una sentinella con la tabella cieca non è «rientrata» e non torna «nuova»', async () => {
  const statico = {};
  const pagato = risposta([{ seller_id: 's', created_at: fa(30), payment_status: 'PAID', payment_method: 'card', delivery_status: 'DELIVERED', delivered_at: fa(29) }]);
  await esegui(base({ 'Leggi gli ordini': pagato }), statico);
  const cieco = await esegui(base({ 'Leggi gli ordini': [{ json: { statusCode: 503, body: '' } }] }), statico);
  assert.deepEqual(cieco.rientrate, []);
  const torna = await esegui(base({ 'Leggi gli ordini': pagato }), statico);
  assert.deepEqual(torna.nuove, []);
});

test('collaudo 25/11: «Dopodomani» e la fascia che finisce a mezzanotte', async () => {
  const r = await esegui(base({ 'Leggi gli ordini': risposta([
    { seller_id: 's', created_at: fa(40), delivery_slot: 'Dopodomani · 21:00–23:00', delivery_status: 'NEW', payment_status: 'PENDING' },
    { seller_id: 's', created_at: fa(0.2), delivery_slot: 'Stasera · 22:00–00:00', delivery_status: 'NEW', payment_status: 'PENDING' },
  ]) }));
  assert.equal(r.numeri.ordini_in_ritardo, 0);
});
