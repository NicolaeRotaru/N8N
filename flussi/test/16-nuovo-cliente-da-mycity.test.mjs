// Le prove del 16 · Nuovo cliente da MyCity: i nodi nuovi e la trasformazione del modulo 12.
// Si lancia con: node --test flussi/test/
//
// Il modulo 12 vero non sta nel repository (è pubblico, e il 12 ha gli ID del foglio, della cartella
// e della chat): qui c'è un modulo 12 in miniatura con gli stessi nomi di nodo e la stessa forma.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCodice } from './esegui-codice.mjs';
import {
  CODICE_RICHIESTA, CODICE_PAGINA_4, CODICE_PREPARA_ANALISI, CODICE_SCHEDA_SITO, codicePagina, trasforma, controlla, PERCORSO_WEBHOOK, NOME_16,
} from '../16-nuovo-cliente-da-mycity/genera.mjs';

const richiesta = (attivita = {}, extra = {}) => [{ json: { headers: {}, body: {
  tipo: 'nuovo-cliente', origine: 'mycity', inviato_il: '2026-11-24T09:00:00.000Z',
  attivita: { id: 'c0b240c0-2a86-4218-9d0f-5154f08ff929', nome: 'Bar Roma', tipo: 'bar', tipo_descritto: 'bar o caffetteria',
    indirizzo: 'Via Roma 1, 29121 Piacenza', citta: 'Piacenza', descrizione: 'Colazioni e aperitivi', ...attivita },
  ...extra,
} } }];

test('la richiesta di MyCity diventa i campi del modulo del 12', async () => {
  const [{ json }] = await eseguiCodice(CODICE_RICHIESTA, { input: richiesta(), statico: {} });
  assert.equal(json.scartata, false);
  assert.equal(json.modalita, 'nuovo cliente');
  assert.equal(json.nome_locale, 'Bar Roma');
  assert.equal(json.citta, 'Piacenza');
  assert.equal(json.sito, '');
  assert.match(json.appunti, /Via Roma 1, 29121 Piacenza/);
  assert.match(json.appunti, /bar o caffetteria/);
  assert.match(json.appunti, /da confermare/);
});

test('senza città si cerca a Piacenza; nome con spazi e a capo diventa una riga', async () => {
  const [{ json }] = await eseguiCodice(CODICE_RICHIESTA, { input: richiesta({ citta: '', nome: '  Forno\n  del   Borgo ' }), statico: {} });
  assert.equal(json.citta, 'Piacenza');
  assert.equal(json.nome_locale, 'Forno del Borgo');
});

test('la stessa attività una volta sola in 7 giorni, senza disturbare Nicola', async () => {
  const statico = {};
  const primo = await eseguiCodice(CODICE_RICHIESTA, { input: richiesta(), statico });
  const secondo = await eseguiCodice(CODICE_RICHIESTA, { input: richiesta(), statico });
  assert.equal(primo[0].json.scartata, false);
  assert.equal(secondo[0].json.scartata, true);
  assert.equal(secondo[0].json.avvisa, false);
  // Dopo 8 giorni torna buona.
  statico.mycity_visti['c0b240c0-2a86-4218-9d0f-5154f08ff929'] = Date.now() - 8 * 86400000;
  const terzo = await eseguiCodice(CODICE_RICHIESTA, { input: richiesta(), statico });
  assert.equal(terzo[0].json.scartata, false);
});

test('al massimo 10 attività al giorno: all\'undicesima avvisa una volta, poi tace', async () => {
  const statico = {};
  for (let i = 0; i < 10; i++) {
    const [{ json }] = await eseguiCodice(CODICE_RICHIESTA, { input: richiesta({ id: `attivita-${i}` }), statico });
    assert.equal(json.scartata, false, `la ${i + 1}ª deve passare`);
  }
  const undicesima = await eseguiCodice(CODICE_RICHIESTA, { input: richiesta({ id: 'attivita-11' }), statico });
  const dodicesima = await eseguiCodice(CODICE_RICHIESTA, { input: richiesta({ id: 'attivita-12' }), statico });
  assert.equal(undicesima[0].json.scartata, true);
  assert.equal(undicesima[0].json.avvisa, true);
  assert.equal(dodicesima[0].json.avvisa, false);
  // Il giorno dopo si riparte da zero.
  statico.mycity_giorno = '2000-01-01';
  const domani = await eseguiCodice(CODICE_RICHIESTA, { input: richiesta({ id: 'attivita-13' }), statico });
  assert.equal(domani[0].json.scartata, false);
});

