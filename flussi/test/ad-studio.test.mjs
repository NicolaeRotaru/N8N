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

// I tasti di Telegram (Nicola, 27/11/2026 ~03:00: «non mi piace che devo sempre aprire questa pagina per confermare»).
// Prima il tasto era un link di sendAndWait: «Apri link», poi il browser. Ora il tocco resta dentro Telegram.
const tastiFlusso = genera('consegna.mjs', 'tasti', '--json', '--foglio', 'FOGLIO-DI-PROVA', '--chat', '123');
const DA_NICOLA = (dato) => [{ json: { callback_query: { id: 'q1', data: dato, from: { id: 123 }, message: { message_id: 77, chat: { id: 123 } } } } }];
const tocco = (dato, input = DA_NICOLA(dato)) => eseguiCodice(codice(tastiFlusso, 'Leggi il tocco'), { input });
const decidi = (t, righe) => eseguiCodice(codice(tastiFlusso, 'Decidi'), { input: righe.map((r) => ({ json: r })), nodi: { 'Leggi il tocco': [{ json: t }] } });
const FUTURA = { id: 'cli-20991206-1830', tipo: 'post', data_ora: '2099-12-06 18:30', stato: 'da_approvare', note: 'n [lotto cli-1127-0100]' };

test('il tasto non apre il browser: niente sendAndWait, i tasti portano callback_data con l\'id della riga', () => {
  const testo = JSON.stringify(proponi);
  assert.equal(testo.includes('sendAndWait'), false, 'sendAndWait mette tasti-link verso /webhook-waiting');
  const chiedi = nodo(proponi, 'Chiedi Approva o Rifiuta').parameters;
  assert.equal(chiedi.operation, 'sendMessage');
  assert.equal(chiedi.replyMarkup, 'inlineKeyboard');
  const bottoni = chiedi.inlineKeyboard.rows[0].row.buttons;
  assert.deepEqual(bottoni.map((b) => b.text), ['Approva', 'Rifiuta']);
  assert.match(bottoni[0].additionalFields.callback_data, /'ok:' \+ .*riga\.id/);
  assert.match(bottoni[1].additionalFields.callback_data, /'no:' \+ .*riga\.id/);
  assert.equal(JSON.stringify(chiedi.inlineKeyboard).includes('"url"'), false);
  assert.equal(chiedi.additionalFields.reply_to_message_id, '={{ $json.result.message_id }}', 'la domanda sta attaccata all\'anteprima');
});

test('la proposta segna il gruppo nelle note una volta sola, e rifiuta gruppi e id che non stanno nel tasto', async () => {
  const c = codice(proponi, 'Controlla la proposta');
  const conLotto = (riga, lotto) => [{ json: { body: { riga, anteprima: { file_id: 'f1' }, lotto } } }];
  const a = await eseguiCodice(c, { input: conLotto({ ...RIGA, note: 'proposta' }, 'cli-1127-0100') });
  assert.equal(a[0].json.riga.note, 'proposta [lotto cli-1127-0100]');
  const b = await eseguiCodice(c, { input: conLotto({ ...RIGA, note: 'proposta [lotto cli-1127-0100]' }, 'cli-1127-0100') });
  assert.equal(b[0].json.riga.note, 'proposta [lotto cli-1127-0100]', 'riproporre la stessa riga non raddoppia il segno');
  await assert.rejects(eseguiCodice(c, { input: conLotto(RIGA, 'Lotto Con Spazi') }), /lotto/);
  await assert.rejects(eseguiCodice(c, { input: corpo({ ...RIGA, id: 'x'.repeat(62) }) }), /troppo lungo/);
  const r = await eseguiCodice(c, { input: [{ json: { body: { riepilogo: { lotto: 'cli-1127-0100', nome: 'Tropico' } } } }] });
  assert.deepEqual(r[0].json, { modo: 'riepilogo', lotto: 'cli-1127-0100', nome: 'Tropico' });
});

test('il riepilogo elenca solo il gruppo ancora da approvare, in ordine, e col gruppo vuoto non manda niente', async () => {
  const c = codice(proponi, 'Prepara il riepilogo');
  const prova = (righe) => eseguiCodice(c, { input: righe.map((r) => ({ json: r })), nodi: { 'Controlla la proposta': [{ json: { modo: 'riepilogo', lotto: 'cli-1127-0100', nome: 'Tropico' } }] } });
  const out = await prova([
    { ...FUTURA, id: 'b', data_ora: '2099-12-07 12:15', tipo: 'storia' },
    { ...FUTURA, id: 'a' },
    { ...FUTURA, id: 'c', stato: 'approvato' },
    { ...FUTURA, id: 'd', note: 'altro gruppo [lotto cli-1126-0900]' }]);
  assert.equal(out[0].json.quanti, 2);
  assert.equal(out[0].json.tasto, 'Approva tutti e 2');
  assert.match(out[0].json.testo, /^Tropico: 2 contenuti ancora da approvare\.\n\n- dom 6\/12 alle 18:30, post\n- lun 7\/12 alle 12:15, storia/);
  assert.equal((await prova([{}]))[0].json.manda, false, 'foglio senza righe del gruppo: nessun messaggio');
});

