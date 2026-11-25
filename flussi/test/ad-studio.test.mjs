// Le prove dei flussi ad-studio: quello che deve reggere perché una proposta dell'AD non esca mai da sola,
// non cancelli dati del piano del mese e non porti il token di Google fuori da Google.
// Si lancia con: node --test "flussi/test/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { eseguiCodice } from './esegui-codice.mjs';

const cartella = fileURLToPath(new URL('../ad-studio/', import.meta.url));
const genera = (...args) => JSON.parse(execFileSync('node', args, { cwd: cartella, encoding: 'utf8' }));
const proponi = genera('consegna.mjs', 'proponi', '--json', '--foglio', 'FOGLIO-DI-PROVA', '--chat', '123');
const carica = genera('consegna.mjs', 'carica', '--json');
const leggi = genera('leggi-materiale.mjs', '--json');
const nodo = (flusso, nome) => flusso.nodes.find((n) => n.name === nome);
const codice = (flusso, nome) => nodo(flusso, nome).parameters.jsCode;

const RIGA = { id: 'cliente-20261206-1830', cliente: 'cliente', tipo: 'post', data_ora: '2026-12-06 18:30', didascalia: 'Testo', media: 'https://drive.google.com/file/d/x/view' };
const corpo = (riga, anteprima = { file_id: 'f1', tipo: 'foto' }) => [{ json: { body: { riga, anteprima } } }];

test('la proposta nasce sempre da approvare, anche se chi chiama scrive «approvato»', async () => {
  const out = await eseguiCodice(codice(proponi, 'Controlla la proposta'), { input: corpo({ ...RIGA, stato: 'approvato' }) });
  assert.equal(out[0].json.riga.stato, 'da_approvare');
  assert.equal(out[0].json.riga.piattaforme, 'ig+fb');
});

test('una proposta incompleta si ferma prima di toccare il foglio', async () => {
  const c = codice(proponi, 'Controlla la proposta');
  await assert.rejects(eseguiCodice(c, { input: corpo({ ...RIGA, media: '' }) }), /media/);
  await assert.rejects(eseguiCodice(c, { input: corpo({ ...RIGA, tipo: 'reel' }) }), /copertina/);
  await assert.rejects(eseguiCodice(c, { input: corpo({ ...RIGA, data_ora: '6/12 18:30' }) }), /data_ora/);
  await assert.rejects(eseguiCodice(c, { input: corpo(RIGA, {}) }), /anteprima/);
});

test('la riga si scrive per id e il brief del piano del mese non si tocca', () => {
  const scrivi = nodo(proponi, 'Scrivi la riga nel Calendario').parameters;
  assert.equal(scrivi.operation, 'appendOrUpdate');
  assert.deepEqual(scrivi.columns.matchingColumns, ['id']);
  assert.equal('brief' in scrivi.columns.value, false);
  assert.equal(scrivi.columns.value.stato, '={{ $json.riga.stato ?? \'\' }}');
});

test('la decisione cambia la riga solo se è ancora da approvare', async () => {
  const c = codice(proponi, 'Decidi');
  const prova = (scelta, stato) => eseguiCodice(c, { input: [{ json: { stato, data_ora: '2026-12-06 18:30', note: 'n' } }],
    nodi: { 'Chiedi Approva o Rifiuta': [{ json: scelta }], 'Controlla la proposta': [{ json: { riga: RIGA } }] } });
  assert.equal((await prova({ data: { approved: true } }, 'da_approvare'))[0].json.stato, 'approvato');
  assert.equal((await prova({ data: { approved: false } }, 'da_approvare'))[0].json.stato, 'bozza');
  assert.equal((await prova({ data: { approved: true } }, 'bozza'))[0].json.cambia, false, 'se il foglio è cambiato, vince il foglio');
  assert.equal((await prova({}, 'da_approvare'))[0].json.cambia, false, 'senza risposta resta da approvare');
});

test('il flusso proponi non nasce senza foglio e chat, e nel repository non ci sono ID', () => {
  assert.throws(() => execFileSync('node', ['consegna.mjs', 'proponi', '--json'], { cwd: cartella, stdio: 'pipe' }));
  const testo = JSON.stringify(proponi);
  assert.ok(testo.includes('FOGLIO-DI-PROVA'));
});

test('il cestino tocca solo i file della cartella indicata', async () => {
  const c = codice(carica, 'Prepara');
  await assert.rejects(eseguiCodice(c, { input: [{ json: { body: { cestina: ['a'] } } }] }), /cartella/);
  const out = await eseguiCodice(c, { input: [{ json: { body: { cestina: ['a', 'b'], cartella: 'K' } } }] });
  assert.deepEqual(out.map((x) => x.json), [{ azione: 'cestina', id: 'a', cartella: 'K' }, { azione: 'cestina', id: 'b', cartella: 'K' }]);
  const controllo = nodo(carica, 'È nella cartella giusta?').parameters.conditions.conditions[0].leftValue;
  assert.match(controllo, /parents/);
  assert.match(nodo(carica, 'Sposta nel cestino').parameters.jsonBody, /"trashed": true/);
});

test('il nodo dei file nasce vuoto: un caricamento senza file si ferma', async () => {
  const c = codice(carica, 'Prepara');
  assert.ok(c.startsWith('const FILE = [];'));
  await assert.rejects(eseguiCodice(c, { input: [{ json: { body: { cartella: 'K' } } }] }), /non ci sono file/);
});

test('gli indirizzi web si scaricano senza la credenziale Google, e solo in https', async () => {
  assert.equal(nodo(leggi, "Scarica dall'indirizzo").credentials, undefined);
  assert.equal(nodo(leggi, "Scarica dall'indirizzo").parameters.authentication, undefined);
  await assert.rejects(eseguiCodice(codice(leggi, 'Cosa leggere'), { input: [{ json: { body: { url: ['http://esempio.it/x.png'] } } }] }), /https/);
});

test('i tre flussi nascono spenti e senza IA', () => {
  for (const f of [proponi, carica, leggi]) {
    assert.equal(f.active, undefined);
    assert.equal(JSON.stringify(f).includes('anthropic'), false, f.name);
  }
});