test('una richiesta che non è un nuovo cliente di MyCity si scarta e si dice perché', async () => {
  for (const sbagliata of [richiesta({}, { tipo: 'preventivo-accettato' }), richiesta({}, { origine: 'altro' }),
    richiesta({ nome: ' ' }), richiesta({ id: '' }), [{ json: {} }]]) {
    const [{ json }] = await eseguiCodice(CODICE_RICHIESTA, { input: sbagliata, statico: {} });
    assert.equal(json.scartata, true);
    assert.equal(json.avvisa, true);
    assert.ok(json.motivo.length > 5);
  }
});

test('un venditore di sistema del sito (SDG, il negozio «MyCity») non entra nella scheda Clienti', async () => {
  for (const id of ['11111111-1111-1111-1111-5d9000000001', '11111111-1111-1111-1111-C1EC0DE00001']) {
    const statico = {};
    const [{ json }] = await eseguiCodice(CODICE_RICHIESTA, { input: richiesta({ id, nome: 'SDG Agenzia' }), statico });
    assert.equal(json.scartata, true, id);
    assert.equal(json.avvisa, false);
    assert.equal(statico.mycity_oggi, undefined, 'non consuma il tetto del giorno');
  }
});

// Le pagine come le prepara il 12: JSON con ogni $ raddoppiato (perPagina).
const perPagina = (campi) => JSON.stringify(campi).replace(/\$/g, '$$$$');

test('una pagina si compila coi valori proposti, come un «Avanti» senza modifiche', async () => {
  const pagina1 = perPagina([
    { fieldLabel: 'pagina', fieldName: 'pagina', fieldType: 'hiddenField', fieldValue: 'chi' },
    { fieldType: 'html', html: '<p>Analisi</p>' },
    { fieldLabel: 'Chiave', fieldName: 'cliente', fieldType: 'text', defaultValue: 'bar-roma', requiredField: true },
    { fieldLabel: 'Note', fieldName: 'note_piano', fieldType: 'textarea', defaultValue: 'Aperitivo a 5$ il giovedì $& $$' },
    { fieldLabel: 'Tono', fieldName: 'tono_di_voce', fieldType: 'dropdown', defaultValue: 'amichevole' },
    { fieldLabel: 'WhatsApp', fieldName: 'whatsapp_titolare', fieldType: 'text', requiredField: false },
  ]);
  const [{ json }] = await eseguiCodice(codicePagina('pagina1'), { nodi: { 'Prepara le pagine': [{ json: { pagina1 } }] } });
  assert.equal(json.pagina, 'chi');
  assert.equal(json.cliente, 'bar-roma');
  assert.equal(json.note_piano, 'Aperitivo a 5$ il giovedì $& $$');
  assert.equal(json.tono_di_voce, 'amichevole');
  assert.equal(json.whatsapp_titolare, '');
  assert.equal(Object.keys(json).includes('undefined'), false);
});

test('la pagina 4 conferma da sola, ma non su un possibile doppione', async () => {
  const conferma = await eseguiCodice(CODICE_PAGINA_4, { nodi: { 'Controlla la proposta': [{ json: { ok: true, doppioni: [] } }] } });
  assert.equal(conferma[0].json.decisione, 'Conferma e salva');
  const doppione = await eseguiCodice(CODICE_PAGINA_4, { nodi: { 'Controlla la proposta': [{ json: { ok: true, doppioni: ['la chiave «bar-roma» c\'è già (riga 7)'] } }] } });
  assert.equal(doppione[0].json.decisione, 'Annulla');
  assert.match(doppione[0].json.motivo_auto, /bar-roma/);
  // Ricerca fermata: la proposta non c'è, si conferma (il 12 scrive comunque attivo = no).
  const senza = await eseguiCodice(CODICE_PAGINA_4, {});
  assert.equal(senza[0].json.decisione, 'Conferma e salva');
});

// --- La trasformazione, su un modulo 12 in miniatura -------------------------------------------

