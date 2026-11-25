// Le prove del collegamento a «Chiedi all'AD»: il nodo verso Claude diventa tre nodi, la richiesta di prima
// diventa un lavoro per l'AD, la risposta torna nella forma di prima. Flussi finti, costruiti qui.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collega, espressione, FLUSSI, accendiVoce } from '../chiedi-all-ad/collega.mjs';
import { conta } from '../conta-api-claude.mjs';
import { eseguiCodice } from './esegui-codice.mjs';

const va = (...verso) => ({ main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) });
const claude = (name, jsonBody) => ({ name, type: 'n8n-nodes-base.httpRequest', position: [500, 0],
  parameters: { method: 'POST', url: 'https://api.anthropic.com/v1/messages', jsonBody } });
const finto = (corpo) => ({ id: 'f', name: 'flusso finto', active: true,
  nodes: [{ name: 'Prepara', type: 'n8n-nodes-base.code', parameters: {} }, claude('Chiedi a Claude', corpo), { name: 'Leggi', type: 'n8n-nodes-base.code', parameters: {} }],
  connections: { Prepara: va('Chiedi a Claude'), 'Chiedi a Claude': va('Leggi') } });
const nodi = (extra = {}) => [{ nodo: 'Chiedi a Claude', cosa: 'prova', forma: 'corpo', ...extra }];

test('il corpo della richiesta diventa un\'espressione JavaScript', () => {
  assert.equal(espressione('={{ JSON.stringify($json.richiesta) }}'), '($json.richiesta)');
  const modello = espressione('={\n "model": {{ JSON.stringify($(\'Config\').first().json.M) }},\n "system": {{ JSON.stringify($json.s) }}\n}');
  assert.equal(modello, '({\n "model": ($(\'Config\').first().json.M),\n "system": ($json.s)\n})');
  assert.throws(() => espressione('={{ $json.a + $json.b }} e {{ $json.c }}'), /non riconosciuto/);
});

test('il nodo verso Claude diventa tre nodi, collegati al posto suo; rilanciato non cambia niente', () => {
  const prima = finto('={{ JSON.stringify($json.richiesta) }}');
  assert.equal(conta([prima]).totale, 1);
  const { flusso, modifiche } = collega(prima, { nodi: nodi(), chiediId: 'ID-CHIEDI' });
  assert.equal(modifiche.length, 1);
  assert.equal(conta([flusso]).totale, 0);
  assert.deepEqual(flusso.connections.Prepara.main[0].map((c) => c.node), ["Per l'AD: prova"]);
  assert.equal(flusso.connections["Per l'AD: prova"].main[0][0].node, "Chiedi all'AD: prova");
  assert.equal(flusso.connections["Chiedi all'AD: prova"].main[0][0].node, "Dall'AD: prova");
  assert.equal(flusso.connections["Dall'AD: prova"].main[0][0].node, 'Leggi');
  const chiedi = flusso.nodes.find((n) => n.name === "Chiedi all'AD: prova");
  assert.equal(chiedi.parameters.workflowId.value, 'ID-CHIEDI');
  assert.equal(chiedi.parameters.mode, 'once', 'tutti gli elementi in una corsa');
  assert.equal(chiedi.parameters.options.waitForSubWorkflow, true);
  assert.equal(prima.nodes.length, 3, 'l\'originale non si tocca');
  assert.deepEqual(collega(flusso, { nodi: nodi(), chiediId: 'ID-CHIEDI' }).modifiche, []);
  assert.throws(() => collega(finto('{}'), { nodi: [{ nodo: 'Altro', cosa: 'x', forma: 'corpo' }], chiediId: 'x' }), /non trovo/);
});

