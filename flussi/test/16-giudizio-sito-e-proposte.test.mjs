// 25/11/2026 — Il 16 chiede all'AD anche il giudizio del sito e lega le opportunità a un servizio.
// Nicola, «ok sito»: il sito si offre solo dove vale di più (lavoro A) e l'analisi del business diventa proposte
// (lavoro B). Il contratto è quello del sito, `leggiGiudizioSito` e `analisiAziendale` in mycity
// (lib/agenzia/offerta-su-misura.ts e lib/agenzia/analisi.ts):
//  · analisi.giudizio_sito = { livello: semplice|medio|pregio, funzioni: [elenco chiuso], migliorie, aspetto, pagine, nota };
//  · nelle opportunità e nelle prime mosse, facoltativi: servizio (foto_video|sito_web|social|analisi) e proposta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCodice } from './esegui-codice.mjs';
import { CODICE_PREPARA_BUSINESS, CODICE_UNISCI_BUSINESS, CODICE_SCHEDA_SITO } from '../16-nuovo-cliente-da-mycity/genera.mjs';

const NODI = { Config: [{ json: { CLAUDE_MODEL: 'm' } }], 'Modulo nuovo cliente': [{ json: { nome_locale: 'Trattoria Roma', citta: 'Piacenza', sito: 'https://trattoriaroma.it' } }] };
const prima = { id: 'x', scheda: { analisi: { tipo_di_locale: 'ristorante' } }, richiesta: {} };
const unisci = async (risposta) => (await eseguiCodice(CODICE_UNISCI_BUSINESS, { input: [{ json: { content: [{ text: JSON.stringify(risposta) }] } }], nodi: { "Prepara l'analisi del business": [{ json: prima }] } }))[0].json;
const vuota = { situazione: [], mercato: [], clienti: [], opportunita: [], rischi: [], prime_mosse: [] };

test("la domanda all'AD chiede il giudizio del sito e il servizio di ogni opportunità, col sito del locale fra i dati", async () => {
  const [{ json }] = await eseguiCodice(CODICE_PREPARA_BUSINESS, { input: [{ json: { id: 'x' } }], nodi: NODI });
  const schema = json.richiesta.output_config.format.schema;
  assert.ok(schema.required.includes('giudizio_sito'));
  const g = schema.properties.giudizio_sito;
  assert.deepEqual(g.properties.livello.enum, ['semplice', 'medio', 'pregio', null]);
  assert.deepEqual(g.properties.funzioni.items.enum, ['prenotazioni', 'negozio_online', 'piu_lingue', 'blog', 'menu', 'galleria', 'modulo_contatti', 'area_clienti']);
  const mossa = schema.properties.opportunita.items;
  assert.deepEqual(mossa.properties.servizio.enum, ['foto_video', 'sito_web', 'social', 'analisi', null]);
  assert.ok(schema.properties.prime_mosse.items.properties.proposta);
  assert.ok(!schema.properties.situazione.items.properties.servizio, 'solo opportunità e prime mosse portano un servizio');
  assert.match(json.richiesta.system, /semplice.*medio.*pregio/s);
  assert.match(json.richiesta.system, /migliorie/);
  assert.match(json.richiesta.messages[0].content, /trattoriaroma\.it/);
});

test("dall'AD: il giudizio del sito si tiene solo coi valori dell'elenco, e va nella scheda", async () => {
  const j = await unisci({ ...vuota,
    situazione: [{ testo: 'Trattoria in centro da trent’anni, secondo il suo sito.', fonte: 'https://trattoriaroma.it' }],
    giudizio_sito: { livello: 'pregio', funzioni: ['prenotazioni', 'teletrasporto'], migliorie: 'Le prenotazioni dal telefono e il menu in inglese', aspetto: 'curato', pagine: 'molte', nota: null } });
  assert.deepEqual(j.scheda.analisi.giudizio_sito, { livello: 'pregio', funzioni: ['prenotazioni'], migliorie: 'Le prenotazioni dal telefono e il menu in inglese', aspetto: 'curato', pagine: 'molte', nota: null });
  // un livello fuori elenco o migliorie con un prezzo non passano
  const k = await unisci({ ...vuota, situazione: [{ testo: 'Trattoria in centro da trent’anni.', fonte: 'https://trattoriaroma.it' }],
    giudizio_sito: { livello: 'stupendo', funzioni: [], migliorie: 'Rifarlo costa 3.000 euro', aspetto: null, pagine: null, nota: null } });
  assert.equal(k.scheda.analisi.giudizio_sito, undefined);
  // senza sito: tutto nullo, niente giudizio
  const n = await unisci({ ...vuota, situazione: [{ testo: 'Trattoria in centro da trent’anni.', fonte: 'https://trattoriaroma.it' }],
    giudizio_sito: { livello: null, funzioni: [], migliorie: null, aspetto: null, pagine: null, nota: null } });
  assert.equal(n.scheda.analisi.giudizio_sito, undefined);
});