const nodo = (name, type, parameters = {}, extra = {}) => ({ id: name, name, type, typeVersion: 1, position: [0, 0], parameters, ...extra });
const tg = (name, text) => nodo(name, 'n8n-nodes-base.telegram', { text, chatId: "={{ $('Config').first().json.TELEGRAM_CHAT_ID }}" },
  { typeVersion: 1.2, credentials: { telegramApi: { id: 'tg1', name: 'Telegram - Bot agenzia' } } });
const form = (name, operation = 'page') => nodo(name, 'n8n-nodes-base.form', { operation });
const vai = (...nomi) => ({ main: nomi.map((n) => (n ? [{ node: n, type: 'main', index: 0 }] : [])) });

function modulo12Mini() {
  return {
    id: 'X12', name: '12 · Nuovo cliente (automatico)', active: false,
    settings: { executionOrder: 'v1', timezone: 'Europe/Rome' },
    nodes: [
      nodo('Modulo nuovo cliente', 'n8n-nodes-base.formTrigger', { formTitle: 'Nuovo cliente' }),
      nodo('Config', 'n8n-nodes-base.set', { assignments: { assignments: [
        { name: 'MODALITA', value: 'prova' }, { name: 'TELEGRAM_CHAT_ID', value: '123' }, { name: 'SHEET_ID', value: 'foglio' }] } }),
      nodo('Prepara la ricerca', 'n8n-nodes-base.code', { jsCode: "const f = $('Modulo nuovo cliente').first().json;" }),
      nodo('Cerca il locale con Claude', 'n8n-nodes-base.httpRequest'),
      nodo('Controlla la proposta', 'n8n-nodes-base.code', { jsCode: 'return [];' }),
      tg('Avvisa: ricerca fermata', '={{ $json.messaggio_stop }}'),
      nodo('Nuovo cliente? (dopo lo stop)', 'n8n-nodes-base.if'),
      tg('Anteprima su Telegram', '={{ $json.messaggio_anteprima }}'),
      nodo('Prepara le pagine', 'n8n-nodes-base.code', { jsCode: "const n = $('Modulo nuovo cliente').first().json.nome_locale;" }),
      form('Pagina 1 · Chi è'), form('Pagina 2 · Come parliamo'), form('Pagina 3 · Menu e fatti'),
      nodo('Controlla il cliente', 'n8n-nodes-base.code', { jsCode: "const p1 = $('Pagina 1 · Chi è').first().json; const p3 = $('Pagina 3 · Menu e fatti').first().json;" }),
      nodo('Tutto a posto?', 'n8n-nodes-base.if'),
      form('Fine: da correggere', 'completion'),
      form('Pagina 4 · Conferma o annulla'),
      nodo('Decisione', 'n8n-nodes-base.code', { jsCode: 'const invio = $input.first().json;' }),
      nodo('Confermato?', 'n8n-nodes-base.if'),
      form('Fine: annullato', 'completion'),
      form('Fine: aggiornamento fermato', 'completion'),
      nodo('Ancora libera?', 'n8n-nodes-base.code', { jsCode: "const c = $(\"Controlla il cliente\").first().json;" }),
      nodo('Scrivi il cliente', 'n8n-nodes-base.googleSheets'),
      tg('Avvisa: cliente creato', "={{ $('Ancora libera?').first().json.testo_telegram }}"),
      form('Fine: cliente creato', 'completion'),
    ],
    connections: {
      'Modulo nuovo cliente': vai('Config'),
      Config: vai('Prepara la ricerca'),
      'Prepara la ricerca': vai('Cerca il locale con Claude'),
      'Cerca il locale con Claude': vai('Controlla la proposta'),
      'Controlla la proposta': vai('Anteprima su Telegram', 'Avvisa: ricerca fermata'),
      'Avvisa: ricerca fermata': vai('Nuovo cliente? (dopo lo stop)'),
      'Nuovo cliente? (dopo lo stop)': vai('Prepara le pagine', 'Fine: aggiornamento fermato'),
      'Anteprima su Telegram': vai('Prepara le pagine'),
      'Prepara le pagine': vai('Pagina 1 · Chi è'),
      'Pagina 1 · Chi è': vai('Pagina 2 · Come parliamo'),
      'Pagina 2 · Come parliamo': vai('Pagina 3 · Menu e fatti'),
      'Pagina 3 · Menu e fatti': vai('Controlla il cliente'),
      'Controlla il cliente': vai('Tutto a posto?'),
      'Tutto a posto?': vai('Pagina 4 · Conferma o annulla', 'Fine: da correggere'),
      'Pagina 4 · Conferma o annulla': vai('Decisione'),
      Decisione: vai('Confermato?'),
      'Confermato?': vai('Ancora libera?', 'Fine: annullato'),
      'Ancora libera?': vai('Scrivi il cliente'),
      'Scrivi il cliente': vai('Avvisa: cliente creato'),
      'Avvisa: cliente creato': vai('Fine: cliente creato'),
    },
  };
}

