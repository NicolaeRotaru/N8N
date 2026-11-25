// Collega un flusso n8n a «Chiedi all'AD» al posto dell'API di Claude a pagamento.
//
// Ogni nodo HTTP che chiamava https://api.anthropic.com/v1/messages diventa tre nodi:
//   «Per l'AD: <cosa>»        (codice) la richiesta di prima diventa un lavoro { flusso, compito, dati, schema };
//   «Chiedi all'AD: <cosa>»   (esegui un flusso) chiama il sotto-flusso «Chiedi all'AD» e lo aspetta, con tutti
//                              gli elementi insieme: tanti lavori, una corsa sola;
//   «Dall'AD: <cosa>»         (codice) rimette la risposta nella forma che il nodo dopo leggeva da Claude.
// Il resto del flusso non cambia: legge content[0].text come prima, e se l'AD non risponde segue la strada
// che seguiva quando Claude non rispondeva.
//
// Uso: N8N_API_KEY=… node flussi/chiedi-all-ad/collega.mjs <01|04|08> [--manda] [--salva copia.json]
//   senza --manda controlla soltanto; --salva scrive la copia del flusso di prima (contiene ID: fuori dal repository).

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NOME_CHIEDI } from './costruisci.mjs';
import { NOMI, trovaFlusso } from '../nomi.mjs';
import { aPagamento } from '../conta-api-claude.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const codice = (nome) => readFileSync(join(QUI, 'codice', nome), 'utf8');

/** I flussi da collegare: quali nodi, con che nome, e in che forma il nodo dopo legge la risposta. */
export const FLUSSI = {
  '01': { nome: '01 · Pubblica contenuti (Instagram + Facebook)', nodi: [
    { nodo: 'Controllo finale AI', cosa: 'controllo finale', forma: 'corpo' },
  ] },
  '04': { nome: '04 · Scrivi i testi (AI)', altri: ['04 · Scrivi i testi'], nodi: [
    { nodo: 'Chiedi i testi a Claude', cosa: 'i testi', forma: 'completa' },
  ] },
  // Il 12 è della sessione «Ora del Gusto 2.0»: si collega solo col suo via, poi si rigenera il 16 (che lo copia).
  // Le foto del 12 viaggiano in base64: la lettura delle foto non parte finché non arrivano come indirizzi web.
  // Nel 12 tre bivi aprono il ramo verso l'IA solo con RICERCA_CON_CLAUDE = si. Tolti i nodi a pagamento,
  // la voce si accende: ora il ramo porta all'AD (piano Max), non all'API di Claude.
  '12': { nome: '12 · Nuovo cliente (automatico)', altri: [NOMI.nuovoCliente], accendi: 'RICERCA_CON_CLAUDE', nodi: [
    { nodo: 'Leggi le foto con Claude', cosa: 'le foto', forma: 'completa', fotoNecessarie: true },
    { nodo: 'Cerca il locale con Claude', cosa: 'la ricerca', forma: 'completa' },
    { nodo: 'Scrivi la scheda con Claude', cosa: 'la scheda', forma: 'completa' },
  ] },
  // Le foto del 08 viaggiano solo dentro il messaggio (base64): all'AD non arrivano. Finché Nicola non apre
  // nella rete della routine gli indirizzi da cui l'AD può scaricarle, il lavoro non si manda (FOTO_NECESSARIE)
  // e il 08 segue la sua strada senza IA.
  '08': { nome: '08 Post dalle foto', altri: ['08 · Post dalle foto'], nodi: [
    { nodo: 'Claude: scegli ordine e copertina', cosa: 'ordine e copertina', forma: 'corpo', fotoNecessarie: true },
    { nodo: 'Claude: controlla la foto', cosa: 'controllo della foto', forma: 'corpo', fotoNecessarie: true },
  ] },
};

