// le prove del 97 · Scrivi nell'argomento dell'attività: dove va ogni messaggio (chat privata, argomento
// trovato, argomento appena aperto, officina che non risponde) e il flusso costruito. Dati finti.
// Si lancia con: node --test "flussi/test/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eseguiCodice } from './esegui-codice.mjs';
import { costruisci, controlla, NOME_97 } from '../97-argomento-attivita/costruisci.mjs';
import { inSdk } from '../in-sdk.mjs';

const leggi = (nome) => readFileSync(new URL(`../97-argomento-attivita/codice/${nome}`, import.meta.url), 'utf8');
const RACCOGLI = leggi('raccogli.js');
const MESSAGGI = leggi('messaggi.js');
const ID = '0de1905e-7000-4000-8000-000000000001';
const GRUPPO = '-1001234567890';
const config = (extra = {}) => [{ json: { TELEGRAM_CHAT_ID: '111', CHAT_ATTIVITA: GRUPPO, OFFICINA_URL: 'http://officina.internal:8080', ...extra } }];
const voci = (n = 2, nome = 'Ora del Gusto') => Array.from({ length: n }, (_, i) => ({ json: { id: ID, nome, messaggio: `messaggio ${i + 1}` } }));
const raccogli = async (cfg = config(), v = voci()) => (await eseguiCodice(RACCOGLI, { nodi: { Config: cfg, 'Da un altro flusso': v } }))[0].json;

test('raccoglie i messaggi della stessa attività e capisce se c è il gruppo', async () => {
  const r = await raccogli();
  assert.equal(r.id, ID);
  assert.equal(r.nome, 'Ora del Gusto');
  assert.deepEqual(r.messaggi, ['messaggio 1', 'messaggio 2']);
  assert.equal(r.conGruppo, true);
  assert.equal((await raccogli(config({ CHAT_ATTIVITA: '' }))).conGruppo, false, 'senza gruppo: chat privata, come prima');
  assert.equal((await raccogli(config({ CHAT_ATTIVITA: '-12345' }))).conGruppo, false, 'un gruppo piccolo non ha argomenti');
  assert.equal((await raccogli(config(), [{ json: { id: 'abc', nome: 'X', messaggio: 'm' } }])).conGruppo, false, 'senza un id vero niente argomento');
  const lungo = await raccogli(config(), voci(1, `  Ora   ${'è'.repeat(200)}  `));
  assert.equal(Array.from(lungo.nome).length, 128);
  assert.equal((await raccogli(config(), voci(1, ''))).nome, 'Attività senza nome');
});

const messaggi = async (r, altri = {}) => (await eseguiCodice(MESSAGGI, { nodi: { 'Raccogli i messaggi': [{ json: r }], ...altri } })).map((x) => x.json);

test('senza gruppo i messaggi vanno nella chat privata, uguali a prima', async () => {
  const m = await messaggi(await raccogli(config({ CHAT_ATTIVITA: '' })));
  assert.deepEqual(m, [{ chat: '111', thread: 0, messaggio: 'messaggio 1' }, { chat: '111', thread: 0, messaggio: 'messaggio 2' }]);
});

test("l'argomento già segnato nella tabella si usa, senza aprirne un altro", async () => {
  const m = await messaggi(await raccogli(), { "Cerca l'argomento": [{ json: { id_attivita: ID, chat_id: GRUPPO, thread_id: 7 } }] });
  assert.deepEqual(m.map((x) => [x.chat, x.thread, x.messaggio]), [[GRUPPO, 7, 'messaggio 1'], [GRUPPO, 7, 'messaggio 2']]);
});

test("un negozio nuovo prende l'argomento appena aperto dall'officina", async () => {
  const m = await messaggi(await raccogli(), { "Cerca l'argomento": [{ json: {} }], "Apri l'argomento": [{ json: { statusCode: 200, body: { message_thread_id: 42, nome: 'Ora del Gusto' } } }] });
  assert.deepEqual(m.map((x) => x.thread), [42, 42]);
  assert.ok(m.every((x) => x.chat === GRUPPO && !x.messaggio.includes('🏪')));
});

