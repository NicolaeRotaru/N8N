// Le prove del 25 · Numeri del mattino e della sera: il lavoro per «Chiedi all'AD», il ripiego coi
// soli numeri, la modalità prova e il flusso costruito. Nessuna rete.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eseguiCodice } from './esegui-codice.mjs';
import { costruisci, controlla } from '../25-numeri-mattino-sera/costruisci.mjs';

const leggi = (n) => readFileSync(new URL(`../25-numeri-mattino-sera/codice/${n}`, import.meta.url), 'utf8');
const PREPARA = leggi('prepara-lavoro.js');
const COMPONI = leggi('componi.js');
const calcolati = { quando: '2026-11-25T05:00:00Z', numeri: { ordini_24h: 0, ordini_7g: 2, incasso_7g: null, consegne_in_corso: 4, ordini_fermi: 4, nuovi_clienti_24h: 0, carrelli_da_recuperare: 4 },
  delta: {}, sentinelle: [{ colore: 'giallo', titolo: '4 ordini aperti da più di 2 ore' }], negozi_fermi: [], gap: ['lead dei negozi: non letti (risposta 401)'], cieco: false };
const nodi = (cfg, extra = {}) => ({ Config: [{ json: cfg }], 'Calcola i numeri': [{ json: calcolati }], ...extra });

test('il lavoro per l’AD: compito per esteso, numeri come dati, schema; il momento si può forzare', async () => {
  const [{ json: l }] = await eseguiCodice(PREPARA, { nodi: nodi({ MODALITA: 'vero', MOMENTO: 'sera' }) });
  assert.equal(l.flusso, '25 · Numeri del mattino e della sera');
  assert.match(l.compito, /REPORT DELLA SERA/);
  assert.match(l.compito, /null vuol dire «non misurato»/);
  assert.equal(l.dati.numeri.incasso_7g, null);
  assert.deepEqual(l.schema.required, ['testo']);
  assert.equal(l.non_mandare, undefined);
});

test('in prova il lavoro non accende l’AD; col database cieco nemmeno', async () => {
  const [{ json: p }] = await eseguiCodice(PREPARA, { nodi: nodi({ MODALITA: 'prova', MOMENTO: 'mattino' }) });
  assert.match(p.non_mandare, /prova/);
  const cieco = { ...nodi({ MODALITA: 'vero' }), 'Calcola i numeri': [{ json: { ...calcolati, cieco: true } }] };
  const [{ json: c }] = await eseguiCodice(PREPARA, { nodi: cieco });
  assert.match(c.non_mandare, /database non leggibile/);
});

test('col testo dell’AD il messaggio lo usa; «non misurato» resta scritto così', async () => {
  const [{ json: l }] = await eseguiCodice(PREPARA, { nodi: nodi({ MODALITA: 'vero', MOMENTO: 'mattino' }) });
  const [{ json: m }] = await eseguiCodice(COMPONI, { nodi: nodi({ MODALITA: 'vero' }, { 'Prepara il lavoro': [{ json: l }],
    'Chiedi il testo all’AD': [{ json: { ok: true, risultato: { testo: 'Il punto adesso: 4 ordini fermi da Pane Quotidiano.' } } }] }) });
  assert.equal(m.con_testo_ad, true);
  assert.match(m.messaggio, /Piano del mattino/);
  assert.match(m.messaggio, /4 ordini fermi da Pane Quotidiano/);
  assert.match(m.messaggio, /Incasso 7 giorni: non misurato/);
  assert.equal(m.manda, true);
});

test('se l’AD non risponde arrivano i soli numeri, col motivo', async () => {
  const [{ json: l }] = await eseguiCodice(PREPARA, { nodi: nodi({ MODALITA: 'vero', MOMENTO: 'sera' }) });
  const [{ json: m }] = await eseguiCodice(COMPONI, { nodi: nodi({ MODALITA: 'vero' }, { 'Prepara il lavoro': [{ json: l }],
    'Chiedi il testo all’AD': [{ json: { ok: false, errore: 'tetto del giorno raggiunto' } }] }) });
  assert.equal(m.con_testo_ad, false);
  assert.match(m.messaggio, /Solo i numeri: tetto del giorno raggiunto/);
  assert.match(m.messaggio, /🟡 4 ordini aperti/);
});

test('in prova il messaggio si compone ma non si manda', async () => {
  const [{ json: l }] = await eseguiCodice(PREPARA, { nodi: nodi({ MODALITA: 'prova', MOMENTO: 'sera' }) });
  const [{ json: m }] = await eseguiCodice(COMPONI, { nodi: nodi({ MODALITA: 'prova' }, { 'Prepara il lavoro': [{ json: l }], 'Chiedi il testo all’AD': [{ json: { ok: false, errore: 'non mandato' } }] }) });
  assert.equal(m.manda, false);
  assert.match(m.messaggio, /🧪 prova/);
});

test('il flusso 25: alle 6 e alle 18, sola lettura, chiama Chiedi all’AD e lo aspetta, errori al 99', () => {
  const w = costruisci({ telegram: { id: 't', name: 'T' }, chatId: '1', marketplace: 'm', errorWorkflow: 'e', chiedi: 'c' });
  assert.deepEqual(controlla(w), []);
  assert.equal(w.nodes.find((n) => n.type === 'n8n-nodes-base.scheduleTrigger').parameters.rule.interval[0].expression, '0 6,18 * * *');
  const ch = w.nodes.find((n) => n.type === 'n8n-nodes-base.executeWorkflow');
  assert.equal(ch.parameters.options.waitForSubWorkflow, true);
  assert.equal(ch.parameters.workflowId.value, 'c');
  for (const n of w.nodes.filter((x) => x.credentials?.supabaseApi)) assert.ok(['GET', 'HEAD'].includes(n.parameters.method));
});
