// Prova delle prove ("mutazioni"): rompe di proposito il codice in un punto alla volta, su una copia,
// e controlla che la prova giusta diventi ROSSA. Se una mutazione "sopravvive", la prova non serve a niente.
// Uso: npm run mutazioni   (oppure: node test/mutazioni.mjs 3 7  per lanciarne solo alcune)
//      node test/mutazioni.mjs --controllo   stesse prove sulla copia NON rotta: devono essere tutte verdi
//      (così una mutazione "uccisa" non è un falso allarme dovuto all'ambiente della copia)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(RADICE, 'test', '.tmp');

const M = [
  ['chiave non controllata', 'src/server.js', 'if (!req.autorizzato) {', 'if (false) {', 'test/01-base.test.js', '401'],
  ['/salute dice tutto anche senza chiave', 'src/server.js', 'if (!req.autorizzato) return { ok: true };', '', 'test/01-base.test.js', 'salute senza'],
  ['niente controllo del percorso dei file', 'src/lavori.js', "if (!RE_ID.test(id) || !RE_NOME_FILE.test(nome) || nome.includes('..')) return null;", '', 'test/01-base.test.js', 'errori nel formato'],
  ['limite totale della richiesta spento', 'src/upload.js', 'if (totale > cfg.maxTotaleByte)', 'if (false)', 'test/01-base.test.js', 'limiti'],
  ['estensione invece del ritaglio', 'src/immagini.js', "resize(W, H, { fit: 'cover', position: sharp.strategy.attention });\n    img = applicaStile", "resize(W, H, { fit: 'contain', background: '#000000' });\n    img = applicaStile", 'test/02-foto.test.js', 'misure esatte'],
  ['foto piccola ingrandita', 'src/immagini.js', 'const scala = Math.min(1, obiettivo.w / cw);', 'const scala = obiettivo.w / cw;', 'test/02-foto.test.js', 'piccola'],
  ['provino più grande di 1568 px', 'src/immagini.js', 'export const LATO_ANTEPRIMA = 1568;', 'export const LATO_ANTEPRIMA = 2000;', 'test/02-foto.test.js', 'provino: 12'],
  ['JPEG oltre il limite di byte', 'src/immagini.js', 'if (buf.length <= limiteByte) return { buf, qualita: q };', 'return { buf, qualita: q };', 'test/02-foto.test.js', 'jpegEntro'],
  ['doppioni non riconosciuti', 'src/immagini.js', 'export const SOGLIA_DOPPIONE = 10;', 'export const SOGLIA_DOPPIONE = -1;', 'test/02-foto.test.js', 'provino: 12'],
  ['testo nei 250 px in alto', 'src/grafiche.js', 'const z0 = storia ? STORIA.alto + RESPIRO : 64;', 'const z0 = storia ? 40 : 64;', 'test/03-grafica.test.js', '«titolo»'],
  ['testo nei 340 px in basso', 'src/grafiche.js', 'const z1 = storia ? H - STORIA.basso - RESPIRO : H - 64;', 'const z1 = storia ? H - 60 : H - 64;', 'test/03-grafica.test.js', '«fascia»'],
  ['testo che non entra accettato lo stesso', 'src/grafiche.js', 'if (altezza <= altezzaMax) return { elemento, altezza, scala: s };', 'return { elemento, altezza, scala: s };', 'test/03-grafica.test.js', '422'],
  ['parola lunghissima non controllata', 'src/grafiche.js', 'if (parolaMax > larghezza) continue;', '', 'test/03-grafica.test.js', 'lunghissima'],
  ['coda senza limite', 'src/coda.js', 'if (this.prenotati >= 1 + this.maxAttesa) return null;', '', 'test/07-coda-pulizia.test.js', 'coda piena|Coda:'],
  ['più lavori pesanti insieme', 'src/coda.js', 'if (!this.occupato) {', 'if (true) {', 'test/07-coda-pulizia.test.js', 'due video|Coda:'],
  ['file mai scaduti', 'src/lavori.js', 'return ora - statDir.mtimeMs > durataMs;', 'return false;', 'test/07-coda-pulizia.test.js', 'pulizia|scaduto'],
  ['storia video oltre 60 s', 'src/video.js', 'const LIMITE_STORIA = 59.9;', 'const LIMITE_STORIA = 75;', 'test/05-video.test.js', '75 s'],
  ['niente faststart', 'src/video.js', "'-movflags', '+faststart',", '', 'test/05-video.test.js', 'durata_max'],
  ['volume a -22 LUFS invece di -14', 'src/video.js', 'return `loudnorm=I=-14:', 'return `loudnorm=I=-22:', 'test/05-video.test.js', 'reel da 30 s'],
  ['sottotitoli non spostati sui tagli', 'src/srt.js', 'out.push({ inizio: s.offset + (i - a), fine: s.offset + (e - a), testo: f.testo })', 'out.push({ inizio: i - a, fine: e - a, testo: f.testo })', 'test/05-video.test.js', 'sottotitoli spostati'],
  ['sottotitoli nell\'area sicura in basso', 'src/srt.js', '0, 2, 90, 90, 420, 1,', '0, 2, 90, 90, 40, 1,', 'test/05-video.test.js', 'sottotitoli spostati'],
  ['allucinazioni di whisper tenute', 'src/trascrizione.js', 'if (!testo || ALLUCINAZIONI.some((re) => re.test(testo))) continue;', 'if (!testo) continue;', 'test/06-trascrivi.test.js', 'finto'],
  ['whisper lanciato anche sul silenzio', 'src/trascrizione.js', 'if (picco > -45) {', 'if (true) {', 'test/06-trascrivi.test.js', 'finto'],
  // --- giro di correzione del 15/11/2026 (difetti del collaudo e allineamento)
  ['whisper con --vad (tempi sbagliati, frase ripetuta persa)', 'src/trascrizione.js', "'-of', uscita, '-f', wav];", "'-of', uscita, '-f', wav, '--vad', '-vm', cfg.whisperVad];", 'test/06-trascrivi.test.js', 'finto'],
  ['tempi di whisper non stretti sul parlato', 'src/trascrizione.js', 'if (!Array.isArray(zone)) return segmenti;', 'return segmenti;', 'test/06-trascrivi.test.js', 'pause lunghe'],
  ['frasi sopra il silenzio tenute', 'src/trascrizione.js', 'if (!tocca.length) continue;', 'if (!tocca.length) { out.push(s); continue; }', 'test/06-trascrivi.test.js', 'pause lunghe'],
  ['zone del VAD lette in secondi invece che in centesimi', 'src/trascrizione.js', '.map((m) => ({ inizio: r3(Number(m[1]) / 100), fine: r3(Number(m[2]) / 100) }))', '.map((m) => ({ inizio: r3(Number(m[1])), fine: r3(Number(m[2])) }))', 'test/06-trascrivi.test.js', 'silero finto'],
  ['limite di 10 campi di testo (segnaposto rifiutati)', 'src/upload.js', 'export const MAX_CAMPI_TESTO = 40;', 'export const MAX_CAMPI_TESTO = 10;', 'test/02-foto.test.js', 'segnaposto'],
  ['logo piccolo anche nel cartello finale', 'src/video.js', "const soloClip = testoOutro ? `:enable='lt(t,${f3(durataClip)})'` : '';", "const soloClip = '';", 'test/05-video.test.js', 'mai due loghi'],
  ['peso del titolo ignorato', 'src/grafiche.js', "fontWeight: r.ruolo === 'titolo' ? pesoTitolo : 400,", "fontWeight: r.ruolo === 'titolo' ? 700 : 400,", 'test/04-font.test.js', 'inclusi'],
  ['font inclusi riscaricati dalla rete', 'src/font.js', 'if (incluso) return caricaIncluso(cfg, nome.trim().toLowerCase());', '', 'test/04-font.test.js', 'inclusi'],
  ['stile del marchio ignorato nelle grafiche', 'src/grafiche.js', 'const stile = normalizzaStile(dati.stile, avvisi);', 'const stile = normalizzaStile({}, avvisi);', 'test/03-grafica.test.js', 'stile'],
  ['GET / chiuso (controllo di salute della piattaforma)', 'src/server.js', "if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) return;", '', 'test/01-base.test.js', 'GET /'],
  // --- ricontrollo del 15/11/2026: due frasi divise da 4-5 s di silenzio in UN segmento di whisper
  ['segmenti di whisper non divisi sui silenzi', 'src/trascrizione.js', 'const PAUSA = 0.8;', 'const PAUSA = 1000;', 'test/06-trascrivi.test.js', 'due frasi'],
  ['parole sentite nel silenzio mostrate lo stesso', 'src/trascrizione.js', 'const FUORI = 1.0;', 'const FUORI = Infinity;', 'test/06-trascrivi.test.js', 'due frasi in un segmento, pausa'],
  ['-dtw senza -nfa (whisper.cpp spegne i tempi per parola)', 'src/trascrizione.js', "['-nfa', '-dtw', dtw]", "['-dtw', dtw]", 'test/06-trascrivi.test.js', 'due frasi in un segmento, pausa'],
  ['testo diviso senza guardare i tempi per parola', 'src/trascrizione.js', 'if (parole) pezzi = dividiConParole(parole, candidati);', 'if (false) pezzi = dividiConParole(parole, candidati);', 'test/06-trascrivi.test.js', 'due frasi in un segmento, pausa'],
  ['una parola con il tempo sbagliato trascina la frase dopo', 'src/trascrizione.js', 'for (let i = 1; i + 1 < k.length; i++) if (k[i - 1] >= 0 && k[i - 1] === k[i + 1]) k[i] = k[i - 1];', '', 'test/08-unita.test.js', 'divisi sui silenzi'],
  ['nome della rete non letto dal modello (niente -dtw in Docker)', 'src/trascrizione.js', 'if (buf.readUInt32LE(0) === 0x67676d6c) {', 'if (false) {', 'test/08-unita.test.js', 'nome della rete'],
];

