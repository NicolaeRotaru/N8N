// Le prove della copia di sicurezza: senza n8n, con un'API finta.
// Si lancia con: node --test flussi/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { faiCopia, verificaCopia, controllaFile, nomeFile, perCopia, repositoryDi } from '../copia-di-sicurezza.mjs';

const flusso = (id, name, extra = {}) => ({
  id, name, active: false, isArchived: false, tags: [{ name: '0x social' }], updatedAt: '2026-11-25T10:00:00.000Z',
  nodes: [{ name: 'Avvio', type: 'n8n-nodes-base.manualTrigger', parameters: {} }, { name: 'Fine', type: 'n8n-nodes-base.noOp', parameters: {} }],
  connections: { Avvio: { main: [[{ node: 'Fine', type: 'main', index: 0 }]] } },
  settings: { executionOrder: 'v1' }, ...extra,
});

const api = {
  elencoFlussi: async () => [{ id: 'a1' }, { id: 'b2' }],
  leggiFlusso: async (id) => id === 'a1'
    ? flusso('a1', '01 · Pubblica contenuti', { pinData: { Avvio: [{ json: { segreto: 'non salvarmi' } }] } })
    : flusso('b2', 'MyCity · 11 Foto prodotto', { isArchived: true }),
  elencoCredenziali: async () => [{ id: 'c1', name: 'Telegram - Bot agenzia', type: 'telegramApi', data: { accessToken: 'SEGRETO' }, shared: [] }],
};

test('la copia salva ogni flusso senza pinData e le credenziali senza segreti', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'copia-'));
  const r = await faiCopia(cartella, api);
  assert.deepEqual(r, { flussi: 2, credenziali: 1 });
  const file = readdirSync(join(cartella, 'flussi')).sort();
  assert.deepEqual(file, ['01-pubblica-contenuti__a1.json', 'mycity-11-foto-prodotto__b2.json']);
  const tutto = file.map((f) => readFileSync(join(cartella, 'flussi', f), 'utf8')).join('');
  assert.doesNotMatch(tutto, /non salvarmi/);
  const cred = readFileSync(join(cartella, 'credenziali.json'), 'utf8');
  assert.doesNotMatch(cred, /SEGRETO/);
  assert.deepEqual(JSON.parse(cred), [{ id: 'c1', nome: 'Telegram - Bot agenzia', tipo: 'telegramApi' }]);
  const elenco = JSON.parse(readFileSync(join(cartella, 'elenco.json'), 'utf8')).flussi;
  assert.equal(elenco.find((v) => v.id === 'b2').archiviato, true);
  assert.deepEqual(verificaCopia(cartella).errori, []);
});

test('la verifica trova un file rovinato', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'copia-'));
  await faiCopia(cartella, api);
  const f = join(cartella, 'flussi', '01-pubblica-contenuti__a1.json');
  const rotto = JSON.parse(readFileSync(f, 'utf8'));
  rotto.connections.Avvio.main[0][0].node = 'Sparito';
  writeFileSync(f, JSON.stringify(rotto));
  assert.match(verificaCopia(cartella).errori.join('\n'), /verso un nodo che non c'è: Sparito/);
});

test('controllaFile vuole nome, nodi, collegamenti e niente pinData', () => {
  assert.deepEqual(controllaFile(perCopia(flusso('x', 'Ok'))), []);
  assert.match(controllaFile({ ...flusso('x', 'Ok'), pinData: { Avvio: [{}] } }).join(), /pinData/);
  assert.match(controllaFile({ ...flusso('x', ''), name: '' }).join(), /nome/);
});

test('nomeFile è leggibile e unico per id', () => {
  assert.equal(nomeFile({ id: 'Z9', name: "18 · Analisi di un'attività" }), '18-analisi-di-un-attivita__Z9.json');
});

test('non scrive dentro un repository pubblico', async () => {
  const qui = dirname(fileURLToPath(import.meta.url));
  if (repositoryDi(qui) !== 'nicolaerotaru/n8n') return; // la prova ha senso solo nel clone del repository N8N
  await assert.rejects(faiCopia(join(qui, 'copia-vietata'), api), /repository pubblico/);
});