const credenziale = { id: 'cred-1', name: 'MyCity - Segreto nuovo cliente' };

test('il 16 non ha più nodi del modulo, parte dal webhook col segreto e arriva alla scrittura', () => {
  const originale = modulo12Mini();
  const copia = structuredClone(originale);
  const w = trasforma(originale, { credenziale, modalita: 'vero' });
  assert.deepEqual(originale, copia, 'il modulo 12 ricevuto non si tocca');
  assert.deepEqual(controlla(w), []);
  assert.equal(w.name, NOME_16);
  assert.equal(w.id, undefined);
  const webhook = w.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
  assert.equal(webhook.parameters.path, PERCORSO_WEBHOOK);
  assert.equal(webhook.parameters.authentication, 'headerAuth');
  assert.deepEqual(webhook.credentials.httpHeaderAuth, credenziale);
  assert.equal(w.nodes.some((n) => n.type.startsWith('n8n-nodes-base.form')), false);
  const cfg = w.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments;
  assert.equal(cfg.find((a) => a.name === 'MODALITA').value, 'vero');
  assert.equal(w.nodes.find((n) => n.name === 'Pagina 1 · Chi è').type, 'n8n-nodes-base.code');
  assert.equal(w.nodes.find((n) => n.name === 'Fine: annullato').type, 'n8n-nodes-base.telegram');
});

test('dopo lo stop della ricerca il 16 si ferma: niente scheda vuota', () => {
  const w = trasforma(modulo12Mini(), { credenziale });
  assert.equal(w.connections['Nuovo cliente? (dopo lo stop)'], undefined);
  // Con l'analisi agganciata, dopo lo stop si va solo all'analisi.
  const conAnalisi = trasforma(modulo12Mini(), { credenziale, analisi: 'id-18' });
  assert.deepEqual(conAnalisi.connections['Nuovo cliente? (dopo lo stop)'].main.flat().map((v) => v.node), ["Prepara l'analisi dell'attività"]);
  assert.deepEqual(controlla(conAnalisi), []);
  assert.match(w.nodes.find((n) => n.name === 'Avvisa: ricerca fermata').parameters.text, /Non ho scritto niente/);
});

test('di serie il 16 nasce in prova: cerca ma non scrive', () => {
  const w = trasforma(modulo12Mini(), { credenziale });
  const cfg = w.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments;
  assert.equal(cfg.find((a) => a.name === 'MODALITA').value, 'prova');
});

test('i testi Telegram del 16 si leggono come espressioni n8n e dicono che arriva da MyCity', () => {
  const w = trasforma(modulo12Mini(), { credenziale });
  // Stub dei dati che n8n darebbe all'espressione: ogni nodo ha gli stessi campi finti.
  const dati = { nome_locale: 'Bar <Roma> & C.', errori: ['manca la chiave'], motivo_auto: 'possibile doppione',
    messaggio_anteprima: "Ecco la scheda.\n• nome_locale: Bar — ✅ scritto da Nicola · appunti di Nicola: «Via Roma»\nCorreggi nelle pagine del modulo che si aprono nel browser; nell'ultima pagina scegli Conferma o Annulla.",
    messaggio_stop: 'Ricerca fermata', testo_telegram: 'Cliente creato', motivo: 'prova' };
  const $ = () => ({ first: () => ({ json: dati }) });
  for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.telegram')) {
    const m = n.parameters.text.match(/^=\{\{ ([\s\S]*) \}\}$/);
    assert.ok(m, `${n.name}: non è un'espressione`);
    const testo = new Function('$', '$json', `return (${m[1]});`)($, dati);
    assert.ok(testo.startsWith('🛒 <b>Da MyCity, in automatico</b>\n'), n.name);
    assert.equal(testo.includes('<Roma>'), false, `${n.name}: il nome va scappato per l'HTML di Telegram`);
    if (n.name === 'Anteprima su Telegram') {
      assert.match(testo, /Nessuno deve compilare il modulo/);
      assert.equal(testo.includes('si aprono nel browser'), false);
      assert.equal(testo.includes('Nicola'), false, 'i dati arrivano dall\'attività, non da Nicola');
      assert.match(testo, /scritto dall'attività su MyCity/);
    }
  }
});

