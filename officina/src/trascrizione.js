// Trascrizione dell'audio vero delle clip con whisper.cpp (CLI). Il testo serve per i sottotitoli,
// che poi una persona approva: qui non si riscrive né si "migliora" nulla.
import fs from 'node:fs/promises';
import { accessSync, closeSync, constants, openSync, readSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { esegui } from './processi.js';
import { errore, nonValido } from './errori.js';
import { sonda } from './video.js';
import { scriviSrt } from './srt.js';

// Frasi che whisper "inventa" sul silenzio o sulla musica (allucinazioni note): si scartano solo se sono l'intera frase.
const ALLUCINAZIONI = [
  /^sottotitoli (creati|a cura|e revisione)\b.*$/i,
  /^.*amara\.org.*$/i,
  /^.*\bqtss\b.*$/i,
  /^(iscriviti al canale|grazie per la visione)[.!]*$/i,
  /^\[?\(?\s*(musica|music|applausi|risate|silenzio|rumore|sottofondo)\s*\)?\]?[.!]*$/i,
];

export function whisperDisponibile(cfg) {
  try {
    accessSync(cfg.whisperBin, constants.X_OK);
    return statSync(cfg.whisperModello).size > 1024 * 1024;
  } catch {
    return false;
  }
}

// Il VAD (silero) serve SOLO a sapere dove si parla: whisper-cli gira senza --vad, perché con il VAD acceso
// whisper.cpp 1.9.1 sposta la fine delle frasi fino all'inizio del parlato successivo e perde le frasi ripetute.
function vadDisponibile(cfg) {
  try {
    accessSync(cfg.whisperVadBin, constants.X_OK);
    return statSync(cfg.whisperVad).size > 1000;
  } catch {
    return false;
  }
}

const r3 = (n) => Math.round(n * 1000) / 1000;

// Uscita di whisper-vad-speech-segments: «Speech segment 0: start = 298.00, end = 502.00» (centesimi di secondo).
// null se l'uscita non è quella attesa (allora si usa il ripiego con FFmpeg).
export function leggiZoneVad(testo) {
  const quante = String(testo).match(/Detected (\d+) speech segments/);
  if (!quante) return null;
  const zone = [...String(testo).matchAll(/Speech segment \d+: start = ([\d.]+), end = ([\d.]+)/g)]
    .map((m) => ({ inizio: r3(Number(m[1]) / 100), fine: r3(Number(m[2]) / 100) }))
    .filter((z) => Number.isFinite(z.inizio) && Number.isFinite(z.fine) && z.fine > z.inizio);
  return zone.length === Number(quante[1]) ? zone : null;
}

// Ripiego senza VAD: le zone con suono sono il contrario dei silenzi trovati da silencedetect.
export function zoneDaSilenzi(stderr, durata) {
  const silenzi = [];
  let aperto = null;
  for (const m of String(stderr).matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    const t = Math.max(0, Number(m[2]));
    if (m[1] === 'start') aperto = t;
    else if (aperto !== null) {
      silenzi.push([aperto, t]);
      aperto = null;
    }
  }
  if (aperto !== null) silenzi.push([aperto, durata]);
  const zone = [];
  let t = 0;
  for (const [a, b] of silenzi) {
    if (a - t > 0.05) zone.push({ inizio: r3(t), fine: r3(a) });
    t = Math.max(t, b);
  }
  if (durata - t > 0.05) zone.push({ inizio: r3(t), fine: r3(durata) });
  return zone;
}

const PRIMA = 0.1; // il sottotitolo può comparire 0,1 s prima del parlato
const DOPO = 0.25; // e restare 0,25 s dopo la fine
const MINIMO = 0.3; // durata minima di un sottotitolo
const PAUSA = 0.8; // un silenzio di almeno 0,8 s divide il sottotitolo: whisper a volte mette due frasi in un segmento
const FUORI = 1.0; // una parola che whisper colloca a più di 1 s dal parlato sta sul silenzio: non si mostra

// Tratti di parlato: le zone vicine (silenzio sotto PAUSA) diventano un tratto solo.
export function gruppiParlato(zone, pausa = PAUSA) {
  const gruppi = [];
  for (const z of [...zone].sort((a, b) => a.inizio - b.inizio)) {
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo && r3(z.inizio - ultimo.fine) < pausa) {
      ultimo.fine = Math.max(ultimo.fine, z.fine);
      ultimo.zone.push(z);
    } else gruppi.push({ inizio: z.inizio, fine: z.fine, zone: [z] });
  }
  return gruppi;
}

