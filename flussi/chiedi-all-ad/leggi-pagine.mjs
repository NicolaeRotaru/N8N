#!/usr/bin/env node
// Il 12 («11 · Nuovo cliente») e il suo gemello 26 leggono le pagine con n8n, quando la ricerca la fa l'AD.
//
// 25/11/2026 — Nicola, sulla card di Ora del Gusto («perché non hai trovato questi dati?»), poi «Ripara».
// Da quando la ricerca la fa l'AD («Chiedi all'AD», piano Max) succedevano due cose:
//   1. la routine dell'AD cerca sul web, ma la sua rete non apre le pagine dei locali;
//   2. anche con le pagine aperte, il controllo del 12 («Controlla la proposta») confronta ogni citazione col
//      testo delle pagine lette, e quel testo arrivava solo dentro la risposta dell'API a pagamento (blocchi
//      web_fetch_tool_result). L'AD manda solo il suo testo: il corpus restava vuoto, e ogni dato preso dal web
//      diventava «non trovato». Il contatore dell'anteprima segnava sempre «Ricerche web: 0».
//
// Questo programma aggiunge al flusso nodi nuovi e piccoli, senza toccare quelli grandi del 12:
//   · «Chiedi gli indirizzi delle pagine» (fra «Per l'AD: la ricerca» e «Chiedi all'AD: la ricerca»): una riga
//     nel compito, l'AD scrive «PAGINE DA LEGGERE:» con gli indirizzi trovati;
//   · fra «Dall'AD: la ricerca» e «Leggi la ricerca»: n8n sceglie le pagine (mai Meta, mappe, portali o indirizzi
//     interni), le scarica, prende anche menu/contatti/orari dello stesso sito e i rinvii, e le rimette nella
//     risposta come pagine lette. «Leggi la ricerca» e «Controlla la proposta» lavorano com'erano;
//   · «Ritocca l'anteprima» (fra «Controlla la proposta» e «Proposta pronta?»): la riga del contatore dice che la
//     ricerca l'ha fatta l'AD e quante pagine ha letto n8n, e porta gli avvisi dell'AD e di n8n.
// Rilanciarlo su un flusso che li ha già aggiorna il loro codice e basta.
//
// Uso:
//   N8N_API_KEY=… node flussi/chiedi-all-ad/leggi-pagine.mjs [12|26] [--manda] [--salva copia.json]
//   node flussi/chiedi-all-ad/leggi-pagine.mjs --file flusso.json [--scrivi nuovo.json] [--operazioni ops.json]
//     --file        lavora su un flusso esportato (es. con lo strumento n8n get_workflow_details) invece di n8n
//     --operazioni  scrive le operazioni per l'aggiornamento a pezzi (strumento n8n update_workflow)
//   Il 26 si rigenera anche dal 12 con flussi/16-nuovo-cliente-da-mycity/genera.mjs: i nodi nuovi li copia.

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NOMI } from '../nomi.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const leggi = (nome) => readFileSync(join(QUI, 'codice', nome), 'utf8');
/** Il codice di un nodo, con le funzioni comuni al posto di __INDIRIZZI__ (gli indirizzi) e __TESTO__ (dall'HTML al testo).
 *  Due pezzi separati: ogni nodo porta solo quello che usa (il flusso si aggiorna anche a pezzi, e pesa). */
export const codiceNodo = (nome) => leggi(nome).replace('__INDIRIZZI__', () => leggi('pagine-indirizzi.js').trimEnd())
  .replace('__TESTO__', () => leggi('pagine-testo.js').trimEnd());

export const N = {
  compito: 'Chiedi gli indirizzi delle pagine',
  scegli: 'Pagine da leggere',
  ci: 'Ci sono pagine da leggere?',
  scarica: 'Scarica le pagine',
  sotto: 'Sottopagine da leggere',
  ciSotto: 'Ci sono sottopagine?',
  scaricaSotto: 'Scarica le sottopagine',
  metti: 'Metti le pagine nella risposta',
  ritocca: "Ritocca l'anteprima",
};
const PER = "Per l'AD: la ricerca";
const CHIEDI = "Chiedi all'AD: la ricerca";
const DALL = "Dall'AD: la ricerca";
const LEGGI = 'Leggi la ricerca';
const CONTROLLA = 'Controlla la proposta';
const PRONTA = 'Proposta pronta?';
export const FLUSSI_LETTURA = { 12: [NOMI.nuovoCliente, '12 · Nuovo cliente (automatico)'], 26: [NOMI.nuovoClienteDaMyCity, '16 · Nuovo cliente da MyCity'] };

