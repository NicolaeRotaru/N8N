// Dove sta il soggetto in un'inquadratura. Quando una clip orizzontale entra in un formato più stretto (il 9:16 di un
// reel) se ne tiene solo una striscia: invece del centro fisso, la striscia segue quello che conta (una persona, un
// piatto, le mani), come farebbe un montatore che riquadra a mano.
// Come: due fotogrammi del pezzo (a un terzo e a due terzi), piccoli; su ognuno sharp cerca la zona più «interessante»
// (strategia attention: pelle, colori saturi, contrasto) della misura del ritaglio; il centro è la media dei due.
// Se qualcosa non va (fotogramma che non esce, sharp che non risponde) torna null e il pezzo resta al centro.
import sharp from 'sharp';
import { esegui } from './processi.js';

const LARGO = 480; // il fotogramma si guarda a 480 px di larghezza: basta, ed è veloce

async function fotogramma(sorgente, t, cfg, segnale) {
  const { stdout } = await esegui(cfg.ffmpeg, ['-hide_banner', '-nostdin', '-v', 'error', '-ss', String(Math.max(0, t).toFixed(3)), '-i', sorgente,
    '-frames:v', '1', '-vf', `scale=${LARGO}:-2`, '-f', 'image2pipe', '-vcodec', 'png', '-'], { segnale, timeoutMs: 60_000 });
  return stdout;
}

// Il centro (da 0 a 1, da sinistra a destra) della striscia larga quanto il formato, su un'immagine.
export async function centroInImmagine(png, fmt) {
  const m = await sharp(png).metadata();
  if (!m.width || !m.height) return null;
  const larghezza = Math.round(m.height * (fmt.w / fmt.h));
  if (larghezza >= m.width) return 0.5; // niente da ritagliare
  const r = await sharp(png).resize(larghezza, m.height, { fit: 'cover', position: sharp.strategy.attention }).toBuffer({ resolveWithObject: true });
  // sharp dà la posizione dell'immagine rispetto al ritaglio (negativa): il ritaglio comincia a |cropOffsetLeft|
  const sinistra = Math.abs(Number(r.info.cropOffsetLeft) || 0);
  return Math.min(1, Math.max(0, (sinistra + larghezza / 2) / m.width));
}

// Il centro del soggetto in un pezzo [inizio, inizio + durata] di una clip; null se non si sa.
// Vicino al centro (entro 0,06) resta il centro: niente spostamenti di pochi pixel da un pezzo all'altro.
export async function centroSoggetto(sorgente, inizio, durata, fmt, cfg, segnale) {
  try {
    const tempi = [inizio + durata / 3, inizio + (2 * durata) / 3];
    const centri = [];
    for (const t of tempi) {
      const c = await centroInImmagine(await fotogramma(sorgente, t, cfg, segnale), fmt);
      if (c !== null) centri.push(c);
    }
    if (!centri.length) return null;
    const c = centri.reduce((a, b) => a + b, 0) / centri.length;
    return Math.abs(c - 0.5) < 0.06 ? 0.5 : Math.round(c * 1000) / 1000;
  } catch (e) {
    if (segnale?.aborted) throw e;
    return null;
  }
}
