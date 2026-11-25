// Le prove del 22 · Sito che risponde: gli stati, l'avviso solo al cambio, la conferma prima di
// dire «giù», e il flusso costruito. Nessuna rete.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eseguiCodice } from './esegui-codice.mjs';
import { costruisci, controlla } from '../22-sito-risponde/costruisci.mjs';

const CODICE = readFileSync(new URL('../22-sito-risponde/codice/valuta-sito.js', import.meta.url), 'utf8');
const config = (extra = {}) => [{ json: { MODALITA: 'vero', CONFERME_GIU: 2, ...extra } }];
const ok = (body = '<html></html>') => [{ json: { statusCode: 200, body } }];
// Il corpo vero del 25/11 alle 12:15, accorciato: il sito risponde ma i lavori automatici sono fermi.
const DEGRADATO = JSON.stringify({ status: 'ready', degraded: true, cron: { ok: false, stato: 'fermi',
  error: 'release-payouts fermo da 170591min (soglia 120); send-emails fermo da 170192min (soglia 120); abandoned-carts fermo da 170231min (soglia 180)' } });
const DEGRADATO_DOPO = DEGRADATO.replace('170591', '170596').replace('170192', '170197');
const giu = [{ json: { error: { message: 'getaddrinfo ENOTFOUND' } } }];
const nodi = (home, pronto, extra) => ({ Config: config(extra), 'Guarda la pagina iniziale': home, 'Guarda il controllo «pronto»': pronto });
const esegui = async (n, statico) => (await eseguiCodice(CODICE, { nodi: n, statico }))[0].json;

test('degradato: legge i nomi dei lavori fermi dal controllo «pronto» vero', async () => {
  const r = await esegui(nodi(ok(), ok(DEGRADATO)), {});
  assert.equal(r.stato, 'degradato');
  assert.deepEqual(r.fermi, ['abandoned-carts', 'release-payouts', 'send-emails']);
  assert.match(r.messaggio, /3 lavori automatici fermi/);
});

test('i minuti di fermo che crescono non fanno ripartire l\'avviso', async () => {
  const statico = {};
  assert.equal((await esegui(nodi(ok(), ok(DEGRADATO)), statico)).manda, true);
  assert.equal((await esegui(nodi(ok(), ok(DEGRADATO_DOPO)), statico)).manda, false);
});

test('«giù» solo dopo 2 controlli falliti di fila; il ritorno a «su» si dice subito', async () => {
  const statico = {};
  await esegui(nodi(ok(), ok('{"status":"ready"}')), statico);
  const uno = await esegui(nodi(giu, giu), statico);
  assert.equal(uno.stato, 'su');
  assert.equal(uno.manda, false);
  const due = await esegui(nodi(giu, giu), statico);
  assert.equal(due.stato, 'giù');
  assert.equal(due.manda, true);
  assert.match(due.messaggio, /non risponde bene/);
  const torna = await esegui(nodi(ok(), ok('{"status":"ready"}')), statico);
  assert.equal(torna.stato, 'su');
  assert.equal(torna.manda, true);
  assert.match(torna.messaggio, /Prima era: 🔴 giù/);
});

test('un 500 della pagina iniziale conta come guasto', async () => {
  const statico = { ultima_firma: 'su', ultimo_stato: 'su', modalita: 'vero', giu_di_fila: 1 };
  const r = await esegui(nodi([{ json: { statusCode: 500, body: 'errore' } }], ok('{"status":"ready"}')), statico);
  assert.equal(r.stato, 'giù');
  assert.match(r.messaggio, /risposta 500/);
});

test('in prova non manda niente', async () => {
  const r = await esegui(nodi(ok(), ok(DEGRADATO), { MODALITA: 'prova' }), {});
  assert.equal(r.cambiato, true);
  assert.equal(r.manda, false);
});

test('il flusso 22: ogni 5 minuti, solo GET al sito vero, errori al 99', () => {
  const w = costruisci({ telegram: { id: 't', name: 'T' }, chatId: '1', errorWorkflow: 'e' });
  assert.deepEqual(controlla(w), []);
  assert.deepEqual(w.nodes.find((n) => n.type === 'n8n-nodes-base.scheduleTrigger').parameters.rule.interval[0], { field: 'minutes', minutesInterval: 5 });
  const cfg = w.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments;
  assert.equal(cfg.find((a) => a.name === 'SITO_URL').value, 'https://www.mycity-marketplace.com');
  for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.httpRequest')) assert.equal(n.parameters.method, 'GET');
});
