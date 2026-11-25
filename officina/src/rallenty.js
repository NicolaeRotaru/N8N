// Rallenty: le clip girate a 50, 60, 100 o 120 fotogrammi al secondo sono fatte per essere rallentate.
// Riprodotte com'escono dalla camera andrebbero a velocità normale e sprecherebbero il motivo per cui sono state girate
// così (moodboard di Scatti di G: «mai di fretta»). Qui la clip si «conforma»: ogni fotogramma girato diventa un
// fotogramma del video finale (a 25), quindi una clip a 50 dura il doppio e va lenta la metà.
//
// Si fa una volta sola, quando il materiale entra nel progetto: il file conformato prende il posto dell'originale,
// e scene, durata e miniature si riferiscono a lui. Così la regia, il catalogo e il render non devono sapere niente:
// per loro è una clip a 25 fotogrammi, più lunga.
//
// Una clip in cui qualcuno parla NON si rallenta mai da sola (un'intervista girata a 50 resta a velocità normale).
import fs from 'node:fs/promises';
import path from 'node:path';
import { esegui } from './processi.js';
import { BASE } from './video.js';

export const SOGLIA_FPS = 47; // da 48/50 in su
export const FATTORE_MAX = 4; // mai più lento di 4 volte (una clip a 240 si rallenta 4 volte, prendendo un fotogramma ogni 2,4)
const r2 = (n) => Math.round(n * 100) / 100;

// «50/1», «60000/1001» → numero
export function fpsDa(testo) {
  const [a, b] = String(testo || '').split('/').map(Number);
  if (!(a > 0)) return 0;
  return b > 0 ? a / b : a;
}

// Il modo scritto in qualunque forma: false/0/«no» = mai, true/1/«si» = sempre, il resto = auto.
export function modoRallenty(v) {
  if (v === false || v === 0) return 'no';
  if (v === true || v === 1) return 'si';
  const m = String(v ?? 'auto').trim().toLowerCase();
  if (['no', 'false', '0', 'off', 'spento', 'mai'].includes(m)) return 'no';
  if (['si', 'sì', 'true', '1', 'on', 'acceso', 'sempre'].includes(m)) return 'si';
  return 'auto';
}

// C'è un audio che si sente ma non si sa se qualcuno parla (trascrizione spenta, non disponibile o fallita).
export function parlatoIncerto({ audio, volumeMax, parlato }) {
  const udibile = audio === true && volumeMax !== null && volumeMax !== undefined && volumeMax > -45;
  return udibile && !Array.isArray(parlato);
}

// Decide se e quanto rallentare. modo: 'auto' (di serie), 'si' (sempre, se la clip è veloce), 'no' (mai).
// In auto si rallenta solo quando si SA che nessuno parla: audio assente o muto, oppure trascrizione fatta con meno di
// 3 parole. Con un audio che si sente e nessuna trascrizione non si rallenta: un'intervista girata a 50 resterebbe muta.
// Restituisce null se non si rallenta.
export function decidiRallenty({ fps, parlato, modo = 'auto', fpsUscita = 25, audio = false, volumeMax = null }) {
  const m = modoRallenty(modo);
  if (m === 'no') return null;
  if (!(fps >= SOGLIA_FPS) || !(fpsUscita > 0)) return null;
  const parole = (parlato || []).reduce((t, s) => t + (s.parole?.length || String(s.testo || '').split(/\s+/).filter(Boolean).length), 0);
  if (m !== 'si' && (parole >= 3 || parlatoIncerto({ audio, volumeMax, parlato }))) return null;
  const fattore = Math.min(FATTORE_MAX, fps / fpsUscita);
  if (fattore < 1.5) return null;
  return { fps_origine: r2(fps), fps: fpsUscita, fattore: Math.round(fattore * 10000) / 10000 };
}

// Scene e durata del materiale nel tempo della clip rallentata. Le miniature restano quelle (sono gli stessi fotogrammi).
export function scalaMateriale(materiale, fattore) {
  const s = (t) => r2(t * fattore);
  return {
    ...materiale,
    durata: s(materiale.durata),
    audio: false,
    parlato: null,
    scene: (materiale.scene || []).map((x) => {
      const { parlato, ...resto } = x;
      const y = { ...resto, inizio: s(x.inizio), fine: s(x.fine) };
      if (x.durata !== undefined) y.durata = s(x.durata);
      return y;
    }),
  };
}

// Il file conformato: stessi fotogrammi, tempi allungati, uscita a fpsUscita, niente audio, lato lungo al massimo 1920
// (il 4K non serve per i social e il render dopo va più veloce).
export async function conformaFile(sorgente, uscita, r, cfg, segnale) {
  const t = String(cfg.threadFfmpeg);
  const grafo = `[0:v]setpts=(PTS-STARTPTS)*${r.fattore},fps=${r.fps},scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))':flags=lanczos,format=yuv420p[v]`;
  await esegui(cfg.ffmpeg, [...BASE, '-v', 'error', '-threads', t, '-i', sorgente, '-filter_threads', t, '-filter_complex', grafo, '-map', '[v]', '-an',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(r.fps), '-g', String(r.fps * 2), uscita], { segnale, timeoutMs: cfg.timeoutProcessoMs });
}

// Dopo l'analisi di un video: se va rallentato, crea il file conformato al posto dell'originale e restituisce il
// materiale con i tempi nuovi e il percorso relativo nuovo. Altrimenti restituisce tutto com'era.
export async function forseRallenta({ materiale, fps, assoluto, rel, dati, cfg, segnale }) {
  const modo = dati.rallenta ?? cfg.rallenty;
  const fpsUscita = Number(dati.fps_uscita) > 0 ? Number(dati.fps_uscita) : cfg.fpsRallenty;
  const r = decidiRallenty({ fps, parlato: materiale.parlato, modo, fpsUscita, audio: materiale.audio, volumeMax: materiale.volume_max_db });
  if (!r) {
    const dubbio = fps >= SOGLIA_FPS && modoRallenty(modo) === 'auto' && parlatoIncerto({ audio: materiale.audio, volumeMax: materiale.volume_max_db, parlato: materiale.parlato });
    return { materiale, rel, avvisi: dubbio ? [{ codice: 'rallenty_incerto', messaggio: `Il video ${materiale.codice} è girato a ${Math.round(fps)} fotogrammi al secondo e ha un audio, ma non so se qualcuno parla (trascrizione non disponibile): non l'ho rallentato. Se è un'immagine senza voce, ricaricalo con «rallenta: si».` }] : [] };
  }
  const relNuovo = rel.replace(/\.[^./]+$/, '') + '-rallenty.mp4';
  const nuovo = path.join(path.dirname(assoluto), path.basename(relNuovo));
  await conformaFile(assoluto, nuovo, r, cfg, segnale);
  await fs.rm(assoluto, { force: true });
  const virgola = (n) => String(n).replace('.', ',');
  return {
    materiale: { ...scalaMateriale(materiale, r.fattore), rallenty: r },
    rel: relNuovo,
    avvisi: [{ codice: 'rallenty', messaggio: `Il video ${materiale.codice} è girato a ${virgola(Math.round(r.fps_origine))} fotogrammi al secondo e nessuno parla: l'ho rallentato ${virgola(Math.round(r.fattore * 10) / 10)} volte (dura ${virgola(r2(materiale.durata * r.fattore))} s).` }],
  };
}