const controllo = process.argv.includes('--controllo');
const scelte = process.argv.slice(2).map(Number).filter(Boolean);
const risultati = [];
for (const [i, [nome, file, da, a, prova, filtro]] of M.entries()) {
  if (scelte.length && !scelte.includes(i + 1)) continue;
  // la copia sta fuori da test/ (non si può copiare una cartella dentro se stessa)
  const copia = path.join(RADICE, '.locale', 'mutazioni', `mutazione-${i + 1}`);
  fs.rmSync(copia, { recursive: true, force: true });
  fs.mkdirSync(copia, { recursive: true });
  for (const voce of ['src', 'test', 'font', 'strumenti', 'package.json']) fs.cpSync(path.join(RADICE, voce), path.join(copia, voce), { recursive: true, filter: (p) => !p.includes(`${path.sep}.tmp`) });
  fs.symlinkSync(path.join(RADICE, 'node_modules'), path.join(copia, 'node_modules'));
  fs.symlinkSync(path.join(RADICE, '.locale'), path.join(copia, '.locale'));
  const bersaglio = path.join(copia, file);
  const testo = fs.readFileSync(bersaglio, 'utf8');
  const volte = testo.split(da).length - 1;
  if (volte !== 1) {
    risultati.push([i + 1, nome, `ERRORE: il pezzo da mutare compare ${volte} volte`]);
    continue;
  }
  if (!controllo) fs.writeFileSync(bersaglio, testo.replace(da, a));
  const inizio = Date.now();
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', `--test-name-pattern=${filtro}`, prova], {
    cwd: copia,
    env: { ...process.env, OFFICINA_TMP: TMP },
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
  });
  const passate = Number((r.stdout.match(/# pass (\d+)/) || [])[1] || 0);
  const fallite = Number((r.stdout.match(/# fail (\d+)/) || [])[1] || 0);
  let esito;
  if (controllo) esito = r.status === 0 && passate > 0 ? 'OK (copia intatta: tutta verde)' : 'PROBLEMA (la copia intatta non è verde: le mutazioni non sono affidabili)';
  else esito = r.status !== 0 && fallite > 0 ? 'UCCISA (la prova se ne accorge)' : 'SOPRAVVISSUTA (la prova non se ne accorge!)';
  risultati.push([i + 1, nome, `${esito} — ${fallite} rosse / ${passate} verdi, ${((Date.now() - inizio) / 1000).toFixed(0)} s`]);
  console.log(`${i + 1}. ${nome}: ${esito}`);
  fs.rmSync(copia, { recursive: true, force: true });
}
console.log('\nRIEPILOGO MUTAZIONI');
for (const [n, nome, esito] of risultati) console.log(`${String(n).padStart(2)}. ${nome}: ${esito}`);
const vive = risultati.filter((x) => !x[2].startsWith('UCCISA') && !x[2].startsWith('OK'));
console.log(controllo ? `\n${risultati.length - vive.length} su ${risultati.length} verdi sulla copia intatta.` : `\n${risultati.length - vive.length} su ${risultati.length} uccise.`);
process.exit(vive.length ? 1 : 0);
