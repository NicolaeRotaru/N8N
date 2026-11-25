// La copia di sicurezza di tutto n8n: ogni flusso (vivo e archiviato) e l'elenco delle credenziali.
//
// Cosa salva, in <cartella>:
//   flussi/<nome-pulito>__<id>.json   un file per flusso, SENZA pinData (i dati di prova fissati nei nodi)
//   credenziali.json                  solo id, nome e tipo di ogni credenziale: mai i segreti
//   elenco.json                       per ogni flusso: id, nome, acceso, archiviato, nodi, etichette, aggiornato
//
// Dove NON scrive: dentro un repository pubblico. I flussi contengono gli ID del foglio Clienti, delle
// cartelle Drive e della chat Telegram. Se la cartella sta in uno dei repository pubblici noti, si ferma.
//
// Uso:
//   N8N_API_KEY=… node flussi/copia-di-sicurezza.mjs <cartella>              fa la copia
//   node flussi/copia-di-sicurezza.mjs --verifica <cartella>                 controlla che si possa reimportare

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { elencoFlussi, leggiFlusso, corpoPerApi, N8N_URL } from './n8n-api.mjs';

// I repository di Nicola che il 25/11/2026 erano pubblici. Se uno diventa privato, si toglie da qui.
export const REPOSITORY_PUBBLICI = ['nicolaerotaru/n8n', 'nicolaerotaru/ad-mycity', 'nicolaerotaru/mycity'];

/** Il nome del repository GitHub che contiene la cartella, o '' se non è in un repository. */
export function repositoryDi(cartella) {
  let dir = resolve(cartella);
  while (!existsSync(dir)) dir = resolve(dir, '..');
  try {
    const url = execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const m = url.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/i);
    return m ? m[1].toLowerCase() : url;
  } catch { return ''; }
}

export function nomeFile(flusso) {
  const pulito = flusso.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${pulito || 'senza-nome'}__${flusso.id}.json`;
}

/** Il flusso come si salva: tutto quello che n8n restituisce, tranne i dati di prova fissati. */
export function perCopia(flusso) {
  const { pinData, ...resto } = flusso;
  return resto;
}

/** Cosa rende un file reimportabile: il corpo che l'API accetta deve esserci tutto e tornare uguale. */
export function controllaFile(flusso) {
  const problemi = [];
  if (typeof flusso.name !== 'string' || !flusso.name) problemi.push('manca il nome');
  if (!Array.isArray(flusso.nodes) || !flusso.nodes.length) problemi.push('mancano i nodi');
  if (!flusso.connections || typeof flusso.connections !== 'object') problemi.push('mancano i collegamenti');
  if (flusso.pinData && Object.keys(flusso.pinData).length) problemi.push('ha ancora i pinData');
  if (problemi.length) return problemi;
  const nomi = new Set(flusso.nodes.map((n) => n.name));
  if (nomi.size !== flusso.nodes.length) problemi.push('due nodi con lo stesso nome');
  for (const [da, uscite] of Object.entries(flusso.connections)) {
    if (!nomi.has(da)) problemi.push(`collegamento da un nodo che non c'è: ${da}`);
    for (const ramo of Object.values(uscite)) for (const lista of ramo || []) for (const c of lista || []) {
      if (!nomi.has(c.node)) problemi.push(`collegamento verso un nodo che non c'è: ${c.node}`);
    }
  }
  const corpo = corpoPerApi(flusso);
  if (JSON.stringify(JSON.parse(JSON.stringify(corpo))) !== JSON.stringify(corpo)) problemi.push('il corpo non torna uguale');
  return problemi;
}