test('la richiesta per Claude diventa un lavoro per l\'AD: sistema, messaggio, foto, schema', async () => {
  const { flusso } = collega(finto('={{ JSON.stringify($json.richiesta) }}'), { nodi: nodi(), chiediId: 'x' });
  const per = flusso.nodes.find((n) => n.name === "Per l'AD: prova").parameters.jsCode;
  const richiesta = { system: [{ type: 'text', text: 'Controlla il post.' }], output_config: { format: { schema: { type: 'object', required: ['esito'] } } },
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'https://foto.example/a.jpg' } },
      { type: 'image', source: { type: 'base64', data: 'AAAA' } }, { type: 'text', text: 'Il post: <testo>ciao</testo>' }] }] };
  const out = await eseguiCodice(per, { input: [{ json: { richiesta } }, { json: { richiesta } }] });
  assert.equal(out.length, 2);
  const l = out[0].json;
  assert.equal(l.flusso, 'flusso finto');
  assert.match(l.compito, /^Controlla il post\./);
  assert.match(l.compito, /Una foto non è stata mandata/);
  assert.deepEqual(l.dati, { messaggio: 'Il post: <testo>ciao</testo>', foto: ['https://foto.example/a.jpg'] });
  assert.deepEqual(l.schema, { type: 'object', required: ['esito'] });
  assert.ok(!JSON.stringify(l).includes('AAAA'), 'le foto in base64 non viaggiano');
  assert.equal(l.non_mandare, undefined);
  assert.doesNotMatch(l.compito, /cercare sul web/);
  const [conRicerca] = await eseguiCodice(per, { input: [{ json: { richiesta: { ...richiesta, tools: [{ type: 'web_search_20260209', name: 'web_search' }] } } }] });
  assert.match(conRicerca.json.compito, /puoi cercare sul web/);
});

test('se servono foto che non possono arrivare, il lavoro non si manda', async () => {
  const { flusso } = collega(finto('={{ JSON.stringify($json.corpo) }}'), { nodi: nodi({ fotoNecessarie: true }), chiediId: 'x' });
  const per = flusso.nodes.find((n) => n.name === "Per l'AD: prova").parameters.jsCode;
  const corpo = { system: 'Scegli la copertina.', messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', data: 'B' } }, { type: 'text', text: 'scegli' }] }] };
  const [l] = await eseguiCodice(per, { input: [{ json: { corpo } }] });
  assert.match(l.json.non_mandare, /foto/);
});

test('la risposta dell\'AD torna nella forma che il nodo dopo leggeva da Claude', async () => {
  for (const forma of ['corpo', 'completa']) {
    const { flusso } = collega(finto('={{ JSON.stringify($json.r) }}'), { nodi: nodi({ forma }), chiediId: 'x' });
    const dall = flusso.nodes.find((n) => n.name === "Dall'AD: prova").parameters.jsCode;
    const [bene, male] = await eseguiCodice(dall, { input: [{ json: { ok: true, risultato: { esito: 'ok' }, avvisi: [] } }, { json: { ok: false, errore: 'tetto di 40 corse' } }] });
    const corpo = forma === 'completa' ? bene.json.body : bene.json;
    if (forma === 'completa') assert.equal(bene.json.statusCode, 200);
    assert.deepEqual(JSON.parse(corpo.content.find((b) => b.type === 'text').text), { esito: 'ok' });
    assert.equal(corpo.stop_reason, 'end_turn');
    const errore = forma === 'completa' ? male.json.body.error : male.json.error;
    assert.match(errore.message, /tetto di 40 corse/);
    if (forma === 'completa') assert.notEqual(male.json.statusCode, 200);
  }
});

test('i flussi da collegare sono quelli accesi con Claude; il 16 si rigenera dal 12', () => {
  assert.deepEqual(Object.keys(FLUSSI).sort(), ['01', '04', '08', '12']);
  assert.ok(FLUSSI['08'].nodi.every((n) => n.fotoNecessarie), 'il 08 senza foto non manda niente');
});

test('la voce del Config si accende solo quando non resta nessun nodo a pagamento', () => {
  const cfg = { name: 'Config', type: 'n8n-nodes-base.set', parameters: { assignments: { assignments: [{ name: 'RICERCA_CON_CLAUDE', value: 'no' }] } } };
  const prima = finto('={{ JSON.stringify($json.r) }}');
  prima.nodes.push(structuredClone(cfg));
  assert.throws(() => accendiVoce(structuredClone(prima), 'RICERCA_CON_CLAUDE'), /restano nodi/);
  const { flusso } = collega(prima, { nodi: nodi(), chiediId: 'x' });
  assert.match(accendiVoce(flusso, 'RICERCA_CON_CLAUDE'), /= si/);
  assert.equal(flusso.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments[0].value, 'si');
  assert.equal(FLUSSI['12'].accendi, 'RICERCA_CON_CLAUDE');
});
