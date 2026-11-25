// Le prove dei nomi dei flussi: col nome nuovo si trova anche il flusso che ha ancora il nome vecchio.
// Si lancia con: node --test flussi/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOMI, NOMI_VECCHI, trovaFlusso, nomiDi } from '../nomi.mjs';

test('col nome nuovo si trova il flusso che si chiama ancora col vecchio', () => {
  const elenco = [{ id: 'a', name: '12 · Nuovo cliente (automatico)' }, { id: 'b', name: '16 · Montatore' }];
  assert.equal(trovaFlusso(elenco, NOMI.nuovoCliente)?.id, 'a');
});

test('se ci sono il nome nuovo e il vecchio, vince il nuovo', () => {
  const elenco = [{ id: 'vecchio', name: "18 · Analisi di un'attività" }, { id: 'nuovo', name: NOMI.analisiAttivita }];
  assert.equal(trovaFlusso(elenco, NOMI.analisiAttivita)?.id, 'nuovo');
});

test('gli archiviati non contano', () => {
  const elenco = [{ id: 'x', name: '19 · Bozze dei 3 abbonamenti', isArchived: true }];
  assert.equal(trovaFlusso(elenco, NOMI.bozzeAbbonamenti), undefined);
});

test('i due «16» e i due «19» non si confondono', () => {
  const elenco = [
    { id: 'm', name: '16 · Montatore' }, { id: 'n', name: '16 · Nuovo cliente da MyCity' },
    { id: 'b', name: '19 · Bozze dei 3 abbonamenti' }, { id: 'c', name: "19 · Consegna la scheda scritta dall'AD" },
  ];
  assert.equal(trovaFlusso(elenco, NOMI.nuovoClienteDaMyCity)?.id, 'n');
  assert.equal(trovaFlusso(elenco, NOMI.bozzeAbbonamenti)?.id, 'b');
  assert.equal(trovaFlusso(elenco, NOMI.consegnaScheda)?.id, 'c');
});

test('ogni nome nuovo ha un numero diverso, e nessun nome vecchio è il nome nuovo di un altro', () => {
  const numeri = Object.values(NOMI).map((n) => n.split(' ')[0]);
  assert.equal(new Set(numeri).size, numeri.length);
  const nuovi = new Set(Object.values(NOMI));
  for (const vecchi of Object.values(NOMI_VECCHI)) for (const v of vecchi) assert.ok(!nuovi.has(v), v);
  assert.deepEqual(nomiDi(NOMI.avvisiErrori), ['99 · Avvisi errori']);
});

test('il Montatore si trova anche col nome vecchio, senza confondersi col 26', () => {
  const elenco = [{ id: 'm', name: '16 · Montatore' }, { id: 'n', name: '26 · Nuovo cliente da MyCity' }];
  assert.equal(trovaFlusso(elenco, NOMI.montatore)?.id, 'm');
});