export async function faiCopia(cartella, api = { elencoFlussi, leggiFlusso, elencoCredenziali }) {
  const repo = repositoryDi(cartella);
  if (REPOSITORY_PUBBLICI.includes(repo)) throw new Error(`La cartella è nel repository pubblico ${repo}: i flussi hanno gli ID di fogli, chat e cartelle. Scegli un repository privato.`);
  mkdirSync(join(cartella, 'flussi'), { recursive: true });
  const elenco = [];
  for (const voce of await api.elencoFlussi()) {
    const flusso = perCopia(await api.leggiFlusso(voce.id));
    writeFileSync(join(cartella, 'flussi', nomeFile(flusso)), JSON.stringify(flusso, null, 2) + '\n');
    elenco.push({ id: flusso.id, nome: flusso.name, acceso: !!flusso.active, archiviato: !!flusso.isArchived,
      nodi: flusso.nodes.length, etichette: (flusso.tags || []).map((t) => t.name), aggiornato: flusso.updatedAt });
  }
  elenco.sort((a, b) => a.nome.localeCompare(b.nome));
  const credenziali = (await api.elencoCredenziali()).map(({ id, name, type }) => ({ id, nome: name, tipo: type }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  writeFileSync(join(cartella, 'elenco.json'), JSON.stringify({ server: N8N_URL, flussi: elenco }, null, 2) + '\n');
  writeFileSync(join(cartella, 'credenziali.json'), JSON.stringify(credenziali, null, 2) + '\n');
  return { flussi: elenco.length, credenziali: credenziali.length };
}

export function verificaCopia(cartella) {
  const elenco = JSON.parse(readFileSync(join(cartella, 'elenco.json'), 'utf8')).flussi;
  const file = readdirSync(join(cartella, 'flussi')).filter((f) => f.endsWith('.json'));
  const errori = [];
  if (file.length !== elenco.length) errori.push(`file ${file.length}, ma l'elenco ne conta ${elenco.length}`);
  for (const f of file) {
    const flusso = JSON.parse(readFileSync(join(cartella, 'flussi', f), 'utf8'));
    for (const p of controllaFile(flusso)) errori.push(`${f}: ${p}`);
    const voce = elenco.find((v) => v.id === flusso.id);
    if (!voce) errori.push(`${f}: non è nell'elenco`);
    else if (voce.nodi !== flusso.nodes.length) errori.push(`${f}: ${flusso.nodes.length} nodi, l'elenco ne dice ${voce.nodi}`);
  }
  const cred = JSON.parse(readFileSync(join(cartella, 'credenziali.json'), 'utf8'));
  for (const c of cred) if (Object.keys(c).some((k) => !['id', 'nome', 'tipo'].includes(k))) errori.push(`credenziale ${c.nome}: c'è un campo in più`);
  return { flussi: file.length, credenziali: cred.length, errori };
}

async function elencoCredenziali() {
  const chiave = process.env.N8N_API_KEY;
  if (!chiave) throw new Error('Manca N8N_API_KEY.');
  const tutte = [];
  let cursore = '';
  do {
    const r = await fetch(`${N8N_URL}/api/v1/credentials?limit=250${cursore ? `&cursor=${encodeURIComponent(cursore)}` : ''}`,
      { headers: { 'X-N8N-API-KEY': chiave, accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`n8n GET /credentials → ${r.status}`);
    const pagina = await r.json();
    tutte.push(...(pagina.data || []));
    cursore = pagina.nextCursor || '';
  } while (cursore);
  return tutte;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--verifica' && args[1]) {
    const r = verificaCopia(args[1]);
    console.log(`${r.flussi} flussi, ${r.credenziali} credenziali, ${r.errori.length} problemi.`);
    for (const e of r.errori) console.log('  ' + e);
    process.exit(r.errori.length ? 1 : 0);
  } else if (args[0]) {
    const r = await faiCopia(args[0]);
    console.log(`Copia fatta in ${args[0]}: ${r.flussi} flussi, ${r.credenziali} credenziali (solo nomi e tipi).`);
  } else {
    console.error('Uso: node flussi/copia-di-sicurezza.mjs <cartella>  |  --verifica <cartella>');
    process.exit(2);
  }
}
