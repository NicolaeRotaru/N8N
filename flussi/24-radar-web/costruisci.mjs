#!/usr/bin/env node
// 24 · RADAR DEL WEB — il monitoraggio del web che faceva il server dell'AD alle 6:30
// (cervello/monitora.sh), spento per sempre il 24/11.
//
// La parte meccanica la fa n8n: scarica le fonti del radar (codice/fonti.json, copia di
// ad-mycity/cervello/radar-fonti.json senza la ricerca Google), ne estrae i titoli e tiene solo quelli
// nuovi. Cosa conta per MyCity lo dice l'AD tramite «Chiedi all'AD». Se l'AD non risponde, a Nicola
// arrivano i titoli nuovi per fonte. Nessun messaggio se non c'è niente di nuovo.
//
// Uso: N8N_API_KEY=… node flussi/24-radar-web/costruisci.mjs [--manda] [--vero] [--scrivi <path>]

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nodoConfig, condizione, nodoTelegram, nodoChiediAllAD, impostazioni, controllaBase, principaleComune } from '../comune.mjs';

export const NOME_24 = '24 · Radar del web';
const QUI = dirname(fileURLToPath(import.meta.url));
const codice = (nome) => readFileSync(join(QUI, 'codice', nome), 'utf8');
export const FONTI_24 = JSON.parse(codice('fonti.json'));

export function costruisci({ telegram, chatId, errorWorkflow, chiedi, vero = false } = {}) {
  const pos = (i, riga = 0) => [i * 220, riga * 200];
  const nodi = [];
  const collega = {};
  const vai = (da, ...verso) => { collega[da] = { main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) }; };
  nodi.push(
    { id: randomUUID(), name: 'Ogni mattina alle 6:30', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(0, -1),
      parameters: { rule: { interval: [{ field: 'cronExpression', expression: '30 6 * * *' }] } } },
    { id: randomUUID(), name: 'Avvia a mano', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0, 1), parameters: {} },
    nodoConfig([['MODALITA', vero ? 'vero' : 'prova'], ['TELEGRAM_CHAT_ID', chatId || 'DA_IMPOSTARE'], ['TUTTE_LE_FONTI', 'no']], pos(1)),
    { id: randomUUID(), name: 'Le fonti di oggi', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(2),
      parameters: { jsCode: codice('fonti-di-oggi.js').replace('__FONTI__', JSON.stringify(FONTI_24)) } },
    { id: randomUUID(), name: 'Scarica le fonti', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(3),
      onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000,
      parameters: { method: 'GET', url: '={{ $json.url }}', sendHeaders: true,
        headerParameters: { parameters: [{ name: 'User-Agent', value: 'Mozilla/5.0 (compatible; radar-mycity/1.0)' }, { name: 'Accept-Language', value: 'it-IT,it' }] },
        options: { batching: { batch: { batchSize: 3, batchInterval: 1000 } }, response: { response: { fullResponse: true, neverError: true, responseFormat: 'text' } }, timeout: 20000 } } },
    { id: randomUUID(), name: 'Estrai i titoli', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(4), parameters: { jsCode: codice('estrai-titoli.js') } },
    { id: randomUUID(), name: 'Prepara il lavoro', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(5), parameters: { jsCode: codice('prepara-lavoro.js') } },
    nodoChiediAllAD('Chiedi all’AD cosa conta', chiedi, pos(6)),
    { id: randomUUID(), name: 'Componi il messaggio', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(7), parameters: { jsCode: codice('componi.js') } },
    { id: randomUUID(), name: 'Da mandare?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(8),
      parameters: condizione("={{ $('Componi il messaggio').first().json.manda === true }}") },
    nodoTelegram('Manda a Nicola', "={{ $('Componi il messaggio').first().json.messaggio }}", pos(9, -1), telegram),
  );
  const fila = ['Config', 'Le fonti di oggi', 'Scarica le fonti', 'Estrai i titoli', 'Prepara il lavoro', 'Chiedi all’AD cosa conta', 'Componi il messaggio', 'Da mandare?'];
  vai('Ogni mattina alle 6:30', 'Config');
  vai('Avvia a mano', 'Config');
  for (let k = 0; k < fila.length - 1; k++) vai(fila[k], fila[k + 1]);
  vai('Da mandare?', 'Manda a Nicola');
  // «Estrai i titoli» deve girare UNA volta su tutte le pagine, non una per pagina.
  nodi.find((n) => n.name === 'Estrai i titoli').executeOnce = true;
  nodi.push({ id: randomUUID(), name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -600],
    parameters: { width: 760, height: 320, content: [
      '## 24 · Radar del web',
      '',
      "**Cosa fa.** Alle 6:30 scarica le fonti del radar dell'AD (giornali locali, Comune, Camera di Commercio, associazioni, concorrenti, eventi, meteo; le settimanali il lunedì), tiene i titoli nuovi e chiede all'AD cosa conta per MyCity.",
      '',
      "**Quando scrive.** Solo con MODALITA = vero e solo se ci sono titoli nuovi o fonti non lette.",
      '',
      '**Generato** da `N8N/flussi/24-radar-web/costruisci.mjs`. Le fonti stanno in `codice/fonti.json`.',
    ].join('\n') } });
  return { name: NOME_24, nodes: nodi, connections: collega, settings: impostazioni(errorWorkflow) };
}

export const controlla = (w) => controllaBase(w);

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principaleComune(process.argv.slice(2), { nome: '24', costruisci, controlla, famiglia: '2x marketplace' })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
