// Le prove della modifica del 99: via la spiegazione con Claude, l'avviso parte uguale. Flusso finto.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { togli } from '../99-avvisi-errori/togli-spiegazione-ai.mjs';
import { conta } from '../conta-api-claude.mjs';

const nodo = (name, extra = {}) => ({ name, type: 'n8n-nodes-base.code', parameters: {}, ...extra });
const va = (...verso) => ({ main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) });
const finto = () => ({
  id: '99', name: '99 · Avvisi errori', active: true,
  nodes: [
    nodo('Errore in un flusso'),
    nodo('Config', { parameters: { assignments: { assignments: [{ name: 'SPIEGA_ERRORI_AI', value: 'si' }] } } }),
    nodo('Leggi errore'), nodo('Spiegazione AI accesa?'), nodo('Prepara spiegazione AI'),
    nodo("Spiega l'errore con Claude", { type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://api.anthropic.com/v1/messages' } }),
    nodo('Leggi spiegazione AI'), nodo('Avvisa il team'),
    nodo('Nota · Come funziona', { parameters: { content: 'Intro\n**Spiegazione con Claude** (SPIEGA_ERRORI_AI = si): bla.\nFine' } }),
  ],
  connections: {
    'Errore in un flusso': va('Config'), Config: va('Leggi errore'), 'Leggi errore': va('Spiegazione AI accesa?'),
    'Spiegazione AI accesa?': va('Prepara spiegazione AI', 'Leggi spiegazione AI'),
    'Prepara spiegazione AI': va("Spiega l'errore con Claude"), "Spiega l'errore con Claude": va('Leggi spiegazione AI'),
    'Leggi spiegazione AI': va('Avvisa il team'),
  },
});

test('il 99 perde la spiegazione con Claude e l\'avviso resta collegato', () => {
  const prima = finto();
  assert.equal(conta([prima]).totale, 1);
  const { flusso, modifiche } = togli(prima);
  assert.equal(conta([flusso]).totale, 0);
  assert.ok(modifiche.length >= 3);
  assert.deepEqual(flusso.connections['Leggi errore'].main[0].map((c) => c.node), ['Leggi spiegazione AI']);
  assert.equal(flusso.connections['Leggi spiegazione AI'].main[0][0].node, 'Avvisa il team');
  assert.equal(flusso.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments[0].value, 'no');
  assert.ok(!JSON.stringify(flusso.connections).includes('Spiega'), 'nessun collegamento verso i nodi tolti');
  assert.match(flusso.nodes.find((n) => n.name === 'Nota · Come funziona').parameters.content, /tolta/);
  assert.equal(prima.nodes.length, 9, 'l\'originale non si tocca');
  assert.deepEqual(togli(flusso).modifiche, [], 'rilanciato, non cambia niente');
});

test('se il 99 è cambiato, non tocca niente', () => {
  const w = finto();
  w.nodes = w.nodes.filter((n) => n.name !== 'Leggi spiegazione AI');
  assert.throws(() => togli(w), /non tocco niente/);
});