test("dall'AD: servizio e proposta restano solo nelle opportunità e nelle prime mosse, e solo puliti", async () => {
  const j = await unisci({ ...vuota,
    situazione: [{ testo: 'Trattoria in centro da trent’anni.', fonte: 'https://trattoriaroma.it', servizio: 'social', proposta: 'Non deve restare qui dentro' }],
    opportunita: [
      { testo: 'Il menu del pranzo non è in rete, e lo cercano in tanti.', fonte: 'https://www.tripadvisor.it/x', servizio: 'social', proposta: 'Mettiamo il menu del pranzo su Google e Instagram ogni settimana' },
      { testo: 'Nessuna foto dei piatti nelle recensioni più lette.', fonte: 'https://www.tripadvisor.it/z', servizio: 'foto_video', proposta: 'Costa 100 euro fotografare i piatti' },
      { testo: 'Un concorrente vicino ha chiuso a settembre.', fonte: 'https://www.ilpiacenza.it/y', servizio: 'cucina', proposta: 'Apriamo un secondo locale insieme' },
    ],
    prime_mosse: [{ testo: 'Raccogliere le prenotazioni dal sito, oggi solo per telefono.', fonte: 'https://trattoriaroma.it', servizio: 'sito_web', proposta: 'Mettiamo il pulsante «Prenota» sul tuo sito' }],
  });
  const b = j.scheda.analisi.business;
  assert.deepEqual(b.situazione[0], { testo: 'Trattoria in centro da trent’anni.', fonte: 'https://trattoriaroma.it' });
  assert.equal(b.opportunita[0].servizio, 'social');
  assert.equal(b.opportunita[0].proposta, 'Mettiamo il menu del pranzo su Google e Instagram ogni settimana');
  // la frase resta, ma senza servizio e proposta, se la proposta ha un prezzo o il servizio non è nostro
  assert.deepEqual(b.opportunita[1], { testo: 'Nessuna foto dei piatti nelle recensioni più lette.', fonte: 'https://www.tripadvisor.it/z' });
  assert.deepEqual(b.opportunita[2], { testo: 'Un concorrente vicino ha chiuso a settembre.', fonte: 'https://www.ilpiacenza.it/y' });
  assert.equal(b.prime_mosse[0].servizio, 'sito_web');
});

test('la scheda al sito porta il giudizio del sito, anche quando la ricerca non è arrivata in fondo', async () => {
  const j = await unisci({ ...vuota, situazione: [{ testo: 'Trattoria in centro da trent’anni.', fonte: 'https://trattoriaroma.it' }],
    giudizio_sito: { livello: 'semplice', funzioni: [], migliorie: null, aspetto: 'datato', pagine: 'una', nota: null } });
  const nodi = { Config: [{ json: { MODALITA: 'vero' } }], 'Modulo nuovo cliente': [{ json: { id_mycity: 'c0b240c0-2a86-4218-9d0f-5154f08ff929', nome_locale: 'Trattoria Roma' } }], 'Controlla la proposta': [{ json: { ok: false } }] };
  const [{ json: s }] = await eseguiCodice(CODICE_SCHEDA_SITO, { input: [{ json: j }], nodi });
  assert.equal(s.mandare, true);
  assert.equal(s.corpo.analisi.giudizio_sito.livello, 'semplice');
});
