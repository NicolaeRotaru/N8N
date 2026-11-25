// Le prove dello snellimento dei nodi Code col «blocco di aiuti comuni».
// Si lancia con: node --test flussi/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCodice } from './esegui-codice.mjs';
import { snellisciCodice, snellisciFlusso, dividiBlocco } from '../snellisci-aiuti.mjs';

const BLOCCO = `// ===== Aiuti comuni del workflow 99 =====
// (Questo blocco è uguale in più nodi Code: si modifica nel generatore, non a mano nel workflow.)
const MESI = ['gennaio', 'febbraio', 'marzo'];
const STATI = ['bozza', 'approvato'];

// Mette in maiuscolo la prima lettera.
function maiuscola(t) {
  return testo(t).charAt(0).toUpperCase() + testo(t).slice(1);
}

function testo(v) {
  return v === undefined || v === null ? '' : String(v);
}
function nomeMese(i) {
  return MESI[i] || '';
}
function nonUsata() {
  return 'mai';
}
// ===== fine aiuti comuni =====
`;

const nodo = (corpo) => BLOCCO + corpo;

test('tiene solo gli aiuti usati, anche quelli chiamati da un altro aiuto', () => {
  const r = snellisciCodice(nodo("return [{ json: { t: maiuscola($input.first().json.nome) } }];"));
  assert.equal(r.cambiato, true);
  assert.match(r.codice, /function maiuscola/);
  assert.match(r.codice, /function testo/, 'testo serve a maiuscola: deve restare');
  assert.doesNotMatch(r.codice, /function nonUsata/);
  assert.doesNotMatch(r.codice, /function nomeMese/);
  assert.doesNotMatch(r.codice, /const MESI/);
  assert.deepEqual(r.tolti.sort(), ['MESI', 'STATI', 'nomeMese', 'nonUsata'].sort());
});

test('una costante usata solo da un aiuto tenuto resta', () => {
  const r = snellisciCodice(nodo('return [{ json: { m: nomeMese(1) } }];'));
  assert.match(r.codice, /const MESI/);
  assert.doesNotMatch(r.codice, /const STATI/);
});

test('il nodo snellito dà lo stesso risultato del nodo intero', async () => {
  const corpo = "const n = $input.first().json; return [{ json: { t: maiuscola(n.nome), m: nomeMese(n.mese) } }];";
  const input = [{ json: { nome: 'pane quotidiano', mese: 2 } }];
  const prima = await eseguiCodice(nodo(corpo), { input });
  const dopo = await eseguiCodice(snellisciCodice(nodo(corpo)).codice, { input });
  assert.deepEqual(dopo, prima);
  assert.deepEqual(dopo, [{ json: { t: 'Pane quotidiano', m: 'marzo' } }]);
});

test('un nome che compare in una stringa conta come usato (meglio tenere che rompere)', () => {
  const r = snellisciCodice(nodo("return [{ json: { nota: 'vedi nonUsata' } }];"));
  assert.match(r.codice, /function nonUsata/);
});

test('con eval o accessi per nome il nodo resta com è', () => {
  const codice = nodo("return [{ json: { x: globalThis['testo'] } }];");
  const r = snellisciCodice(codice);
  assert.equal(r.cambiato, false);
  assert.equal(r.codice, codice);
});

test('più costanti in una riga sola non si tagliano mai', () => {
  const codice = nodo('return [];').replace("const STATI = ['bozza', 'approvato'];", "const STATI = ['bozza'], ALTRO = 1;");
  const r = snellisciCodice(codice);
  assert.match(r.codice, /ALTRO = 1/);
});

