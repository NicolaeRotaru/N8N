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
// Le prove D1-D4 vengono dal collaudo dello stesso giorno: ognuna era un modo per far uscire un contenuto non approvato.
const tastiFlusso = genera('consegna.mjs', 'tasti', '--json', '--foglio', 'FOGLIO-DI-PROVA', '--chat', '123');
const DA_NICOLA = (dato) => [{ json: { callback_query: { id: 'q1', data: dato, from: { id: 123 }, message: { message_id: 77, chat: { id: 123 } } } } }];
const tocco = (dato, input = DA_NICOLA(dato)) => eseguiCodice(codice(tastiFlusso, 'Leggi il tocco'), { input });
const decidi = (t, righe) => eseguiCodice(codice(tastiFlusso, 'Decidi'), { input: righe.map((r) => ({ json: r })), nodi: { 'Leggi il tocco': [{ json: t }] } });
const controlla = (body) => eseguiCodice(codice(proponi, 'Controlla la proposta'), { input: [{ json: { body } }] });
const FUTURA = { id: 'cli-20991206-1830', cliente: 'cli', tipo: 'post', didascalia: 'Testo', data_ora: '2099-12-06 18:30', media: 'https://drive.google.com/file/d/x/view', stato: 'da_approvare', note: 'n [lotto cli-1127-0100]' };
const versioneDi = async (riga) => (await controlla({ riga, anteprima: { file_id: 'f1' } }))[0].json.versione;
const collegati = (flusso, da) => (flusso.connections[da]?.main || []).flat().map((c) => c.node);

test('il tasto non apre il browser: niente sendAndWait, i tasti portano callback_data con id e versione', () => {
  const testo = JSON.stringify(proponi);
  assert.equal(testo.includes('sendAndWait'), false, 'sendAndWait mette tasti-link verso /webhook-waiting');
  const chiedi = nodo(proponi, 'Chiedi Approva o Rifiuta').parameters;
  assert.equal(chiedi.operation, 'sendMessage');
  assert.equal(chiedi.replyMarkup, 'inlineKeyboard');
  const bottoni = chiedi.inlineKeyboard.rows[0].row.buttons;
  assert.deepEqual(bottoni.map((b) => b.text), ['Approva', 'Rifiuta']);
  assert.match(bottoni[0].additionalFields.callback_data, /'ok:' \+ .*riga\.id \+ ':' \+ .*versione/);
  assert.match(bottoni[1].additionalFields.callback_data, /'no:' \+ .*riga\.id \+ ':' \+ .*versione/);
  assert.equal(JSON.stringify(chiedi.inlineKeyboard).includes('"url"'), false);
  assert.equal(chiedi.additionalFields.reply_to_message_id, '={{ $json.result.message_id }}', 'la domanda sta attaccata all\'anteprima');
});

test('D1: il segno del gruppo si scrive solo dopo che anteprima e domanda sono arrivate', async () => {
  const out = (await controlla({ riga: { ...RIGA, note: 'proposta [lotto vecchio-1126-0900]' }, anteprima: { file_id: 'f1' }, lotto: 'CLI-1127-0100' }))[0].json;
  assert.equal(out.riga.note, 'proposta', 'nella riga scritta subito non c\'è nessun segno di gruppo, nemmeno quello vecchio');
  assert.equal(out.note_col_gruppo, 'proposta [lotto cli-1127-0100]');
  assert.deepEqual(collegati(proponi, 'Chiedi Approva o Rifiuta'), ['Ha un gruppo?']);
  assert.deepEqual(collegati(proponi, 'Ha un gruppo?'), ['Segna il gruppo']);
  const segna = nodo(proponi, 'Segna il gruppo').parameters;
  assert.equal(segna.operation, 'update');
  assert.deepEqual(Object.keys(segna.columns.value).sort(), ['id', 'note']);
  for (const n of ['Manda il video', 'Manda la foto', 'Chiedi Approva o Rifiuta']) assert.equal(nodo(proponi, n).retryOnFail, true, n);
});

