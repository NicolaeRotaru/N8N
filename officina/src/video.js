// Video: reel e storie in 1080×1920 con FFmpeg. Solo montaggio vero: tagli, ritaglio, sfondo sfocato
// della STESSA clip (o colore pieno) per le clip orizzontali, scritte/logo sopra, audio normalizzato a -14 LUFS.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { esegui } from './processi.js';
import { errore, nonValido } from './errori.js';
import { varianzaLaplaciano, jpegEntro, MAX_ANTEPRIMA, svgInPng, preparaLogo } from './immagini.js';
import { coloriValidi, adattaTesto, disegnaLivello, assoluto, immagineLogo, rgba, avvisoRiduzione, STORIA, MARGINE_LATO } from './grafiche.js';
import { fontDelMarchio, nomeFamigliaTtf } from './font.js';
import { leggiSrt, spostaSuMontaggio, creaAss } from './srt.js';

const W = 1080;
const H = 1920;
const FPS = 30;
const LIMITE_STORIA = 59.9; // Facebook: storie video ≤ 60 s (margine per l'arrotondamento dell'audio)
const LOGO = { larghezza: 170, altezzaMax: 120, destra: 64, alto: STORIA.alto + 20 };

const f3 = (n) => Number(n).toFixed(3);

function hex6(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return h.toUpperCase();
}

export async function sonda(file, nome, cfg, segnale) {
  let stdout;
  try {
    ({ stdout } = await esegui(cfg.ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { segnale, timeoutMs: 120_000 }));
  } catch (e) {
    if (e.annullato) throw e;
    throw errore(415, 'video_non_leggibile', `Il file «${nome}» non è un video o un audio leggibile.`);
  }
  const j = JSON.parse(stdout.toString() || '{}');
  const flussi = j.streams || [];
  const video = flussi.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = flussi.find((s) => s.codec_type === 'audio');
  const durata = Number(j.format?.duration) || Number(video?.duration) || Number(audio?.duration) || 0;
  let rotazione = 0;
  for (const sd of video?.side_data_list || []) if (sd.rotation !== undefined) rotazione = Number(sd.rotation);
  if (!rotazione && video?.tags?.rotate) rotazione = Number(video.tags.rotate);
  const girato = Math.abs(rotazione) % 180 === 90;
  return {
    nome,
    video: Boolean(video),
    audio: Boolean(audio),
    durata,
    larghezza: video ? (girato ? video.height : video.width) : 0,
    altezza: video ? (girato ? video.width : video.height) : 0,
    trasferimento: video?.color_transfer || '',
    immagine: /(^|,)(image2|[a-z0-9]+_pipe)(,|$)/.test(j.format?.format_name || ''),
  };
}

async function sondaVideo(file, cfg, segnale) {
  const i = await sonda(file.percorso, file.nome, cfg, segnale);
  if (i.immagine) throw errore(415, 'video_non_leggibile', `Il file «${file.nome}» è un'immagine, non un video.`);
  if (!i.video || !i.larghezza || !i.altezza) throw errore(415, 'video_non_leggibile', `Nel file «${file.nome}» non c'è una traccia video.`);
  if (!(i.durata > 0)) throw errore(415, 'video_non_leggibile', `Non riesco a leggere la durata di «${file.nome}».`);
  return i;
}

// 'riempi' se il ritaglio a 9:16 tiene almeno l'80% dell'immagine, altrimenti 'sfondo'.
export function modoAdattamento(info) {
  const r = info.larghezza / info.altezza;
  const t = 9 / 16;
  const tenuto = r > t ? t / r : r / t;
  return tenuto >= 0.8 ? 'riempi' : 'sfondo';
}

const FINE_VIDEO = 'setsar=1,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p';

