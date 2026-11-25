// Le prove del 24 · Radar del web: le fonti di oggi, l'estrazione dei titoli, solo i nuovi, le fonti
// non lette, il lavoro per l’AD e il messaggio. Pagine finte, nessuna rete.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eseguiCodice } from './esegui-codice.mjs';
import { costruisci, controlla, FONTI_24 } from '../24-radar-web/costruisci.mjs';

const leggi = (n) => readFileSync(new URL(`../24-radar-web/codice/${n}`, import.meta.url), 'utf8');
const ESTRAI = leggi('estrai-titoli.js');
const PREPARA = leggi('prepara-lavoro.js');
const COMPONI = leggi('componi.js');
const fonti = [{ id: 'a', nome: 'Libertà', tipo: 'news-locale', cosa_cercare: 'botteghe' }, { id: 'b', nome: 'Comune', tipo: 'istituzionale', cosa_cercare: 'bandi' }];
const pagina = (titoli) => ({ json: { statusCode: 200, body: `<html><script>var a="<a>Titolo finto dentro uno script da non prendere</a>"</script><nav><a>Menu di navigazione principale del sito</a></nav>${titoli.map((t) => `<h3><a href="/x">${t}</a></h3>`).join('')}<a>Accetta i cookie e la privacy policy</a></html>` } });

test('i titoli: niente script, menu, cookie; le entità si decodificano', async () => {
  const statico = {};
  const [{ json: r }] = await eseguiCodice(ESTRAI, { nodi: { 'Le fonti di oggi': fonti.map((json) => ({ json })), 'Scarica le fonti': [pagina(['Apre in via Calzolai una nuova bottega d&#039;arte']), pagina(['Bando del Comune per i negozi del centro storico'])] }, statico });
  assert.equal(r.lette, 2);
  assert.equal(r.fonti[0].titoli_trovati, 1);
  assert.deepEqual(statico.visti.a, ['apre in via calzolai una nuova bottega d’arte']);
  assert.equal(r.nuovi_totali, 0, 'il primo giro fa da base');
});

test('al giro dopo arrivano solo i titoli nuovi; una fonte giù è «non letta», non «niente di nuovo»', async () => {
  const statico = {};
  await eseguiCodice(ESTRAI, { nodi: { 'Le fonti di oggi': fonti.map((json) => ({ json })), 'Scarica le fonti': [pagina(['Titolo vecchio di ieri sulle botteghe']), pagina(['Bando del Comune per i negozi del centro'])] }, statico });
  const [{ json: r }] = await eseguiCodice(ESTRAI, { nodi: { 'Le fonti di oggi': fonti.map((json) => ({ json })), 'Scarica le fonti': [pagina(['Titolo vecchio di ieri sulle botteghe', 'Chiude dopo cinquant’anni la drogheria di piazza Cavalli']), { json: { statusCode: 403, body: '' } }] }, statico });
  assert.deepEqual(r.fonti[0].nuovi, ['Chiude dopo cinquant’anni la drogheria di piazza Cavalli']);
  assert.deepEqual(r.non_lette, ['Comune: risposta 403']);
});

const estratti = { fonti: [{ id: 'a', nome: 'Libertà', tipo: 'news-locale', cosa_cercare: 'botteghe', letta: true, nuovi: ['Chiude la drogheria di piazza Cavalli dopo 50 anni'] }, { id: 'b', nome: 'Comune', letta: false, motivo: 'risposta 403' }], lette: 1, non_lette: ['Comune: risposta 403'], nuovi_totali: 1 };

test('il lavoro per l’AD: solo fonti con titoli nuovi; in prova o senza novità l’AD non si accende', async () => {
  const [{ json: l }] = await eseguiCodice(PREPARA, { nodi: { Config: [{ json: { MODALITA: 'vero' } }], 'Estrai i titoli': [{ json: estratti }] } });
  assert.equal(l.flusso, '24 · Radar del web');
  assert.equal(l.dati.fonti.length, 1);
  assert.equal(l.non_mandare, undefined);
  const [{ json: p }] = await eseguiCodice(PREPARA, { nodi: { Config: [{ json: { MODALITA: 'prova' } }], 'Estrai i titoli': [{ json: estratti }] } });
  assert.match(p.non_mandare, /prova/);
  const [{ json: z }] = await eseguiCodice(PREPARA, { nodi: { Config: [{ json: { MODALITA: 'vero' } }], 'Estrai i titoli': [{ json: { ...estratti, nuovi_totali: 0 } }] } });
  assert.match(z.non_mandare, /nessun titolo nuovo/);
});

test('il lavoro sta sotto il tetto di 64 KB anche con tanti titoli', async () => {
  const tanti = { ...estratti, fonti: Array.from({ length: 17 }, (_, k) => ({ id: `f${k}`, nome: `Fonte ${k}`, letta: true, nuovi: Array.from({ length: 15 }, (_, j) => `${'Un titolo lungo e pieno di parole '.repeat(5)} ${k}-${j}`) })) };
  const [{ json: l }] = await eseguiCodice(PREPARA, { nodi: { Config: [{ json: { MODALITA: 'vero' } }], 'Estrai i titoli': [{ json: tanti }] } });
  assert.ok(JSON.stringify(l).length <= 50000);
});

test('il messaggio: testo dell’AD se c’è, altrimenti i titoli; sempre le fonti non lette', async () => {
  const [{ json: l }] = await eseguiCodice(PREPARA, { nodi: { Config: [{ json: { MODALITA: 'vero' } }], 'Estrai i titoli': [{ json: estratti }] } });
  const base = { Config: [{ json: { MODALITA: 'vero' } }], 'Estrai i titoli': [{ json: estratti }], 'Prepara il lavoro': [{ json: l }] };
  const [{ json: con }] = await eseguiCodice(COMPONI, { nodi: { ...base, 'Chiedi all’AD cosa conta': [{ json: { ok: true, risultato: { testo: 'La drogheria chiude: sentiamo se vuole vendere online.' } } }] } });
  assert.match(con.messaggio, /sentiamo se vuole vendere online/);
  assert.match(con.messaggio, /Non lette<\/b>\n• Comune: risposta 403/);
  const [{ json: senza }] = await eseguiCodice(COMPONI, { nodi: { ...base, 'Chiedi all’AD cosa conta': [{ json: { ok: false, errore: "l'AD non ha risposto in tempo" } }] } });
  assert.match(senza.messaggio, /Chiude la drogheria/);
  assert.equal(senza.manda, true);
});

test('il flusso 24: alle 6:30, le fonti del radar senza Google, «Estrai i titoli» una volta sola, errori al 99', () => {
  const w = costruisci({ telegram: { id: 't', name: 'T' }, chatId: '1', errorWorkflow: 'e', chiedi: 'c' });
  assert.deepEqual(controlla(w), []);
  assert.equal(FONTI_24.length, 17);
  assert.ok(FONTI_24.every((f) => !/google\./.test(f.url)));
  assert.equal(w.nodes.find((n) => n.name === 'Estrai i titoli').executeOnce, true);
});
