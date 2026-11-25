// Le prove nate dal collaudo del 25/11/2026: ogni difetto trovato ha la sua prova, che torna rossa se il
// difetto ritorna. Dati e flussi finti, costruiti qui.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eseguiCodice } from './esegui-codice.mjs';
import { conta, aPagamento } from '../conta-api-claude.mjs';
import { collega, espressione } from '../chiedi-all-ad/collega.mjs';
import { togli } from '../99-avvisi-errori/togli-spiegazione-ai.mjs';
import { ASPETTA } from '../chiedi-all-ad/costruisci.mjs';

const leggi = (nome) => readFileSync(new URL(`../chiedi-all-ad/codice/${nome}`, import.meta.url), 'utf8');
const PREPARA = leggi('prepara-lavoro.js');
const COMPONI = leggi('componi-risposta.js');
const CFG = { MODALITA: 'vero', ROUTINE_ID: 'trig_x', TETTO_GIORNO: 40, TETTO_ORA: 25 };
const lavoro = (extra = {}) => ({ json: { flusso: 'F', compito: 'fai', dati: { a: 1 }, ...extra } });
const prepara = (lavori, { cfg = CFG, statico = {} } = {}) => eseguiCodice(PREPARA, { nodi: { Config: [{ json: cfg }], 'Da un altro flusso': lavori }, statico });
const daAD = (prep, body, statico) => eseguiCodice(COMPONI, { input: [{ json: { body } }], nodi: { 'Prepara il lavoro': [prep], [ASPETTA]: [{ json: {} }] }, statico });
const va = (...verso) => ({ main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) });
const http = (name, extra = {}) => ({ name, type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://api.anthropic.com/v1/messages', jsonBody: '={{ JSON.stringify($json.r) }}' }, ...extra });

// --- Il contatore -----------------------------------------------------------------------------

test('il contatore vede le chiamate nascoste (credenziale, maiuscole, altri fornitori, indirizzo a pezzi)', () => {
  const casi = [
    { name: 'a', type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://API.Anthropic.com/v1/messages' } },
    { name: 'b', type: 'n8n-nodes-base.httpRequest', parameters: { authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi' } },
    { name: 'c', type: 'n8n-nodes-base.httpRequest', parameters: {}, credentials: { anthropicApi: { id: 'x' } } },
    { name: 'd', type: '@n8n/n8n-nodes-langchain.lmChatAwsBedrock', parameters: { model: 'anthropic.claude-sonnet' } },
    { name: 'e', type: '@n8n/n8n-nodes-langchain.lmChatOpenRouter', parameters: { model: 'anthropic/claude-opus' } },
    { name: 'f', type: 'n8n-nodes-base.code', parameters: { jsCode: "const u = 'https://api.' + 'anthropic' + '.com/v1/messages';" } },
    { name: 'g', type: 'n8n-nodes-base.httpRequest', parameters: { url: '={{ $vars.CLAUDE_URL }}' } },
  ];
  for (const n of casi) assert.equal(aPagamento(n), true, n.name);
  assert.equal(aPagamento({ name: 'r', type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://api.anthropic.com/v1/claude_code/routines/trig_x/fire' } }), false);
});

test('il contatore non dice «zero» se qualche flusso raggiungibile non si è potuto guardare', () => {
  const sotto = (parameters) => ({ name: 's', type: 'n8n-nodes-base.executeWorkflow', parameters });
  const casi = [
    [sotto({ source: 'database', workflowId: { __rl: true, mode: 'id', value: 'manca' } })],
    [sotto({ source: 'database', workflowId: '={{ $json.quale }}' })],
    [sotto({ source: 'parameter', workflowJson: '{}' })],
    [sotto({ source: 'database', workflowId: { __rl: true, mode: 'url', value: 'https://n8n/workflow/1' } })],
    [{ name: 't', type: '@n8n/n8n-nodes-langchain.toolWorkflow', parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'manca' } } }],
  ];
  for (const nodes of casi) {
    const r = conta([{ id: '1', name: 'acceso', active: true, nodes }]);
    assert.equal(r.totale, 0);
    assert.equal(r.verificato, false, JSON.stringify(nodes[0].parameters));
  }
  const tool = conta([
    { id: '1', name: 'A', active: true, nodes: [{ name: 't', type: '@n8n/n8n-nodes-langchain.toolWorkflow', parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: '2' } } }] },
    { id: '2', name: 'B', active: false, nodes: [http('paga')] },
  ]);
  assert.equal(tool.totale, 1, 'anche i sotto-flussi usati come strumento si seguono');
  assert.equal(conta([{ id: '1', name: 'A', active: true, nodes: [] }]).verificato, true);
  const se = conta([{ id: '1', name: 'A', active: true, nodes: [sotto({ source: 'database', workflowId: { __rl: true, mode: 'id', value: '={{ $workflow.id }}' } })] }]);
  assert.equal(se.verificato, true, 'un flusso che richiama sé stesso si sa seguire');
});

// --- Il sotto-flusso --------------------------------------------------------------------------

test('la memoria non tiene risposte incomplete, vuote o di prova', async () => {
  let statico = {};
  const [due] = await prepara([lavoro({ dati: 1 }), lavoro({ dati: 2 })], { statico });
  await daAD(due, { ok: true, risultato: { risultati: [{ indice: 0, risultato: 'uno' }] } }, statico);
  assert.equal((await prepara([lavoro({ dati: 1 }), lavoro({ dati: 2 })], { statico }))[0].json.azione, 'parti', 'una risposta parziale non si ridà');
  statico = {};
  const [uno] = await prepara([lavoro()], { statico });
  await daAD(uno, { ok: true }, statico);
  assert.equal((await prepara([lavoro()], { statico }))[0].json.azione, 'parti', 'una risposta vuota non si ridà');
  statico = {};
  const [prova] = await prepara([lavoro()], { cfg: { ...CFG, MODALITA: 'prova' }, statico });
  await daAD(prova, { ok: true, risultato: 'FINTA' }, statico);
  assert.equal((await prepara([lavoro()], { statico }))[0].json.azione, 'parti', 'una risposta data a mano in prova non torna in vero');
});

test('una risposta ostile non fa cadere il sotto-flusso', async () => {
  const [prep] = await prepara([lavoro()]);
  const [a] = await daAD(prep, { ok: false, errore: { toString: null } });
  assert.equal(a.json.ok, false);
  const [b] = await daAD(prep, { ok: true, risultato: 'x', avvisi: [{ toString: null }, 'ciao'] });
  assert.equal(b.json.ok, true);
  assert.ok(b.json.avvisi.every((x) => typeof x === 'string'));
});

test('tetti a zero fermano tutto; lavori di flussi diversi o troppo pesanti in byte non partono', async () => {
  const [zero] = await prepara([lavoro()], { cfg: { ...CFG, TETTO_GIORNO: 0 } });
  assert.equal(zero.json.azione, 'errore');
  const [misti] = await prepara([lavoro({ flusso: 'A' }), lavoro({ flusso: 'B' })]);
  assert.match(misti.json.errore, /flussi diversi/);
  const [pesante] = await prepara([lavoro({ dati: 'é'.repeat(40000) })]);
  assert.match(pesante.json.errore, /troppo grande/, '40.000 caratteri ma 80.000 byte');
  const [strano] = await prepara([lavoro({ dati: { n: 10n } })]);
  assert.equal(strano.json.azione, 'errore');
});

// --- Il collegamento --------------------------------------------------------------------------

const flusso = (extraNodi = [], conn = {}) => ({ id: 'f', name: 'F', active: true,
  nodes: [{ name: 'P', type: 'n8n-nodes-base.code', parameters: {} }, http('C'), { name: 'L', type: 'n8n-nodes-base.code', parameters: { jsCode: "const r = $('C').first().json; const s = $(\"C\").all();" } }, ...extraNodi],
  connections: { P: va('C'), C: va('L'), ...conn } });
const N = [{ nodo: 'C', cosa: 'x', forma: 'corpo' }];

test('chi citava il nodo tolto ora cita «Dall\'AD»', async () => {
  const { flusso: w } = collega(flusso([{ name: 'S', type: 'n8n-nodes-base.set', parameters: { v: "={{ $('C').item.json.content[0].text }}" } }]), { nodi: N, chiediId: 'id' });
  const testo = JSON.stringify(w.nodes.map((n) => n.parameters));
  assert.ok(!/\$\((['"])C\1\)/.test(testo.replace(/\\"/g, '"')), 'nessuno cita più «C»');
  const l = w.nodes.find((n) => n.name === 'L').parameters.jsCode;
  assert.equal(l, 'const r = $("Dall\'AD: x").first().json; const s = $("Dall\'AD: x").all();');
  // Il codice riscritto si esegue: cita un nodo che c'è.
  await eseguiCodice(`${l}; return [];`, { nodi: { "Dall'AD: x": [{ json: {} }] } });
});

test('il collegamento si ferma su nodi disattivati, con due uscite, o con nomi doppi', () => {
  assert.throws(() => collega({ ...flusso(), nodes: flusso().nodes.map((n) => (n.name === 'C' ? { ...n, disabled: true } : n)) }, { nodi: N, chiediId: 'id' }), /disattivato/);
  assert.throws(() => collega(flusso([{ name: 'K', type: 'n8n-nodes-base.code', parameters: {} }], { C: va('L', 'K') }), { nodi: N, chiediId: 'id' }), /più di un'uscita/);
  const w = flusso([http('D')], { D: va('L') });
  w.connections.P = { main: [[{ node: 'C', type: 'main', index: 0 }, { node: 'D', type: 'main', index: 0 }]] };
  assert.throws(() => collega(w, { nodi: [N[0], { nodo: 'D', cosa: 'x', forma: 'corpo' }], chiediId: 'id' }), /stesso «cosa»/);
});

test('espressioni dentro una stringa JSON non si trasformano in testo fisso; i $ nel corpo non rompono il codice', async () => {
  assert.throws(() => espressione('={ "content": "Analizza: {{ JSON.stringify($json.x) }}" }'), /dentro una stringa/);
  const corpo = '={ "messages": [{ "role": "user", "content": {{ JSON.stringify($json.prezzo + " $\' $& $$") }} }] }';
  const { flusso: w } = collega({ ...flusso(), nodes: flusso().nodes.map((n) => (n.name === 'C' ? { ...n, parameters: { ...n.parameters, jsonBody: corpo } } : n)) }, { nodi: N, chiediId: 'id' });
  const per = w.nodes.find((n) => n.name === "Per l'AD: x").parameters.jsCode;
  const [l] = await eseguiCodice(per, { input: [{ json: { prezzo: '3 €' } }] });
  assert.equal(l.json.dati.messaggio, "3 € $' $& $$");
});

// --- Il 99 ------------------------------------------------------------------------------------

test('il 99 tiene le altre uscite di «Leggi errore» e si ferma se un nodo cita quelli che toglie', () => {
  const nodo = (name, parameters = {}) => ({ name, type: 'n8n-nodes-base.code', parameters });
  const base = () => ({ name: '99', nodes: [nodo('Config', { assignments: { assignments: [{ name: 'SPIEGA_ERRORI_AI', value: 'si' }] } }), nodo('Leggi errore'),
    nodo('Spiegazione AI accesa?'), nodo('Prepara spiegazione AI'), http("Spiega l'errore con Claude"), nodo('Leggi spiegazione AI'), nodo('Scrivi nel foglio')],
  connections: { 'Leggi errore': { main: [[{ node: 'Spiegazione AI accesa?', type: 'main', index: 0 }, { node: 'Scrivi nel foglio', type: 'main', index: 0 }]] },
    'Spiegazione AI accesa?': va('Prepara spiegazione AI', 'Leggi spiegazione AI') } });
  const { flusso: w } = togli(base());
  assert.deepEqual(w.connections['Leggi errore'].main[0].map((c) => c.node).sort(), ['Leggi spiegazione AI', 'Scrivi nel foglio']);
  const citante = base();
  citante.nodes.find((n) => n.name === 'Leggi spiegazione AI').parameters.jsCode = "const r = $(\"Spiega l'errore con Claude\").first();";
  assert.throws(() => togli(citante), /cita/);
});