export function grafoAdattamento(info, { sfondo = 'sfocato', colore = '#000000' } = {}) {
  const hdr = ['smpte2084', 'arib-std-b67'].includes(info.trasferimento);
  const pre = hdr ? 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,' : '';
  const modo = modoAdattamento(info);
  let grafo;
  if (modo === 'riempi') {
    grafo = `[0:v]${pre}fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},${FINE_VIDEO}[v]`;
  } else if (sfondo === 'colore') {
    grafo = `[0:v]${pre}fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x${hex6(colore)},${FINE_VIDEO}[v]`;
  } else {
    // Sfondo = la stessa clip, ingrandita e sfocata (sfocatura a bassa risoluzione: costa poco).
    grafo = `[0:v]${pre}fps=${FPS},split=2[a][b];[a]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=10:2,scale=${W}:${H},eq=brightness=-0.05[sf];[b]scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos[pp];[sf][pp]overlay=(W-w)/2:(H-h)/2,${FINE_VIDEO}[v]`;
  }
  return { modo, hdr, grafo };
}

const CODIFICA_INTERMEDIA = (t) => ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', '60', '-threads', t, '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2'];

const CODIFICA_FINALE = (t) => [
  '-c:v', 'libx264', '-preset', 'faster', '-crf', '21', '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p',
  '-r', String(FPS), '-g', '60', '-keyint_min', '30', '-maxrate', '10M', '-bufsize', '20M', '-threads', t,
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart',
];

const BASE = ['-hide_banner', '-nostdin', '-y'];

async function normalizzaSegmento(info, file, inizio, durata, uscita, opz, cfg, segnale) {
  const t = String(cfg.threadFfmpeg);
  const { grafo } = grafoAdattamento(info, opz);
  const args = [...BASE, '-v', 'error', '-threads', t, '-ss', f3(inizio), '-t', f3(durata), '-i', file];
  let audio;
  if (info.audio) {
    audio = `[0:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo,apad,atrim=0:${f3(durata)}[a]`;
  } else {
    args.push('-f', 'lavfi', '-t', f3(durata), '-i', 'anullsrc=r=48000:cl=stereo');
    audio = `[1:a]aformat=sample_fmts=s16:channel_layouts=stereo,atrim=0:${f3(durata)}[a]`;
  }
  args.push('-filter_threads', t, '-filter_complex_threads', t, '-filter_complex', `${grafo};${audio}`, '-map', '[v]', '-map', '[a]', ...CODIFICA_INTERMEDIA(t), '-t', f3(durata), uscita);
  await esegui(cfg.ffmpeg, args, { segnale, timeoutMs: cfg.timeoutProcessoMs });
}

// Misura del volume (prima passata di loudnorm). null se l'audio è muto.
async function misuraVolume(ingressi, catena, cfg, segnale, cwd) {
  const args = [...BASE, '-nostats', ...ingressi, '-filter_complex', `${catena};[mix]loudnorm=I=-14:TP=-1.5:LRA=18:print_format=json[fuori]`, '-map', '[fuori]', '-f', 'null', '-'];
  const { stderr } = await esegui(cfg.ffmpeg, args, { segnale, timeoutMs: cfg.timeoutProcessoMs, cwd });
  const m = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/s);
  if (!m) return null;
  const j = JSON.parse(m[0]);
  const i = Number(j.input_i);
  if (!Number.isFinite(i) || i < -70) return null;
  return j;
}

function filtroLoudnorm(m) {
  if (!m) return 'anull';
  return `loudnorm=I=-14:TP=-1.5:LRA=18:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=none,aresample=48000`;
}

const AVVISO_MUTO = { codice: 'audio_silenzioso', messaggio: "Nel video non c'è audio udibile: esce con una traccia muta. Se serve, aggiungi una musica con licenza." };

async function durataFile(file, cfg, segnale) {
  const { stdout } = await esegui(cfg.ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { segnale, timeoutMs: 60_000 });
  return Math.round(Number(stdout.toString().trim()) * 100) / 100;
}

async function estraiFotogramma(file, t, uscita, cfg, segnale, larghezza) {
  await esegui(cfg.ffmpeg, [...BASE, '-v', 'error', '-ss', f3(t), '-i', file, '-frames:v', '1', ...(larghezza ? ['-vf', `scale=${larghezza}:-2`] : []), '-q:v', '2', uscita], { segnale, timeoutMs: 120_000 });
}

