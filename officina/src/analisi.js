// Analisi del materiale grezzo per il montatore: ogni video si divide in scene (momenti usabili), con misure
// di qualità e una miniatura; ogni foto si misura e si confronta con le altre (doppioni).
// Niente AI qui: solo misure. Il «cosa c'è dentro» lo dice Claude guardando i provini (catalogo.js).
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { processiAttivi } from './processi.js';
import { errore } from './errori.js';
import { sonda } from './video.js';
import { apri, varianzaLaplaciano, misuraFoto, distanzaHamming, SOGLIA_DOPPIONE, orientamento } from './immagini.js';
import { trascrivi, whisperDisponibile } from './trascrizione.js';

// Regole della divisione in scene (secondi). Una ripresa lunga si divide in pezzi da 3-5 s:
// così il piano può scegliere «il momento in cui versa il vino» e non tutta la clip da 40 s.
export const SCENE = {
  fpsMisure: 4, // fotogrammi al secondo per luce e movimento (piccolissimi, in grigio)
  sogliaTaglio: 12, // scdet di FFmpeg: sopra questo punteggio c'è un cambio di inquadratura
  minima: 1.0, // una scena più corta si unisce a quella prima
  massima: 6.0, // una scena più lunga si divide
  pezzo: 4.5, // lunghezza indicativa dei pezzi di una scena lunga
  maxPerVideo: 40, // oltre, i pezzi si allungano (una clip da 10 minuti non diventa 130 miniature)
};

const LATO_MISURE = 192;
const LATO_MINIATURA = 480;

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

// Lancia FFmpeg e legge i fotogrammi grezzi man mano che arrivano (senza tenerli tutti in memoria).
function passata(cmd, args, { suPezzo, segnale, timeoutMs }) {
  return new Promise((resolve, reject) => {
    if (segnale?.aborted) {
      const e = new Error('annullato');
      e.annullato = true;
      reject(e);
      return;
    }
    const figlio = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    processiAttivi.add(figlio);
    let stderr = '';
    let scaduto = false;
    figlio.stdout.on('data', suPezzo);
    figlio.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
    });
    const timer = setTimeout(() => {
      scaduto = true;
      figlio.kill('SIGKILL');
    }, timeoutMs);
    const annulla = () => figlio.kill('SIGKILL');
    segnale?.addEventListener('abort', annulla, { once: true });
    const fine = () => {
      clearTimeout(timer);
      segnale?.removeEventListener('abort', annulla);
      processiAttivi.delete(figlio);
    };
    figlio.on('error', (e) => {
      fine();
      reject(e);
    });
    figlio.on('close', (codice, sigla) => {
      fine();
      if (codice === 0) return resolve(stderr);
      const e = new Error(`${cmd} è uscito con ${codice ?? sigla}${scaduto ? ' (tempo scaduto)' : ''}`);
      e.stderr = stderr;
      if (segnale?.aborted) e.annullato = true;
      reject(e);
    });
  });
}

// Dimensioni pari dentro un quadrato di lato `lato`, mantenendo le proporzioni.
export function dentroIlLato(w, h, lato) {
  const r = Math.min(lato / w, lato / h, 1);
  return { w: Math.max(2, 2 * Math.round((w * r) / 2)), h: Math.max(2, 2 * Math.round((h * r) / 2)) };
}

export function leggiTagliScdet(stderr) {
  const out = [];
  for (const m of stderr.matchAll(/lavfi\.scd\.score:\s*([\d.]+),\s*lavfi\.scd\.time:\s*([\d.]+)/g)) out.push({ punteggio: Number(m[1]), tempo: Number(m[2]) });
  return out;
}

export function leggiVolumeMassimo(stderr) {
  const m = stderr.match(/max_volume:\s*(-?[\d.]+|-inf) dB/);
  if (!m) return null;
  return m[1] === '-inf' ? -91 : Number(m[1]);
}

