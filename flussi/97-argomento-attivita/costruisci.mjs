#!/usr/bin/env node
// 97 · SCRIVI NELL'ARGOMENTO DELL'ATTIVITÀ — ogni negozio ha il suo argomento nel gruppo Telegram «Attività».
//
// 25/11/2026 — Nicola: «voglio avere una chat telegram per funzioni diverse… diviso per raggruppamenti,
// tipo: nome dell'attività, le ultime informazioni recuperate»; poi «fai la B, un solo posto per attività»
// e, per aprire gli argomenti, «1 Officina».
//
// Come è montato: chi ha messaggi su un negozio (l'analisi, le bozze, più avanti l'iscrizione e i social) chiama questo
// flusso con una voce per messaggio: { id, nome, messaggio }. Questo flusso:
//   · cerca l'argomento del negozio nella tabella «Argomenti delle attività» (id MyCity + gruppo);
//   · se non c'è, lo fa aprire all'officina (POST /telegram/argomento: la chiave del bot sta lì, perché la
//     richiesta HTTP di n8n non sa usare la credenziale del bot) e lo segna nella tabella;
//   · manda i messaggi nell'argomento.
// Senza il gruppo nel Config (CHAT_ATTIVITA vuoto) i messaggi vanno nella chat privata, come prima. Se
// l'officina non apre l'argomento, vanno nello spazio generale del gruppo col nome del negozio in testa.
//
// Uso: N8N_API_KEY=… node flussi/97-argomento-attivita/costruisci.mjs --manda
//      node flussi/97-argomento-attivita/costruisci.mjs --sdk <file> --telegram <id> --chat <id> --officina <id> [--gruppo <id>] [--tabella <id>]
//   --chat      la chat privata di Nicola (dove si va finché il gruppo non c'è)
//   --gruppo    il gruppo «Attività» con gli argomenti (numero -100…); vuoto = chat privata
//   --officina  la credenziale «Officina - Chiave»
//   --tabella   l'id della tabella dati; senza, si cerca per nome

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NOMI, trovaFlusso } from '../nomi.mjs';

export const NOME_97 = NOMI.argomentoAttivita;
export const NOME_TABELLA = 'Argomenti delle attività';
export const COLONNE_TABELLA = [['id_attivita', 'string'], ['nome', 'string'], ['thread_id', 'number'], ['chat_id', 'string']];
const QUI = dirname(fileURLToPath(import.meta.url));
const codice = (nome) => readFileSync(join(QUI, 'codice', nome), 'utf8');
const NOME_TELEGRAM = 'Telegram - Bot agenzia';
const NOME_OFFICINA = 'Officina - Chiave';
const R = "$('Raccogli i messaggi').first().json";

