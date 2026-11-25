#!/usr/bin/env node
// 98 · SALUTE DI n8n — quali flussi sono accesi, quando hanno girato bene l'ultima volta e quali
// sono falliti nelle ultime 24 ore. Lo chiama il 17 ogni mattina alle 8:10 e mette il testo in
// fondo al messaggio a Nicola. Si può anche avviare a mano.
//
// Legge l'API di n8n stessa, in sola lettura (GET), con la credenziale «n8n - API (lettura)»:
// un'intestazione X-N8N-API-KEY con una chiave creata in n8n → Settings → n8n API.
//
// Uso: N8N_API_KEY=… node flussi/98-salute-n8n/costruisci.mjs [--manda] [--scrivi <path>]

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nodoConfig, impostazioni, controllaBase, principaleComune } from '../comune.mjs';

export const NOME_98 = '98 · Salute di n8n';
export const CREDENZIALE_N8N = { id: 'SEGNAPOSTO_N8N_API', name: 'n8n - API (lettura)' };
const QUI = dirname(fileURLToPath(import.meta.url));
const codice = (nome) => readFileSync(join(QUI, 'codice', nome), 'utf8');

export function costruisci({ errorWorkflow, credenzialeN8n } = {}) {
  const cred = credenzialeN8n || CREDENZIALE_N8N;
  const pos = (i, riga = 0) => [i * 220, riga * 200];
  const nodi = [];
  const collega = {};
  const vai = (da, ...verso) => { collega[da] = { main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) }; };
  const api = (nome, url, i, perOgni) => ({
    id: randomUUID(), name: nome, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(i),
    ...(perOgni ? {} : { executeOnce: true }), onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000,
    parameters: { method: 'GET', url, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 30000 } },
    credentials: { httpHeaderAuth: cred },
  });
  nodi.push(
    { id: randomUUID(), name: 'Chiamato da un altro flusso', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1, position: pos(0, -1),
      parameters: { inputSource: 'passthrough' } },
    { id: randomUUID(), name: 'Avvia a mano', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0, 1), parameters: {} },
    nodoConfig([['N8N_URL', 'https://n8n-shdy.sliplane.app'], ['ORE_FINESTRA', 24], ['ORE_SENZA_GIRO_BUONO', 48]], pos(1)),
  );
  vai('Chiamato da un altro flusso', 'Config');
  vai('Avvia a mano', 'Config');
  const base = "={{ $('Config').first().json.N8N_URL }}/api/v1";
  nodi.push(api('Leggi i flussi', `${base}/workflows?limit=250`, 2));
  vai('Config', 'Leggi i flussi');
  nodi.push({ id: randomUUID(), name: 'Un elemento per flusso acceso', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(3),
    parameters: { jsCode: codice('elenca-flussi.js') } });
  vai('Leggi i flussi', 'Un elemento per flusso acceso');
  nodi.push(api('Ultimo giro buono', `${base}/executions?status=success&limit=1&workflowId={{ $('Un elemento per flusso acceso').item.json.id }}`, 4, true));
  vai('Un elemento per flusso acceso', 'Ultimo giro buono');
  nodi.push(api('Giri falliti', `${base}/executions?status=error&limit=50&workflowId={{ $('Un elemento per flusso acceso').item.json.id }}`, 5, true));
  vai('Ultimo giro buono', 'Giri falliti');
  nodi.push({ id: randomUUID(), name: 'Componi la salute', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(6),
    parameters: { jsCode: codice('componi-salute.js') } });
  vai('Giri falliti', 'Componi la salute');
  nodi.push({ id: randomUUID(), name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -560],
    parameters: { width: 700, height: 300, content: [
      '## 98 · Salute di n8n',
      '',
      "**Cosa fa.** Elenca i flussi accesi; per ciascuno l'ultimo giro buono e i giri falliti nelle ultime 24 ore. Lo chiama il 17 alle 8:10: il testo finisce in fondo al messaggio a Nicola.",
      '',
      '**Per accenderlo.** Crea in n8n una chiave (Settings → n8n API) e mettila nella credenziale «n8n - API (lettura)», tipo Header Auth, nome X-N8N-API-KEY.',
      '',
      '**Generato** da `N8N/flussi/98-salute-n8n/costruisci.mjs`.',
    ].join('\n') } });
  // Le esecuzioni buone del 98 non servono: le salva solo quando fallisce.
  return { name: NOME_98, nodes: nodi, connections: collega, settings: impostazioni(errorWorkflow) };
}

export const controlla = (w) => controllaBase(w);

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principaleComune(process.argv.slice(2), { nome: '98', costruisci, controlla, famiglia: '9x sistema' })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
