// Snellisce i nodi Code che portano dentro il «blocco di aiuti comuni».
//
// Il problema. Nei flussi 06 Storie del giorno, 07 Reel dalle clip e 16 · Montatore lo stesso blocco di
// aiuti (10-15 mila caratteri) è copiato in 40-56 nodi Code, anche dove il nodo ne usa due o tre. Misurato
// il 25/11/2026: circa 1,7 milioni di caratteri ripetuti, due terzi del peso di quei tre flussi.
//
// Cosa fa. In ogni nodo Code il cui codice ha il blocco fra
//   // ===== Aiuti comuni ... =====      e      // ===== fine aiuti comuni =====
// tiene solo le dichiarazioni del blocco che il resto del nodo usa, anche indirettamente (un aiuto che ne
// chiama un altro si porta dietro anche quello). Il resto del nodo non si tocca.
//
// Quando NON snellisce un nodo, e lo lascia com'è: se una parte del blocco non si compila da sola, se il
// blocco usa eval o accessi per nome (globalThis[...], this[...]), se dopo il taglio il codice non si
// compila più. È prudente al contrario: un nome che compare anche solo dentro una stringa conta come usato.
//
// Uso:
//   node flussi/snellisci-aiuti.mjs <flusso.json> [--scrivi <uscita.json>]
// Legge un flusso esportato da n8n e dice quanto si risparmia. Con --scrivi salva il flusso snellito.
// Non parla con n8n: caricarlo è un passo a parte, che si fa solo dopo la copia di sicurezza.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const INIZIO = /^\/\/ ===== Aiuti comuni[^\n]*\n/;
export const FINE = '// ===== fine aiuti comuni =====';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const compila = (codice) => { new AsyncFunction('$', '$input', '$getWorkflowStaticData', codice); };
const PERICOLOSO = /\beval\s*\(|\bglobalThis\s*\[|\bthis\s*\[|\bnew\s+Function\b/;
const DICHIARAZIONE = /^(?:export\s+)?(?:async\s+function\*?|function\*?|const|let|var|class)\s/;

/** Toglie stringhe e commenti, per contare le virgole «vere» di una dichiarazione. */
function senzaStringhe(testo) {
  let fuori = '';
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (c === '/' && testo[i + 1] === '/') { while (i < testo.length && testo[i] !== '\n') i++; continue; }
    if (c === '/' && testo[i + 1] === '*') { i = testo.indexOf('*/', i + 2); if (i < 0) break; i++; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < testo.length && testo[i] !== q) { if (testo[i] === '\\') i++; i++; }
      if (i >= testo.length) return fuori + '\u0000'; // stringa che non si chiude: il pezzo non è sicuro
      fuori += '""';
      continue;
    }
    fuori += c;
  }
  return fuori;
}

/** I nomi che una dichiarazione in testa al pezzo crea. null = non so dirlo con certezza (si tiene sempre). */
//
// Un pezzo si può togliere solo se è UNA dichiarazione sola e senza effetti. Dopo la sua fine non ci
// deve essere nient'altro (né una seconda dichiarazione sulla stessa riga, né un'istruzione come
// «CFG.a = 2»), e una costante deve avere un valore «fermo»: un numero, un testo, una lista, una
// funzione. Una regex dentro una costante o una parentesi che non torna fanno tenere il pezzo.
const CHIAMATE_AMMESSE = /\b(?:new\s+(?:Set|Map)|Object\.freeze)\s*\(/g;
function nomiDichiarati(pezzo) {
  const testa = pezzo.replace(/^(?:\s*\/\/[^\n]*\n|\s*\n)*/, '');
  const pulito = senzaStringhe(testa);
  if (pulito.includes('\u0000')) return null;
  const funzione = pulito.match(/^(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/);
  const classe = !funzione && pulito.match(/^class\s+([A-Za-z_$][\w$]*)/);
  const costante = !funzione && !classe && pulito.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
  if (!funzione && !classe && !costante) return null; // destrutturazione o forma strana
  // Dove finisce la dichiarazione: la graffa che chiude la funzione, o il primo «;» a profondità zero.
  let profondita = 0;
  let fine = -1;
  let aperta = false;
  for (let i = 0; i < pulito.length; i++) {
    const c = pulito[i];
    if ('([{'.includes(c)) { profondita++; if (c === '{') aperta = true; }
    else if (')]}'.includes(c)) {
      profondita--;
      if (profondita < 0) return null;
      if (!costante && c === '}' && profondita === 0 && aperta) { fine = i + 1; break; }
    } else if (costante && c === ',' && profondita === 0) return null; // «const A = 1, B = 2»
    else if (costante && c === ';' && profondita === 0) { fine = i + 1; break; }
  }
  if (fine < 0) { if (!costante || profondita !== 0) return null; fine = pulito.length; }
  if (pulito.slice(fine).replace(/[\s;]/g, '') !== '') return null; // qualcos'altro dopo la dichiarazione
  if (classe && /\bstatic\b/.test(pulito)) return null; // un blocco static gira subito
  if (costante) {
    const valore = pulito.slice(pulito.indexOf('=') + 1, fine).trim();
    const eFunzione = /^(?:async\s+)?(?:function\b|\([^()]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.test(valore);
    if (!eFunzione) {
      if (valore.includes('/') && !/^[\w$.]+(?:\s*[*+\-/]\s*[\w$.]+)*$/.test(valore)) return null; // forse una regex
      if (/(?<![=!<>])=(?![=>])|\+\+|--|\$\s*\(/.test(valore)) return null; // un'assegnazione o $('…')
      if (/\(/.test(valore.replace(CHIAMATE_AMMESSE, ''))) return null; // una chiamata: può avere effetti
      if (/[\w$\])]\s*(?:\?\.|\.(?!\d)|\[)/.test(valore.replace(CHIAMATE_AMMESSE, '').replace(/\b\d+\.\d*/g, '0'))) return null; // legge una proprietà: un getter può avere effetti
      if (/\bget\s+[\w$]+\s*\(|\bset\s+[\w$]+\s*\(/.test(valore)) return null;
    }
  }
  return [(funzione || classe || costante)[1]];
}

/** Divide il blocco nei pezzi di primo livello: ogni dichiarazione a inizio riga apre un pezzo. */
export function dividiBlocco(blocco) {
  const righe = blocco.split('\n');
  const pezzi = [];
  let corrente = [];
  let commenti = [];
  const chiudi = () => { if (corrente.length) pezzi.push(corrente.join('\n')); corrente = []; };
  for (const riga of righe) {
    if (DICHIARAZIONE.test(riga)) { chiudi(); corrente = [...commenti, riga]; commenti = []; continue; }
    if (/^\/\//.test(riga) || riga.trim() === '') {
      // Un commento a inizio riga va col pezzo che segue; dentro un pezzo aperto resta lì.
      if (corrente.length && /^\s/.test(riga)) corrente.push(riga);
      else commenti.push(riga);
      continue;
    }
    if (!corrente.length) { corrente = [...commenti]; commenti = []; }
    corrente.push(...commenti, riga);
    commenti = [];
  }
  chiudi();
  if (commenti.length) pezzi.push(commenti.join('\n'));
  return pezzi.map((testo) => {
    const solo_commenti = testo.split('\n').every((r) => r.trim() === '' || /^\s*\/\//.test(r));
    return { testo, nomi: solo_commenti ? [] : nomiDichiarati(testo), solo_commenti };
  });
}

const usa = (testo, nome) => new RegExp(`(?<![\\w$])${nome.replace(/\$/g, '\\$')}(?![\\w$])`).test(testo);

/** Snellisce il codice di un nodo. Ritorna { codice, cambiato, motivo, tolti }. */
export function snellisciCodice(codice) {
  const inizio = codice.match(INIZIO);
  const fine = codice.indexOf(FINE);
  if (!inizio || inizio.index !== 0 || fine < 0) return { codice, cambiato: false, motivo: 'senza blocco' };
  const testata = inizio[0];
  const blocco = codice.slice(testata.length, fine);
  const corpo = codice.slice(fine);
  if (PERICOLOSO.test(blocco) || PERICOLOSO.test(corpo)) return { codice, cambiato: false, motivo: 'accesso per nome' };

  const pezzi = dividiBlocco(blocco);
  // La divisione non deve perdere né aggiungere niente: rimessi insieme, i pezzi sono il blocco.
  if (pezzi.map((p) => p.testo).join('\n') !== blocco) return { codice, cambiato: false, motivo: 'divisione non fedele' };
  for (const p of pezzi) {
    if (p.solo_commenti) continue;
    try { compila(p.testo); } catch { return { codice, cambiato: false, motivo: 'un pezzo non si compila da solo' }; }
  }

  // Si tiene: ogni pezzo senza nome certo, e ogni pezzo con un nome usato dal corpo o da un pezzo tenuto.
  const tieni = new Set(pezzi.map((p, i) => (p.nomi === null ? i : -1)).filter((i) => i >= 0));
  let cambiato = true;
  while (cambiato) {
    cambiato = false;
    const vivo = [corpo, ...[...tieni].map((i) => pezzi[i].testo)].join('\n');
    pezzi.forEach((p, i) => {
      if (tieni.has(i) || p.solo_commenti || !p.nomi) return;
      if (p.nomi.some((n) => usa(vivo, n))) { tieni.add(i); cambiato = true; }
    });
  }

  const tolti = pezzi.flatMap((p, i) => (!tieni.has(i) && !p.solo_commenti ? p.nomi : []));
  if (!tolti.length) return { codice, cambiato: false, motivo: 'usa tutto il blocco', tolti: [] };
  const nuovo = testata
    + `// (Snellito: qui restano solo gli aiuti che questo nodo usa; tolti ${tolti.length}.)\n`
    + pezzi.filter((p, i) => tieni.has(i)).map((p) => p.testo).join('\n')
    + '\n' + corpo;
  try { compila(nuovo); } catch { return { codice, cambiato: false, motivo: 'dopo il taglio non si compila' }; }
  const rimasti = tolti.filter((n) => usa(nuovo, n));
  if (rimasti.length) return { codice, cambiato: false, motivo: `nome tolto ancora usato: ${rimasti[0]}` };
  return { codice: nuovo, cambiato: true, motivo: 'snellito', tolti };
}

/** Snellisce tutti i nodi Code di un flusso. Non cambia nient'altro. */
export function snellisciFlusso(flusso) {
  const prima = JSON.stringify(flusso.nodes).length;
  const resoconto = [];
  const nodes = flusso.nodes.map((n) => {
    const codice = n.parameters && typeof n.parameters.jsCode === 'string' ? n.parameters.jsCode : null;
    if (codice === null) return n;
    const r = snellisciCodice(codice);
    if (r.motivo !== 'senza blocco') resoconto.push({ nodo: n.name, motivo: r.motivo, tolti: (r.tolti || []).length });
    return r.cambiato ? { ...n, parameters: { ...n.parameters, jsCode: r.codice } } : n;
  });
  const nuovo = { ...flusso, nodes };
  return { flusso: nuovo, prima, dopo: JSON.stringify(nodes).length, resoconto };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [percorso, ...resto] = process.argv.slice(2);
  if (!percorso) { console.error('Uso: node flussi/snellisci-aiuti.mjs <flusso.json> [--scrivi <uscita.json>]'); process.exit(2); }
  const { flusso, prima, dopo, resoconto } = snellisciFlusso(JSON.parse(readFileSync(percorso, 'utf8')));
  const snelliti = resoconto.filter((r) => r.motivo === 'snellito').length;
  console.log(`${flusso.name}: ${prima} → ${dopo} caratteri nei nodi (−${Math.round((1 - dopo / prima) * 100)}%), ${snelliti} nodi snelliti su ${resoconto.length} col blocco.`);
  for (const r of resoconto.filter((x) => x.motivo !== 'snellito')) console.log(`  lasciato com'è: ${r.nodo} — ${r.motivo}`);
  const i = resto.indexOf('--scrivi');
  if (i >= 0 && resto[i + 1]) { writeFileSync(resto[i + 1], JSON.stringify(flusso, null, 2)); console.log(`Scritto in ${resto[i + 1]}`); }
}