test("se l'officina non apre l'argomento, i messaggi arrivano lo stesso nel gruppo col nome in testa e il perché", async () => {
  const r = await raccogli(config(), voci(2, 'Bar <Roma> & Co'));
  const rifiuto = await messaggi(r, { "Cerca l'argomento": [{ json: {} }], "Apri l'argomento": [{ json: { statusCode: 502, body: { errore: 'telegram_rifiutato', messaggio: "Telegram non ha aperto l'argomento: not enough rights" } } }] });
  assert.equal(rifiuto.length, 3, "l'avviso più i due messaggi");
  assert.match(rifiuto[0].messaggio, /Non sono riuscito ad aprire l'argomento di <b>Bar &lt;Roma&gt; &amp; Co<\/b>: Telegram non ha aperto l'argomento: not enough rights/);
  assert.ok(rifiuto.every((x) => x.chat === GRUPPO && x.thread === 0));
  assert.ok(rifiuto.slice(1).every((x) => x.messaggio.startsWith('🏪 <b>Bar &lt;Roma&gt; &amp; Co</b>\n')));
  const giu = await messaggi(r, { "Cerca l'argomento": [{ json: {} }], "Apri l'argomento": [{ json: { error: { message: 'ECONNREFUSED' } } }] });
  assert.match(giu[0].messaggio, /l'officina non ha risposto/);
});

const PEZZI = { telegram: { id: 'tg', name: 'Telegram - Bot agenzia' }, chatId: '111', officina: 'of', tabella: 'tab' };

test('il flusso costruito è a posto, e i controlli fermano le chat scritte a mano e gli indirizzi sbagliati', () => {
  const w = costruisci(PEZZI);
  assert.equal(w.name, NOME_97);
  assert.deepEqual(controlla(w), []);
  assert.ok(controlla(costruisci()).some((p) => /credenziale/.test(p)));
  const sm = (fn) => { const x = costruisci(PEZZI); fn(x); return controlla(x); };
  assert.ok(sm((x) => { x.nodes.find((n) => n.name === 'Manda').parameters.chatId = '999'; }).some((p) => /chat scritta a mano/.test(p)));
  assert.ok(sm((x) => { x.nodes.find((n) => n.name === "Apri l'argomento").parameters.url = 'https://api.telegram.org/bot/createForumTopic'; }).some((p) => /non è l'officina/.test(p)));
  assert.ok(sm((x) => { x.nodes.find((n) => n.name === 'Messaggi da mandare').parameters.jsCode += "\n$('Nodo che non c è');"; }).some((p) => /non esiste/.test(p)));
  const c = w.connections;
  const verso = (da, uscita = 0) => c[da].main[uscita][0].node;
  assert.equal(verso("C'è il gruppo?"), "Cerca l'argomento");
  assert.equal(verso("C'è il gruppo?", 1), 'Messaggi da mandare');
  assert.equal(verso('Trovato?'), 'Messaggi da mandare');
  assert.equal(verso('Trovato?', 1), "Apri l'argomento");
  assert.equal(verso('Aperto?'), "Segna l'argomento");
  assert.equal(verso('Aperto?', 1), 'Messaggi da mandare');
  assert.equal(verso("Segna l'argomento"), 'Messaggi da mandare');
  assert.equal(verso("Nell'argomento?"), "Manda nell'argomento");
  assert.equal(verso("Nell'argomento?", 1), 'Manda');
  const cerca = w.nodes.find((n) => n.name === "Cerca l'argomento");
  assert.equal(cerca.alwaysOutputData, true, 'un negozio senza argomento deve andare avanti, non fermarsi');
  assert.deepEqual(cerca.parameters.filters.conditions.map((x) => x.keyName), ['id_attivita', 'chat_id']);
  assert.equal(cerca.parameters.matchType, 'allConditions');
  assert.equal(w.nodes.find((n) => n.name === "Manda nell'argomento").parameters.additionalFields.message_thread_id, '={{ $json.thread }}');
  assert.equal(w.nodes.find((n) => n.name === 'Manda').parameters.additionalFields.message_thread_id, undefined);
  assert.deepEqual(Object.keys(w.nodes.find((n) => n.name === "Segna l'argomento").parameters.columns.value).sort(), ['chat_id', 'id_attivita', 'nome', 'thread_id']);
  const sdk = inSdk(w);
  assert.equal((sdk.match(/= (node|trigger)\(/g) || []).length, w.nodes.length - 1);
  assert.equal((sdk.match(/\.to\(/g) || []).length, Object.values(c).flatMap((u) => u.main.flat()).length);
});
