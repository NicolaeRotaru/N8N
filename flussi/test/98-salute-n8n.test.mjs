// Le prove del 98 · Salute di n8n: elenco dei flussi accesi, ultimo giro buono, falliti nelle 24
// ore, onestà sui flussi che non salvano i giri buoni, e n8n che non si legge. Nessuna rete.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eseguiCodice } from './esegui-codice.mjs';
import { costruisci, controlla } from '../98-salute-n8n/costruisci.mjs';

const leggi = (n) => readFileSync(new URL(`../98-salute-n8n/codice/${n}`, import.meta.url), 'utf8');
const ELENCA = leggi('elenca-flussi.js');
const COMPONI = leggi('componi-salute.js');
const ORA = 3600000;
const fa = (ore) => new Date(Date.now() - ore * ORA).toISOString();
const ok = (data) => ({ json: { statusCode: 200, body: { data } } });
const Config = [{ json: { ORE_FINESTRA: 24, ORE_SENZA_GIRO_BUONO: 48 } }];

const FLUSSI = [
  { id: 'a', name: '17 · Analisi del marketplace', active: true, settings: { saveDataSuccessExecution: 'none' } },
  { id: 'b', name: '01 · Pubblica contenuti', active: true, settings: {} },
  { id: 'c', name: '03 · Piano del mese', active: false, settings: {} },
  { id: 'd', name: '12 · Nuovo cliente', active: true, settings: {} },
];

async function salute({ buoni, falliti, flussi = FLUSSI }) {
  const elenco = await eseguiCodice(ELENCA, { nodi: { 'Leggi i flussi': [ok(flussi)] } });
  const r = await eseguiCodice(COMPONI, { nodi: { Config, 'Un elemento per flusso acceso': elenco, 'Ultimo giro buono': buoni, 'Giri falliti': falliti } });
  return { elenco, r: r[0].json };
}

test('solo i flussi accesi, in ordine di numero', async () => {
  const elenco = await eseguiCodice(ELENCA, { nodi: { 'Leggi i flussi': [ok(FLUSSI)] } });
  assert.deepEqual(elenco.map((x) => x.json.nome), ['01 · Pubblica contenuti', '12 · Nuovo cliente', '17 · Analisi del marketplace']);
  assert.equal(elenco[2].json.salva_buoni, false);
});

test('un flusso fallito nelle 24 ore va in cima, rosso, con l\'ora', async () => {
  const { r } = await salute({
    buoni: [ok([{ stoppedAt: fa(30) }]), ok([{ stoppedAt: fa(2) }]), ok([])],
    falliti: [ok([{ stoppedAt: fa(3) }, { stoppedAt: fa(5) }, { stoppedAt: fa(80) }]), ok([]), ok([])],
  });
  assert.match(r.testo, /3 flussi accesi su 4/);
  assert.match(r.testo, /🔴 01 · Pubblica contenuti: fallito 2 volte in 24 ore/);
  assert.equal(r.falliti_totali, 2);
});

test('chi non salva i giri buoni non viene detto «mai girato»', async () => {
  const { r } = await salute({ buoni: [ok([{ stoppedAt: fa(2) }]), ok([{ stoppedAt: fa(1) }]), ok([])], falliti: [ok([]), ok([]), ok([])] });
  assert.match(r.testo, /17 · Analisi del marketplace \(giri buoni non salvati\)/);
  assert.doesNotMatch(r.testo, /17 · Analisi del marketplace \(mai\)/);
  assert.match(r.testo, /✅ Nessun flusso fallito/);
});

test('un flusso acceso senza giri buoni da più di 48 ore è giallo', async () => {
  const { r } = await salute({ buoni: [ok([{ stoppedAt: fa(72) }]), ok([{ stoppedAt: fa(1) }]), ok([])], falliti: [ok([]), ok([]), ok([])] });
  assert.match(r.testo, /🟡 01 · Pubblica contenuti: ultimo giro buono/);
});

test('se una lettura dei giri fallisce lo dice, non inventa', async () => {
  const { r } = await salute({ buoni: [ok([]), { json: { statusCode: 401, body: { message: 'unauthorized' } } }, ok([])], falliti: [ok([]), ok([]), ok([])] });
  assert.match(r.testo, /⛔ 12 · Nuovo cliente: giri non letti/);
});

test('se n8n non si legge lo dice', async () => {
  const elenco = await eseguiCodice(ELENCA, { nodi: { 'Leggi i flussi': [{ json: { statusCode: 401, body: {} } }] } });
  const [{ json: r }] = await eseguiCodice(COMPONI, { nodi: { Config, 'Un elemento per flusso acceso': elenco, 'Ultimo giro buono': [], 'Giri falliti': [] } });
  assert.equal(r.letto, false);
  assert.match(r.testo, /Non riesco a leggere n8n \(risposta 401\)/);
});

test('il flusso 98: chiamabile dal 17, sola lettura, errori al 99', () => {
  const w = costruisci({ errorWorkflow: 'e' });
  assert.deepEqual(controlla(w), []);
  assert.ok(w.nodes.some((n) => n.type === 'n8n-nodes-base.executeWorkflowTrigger'));
  for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.httpRequest')) assert.equal(n.parameters.method, 'GET');
});
