#!/usr/bin/env node
// 23 · MANI DEL PANNELLO — le azioni che Nicola approva nel Pannello dell'AD le esegue n8n.
//
// 25/11/2026 — Prima le eseguiva il worker del server dell'AD, spento per sempre il 24/11. Il
// Pannello (pannello/src/lib/mani-n8n.ts in ad-mycity) manda l'azione approvata a questo webhook,
// col segreto nell'intestazione x-mycity-segreto, e aspetta la risposta { stato, dettaglio }.
//
// Le regole: un'azione 🔴 parte SOLO se firmata da Nicola (firmata_da = nicola), mai da sola;
// la stessa azione una volta sola; oggi l'unico canale collegato è «telegram» (un messaggio a
// Nicola) — gli altri restano in coda col motivo; in MODALITA «prova» niente parte.
//
// Uso: N8N_API_KEY=… node flussi/23-mani-pannello/costruisci.mjs [--manda] [--vero] --segreto <id credenziale Header Auth> [--scrivi <path>]

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nodoConfig, condizione, nodoTelegram, impostazioni, controllaBase, pezziDaN8n } from '../comune.mjs';

export const NOME_23 = '23 · Mani del Pannello';
export const PERCORSO_WEBHOOK_23 = 'mycity-mani';
export const NOME_SEGRETO_23 = 'MyCity - Segreto mani del Pannello';
const QUI = dirname(fileURLToPath(import.meta.url));
const codice = (nome) => readFileSync(join(QUI, 'codice', nome), 'utf8');

export function costruisci({ telegram, chatId, errorWorkflow, segreto, webhookId, vero = false } = {}) {
  const pos = (i, riga = 0) => [i * 220, riga * 200];
  const nodi = [];
  const collega = {};
  const vai = (da, ...verso) => { collega[da] = { main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) }; };
  nodi.push(
    { id: randomUUID(), name: "Ricevi la richiesta", type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos(0), webhookId: webhookId || randomUUID(),
      parameters: { httpMethod: 'POST', path: PERCORSO_WEBHOOK_23, authentication: 'headerAuth', responseMode: 'responseNode', options: {} },
      credentials: { httpHeaderAuth: segreto ? { id: segreto, name: NOME_SEGRETO_23 } : { id: 'DA_IMPOSTARE', name: NOME_SEGRETO_23 } } },
    nodoConfig([['MODALITA', vero ? 'vero' : 'prova'], ['TELEGRAM_CHAT_ID', chatId || 'DA_IMPOSTARE']], pos(1)),
    { id: randomUUID(), name: "Controlla la richiesta", type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(2), parameters: { jsCode: codice('controlla-azione.js') } },
    { id: randomUUID(), name: 'Da mandare su Telegram?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(3),
      parameters: condizione("={{ $('Controlla la richiesta').first().json.esegui === 'telegram' }}") },
    nodoTelegram('Manda con Telegram', "={{ $('Controlla la richiesta').first().json.messaggio }}", pos(4, -1), telegram),
    { id: randomUUID(), name: 'Prepara la risposta', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(5), parameters: { jsCode: codice('esito.js') } },
    { id: randomUUID(), name: 'Rispondi al Pannello', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: pos(6),
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} } },
  );
  vai("Ricevi la richiesta", 'Config');
  vai('Config', "Controlla la richiesta");
  vai("Controlla la richiesta", 'Da mandare su Telegram?');
  vai('Da mandare su Telegram?', 'Manda con Telegram', 'Prepara la risposta');
  vai('Manda con Telegram', 'Prepara la risposta');
  vai('Prepara la risposta', 'Rispondi al Pannello');
  nodi.push({ id: randomUUID(), name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -560],
    parameters: { width: 760, height: 320, content: [
      '## 23 · Mani del Pannello',
      '',
      "**Cosa fa.** Riceve dal Pannello dell'AD le azioni approvate e le esegue. Oggi l'unico canale collegato è «telegram» (un messaggio a Nicola); gli altri tornano «in coda» col motivo.",
      '',
      "**Regole.** Un'azione 🔴 parte SOLO se firmata da Nicola. La stessa azione una volta sola. In MODALITA «prova» niente parte (risposta «simulata»).",
      '',
      '**Per accenderlo.** Credenziale «MyCity - Segreto mani del Pannello» (Header Auth, nome x-mycity-segreto) con lo stesso valore di N8N_WEBHOOK_SEGRETO nel Pannello; N8N_WEBHOOK_URL = indirizzo di produzione di questo webhook.',
      '',
      '**Generato** da `N8N/flussi/23-mani-pannello/costruisci.mjs`.',
    ].join('\n') } });
  return { name: NOME_23, nodes: nodi, connections: collega, settings: impostazioni(errorWorkflow) };
}

export function controlla(w) {
  const problemi = controllaBase(w);
  const webhook = w.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
  if (!webhook || webhook.parameters.authentication !== 'headerAuth') problemi.push('il webhook non chiede il segreto');
  if (!w.nodes.some((n) => n.type === 'n8n-nodes-base.respondToWebhook')) problemi.push('il Pannello non riceve risposta');
  // Le sole mani di questo flusso: Telegram verso la chat di Nicola nel Config.
  for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.telegram')) {
    if (!String(n.parameters.chatId).includes("$('Config')")) problemi.push(`«${n.name}» scrive a una chat che non è quella di Nicola`);
  }
  return problemi;
}

async function principale(argv) {
  const valore = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  let pezzi = { segreto: valore('--segreto'), vero: argv.includes('--vero') };
  let api = null;
  if (argv.includes('--manda')) {
    api = await import('../n8n-api.mjs');
    const p = await pezziDaN8n(api);
    const gia = p.elenco.find((w) => w.name === NOME_23);
    pezzi = { ...pezzi, ...p, webhookId: gia?.nodes?.find((n) => n.type === 'n8n-nodes-base.webhook')?.webhookId,
      segreto: pezzi.segreto || gia?.nodes?.find((n) => n.type === 'n8n-nodes-base.webhook')?.credentials?.httpHeaderAuth?.id };
  }
  const w = costruisci(pezzi);
  if (valore('--scrivi')) (await import('node:fs')).writeFileSync(valore('--scrivi'), JSON.stringify(w, null, 2));
  const problemi = controlla(w).filter((p) => api || !/credenziale|chat Telegram|99 · Avvisi errori/.test(p));
  if (problemi.length) { console.error('Il 23 non va bene:\n- ' + problemi.join('\n- ')); process.exit(1); }
  console.log(`23 costruito: ${w.nodes.length} nodi, controlli a posto.`);
  if (api) {
    const esito = await api.creaOAggiorna(w);
    console.log(`${esito.creato ? 'Creato' : 'Aggiornato'} su n8n: id ${esito.id}, ${esito.attivo ? 'ACCESO' : 'spento'}.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principale(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