// Collaudo del 27/11/2026: «Scrivi la riga» fa appendOrUpdate per id e mette sempre da_approvare. Una riga già
// pubblicata e riproposta con lo stesso id tornava da approvare, perdeva le note, e un tocco su Approva la faceva
// ripubblicare dal flusso 01. Prima di scrivere si rilegge la riga. Nicola, 27/11: se era approvata, torna da approvare.
const rileggi = async (righeNelFoglio, body = { riga: { ...FUTURA, note: 'versione 2' }, anteprima: { file_id: 'f1' }, lotto: 'cli-1127-0200' }) => {
  const proposta = await controlla(body);
  return eseguiCodice(codice(proponi, 'Controlla la riga nel foglio'), { input: righeNelFoglio.map((r) => ({ json: r })), nodi: { 'Controlla la proposta': proposta } });
};
const entraIn = (flusso, a) => Object.entries(flusso.connections).flatMap(([da, c]) => c.main.flatMap((uscita, i) => uscita.filter((x) => x.node === a).map(() => [da, i])));

test('una riga già uscita non si riscrive: prima di scriverla si rilegge per id, e chi è già uscito ferma il flusso', async () => {
  // L'unica strada verso la scrittura passa dalla rilettura e dal controllo.
  assert.deepEqual(entraIn(proponi, 'Scrivi la riga nel Calendario'), [['Controlla la riga nel foglio', 0]]);
  assert.deepEqual(entraIn(proponi, 'Controlla la riga nel foglio'), [['Rileggi la riga', 0]]);
  assert.deepEqual(entraIn(proponi, 'Rileggi la riga'), [['È il riepilogo?', 1]]);
  const leggiRiga = nodo(proponi, 'Rileggi la riga');
  assert.equal(leggiRiga.type, 'n8n-nodes-base.googleSheets');
  assert.equal(leggiRiga.parameters.operation, 'read');
  assert.deepEqual(leggiRiga.parameters.filtersUI.values, [{ lookupColumn: 'id', lookupValue: "={{ $('Controlla la proposta').first().json.riga.id }}" }]);
  assert.equal(leggiRiga.parameters.options.returnFirstMatch, undefined, 'servono tutte le righe con quell\'id, non solo la prima');
  assert.equal(leggiRiga.alwaysOutputData, true, 'una riga nuova non deve fermare il flusso in silenzio');
  // Quello che il flusso 01 ha già fatto uscire non si tocca.
  const riga = { ...FUTURA, note: 'n | approvato su Telegram 2026-11-27 03:10' };
  await assert.rejects(rileggi([{ ...riga, stato: 'pubblicato', link_ig: 'https://instagram.com/p/x' }]), /riga già pubblicata: usa un id nuovo/);
  await assert.rejects(rileggi([{ ...riga, stato: ' Pubblicato ' }]), /riga già pubblicata: usa un id nuovo/);
  await assert.rejects(rileggi([{ ...riga, stato: 'in_pubblicazione' }]), /in pubblicazione/);
  await assert.rejects(rileggi([{ ...riga, stato: 'errore', link_ig: 'https://instagram.com/p/x', errore: 'Facebook non risponde' }]), /già uscita su Instagram/);
  await assert.rejects(rileggi([{ ...riga, stato: 'da_approvare' }, { ...riga, stato: 'pubblicato' }]), /riga già pubblicata/, 'basta una riga uscita fra le doppie');
  // Dal collaudo del 27/11 sulla correzione: gli altri modi in cui il flusso 01 dice che una riga è già uscita.
  await assert.rejects(rileggi([{ ...riga, stato: 'errore', link_fb: 'https://facebook.com/x' }]), /già uscita su Facebook/);
  await assert.rejects(rileggi([{ ...riga, stato: 'approvato', pubblicato_il: '2026-11-27 18:30' }]), /già uscita/);
  await assert.rejects(rileggi([{ ...riga, stato: 'errore', errore: 'È rimasta «in_pubblicazione» (esecuzione 812): n8n si è fermato a metà. Controlla su Instagram e Facebook se il contenuto è uscito: se sì scrivi pubblicato, se no rimetti approvato.' }]), /forse già uscita/);
  await assert.rejects(rileggi([{ ...riga, stato: 'da_approvare' }, { ...riga, stato: 'bozza' }]), /compare 2 volte/, 'le righe doppie non le approva nessuno: si sistemano prima');
  const fra5 = new Date(Date.now() + 5 * 60000).toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 16);
  await assert.rejects(rileggi([{ ...riga, stato: 'approvato', data_ora: fra5 }]), /entro 10 minuti/, 'il flusso 01 potrebbe prenderla mentre la riscriviamo');
  await assert.rejects(rileggi([{ ...riga, stato: 'approvato', data_ora: '2026-01-01 10:00' }]), /entro 10 minuti/, 'ora già passata: il 01 può prenderla adesso');
  assert.equal(leggiRiga.onError, undefined, 'se la lettura non riesce il flusso si ferma: una riga non letta non è una riga nuova');
  assert.equal(nodo(proponi, 'Controlla la riga nel foglio').onError, undefined, 'un controllo che non ferma il flusso non controlla niente');
  // Dal ricollaudo: un'ora scritta in un altro formato non si confronta come testo, e «Approvato» a mano vale come approvato.
  await assert.rejects(rileggi([{ ...riga, stato: 'approvato', data_ora: '27/11/2099 15:00:00' }]), /non so confrontare/);
  await assert.rejects(rileggi([{ ...riga, stato: 'Approvato', data_ora: fra5 }]), /entro 10 minuti/);
  const conSecondi = (await rileggi([{ ...riga, stato: 'approvato', data_ora: '2099-12-06 18:30:00' }]))[0].json;
  assert.equal(conSecondi.riga.stato, 'da_approvare', 'coi secondi l\'ora si legge lo stesso');
});

