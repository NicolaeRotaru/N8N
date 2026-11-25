// Conta i nodi che chiamano l'API di Claude a pagamento nei flussi n8n accesi, e in quelli che i flussi
// accesi possono far partire (sotto-flussi chiamati con «Esegui un flusso» e flussi degli errori).
// Decisione di Nicola del 24/11/2026: nessun flusso acceso chiama più l'API di Claude; il lavoro con l'IA
// lo fa l'AD col piano Max, attraverso il sotto-flusso «Chiedi all'AD». Il risultato giusto è ZERO.
//
// Cosa conta: ogni nodo NON disattivato il cui testo contiene «api.anthropic.com», tranne la partenza della
// routine (/v1/claude_code/routines/…, che va sul piano Max), e i nodi Anthropic/Claude dei modelli di n8n.
// I nodi disattivati si elencano a parte, ma non contano: non partono.
//
// Uso: N8N_API_KEY=… node flussi/conta-api-claude.mjs        → esce con 1 se ne trova almeno uno
//      node flussi/conta-api-claude.mjs --file elenco.json    → lo stesso, su flussi salvati (array di flussi)

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ROUTINE = 'api.anthropic.com/v1/claude_code/routines/';
const TIPI_ANTHROPIC = /anthropic/i;

/** Il nodo chiama l'API di Claude a pagamento? */
export function aPagamento(nodo) {
  if (TIPI_ANTHROPIC.test(String(nodo.type || ''))) return true;
  const testo = JSON.stringify(nodo.parameters || {});
  const chiamate = testo.match(/api\.anthropic\.com[^"\s]*/g) || [];
  return chiamate.some((c) => !c.startsWith(ROUTINE));
}

/** Gli id dei flussi che un flusso può far partire: sotto-flussi e flusso degli errori. */
export function chiamati(flusso) {
  const ids = new Set();
  for (const n of flusso.nodes || []) {
    if (n.disabled || !/executeWorkflow$/.test(String(n.type || ''))) continue;
    const p = n.parameters || {};
    if (p.source && p.source !== 'database') continue;
    const id = typeof p.workflowId === 'object' ? p.workflowId?.value : p.workflowId;
    if (id && !String(id).startsWith('=')) ids.add(String(id));
  }
  if (flusso.settings?.errorWorkflow) ids.add(String(flusso.settings.errorWorkflow));
  return [...ids];
}

/**
 * Parte dai flussi accesi e segue sotto-flussi e flussi degli errori.
 * Restituisce { totale, nodi: [{ flusso, id, nodo }], disattivati: [...], raggiunti: [nomi], mancanti: [id] }.
 */
export function conta(flussi) {
  const perId = new Map(flussi.map((f) => [String(f.id), f]));
  const coda = flussi.filter((f) => f.active).map((f) => String(f.id));
  const visti = new Set();
  const mancanti = [];
  const nodi = [];
  const disattivati = [];
  while (coda.length) {
    const id = coda.shift();
    if (visti.has(id)) continue;
    visti.add(id);
    const f = perId.get(id);
    if (!f) { mancanti.push(id); continue; }
    for (const n of f.nodes || []) {
      if (!aPagamento(n)) continue;
      (n.disabled ? disattivati : nodi).push({ flusso: f.name, id, nodo: n.name });
    }
    coda.push(...chiamati(f));
  }
  const raggiunti = [...visti].filter((id) => perId.has(id)).map((id) => perId.get(id).name);
  return { totale: nodi.length, nodi, disattivati, raggiunti, mancanti };
}

async function principale(argv) {
  const i = argv.indexOf('--file');
  let flussi;
  if (i >= 0) {
    flussi = JSON.parse(readFileSync(argv[i + 1], 'utf8'));
  } else {
    const api = await import('./n8n-api.mjs');
    // L'elenco ha già i nodi; i sotto-flussi spenti ci sono comunque, e si seguono se un flusso acceso li chiama.
    flussi = await api.elencoFlussi();
  }
  const r = conta(flussi);
  console.log(`Flussi accesi o raggiungibili: ${r.raggiunti.length}.`);
  if (r.mancanti.length) console.log(`Chiamati ma non trovati: ${r.mancanti.join(', ')}.`);
  for (const d of r.disattivati) console.log(`  (disattivato, non conta) ${d.flusso} → «${d.nodo}»`);
  if (!r.totale) { console.log("Nodi verso l'API di Claude a pagamento: 0."); return; }
  console.log(`Nodi verso l'API di Claude a pagamento: ${r.totale}.`);
  for (const n of r.nodi) console.log(`  ${n.flusso} (${n.id}) → «${n.nodo}»`);
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principale(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(2); });
}
