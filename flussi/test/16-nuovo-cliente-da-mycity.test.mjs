// Le prove del 16 · Nuovo cliente da MyCity: i nodi nuovi e la trasformazione del modulo 12.
// Si lancia con: node --test flussi/test/
//
// Il modulo 12 vero non sta nel repository (è pubblico, e il 12 ha gli ID del foglio, della cartella
// e della chat): qui c'è un modulo 12 in miniatura con gli stessi nomi di nodo e la stessa forma.

import { collega } from '../chiedi-all-ad/collega.mjs';
import { conta } from '../conta-api-claude.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCodice } from './esegui-codice.mjs';
import {
  CODICE_RICHIESTA, CODICE_PAGINA_4, CODICE_PREPARA_ANALISI, CODICE_SCHEDA_SITO, CODICE_PREPARA_BUSINESS, CODICE_UNISCI_BUSINESS, codicePagina, trasforma, controlla, PERCORSO_WEBHOOK, NOME_16, SOLO_NEL_12, RICERCA_CON_CLAUDE,
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
    id: 'X12', name: '12 · Nuovo cliente (automatico)' /* nome vecchio: deve funzionare lo stesso */, active: false,
    settings: { executionOrder: 'v1', timezone: 'Europe/Rome' },
    nodes: [
      nodo('Modulo nuovo cliente', 'n8n-nodes-base.formTrigger', { formTitle: 'Nuovo cliente' }),
      nodo('Config', 'n8n-nodes-base.set', { assignments: { assignments: [
        { name: 'MODALITA', value: 'prova' }, { name: 'TELEGRAM_CHAT_ID', value: '123' }, { name: 'SHEET_ID', value: 'foglio' },
        { name: 'RICERCA_CON_CLAUDE', value: 'si' }] } }),
      nodo('Prepara la ricerca', 'n8n-nodes-base.code', { jsCode: "const f = $('Modulo nuovo cliente').first().json;" }),
      nodo('Cerca il locale con Claude', 'n8n-nodes-base.httpRequest', { url: 'https://api.anthropic.com/v1/messages', jsonBody: '={{ JSON.stringify($json.corpo) }}' }),
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
      nodo("Prepara l'iscrizione in MyCity", 'n8n-nodes-base.code', { jsCode: 'return [];' }),
      nodo('Iscrivi in MyCity', 'n8n-nodes-base.executeWorkflow'),
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
      'Avvisa: cliente creato': { main: [[{ node: 'Fine: cliente creato', type: 'main', index: 0 }, { node: "Prepara l'iscrizione in MyCity", type: 'main', index: 0 }]] },
      "Prepara l'iscrizione in MyCity": vai('Iscrivi in MyCity'),
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
  const conAnalisi = trasforma(modulo12Mini(), { credenziale, bozze: 'id-19' });
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

test("ogni punto d'arrivo del 16 fa partire le bozze dei 3 abbonamenti (flusso 19), senza far aspettare", () => {
  const w = trasforma(modulo12Mini(), { credenziale, bozze: 'id-19' });
  assert.deepEqual(controlla(w), []);
  const chiama = w.nodes.find((n) => n.name === 'Bozze dei 3 abbonamenti (flusso 19)');
  assert.equal(chiama.type, 'n8n-nodes-base.executeWorkflow');
  assert.equal(chiama.parameters.workflowId.value, 'id-19');
  assert.equal(chiama.parameters.options.waitForSubWorkflow, false);
  for (const arrivo of ['Fine: cliente creato', 'Fine: annullato', 'Fine: da correggere', 'Nuovo cliente? (dopo lo stop)']) {
    assert.deepEqual(w.connections[arrivo].main.flat().map((v) => v.node), ["Prepara l'analisi dell'attività"], arrivo);
  }
  // Il ramo della richiesta scartata non arriva all'analisi: non c'è un'attività valida da guardare.
  assert.equal(w.connections['Avvisa: richiesta scartata'], undefined);
  // Senza --bozze il 16 resta come prima.
  assert.equal(trasforma(modulo12Mini(), { credenziale }).nodes.some((n) => n.name === 'Bozze dei 3 abbonamenti (flusso 19)'), false);
});

test("se un punto d'arrivo non porta alle bozze, il controllo lo dice", () => {
  const w = trasforma(modulo12Mini(), { credenziale, bozze: 'id-19' });
  delete w.connections['Fine: annullato'];
  assert.match(controlla(w).join('\n'), /dopo «Fine: annullato» le bozze dei 3 abbonamenti non partono/);
  const w2 = trasforma(modulo12Mini(), { credenziale, bozze: 'id-19' });
  w2.nodes.find((n) => n.name === 'Bozze dei 3 abbonamenti (flusso 19)').parameters.options.waitForSubWorkflow = true;
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

const conSito = (extra = {}) => trasforma(modulo12Mini(), { credenziale, bozze: 'id-19', sito: 'https://mycity.example', credenzialeSito: { id: 'cs', name: 'MyCity - Segreto scheda cliente' }, ...extra });

test("con --sito la scheda va al sito dallo stesso ultimo passo dell'analisi, e se il sito non la prende avvisa", () => {
  const w = conSito({ modalita: 'vero' });
  assert.deepEqual(controlla(w), []);
  assert.deepEqual(w.connections["Prepara l'analisi dell'attività"].main[0].map((v) => v.node), ['Bozze dei 3 abbonamenti (flusso 19)', 'Prepara la scheda per il sito']);
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
  assert.equal(trasforma(modulo12Mini(), { credenziale, bozze: 'id-19' }).nodes.some((n) => n.name === 'Manda la scheda al sito'), false);
});

test('la scheda al sito vuole https e la sua credenziale', () => {
  assert.throws(() => conSito({ sito: 'http://mycity.example' }), /https/);
  assert.match(controlla(conSito({ credenzialeSito: undefined })).join('\n'), /scheda al sito non ha la credenziale/);
});

const PROPOSTA = { ok: true, chiave_proposta: 'bar-roma', sito_ufficiale: 'https://barroma.it', da_confermare: ['orari', 'menu_testo'],
  analisi: { tipo_di_locale: 'bar', pubblico: 'impiegati', tono_consigliato: 'cordiale', punti_di_forza: ['brioche'], idee_contenuti: ['colazione'], cosa_chiedere_al_titolare: ['domenica?'], dubbi: ['due indirizzi diversi'] },
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
  assert.equal(c.analisi.tono_consigliato, 'cordiale');
  assert.deepEqual(c.analisi.dubbi, ['due indirizzi diversi']);
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

test("il 16 non iscrive in MyCity: i nodi dell'iscrizione del 12 restano fuori, coi loro collegamenti", () => {
  const w = trasforma(modulo12Mini(), { credenziale, bozze: 'id-19' });
  assert.deepEqual(controlla(w), []);
  for (const nome of SOLO_NEL_12) {
    assert.equal(w.nodes.some((n) => n.name === nome), false, `«${nome}» non deve esserci`);
    assert.equal(w.connections[nome], undefined);
  }
  const tutti = Object.values(w.connections).flatMap((u) => Object.values(u).flat(2)).filter(Boolean).map((v) => v.node);
  for (const nome of SOLO_NEL_12) assert.equal(tutti.includes(nome), false, `nessun collegamento verso «${nome}»`);
  assert.ok(tutti.includes('Fine: cliente creato'), 'il resto dopo «Avvisa: cliente creato» resta');
});

test('il 16 tiene sempre spenta la ricerca con Claude, anche se nel 12 è accesa', () => {
  const m = modulo12Mini();
  const w = trasforma(m, { credenziale });
  const cfg = w.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments;
  assert.equal(cfg.find((a) => a.name === RICERCA_CON_CLAUDE).value, 'no');
  assert.equal(m.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments.find((a) => a.name === RICERCA_CON_CLAUDE).value, 'si', 'il 12 ricevuto non si tocca');
  cfg.find((a) => a.name === RICERCA_CON_CLAUDE).value = 'si';
  assert.match(controlla(w).join('\n'), /API di Claude a pagamento/);
});

test("quando il 12 fa la ricerca con l'AD, il 16 tiene la ricerca accesa e non paga niente", () => {
  const { flusso: m } = collega(modulo12Mini(), { nodi: [{ nodo: 'Cerca il locale con Claude', cosa: 'la ricerca', forma: 'completa' }], chiediId: 'id-chiedi' });
  const w = trasforma(m, { credenziale });
  const cfg = w.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments;
  assert.equal(cfg.find((a) => a.name === RICERCA_CON_CLAUDE).value, 'si');
  assert.equal(conta([{ ...w, id: '16', active: true }]).totale, 0);
  assert.doesNotMatch(controlla(w).join('\n'), /API di Claude a pagamento/);
  assert.ok(w.nodes.some((n) => n.name === "Chiedi all'AD: la ricerca" && n.parameters.workflowId.value === 'id-chiedi'));
});

test('senza la voce RICERCA_CON_CLAUDE nel 12 il generatore si ferma', () => {
  const m = modulo12Mini();
  const cfg = m.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments;
  cfg.splice(cfg.findIndex((a) => a.name === RICERCA_CON_CLAUDE), 1);
  assert.throws(() => trasforma(m, { credenziale }), /RICERCA_CON_CLAUDE/);
});

test("controlla() vede un nodo dell'iscrizione rimasto nel 16", () => {
  const w = trasforma(modulo12Mini(), { credenziale });
  w.nodes.push({ id: 'x', name: 'Iscrivi in MyCity', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.3, position: [0, 0], parameters: {} });
  assert.match(controlla(w).join('\n'), /iscriverebbe di nuovo in MyCity/);
});

// 25/11/2026 — Nicola: l'analisi subito, la pagella (flusso 18) solo dopo l'abbonamento, e parte dal sito.
test('il 16 non chiama mai il 18; se qualcuno ce lo rimette, il controllo lo dice', () => {
  const w = trasforma(modulo12Mini(), { credenziale, bozze: 'id-19' });
  assert.equal(w.nodes.some((n) => /flusso 18/.test(n.name)), false);
  assert.deepEqual(controlla(w), []);
  w.nodes.push({ id: 'x', name: "Analizza l'attività (flusso 18)", type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.3, position: [0, 0], parameters: {} });
  assert.match(controlla(w).join('\n'), /non deve chiamare il 18/);
});

// --- 25/11/2026: l'analisi del business dell'attività, come l'AD analizza MyCity come azienda -------------

test("con «Chiedi all'AD» il 16 chiede l'analisi del business fra la ricerca e le bozze, mai all'API a pagamento", () => {
  const w = trasforma(modulo12Mini(), { credenziale, bozze: 'id-19', chiedi: 'id-chiedi', sito: 'https://mycity.example', credenzialeSito: { id: 'cs', name: 'MyCity - Segreto scheda cliente' } });
  const nomi = w.nodes.map((n) => n.name);
  for (const n of ["Prepara l'analisi del business", "Per l'AD: analisi del business", "Chiedi all'AD: analisi del business", "Dall'AD: analisi del business", "Unisci l'analisi del business"]) assert.ok(nomi.includes(n), n);
  assert.equal(nomi.includes('Analizza il business con Claude'), false);
  assert.equal(w.nodes.filter((n) => /business/.test(n.name)).some((n) => JSON.stringify(n.parameters).includes('api.anthropic.com')), false);
  assert.equal(w.nodes.find((n) => n.name === "Chiedi all'AD: analisi del business").parameters.workflowId.value, 'id-chiedi');
  assert.deepEqual(w.connections["Prepara l'analisi dell'attività"].main[0].map((v) => v.node), ["Prepara l'analisi del business"]);
  assert.deepEqual(w.connections["Unisci l'analisi del business"].main[0].map((v) => v.node), ['Bozze dei 3 abbonamenti (flusso 19)', 'Prepara la scheda per il sito']);
  assert.deepEqual(controlla(w), []);
  // Senza «Chiedi all'AD» il 16 resta com'era: dalla ricerca alle bozze.
  const senza = trasforma(modulo12Mini(), { credenziale, bozze: 'id-19' });
  assert.equal(senza.nodes.some((n) => /analisi del business/.test(n.name)), false);
});

test("la domanda all'AD tiene i dati fra i tag e chiede una fonte per ogni frase", async () => {
  const [{ json }] = await eseguiCodice(CODICE_PREPARA_BUSINESS, {
    input: [{ json: { id: 'x', nome: 'Bar Roma', scheda: { analisi: { punti_di_forza: ['<istruzione>'] } } } }],
    nodi: { Config: [{ json: { CLAUDE_MODEL: 'm' } }], 'Modulo nuovo cliente': [{ json: { nome_locale: 'Bar Roma', citta: 'Piacenza', appunti: 'Tipo: bar' } }] } });
  assert.equal(json.id, 'x');
  assert.match(json.richiesta.system, /Ogni frase ha la sua fonte/);
  assert.match(json.richiesta.system, /non il marketplace/);
  assert.deepEqual(json.richiesta.output_config.format.schema.required, ['situazione', 'mercato', 'clienti', 'opportunita', 'rischi', 'prime_mosse']);
  assert.equal(json.richiesta.messages[0].content.includes('<istruzione>'), false);
});

test("dall'AD si tiene solo quello che ha una fonte https e niente prezzi, telefoni o email; senza risposta si va avanti", async () => {
  const prima = { id: 'x', nome: 'Bar Roma', scheda: { analisi: { tipo_di_locale: 'bar' } }, richiesta: { model: 'm' } };
  const risposta = { content: [{ text: JSON.stringify({
    situazione: [{ testo: 'Bar storico in centro, aperto dal 1980 secondo il suo sito.', fonte: 'https://barroma.it/chi-siamo' }, { testo: 'Frase senza fonte vera qui dentro.', fonte: 'barroma.it' }],
    mercato: [{ testo: 'Il caffè costa 1,20 euro come dai vicini.', fonte: 'https://x.it' }],
    clienti: [{ testo: 'Scrivete a mario@example.it per prenotare il tavolo.', fonte: 'https://x.it' }],
    opportunita: [], rischi: [], prime_mosse: [{ testo: 'Mettere gli orari giusti sulla scheda Google del bar.', fonte: 'https://maps.google.com/x' }],
  }) }] };
  const [{ json }] = await eseguiCodice(CODICE_UNISCI_BUSINESS, { input: [{ json: risposta }], nodi: { "Prepara l'analisi del business": [{ json: prima }] } });
  assert.equal(json.richiesta, undefined);
  assert.equal(json.scheda.analisi.tipo_di_locale, 'bar');
  assert.deepEqual(json.scheda.analisi.business.situazione, [{ testo: 'Bar storico in centro, aperto dal 1980 secondo il suo sito.', fonte: 'https://barroma.it/chi-siamo' }]);
  assert.deepEqual(json.scheda.analisi.business.mercato, []);
  assert.deepEqual(json.scheda.analisi.business.clienti, []);
  assert.equal(json.scheda.analisi.business.prime_mosse.length, 1);
  assert.equal(json.analisi_business, 'fatta');
  const [{ json: senza }] = await eseguiCodice(CODICE_UNISCI_BUSINESS, { input: [{ json: { error: { message: 'AD: tempo scaduto' } } }], nodi: { "Prepara l'analisi del business": [{ json: prima }] } });
  assert.equal(senza.scheda.analisi.business, undefined);
  assert.match(senza.analisi_business, /non fatta: AD: tempo scaduto/);
});

test("la scheda al sito porta l'analisi del business che arriva dal passo prima", async () => {
  const business = { situazione: [{ testo: 'Bar storico in centro.', fonte: 'https://barroma.it' }], mercato: [], clienti: [], opportunita: [], rischi: [], prime_mosse: [] };
  const [{ json }] = await eseguiCodice(CODICE_SCHEDA_SITO, { input: [{ json: { scheda: { analisi: { business } } } }], nodi: NODI_SCHEDA('vero') });
  assert.deepEqual(json.corpo.analisi.business, business);
  const [{ json: senza }] = await eseguiCodice(CODICE_SCHEDA_SITO, { nodi: NODI_SCHEDA('vero') });
  assert.equal(senza.corpo.analisi.business, undefined);
});

test("un'attività del modulo 12 trova la sua riga Clienti: non si riscrive e l'avviso dice che è normale; il sito del locale arriva", async () => {
  const proposta = { 'Controlla la proposta': [{ json: { doppioni: ['Bar Roma (riga 12)'] } }] };
  const [{ json: dal12 }] = await eseguiCodice(CODICE_PAGINA_4, { nodi: { ...proposta, 'Modulo nuovo cliente': [{ json: { dal_modulo_12: true } }] } });
  assert.equal(dal12.decisione, 'Annulla');
  assert.equal(dal12.dal_modulo_12, true);
  assert.match(dal12.motivo_auto, /modulo 12 poco fa/);
  const [{ json: altro }] = await eseguiCodice(CODICE_PAGINA_4, { nodi: { ...proposta, 'Modulo nuovo cliente': [{ json: {} }] } });
  assert.match(altro.motivo_auto, /possibile doppione/);
  const w = trasforma(modulo12Mini(), { credenziale, bozze: 'id-19' });
  assert.match(w.nodes.find((n) => n.name === 'Fine: annullato').parameters.text, /Normale: l.+ha appena scritta il modulo 12\. Le bozze partono lo stesso\./);
  assert.doesNotMatch(trasforma(modulo12Mini(), { credenziale }).nodes.find((n) => n.name === 'Fine: annullato').parameters.text, /bozze partono/);
  assert.throws(() => trasforma(modulo12Mini(), { credenziale, sito: 'https://mycity.example' }), /serve anche --bozze/);
});

test('dal sito arrivano il sito del locale (solo https) e se l attività l ha iscritta il modulo 12', async () => {
  const [{ json }] = await eseguiCodice(CODICE_RICHIESTA, { input: richiesta({ sito: 'https://barroma.it' }, { provenienza: 'modulo-12' }), statico: {} });
  assert.equal(json.sito, 'https://barroma.it');
  assert.equal(json.dal_modulo_12, true);
  const [{ json: altro }] = await eseguiCodice(CODICE_RICHIESTA, { input: richiesta({ sito: 'http://x.it', id: 'c0b240c0-2a86-4218-9d0f-5154f08ff930' }), statico: {} });
  assert.equal(altro.sito, '');
  assert.equal(altro.dal_modulo_12, false);
});

test("dal secondo collaudo: l'AD può cercare sul web, i voti non sono prezzi, con la ricerca fermata l'analisi del business va al sito", async () => {
  const [{ json: d }] = await eseguiCodice(CODICE_PREPARA_BUSINESS, { input: [{ json: { id: 'x' } }],
    nodi: { Config: [{ json: {} }], 'Modulo nuovo cliente': [{ json: { nome_locale: 'Bar Roma' } }] } });
  assert.ok(d.richiesta.tools.some((t) => t.type.startsWith('web_search')));
  const prima = { id: 'x', scheda: null, richiesta: {} };
  const voto = { content: [{ text: JSON.stringify({ situazione: [], mercato: [], opportunita: [], rischi: [], prime_mosse: [],
    clienti: [{ testo: 'Media 4,6 su 5 da duecento recensioni su Google.', fonte: 'https://maps.google.com/x' }] }) }] };
  const [{ json: u }] = await eseguiCodice(CODICE_UNISCI_BUSINESS, { input: [{ json: voto }], nodi: { "Prepara l'analisi del business": [{ json: prima }] } });
  assert.equal(u.scheda.analisi.business.clienti.length, 1);
  const [{ json: s }] = await eseguiCodice(CODICE_SCHEDA_SITO, { input: [{ json: u }], nodi: NODI_SCHEDA('vero', { ok: false }) });
  assert.equal(s.mandare, true);
  assert.deepEqual(s.corpo.campi, {});
  assert.equal(s.corpo.analisi.business.clienti.length, 1);
});