// I casi trovati dal collaudo del 25/11: prima rompevano il nodo, adesso devono lasciarlo funzionare.
const conBlocco = (dichiarazioni, corpo) => `// ===== Aiuti comuni del workflow 99 =====\n${dichiarazioni}\n// ===== fine aiuti comuni =====\n${corpo}`;
const casiDelCollaudo = [
  ['due costanti sulla stessa riga', 'const A = 1; const B = 2;', 'return [{ json: { b: B } }];'],
  ['due funzioni sulla stessa riga', 'function a() { return 1; } function b() { return 2; }', 'return [{ json: { b: b() } }];'],
  ['la seconda dichiarazione rientrata', 'const A = 1;\n  const B = 2;', 'return [{ json: { b: B } }];'],
  ['un commento con la virgola', 'const A = 1; /* , */ const B = 7;', 'return [{ json: { b: B } }];'],
  ['var dentro un if', 'var A = 1;\nif (1) { var B = 3 }', 'return [{ json: { b: B } }];'],
  ['una regex con la parentesi', 'const R = /\\(/, B = 2;', 'return [{ json: { b: B } }];'],
  ["una regex con l'apice", "const R = /'/, B = 2;", 'return [{ json: { b: B } }];'],
  ['un effetto nel valore', 'const CFG = { a: 1 };\nconst _r = (CFG.a = 2);', 'return [{ json: { a: CFG.a } }];'],
  ['un effetto da una chiamata', 'let N = 1;\nfunction setN() { N = 5; }\nconst _ = setN();', 'return [{ json: { n: N } }];'],
  ['un istruzione a colonna 0', 'const CFG = { a: 1 };\nconst X = 0;\nCFG.a = 2;', 'return [{ json: { a: CFG.a } }];'],
  ['un getter letto da una costante tolta', 'const S = {};\nconst B = { get x() { S.k = 1; return 1; } };\nconst C = B.x;', 'return [{ json: { s: S.k } }];'],
  ['un getter con effetti',"const S = { n: 0 };\nconst G = { get v() { S.n = 9; return 1; } }.v;", 'return [{ json: { n: S.n } }];'],
];
for (const [nome, dichiarazioni, corpo] of casiDelCollaudo) {
  test(`collaudo: ${nome} — il risultato non cambia`, async () => {
    const codice = conBlocco(dichiarazioni, corpo);
    const prima = await eseguiCodice(codice);
    const dopo = await eseguiCodice(snellisciCodice(codice).codice);
    assert.deepEqual(dopo, prima);
  });
}

test('un nodo senza blocco non si tocca', () => {
  const codice = 'return [{ json: { ok: true } }];';
  assert.deepEqual(snellisciCodice(codice), { codice, cambiato: false, motivo: 'senza blocco' });
});

test('se un pezzo del blocco non si compila da solo, il nodo resta com è', () => {
  const codice = nodo('return [];').replace('function nonUsata() {', 'function nonUsata() {\n  if (x) {');
  const r = snellisciCodice(codice);
  assert.equal(r.cambiato, false);
});

test('la divisione del blocco è fedele: rimessi insieme, i pezzi sono il blocco', () => {
  const blocco = BLOCCO.split('\n').slice(2, -2).join('\n') + '\n';
  assert.equal(dividiBlocco(blocco).map((p) => p.testo).join('\n'), blocco);
});

test('il flusso cambia solo nei nodi Code col blocco', () => {
  const flusso = { name: 'Prova', nodes: [
    { name: 'Con blocco', type: 'n8n-nodes-base.code', parameters: { jsCode: nodo('return [{ json: { t: testo(1) } }];') } },
    { name: 'Senza', type: 'n8n-nodes-base.code', parameters: { jsCode: 'return [];' } },
    { name: 'Telegram', type: 'n8n-nodes-base.telegram', parameters: { text: 'ciao' } },
  ], connections: { 'Con blocco': { main: [[{ node: 'Senza', type: 'main', index: 0 }]] } } };
  const { flusso: nuovo, prima, dopo, resoconto } = snellisciFlusso(flusso);
  assert.ok(dopo < prima);
  assert.deepEqual(nuovo.nodes[1], flusso.nodes[1]);
  assert.deepEqual(nuovo.nodes[2], flusso.nodes[2]);
  assert.deepEqual(nuovo.connections, flusso.connections);
  assert.deepEqual(resoconto, [{ nodo: 'Con blocco', motivo: 'snellito', tolti: 5 }]);
});