const codice = (nome, file) => ({ name: nome, type: 'n8n-nodes-base.code', typeVersion: 2, parameters: { jsCode: codiceNodo(file) } });
const se = (nome, espressione) => ({ name: nome, type: 'n8n-nodes-base.if', typeVersion: 2.3, parameters: {
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
    conditions: [{ id: randomUUID(), leftValue: espressione, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and' },
  looseTypeValidation: true, options: {} } });
// I rinvii NON si seguono qui: potrebbero portare a un indirizzo interno. Li riprende «Sottopagine da leggere».
const scarica = (nome) => ({ name: nome, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, onError: 'continueRegularOutput', parameters: {
  method: 'GET', url: '={{ $json.url }}', sendHeaders: true, specifyHeaders: 'keypair',
  headerParameters: { parameters: [
    { name: 'User-Agent', value: 'Mozilla/5.0 (compatible; lettore-pagine/1.0)' },
    { name: 'Accept', value: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' },
    { name: 'Accept-Language', value: 'it-IT,it;q=0.9,en;q=0.5' },
  ] },
  options: { timeout: 15000, redirect: { redirect: { followRedirects: false } },
    response: { response: { fullResponse: true, neverError: true, responseFormat: 'text' } } } } });

/** I nodi nuovi, senza id né posizione. */
export function nodiNuovi() {
  return [
    codice(N.compito, 'indirizzi-nel-compito.js'),
    codice(N.scegli, 'pagine-da-leggere.js'),
    se(N.ci, '={{ $json.leggi === true }}'),
    scarica(N.scarica),
    codice(N.sotto, 'sottopagine-da-leggere.js'),
    se(N.ciSotto, '={{ $json.leggi === true }}'),
    scarica(N.scaricaSotto),
    codice(N.metti, 'metti-le-pagine.js'),
    codice(N.ritocca, 'ritocca-anteprima.js'),
  ];
}

const uscite = (w, nome) => ((w.connections[nome] || {}).main || []).map((r) => (r || []).map((c) => c.node));
const collega = (w, da, a, ramo = 0) => {
  const u = (w.connections[da] = w.connections[da] || { main: [] });
  while (u.main.length <= ramo) u.main.push([]);
  u.main[ramo] = (u.main[ramo] || []).concat([{ node: a, type: 'main', index: 0 }]);
};
const stacca = (w, da, a) => {
  for (const r of (w.connections[da] || {}).main || []) for (let i = (r || []).length - 1; i >= 0; i--) if (r[i].node === a) r.splice(i, 1);
};

/** Due nodi sono uguali nella sostanza? n8n riordina le chiavi dei parametri e riscrive gli spazi speciali (\\u00a0)
 *  come caratteri veri: si confronta con le chiavi in ordine, gli spazi speciali scritti come codice e senza gli id delle
 *  condizioni dei bivi (casuali a ogni montaggio). */
export function ugualiNellaSostanza(a, b) {
  const invisibili = /[\u00a0\u202f\u200b-\u200d\u2060\ufeff]/g;
  const forma = (v, dove) => {
    if (typeof v === 'string') {
      return v.replace(invisibili, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => `\\u${h.toLowerCase()}`);
    }
    if (Array.isArray(v)) return v.map((x) => forma(x, dove === 'condizioni' ? 'condizione' : undefined));
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().filter((x) => !(dove === 'condizione' && x === 'id'))
        .map((x) => [x, forma(v[x], x === 'conditions' && Array.isArray(v[x]) ? 'condizioni' : undefined)]));
    }
    return v;
  };
  return JSON.stringify(forma(a)) === JSON.stringify(forma(b));
}

/** Restituisce il flusso con la lettura delle pagine (l'originale non si tocca) e l'elenco delle modifiche. */
export function aggiungiLettura(originale) {
  const w = structuredClone(originale);
  const per = Object.fromEntries(w.nodes.map((n) => [n.name, n]));
  const manca = [PER, CHIEDI, DALL, LEGGI, CONTROLLA, PRONTA, 'Config', 'Prepara la ricerca'].filter((n) => !per[n]);
  if (manca.length) throw new Error(`Nel flusso «${w.name}» non trovo ${manca.map((n) => `«${n}»`).join(', ')}: è cambiato, non tocco niente.`);
  const nuovi = nodiNuovi();
  const modifiche = [];
  const presenti = nuovi.filter((n) => per[n.name]);
  if (presenti.length && presenti.length !== nuovi.length) {
    throw new Error(`Il flusso ha solo una parte dei nodi della lettura (${presenti.map((n) => n.name).join(', ')}): va guardato a mano.`);
  }
  if (presenti.length) {
    // Già montati: si aggiornano codice e impostazioni, collegamenti e posizioni restano.
    for (const n of nuovi) {
      const vecchio = per[n.name];
      if (vecchio.type !== n.type) throw new Error(`«${n.name}» non è del tipo atteso (${vecchio.type}): non lo tocco.`);
      const parametri = n.type === 'n8n-nodes-base.if' ? { ...n.parameters, conditions: { ...n.parameters.conditions,
        conditions: n.parameters.conditions.conditions.map((c, i) => ({ ...c, id: vecchio.parameters?.conditions?.conditions?.[i]?.id || c.id })) } } : n.parameters;
      if (!ugualiNellaSostanza(vecchio.parameters, parametri) || vecchio.typeVersion !== n.typeVersion || (vecchio.onError || null) !== (n.onError || null)) {
        vecchio.parameters = parametri;
        vecchio.typeVersion = n.typeVersion;
        if (n.onError) vecchio.onError = n.onError; else delete vecchio.onError;
        modifiche.push(`«${n.name}» aggiornato`);
      }
    }
    return { flusso: w, modifiche };
  }
  // Il punto dove si monta deve essere quello di sempre: un collegamento diverso vuol dire che il 12 è cambiato.
  const atteso = [[PER, CHIEDI], [DALL, LEGGI], [CONTROLLA, PRONTA]];
  for (const [da, a] of atteso) {
    const u = uscite(w, da);
    if (u.length !== 1 || u[0].length !== 1 || u[0][0] !== a) throw new Error(`«${da}» non va solo a «${a}» (va a ${JSON.stringify(u)}): il flusso è cambiato, non tocco niente.`);
  }
  const [xd, yd] = per[DALL].position || [0, 0];
  const [xp, yp] = per[PER].position || [0, 0];
  const [xc, yc] = per[CONTROLLA].position || [0, 0];
  const posizioni = {
    [N.compito]: [xp + 60, yp - 200],
    [N.scegli]: [xd + 220, yd + 260], [N.ci]: [xd + 440, yd + 260], [N.scarica]: [xd + 660, yd + 200],
    [N.sotto]: [xd + 880, yd + 200], [N.ciSotto]: [xd + 1100, yd + 200], [N.scaricaSotto]: [xd + 1320, yd + 140],
    [N.metti]: [xd + 1540, yd + 260],
    [N.ritocca]: [xc + 110, yc - 200],
  };
  for (const n of nuovi) w.nodes.push({ id: randomUUID(), ...n, position: posizioni[n.name] });
  stacca(w, PER, CHIEDI); collega(w, PER, N.compito); collega(w, N.compito, CHIEDI);
  stacca(w, DALL, LEGGI); collega(w, DALL, N.scegli);
  collega(w, N.scegli, N.ci); collega(w, N.ci, N.scarica, 0); collega(w, N.ci, N.metti, 1);
  collega(w, N.scarica, N.sotto); collega(w, N.sotto, N.ciSotto);
  collega(w, N.ciSotto, N.scaricaSotto, 0); collega(w, N.ciSotto, N.metti, 1);
  collega(w, N.scaricaSotto, N.metti); collega(w, N.metti, LEGGI);
  stacca(w, CONTROLLA, PRONTA); collega(w, CONTROLLA, N.ritocca); collega(w, N.ritocca, PRONTA);
  modifiche.push(`${nuovi.length} nodi nuovi: ${nuovi.map((n) => `«${n.name}»`).join(', ')}`,
    `«${PER}» → «${N.compito}» → «${CHIEDI}»`,
    `«${DALL}» → lettura delle pagine → «${LEGGI}»`,
    `«${CONTROLLA}» → «${N.ritocca}» → «${PRONTA}»`);
  return { flusso: w, modifiche };
}

/** Le operazioni dello strumento n8n update_workflow per passare da «prima» a «dopo» (solo nodi e collegamenti). */
export function operazioni(prima, dopo) {
  const ops = [];
  const p = Object.fromEntries(prima.nodes.map((n) => [n.name, n]));
  for (const n of dopo.nodes) {
    if (!p[n.name]) {
      ops.push({ type: 'addNode', node: { id: n.id, name: n.name, type: n.type, typeVersion: n.typeVersion, position: n.position, parameters: n.parameters } });
      if (n.onError) ops.push({ type: 'setNodeSettings', nodeName: n.name, settings: { onError: n.onError } });
    } else if (JSON.stringify(p[n.name].parameters) !== JSON.stringify(n.parameters)) {
      ops.push({ type: 'updateNodeParameters', nodeName: n.name, parameters: n.parameters, replace: true });
    }
  }
  const archi = (w) => {
    const out = new Set();
    for (const [da, u] of Object.entries(w.connections || {})) (u.main || []).forEach((r, i) => (r || []).forEach((c) => out.add(JSON.stringify([da, i, c.node, c.index || 0]))));
    return out;
  };
  const a = archi(prima);
  const b = archi(dopo);
  for (const x of a) if (!b.has(x)) { const [source, sourceIndex, target, targetIndex] = JSON.parse(x); ops.push({ type: 'removeConnection', source, sourceIndex, target, targetIndex }); }
  for (const x of b) if (!a.has(x)) { const [source, sourceIndex, target, targetIndex] = JSON.parse(x); ops.push({ type: 'addConnection', source, sourceIndex, target, targetIndex }); }
  return ops;
}

async function principale(argv) {
  const valore = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  let originale;
  let api;
  if (valore('--file')) {
    const letto = JSON.parse(readFileSync(valore('--file'), 'utf8'));
    originale = letto.workflow || letto;
  } else {
    const quale = FLUSSI_LETTURA[argv[0]];
    if (!quale) throw new Error('Quale flusso? 12 oppure 26 (o --file flusso.json)');
    api = await import('../n8n-api.mjs');
    const trovato = (await api.elencoFlussi()).find((w) => quale.includes(w.name));
    if (!trovato) throw new Error(`Non trovo «${quale[0]}» su n8n.`);
    originale = await api.leggiFlusso(trovato.id);
    if (valore('--salva')) writeFileSync(valore('--salva'), JSON.stringify(originale, null, 2));
  }
  const { flusso, modifiche } = aggiungiLettura(originale);
  console.log(modifiche.length ? `«${flusso.name}» cambia così:\n- ${modifiche.join('\n- ')}` : `«${flusso.name}» ha già la lettura delle pagine, uguale.`);
  if (valore('--scrivi')) writeFileSync(valore('--scrivi'), JSON.stringify(flusso, null, 2));
  if (valore('--operazioni')) {
    const ops = operazioni(originale, flusso);
    writeFileSync(valore('--operazioni'), JSON.stringify(ops, null, 2));
    console.log(`${ops.length} operazioni scritte in ${valore('--operazioni')}.`);
  }
  if (!modifiche.length || !api) return;
  if (!argv.includes('--manda')) { console.log('Solo controllo: rilancia con --manda per aggiornarlo su n8n.'); return; }
  const esito = await api.creaOAggiorna(flusso);
  console.log(`Aggiornato su n8n: id ${esito.id}, ${esito.attivo ? 'ACCESO' : 'spento'}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principale(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