function istanti(durata, n = 6) {
  return Array.from({ length: n }, (_, i) => Math.max(0, Math.min(durata - 0.15, ((i + 0.5) * durata) / n)));
}

function mmss(t) {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Provino di 6 fotogrammi (3×2) con il minuto:secondo, lato lungo ≤ 1568 px.
async function creaFotogrammi(file, durata, dirTmp, dirOut, cfg, segnale) {
  const cw = 428;
  const chh = 761;
  const sp = 12;
  const Wg = 3 * cw + 4 * sp;
  const Hg = 2 * chh + 3 * sp;
  const comp = [];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wg}" height="${Hg}">`;
  const tt = istanti(durata);
  for (let i = 0; i < tt.length; i++) {
    const f = path.join(dirTmp, `fg-${i}.jpg`);
    await estraiFotogramma(file, tt[i], f, cfg, segnale);
    const x = sp + (i % 3) * (cw + sp);
    const y = sp + Math.floor(i / 3) * (chh + sp);
    comp.push({ input: await sharp(f).resize(cw, chh, { fit: 'contain', background: '#000' }).png({ compressionLevel: 1 }).toBuffer(), left: x, top: y });
    svg += `<rect x="${x + 10}" y="${y + 10}" width="96" height="44" rx="10" fill="#000" fill-opacity="0.75"/><text x="${x + 58}" y="${y + 41}" font-family="Inter" font-weight="700" font-size="28" fill="#fff" text-anchor="middle">${mmss(tt[i])}</text>`;
  }
  svg += '</svg>';
  comp.push({ input: svgInPng(svg, cfg.fontRiservaDir), left: 0, top: 0 });
  const tela = await sharp({ create: { width: Wg, height: Hg, channels: 3, background: '#1c1c1c' } }).composite(comp).png({ compressionLevel: 1 }).toBuffer();
  const { buf } = await jpegEntro(tela, MAX_ANTEPRIMA, { qualita: 85 });
  await fs.writeFile(path.join(dirOut, 'fotogrammi.jpg'), buf);
  return 'fotogrammi.jpg';
}

// Copertina: il fotogramma più nitido fra 6 candidati, con gli strati (logo/titolo) sopra.
async function creaCopertina(file, durata, strati, dirTmp, dirOut, cfg, segnale) {
  let migliore = null;
  for (const [i, t] of istanti(durata).entries()) {
    const f = path.join(dirTmp, `cand-${i}.jpg`);
    await estraiFotogramma(file, t, f, cfg, segnale);
    const { data, info } = await sharp(f).resize(540).greyscale().raw().toBuffer({ resolveWithObject: true });
    const v = varianzaLaplaciano(data, info.width, info.height, info.channels);
    if (!migliore || v > migliore.v) migliore = { f, v };
  }
  const tela = await sharp(migliore.f).resize(W, H, { fit: 'cover' }).composite(strati).removeAlpha().png({ compressionLevel: 1 }).toBuffer();
  const { buf } = await jpegEntro(tela, MAX_ANTEPRIMA, { qualita: 88 });
  await fs.writeFile(path.join(dirOut, 'copertina.jpg'), buf);
  return 'copertina.jpg';
}

function testoFacoltativo(v, campo) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || (v.testo !== undefined && typeof v.testo !== 'string')) {
    throw nonValido('dati_non_validi', `«${campo}» deve essere {"testo":"…"} oppure null.`);
  }
  const t = (v.testo || '').replace(/\s+/g, ' ').trim();
  return t || null;
}

