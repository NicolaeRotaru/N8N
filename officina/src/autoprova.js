// Prova dei filtri sull'FFmpeg di QUESTO server. In produzione l'officina usa l'FFmpeg di Debian 12 (5.1), in locale
// un altro: i filtri arrivati con la moodboard (curva, LUT, zoom delle foto, voce da studio, musica che si abbassa
// sotto la voce) non erano mai passati da quello del server. La prova li fa girare una volta all'avvio, su un secondo
// sintetico e con gli stessi parametri del montaggio, e /salute (con la chiave) dice com'è andata.
// Non blocca niente: un filtro che manca fa fallire solo i montaggi che lo usano, e lo si vede prima di montare.
import fs from 'node:fs/promises';
import path from 'node:path';
import { esegui } from './processi.js';
import { STILI, VOCE_STUDIO, filtroColore, misuraRitardoVoce } from './regia-render.js';
import { filtroLut } from './lut.js';

// Tutti i filtri che l'officina usa da qualche parte (montaggio classico, regia, HDR, provini, voce, musica).
export const FILTRI_RICHIESTI = ['zscale', 'tonemap', 'zoompan', 'boxblur', 'overlay', 'ass', 'curves', 'eq', 'lut3d', 'tpad',
  'loudnorm', 'sidechaincompress', 'amix', 'afftdn', 'deesser', 'acompressor', 'highpass', 'apad', 'atrim', 'aevalsrc'];

// La LUT che non cambia niente (2×2×2 punti, il rosso cambia per primo): serve solo a far passare il filtro lut3d.
const CUBO_IDENTITA = `LUT_3D_SIZE 2\n${[0, 1].flatMap((b) => [0, 1].flatMap((g) => [0, 1].map((r) => `${r} ${g} ${b}`))).join('\n')}\n`;

const ultimeRighe = (e) => String(e?.stderr || e?.message || e).trim().split('\n').slice(-3).join(' ').slice(0, 300);

export async function provaFiltri(cfg) {
  const esito = { ok: false, ffmpeg: null, mancanti: [], ritardo_voce: null, errore: null };
  try {
    const { stdout: versione } = await esegui(cfg.ffmpeg, ['-hide_banner', '-version'], { timeoutMs: 15_000 });
    esito.ffmpeg = (/ffmpeg version (\S+)/.exec(String(versione)) || [])[1] || null;
    const { stdout: elenco } = await esegui(cfg.ffmpeg, ['-hide_banner', '-filters'], { timeoutMs: 15_000 });
    const presenti = new Set(String(elenco).split('\n').map((r) => r.trim().split(/\s+/)[1]).filter(Boolean));
    esito.mancanti = FILTRI_RICHIESTI.filter((f) => !presenti.has(f));
    if (esito.mancanti.length) {
      esito.errore = `in questo FFmpeg mancano: ${esito.mancanti.join(', ')}`;
      return esito;
    }
    const dir = path.join(cfg.datiDir, 'autoprova');
    await fs.mkdir(dir, { recursive: true });
    const cubo = path.join(dir, 'identita.cube');
    await fs.writeFile(cubo, CUBO_IDENTITA);
    const s = STILI.sdg;
    const video = `[0:v]${filtroLut(cubo)}${filtroColore(s)},zoompan=z='1+${s.zoom_foto}*on/25':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=320x240:fps=25,tpad=stop_mode=clone:stop_duration=0.5[v]`;
    const audio = `[1:a]${VOCE_STUDIO}[voce];[2:a][voce]sidechaincompress=threshold=0.015:ratio=10:attack=15:release=450:makeup=1[a]`;
    try {
      await esegui(cfg.ffmpeg, ['-hide_banner', '-nostdin', '-v', 'error',
        '-f', 'lavfi', '-i', 'color=c=gray:s=320x240:d=1:r=25',
        '-f', 'lavfi', '-i', 'sine=f=440:d=1:sample_rate=48000',
        '-f', 'lavfi', '-i', 'anoisesrc=d=1:a=0.1:r=48000',
        '-filter_complex', `${video};${audio}`, '-map', '[v]', '-map', '[a]', '-f', 'null', '-'], { timeoutMs: 60_000 });
    } catch (e) {
      esito.errore = `i filtri della moodboard non girano: ${ultimeRighe(e)}`;
      return esito;
    }
    esito.ritardo_voce = await misuraRitardoVoce(cfg);
    if (esito.ritardo_voce === null) {
      esito.errore = 'la voce da studio non si misura: i montaggi la puliscono senza il filtro del soffio';
      return esito;
    }
    esito.ok = true;
  } catch (e) {
    esito.errore = `FFmpeg non risponde: ${ultimeRighe(e)}`;
  }
  return esito;
}
