// Prove della porta /telegram/argomento: l'officina apre l'argomento di un gruppo con la chiave del bot,
// che non esce mai. Telegram qui è finto: un piccolo server locale che registra le richieste.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { avviaServer, CHIAVE } from './aiuti.js';

const TOKEN = '1234567:chiave-segreta-del-bot';
const GRUPPO = '-1001234567890';
let finto;
let richieste = [];
let rispondi = () => ({ stato: 200, corpo: { ok: true, result: { message_thread_id: 42, name: 'Ora del Gusto' } } });

function avviaFinto() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let corpo = '';
      req.on('data', (d) => { corpo += d; });
      req.on('end', () => {
        richieste.push({ metodo: req.method, url: req.url, corpo: corpo ? JSON.parse(corpo) : null });
        const r = rispondi();
        res.writeHead(r.stato, { 'content-type': 'application/json' });
        res.end(JSON.stringify(r.corpo));
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

let s;
let senzaToken;
before(async () => {
  finto = await avviaFinto();
  const api = `http://127.0.0.1:${finto.address().port}`;
  s = await avviaServer({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_API_URL: api });
  senzaToken = await avviaServer({ TELEGRAM_API_URL: api });
});
after(async () => {
  await s?.ferma();
  await senzaToken?.ferma();
  finto?.close();
});

const chiedi = (server, corpo, chiave = CHIAVE) => fetch(`${server.base}/telegram/argomento`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(chiave ? { 'x-officina-chiave': chiave } : {}) },
  body: JSON.stringify(corpo),
}).then(async (r) => ({ stato: r.status, testo: await r.text() }));

test("apre l'argomento col nome del negozio e restituisce il suo numero", async () => {
  richieste = [];
  const r = await chiedi(s, { chat_id: GRUPPO, nome: '  Ora   del Gusto ' });
  assert.equal(r.stato, 200, r.testo);
  assert.deepEqual(JSON.parse(r.testo), { message_thread_id: 42, nome: 'Ora del Gusto' });
  assert.equal(richieste.length, 1);
  assert.equal(richieste[0].metodo, 'POST');
  assert.equal(richieste[0].url, `/bot${TOKEN}/createForumTopic`);
  assert.deepEqual(richieste[0].corpo, { chat_id: GRUPPO, name: 'Ora del Gusto' });
});

test('senza la chiave dell officina non apre niente', async () => {
  richieste = [];
  for (const chiave of [null, 'sbagliata']) {
    const r = await chiedi(s, { chat_id: GRUPPO, nome: 'X' }, chiave);
    assert.equal(r.stato, 401);
  }
  assert.equal(richieste.length, 0, 'Telegram non viene chiamato');
});

test('senza la chiave del bot la porta dice che è spenta', async () => {
  const r = await chiedi(senzaToken, { chat_id: GRUPPO, nome: 'X' });
  assert.equal(r.stato, 503);
  assert.equal(JSON.parse(r.testo).errore, 'telegram_non_configurato');
  const salute = await fetch(`${senzaToken.base}/salute`, { headers: { 'x-officina-chiave': CHIAVE } }).then((x) => x.json());
  assert.equal(salute.telegram, false);
  const conToken = await fetch(`${s.base}/salute`, { headers: { 'x-officina-chiave': CHIAVE } }).then((x) => x.json());
  assert.equal(conToken.telegram, true);
});

test('gruppi e nomi sbagliati si fermano prima di Telegram; il nome lungo si accorcia a 128', async () => {
  richieste = [];
  for (const chat of ['123', 'abc', '-123456789', `${GRUPPO}&x=1`, '']) {
    const r = await chiedi(s, { chat_id: chat, nome: 'X' });
    assert.equal(r.stato, 400, chat);
    assert.equal(JSON.parse(r.testo).errore, 'chat_non_valida');
  }
  const vuoto = await chiedi(s, { chat_id: GRUPPO, nome: '   ' });
  assert.equal(JSON.parse(vuoto.testo).errore, 'nome_mancante');
  assert.equal(richieste.length, 0);
  await chiedi(s, { chat_id: GRUPPO, nome: 'è'.repeat(200) });
  assert.equal(Array.from(richieste[0].corpo.name).length, 128);
});

test('se Telegram rifiuta o non risponde, lo dice senza mai mostrare la chiave del bot', async () => {
  rispondi = () => ({ stato: 400, corpo: { ok: false, error_code: 400, description: `Bad Request: not enough rights to create a topic (${TOKEN})` } });
  const rifiuto = await chiedi(s, { chat_id: GRUPPO, nome: 'X' });
  assert.equal(rifiuto.stato, 502);
  assert.equal(JSON.parse(rifiuto.testo).errore, 'telegram_rifiutato');
  assert.match(rifiuto.testo, /not enough rights/);
  assert.ok(!rifiuto.testo.includes(TOKEN), 'la chiave del bot non esce nella risposta');
  rispondi = () => ({ stato: 200, corpo: { ok: true, result: {} } });
  assert.equal(JSON.parse((await chiedi(s, { chat_id: GRUPPO, nome: 'X' })).testo).errore, 'telegram_rifiutato');
  const giu = await avviaServer({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_API_URL: 'http://127.0.0.1:1' });
  try {
    const r = await chiedi(giu, { chat_id: GRUPPO, nome: 'X' });
    assert.equal(r.stato, 502);
    assert.equal(JSON.parse(r.testo).errore, 'telegram_non_raggiungibile');
    assert.ok(!r.testo.includes(TOKEN));
    assert.ok(!giu.log().includes(TOKEN), 'la chiave del bot non finisce nei log');
  } finally {
    await giu.ferma();
  }
  assert.ok(!s.log().includes(TOKEN), 'la chiave del bot non finisce nei log');
  rispondi = () => ({ stato: 200, corpo: { ok: true, result: { message_thread_id: 42, name: 'Ora del Gusto' } } });
});
