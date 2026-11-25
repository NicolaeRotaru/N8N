#!/usr/bin/env node
// 25 · NUMERI DEL MATTINO E DELLA SERA — il piano del mattino (06:00) e il report della sera (18:00)
// che faceva il server dell'AD (cervello/ritmo.sh mattino|sera), spento per sempre il 24/11.
//
// La parte meccanica la fa n8n: legge il database di MyCity in sola lettura e calcola i numeri con lo
// STESSO codice del 17 (17-analisi-marketplace/codice/calcola-numeri.js). Il testo lo scrive l'AD
// tramite il sotto-flusso «Chiedi all'AD» (sessione B, piano Max, nessuna API a pagamento). Se l'AD
// non risponde, a Nicola arrivano i soli numeri, detto chiaramente.
//
// MODALITA «prova» (di serie): calcola, NON accende l'AD (lavoro con «non_mandare») e non manda niente.
//
// Uso: N8N_API_KEY=… node flussi/25-numeri-mattino-sera/costruisci.mjs [--manda] [--vero] [--marketplace <id>] [--scrivi <path>]

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nodoConfig, letturaSupabase, condizione, nodoTelegram, nodoChiediAllAD, impostazioni, controllaBase, principaleComune } from '../comune.mjs';
import { LETTURE } from '../17-analisi-marketplace/costruisci.mjs';

export const NOME_25 = '25 · Numeri del mattino e della sera';
const QUI = dirname(fileURLToPath(import.meta.url));
const codice = (nome) => readFileSync(join(QUI, 'codice', nome), 'utf8');
const calcolo17 = () => readFileSync(join(QUI, '..', '17-analisi-marketplace', 'codice', 'calcola-numeri.js'), 'utf8');

export function costruisci({ telegram, chatId, marketplace, errorWorkflow, chiedi, vero = false } = {}) {
  const pos = (i, riga = 0) => [i * 220, riga * 200];
  const nodi = [];
  const collega = {};
  const vai = (da, ...verso) => { collega[da] = { main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) }; };
  nodi.push(
    { id: randomUUID(), name: 'Alle 6 e alle 18', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(0, -1),
      parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 6,18 * * *' }] } } },
    { id: randomUUID(), name: 'Avvia a mano', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0, 1), parameters: {} },
    nodoConfig([
      ['MODALITA', vero ? 'vero' : 'prova'],
      // vuoto = dall'ora (prima di mezzogiorno mattino, dopo sera); «mattino» o «sera» per provarlo a mano.
      ['MOMENTO', ''],
      ['SUPABASE_URL', 'https://clmpyfvpvfjgeviworth.supabase.co'],
      ['SITO_URL', 'https://www.mycity-marketplace.com'],
      ['TELEGRAM_CHAT_ID', chatId || 'DA_IMPOSTARE'],
      // Le voci che il calcolo del 17 legge, con gli stessi valori del 17.
      ['NEGOZI_IN_ATTESA', 'c0b240c0-2a86-4218-9d0f-5154f08ff929:2026-11-30'],
      ['ORE_ORDINE_FERMO', 2], ['ORE_PAYOUT', 24], ['ORE_CARRELLO', 4], ['GIORNI_NEGOZIO_FERMO', 14],
      ['CALO_SOGLIA', 0.7], ['CALO_MEDIA_MINIMA', 3],
    ], pos(1)),
  );
  vai('Alle 6 e alle 18', 'Config');
  vai('Avvia a mano', 'Config');
  let prima = 'Config';
  let i = 2;
  for (const [nome, percorso] of LETTURE) { nodi.push(letturaSupabase(nome, percorso, pos(i++), marketplace)); vai(prima, nome); prima = nome; }
  const lead = letturaSupabase('Leggi i lead dei negozi', 'merchants_leads?select=*', pos(i++), marketplace);
  lead.parameters.method = 'HEAD';
  nodi.push(lead); vai(prima, lead.name); prima = lead.name;
  for (const [nome, percorso] of [['Guarda il sito', '/'], ['Guarda il controllo «pronto»', '/api/health/ready']]) {
    nodi.push({ id: randomUUID(), name: nome, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(i++), executeOnce: true, onError: 'continueRegularOutput',
      parameters: { method: 'GET', url: `={{ $('Config').first().json.SITO_URL }}${percorso}`,
        options: { response: { response: { fullResponse: true, neverError: true, responseFormat: 'text' } }, timeout: 20000 } } });
    vai(prima, nome); prima = nome;
  }
  nodi.push({ id: randomUUID(), name: 'Calcola i numeri', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(i++), parameters: { jsCode: calcolo17() } });
  vai(prima, 'Calcola i numeri');
  nodi.push({ id: randomUUID(), name: 'Prepara il lavoro', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(i++), parameters: { jsCode: codice('prepara-lavoro.js') } });
  vai('Calcola i numeri', 'Prepara il lavoro');
  nodi.push(nodoChiediAllAD('Chiedi il testo all’AD', chiedi, pos(i++)));
  vai('Prepara il lavoro', 'Chiedi il testo all’AD');
  nodi.push({ id: randomUUID(), name: 'Componi il messaggio', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(i++), parameters: { jsCode: codice('componi.js') } });
  vai('Chiedi il testo all’AD', 'Componi il messaggio');
  nodi.push({ id: randomUUID(), name: 'Da mandare?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(i++),
    parameters: condizione("={{ $('Componi il messaggio').first().json.manda === true }}") });
  vai('Componi il messaggio', 'Da mandare?');
  nodi.push(nodoTelegram('Manda a Nicola', "={{ $('Componi il messaggio').first().json.messaggio }}", pos(i++, -1), telegram));
  vai('Da mandare?', 'Manda a Nicola');
  nodi.push({ id: randomUUID(), name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -600],
    parameters: { width: 760, height: 340, content: [
      '## 25 · Numeri del mattino e della sera',
      '',
      "**Cosa fa.** Alle 6 il piano del mattino, alle 18 il report della sera. I numeri li calcola il codice del 17 (sola lettura sul database); il testo lo scrive l'AD tramite «Chiedi all'AD». Se l'AD non risponde, arrivano i soli numeri.",
      '',
      "**MODALITA.** In «prova» calcola ma non accende l'AD e non manda niente. «vero» per accenderlo.",
      '',
      '**Generato** da `N8N/flussi/25-numeri-mattino-sera/costruisci.mjs`: il calcolo è quello del 17, si cambia lì.',
    ].join('\n') } });
  return { name: NOME_25, nodes: nodi, connections: collega, settings: impostazioni(errorWorkflow) };
}

export const controlla = (w) => controllaBase(w);

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principaleComune(process.argv.slice(2), { nome: '25', costruisci, controlla, conMarketplace: true, famiglia: '2x marketplace' })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