export function costruisci({ telegram, chatId, gruppo, officina, tabella } = {}) {
  const pos = (i, riga = 0) => [i * 220, riga * 200];
  const nodi = [];
  const collega = {};
  const vai = (da, ...verso) => { collega[da] = { main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) }; };
  const credTelegram = telegram || { id: 'DA_IMPOSTARE', name: NOME_TELEGRAM };
  const laTabella = tabella ? { __rl: true, mode: 'id', value: tabella } : { __rl: true, mode: 'name', value: NOME_TABELLA };
  const se = (nome, posizione, expr) => ({ id: randomUUID(), name: nome, type: 'n8n-nodes-base.if', typeVersion: 2.3, position: posizione,
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
      conditions: [{ id: randomUUID(), leftValue: expr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and' }, looseTypeValidation: true, options: {} } });
  const manda = (nome, posizione, conArgomento) => ({ id: randomUUID(), name: nome, type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: posizione,
    onError: 'continueRegularOutput',
    parameters: { resource: 'message', operation: 'sendMessage', chatId: '={{ $json.chat }}', text: '={{ $json.messaggio }}',
      additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true,
        ...(conArgomento ? { message_thread_id: '={{ $json.thread }}' } : {}) } },
    credentials: { telegramApi: credTelegram } });

  nodi.push(
    { id: randomUUID(), name: 'Da un altro flusso', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1, position: pos(0),
      parameters: { inputSource: 'passthrough' } },
    { id: randomUUID(), name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: pos(1), executeOnce: true,
      parameters: { mode: 'manual', includeOtherFields: false, options: {}, assignments: { assignments: [
        ['TELEGRAM_CHAT_ID', chatId || 'DA_IMPOSTARE'],
        // Il gruppo «Attività» con gli argomenti accesi. Vuoto = i messaggi vanno nella chat privata.
        ['CHAT_ATTIVITA', gruppo || ''],
        ['OFFICINA_URL', 'http://officina.internal:8080'],
      ].map(([name, value]) => ({ id: randomUUID(), name, value, type: 'string' })) } } },
    { id: randomUUID(), name: 'Raccogli i messaggi', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(2),
      parameters: { jsCode: codice('raccogli.js') } },
    se("C'è il gruppo?", pos(3), '={{ $json.conGruppo }}'),
    { id: randomUUID(), name: "Cerca l'argomento", type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos(4, -1),
      executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput',
      parameters: { resource: 'row', operation: 'get', dataTableId: laTabella, matchType: 'allConditions',
        filters: { conditions: [
          { keyName: 'id_attivita', condition: 'eq', keyValue: `={{ ${R}.id }}` },
          { keyName: 'chat_id', condition: 'eq', keyValue: `={{ ${R}.gruppo }}` },
        ] }, returnAll: false, limit: 1 } },
    se('Trovato?', pos(5, -1), '={{ Number($json.thread_id) > 0 }}'),
    { id: randomUUID(), name: "Apri l'argomento", type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(6, -2),
      onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000,
      parameters: { method: 'POST', url: "={{ $('Config').first().json.OFFICINA_URL }}/telegram/argomento",
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify({ chat_id: ${R}.gruppo, nome: ${R}.nome }) }}`,
        options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 20000 } },
      credentials: { httpHeaderAuth: officina ? { id: officina, name: NOME_OFFICINA } : { id: 'DA_IMPOSTARE', name: NOME_OFFICINA } } },
    se('Aperto?', pos(7, -2), '={{ $json.statusCode === 200 && Number(($json.body || {}).message_thread_id) > 0 }}'),
    { id: randomUUID(), name: "Segna l'argomento", type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos(8, -2),
      onError: 'continueRegularOutput',
      parameters: { resource: 'row', operation: 'insert', dataTableId: laTabella, options: {},
        columns: { mappingMode: 'defineBelow', matchingColumns: [],
          value: { id_attivita: `={{ ${R}.id }}`, nome: `={{ ${R}.nome }}`, chat_id: `={{ ${R}.gruppo }}`,
            thread_id: '={{ Number($("Apri l\'argomento").first().json.body.message_thread_id) }}' },
          schema: COLONNE_TABELLA.map(([id, type]) => ({ id, displayName: id, required: false, defaultMatch: false, display: true, type, canBeUsedToMatch: true })) } } },
    { id: randomUUID(), name: 'Messaggi da mandare', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(9),
      parameters: { jsCode: codice('messaggi.js') } },
    se("Nell'argomento?", pos(10), '={{ Number($json.thread) > 0 }}'),
    manda("Manda nell'argomento", pos(11, -1), true),
    manda('Manda', pos(11, 1), false),
  );
  vai('Da un altro flusso', 'Config');
  vai('Config', 'Raccogli i messaggi');
  vai('Raccogli i messaggi', "C'è il gruppo?");
  vai("C'è il gruppo?", "Cerca l'argomento", 'Messaggi da mandare');
  vai("Cerca l'argomento", 'Trovato?');
  vai('Trovato?', 'Messaggi da mandare', "Apri l'argomento");
  vai("Apri l'argomento", 'Aperto?');
  vai('Aperto?', "Segna l'argomento", 'Messaggi da mandare');
  vai("Segna l'argomento", 'Messaggi da mandare');
  vai('Messaggi da mandare', "Nell'argomento?");
  vai("Nell'argomento?", "Manda nell'argomento", 'Manda');
  nodi.push({ id: randomUUID(), name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -760],
    parameters: { width: 760, height: 420, content: [
      "## 97 · Scrivi nell'argomento dell'attività",
      '',
      "**Cosa fa.** Riceve i messaggi su un negozio (una voce per messaggio: id, nome, messaggio) e li scrive nel suo argomento del gruppo Telegram «Attività». L'argomento si trova nella tabella «Argomenti delle attività»; se non c'è lo apre l'officina e lo si segna.",
      '',
      "**Senza gruppo** (CHAT_ATTIVITA vuoto nel Config) i messaggi vanno nella chat privata, come prima. Se l'officina non apre l'argomento, vanno nello spazio generale del gruppo col nome del negozio in testa e un avviso.",
      '',
      "**Chi lo chiama.** L'analisi di un'attività e le bozze dei 3 abbonamenti, come ultimo passo. La chiave del bot per aprire gli argomenti sta nell'officina (variabile TELEGRAM_BOT_TOKEN), non qui.",
      '',
      '**Generato** da `N8N/flussi/97-argomento-attivita/costruisci.mjs`: le modifiche vanno fatte lì.',
    ].join('\n') } });

  return {
    name: NOME_97, nodes: nodi, connections: collega,
    settings: { executionOrder: 'v1', timezone: 'Europe/Rome', saveManualExecutions: false, saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none', callerPolicy: 'workflowsFromSameOwner' },
  };
}

/** I problemi del flusso costruito (vuoto = a posto). */
export function controlla(w) {
  const problemi = [];
  const nomi = new Set(w.nodes.map((n) => n.name));
  if (nomi.size !== w.nodes.length) problemi.push('due nodi con lo stesso nome');
  for (const n of w.nodes) {
    const s = JSON.stringify(n.parameters || {});
    for (const m of s.matchAll(/\$\(\\"(.+?)\\"\)|\$\('((?:[^'\\]|\\\\')+)'\)/g)) {
      const citato = (m[1] ?? m[2]).replace(/\\\\'/g, "'");
      if (!nomi.has(citato)) problemi.push(`«${n.name}» cita «${citato}», che non esiste`);
    }
    // I messaggi vanno solo dove dice il codice, che legge solo il Config: mai una chat scritta a mano.
    if (n.type === 'n8n-nodes-base.telegram' && n.parameters.chatId !== '={{ $json.chat }}') problemi.push(`«${n.name}» scrive a una chat scritta a mano`);
    if (n.type === 'n8n-nodes-base.httpRequest' && !String(n.parameters.url).startsWith("={{ $('Config').first().json.OFFICINA_URL }}/")) {
      problemi.push(`«${n.name}» chiama un indirizzo che non è l'officina`);
    }
    for (const c of Object.values(n.credentials || {})) if (c.id === 'DA_IMPOSTARE') problemi.push(`«${n.name}» non ha la credenziale`);
  }
  for (const [da, uscite] of Object.entries(w.connections)) {
    if (!nomi.has(da)) problemi.push(`collegamento da un nodo che non esiste: «${da}»`);
    for (const ramo of uscite.main || []) for (const v of ramo || []) if (!nomi.has(v.node)) problemi.push(`collegamento verso «${v.node}», che non esiste`);
  }
  if (w.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments.find((a) => a.name === 'TELEGRAM_CHAT_ID').value === 'DA_IMPOSTARE') {
    problemi.push('manca la chat Telegram di Nicola');
  }
  return problemi;
}

async function principale(argv) {
  const valore = (nome) => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : undefined; };
  let pezzi = { chatId: valore('--chat'), gruppo: valore('--gruppo'), officina: valore('--officina'), tabella: valore('--tabella'),
    telegram: valore('--telegram') ? { id: valore('--telegram'), name: NOME_TELEGRAM } : undefined };
  let api = null;
  if (argv.includes('--manda')) {
    api = await import('../n8n-api.mjs');
    const tutti = await api.elencoFlussi();
    const m12 = trovaFlusso(tutti, NOMI.nuovoCliente);
    if (!m12) throw new Error('Non trovo il modulo 12 su n8n: da lì prendo chat e credenziali.');
    const gia = trovaFlusso(tutti, NOME_97);
    const cfgGia = gia?.nodes?.find((n) => n.name === 'Config')?.parameters?.assignments?.assignments || [];
    pezzi = { ...pezzi,
      telegram: m12.nodes.find((n) => n.type === 'n8n-nodes-base.telegram')?.credentials?.telegramApi,
      chatId: String(m12.nodes.find((n) => n.name === 'Config')?.parameters?.assignments?.assignments?.find((a) => a.name === 'TELEGRAM_CHAT_ID')?.value || ''),
      // Il gruppo già scritto su n8n non si perde quando si rigenera il flusso.
      gruppo: pezzi.gruppo ?? cfgGia.find((a) => a.name === 'CHAT_ATTIVITA')?.value };
  }
  const w = costruisci(pezzi);
  if (valore('--scrivi')) writeFileSync(valore('--scrivi'), JSON.stringify(w, null, 2));
  const completo = argv.includes('--manda') || argv.includes('--sdk');
  const problemi = controlla(w).filter((p) => completo || !/credenziale|chat Telegram/.test(p));
  if (problemi.length) { console.error('Il 97 non va bene:\n- ' + problemi.join('\n- ')); process.exit(1); }
  if (valore('--sdk')) {
    const { inSdk } = await import('../in-sdk.mjs');
    writeFileSync(valore('--sdk'), inSdk(w));
    console.log(`Codice SDK scritto in ${valore('--sdk')}.`);
  }
  console.log(`97 costruito: ${w.nodes.length} nodi, controlli a posto.`);
  if (api) {
    const esito = await api.creaOAggiorna(w);
    console.log(`${esito.creato ? 'Creato' : 'Aggiornato'} su n8n: id ${esito.id}, ${esito.attivo ? 'ACCESO' : 'spento'}.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principale(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