function leggiTagli(tagli, info, avvisi) {
  if (tagli === undefined || tagli === null || (Array.isArray(tagli) && tagli.length === 0)) {
    return info.map((x, clip) => ({ clip, inizio: 0, fine: x.durata }));
  }
  if (!Array.isArray(tagli)) throw nonValido('tagli_non_validi', '«tagli» deve essere una lista di {clip, inizio, fine}.');
  const out = [];
  tagli.forEach((t, n) => {
    const clip = Number(t?.clip);
    if (!Number.isInteger(clip) || clip < 0 || clip >= info.length) {
      throw nonValido('tagli_non_validi', `Il taglio ${n + 1} indica la clip ${t?.clip}, ma le clip vanno da 0 a ${info.length - 1} (si conta da 0, nell'ordine di invio).`);
    }
    const d = info[clip].durata;
    const inizio = Number(t.inizio ?? 0);
    let fine = Number(t.fine ?? d);
    if (!Number.isFinite(inizio) || !Number.isFinite(fine) || inizio < 0 || fine <= inizio) {
      throw nonValido('tagli_non_validi', `Il taglio ${n + 1} ha inizio/fine non validi (servono numeri in secondi, con fine maggiore di inizio).`);
    }
    if (inizio >= d) {
      avvisi.push({ codice: 'taglio_fuori_clip', messaggio: `Il taglio ${n + 1} parte a ${inizio}s ma la clip ${clip} dura ${d.toFixed(1)}s: l'ho saltato.` });
      return;
    }
    if (fine > d + 0.05) avvisi.push({ codice: 'taglio_corretto', messaggio: `Il taglio ${n + 1} finiva a ${fine}s ma la clip ${clip} dura ${d.toFixed(1)}s: l'ho fermato alla fine della clip.` });
    fine = Math.min(fine, d);
    if (fine - inizio < 0.3) {
      avvisi.push({ codice: 'taglio_troppo_corto', messaggio: `Il taglio ${n + 1} dura meno di 0,3 secondi: l'ho saltato.` });
      return;
    }
    out.push({ clip, inizio, fine });
  });
  if (!out.length) throw nonValido('tagli_non_validi', 'Nessun taglio valido: controlla inizio e fine.');
  return out;
}

async function logoVideo(logo, dirTmp) {
  if (!logo) return null;
  const l = await preparaLogo(logo.percorso, LOGO.larghezza, LOGO.altezzaMax);
  const file = path.join(dirTmp, 'logo.png');
  await fs.writeFile(file, l.buf);
  return { ...l, file, left: W - LOGO.destra - l.w, top: LOGO.alto };
}

function catenaAudio(indiceMusica, durata, volume) {
  let c = '[0:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[voce]';
  if (indiceMusica === null) return `${c};[voce]anull[mix]`;
  c += `;[${indiceMusica}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=0:${f3(durata)},volume=${volume},afade=t=out:st=${f3(Math.max(0, durata - 1.5))}:d=1.5[mus]`;
  return `${c};[voce][mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]`;
}