/** Trasforma il corpo JSON del nodo HTTP (un'espressione di n8n) in un'espressione JavaScript. */
export function espressione(jsonBody) {
  let s = String(jsonBody ?? '').trim();
  if (!s.startsWith('=')) return `(${JSON.stringify(JSON.parse(s))})`;
  s = s.slice(1).trim();
  const tutto = s.match(/^\{\{\s*JSON\.stringify\(([\s\S]*)\)\s*\}\}$/);
  if (tutto && !tutto[1].includes('{{')) return `(${tutto[1]})`;
  // Un'espressione dentro una stringa JSON ("Analizza: {{ … }}") non si sa trasformare: meglio fermarsi.
  for (let i = 0, dentro = false; i < s.length; i++) {
    if (!dentro && s.startsWith('{{', i)) { const fine = s.indexOf('}}', i); i = fine < 0 ? s.length : fine + 1; continue; }
    if (dentro && s.startsWith('{{', i)) throw new Error('corpo della richiesta non riconosciuto (espressione dentro una stringa)');
    if (s[i] === '\\' && dentro) { i++; continue; }
    if (s[i] === '"') dentro = !dentro;
  }
  const sostituito = s.replace(/\{\{\s*JSON\.stringify\(([\s\S]*?)\)\s*\}\}/g, '($1)');
  if (sostituito.includes('{{')) throw new Error('corpo della richiesta non riconosciuto');
  return `(${sostituito})`;
}

/** Restituisce il flusso collegato a «Chiedi all'AD» (l'originale non si tocca) e l'elenco delle modifiche. */
export function collega(originale, { nodi, chiediId }) {
  if (!chiediId) throw new Error("manca l'id del flusso «Chiedi all'AD»");
  const w = structuredClone(originale);
  const modifiche = [];
  for (const { nodo, cosa, forma, fotoNecessarie = false } of nodi) {
    const vecchio = w.nodes.find((n) => n.name === nodo);
    const nomi = { per: `Per l'AD: ${cosa}`, chiedi: `Chiedi all'AD: ${cosa}`, dall: `Dall'AD: ${cosa}` };
    if (!vecchio) {
      if (w.nodes.some((n) => n.name === nomi.chiedi)) continue; // già collegato
      throw new Error(`Nel flusso «${w.name}» non trovo il nodo «${nodo}»: è cambiato, non tocco niente.`);
    }
    if (!aPagamento(vecchio)) throw new Error(`«${nodo}» non chiama l'API di Claude: non lo tocco.`);
    if (vecchio.disabled) throw new Error(`«${nodo}» è disattivato: collegarlo lo accenderebbe, non lo tocco.`);
    if ((w.connections[nodo]?.main || []).filter((r) => (r || []).length).length > 1 || vecchio.onError === 'continueErrorOutput') {
      throw new Error(`«${nodo}» ha più di un'uscita: va collegato a mano.`);
    }
    if (w.nodes.some((n) => [nomi.per, nomi.chiedi, nomi.dall].includes(n.name))) throw new Error(`nel flusso c'è già un nodo «${nomi.chiedi}»: due nodi con lo stesso «cosa»?`);
    const [x, y] = vecchio.position || [0, 0];
    const richiesta = espressione(vecchio.parameters.jsonBody);
    const per = { id: randomUUID(), name: nomi.per, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x - 120, y + 160],
      parameters: { jsCode: codice('adatta-richiesta.js').replace('__FLUSSO__', () => JSON.stringify(w.name))
        .replace('__FOTO_NECESSARIE__', () => String(!!fotoNecessarie)).replace('__RICHIESTA__', () => richiesta) } };
    const chiedi = { id: randomUUID(), name: nomi.chiedi, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.3, position: [x, y],
      onError: 'continueRegularOutput', ...(vecchio.executeOnce ? { executeOnce: true } : {}),
      parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: chiediId, cachedResultName: NOME_CHIEDI },
        workflowInputs: { mappingMode: 'defineBelow', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true },
        mode: 'once', options: { waitForSubWorkflow: true } } };
    const dall = { id: randomUUID(), name: nomi.dall, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 120, y + 160],
      parameters: { jsCode: codice('adatta-risposta.js').replace('__FORMA__', () => JSON.stringify(forma)) } };
    w.nodes = w.nodes.filter((n) => n.name !== nodo).concat([per, chiedi, dall]);
    // Chi andava al nodo vecchio va a «Per l'AD»; dove andava il nodo vecchio va «Dall'AD».
    for (const uscite of Object.values(w.connections)) {
      for (const tipo of Object.values(uscite)) for (const ramo of tipo) for (const c of ramo || []) if (c.node === nodo) c.node = nomi.per;
    }
    w.connections[nomi.dall] = w.connections[nodo] || { main: [[]] };
    delete w.connections[nodo];
    w.connections[nomi.per] = { main: [[{ node: nomi.chiedi, type: 'main', index: 0 }]] };
    w.connections[nomi.chiedi] = { main: [[{ node: nomi.dall, type: 'main', index: 0 }]] };
    // Chi citava il nodo vecchio per nome ($('…')) ora cita «Dall'AD», che ha la stessa forma di risposta.
    const esc = nodo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cita = () => new RegExp(`\\$\\(\\s*(['"\`])${esc}\\1\\s*\\)`, 'g');
    const riscrivi = (v) => (typeof v === 'string' ? v.replace(cita(), () => `$(${JSON.stringify(nomi.dall)})`)
      : Array.isArray(v) ? v.map(riscrivi) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, riscrivi(x)])) : v);
    for (const n of w.nodes) {
      if (n === per || n === dall) continue;
      const prima = JSON.stringify(n.parameters || {});
      n.parameters = riscrivi(n.parameters || {});
      if (JSON.stringify(n.parameters) !== prima) modifiche.push(`«${n.name}» ora cita «${nomi.dall}»`);
    }
    modifiche.push(`«${nodo}» → «${nomi.chiedi}»`);
  }
  return { flusso: w, modifiche };
}