// Confini delle scene: tagli trovati da FFmpeg, poi scene corte unite e scene lunghe divise.
export function confiniScene(durata, tagli, regole = SCENE) {
  const punti = [0];
  for (const t of [...tagli].sort((a, b) => a - b)) {
    if (t - punti[punti.length - 1] >= regole.minima && durata - t >= regole.minima) punti.push(t);
  }
  punti.push(durata);
  // pezzi lunghi: si dividono in parti uguali di circa `pezzo` secondi
  let lunghezzaPezzo = regole.pezzo;
  const conta = (lp) => {
    let n = 0;
    for (let i = 0; i < punti.length - 1; i++) {
      const d = punti[i + 1] - punti[i];
      n += d > regole.massima ? Math.ceil(d / lp) : 1;
    }
    return n;
  };
  while (conta(lunghezzaPezzo) > regole.maxPerVideo && lunghezzaPezzo < durata) lunghezzaPezzo *= 1.25;
  const scene = [];
  for (let i = 0; i < punti.length - 1; i++) {
    const a = punti[i];
    const z = punti[i + 1];
    const d = z - a;
    const n = d > regole.massima ? Math.ceil(d / lunghezzaPezzo) : 1;
    for (let k = 0; k < n; k++) scene.push({ inizio: a + (d * k) / n, fine: a + (d * (k + 1)) / n, taglio: k === 0 && i > 0 });
  }
  // tanti tagli (un'inquadratura ogni 2 s): si uniscono le due scene vicine più corte finché si sta nel tetto
  while (scene.length > regole.maxPerVideo) {
    let migliore = 0;
    for (let i = 1; i < scene.length - 1; i++) {
      if (scene[i + 1].fine - scene[i].inizio < scene[migliore + 1].fine - scene[migliore].inizio) migliore = i;
    }
    scene.splice(migliore, 2, { inizio: scene[migliore].inizio, fine: scene[migliore + 1].fine, taglio: scene[migliore].taglio });
  }
  return scene;
}

async function nitidezzaMiniatura(file) {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  return varianzaLaplaciano(data, info.width, info.height, info.channels);
}