test('i controlli trovano un nodo del modulo rimasto, un nodo citato che non c\'è e il segreto mancante', () => {
  const w = trasforma(modulo12Mini(), { credenziale });
  const rotto = structuredClone(w);
  rotto.nodes.push(nodo('Pagina 9', 'n8n-nodes-base.form'));
  rotto.nodes.find((n) => n.name === 'Decisione').parameters.jsCode = "$('Pagina che non esiste').first()";
  rotto.nodes.find((n) => n.type === 'n8n-nodes-base.webhook').credentials.httpHeaderAuth.id = 'DA_IMPOSTARE';
  rotto.connections['Nuovo cliente? (dopo lo stop)'] = vai('Prepara le pagine');
  const problemi = controlla(rotto).join('\n');
  assert.match(problemi, /resta un nodo del modulo/);
  assert.match(problemi, /Pagina che non esiste/);
  assert.match(problemi, /credenziale del segreto/);
  assert.match(problemi, /scheda vuota/);
  // senza credenziale passata, il 16 non è pronto da mandare
  assert.match(controlla(trasforma(modulo12Mini(), {})).join('\n'), /credenziale del segreto/);
});

test('se il modulo 12 cambia nome a un nodo che serve, il generatore si ferma invece di sbagliare', () => {
  const m = modulo12Mini();
  m.nodes.find((n) => n.name === 'Pagina 4 · Conferma o annulla').name = 'Pagina 4 · Conferma';
  assert.throws(() => trasforma(m, { credenziale }), /non ha più questi nodi/);
});

// --- L'analisi dell'attività, ultimo passo del 16 -------------------------------------------------

test("ogni punto d'arrivo del 16 fa partire l'analisi dell'attività, senza far aspettare", () => {
  const w = trasforma(modulo12Mini(), { credenziale, analisi: 'id-18' });
  assert.deepEqual(controlla(w), []);
  const chiama = w.nodes.find((n) => n.name === "Analizza l'attività (flusso 18)");
  assert.equal(chiama.type, 'n8n-nodes-base.executeWorkflow');
  assert.equal(chiama.parameters.workflowId.value, 'id-18');
  assert.equal(chiama.parameters.options.waitForSubWorkflow, false);
  for (const arrivo of ['Fine: cliente creato', 'Fine: annullato', 'Fine: da correggere', 'Nuovo cliente? (dopo lo stop)']) {
    assert.deepEqual(w.connections[arrivo].main.flat().map((v) => v.node), ["Prepara l'analisi dell'attività"], arrivo);
  }
  // Il ramo della richiesta scartata non arriva all'analisi: non c'è un'attività valida da guardare.
  assert.equal(w.connections['Avvisa: richiesta scartata'], undefined);
  // Senza --analisi il 16 resta come prima.
  assert.equal(trasforma(modulo12Mini(), { credenziale }).nodes.some((n) => n.name === "Analizza l'attività (flusso 18)"), false);
});

test("se un punto d'arrivo non porta all'analisi, il controllo lo dice", () => {
  const w = trasforma(modulo12Mini(), { credenziale, analisi: 'id-18' });
  delete w.connections['Fine: annullato'];
  assert.match(controlla(w).join('\n'), /dopo «Fine: annullato» l'analisi dell'attività non parte/);
  const w2 = trasforma(modulo12Mini(), { credenziale, analisi: 'id-18' });
  w2.nodes.find((n) => n.name === "Analizza l'attività (flusso 18)").parameters.options.waitForSubWorkflow = true;
  assert.match(controlla(w2).join('\n'), /senza far aspettare/);
});

