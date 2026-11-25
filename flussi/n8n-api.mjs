// Un piccolo client per l'API pubblica di n8n (v1), senza dipendenze.
//
// Dove punta: N8N_URL (di serie il server dell'agenzia su Sliplane).
// La chiave: N8N_API_KEY. Si crea in n8n → Settings → n8n API. Non va mai scritta in un file
// del repository: questo repository è pubblico.

import { trovaFlusso } from './nomi.mjs';

export const N8N_URL = (process.env.N8N_URL || 'https://n8n-shdy.sliplane.app').replace(/\/+$/, '');

// Le sole impostazioni che l'API pubblica accetta quando si crea o si aggiorna un flusso.
const IMPOSTAZIONI_AMMESSE = [
  'saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution',
  'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder', 'callerPolicy',
];

async function chiama(metodo, percorso, corpo) {
  const chiave = process.env.N8N_API_KEY;
  if (!chiave) throw new Error('Manca N8N_API_KEY: la chiave si crea in n8n → Settings → n8n API.');
  const risposta = await fetch(`${N8N_URL}/api/v1${percorso}`, {
    method: metodo,
    headers: { 'X-N8N-API-KEY': chiave, accept: 'application/json', ...(corpo ? { 'content-type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const testo = await risposta.text();
  let dati = null;
  try { dati = testo ? JSON.parse(testo) : null; } catch { dati = { grezzo: testo.slice(0, 500) }; }
  if (!risposta.ok) throw new Error(`n8n ${metodo} ${percorso} → ${risposta.status}: ${JSON.stringify(dati).slice(0, 500)}`);
  return dati;
}

export const leggiFlusso = (id) => chiama('GET', `/workflows/${encodeURIComponent(id)}`);

export async function elencoFlussi() {
  const tutti = [];
  let cursore = '';
  do {
    const pagina = await chiama('GET', `/workflows?limit=250${cursore ? `&cursor=${encodeURIComponent(cursore)}` : ''}`);
    tutti.push(...(pagina.data || []));
    cursore = pagina.nextCursor || '';
  } while (cursore);
  return tutti;
}

/** Il corpo che l'API accetta: nome, nodi, collegamenti e solo le impostazioni ammesse. */
export function corpoPerApi(flusso) {
  const impostazioni = {};
  for (const k of IMPOSTAZIONI_AMMESSE) if (flusso.settings && flusso.settings[k] !== undefined) impostazioni[k] = flusso.settings[k];
  return { name: flusso.name, nodes: flusso.nodes, connections: flusso.connections, settings: impostazioni };
}

/**
 * Crea il flusso se non c'è uno con lo stesso nome, altrimenti lo aggiorna. Non lo accende mai.
 * Trova anche il flusso col nome vecchio (nomi.mjs): aggiornandolo, gli dà il nome nuovo.
 */
export async function creaOAggiorna(flusso) {
  const esistente = trovaFlusso(await elencoFlussi(), flusso.name);
  if (esistente) {
    const aggiornato = await chiama('PUT', `/workflows/${esistente.id}`, corpoPerApi(flusso));
    return { id: aggiornato.id, creato: false, attivo: aggiornato.active };
  }
  const creato = await chiama('POST', '/workflows', corpoPerApi(flusso));
  return { id: creato.id, creato: true, attivo: creato.active };
}

export const accendi = (id) => chiama('POST', `/workflows/${encodeURIComponent(id)}/activate`);
export const spegni = (id) => chiama('POST', `/workflows/${encodeURIComponent(id)}/deactivate`);
export const creaCredenziale = (nome, tipo, dati) => chiama('POST', '/credentials', { name: nome, type: tipo, data: dati });