function mediana(v) {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Frasi dette in un materiale, con le parole e i loro tempi (se whisper li ha dati).
async function trascriviMateriale(file, dirT, dati, cfg, segnale) {
  const r = await trascrivi({ clip: [file], dati: { lingua: dati.lingua ?? 'it', parole: true }, lavoro: { dirTmp: dirT, dirOut: dirT }, url: (n) => n, cfg, segnale });
  return r.segmenti.map((s) => ({ inizio: r2(s.inizio), fine: r2(s.fine), testo: s.testo, ...(s.parole ? { parole: s.parole } : {}) }));
}

// ---------------------------------------------------------------- AUDIO (voce fuori campo, intervista solo audio, musica)
export async function analizzaAudio({ file, codice, dirTmp, dati, cfg, segnale }) {
  const avvisi = [];
  const info = await sonda(file.percorso, file.nome, cfg, segnale);
  if (!info.audio) throw errore(415, 'audio_non_leggibile', `Nel file «${file.nome}» non c'è una traccia audio.`);
  if (!(info.durata >= 0.5)) throw errore(422, 'audio_troppo_corto', `L'audio «${file.nome}» dura meno di mezzo secondo.`);
  let volumeMax = null;
  try {
    const stderr = await passata(cfg.ffmpeg, ['-hide_banner', '-nostdin', '-nostats', '-v', 'info', '-i', file.percorso, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'], { suPezzo: () => {}, segnale, timeoutMs: cfg.timeoutProcessoMs });
    volumeMax = leggiVolumeMassimo(stderr);
  } catch (e) {
    if (e.annullato) throw e;
    throw errore(415, 'audio_non_leggibile', `Non riesco a leggere l'audio «${file.nome}» fino in fondo.`);
  }
  let parlato = null;
  const vuoleParlato = !['false', 'no', '0'].includes(String(dati.trascrivi ?? '').trim().toLowerCase());
  if (vuoleParlato && volumeMax !== null && volumeMax > -45) {
    if (!whisperDisponibile(cfg)) {
      avvisi.push({ codice: 'trascrizione_non_disponibile', messaggio: `Nell'audio ${codice} c'è parlato, ma la trascrizione non è disponibile sul server: la regia non saprà dove cade ogni frase.` });
    } else {
      const dirT = path.join(dirTmp, `trascrizione-${codice}`);
      await fs.mkdir(dirT, { recursive: true });
      try {
        parlato = await trascriviMateriale(file, dirT, dati, cfg, segnale);
      } catch (e) {
        if (e.annullato || segnale?.aborted) throw e;
        avvisi.push({ codice: 'trascrizione_fallita', messaggio: `La trascrizione dell'audio ${codice} non è riuscita${e.scaduto ? ' (tempo scaduto)' : ''}.` });
      } finally {
        await fs.rm(dirT, { recursive: true, force: true });
      }
    }
  }
  if (volumeMax !== null && volumeMax <= -45) avvisi.push({ codice: 'audio_silenzioso', messaggio: `L'audio ${codice} («${file.nome}») è quasi muto.` });
  return { materiale: { codice, tipo: 'audio', durata: r2(info.durata), volume_max_db: volumeMax, parlato }, avvisi };
}

// ---------------------------------------------------------------- VIDEO
export async function analizzaVideo({ file, codice, dirProgetto, dirTmp, dati, cfg, segnale }) {
  const avvisi = [];
  const info = await sonda(file.percorso, file.nome, cfg, segnale);
  if (info.immagine) throw errore(415, 'video_non_leggibile', `Il file «${file.nome}» è un'immagine: caricalo come foto.`);
  if (!info.video || !info.larghezza || !info.altezza) throw errore(415, 'video_non_leggibile', `Nel file «${file.nome}» non c'è una traccia video.`);
  if (!(info.durata >= 1)) throw errore(422, 'video_troppo_corto', `Il video «${file.nome}» dura meno di 1 secondo: non si può usare.`);

  const mis = dentroIlLato(info.larghezza, info.altezza, LATO_MISURE);
  const latoMini = info.larghezza >= info.altezza ? `${LATO_MINIATURA}:-2` : `-2:${LATO_MINIATURA}`;
  const dirMini = path.join(dirTmp, `mini-${codice}`);
  await fs.mkdir(dirMini, { recursive: true });
  const grafo = `[0:v]fps=${SCENE.fpsMisure},scale=${mis.w}:${mis.h}:flags=area,scdet=threshold=${SCENE.sogliaTaglio},format=gray[m];`
    + `[0:v]fps=1,scale=${latoMini}:flags=bilinear,format=yuvj420p[t]`;
  const args = ['-hide_banner', '-nostdin', '-nostats', '-v', 'info', '-threads', String(cfg.threadFfmpeg), '-i', file.percorso,
    '-filter_threads', String(cfg.threadFfmpeg), '-filter_complex', grafo,
    '-map', '[m]', '-f', 'rawvideo', 'pipe:1',
    '-map', '[t]', '-q:v', '5', path.join(dirMini, 't-%05d.jpg')];
  if (info.audio) args.push('-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-');

  // fotogrammi piccoli in grigio: luce media e differenza dal precedente (= quanto si muove)
  const misure = [];
  const byteFotogramma = mis.w * mis.h;
  let resto = Buffer.alloc(0);
  let prima = null;
  const suPezzo = (d) => {
    resto = resto.length ? Buffer.concat([resto, d]) : d;
    while (resto.length >= byteFotogramma) {
      const f = resto.subarray(0, byteFotogramma);
      let somma = 0;
      let diff = 0;
      for (let i = 0; i < f.length; i++) {
        somma += f[i];
        if (prima) diff += Math.abs(f[i] - prima[i]);
      }
      misure.push({ tempo: misure.length / SCENE.fpsMisure, luce: somma / f.length, movimento: prima ? diff / f.length : 0 });
      prima = Buffer.from(f);
      resto = resto.subarray(byteFotogramma);
    }
  };
  let stderr;
  try {
    stderr = await passata(cfg.ffmpeg, args, { suPezzo, segnale, timeoutMs: cfg.timeoutProcessoMs });
  } catch (e) {
    if (e.annullato) throw e;
    throw errore(415, 'video_non_leggibile', `Non riesco a leggere il video «${file.nome}» fino in fondo: forse è rovinato o incompleto.`);
  }
  if (misure.length > 1) misure[0].movimento = misure[1].movimento;

  const volumeMax = info.audio ? leggiVolumeMassimo(stderr) : null;
  const tagli = leggiTagliScdet(stderr).map((t) => t.tempo);
  const scene = confiniScene(info.durata, tagli);

  // miniature a 1 al secondo: la k-esima (da 1) è il fotogramma a (k-1) secondi
  const fileMini = (await fs.readdir(dirMini)).filter((n) => /^t-\d{5}\.jpg$/.test(n)).sort();
  const mini = [];
  for (const n of fileMini) {
    const k = Number(n.slice(2, 7));
    const p = path.join(dirMini, n);
    mini.push({ tempo: k - 1, file: p, nitidezza: await nitidezzaMiniatura(p) });
  }

  // parlato (facoltativo): whisper sul server, solo se c'è audio udibile
  let parlato = null;
  const vuoleParlato = !['false', 'no', '0'].includes(String(dati.trascrivi ?? '').trim().toLowerCase());
  if (vuoleParlato && info.audio && volumeMax !== null && volumeMax > -45) {
    if (!whisperDisponibile(cfg)) {
      avvisi.push({ codice: 'trascrizione_non_disponibile', messaggio: `Nel video ${codice} c'è audio, ma la trascrizione non è disponibile sul server: niente sottotitoli per questo video.` });
    } else {
      const dirT = path.join(dirTmp, `trascrizione-${codice}`);
      await fs.mkdir(dirT, { recursive: true });
      try {
        parlato = await trascriviMateriale(file, dirT, dati, cfg, segnale);
      } catch (e) {
        // whisper che si pianta o va oltre il tempo: si perde il parlato, non la clip
        if (e.annullato || segnale?.aborted) throw e;
        avvisi.push({ codice: 'trascrizione_fallita', messaggio: `La trascrizione del video ${codice} non è riuscita${e.scaduto ? ' (tempo scaduto)' : ''}: lo uso senza sottotitoli.` });
      } finally {
        await fs.rm(dirT, { recursive: true, force: true });
      }
    }
  }

  const uscite = [];
  for (const [i, s] of scene.entries()) {
    const n = i + 1;
    const dentro = misure.filter((m) => m.tempo >= s.inizio && m.tempo < s.fine);
    const usate = dentro.length ? dentro : misure.length ? [misure.reduce((a, b) => (Math.abs(b.tempo - s.inizio) < Math.abs(a.tempo - s.inizio) ? b : a))] : [];
    // movimento: si salta il primo fotogramma dopo un taglio (la differenza lì è il taglio, non la camera che si muove)
    const perMovimento = s.taglio ? usate.slice(1) : usate;
    let candidati = mini.filter((m) => m.tempo >= s.inizio - 0.01 && m.tempo < s.fine);
    if (!candidati.length && mini.length) {
      const mezzo = (s.inizio + s.fine) / 2;
      candidati = [mini.reduce((a, b) => (Math.abs(b.tempo - mezzo) < Math.abs(a.tempo - mezzo) ? b : a))];
    }
    const migliore = candidati.reduce((a, b) => (!a || b.nitidezza > a.nitidezza ? b : a), null);
    let miniatura = null;
    if (migliore) {
      miniatura = `miniature/${codice}-${n}.jpg`;
      await fs.copyFile(migliore.file, path.join(dirProgetto, miniatura));
    }
    const testo = parlato ? parlato.filter((p) => p.fine > s.inizio && p.inizio < s.fine).map((p) => p.testo).join(' ').trim() : '';
    uscite.push({
      n,
      codice: `${codice}.${n}`,
      inizio: r2(s.inizio),
      fine: r2(s.fine),
      nitidezza: r1(mediana(candidati.map((c) => c.nitidezza))),
      luminosita: r1(usate.reduce((a, m) => a + m.luce, 0) / Math.max(1, usate.length)),
      movimento: r1(perMovimento.reduce((a, m) => a + m.movimento, 0) / Math.max(1, perMovimento.length)),
      miniatura,
      ...(testo ? { parlato: testo } : {}),
    });
  }
  await fs.rm(dirMini, { recursive: true, force: true });

  const orient = orientamento(info.larghezza, info.altezza);
  const cartella = String(dati.cartella || '');
  if (/vertical/i.test(cartella) && orient === 'orizzontale') avvisi.push({ codice: 'cartella_diversa', messaggio: `Il video ${codice} («${file.nome}») è nella cartella dei verticali ma è orizzontale: lo tratto come orizzontale.` });
  if (/orizzontal/i.test(cartella) && orient === 'verticale') avvisi.push({ codice: 'cartella_diversa', messaggio: `Il video ${codice} («${file.nome}») è nella cartella degli orizzontali ma è verticale: lo tratto come verticale.` });
  if (['smpte2084', 'arib-std-b67'].includes(info.trasferimento)) avvisi.push({ codice: 'hdr', messaggio: `Il video ${codice} è in HDR: le miniature possono sembrare slavate, il montaggio lo converte nei colori normali.` });

  return {
    materiale: {
      codice,
      tipo: 'video',
      durata: r2(info.durata),
      fps: Math.round(info.fps * 100) / 100,
      larghezza: info.larghezza,
      altezza: info.altezza,
      orientamento: orient,
      audio: info.audio,
      volume_max_db: volumeMax,
      hdr: ['smpte2084', 'arib-std-b67'].includes(info.trasferimento),
      parlato,
      scene: uscite,
    },
    avvisi,
  };
}

// ---------------------------------------------------------------- FOTO
export async function analizzaFoto({ file, codice, dirProgetto, progetto, dati }) {
  const avvisi = [];
  const m = await misuraFoto(file.percorso, file.nome);
  const miniatura = `miniature/${codice}.jpg`;
  await apri(file.percorso)
    .flatten({ background: '#ffffff' })
    .resize(LATO_MINIATURA, LATO_MINIATURA, { fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb')
    .jpeg({ quality: 82 })
    .toFile(path.join(dirProgetto, miniatura));
  let doppione = null;
  for (const altra of progetto.materiali) {
    if (altra.tipo === 'foto' && Array.isArray(altra.hash) && distanzaHamming(m.hash, altra.hash) <= SOGLIA_DOPPIONE) {
      doppione = altra.codice;
      break;
    }
  }
  if (doppione) avvisi.push({ codice: 'doppione', messaggio: `La foto ${codice} («${file.nome}») è quasi uguale a ${doppione}: il piano ne userà una sola.` });
  const orient = m.orientamento;
  const cartella = String(dati.cartella || '');
  if (/video/i.test(cartella)) avvisi.push({ codice: 'cartella_diversa', messaggio: `La foto ${codice} («${file.nome}») era in una cartella di video: la tratto come foto.` });
  if (Math.max(m.larghezza, m.altezza) < 1080) avvisi.push({ codice: 'risoluzione_bassa', messaggio: `La foto ${codice} è piccola (${m.larghezza}×${m.altezza}): su Instagram può sembrare sgranata.` });
  return {
    materiale: {
      codice,
      tipo: 'foto',
      larghezza: m.larghezza,
      altezza: m.altezza,
      orientamento: orient,
      nitidezza: m.nitidezza,
      luminosita: m.luminosita,
      hash: m.hash,
      doppione_di: doppione,
      miniatura,
    },
    avvisi,
  };
}

// Video o foto? Lo dice il file, non la cartella (la cartella serve solo per gli avvisi).
export async function tipoDelFile(file, cfg, segnale) {
  try {
    const meta = await sharp(file.percorso, { failOn: 'error', limitInputPixels: 120_000_000 }).metadata();
    if (meta.width && meta.height && !(meta.pages > 1 && /gif|webp/.test(meta.format || ''))) return 'foto';
  } catch {
    // non è un'immagine che sharp sa leggere: provo come video
  }
  const i = await sonda(file.percorso, file.nome, cfg, segnale).catch(() => null);
  if (i && i.video && !i.immagine && i.durata > 0) return 'video';
  if (i && !i.video && i.audio && i.durata > 0) return 'audio';
  if (/\.(heic|heif)$/i.test(file.nome)) {
    throw errore(415, 'formato_file_non_supportato', `La foto «${file.nome}» è in HEIC: esportala in JPEG (sull'iPhone: Impostazioni › Fotocamera › Formati › Più compatibile).`);
  }
  throw errore(415, 'formato_file_non_supportato', `Il file «${file.nome}» non è una foto, un video o un audio leggibile.`);
}