const CREATO = (extra = {}) => ({
  'Modulo nuovo cliente': [{ json: { id_mycity: 'c0b240c0-2a86-4218-9d0f-5154f08ff929', nome_locale: 'Pane Quotidiano' } }],
  'Controlla la proposta': [{ json: { ok: true, analisi: { tipo_di_locale: 'negozio bio', punti_di_forza: ['centro'] }, da_confermare: ['orari'], sito_ufficiale: '' } }],
  ...extra,
});

test("l'analisi riceve l'attività, com'è andata la scheda Clienti e la lettura del web del 12", async () => {
  const scritta = await eseguiCodice(CODICE_PREPARA_ANALISI, { nodi: CREATO({ 'Avvisa: cliente creato': [{ json: {} }] }) });
  assert.deepEqual(scritta[0].json, { id: 'c0b240c0-2a86-4218-9d0f-5154f08ff929', nome: 'Pane Quotidiano', origine: 'iscrizione su MyCity',
    esito_scheda: 'scritta, con attivo = no', scheda: { analisi: { tipo_di_locale: 'negozio bio', punti_di_forza: ['centro'] }, da_confermare: ['orari'], sito_ufficiale: '' } });
  const prova = await eseguiCodice(CODICE_PREPARA_ANALISI, { nodi: CREATO({ 'Avvisa: non scritto': [{ json: {} }], 'Ancora libera?': [{ json: { prova: true } }] }) });
  assert.equal(prova[0].json.esito_scheda, 'non scritta: modalità prova');
  const doppione = await eseguiCodice(CODICE_PREPARA_ANALISI, { nodi: CREATO({ 'Fine: annullato': [{ json: {} }] }) });
  assert.equal(doppione[0].json.esito_scheda, 'non scritta: possibile doppione');
  const fermata = await eseguiCodice(CODICE_PREPARA_ANALISI, { nodi: { 'Modulo nuovo cliente': CREATO()['Modulo nuovo cliente'], 'Avvisa: ricerca fermata': [{ json: {} }] } });
  assert.equal(fermata[0].json.esito_scheda, 'non scritta: la ricerca sul web si è fermata');
  assert.equal(fermata[0].json.scheda, null, 'senza proposta non c\'è scheda da passare');
});

// --- La scheda al sito (formato concordato con la sessione «Servizi SDG») ------------------------

const conSito = (extra = {}) => trasforma(modulo12Mini(), { credenziale, analisi: 'id-18', sito: 'https://mycity.example', credenzialeSito: { id: 'cs', name: 'MyCity - Segreto scheda cliente' }, ...extra });

test("con --sito la scheda va al sito dallo stesso ultimo passo dell'analisi, e se il sito non la prende avvisa", () => {
  const w = conSito({ modalita: 'vero' });
  assert.deepEqual(controlla(w), []);
  assert.deepEqual(w.connections["Prepara l'analisi dell'attività"].main[0].map((v) => v.node), ["Analizza l'attività (flusso 18)", 'Prepara la scheda per il sito']);
  const manda = w.nodes.find((n) => n.name === 'Manda la scheda al sito');
  assert.equal(manda.parameters.method, 'POST');
  assert.match(manda.parameters.url, /MYCITY_SITO \}\}\/api\/agenzia\/scheda-cliente$/);
  assert.equal(manda.credentials.httpHeaderAuth.id, 'cs');
  const cfg = w.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments;
  assert.equal(cfg.find((a) => a.name === 'MYCITY_SITO').value, 'https://mycity.example');
  assert.deepEqual(w.connections['Il sito ha preso la scheda?'].main[1].map((v) => v.node), ['Avvisa: scheda non arrivata al sito']);
  // il testo dell'avviso si legge come espressione n8n
  const avviso = w.nodes.find((n) => n.name === 'Avvisa: scheda non arrivata al sito').parameters.text.match(/^=\{\{ ([\s\S]*) \}\}$/)[1];
  const testo = new Function('$', '$json', `return (${avviso});`)(() => ({ first: () => ({ json: { nome_locale: 'Bar <X>' } }) }), { statusCode: 500 });
  assert.match(testo, /La scheda non è arrivata al sito/);
  assert.match(testo, /Bar &lt;X&gt;/);
  // senza --sito il 16 resta com'era
  assert.equal(trasforma(modulo12Mini(), { credenziale, analisi: 'id-18' }).nodes.some((n) => n.name === 'Manda la scheda al sito'), false);
});

