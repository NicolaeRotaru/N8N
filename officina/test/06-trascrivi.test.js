// Prove trascrizione. Sempre: con un FINTO whisper (stesso formato d'uscita del vero) per il contratto.
// Se in .locale/ ci sono whisper.cpp compilato, il modello e la voce sintetica italiana, anche con il whisper VERO.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { avviaServer, chiama, scarica, creaClip, campionaMemoria, percorsoLocale, ffmpeg, CHIAVE, RADICE, MATERIALE, TMP } from './aiuti.js';

const serverDaFermare = [];
after(async () => {
  for (const s of serverDaFermare) await s.ferma();
});

function modelloFinto() {
  const p = path.join(MATERIALE, 'modello-finto.bin');
  if (!fs.existsSync(p)) fs.writeFileSync(p, Buffer.alloc(2 * 1024 * 1024, 1));
  return p;
}

test('/video/trascrivi (whisper finto): segmenti per clip, SRT sulla linea delle clip intere, silenzi e allucinazioni scartati', async () => {
  const registro = path.join(TMP, `registro-whisper-${process.pid}.txt`);
  fs.rmSync(registro, { force: true });
  const registroVad = path.join(TMP, `registro-vad-${process.pid}.txt`);
  fs.rmSync(registroVad, { force: true });
  const s = await avviaServer({
    WHISPER_BIN: path.join(RADICE, 'test', 'finto-whisper.mjs'),
    WHISPER_MODELLO: modelloFinto(),
    WHISPER_VAD: modelloFinto(),
    WHISPER_VAD_BIN: path.join(RADICE, 'test', 'finto-vad.mjs'),
    FINTO_WHISPER_REGISTRO: registro,
    FINTO_VAD_REGISTRO: registroVad,
  });
  serverDaFermare.push(s);
  const salute = await (await fetch(`${s.base}/salute`, { headers: { 'x-officina-chiave': CHIAVE } })).json();
  assert.equal(salute.whisper, true);

  const c0 = creaClip('tr-voce-a.mp4', { w: 640, h: 360, durata: 6 });
  const c1 = creaClip('tr-senza-audio.mp4', { w: 640, h: 360, durata: 4, audio: 'nessuno' });
  const c2 = creaClip('tr-muta.mp4', { w: 640, h: 360, durata: 5, audio: 'muto' });
  const c3 = creaClip('tr-voce-b.mp4', { w: 640, h: 360, durata: 6 });
  const r = await chiama(s.base, '/video/trascrivi', { file: { clip: [c0, c1, c2, c3] }, dati: { lingua: 'it' } });
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  assert.deepEqual(Object.keys(r.json).sort(), ['id', 'segmenti', 'srt', 'testo_completo']);
  assert.deepEqual(r.json.segmenti, [
    { clip: 0, inizio: 0.5, fine: 2, testo: 'Benvenuti da noi.' },
    { clip: 0, inizio: 3.8, fine: 5.5, testo: 'Oggi pasta fresca.' },
    { clip: 3, inizio: 0.5, fine: 2, testo: 'Benvenuti da noi.' },
    { clip: 3, inizio: 3.8, fine: 5.5, testo: 'Oggi pasta fresca.' },
  ]);
  assert.equal(r.json.testo_completo, 'Benvenuti da noi. Oggi pasta fresca. Benvenuti da noi. Oggi pasta fresca.');
  const srt = (await scarica(r.json.srt.url)).buf.toString();
  // clip 3 parte a 6 + 4 + 5 = 15 s sulla linea delle clip intere
  assert.match(srt, /00:00:15,500 --> 00:00:17,000\nBenvenuti da noi\./);
  assert.match(srt, /00:00:00,500 --> 00:00:02,000\nBenvenuti da noi\./);
  assert.doesNotMatch(srt, /QTSS/);
  const chiamate = fs.readFileSync(registro, 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  assert.equal(chiamate.length, 2, 'whisper si chiama solo sulle clip con audio udibile');
  for (const a of chiamate) {
    assert.equal(a[a.indexOf('-l') + 1], 'it');
    assert.equal(a[a.indexOf('-t') + 1], '2');
    assert.ok(a.includes('-oj'));
    // whisper.cpp 1.9.1 con --vad sbaglia i tempi e perde le frasi ripetute: il VAD si usa solo a parte.
    assert.ok(!a.includes('--vad') && !a.includes('-vm'), `whisper chiamato con il VAD: ${JSON.stringify(a)}`);
  }
  const vad = fs.readFileSync(registroVad, 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  assert.equal(vad.length, 2, 'le zone di parlato si cercano sulle stesse clip passate a whisper');
});

// Clip da 32 s: la stessa frase detta a 3,0-7,7 s e a 25,0-29,7 s, silenzio in mezzo (il caso del collaudo).
function clipConPause() {
  const wav = path.join(MATERIALE, 'pause-32s.wav');
  if (!fs.existsSync(wav)) {
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=48000:duration=32', '-af', "volume=enable='lt(t,3)+between(t,7.7,25)+gt(t,29.7)':volume=0,volume=0.5", wav]);
  }
  return creaClip('tr-pause-32s.mp4', { w: 640, h: 360, durata: 32, audio: wav });
}
const PARLATO = [[3.0, 7.7], [25.0, 29.7]];

for (const [nome, vadBin] of [['zone dal VAD (silero finto)', path.join(RADICE, 'test', 'finto-vad.mjs')], ['zone dai silenzi di FFmpeg (ripiego senza VAD)', '/non/esiste']]) {
  test(`/video/trascrivi (whisper finto, pause lunghe, ${nome}): i sottotitoli finiscono col parlato e la frase ripetuta resta`, async () => {
    const s = await avviaServer({
      WHISPER_BIN: path.join(RADICE, 'test', 'finto-whisper.mjs'),
      WHISPER_MODELLO: modelloFinto(),
      WHISPER_VAD: modelloFinto(),
      WHISPER_VAD_BIN: vadBin,
      FINTO_WHISPER_MODO: 'energia',
    });
    serverDaFermare.push(s);
    const r = await chiama(s.base, '/video/trascrivi', { file: { clip: clipConPause() }, dati: { lingua: 'it' } });
    assert.equal(r.stato, 200, JSON.stringify(r.json));
    const seg = r.json.segmenti;
    assert.equal(seg.length, 2, `la frase è detta 2 volte, e la frase inventata nel silenzio va scartata: ${JSON.stringify(seg)}`);
    assert.ok(seg.every((x) => /Benvenuti/.test(x.testo)));
    seg.forEach((x, i) => {
      assert.ok(x.inizio >= PARLATO[i][0] - 0.3, `segmento ${i} parte a ${x.inizio}, il parlato a ${PARLATO[i][0]}`);
      assert.ok(x.fine <= PARLATO[i][1] + 0.5, `segmento ${i} resta sullo schermo fino a ${x.fine}, il parlato finisce a ${PARLATO[i][1]}`);
      assert.ok(x.fine > PARLATO[i][1] - 0.3);
    });
    // nel silenzio in mezzo (16 s) non c'è nessun sottotitolo
    assert.ok(!seg.some((x) => x.inizio <= 16 && x.fine >= 16));
    const srt = (await scarica(r.json.srt.url)).buf.toString();
    assert.doesNotMatch(srt, /00:00:(1\d|2[0-3]),\d{3} -->/, 'nessuna frase deve partire nel silenzio');
  });
}

// Il difetto del ricontrollo (06): whisper mette in UN segmento due frasi divise da 4,5 s di silenzio. Il finto
// whisper (modo «unisce») fa lo stesso: un segmento da 0,5 a 14,8 s con «Ciao a tutti.» (detta a 2,0-5,0 s) e la
// frase lunga (detta a 9,5-12,5 s), più «Grazie a tutti.» sentita nel silenzio dopo. Con i tempi per parola
// (-ojf -nfa -dtw) l'officina deve dividere il segmento nella pausa e togliere le parole sul silenzio.
function clipDueFrasi() {
  const wav = path.join(MATERIALE, 'due-frasi-16s.wav');
  if (!fs.existsSync(wav)) {
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=48000:duration=16', '-af', "volume=enable='lt(t,2)+between(t,5,9.5)+gt(t,12.5)':volume=0,volume=0.5", wav]);
  }
  return creaClip('tr-due-frasi-16s.mp4', { w: 640, h: 360, durata: 16, audio: wav });
}
const DUE_FRASI = [[2.0, 5.0], [9.5, 12.5]];
const LUNGA = 'Oggi pasta fresca fatta a mano, con il ragù della casa e il pane appena sfornato.';

// Nessun sottotitolo dentro una pausa: un segmento può sconfinare solo dei margini (0,1 s prima, 0,25 s dopo).
function nessunoNellePause(seg, pause, margine = 0.4) {
  for (const x of seg) {
    for (const [a, b] of pause) {
      const dentro = Math.min(x.fine, b) - Math.max(x.inizio, a);
      assert.ok(dentro <= margine, `il segmento ${x.inizio}-${x.fine} «${x.testo}» resta acceso ${dentro.toFixed(2)} s nella pausa ${a}-${b}`);
    }
  }
}

for (const [nome, vadBin] of [['zone dal VAD (silero finto)', path.join(RADICE, 'test', 'finto-vad.mjs')], ['zone dai silenzi di FFmpeg (ripiego senza VAD)', '/non/esiste']]) {
  test(`/video/trascrivi (whisper finto, due frasi in un segmento, pausa di 4,5 s, ${nome}): diviso nella pausa con i tempi per parola`, async () => {
    const registro = path.join(TMP, `registro-whisper-unisce-${process.pid}.txt`);
    fs.rmSync(registro, { force: true });
    const s = await avviaServer({
      WHISPER_BIN: path.join(RADICE, 'test', 'finto-whisper.mjs'),
      WHISPER_MODELLO: modelloFinto(),
      WHISPER_VAD: modelloFinto(),
      WHISPER_VAD_BIN: vadBin,
      WHISPER_DTW: 'small', // il modello finto non ha l'intestazione ggml: il nome della rete si impone
      FINTO_WHISPER_MODO: 'unisce',
      FINTO_WHISPER_REGISTRO: registro,
    });
    serverDaFermare.push(s);
    const r = await chiama(s.base, '/video/trascrivi', { file: { clip: clipDueFrasi() }, dati: { lingua: 'it' } });
    assert.equal(r.stato, 200, JSON.stringify(r.json));
    const seg = r.json.segmenti;
    assert.deepEqual(seg.map((x) => x.testo), ['Ciao a tutti.', LUNGA], `una frase per tratto di parlato, niente parole sul silenzio: ${JSON.stringify(seg)}`);
    seg.forEach((x, i) => {
      assert.ok(x.inizio >= DUE_FRASI[i][0] - 0.3, `segmento ${i} parte a ${x.inizio}, il parlato a ${DUE_FRASI[i][0]}`);
      assert.ok(x.fine <= DUE_FRASI[i][1] + 0.5, `segmento ${i} resta acceso fino a ${x.fine}, il parlato finisce a ${DUE_FRASI[i][1]}`);
    });
    nessunoNellePause(seg, [[5.0, 9.5], [12.5, 16]]);
    const srt = (await scarica(r.json.srt.url)).buf.toString();
    assert.doesNotMatch(srt, /00:00:0[6-8],\d{3} -->/, 'nessuna frase deve partire nella pausa');
    assert.doesNotMatch(srt, /Grazie/);
    const [args] = fs.readFileSync(registro, 'utf8').trim().split('\n').map((x) => JSON.parse(x));
    assert.ok(args.includes('-ojf') && args.includes('-nfa') && args[args.indexOf('-dtw') + 1] === 'small', `whisper senza tempi per parola: ${JSON.stringify(args)}`);
  });
}

test('/video/trascrivi (whisper finto, due frasi in un segmento) senza tempi per parola (WHISPER_DTW=no): divisione in proporzione, nessun sottotitolo nella pausa, testo intero', async () => {
  const registro = path.join(TMP, `registro-whisper-nodtw-${process.pid}.txt`);
  fs.rmSync(registro, { force: true });
  const s = await avviaServer({
    WHISPER_BIN: path.join(RADICE, 'test', 'finto-whisper.mjs'),
    WHISPER_MODELLO: modelloFinto(),
    WHISPER_VAD: modelloFinto(),
    WHISPER_VAD_BIN: path.join(RADICE, 'test', 'finto-vad.mjs'),
    WHISPER_DTW: 'no',
    FINTO_WHISPER_MODO: 'unisce',
    FINTO_WHISPER_REGISTRO: registro,
  });
  serverDaFermare.push(s);
  const r = await chiama(s.base, '/video/trascrivi', { file: { clip: clipDueFrasi() }, dati: { lingua: 'it' } });
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  const seg = r.json.segmenti;
  assert.equal(seg.length, 2, JSON.stringify(seg));
  nessunoNellePause(seg, [[5.0, 9.5], [12.5, 16]]);
  assert.equal(r.json.testo_completo, `Ciao a tutti. ${LUNGA} Grazie a tutti.`, 'senza tempi per parola il testo non si tocca: si divide e basta');
  const [args] = fs.readFileSync(registro, 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  assert.ok(!args.includes('-dtw') && !args.includes('-nfa'), JSON.stringify(args));
});

test('/video/trascrivi senza parlato: segmenti vuoti, nessun errore; senza whisper: 503', async () => {
  const s = await avviaServer({ WHISPER_BIN: path.join(RADICE, 'test', 'finto-whisper.mjs'), WHISPER_MODELLO: modelloFinto(), WHISPER_VAD: '/non/esiste' });
  serverDaFermare.push(s);
  const muta = creaClip('tr-muta.mp4', { w: 640, h: 360, durata: 5, audio: 'muto' });
  const r = await chiama(s.base, '/video/trascrivi', { file: { clip: muta }, dati: {} });
  assert.equal(r.stato, 200);
  assert.deepEqual(r.json.segmenti, []);
  assert.equal(r.json.testo_completo, '');
  const lingua = await chiama(s.base, '/video/trascrivi', { file: { clip: muta }, dati: { lingua: 'italiano' } });
  assert.equal(lingua.stato, 400);

  const senza = await avviaServer();
  serverDaFermare.push(senza);
  const r2 = await chiama(senza.base, '/video/trascrivi', { file: { clip: muta } });
  assert.equal(r2.stato, 503);
  assert.equal(r2.json.errore, 'trascrizione_non_disponibile');
});

// ---- whisper VERO (solo se preparato in .locale con strumenti/prepara-whisper-locale.sh)
const BIN = percorsoLocale('whisper.cpp', 'build', 'bin', 'whisper-cli');
const MODELLO = [percorsoLocale('modelli', 'ggml-small.bin'), percorsoLocale('modelli', 'ggml-base.bin')].find((p) => fs.existsSync(p));
const VAD = percorsoLocale('modelli', 'ggml-silero-v5.1.2.bin');
const VAD_BIN = percorsoLocale('whisper.cpp', 'build', 'bin', 'whisper-vad-speech-segments');
const ESPEAK = percorsoLocale('espeak', 'estratto', 'espeakng_loader');
const pronto = fs.existsSync(BIN) && MODELLO && fs.existsSync(ESPEAK);

test('/video/trascrivi con whisper.cpp VERO e voce sintetica italiana', { skip: pronto ? false : 'non provato qui: manca whisper.cpp, il modello o la voce sintetica in .locale/' }, async (t) => {
  const wav = path.join(MATERIALE, 'voce-it.wav');
  if (!fs.existsSync(wav)) {
    const r = spawnSync('python3', ['-I', path.join(RADICE, 'strumenti', 'voce_it.py'), ESPEAK, wav, 'Buongiorno e benvenuti nel nostro locale. Oggi prepariamo la pasta fresca con il pomodoro.'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  }
  const clip = creaClip('tr-voce-it.mp4', { w: 640, h: 360, durata: 8, audio: wav });
  const s = await avviaServer({ WHISPER_BIN: BIN, WHISPER_MODELLO: MODELLO, WHISPER_VAD: VAD, WHISPER_VAD_BIN: VAD_BIN });
  serverDaFermare.push(s);
  const ferma = campionaMemoria(s.pid);
  const inizio = Date.now();
  const r = await chiama(s.base, '/video/trascrivi', { file: { clip }, dati: { lingua: 'it' } });
  const memoria = ferma();
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  const testo = r.json.testo_completo.toLowerCase();
  t.diagnostic(`modello ${path.basename(MODELLO)}: «${r.json.testo_completo}» in ${((Date.now() - inizio) / 1000).toFixed(1)} s, picco memoria ${memoria.piccoTotaleMb} MB ${JSON.stringify(memoria.perProcessoMb)}`);
  fs.writeFileSync(path.join(TMP, 'misura-whisper.json'), JSON.stringify({ modello: path.basename(MODELLO), ...memoria, testo: r.json.testo_completo }, null, 2));
  assert.ok(r.json.segmenti.length >= 1);
  assert.match(testo, /benvenuti/);
  assert.match(testo, /pasta fresca/);
  assert.ok(r.json.segmenti.every((x) => x.clip === 0 && x.fine <= 8.05 && x.inizio >= 0));
  assert.ok(memoria.piccoTotaleMb < 1536);
});

// Il difetto trovato dal collaudo, col whisper VERO: stessa frase detta due volte con 17 s di silenzio in mezzo.
// Con --vad whisper.cpp 1.9.1 dava UN segmento da 2,98 a 29,76 s (sottotitolo acceso nel silenzio, frase persa).
test('/video/trascrivi con whisper.cpp VERO: frase ripetuta dopo una pausa lunga → 2 segmenti che finiscono col parlato', { skip: pronto && fs.existsSync(VAD_BIN) ? false : 'non provato qui: manca whisper.cpp (anche whisper-vad-speech-segments), il modello o la voce in .locale/' }, async (t) => {
  const frase = path.join(MATERIALE, 'voce-it-bar.wav');
  if (!fs.existsSync(frase)) {
    const r = spawnSync('python3', ['-I', path.join(RADICE, 'strumenti', 'voce_it.py'), ESPEAK, frase, 'Benvenuti al bar della piazza. Il caffè del mattino si beve al banco.'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  }
  const wav = path.join(MATERIALE, 'voce-it-due-volte.wav');
  if (!fs.existsSync(wav)) {
    ffmpeg(['-i', frase, '-filter_complex', '[0:a]aresample=16000,asplit=2[a][b];[a]adelay=3000:all=1[a1];[b]adelay=25000:all=1[b1];[a1][b1]amix=inputs=2:duration=longest:normalize=0,apad=whole_dur=34', '-ac', '1', '-ar', '16000', wav]);
  }
  // fine vera di ogni frase, misurata sull'audio (inizio dei silenzi)
  const misura = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-af', 'silencedetect=n=-35dB:d=1', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const fini = [...misura.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1])).filter((x) => x > 0.5);
  assert.ok(fini.length >= 2, misura);
  const clip = creaClip('tr-voce-due-volte.mp4', { w: 640, h: 360, durata: 34, audio: wav });
  const s = await avviaServer({ WHISPER_BIN: BIN, WHISPER_MODELLO: MODELLO, WHISPER_VAD: VAD, WHISPER_VAD_BIN: VAD_BIN });
  serverDaFermare.push(s);
  const ferma = campionaMemoria(s.pid);
  const inizio = Date.now();
  const r = await chiama(s.base, '/video/trascrivi', { file: { clip }, dati: { lingua: 'it' } });
  const memoria = ferma();
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  const seg = r.json.segmenti;
  t.diagnostic(`segmenti ${JSON.stringify(seg)}; fine del parlato ${fini.join(', ')} s; ${((Date.now() - inizio) / 1000).toFixed(1)} s; picco ${memoria.piccoTotaleMb} MB ${JSON.stringify(memoria.perProcessoMb)}`);
  fs.writeFileSync(path.join(TMP, 'misura-whisper-pause.json'), JSON.stringify({ ...memoria, segmenti: seg, fini }, null, 2));
  const conBenvenuti = seg.filter((x) => /benvenut/i.test(x.testo));
  assert.equal(conBenvenuti.length, 2, 'la frase detta due volte deve comparire due volte');
  for (const x of seg) {
    const vicina = fini.find((f) => f >= x.inizio);
    assert.ok(vicina !== undefined && x.fine <= vicina + 1.0, `segmento ${x.inizio}-${x.fine} resta acceso oltre la fine del parlato (${vicina})`);
  }
  assert.ok(!seg.some((x) => x.inizio <= 16 && x.fine >= 16), 'nessun sottotitolo nel silenzio a 16 s');
  assert.ok(memoria.piccoTotaleMb < 1536);
});

// ---- Il difetto del ricontrollo (06), col whisper VERO. Voce sintetica italiana: le tre frasi del ricontrollo.
function voceIt(nome, frase) {
  const wav = path.join(MATERIALE, nome);
  if (!fs.existsSync(wav)) {
    const r = spawnSync('python3', ['-I', path.join(RADICE, 'strumenti', 'voce_it.py'), ESPEAK, wav, frase], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  }
  return wav;
}
const frasiRicontrollo = () => [
  voceIt('ric-f1.wav', 'Stasera musica dal vivo in terrazza.'),
  voceIt('ric-f2.wav', 'Il pane lo sforniamo ogni mattina alle 7.'),
  voceIt('ric-f3.wav', 'Vi aspettiamo in via Garibaldi, a due passi dal Duomo.'),
];

// Pause vere (silenzi oltre 1 s) misurate sulla traccia con la sola voce, senza rumore né musica.
function pauseVere(wavVoce, durata) {
  const err = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', wavVoce, '-af', 'silencedetect=n=-45dB:d=1', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const pause = [];
  let aperto = null;
  for (const m of err.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    if (m[1] === 'start') aperto = Math.max(0, Number(m[2]));
    else if (aperto !== null) {
      pause.push([aperto, Number(m[2])]);
      aperto = null;
    }
  }
  if (aperto !== null) pause.push([aperto, durata]);
  return pause.map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100]);
}

const prontoVad = pronto && fs.existsSync(VAD_BIN) && fs.existsSync(VAD);
const saltaVad = prontoVad ? false : 'non provato qui: manca whisper.cpp (anche whisper-vad-speech-segments), il modello, il VAD o la voce in .locale/';

async function trascriviVero(clip, nomeMisura, t) {
  const s = await avviaServer({ WHISPER_BIN: BIN, WHISPER_MODELLO: MODELLO, WHISPER_VAD: VAD, WHISPER_VAD_BIN: VAD_BIN });
  serverDaFermare.push(s);
  const ferma = campionaMemoria(s.pid);
  const inizio = Date.now();
  const r = await chiama(s.base, '/video/trascrivi', { file: { clip }, dati: { lingua: 'it' } });
  const memoria = ferma();
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  const secondi = (Date.now() - inizio) / 1000;
  t.diagnostic(`segmenti ${JSON.stringify(r.json.segmenti)}; ${secondi.toFixed(1)} s; picco ${memoria.piccoTotaleMb} MB ${JSON.stringify(memoria.perProcessoMb)}`);
  fs.writeFileSync(path.join(TMP, nomeMisura), JSON.stringify({ ...memoria, secondi, segmenti: r.json.segmenti }, null, 2));
  assert.ok(memoria.piccoTotaleMb < 1536, `picco di memoria ${memoria.piccoTotaleMb} MB`);
  return r.json.segmenti;
}

// Clip da 40 s come quella del ricontrollo: frasi a 1, 6, 26 e 34 s su rumore rosa, pause di 2,5 s, 17 s e 4,5 s.
// Prima della correzione whisper.cpp 1.9.1 metteva la frase delle 26 s e quella delle 34 s in UN segmento
// (25-36 s): il sottotitolo restava acceso nella pausa di 4,5 s e mostrava «Stasera…» 8 s prima.
test('/video/trascrivi con whisper.cpp VERO: due frasi divise da 4,5 s di silenzio → due segmenti, nessun sottotitolo nella pausa', { skip: saltaVad }, async (t) => {
  const [f1, f2, f3] = frasiRicontrollo();
  const voce = path.join(MATERIALE, 'ric-pausa45-voce.wav');
  const mix = path.join(MATERIALE, 'ric-pausa45.wav');
  if (!fs.existsSync(mix)) {
    const posa = '[0:a]aresample=16000,volume=0.7,asplit=2[x][y];[x]adelay=1000:all=1[a];[1:a]aresample=16000,volume=0.7,adelay=6000:all=1[b];[2:a]aresample=16000,volume=0.7,adelay=26000:all=1[c];[y]adelay=34000:all=1[d]';
    ffmpeg(['-i', f1, '-i', f2, '-i', f3, '-filter_complex', `${posa};[a][b][c][d]amix=inputs=4:duration=longest:normalize=0,apad=whole_dur=40`, '-ac', '1', '-ar', '16000', '-t', '40', voce]);
    ffmpeg(['-i', f1, '-i', f2, '-i', f3, '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.006:seed=11:sample_rate=16000:duration=40', '-filter_complex', `${posa};[a][b][c][d][3:a]amix=inputs=5:duration=longest:normalize=0,apad=whole_dur=40`, '-ac', '1', '-ar', '16000', '-t', '40', mix]);
  }
  const pause = pauseVere(voce, 40);
  const p45 = pause.find(([a, b]) => a > 28 && b < 36);
  assert.ok(p45 && Math.abs(p45[1] - p45[0] - 4.5) < 0.3, `la clip deve avere una pausa di 4,5 s fra 29 e 34 s: ${JSON.stringify(pause)}`);
  const seg = await trascriviVero(creaClip('tr-ric-pausa45.mp4', { w: 640, h: 360, durata: 40, audio: mix }), 'misura-whisper-pausa45.json', t);
  // prima la pausa di 4,5 s (il caso del ricontrollo), poi tutte le altre
  nessunoNellePause(seg, [p45]);
  assert.ok(!seg.some((x) => x.inizio < 31 && x.fine > 31) && !seg.some((x) => x.inizio < 33 && x.fine > 33), 'nessun sottotitolo a 31 s e a 33 s (pausa di 4,5 s)');
  const prima = seg.filter((x) => x.inizio < p45[0] && x.fine > p45[0] - 2);
  const dopo = seg.filter((x) => x.inizio >= p45[1] - 0.4);
  assert.ok(prima.length && prima.every((x) => !/stasera/i.test(x.testo)), `prima della pausa non si legge già la frase dopo: ${JSON.stringify(prima)}`);
  assert.ok(dopo.some((x) => /stasera/i.test(x.testo)), `la frase dopo la pausa compare quando viene detta: ${JSON.stringify(dopo)}`);
  nessunoNellePause(seg, pause);
});

// Voce sopra musica di sottofondo (accordi sintetici, forti quasi come la voce): frasi a 3,2 s e a 11 s.
// Prima della correzione: un segmento da 0 a 14 s, acceso nei 4,4 s di sola musica fra le due frasi.
test('/video/trascrivi con whisper.cpp VERO: voce su musica di sottofondo → nessun sottotitolo dove c\'è solo musica', { skip: saltaVad }, async (t) => {
  const [, f2, f3] = frasiRicontrollo();
  const voce = path.join(MATERIALE, 'ric-musica-voce.wav');
  const mix = path.join(MATERIALE, 'ric-musica.wav');
  if (!fs.existsSync(mix)) {
    const posa = '[0:a]aresample=16000,adelay=3200:all=1[a];[1:a]aresample=16000,adelay=11000:all=1[b]';
    const musica = "aevalsrc='0.10*(sin(2*PI*(220+55*mod(floor(t*2)\\,4))*t)+sin(2*PI*(330+55*mod(floor(t*2)\\,4))*t)+0.7*sin(2*PI*110*t))*(0.55+0.45*abs(sin(PI*t*2)))':s=16000:d=20";
    ffmpeg(['-i', f2, '-i', f3, '-filter_complex', `${posa};[a][b]amix=inputs=2:duration=longest:normalize=0,apad=whole_dur=20`, '-ac', '1', '-ar', '16000', '-t', '20', voce]);
    ffmpeg(['-i', f2, '-i', f3, '-f', 'lavfi', '-i', musica, '-filter_complex', `${posa};[a][b][2:a]amix=inputs=3:duration=longest:normalize=0,apad=whole_dur=20`, '-ac', '1', '-ar', '16000', '-t', '20', mix]);
  }
  const pause = pauseVere(voce, 20);
  const fraLeFrasi = pause.find(([a, b]) => a > 5 && b < 12);
  assert.ok(fraLeFrasi && fraLeFrasi[1] - fraLeFrasi[0] > 4, `fra le due frasi ci sono più di 4 s di sola musica: ${JSON.stringify(pause)}`);
  const seg = await trascriviVero(creaClip('tr-ric-musica.mp4', { w: 640, h: 360, durata: 20, audio: mix }), 'misura-whisper-musica.json', t);
  assert.ok(seg.length >= 2, JSON.stringify(seg));
  // Margine 0,6 s invece di 0,4: sulla musica silero allunga la fine del parlato di circa 0,3 s (misurato: voce
  // finita a 14,54 s, silero dice 14,81 s). Prima della correzione il sottotitolo restava acceso 4,4 s.
  nessunoNellePause(seg, pause, 0.6);
  const seconda = seg.find((x) => /aspett/i.test(x.testo));
  assert.ok(seconda && seconda.inizio >= fraLeFrasi[1] - 0.4, `«Vi aspettiamo…» compare a ${seconda?.inizio} s, viene detta a ${fraLeFrasi[1]} s`);
});

// Le clip del ricontrollo stesso (contenuti/ricontrollo-officina-06/materiale), se la cartella è indicata in
// OFFICINA_MATERIALE_RICONTROLLO. Tempi del parlato misurati da silero nel ricontrollo (ESITO.md, G1).
const RICONTROLLO = process.env.OFFICINA_MATERIALE_RICONTROLLO || '';
const conRicontrollo = RICONTROLLO && fs.existsSync(path.join(RICONTROLLO, 'oriz-40s.mp4')) && fs.existsSync(path.join(RICONTROLLO, 'voce-musica.mp4'));
for (const [file, durata, parlato] of [
  ['oriz-40s.mp4', 40, [[1.09, 3.49], [5.99, 8.77], [26.15, 29.57], [34.08, 36.48]]],
  ['voce-musica.mp4', 20, [[3.27, 5.95], [11.07, 14.88]]],
]) {
  test(`/video/trascrivi con whisper.cpp VERO sulla clip del ricontrollo ${file}: ogni segmento copre solo parlato`, { skip: prontoVad && conRicontrollo ? false : 'non provato qui: serve OFFICINA_MATERIALE_RICONTROLLO=<cartella materiale del ricontrollo> e whisper.cpp in .locale/' }, async (t) => {
    const seg = await trascriviVero(path.join(RICONTROLLO, file), `misura-whisper-ricontrollo-${path.basename(file, '.mp4')}.json`, t);
    const pause = [];
    let da = 0;
    for (const [a, b] of parlato) {
      if (a - da > 1) pause.push([da, a]);
      da = b;
    }
    if (durata - da > 1) pause.push([da, durata]);
    assert.ok(seg.length >= parlato.length - 1, JSON.stringify(seg));
    nessunoNellePause(seg, pause);
  });
}
