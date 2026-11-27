// Le mutazioni del flusso 16 · Attività da visitare: le 44 dei primi due collaudi, adattate, più quelle del terzo (27/11/2026).
// Uso: copia il repo in una cartella tua, poi `node flussi/test/mutazioni-16.mjs <copia>`. Ognuna deve far diventare rossa la prova del 16.
// Scrive SOLO nella copia, e rimette ogni file com'era. Non è una prova della raccolta: il nome non finisce in .test.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const COPIA = process.argv[2];
const C = 'flussi/16-attivita-da-visitare/codice/';
const K = 'flussi/16-attivita-da-visitare/costruisci.mjs';
const M = [
  ['M1 byte→caratteri', C + 'prepara-lavoro.js', "const byte = (s) => (typeof Buffer !== 'undefined' ? Buffer.byteLength(s, 'utf8') : unescape(encodeURIComponent(s)).length);", 'const byte = (s) => s.length;'],
  ['M2 tetto 66.000', C + 'prepara-lavoro.js', '> 50000 &&', '> 66000 &&'],
  ['M3 senza già proposte', C + 'metti-in-fila.js', '  if (proposte.has(osm) || nomiProposti.has(chiave)) { conti.gia_proposte++; continue; }\n', ''],
  ['M4 codice di risposta ignorato', C + 'metti-in-fila.js', "  if (r.statusCode && r.statusCode !== 200) motivo = `la mappa ha risposto ${r.statusCode}`;\n  else if", '  if'],
  ['M5 senza il campo data', C + 'metti-in-fila.js', 'const grezzo = r.data !== undefined ? r.data : r.body;', 'const grezzo = r.body;'],
  ['M6 righe anche in prova', C + 'righe-tabella.js', 'if (!VERO || !f.letta', 'if (!f.letta'],
  ['M7a senza il ripiego dei blocchi lunghi', C + 'componi.js', 'blocchi.push(b.length <= 3800 ? b : bloccoDi(a, i, false));', 'blocchi.push(b);'],
  ['M8 tetto 4.300', C + 'componi.js', '+ 2 > 3900)', '+ 2 > 4300)'],
  ['M9 senza alwaysOutputData', K, 'position: pos(5), alwaysOutputData: true, executeOnce: true,', 'position: pos(5), executeOnce: true,'],
  ['M10 senza returnAll', K, 'dataTableId: tabella(), returnAll: true }', 'dataTableId: tabella(), returnAll: false }'],
  ['M11 senza la barriera del marchio', C + 'metti-in-fila.js', "|| marchioAltrui ||", '||'],
  ['M12 manda in prova', C + 'componi.js', 'const manda = VERO;', 'const manda = true;'],
  ['M13 senza già su MyCity', C + 'metti-in-fila.js', '  if (giaSuMyCity(nome)) { conti.gia_su_mycity++; continue; }\n', ''],
  ['G1 stati letti alla lettera', C + 'metti-in-fila.js', '  const s = leggiStato(j.stato);', "  const s = String(j.stato || 'da_visitare').trim().toLowerCase() || 'da_visitare';"],
  ['G1b frasi indovinate (iscritt ovunque)', C + 'metti-in-fila.js', "  return PAROLE_STATO[t] || 'non_capito';", "  return PAROLE_STATO[t] || (/iscritt/.test(t) ? 'iscritta' : /^si\\b/.test(t) ? 'si' : 'non_capito');"],
  ['G1c ok vale sì', C + 'metti-in-fila.js', "si: 'si', yes: 'si',", "si: 'si', yes: 'si', ok: 'si',"],
  ['G1d solo segni = da visitare', C + 'metti-in-fila.js', "  if (!t && grezzo) return 'non_capito';", ''],
  ['G1e nomi dei non capiti tolti dal messaggio', C + 'componi.js', "${elenco ? `: ${elenco}` : ''}", ''],
  ['R2 mappa senza onError', K, "onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,", 'retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,'],
  ['R3 tabella con onError continua', K, "position: pos(5), alwaysOutputData: true, executeOnce: true,\n", "position: pos(5), alwaysOutputData: true, executeOnce: true, onError: 'continueRegularOutput',\n"],
  ['R4 tolto solo tobacco', C + 'metti-in-fila.js', "'no', 'tobacco', 'mobile_phone_accessories'", "'no', 'mobile_phone_accessories'"],
  ['R5 tolti printer_ink energy gas', C + 'metti-in-fila.js', "'mobile_phone_accessories', 'printer_ink', 'energy', 'gas', ", "'mobile_phone_accessories', "],
  ['R6 nome dentro l altro fino a 500 m', C + 'metti-in-fila.js', 'if (d < 30 && v.chiave.length >= 5', 'if (d < 500 && v.chiave.length >= 5'],
  ['R7 nomi corti dentro altri', C + 'metti-in-fila.js', 'v.chiave.length >= 5 && chiave.length >= 5', 'v.chiave.length >= 1 && chiave.length >= 1'],
  ['R8 generico fino a 150 m', C + 'metti-in-fila.js', 'return d < 15 && v.tipo === tipoGrezzo && (generico || v.generico);', 'return d < 150 && v.tipo === tipoGrezzo && (generico || v.generico);'],
  ['R9 schema senza maxLength', C + 'prepara-lavoro.js', "chi_e: { type: 'string', maxLength: 500 }", "chi_e: { type: 'string' }"],
  ['R13 obi tolto', C + 'metti-in-fila.js', "new Set(['coin', 'obi', ", "new Set(['coin', "],
  ['N1 supermercati di nuovo dentro', C + 'metti-in-fila.js', "  'supermarket', 'department_store',", "  'department_store',"],
  ['N2 poltronesofa tolta', C + 'metti-in-fila.js', '|poltronesofa|', '|'],
  ['N3 crudo tolto', C + 'metti-in-fila.js', "'tim', 'crudo', ", "'tim', "],
  ['N4 generici non più per ultimi', C + 'metti-in-fila.js', 'for (const e of inOrdine) {', 'for (const e of elementi) {'],
  ['N5 tabacc solo a inizio parola', C + 'metti-in-fila.js', 'const NOME_ESCLUSO = /tabacc|', 'const NOME_ESCLUSO = /\\btabacc|'],
  ['M7c nessun accorciamento dei campi', C + 'componi.js', "const corto = (v, n) => { const t = Array.from(String(v ?? '').replace(/\\s+/g, ' ').trim()); return t.length > n ? `${t.slice(0, n - 1).join('')}…` : t.join(''); };", "const corto = (v) => String(v ?? '');"],
  ['N6 taglio per unità e non per caratteri', C + 'componi.js', "const t = Array.from(String(v ?? '').replace(/\\s+/g, ' ').trim());", "const t = String(v ?? '').replace(/\\s+/g, ' ').trim().split('');"],
  ['m1 senza il nome dentro l\'altro', C + 'metti-in-fila.js', "if (d < 30 && v.chiave.length >= 5", 'if (false && v.chiave.length >= 5'],
  ['m1c senza i nomi generici', C + 'metti-in-fila.js', 'return d < 15 && v.tipo === tipoGrezzo && (generico || v.generico);', 'return false;'],
  ['m1d nomi generici senza guardare il tipo', C + 'metti-in-fila.js', 'return d < 15 && v.tipo === tipoGrezzo && (generico || v.generico);', 'return d < 15 && (generico || v.generico);'],
  ['m1e civici diversi ignorati', C + 'metti-in-fila.js', 'if (civico && v.civico && civico !== v.civico) return false;', ''],
  ['m1f stesso tipo vicino = doppione', C + 'metti-in-fila.js', 'return d < 15 && v.tipo === tipoGrezzo && (generico || v.generico);', 'return d < 15 && v.tipo === tipoGrezzo;'],
  ['m1b apostrofo con lo spazio', C + 'metti-in-fila.js', "const chiaveNome = (s) => norm(s).replace(/ /g, '');", 'const chiaveNome = (s) => norm(s);'],
  ['m2 senza i nomi esclusi', C + 'metti-in-fila.js', '|| NOME_ESCLUSO.test(norm(nome))) { conti.categorie_escluse++', ') { conti.categorie_escluse++'],
  ['m4 marchio uguale al nome = catena', C + 'metti-in-fila.js', 'const marchioAltrui = t.brand && !chiaveNome(nome).includes(chiaveNome(t.brand));', 'const marchioAltrui = !!t.brand;'],
  ['m5 shop=yes escluso', C + 'metti-in-fila.js', "const ESCLUSE = new Set(['vacant', ", "const ESCLUSE = new Set(['yes', 'vacant', "],
  ['m8 neverError rimesso', K, 'neverError: false', 'neverError: true'],
  ['T1 metro di nuovo nei nomi esatti', C + 'metti-in-fila.js', "'crudo', 'md', 'sma']);", "'crudo', 'md', 'sma', 'metro']);"],
  ['T2 429 non tradotto', C + 'metti-in-fila.js', "motivo = 'la mappa ha detto «troppe richieste» anche dopo 3 tentativi';", "motivo = `la mappa non ha risposto (${testo})`;"],
  ['T2b tempo scaduto non tradotto', C + 'metti-in-fila.js', "motivo = 'la mappa non ha risposto in tempo, anche dopo 3 tentativi';", "motivo = `la mappa non ha risposto (${testo})`;"],
  ['T3 taglio a 60 per unità', C + 'metti-in-fila.js', "Array.from(String(v ?? '')).slice(0, 60).join('');", "String(v ?? '').slice(0, 60);"],
  ['T4 dossier parziale non detto', C + 'componi.js', "(conDossier && conDossierN < f.fila.length ?", "(false ?"],
  ['T4b id senza node/ non riconosciuto', C + 'componi.js', "const schedaDi = (a) => schede[a.osm] || schede[String(a.osm).split('/').pop()];", 'const schedaDi = (a) => schede[a.osm];'],
  ['T4c avvisi dell AD persi', C + 'componi.js', '(avvisiAD.length ?', '(false ?'],
  ['T4d fonte persa', C + 'componi.js', "if (/^https:\\/\\/[^\\s\"<>]+$/.test(String(s.fonte || '')))", 'if (false)'],
  ['T4e fonte persa nella tabella', C + 'righe-tabella.js', ", s.fonte && `Fonte: ${s.fonte}`]", ']'],
  ['T5 elenco vuoto preso per buono', C + 'metti-in-fila.js', 'if (Array.isArray(j.elements) && j.elements.length) elementi = j.elements;', 'if (Array.isArray(j.elements)) elementi = j.elements;'],
  ['T6 righe doppie contate due volte', C + 'metti-in-fila.js', 'for (const j of ultimaRiga.values()) {', "for (const j of $('Leggi le attività già proposte').all().map((x) => x.json).filter((x) => x && x.osm)) {"],
  ['T7 nome già proposto ignorato', C + 'metti-in-fila.js', '|| nomiProposti.has(chiave))', ')'],
  ['T7b nomi generici bloccano', C + 'metti-in-fila.js', 'if (n.length >= 5 && !GENERICO.test(norm(j.nome))) nomiProposti.add(n);', 'if (n.length >= 1) nomiProposti.add(n);'],
  ['H1 link Maps non protetto', C + 'componi.js', '<a href="${esc(a.mappa)}">', '<a href="${a.mappa}">'],
  ['H2 nome dei non capiti non protetto', C + 'componi.js', '`${esc(x.nome)} («${esc(x.stato)}»)`', '`${x.nome} («${esc(x.stato)}»)`'],
  ['H3 stato dei non capiti non protetto', C + 'componi.js', '`${esc(x.nome)} («${esc(x.stato)}»)`', '`${esc(x.nome)} («${x.stato}»)`'],
  ['H4 motivo della mappa non protetto', C + 'componi.js', "${esc(f.motivo || 'la mappa non ha risposto')}", "${f.motivo || 'la mappa non ha risposto'}"],
  ['H5 errore dell AD non protetto', C + 'componi.js', "${esc((ad && (ad.errore ||", "${((ad && (ad.errore ||"],
  ['H6 indirizzo non protetto', C + 'componi.js', '[a.indirizzo && esc(corto(a.indirizzo, 120)),', '[a.indirizzo && corto(a.indirizzo, 120),'],
  ['H7 no tolti dalle visitate', C + 'componi.js', '(st.visitata || 0) + (st.si || 0) + (st.no || 0) + (st.iscritta || 0)', '(st.visitata || 0) + (st.si || 0) + (st.iscritta || 0)'],
];
for (const [nome, file, da, a] of M) {
  const p = `${COPIA}/${file}`;
  const orig = readFileSync(p, 'utf8');
  const volte = orig.split(da).length - 1;
  if (volte !== 1) { console.log(`${nome}: SALTATA (${volte})`); continue; }
  writeFileSync(p, orig.replace(da, a));
  let esito;
  try { execSync('node --test flussi/test/16-attivita-da-visitare.test.mjs', { cwd: COPIA, stdio: 'pipe' }); esito = 'VERDE (sopravvive)'; } catch { esito = 'rossa'; }
  writeFileSync(p, orig);
  console.log(`${nome}: ${esito}`);
}