// ---------------------------------------------------------------- REEL
export async function creaReel({ clip, logo, musica, dati, lavoro, url, cfg, segnale }) {
  const avvisi = [];
  const t = String(cfg.threadFfmpeg);
  const { dirTmp, dirOut } = lavoro;
  const info = [];
  for (const c of clip) info.push(await sondaVideo(c, cfg, segnale));
  if (musica) {
    const im = await sonda(musica.percorso, musica.nome, cfg, segnale);
    if (!im.audio) throw errore(415, 'audio_non_leggibile', `Nel file «${musica.nome}» non c'è una traccia audio.`);
  }
  const colori = coloriValidi(dati.colori, avvisi);
  const font = await fontDelMarchio(dati, cfg, avvisi);

  let durataMax = 90;
  if (dati.durata_max !== undefined && dati.durata_max !== null) {
    const n = Number(dati.durata_max);
    if (!Number.isFinite(n) || n <= 0) throw nonValido('durata_non_valida', '«durata_max» deve essere un numero di secondi.');
    if (n > 90) avvisi.push({ codice: 'durata_max_limitata', messaggio: `«durata_max» era ${n}: il massimo è 90 secondi.` });
    durataMax = Math.min(90, n);
  }
  if (durataMax < 3) throw nonValido('durata_non_valida', 'Un reel deve poter durare almeno 3 secondi.');
  let volume = 0.35;
  if (dati.volume_musica !== undefined && dati.volume_musica !== null) {
    volume = Number(dati.volume_musica);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw nonValido('dati_non_validi', '«volume_musica» va da 0 a 1.');
  }
  const testoIntro = testoFacoltativo(dati.intro, 'intro');
  const testoOutro = testoFacoltativo(dati.outro, 'outro');
  const durataOutro = testoOutro ? 2.5 : 0;
  let frasi = null;
  if (typeof dati.sottotitoli_srt === 'string' && dati.sottotitoli_srt.trim()) {
    frasi = leggiSrt(dati.sottotitoli_srt);
    if (!frasi.length) throw nonValido('srt_non_valido', 'Il testo SRT dei sottotitoli non contiene nessuna frase leggibile.');
  }

  const tagli = leggiTagli(dati.tagli, info, avvisi);
  const segmenti = [];
  let offset = 0;
  let tagliato = false;
  for (const tg of tagli) {
    const spazio = durataMax - durataOutro - offset;
    if (spazio < 0.3) {
      tagliato = true;
      break;
    }
    let d = tg.fine - tg.inizio;
    if (d > spazio) {
      d = spazio;
      tagliato = true;
    }
    segmenti.push({ clip: tg.clip, inizio: tg.inizio, fine: tg.inizio + d, offset, durata: d });
    offset += d;
  }
  if (tagliato) avvisi.push({ codice: 'durata_tagliata', messaggio: `Il montaggio superava ${durataMax} secondi: ho tagliato la parte finale.` });
  const durataClip = offset;
  const durataTotale = durataClip + durataOutro;
  if (durataTotale < 3) throw errore(422, 'video_troppo_corto', 'Il reel deve durare almeno 3 secondi.');

  // 1) ogni pezzo in 1080×1920, 30 fps, audio stereo 48 kHz
  const sfondoAvvisato = new Set();
  const lista = [];
  for (const [i, s] of segmenti.entries()) {
    const inf = info[s.clip];
    if (modoAdattamento(inf) === 'sfondo' && !sfondoAvvisato.has(s.clip)) {
      sfondoAvvisato.add(s.clip);
      avvisi.push({ codice: 'sfondo_sfocato', messaggio: `La clip ${s.clip} (${inf.larghezza}×${inf.altezza}) non è verticale: l'ho messa al centro con lo sfondo sfocato della stessa clip.` });
    }
    if (grafoAdattamento(inf).hdr && !sfondoAvvisato.has(`hdr${s.clip}`)) {
      sfondoAvvisato.add(`hdr${s.clip}`);
      avvisi.push({ codice: 'hdr_convertito', messaggio: `La clip ${s.clip} è in HDR: l'ho convertita nei colori normali (SDR) per Instagram.` });
    }
    const nome = `seg-${i}.mkv`;
    await normalizzaSegmento(inf, clip[s.clip].percorso, s.inizio, s.durata, path.join(dirTmp, nome), { sfondo: 'sfocato' }, cfg, segnale);
    lista.push(nome);
  }

  // 2) cartello finale (outro): fondo pieno, logo e testo
  const l = await logoVideo(logo, dirTmp);
  if (testoOutro) {
    const figli = [assoluto(0, 0, { width: W, height: H, backgroundColor: colori.primario })];
    const z0 = STORIA.alto + 40;
    const z1 = H - STORIA.basso - 40;
    let topTesto = z0 + 200;
    if (logo) {
      const grande = await preparaLogo(logo.percorso, W * 0.4, 300);
      const ly = z0 + 260;
      figli.push(immagineLogo(grande, Math.round((W - grande.w) / 2), ly));
      topTesto = ly + grande.h + 60;
    }
    const tb = await adattaTesto([{ testo: testoOutro, ruolo: 'titolo' }], font, {
      larghezza: W - 2 * MARGINE_LATO, altezzaMax: z1 - topTesto, base: { titolo: 72, sotto: 40 }, scalaMin: 0.6, colore: colori.testo,
    });
    avvisoRiduzione(tb.scala, avvisi);
    figli.push(assoluto(MARGINE_LATO, topTesto, { width: W - 2 * MARGINE_LATO }, [tb.elemento]));
    const png = await sharp(await disegnaLivello(figli, W, H, font)).flatten({ background: colori.primario }).png().toBuffer();
    await fs.writeFile(path.join(dirTmp, 'outro.png'), png);
    await esegui(cfg.ffmpeg, [
      ...BASE, '-v', 'error', '-loop', '1', '-framerate', String(FPS), '-t', f3(durataOutro), '-i', 'outro.png',
      '-f', 'lavfi', '-t', f3(durataOutro), '-i', 'anullsrc=r=48000:cl=stereo',
      '-filter_complex', `[0:v]${FINE_VIDEO}[v]`, '-map', '[v]', '-map', '1:a', ...CODIFICA_INTERMEDIA(t), '-t', f3(durataOutro), 'seg-outro.mkv',
    ], { segnale, timeoutMs: cfg.timeoutProcessoMs, cwd: dirTmp });
    lista.push('seg-outro.mkv');
  }

  // 3) montaggio senza ricodifica
  await fs.writeFile(path.join(dirTmp, 'lista.txt'), lista.map((n) => `file '${n}'`).join('\n'));
  await esegui(cfg.ffmpeg, [...BASE, '-v', 'error', '-f', 'concat', '-safe', '0', '-i', 'lista.txt', '-c', 'copy', 'montato.mkv'], { segnale, timeoutMs: cfg.timeoutProcessoMs, cwd: dirTmp });

  // 4) strati: titolo iniziale, logo, sottotitoli
  const strati = [];
  const ingressi = ['-i', 'montato.mkv'];
  let grafoV = '[0:v]null[v0]';
  let ultimo = 'v0';
  let indice = 1;
  const durataIntro = Math.min(3, durataClip);
  if (testoIntro) {
    const tb = await adattaTesto([{ testo: testoIntro, ruolo: 'titolo' }], font, {
      larghezza: W - 2 * MARGINE_LATO - 80, altezzaMax: 520, base: { titolo: 88, sotto: 46 }, scalaMin: 0.6, colore: colori.testo,
    });
    avvisoRiduzione(tb.scala, avvisi);
    const pad = 40;
    const top = 560;
    const livello = await disegnaLivello([
      assoluto(MARGINE_LATO, top - pad, { width: W - 2 * MARGINE_LATO, height: tb.altezza + 2 * pad, backgroundColor: rgba(colori.primario, 0.88), borderRadius: 24 }),
      assoluto(MARGINE_LATO + 40, top, { width: W - 2 * MARGINE_LATO - 80 }, [tb.elemento]),
    ], W, H, font);
    await fs.writeFile(path.join(dirTmp, 'intro.png'), livello);
    strati.push({ input: livello, left: 0, top: 0 });
    ingressi.push('-loop', '1', '-framerate', String(FPS), '-t', f3(durataIntro), '-i', 'intro.png');
    grafoV += `;[${indice}:v]format=rgba,fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st=${f3(Math.max(0, durataIntro - 0.4))}:d=0.4:alpha=1[ii];[${ultimo}][ii]overlay=0:0:eof_action=pass:format=auto[v1]`;
    ultimo = 'v1';
    indice += 1;
  }
  if (l) {
    strati.push({ input: l.buf, left: l.left, top: l.top });
    ingressi.push('-i', 'logo.png');
    // Il logo piccolo sta solo sulle clip: il cartello finale ha già il logo grande al centro (mai due loghi).
    const soloClip = testoOutro ? `:enable='lt(t,${f3(durataClip)})'` : '';
    grafoV += `;[${ultimo}][${indice}:v]overlay=${l.left}:${l.top}:format=auto${soloClip}[v2]`;
    ultimo = 'v2';
    indice += 1;
  }
  if (frasi) {
    const spostate = spostaSuMontaggio(frasi, info.map((x) => x.durata), segmenti);
    if (!spostate.length) avvisi.push({ codice: 'sottotitoli_fuori_montaggio', messaggio: 'Nessuna frase dei sottotitoli cade dentro i tagli scelti: il reel esce senza sottotitoli.' });
    else {
      const dirFont = path.join(dirTmp, 'font');
      await fs.mkdir(dirFont, { recursive: true });
      // Sottotitoli con il font dei titoli in grassetto (700): leggibili sopra qualsiasi clip.
      const ft = font.titolo;
      await fs.copyFile(ft.pesi[400].file, path.join(dirFont, 'marchio-400.ttf'));
      if (ft.pesi[700].file !== ft.pesi[400].file) await fs.copyFile(ft.pesi[700].file, path.join(dirFont, 'marchio-700.ttf'));
      const famiglia = nomeFamigliaTtf(ft.pesi[700].dati) || ft.famiglia;
      await fs.writeFile(path.join(dirTmp, 'sottotitoli.ass'), creaAss(spostate, { famiglia, colori }));
      grafoV += `;[${ultimo}]ass=sottotitoli.ass:fontsdir=font[v3]`;
      ultimo = 'v3';
    }
  }
  grafoV += `;[${ultimo}]format=yuv420p[v]`;

  // 5) audio: musica (facoltativa) + normalizzazione a -14 LUFS in due passate
  let indiceMusica = null;
  const ingressiMisura = ['-i', 'montato.mkv'];
  if (musica) {
    indiceMusica = indice;
    ingressi.push('-stream_loop', '-1', '-i', musica.percorso);
    ingressiMisura.push('-stream_loop', '-1', '-i', musica.percorso);
  }
  const misura = await misuraVolume(ingressiMisura, catenaAudio(musica ? 1 : null, durataTotale, volume), cfg, segnale, dirTmp);
  if (!misura) avvisi.push(AVVISO_MUTO);
  const grafoA = `${catenaAudio(indiceMusica, durataTotale, volume)};[mix]${filtroLoudnorm(misura)}[a]`;

  await esegui(cfg.ffmpeg, [
    ...BASE, '-v', 'error', '-threads', t, ...ingressi,
    '-filter_threads', t, '-filter_complex_threads', t, '-filter_complex', `${grafoV};${grafoA}`, '-map', '[v]', '-map', '[a]',
    ...CODIFICA_FINALE(t), '-t', f3(durataTotale), path.join(dirOut, 'reel.mp4'),
  ], { segnale, timeoutMs: cfg.timeoutProcessoMs, cwd: dirTmp });

  // 6) copertina (dal montaggio, senza sottotitoli) e provino dei fotogrammi (dal reel finito)
  const copertina = await creaCopertina(path.join(dirTmp, 'montato.mkv'), durataClip, strati, dirTmp, dirOut, cfg, segnale);
  const finale = path.join(dirOut, 'reel.mp4');
  const durata = await durataFile(finale, cfg, segnale);
  const fotogrammi = await creaFotogrammi(finale, durata, dirTmp, dirOut, cfg, segnale);
  const { size } = await fs.stat(finale);
  return {
    file: [
      { tipo: 'video', url: url('reel.mp4'), durata, byte: size },
      { tipo: 'copertina', url: url(copertina) },
      { tipo: 'fotogrammi', url: url(fotogrammi) },
    ],
    avvisi,
  };
}