/** Accende una voce «si/no» del Config, ma solo se nel flusso non resta nessun nodo a pagamento. */
export function accendiVoce(w, voce) {
  if (w.nodes.some((n) => aPagamento(n))) throw new Error(`nel flusso restano nodi verso l'API di Claude: ${voce} resta spenta.`);
  const a = w.nodes.find((n) => n.name === 'Config')?.parameters?.assignments?.assignments?.find((x) => x.name === voce);
  if (!a) throw new Error(`nel Config non trovo ${voce}.`);
  if (a.value === 'si') return null;
  a.value = 'si';
  return `${voce} = si (il ramo ora va all'AD)`;
}

async function principale(argv) {
  const quale = FLUSSI[argv[0]];
  if (!quale) throw new Error(`Quale flusso? Uno di: ${Object.keys(FLUSSI).join(', ')}`);
  const api = await import('../n8n-api.mjs');
  const tutti = await api.elencoFlussi();
  // Il nome può essere cambiato (la sessione C rinumera i flussi): si cerca anche coi nomi nuovi.
  const trovato = tutti.find((w) => [quale.nome, ...(quale.altri || [])].includes(w.name));
  if (!trovato) throw new Error(`Non trovo «${quale.nome}» su n8n.`);
  const chiedi = trovaFlusso(tutti, NOME_CHIEDI);
  if (!chiedi) throw new Error(`Non trovo «${NOME_CHIEDI}» su n8n: prima node flussi/chiedi-all-ad/costruisci.mjs --manda`);
  const originale = await api.leggiFlusso(trovato.id);
  const i = argv.indexOf('--salva');
  if (i >= 0) writeFileSync(argv[i + 1], JSON.stringify(originale, null, 2));
  const { flusso, modifiche } = collega(originale, { nodi: quale.nodi, chiediId: chiedi.id });
  if (quale.accendi) { const m = accendiVoce(flusso, quale.accendi); if (m) modifiche.push(m); }
  const restano = flusso.nodes.filter((n) => aPagamento(n)).map((n) => n.name);
  if (!modifiche.length) { console.log(`«${quale.nome}» è già collegato a «${NOME_CHIEDI}».`); }
  else console.log(`«${quale.nome}» (${trovato.id}, ${trovato.active ? 'acceso' : 'spento'}) cambia così:\n- ${modifiche.join('\n- ')}`);
  if (restano.length) console.log(`Restano nodi verso l'API di Claude: ${restano.join(', ')}`);
  if (!modifiche.length) return;
  if (!chiedi.active) console.log(`Attenzione: «${NOME_CHIEDI}» è spento: n8n lo vuole acceso per accettare chi lo chiama.`);
  if (!argv.includes('--manda')) { console.log('Solo controllo: rilancia con --manda per aggiornarlo su n8n.'); return; }
  const esito = await api.creaOAggiorna(flusso);
  console.log(`Aggiornato su n8n: id ${esito.id}, ${esito.attivo ? 'ACCESO' : 'spento'}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principale(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