test('una riga approvata e riproposta torna da approvare, con la storia nelle note e l\'avviso nella domanda', async () => {
  const prima = { ...FUTURA, stato: 'approvato', errore: 'primo commento non riuscito', note: 'SALTA CONTROLLO AI [lotto cli-1127-0100] | approvato su Telegram 2026-11-27 03:10' };
  const out = (await rileggi([prima]))[0].json;
  assert.equal(out.riga.stato, 'da_approvare');
  assert.match(out.riga.note, /^SALTA-CONTROLLO-AI \(valeva per la versione di prima\) \| approvato su Telegram 2026-11-27 03:10 \| errore di prima: primo commento non riuscito \| versione 2 \| riproposta dall'AD \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(era approvato\)$/);
  assert.equal(out.riga.note.includes('[lotto'), false, 'il segno del gruppo vecchio non resta: «Approva tutti» non deve approvare un\'anteprima non vista');
  assert.equal(out.note_col_gruppo, out.riga.note + ' [lotto cli-1127-0200]');
  assert.match(out.messaggio, /Era già approvato: la versione di prima non esce più/);
  assert.match((await rileggi([{ ...prima, stato: 'Approvato' }]))[0].json.messaggio, /Era già approvato/, 'anche scritto a mano con la maiuscola');
  // La scrittura, il segno del gruppo e la domanda usano la versione controllata, non quella grezza.
  assert.equal(nodo(proponi, 'Scrivi la riga nel Calendario').parameters.columns.value.note, '={{ $json.riga.note ?? \'\' }}');
  assert.equal(nodo(proponi, 'Segna il gruppo').parameters.columns.value.note, "={{ $('Controlla la riga nel foglio').first().json.note_col_gruppo }}");
  assert.equal(nodo(proponi, 'Chiedi Approva o Rifiuta').parameters.text, "={{ $('Controlla la riga nel foglio').first().json.messaggio }}");
  // Il controllo AI del flusso 01 si salta con questa scritta nelle note (stessa espressione di «Prepara contenuto»).
  // Quella della versione di prima, o quella che il controllo AI scrive in «errore» quando ferma un contenuto, non deve
  // valere per la versione nuova. Vale solo se la riporta la proposta (collaudo del 27/11 sulla correzione).
  const saltaAi = (note) => /salta\s+controllo\s+ai/i.test(note);
  assert.equal(saltaAi(out.riga.note), false);
  const fermataDallAi = { ...FUTURA, stato: 'errore', note: 'n', errore: 'Fermato dal controllo AI: il prezzo nella foto non è quello del sito. Se va bene così, scrivi SALTA CONTROLLO AI nelle note e rimetti approvato.' };
  const corretta = (await rileggi([fermataDallAi]))[0].json;
  assert.equal(saltaAi(corretta.riga.note), false, 'la versione corretta ripassa dal controllo AI');
  assert.equal(saltaAi(corretta.note_col_gruppo), false);
  assert.match(corretta.riga.note, /errore di prima: Fermato dal controllo AI: il prezzo/, 'la storia resta');
  const conLaScritta = (await rileggi([fermataDallAi], { riga: { ...FUTURA, note: 'SALTA CONTROLLO AI' }, anteprima: { file_id: 'f1' } }))[0].json;
  assert.equal(saltaAi(conLaScritta.riga.note), true, 'se la proposta nuova la porta, vale');
  // Una nota nuova che sta dentro una vecchia più lunga non sparisce.
  const simile = (await rileggi([{ ...FUTURA, stato: 'bozza', note: 'v2 rifiutata' }], { riga: { ...FUTURA, note: 'v2' }, anteprima: { file_id: 'f1' } }))[0].json;
  assert.match(simile.riga.note, /^v2 rifiutata \| v2 \| riproposta/);
  // Una riga nuova passa com'è; una rifiutata torna da approvare senza l'avviso degli approvati.
  const nuova = (await rileggi([{}]))[0].json;
  assert.equal(nuova.riga.note, 'versione 2');
  assert.equal(nuova.messaggio, 'Approvi la riga ' + FUTURA.id + '?');
  const rifiutata = (await rileggi([{ ...FUTURA, stato: 'bozza', note: 'rifiutato su Telegram 2026-11-27 03:20' }]))[0].json;
  assert.match(rifiutata.riga.note, /^rifiutato su Telegram 2026-11-27 03:20 \| versione 2 \| riproposta dall'AD .* \(era bozza\)$/);
  assert.equal(rifiutata.messaggio.includes('Era già approvato'), false);
});

test('la proposta rifiuta gruppi e id che non stanno nel tasto, e toglie gli spazi dall\'id', async () => {
  await assert.rejects(controlla({ riga: RIGA, anteprima: { file_id: 'f1' }, lotto: 'Lotto Con Spazi' }), /lotto/);
  await assert.rejects(controlla({ riga: { ...RIGA, id: 'x'.repeat(55) }, anteprima: { file_id: 'f1' } }), /troppo lungo/);
  assert.equal((await controlla({ riga: { ...RIGA, id: 'x'.repeat(54) }, anteprima: { file_id: 'f1' } }))[0].json.riga.id.length, 54);
  assert.equal((await controlla({ riga: { ...RIGA, id: ' xyz ' }, anteprima: { file_id: 'f1' } }))[0].json.riga.id, 'xyz');
  assert.match(await versioneDi(RIGA), /^[0-9a-z]{6}$/);
  assert.notEqual(await versioneDi(RIGA), await versioneDi({ ...RIGA, media: 'https://drive.google.com/file/d/y/view' }));
  const r = await controlla({ riepilogo: { lotto: 'cli-1127-0100', nome: 'Tropico' } });
  assert.deepEqual(r[0].json, { modo: 'riepilogo', lotto: 'cli-1127-0100', nome: 'Tropico' });
});

test('il riepilogo elenca solo quello che «Approva tutti» approverà davvero, e col gruppo vuoto non manda niente', async () => {
  const c = codice(proponi, 'Prepara il riepilogo');
  const prova = (righe) => eseguiCodice(c, { input: righe.map((r) => ({ json: r })), nodi: { 'Controlla la proposta': [{ json: { modo: 'riepilogo', lotto: 'cli-1127-0100', nome: 'Tropico' } }] } });
  const out = await prova([
    { ...FUTURA, id: 'b', data_ora: '2099-12-07 12:15', tipo: 'storia' },
    { ...FUTURA, id: 'a' },
    { ...FUTURA, id: 'c', stato: 'approvato' },
    { ...FUTURA, id: 'd', note: 'altro gruppo [lotto cli-1126-0900]' },
    { ...FUTURA, id: 'e', data_ora: '2020-01-01 10:00' },
    { ...FUTURA, id: 'f' }, { ...FUTURA, id: 'f', stato: 'pubblicato' }]);
  assert.equal(out[0].json.quanti, 2);
  assert.equal(out[0].json.tasto, 'Approva tutti e 2');
  assert.match(out[0].json.testo, /^Tropico: 2 contenuti ancora da approvare\.\n\n- dom 6\/12 alle 18:30, post\n- lun 7\/12 alle 12:15, storia/);
  assert.match(out[0].json.testo, /1 contenuto con l'ora già passata/);
  assert.match(out[0].json.testo, /1 righe che compaiono due volte/);
  assert.equal((await prova([{}]))[0].json.manda, false, 'foglio senza righe del gruppo: nessun messaggio');
});

test('il tocco conta solo se arriva dalla chat di Nicola e solo coi tasti nostri', async () => {
  assert.deepEqual((await tocco('ok:cli-20991206-1830:abc123'))[0].json, { query_id: 'q1', chat_id: '123', message_id: '77', azione: 'approva', id: 'cli-20991206-1830', versione: 'abc123' });
  assert.equal((await tocco('ok:a:b:abc123'))[0].json.id, 'a:b', 'un id coi due punti resta intero');
  assert.equal((await tocco('no:cli-20991206-1830:abc123'))[0].json.azione, 'rifiuta');
  assert.equal((await tocco('ok:cli-20991206-1830'))[0].json.azione, 'ignora', 'senza versione il tasto non vale');
  assert.equal((await tocco('tutti:cli-1127-0100'))[0].json.lotto, 'cli-1127-0100');
  assert.equal((await tocco('cancella:tutto'))[0].json.azione, 'ignora');
  assert.equal((await tocco('tutti:../x'))[0].json.azione, 'ignora');
  const estraneo = [{ json: { callback_query: { id: 'q2', data: 'ok:cli-20991206-1830:abc123', from: { id: 999 }, message: { message_id: 5, chat: { id: 999 } } } } }];
  assert.equal((await tocco('', estraneo))[0].json.azione, 'ignora');
});

test('la decisione cambia la riga solo se è ancora da approvare, e la domanda diventa lo stato', async () => {
  const v = await versioneDi(FUTURA);
  const t = (azione, extra = {}) => ({ query_id: 'q1', chat_id: '123', message_id: '77', azione, id: FUTURA.id, versione: v, ...extra });
  const ok = (await decidi(t('approva'), [FUTURA]))[0].json;
  assert.deepEqual(ok.righe.map((r) => [r.id, r.stato]), [[FUTURA.id, 'approvato']]);
  assert.match(ok.righe[0].note, /^n \[lotto cli-1127-0100\] \| approvato su Telegram \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(ok.testo, 'Approvato: esce dom 6/12 alle 18:30.');
  assert.equal((await decidi(t('rifiuta'), [FUTURA]))[0].json.righe[0].stato, 'bozza');
  const gia = (await decidi(t('rifiuta'), [{ ...FUTURA, stato: 'approvato' }]))[0].json;
  assert.deepEqual(gia.righe, [], 'se il foglio è già deciso, vince il foglio');
  assert.equal(gia.testo, 'Già approvato: esce dom 6/12 alle 18:30.');
  const sparita = (await decidi(t('approva'), [{ ...FUTURA, id: 'altra' }]))[0].json;
  assert.deepEqual(sparita.righe, []);
  assert.match(sparita.testo, /Non trovo più/);
  const estraneo = (await decidi({ ...t('ignora'), motivo: 'Questo tasto non è per te.' }, [FUTURA]))[0].json;
  assert.deepEqual(estraneo.righe, []);
  assert.equal(estraneo.testo, '', 'un tocco estraneo non cambia nemmeno il messaggio');
});

test('D3, D4 e l\'ora passata: righe doppie, tasti vecchi e contenuti scaduti non si approvano', async () => {
  const v = await versioneDi(FUTURA);
  const t = (azione, extra = {}) => ({ query_id: 'q1', chat_id: '123', message_id: '77', azione, id: FUTURA.id, versione: v, ...extra });
  const doppia = (await decidi(t('approva'), [{ ...FUTURA, stato: 'pubblicato' }, FUTURA]))[0].json;
  assert.deepEqual(doppia.righe, [], 'D3: con l\'id doppio n8n aggiornerebbe la prima riga, magari già pubblicata');
  assert.match(doppia.testo, /compare 2 volte/);
  const riproposta = { ...FUTURA, media: 'https://drive.google.com/file/d/nuovo/view' };
  const vecchio = (await decidi(t('approva'), [riproposta]))[0].json;
  assert.deepEqual(vecchio.righe, [], 'D4: il tasto dell\'anteprima vecchia non approva i file nuovi');
  assert.match(vecchio.testo, /versione vecchia/);
  const scaduta = { ...FUTURA, data_ora: '2020-01-01 10:00' };
  const tardi = (await decidi(t('approva', { versione: await versioneDi({ ...RIGA, ...scaduta }) }), [scaduta]))[0].json;
  assert.deepEqual(tardi.righe, [], 'chi non viene approvato prima della sua ora non esce');
  assert.match(tardi.testo, /già passata: non l'ho approvato/);
  const rifiutoTardi = (await decidi(t('rifiuta', { versione: await versioneDi({ ...RIGA, ...scaduta }) }), [scaduta]))[0].json;
  assert.equal(rifiutoTardi.righe[0].stato, 'bozza', 'rifiutare si può sempre');
});

test('«Approva tutti» approva solo il suo gruppo, solo il da approvare, e salta doppie e scadute', async () => {
  const righe = [
    FUTURA,
    { ...FUTURA, id: 'cli-20991207-1215', data_ora: '2099-12-07 12:15' },
    { ...FUTURA, id: 'gia-rifiutata', stato: 'bozza' },
    { ...FUTURA, id: 'altro-gruppo', note: '[lotto cli-1126-0900]' },
    { ...FUTURA, id: 'gruppo-prefisso', note: '[lotto cli-1127-01]' },
    { ...FUTURA, id: 'scaduta', data_ora: '2020-01-01 10:00' },
    { ...FUTURA, id: 'doppia' }, { ...FUTURA, id: 'doppia', stato: 'pubblicato', note: '' }];
  const out = (await decidi({ query_id: 'q1', chat_id: '123', message_id: '78', azione: 'tutti', lotto: 'cli-1127-0100' }, righe))[0].json;
  assert.deepEqual(out.righe.map((r) => r.id), ['cli-20991206-1830', 'cli-20991207-1215']);
  assert.ok(out.righe.every((r) => r.stato === 'approvato'));
  assert.match(out.testo, /^Approvati 2 contenuti\./);
  assert.match(out.testo, /ora è già passata: 1/);
  assert.match(out.testo, /compaiono due volte nel Calendario: 1/);
  assert.deepEqual((await decidi({ azione: 'tutti', lotto: 'cli-1125-0000' }, righe))[0].json.righe, []);
});

test('D2: «Approva tutti» aspetta prima di leggere il foglio, il tocco singolo no', () => {
  assert.deepEqual(collegati(tastiFlusso, 'Leggi il tocco'), ['È «Approva tutti»?']);
  const se = tastiFlusso.connections['È «Approva tutti»?'].main;
  assert.deepEqual(se[0].map((c) => c.node), ['Aspetta i tocchi in corso']);
  assert.deepEqual(se[1].map((c) => c.node), ['Leggi il Calendario']);
  const aspetta = nodo(tastiFlusso, 'Aspetta i tocchi in corso').parameters;
  assert.deepEqual([aspetta.resume, aspetta.amount, aspetta.unit], ['timeInterval', 5, 'seconds']);
  assert.deepEqual(collegati(tastiFlusso, 'Aspetta i tocchi in corso'), ['Leggi il Calendario']);
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