// ---------------------------------------------------------------- STORIA VIDEO
export async function creaStoriaVideo({ clip, logo, dati, lavoro, url, cfg, segnale }) {
  const avvisi = [];
  const t = String(cfg.threadFfmpeg);
  const { dirTmp, dirOut } = lavoro;
  const info = await sondaVideo(clip, cfg, segnale);
  const colori = coloriValidi(dati.colori, avvisi);
  const sfondo = dati.sfondo ?? 'sfocato';
  if (sfondo !== 'sfocato' && sfondo !== 'colore') throw nonValido('dati_non_validi', '«sfondo» deve essere "sfocato" oppure "colore".');
  const inizio = Number(dati.inizio ?? 0);
  let fine = Number(dati.fine ?? info.durata);
  if (!Number.isFinite(inizio) || !Number.isFinite(fine) || inizio < 0 || fine <= inizio) {
    throw nonValido('tagli_non_validi', '«inizio» e «fine» devono essere secondi, con fine maggiore di inizio.');
  }
  if (inizio >= info.durata) throw nonValido('tagli_non_validi', `La clip dura ${info.durata.toFixed(1)} secondi: «inizio» è oltre la fine.`);
  fine = Math.min(fine, info.durata);
  const richiesta = fine - inizio;
  let durata = Math.min(richiesta, LIMITE_STORIA);
  if (richiesta > 60) {
    avvisi.push({ codice: 'durata_tagliata', messaggio: `Una storia video può durare al massimo 60 secondi: ho tenuto i primi 60 (da ${inizio.toFixed(1)}s a ${(inizio + durata).toFixed(1)}s).` });
  }
  if (durata < 1) throw errore(422, 'video_troppo_corto', 'La storia video deve durare almeno 1 secondo.');
  const { grafo, modo, hdr } = grafoAdattamento(info, { sfondo, colore: colori.primario });
  if (modo === 'sfondo') avvisi.push({ codice: sfondo === 'colore' ? 'sfondo_colore' : 'sfondo_sfocato', messaggio: `La clip (${info.larghezza}×${info.altezza}) non è verticale: l'ho messa al centro con ${sfondo === 'colore' ? 'un fondo a colore pieno' : 'lo sfondo sfocato della stessa clip'}.` });
  if (hdr) avvisi.push({ codice: 'hdr_convertito', messaggio: "La clip è in HDR: l'ho convertita nei colori normali (SDR) per Instagram." });

  const l = await logoVideo(logo, dirTmp);
  const ingresso = ['-ss', f3(inizio), '-t', f3(durata), '-i', clip.percorso];
  let misura = null;
  if (info.audio) {
    misura = await misuraVolume(ingresso, '[0:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[mix]', cfg, segnale, dirTmp);
  }
  if (!misura) avvisi.push(AVVISO_MUTO);
  const args = [...BASE, '-v', 'error', '-threads', t, ...ingresso];
  let indice = 1;
  let grafoV = grafo.replace('[v]', '[base]');
  if (l) {
    args.push('-i', 'logo.png');
    grafoV += `;[base][${indice}:v]overlay=${l.left}:${l.top}:format=auto,format=yuv420p[v]`;
    indice += 1;
  } else grafoV += ';[base]null[v]';
  let grafoA;
  if (info.audio) {
    grafoA = `[0:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${f3(durata)},${filtroLoudnorm(misura)}[a]`;
  } else {
    args.push('-f', 'lavfi', '-t', f3(durata), '-i', 'anullsrc=r=48000:cl=stereo');
    grafoA = `[${indice}:a]anull[a]`;
  }
  const finale = path.join(dirOut, 'storia.mp4');
  args.push('-filter_threads', t, '-filter_complex_threads', t, '-filter_complex', `${grafoV};${grafoA}`, '-map', '[v]', '-map', '[a]', ...CODIFICA_FINALE(t), '-t', f3(durata), finale);
  await esegui(cfg.ffmpeg, args, { segnale, timeoutMs: cfg.timeoutProcessoMs, cwd: dirTmp });

  const durataOut = await durataFile(finale, cfg, segnale);
  const copertina = await creaCopertina(finale, durataOut, [], dirTmp, dirOut, cfg, segnale);
  const fotogrammi = await creaFotogrammi(finale, durataOut, dirTmp, dirOut, cfg, segnale);
  const { size } = await fs.stat(finale);
  return {
    file: [
      { tipo: 'video', url: url('storia.mp4'), durata: durataOut, byte: size },
      { tipo: 'copertina', url: url(copertina) },
      { tipo: 'fotogrammi', url: url(fotogrammi) },
    ],
    avvisi,
  };
}
