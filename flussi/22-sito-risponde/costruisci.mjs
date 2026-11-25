#!/usr/bin/env node
// 22 · SITO CHE RISPONDE — ogni 5 minuti guarda la pagina iniziale di MyCity e il controllo
// «pronto» del sito. Avvisa Nicola su Telegram solo quando lo stato cambia (su · degradato · giù).
//
// 25/11/2026 — era un lavoro del server dell'AD (mycity-monitora), spento per sempre il 24/11.
// Niente IA, niente database: due richieste GET al sito pubblico.
//
// Uso: N8N_API_KEY=… node flussi/22-sito-risponde/costruisci.mjs [--manda] [--vero] [--scrivi <path>]

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nodoConfig, condizione, nodoTelegram, impostazioni, controllaBase, principaleComune } from '../comune.mjs';

export const NOME_22 = '22 · Sito che risponde';
const QUI = dirname(fileURLToPath(import.meta.url));

export function costruisci({ telegram, chatId, errorWorkflow, vero = false } = {}) {
  const pos = (i, riga = 0) => [i * 220, riga * 200];
  const nodi = [];
  const collega = {};
  const vai = (da, ...verso) => { collega[da] = { main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) }; };
  nodi.push(
    { id: randomUUID(), name: 'Ogni 5 minuti', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(0, -1),
      parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } },
    { id: randomUUID(), name: 'Avvia a mano', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0, 1), parameters: {} },
    nodoConfig([
      ['MODALITA', vero ? 'vero' : 'prova'],
      ['SITO_URL', 'https://www.mycity-marketplace.com'],
      ['TELEGRAM_CHAT_ID', chatId || 'DA_IMPOSTARE'],
      ['CONFERME_GIU', 2],
    ], pos(1)),
  );
  vai('Ogni 5 minuti', 'Config');
  vai('Avvia a mano', 'Config');
  let prima = 'Config';
  let i = 2;
  for (const [nome, percorso] of [['Guarda la pagina iniziale', '/'], ['Guarda il controllo «pronto»', '/api/health/ready']]) {
    nodi.push({ id: randomUUID(), name: nome, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(i++),
      executeOnce: true, onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 5000,
      parameters: { method: 'GET', url: `={{ $('Config').first().json.SITO_URL }}${percorso}`,
        options: { response: { response: { fullResponse: true, neverError: true, responseFormat: 'text' } }, timeout: 20000 } } });
    vai(prima, nome); prima = nome;
  }
  nodi.push({ id: randomUUID(), name: 'Valuta il sito', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(i++),
    parameters: { jsCode: readFileSync(join(QUI, 'codice', 'valuta-sito.js'), 'utf8') } });
  vai(prima, 'Valuta il sito');
  nodi.push({ id: randomUUID(), name: 'Stato cambiato?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(i++),
    parameters: condizione("={{ $('Valuta il sito').first().json.manda === true }}") });
  vai('Valuta il sito', 'Stato cambiato?');
  nodi.push(nodoTelegram('Avvisa Nicola', "={{ $('Valuta il sito').first().json.messaggio }}", pos(i++, -1), telegram));
  vai('Stato cambiato?', 'Avvisa Nicola');
  nodi.push({ id: randomUUID(), name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -560],
    parameters: { width: 700, height: 300, content: [
      '## 22 · Sito che risponde',
      '',
      '**Cosa fa.** Ogni 5 minuti apre la pagina iniziale di MyCity e il controllo «pronto» del sito (/api/health/ready). Stati: su · degradato (lavori automatici fermi) · giù (2 controlli falliti di fila).',
      '',
      '**Quando scrive.** Solo quando lo stato cambia, o cambia l\'elenco dei lavori fermi; solo con MODALITA = vero.',
      '',
      '**Generato** da `N8N/flussi/22-sito-risponde/costruisci.mjs`: le modifiche vanno fatte lì.',
    ].join('\n') } });
  return { name: NOME_22, nodes: nodi, connections: collega, settings: impostazioni(errorWorkflow) };
}

export const controlla = (w) => controllaBase(w);

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principaleComune(process.argv.slice(2), { nome: '22', costruisci, controlla, famiglia: '2x marketplace' })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