test('il tocco conta solo se arriva dalla chat di Nicola e solo coi tasti nostri', async () => {
  assert.deepEqual((await tocco('ok:cli-20991206-1830'))[0].json, { query_id: 'q1', chat_id: '123', message_id: '77', azione: 'approva', id: 'cli-20991206-1830' });
  assert.equal((await tocco('no:cli-20991206-1830'))[0].json.azione, 'rifiuta');
  assert.equal((await tocco('tutti:cli-1127-0100'))[0].json.lotto, 'cli-1127-0100');
  assert.equal((await tocco('cancella:tutto'))[0].json.azione, 'ignora');
  assert.equal((await tocco('tutti:../x'))[0].json.azione, 'ignora');
  const estraneo = [{ json: { callback_query: { id: 'q2', data: 'ok:cli-20991206-1830', from: { id: 999 }, message: { message_id: 5, chat: { id: 999 } } } } }];
  assert.equal((await tocco('', estraneo))[0].json.azione, 'ignora');
});

test('la decisione cambia la riga solo se è ancora da approvare, e la domanda diventa lo stato', async () => {
  const t = (azione, extra = {}) => ({ query_id: 'q1', chat_id: '123', message_id: '77', azione, id: FUTURA.id, ...extra });
  const ok = (await decidi(t('approva'), [FUTURA]))[0].json;
  assert.deepEqual(ok.righe.map((r) => [r.id, r.stato]), [[FUTURA.id, 'approvato']]);
  assert.match(ok.righe[0].note, /^n \[lotto cli-1127-0100\] \| approvato su Telegram \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(ok.testo, 'Approvato: esce dom 6/12 alle 18:30.');
  const no = (await decidi(t('rifiuta'), [FUTURA]))[0].json;
  assert.equal(no.righe[0].stato, 'bozza');
  const gia = (await decidi(t('rifiuta'), [{ ...FUTURA, stato: 'approvato' }]))[0].json;
  assert.deepEqual(gia.righe, [], 'se il foglio è già deciso, vince il foglio');
  assert.equal(gia.testo, 'Già approvato: esce dom 6/12 alle 18:30.');
  const sparita = (await decidi(t('approva'), [{ ...FUTURA, id: 'altra' }]))[0].json;
  assert.deepEqual(sparita.righe, []);
  assert.match(sparita.testo, /Non trovo più/);
  const tardi = (await decidi(t('approva'), [{ ...FUTURA, data_ora: '2020-01-01 10:00' }]))[0].json;
  assert.match(tardi.testo, /già passata/, 'approvare dopo l\'ora non promette un\'uscita che forse non c\'è');
  const estraneo = (await decidi({ ...t('ignora'), motivo: 'Questo tasto non è per te.' }, [FUTURA]))[0].json;
  assert.deepEqual(estraneo.righe, []);
  assert.equal(estraneo.testo, '', 'un tocco estraneo non cambia nemmeno il messaggio');
});

test('«Approva tutti» approva solo il suo gruppo e solo quello ancora da approvare', async () => {
  const righe = [
    FUTURA,
    { ...FUTURA, id: 'cli-20991207-1215', data_ora: '2099-12-07 12:15' },
    { ...FUTURA, id: 'gia-rifiutata', stato: 'bozza' },
    { ...FUTURA, id: 'altro-gruppo', note: '[lotto cli-1126-0900]' }];
  const out = (await decidi({ query_id: 'q1', chat_id: '123', message_id: '78', azione: 'tutti', lotto: 'cli-1127-0100' }, righe))[0].json;
  assert.deepEqual(out.righe.map((r) => r.id), ['cli-20991206-1830', 'cli-20991207-1215']);
  assert.ok(out.righe.every((r) => r.stato === 'approvato'));
  assert.match(out.testo, /^Approvati 2 contenuti\./);
  const vuoto = (await decidi({ azione: 'tutti', lotto: 'cli-1125-0000' }, righe))[0].json;
  assert.deepEqual(vuoto.righe, []);
});

test('il flusso dei tasti ascolta solo i tocchi, scrive solo per id e non cancella niente', () => {
  const t = nodo(tastiFlusso, 'Tocco su Telegram');
  assert.deepEqual(t.parameters.updates, ['callback_query']);
  const fogli = tastiFlusso.nodes.filter((n) => n.type === 'n8n-nodes-base.googleSheets');
  for (const f of fogli) assert.ok(['read', 'update'].includes(f.parameters.operation), f.name);
  const segna = nodo(tastiFlusso, 'Segna nel Calendario').parameters.columns;
  assert.deepEqual(segna.matchingColumns, ['id']);
  assert.deepEqual(Object.keys(segna.value).sort(), ['id', 'note', 'stato']);
  assert.equal(JSON.stringify(tastiFlusso).includes('deleteMessage'), false);
  assert.equal(nodo(tastiFlusso, 'Cambia il messaggio').parameters.replyMarkup, 'none', 'dopo il tocco i tasti spariscono');
  assert.ok(JSON.stringify(tastiFlusso).includes('FOGLIO-DI-PROVA'));
  assert.throws(() => execFileSync('node', ['consegna.mjs', 'tasti', '--json', '--foglio', 'F', '--chat', 'abc'], { cwd: cartella, stdio: 'pipe' }));
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

test('i flussi nascono spenti e senza IA (i tasti si accendono a mano, dopo)', () => {
  for (const f of [proponi, carica, leggi, tastiFlusso]) {
    assert.equal(f.active, undefined);
    assert.equal(JSON.stringify(f).includes('anthropic'), false, f.name);
  }
});