// Parole di un segmento dai token di whisper (-ojf): testo e inizio allineato (t_dtw, in centesimi → secondi; null se manca).
// La punteggiatura resta attaccata alla parola prima (il suo tempo allineato è spesso sbagliato); quella che apre
// («, (, ¿, il trattino del dialogo) va con la parola dopo. Unite, le parole ridanno esattamente il testo di whisper.
export function paroleDaToken(tokens) {
  const parole = [];
  let prefisso = '';
  for (const tk of tokens || []) {
    const testo = String(tk?.text ?? '');
    if (!testo || /^\[_[A-Z]/.test(testo)) continue; // [_BEG_], [_TT_500]…: token speciali, non testo
    const dtw = Number(tk.t_dtw);
    const t = Number.isFinite(dtw) && dtw >= 0 ? dtw / 100 : null;
    const spazio = /^\s/.test(testo);
    if (!/[\p{L}\p{N}]/u.test(testo)) {
      if (prefisso || !parole.length || (spazio && /^\s*[«“‘([¿¡\-–—]/.test(testo))) prefisso += testo;
      else parole[parole.length - 1].testo += testo;
      continue;
    }
    if (spazio || prefisso || !parole.length) {
      parole.push({ testo: prefisso + testo, t });
      prefisso = '';
    } else parole[parole.length - 1].testo += testo;
  }
  if (prefisso && parole.length) parole[parole.length - 1].testo += prefisso;
  return parole;
}

const unisci = (pezzi) => pezzi.join('').replace(/\s+/g, ' ').trim();
const distanza = (t, g) => (t < g.inizio ? g.inizio - t : t > g.fine ? t - g.fine : 0);

// Ogni parola va nel tratto di parlato più vicino al suo inizio allineato; oltre FUORI sta sul silenzio e si toglie.
function dividiConParole(parole, candidati) {
  const k = parole.map((p) => {
    let migliore = -1;
    let dMin = Infinity;
    candidati.forEach((g, i) => {
      const d = distanza(p.t, g);
      if (d < dMin) {
        dMin = d;
        migliore = i;
      }
    });
    return dMin <= FUORI ? migliore : -1;
  });
  // Un tempo sbagliato isolato (una parola sola fuori posto fra due dello stesso tratto) non sposta la parola.
  for (let i = 1; i + 1 < k.length; i++) if (k[i - 1] >= 0 && k[i - 1] === k[i + 1]) k[i] = k[i - 1];
  if (k.length > 1 && k[1] >= 0 && k[0] > k[1]) k[0] = k[1];
  // Le parole non tornano mai indietro nel tempo.
  let massimo = -1;
  for (let i = 0; i < k.length; i++) {
    if (k[i] < 0) continue;
    if (k[i] < massimo) k[i] = massimo;
    massimo = k[i];
  }
  const pezzi = [];
  parole.forEach((p, i) => {
    if (k[i] < 0) return;
    const ultimo = pezzi[pezzi.length - 1];
    if (ultimo && ultimo.k === k[i]) ultimo.parole.push(p.testo);
    else pezzi.push({ k: k[i], parole: [p.testo] });
  });
  return pezzi.map((x) => ({ gruppo: candidati[x.k], testo: unisci(x.parole) })).filter((x) => x.testo);
}

// Ripiego senza tempi per parola: il testo si divide in proporzione al parlato di ogni tratto, sui confini fra
// parole, preferendo la fine di una frase vicina. Meno preciso, ma nessun sottotitolo copre una pausa.
function dividiInProporzione(s, candidati) {
  const pesi = candidati.map((g) => g.zone.reduce((t, z) => t + Math.max(0, Math.min(z.fine, s.fine) - Math.max(z.inizio, s.inizio)), 0));
  const totale = pesi.reduce((a, b) => a + b, 0);
  const parole = s.testo.split(' ');
  const lunghezze = parole.map((p) => p.length + 1);
  const caratteri = lunghezze.reduce((a, b) => a + b, 0);
  const tolleranza = Math.max(6, 0.15 * caratteri);
  const tagli = [];
  let cumulato = 0;
  for (let j = 0; j + 1 < candidati.length; j++) {
    cumulato += pesi[j];
    const obiettivo = (cumulato / totale) * caratteri;
    const prima = tagli.length ? tagli[tagli.length - 1] : 0;
    let migliore = -1;
    let punteggioMin = Infinity;
    let pos = 0;
    for (let i = 0; i + 1 < parole.length; i++) {
      pos += lunghezze[i];
      if (i + 1 <= prima) continue;
      const d = Math.abs(pos - obiettivo);
      const punteggio = /[.!?…;:]$/.test(parole[i]) && d <= tolleranza ? d - tolleranza : d;
      if (punteggio < punteggioMin) {
        punteggioMin = punteggio;
        migliore = i + 1;
      }
    }
    if (migliore < 0) break;
    tagli.push(migliore);
  }
  const pezzi = [];
  let da = 0;
  tagli.forEach((t, j) => {
    pezzi.push({ gruppo: candidati[j], testo: parole.slice(da, t).join(' ') });
    da = t;
  });
  pezzi.push({ gruppo: candidati[tagli.length], testo: parole.slice(da).join(' ') });
  return pezzi;
}

// Un segmento di whisper diventa un pezzo per ogni tratto di parlato in cui cadono le sue parole. Ogni pezzo sta
// dentro il segmento di whisper E dentro il suo tratto (al massimo PRIMA prima e DOPO dopo): i tempi non si allargano.
// Un segmento che non tocca nessun tratto resta com'è: lo scarta correggiTempi (sta sul silenzio).
function dividiSulParlato(s, gruppi) {
  const candidati = gruppi.filter((g) => g.zone.some((z) => Math.min(z.fine, s.fine) - Math.max(z.inizio, s.inizio) > 0.05));
  if (!candidati.length) return [{ inizio: s.inizio, fine: s.fine, testo: s.testo }];
  const parole = Array.isArray(s.parole) && s.parole.length && s.parole.every((p) => Number.isFinite(p.t)) ? s.parole : null;
  let pezzi;
  if (parole) pezzi = dividiConParole(parole, candidati);
  else if (candidati.length === 1) pezzi = [{ gruppo: candidati[0], testo: s.testo }];
  else pezzi = dividiInProporzione(s, candidati);
  return pezzi.map(({ gruppo, testo }) => ({
    inizio: Math.max(s.inizio, gruppo.inizio - PRIMA),
    fine: Math.min(s.fine, gruppo.fine + DOPO),
    testo,
  }));
}

// Tempi di whisper (a grana grossa) divisi sui silenzi e stretti sulle zone dove si parla davvero: mai allargati.
// Una frase che non tocca nessuna zona di parlato sta sul silenzio: è inventata e si scarta.
// zone = null → zone sconosciute: restano i tempi di whisper.
export function correggiTempi(segmenti, zone) {
  if (!Array.isArray(zone)) return segmenti;
  const gruppi = gruppiParlato(zone);
  const out = [];
  for (const s of segmenti.flatMap((x) => dividiSulParlato(x, gruppi))) {
    const tocca = zone.filter((z) => Math.min(z.fine, s.fine) - Math.max(z.inizio, s.inizio) > 0.05);
    if (!tocca.length) continue;
    const inizio = Math.max(s.inizio, Math.min(...tocca.map((z) => z.inizio)) - PRIMA);
    let fine = Math.min(s.fine, Math.max(...tocca.map((z) => z.fine)) + DOPO);
    if (fine - inizio < MINIMO) fine = Math.min(s.fine, inizio + MINIMO);
    out.push({ ...s, inizio: r3(inizio), fine: r3(fine) });
  }
  for (let i = 0; i + 1 < out.length; i++) {
    if (out[i].fine > out[i + 1].inizio && out[i + 1].inizio > out[i].inizio) out[i].fine = out[i + 1].inizio;
  }
  return out;
}

// Allineamento parola per parola di whisper.cpp (-dtw): serve a dividere i segmenti nei silenzi. Vuole il nome
// della rete («small», «base»…), che si legge dall'intestazione del modello: il nome del file non basta, perché
// nell'immagine Docker il modello si chiama modello.bin. WHISPER_DTW=no lo spegne, WHISPER_DTW=<nome> lo impone.
const PRESET_DTW = new Set(['tiny', 'tiny.en', 'base', 'base.en', 'small', 'small.en', 'medium', 'medium.en', 'large.v1', 'large.v2', 'large.v3', 'large.v3.turbo']);
const presetGiaLetti = new Map();

export function presetDalModello(file) {
  try {
    const buf = Buffer.alloc(48);
    const fd = openSync(file, 'r');
    try {
      readSync(fd, buf, 0, 48, 0);
    } finally {
      closeSync(fd);
    }
    // intestazione ggml: magia, poi n_vocab, n_audio_ctx, n_audio_state, n_audio_head, n_audio_layer,
    // n_text_ctx, n_text_state, n_text_head, n_text_layer, n_mels (interi a 32 bit)
    if (buf.readUInt32LE(0) === 0x67676d6c) {
      const h = (i) => buf.readInt32LE(4 + i * 4);
      const inglese = h(0) === 51864 ? '.en' : '';
      const taglia = { 4: 'tiny', 6: 'base', 12: 'small', 24: 'medium' }[h(4)];
      if (taglia) return taglia + inglese;
      if (h(4) === 32 && h(9) === 128) return h(8) === 4 ? 'large.v3.turbo' : 'large.v3';
    }
  } catch {
    // file non leggibile: si prova col nome
  }
  let nome = path.basename(file);
  try {
    nome = path.basename(realpathSync(file));
  } catch {
    // collegamento rotto: resta il nome
  }
  const m = nome.toLowerCase().match(/^ggml-(tiny|base|small|medium|large-v1|large-v2|large-v3-turbo|large-v3)(\.en)?(?=[-._]|$)/);
  return m ? m[1].replace(/-(v\d)/, '.$1').replace('-turbo', '.turbo') + (m[2] || '') : null;
}

export function presetDtw(cfg) {
  const scelto = String(cfg.whisperDtw || '').trim().toLowerCase();
  if (scelto === 'no') return null;
  if (scelto) return PRESET_DTW.has(scelto) ? scelto : null;
  if (!presetGiaLetti.has(cfg.whisperModello)) presetGiaLetti.set(cfg.whisperModello, presetDalModello(cfg.whisperModello));
  return presetGiaLetti.get(cfg.whisperModello);
}

async function zoneParlato(wav, durata, picco, cfg, segnale) {
  if (vadDisponibile(cfg)) {
    try {
      const { stdout } = await esegui(cfg.whisperVadBin, ['-vm', cfg.whisperVad, '-t', String(cfg.threadWhisper), '-np', '-f', wav], { segnale, timeoutMs: 300_000 });
      const zone = leggiZoneVad(stdout.toString());
      if (zone) return { fonte: 'silero', zone };
    } catch (e) {
      if (e.annullato) throw e;
    }
  }
  // Ripiego: silenzi misurati da FFmpeg, con soglia 30 dB sotto il picco (tra −50 e −25 dB).
  const soglia = Math.max(-50, Math.min(-25, Math.round(picco - 30)));
  try {
    const { stderr } = await esegui(cfg.ffmpeg, ['-hide_banner', '-nostdin', '-nostats', '-i', wav, '-af', `silencedetect=n=${soglia}dB:d=0.4`, '-f', 'null', '-'], { segnale, timeoutMs: 300_000 });
    return { fonte: 'silenzi', zone: zoneDaSilenzi(stderr, durata) };
  } catch (e) {
    if (e.annullato) throw e;
    return { fonte: 'nessuna', zone: null };
  }
}

export function pulisciSegmenti(transcription, durata) {
  const out = [];
  for (const s of transcription || []) {
    const testo = String(s.text || '').replace(/\s+/g, ' ').trim();
    if (!testo || ALLUCINAZIONI.some((re) => re.test(testo))) continue;
    const inizio = Math.max(0, Number(s.offsets?.from) / 1000);
    const fine = Math.min(durata || Infinity, Number(s.offsets?.to) / 1000);
    if (!Number.isFinite(inizio) || !Number.isFinite(fine) || fine <= inizio) continue;
    const voce = { inizio: Math.round(inizio * 1000) / 1000, fine: Math.round(fine * 1000) / 1000, testo };
    // Parole con il loro tempo (solo se whisper ha dato i token e ridanno esattamente il testo).
    if (Array.isArray(s.tokens)) {
      const parole = paroleDaToken(s.tokens);
      if (parole.length && unisci(parole.map((p) => p.testo)) === testo) voce.parole = parole;
    }
    out.push(voce);
  }
  return out;
}

async function piccoVolume(wav, cfg, segnale) {
  const { stderr } = await esegui(cfg.ffmpeg, ['-hide_banner', '-nostdin', '-nostats', '-i', wav, '-af', 'volumedetect', '-f', 'null', '-'], { segnale, timeoutMs: 300_000 });
  const m = stderr.match(/max_volume:\s*(-?[\d.]+|-inf) dB/);
  if (!m || m[1] === '-inf') return -Infinity;
  return Number(m[1]);
}

export async function trascrivi({ clip, dati, lavoro, url, cfg, segnale }) {
  if (!whisperDisponibile(cfg)) {
    throw errore(503, 'trascrizione_non_disponibile', 'La trascrizione non è disponibile: nel servizio manca whisper o il suo modello.');
  }
  const lingua = dati.lingua ?? 'it';
  if (typeof lingua !== 'string' || !/^([a-z]{2}|auto)$/.test(lingua)) throw nonValido('dati_non_validi', '«lingua» deve essere un codice di due lettere, per esempio "it".');
  const info = [];
  for (const c of clip) {
    const i = await sonda(c.percorso, c.nome, cfg, segnale);
    if (i.immagine || (!i.video && !i.audio)) throw errore(415, 'video_non_leggibile', `Il file «${c.nome}» non è un video o un audio leggibile.`);
    info.push(i);
  }
  const segmenti = [];
  const frasiSrt = [];
  let partenza = 0;
  for (const [k, c] of clip.entries()) {
    const durata = info[k].durata;
    if (info[k].audio) {
      const wav = path.join(lavoro.dirTmp, `clip-${k}.wav`);
      await esegui(cfg.ffmpeg, ['-hide_banner', '-nostdin', '-y', '-v', 'error', '-threads', String(cfg.threadFfmpeg), '-i', c.percorso, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], { segnale, timeoutMs: cfg.timeoutProcessoMs });
      // Audio muto: niente whisper (eviterebbe solo frasi inventate).
      const picco = await piccoVolume(wav, cfg, segnale);
      if (picco > -45) {
        const uscita = path.join(lavoro.dirTmp, `clip-${k}`);
        // Niente --vad qui: vedi vadDisponibile. I tempi si dividono e si stringono dopo, sulle zone di parlato.
        // -ojf dà i token di ogni segmento; -dtw li allinea sull'audio (whisper.cpp lo spegne con l'attenzione
        // veloce, da qui -nfa). Senza allineamento il testo si divide in proporzione (dividiInProporzione).
        const dtw = presetDtw(cfg);
        const allinea = dtw ? ['-nfa', '-dtw', dtw] : [];
        const args = ['-m', cfg.whisperModello, '-l', lingua, '-t', String(cfg.threadWhisper), '-np', '-sns', '-oj', '-ojf', ...allinea, '-of', uscita, '-f', wav];
        const parlato = await zoneParlato(wav, durata, picco, cfg, segnale);
        await esegui(cfg.whisperBin, args, { segnale, timeoutMs: cfg.timeoutProcessoMs, cwd: lavoro.dirTmp });
        let json;
        try {
          json = JSON.parse(await fs.readFile(`${uscita}.json`, 'utf8'));
        } catch {
          throw errore(500, 'trascrizione_fallita', `Whisper non ha prodotto un risultato leggibile per la clip ${k}.`);
        }
        for (const s of correggiTempi(pulisciSegmenti(json.transcription, durata), parlato.zone)) {
          segmenti.push({ clip: k, inizio: s.inizio, fine: s.fine, testo: s.testo });
          frasiSrt.push({ inizio: partenza + s.inizio, fine: partenza + s.fine, testo: s.testo });
        }
      }
      await fs.rm(wav, { force: true });
    }
    partenza += durata;
  }
  await fs.writeFile(path.join(lavoro.dirOut, 'sottotitoli.srt'), scriviSrt(frasiSrt));
  return {
    segmenti,
    srt: { url: url('sottotitoli.srt') },
    testo_completo: segmenti.map((s) => s.testo).join(' '),
  };
}