test('la scheda al sito vuole https e la sua credenziale', () => {
  assert.throws(() => conSito({ sito: 'http://mycity.example' }), /https/);
  assert.match(controlla(conSito({ credenzialeSito: undefined })).join('\n'), /scheda al sito non ha la credenziale/);
});

const PROPOSTA = { ok: true, chiave_proposta: 'bar-roma', sito_ufficiale: 'https://barroma.it', da_confermare: ['orari', 'menu_testo'],
  analisi: { tipo_di_locale: 'bar', pubblico: 'impiegati', punti_di_forza: ['brioche'], idee_contenuti: ['colazione'], cosa_chiedere_al_titolare: ['domenica?'] },
  campi: {
    indirizzo: { valore: 'Via Roma 1', stato: 'confermato', fonte: 'https://comune.example/bar' },
    telefono: { valore: '0523 1', stato: 'frammento', fonte: 'ricerca' },
    orari: { valore: 'Lun-Sab 7-19', stato: 'non_trovata', fonte: 'https://x.example' },
    link_menu: { valore: '', stato: 'nessuna', fonte: '' },
    menu_testo: { valore: 'Brioche\nCappuccino', stato: 'foto', fonte: 'foto 1' },
    menu_con_prezzi: { valore: 'Brioche 1,50 €', stato: 'foto', fonte: 'foto 1' },
  } };
const NODI_SCHEDA = (modalita, proposta = PROPOSTA) => ({
  Config: [{ json: { MODALITA: modalita } }],
  'Modulo nuovo cliente': [{ json: { id_mycity: 'c0b240c0-2a86-4218-9d0f-5154f08ff929', nome_locale: 'Bar Roma' } }],
  ...(proposta ? { 'Controlla la proposta': [{ json: proposta }] } : {}),
});

test('la scheda per il sito: il formato concordato, senza prezzi, mai in prova', async () => {
  const [{ json }] = await eseguiCodice(CODICE_SCHEDA_SITO, { nodi: NODI_SCHEDA('vero') });
  assert.equal(json.mandare, true);
  const c = json.corpo;
  assert.equal(c.tipo, 'scheda-cliente');
  assert.equal(c.origine, 'n8n-16');
  assert.equal(c.id_attivita, 'c0b240c0-2a86-4218-9d0f-5154f08ff929');
  assert.equal(c.chiave_cliente, 'bar-roma');
  assert.deepEqual(c.campi.indirizzo, { valore: 'Via Roma 1', stato: 'confermato', fonte: 'https://comune.example/bar' });
  assert.deepEqual(c.campi.telefono, { valore: '0523 1', stato: 'frammento', fonte: null }, 'una fonte che non è un indirizzo https diventa null');
  assert.equal(c.campi.orari.stato, 'da_confermare', 'citazione non trovata = da confermare');
  assert.deepEqual(c.campi.link_menu, { valore: null, stato: 'nessuna', fonte: null });
  assert.equal(c.campi.menu_testo.valore, 'Brioche\nCappuccino');
  assert.equal('menu_con_prezzi' in c.campi, false, 'i prezzi non escono mai');
  assert.equal(JSON.stringify(c).includes('1,50'), false);
  assert.deepEqual(c.campi.sito_ufficiale, { valore: 'https://barroma.it', stato: 'da_confermare', fonte: 'https://barroma.it' });
  assert.deepEqual(c.analisi.punti_di_forza, ['brioche']);
  assert.deepEqual(c.da_confermare, ['orari', 'menu_testo']);
  // Senza chiave proposta la chiave non si manda proprio: il sito risponderebbe 400 a un null.
  const [{ json: senzaChiave }] = await eseguiCodice(CODICE_SCHEDA_SITO, { nodi: NODI_SCHEDA('vero', { ...PROPOSTA, chiave_proposta: '' }) });
  assert.equal('chiave_cliente' in senzaChiave.corpo, false);
  for (const [modalita, proposta, motivo] of [['prova', PROPOSTA, /prova/], ['vero', null, /nessuna scheda/], ['vero', { ok: false }, /nessuna scheda/]]) {
    const [{ json: j }] = await eseguiCodice(CODICE_SCHEDA_SITO, { nodi: NODI_SCHEDA(modalita, proposta) });
    assert.equal(j.mandare, false);
    assert.match(j.motivo, motivo);
  }
});
