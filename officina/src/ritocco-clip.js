// Due ritocchi che un montatore fa a mano prima di montare: le clip mosse si stabilizzano, e le clip dello stesso video
// si portano agli stessi colori (una girata con la luce calda della finestra, una sotto il neon: nel reel sembrano due
// posti diversi).
//
// STABILIZZAZIONE. Con vidstab (due passate: si misura il tremolio, poi lo si toglie, con un leggero ingrandimento che
// nasconde i bordi) se l'FFmpeg del server lo ha; altrimenti deshake, una passata, più semplice. Si stabilizzano le scene
// «mosse» (movimento sopra SOGLIA_MOSSA, la stessa etichetta del catalogo) con stile.stabilizza = 'auto' (di serie),
// tutte con 'si', nessuna con 'no'. Se la prima passata fallisce, il pezzo esce com'era.
//
// COLORI UGUALI. Di ogni pezzo si misura il colore medio sulla miniatura della sua scena (già salvata nel progetto). Il
// riferimento è la mediana dei pezzi del video. Ogni pezzo si sposta di metà della distanza verso il riferimento (mai
// oltre il 12% per canale, mai oltre 0,05 di luminosità): si uniformano senza appiattire, e una clip scelta apposta
// scura resta più scura delle altre.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { esegui } from './processi.js';

export const SOGLIA_MOSSA = 30; // come l'etichetta «mossa» del catalogo
// la stabilizzazione semplice, in una passata (quando vidstab manca): la usa anche la prova dei filtri all'avvio
export const DESHAKE = 'deshake=rx=32:ry=32,';
const r3 = (n) => Math.round(n * 1000) / 1000;

// I filtri di questo FFmpeg (una volta per processo e per programma).
const elenchi = new Map();
export async function haFiltro(cfg, nome) {
  if (!elenchi.has(cfg.ffmpeg)) {
    elenchi.set(cfg.ffmpeg, esegui(cfg.ffmpeg, ['-hide_banner', '-filters'], { timeoutMs: 15_000 })
      .then(({ stdout }) => new Set(String(stdout).split('\n').map((r) => r.trim().split(/\s+/)[1]).filter(Boolean)))
      .catch(() => new Set()));
  }
  return (await elenchi.get(cfg.ffmpeg)).has(nome);
}

// La scena di un pezzo: per etichetta (copertura) o per tempo (volto).
export function scenaDi(materiale, q) {
  const scene = materiale && Array.isArray(materiale.scene) ? materiale.scene : [];
  if (q.etichetta) { const s = scene.find((x) => x.codice === q.etichetta); if (s) return s; }
  const t = Number(q.inizio) || 0;
  return scene.find((x) => t >= x.inizio && t < x.fine) || scene[0] || null;
}

export function vaStabilizzata(stile, scena) {
  const modo = String(stile.stabilizza ?? 'auto').toLowerCase();
  if (['no', 'false', 'off', 'mai'].includes(modo)) return false;
  if (['si', 'sì', 'true', 'on', 'sempre'].includes(modo)) return true;
  return Number(scena?.movimento) > SOGLIA_MOSSA;
}

// Il pezzo di filtro della stabilizzazione, da mettere dopo «fps=…,» (stessi fotogrammi della misura). '' se non si può.
export async function filtroStabile({ sorgente, inizio, durata, pre, fps, dirTmp, nome, cfg, segnale }) {
  if (await haFiltro(cfg, 'vidstabdetect') && await haFiltro(cfg, 'vidstabtransform')) {
    const trf = path.join(dirTmp, `${nome}.trf`);
    if (!/^[\w/.-]+$/.test(trf)) return DESHAKE;
    try {
      await esegui(cfg.ffmpeg, ['-hide_banner', '-nostdin', '-v', 'error', '-ss', String(Math.max(0, inizio).toFixed(3)), '-t', String((durata + 0.5).toFixed(3)), '-i', sorgente,
        '-vf', `${pre}fps=${fps},vidstabdetect=shakiness=6:accuracy=12:result=${trf}`, '-an', '-f', 'null', '-'], { segnale, timeoutMs: cfg.timeoutProcessoMs || 600_000 });
      await fs.access(trf);
      return `vidstabtransform=input=${trf}:smoothing=12:optzoom=1:zoomspeed=0.25,unsharp=5:5:0.5:3:3:0.2,`;
    } catch (e) {
      if (segnale?.aborted) throw e;
      return '';
    }
  }
  return (await haFiltro(cfg, 'deshake')) ? DESHAKE : '';
}

// Colore medio di un'immagine (0-255 per canale), saltando i pixel quasi neri e quasi bianchi.
export async function coloreMedio(file) {
  const { data, info } = await sharp(file).removeAlpha().resize(96, 96, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (y < 16 || y > 240) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  if (n < 20) return null;
  return { r: r / n, g: g / n, b: b / n };
}

const mediana = (v) => { const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const taglia = (x, lim) => Math.max(-lim, Math.min(lim, x));

// Le correzioni: per ogni chiave il pezzo di filtro (colorchannelmixer + eq), o '' se il pezzo è già vicino.
export function bilanciamento(misure, { forza = 0.5, maxCanale = 0.12, maxLuce = 0.05 } = {}) {
  const voci = [...misure.entries()].filter(([, m]) => m);
  const fuori = new Map();
  if (voci.length < 2) return fuori;
  const luce = (m) => 0.2126 * m.r + 0.7152 * m.g + 0.0722 * m.b;
  // il riferimento: la mediana delle tinte (canale / luce) e la mediana della luce
  const rif = { r: mediana(voci.map(([, m]) => m.r / luce(m))), g: mediana(voci.map(([, m]) => m.g / luce(m))), b: mediana(voci.map(([, m]) => m.b / luce(m))), y: mediana(voci.map(([, m]) => luce(m))) };
  for (const [k, m] of voci) {
    const y = luce(m);
    const guadagno = (c) => r3(1 + taglia(forza * (rif[c] / (m[c] / y) - 1), maxCanale));
    const gr = guadagno('r'); const gg = guadagno('g'); const gb = guadagno('b');
    const dLuce = r3(taglia(forza * ((rif.y - y) / 255), maxLuce));
    const pezzi = [];
    if ([gr, gg, gb].some((x) => Math.abs(x - 1) >= 0.01)) pezzi.push(`colorchannelmixer=rr=${gr}:gg=${gg}:bb=${gb}`);
    if (Math.abs(dLuce) >= 0.005) pezzi.push(`eq=brightness=${dLuce}`);
    fuori.set(k, pezzi.length ? `${pezzi.join(',')},` : '');
  }
  return fuori;
}
