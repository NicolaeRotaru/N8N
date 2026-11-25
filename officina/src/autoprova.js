// Prova dei filtri sull'FFmpeg di QUESTO server. In produzione l'officina usa l'FFmpeg di Debian 12 (5.1), in locale
// un altro: i filtri arrivati con la moodboard non erano mai passati da quello del server. All'avvio, una volta:
// 1) tutti i filtri che l'officina usa devono esserci (elenco qui sotto, tenuto in riga da una prova che registra le
//    chiamate vere a FFmpeg durante i montaggi delle prove);
// 2) su un secondo sintetico girano, con LE STESSE FUNZIONI del montaggio, i pezzi che cambiano più facilmente fra
//    una versione e l'altra: inquadratura di un verticale nel 16:9 (sfondo sfocato), LUT, colore dello stile, zoom
//    delle foto, riempimento, voce da studio con la sua compensazione, musica che si abbassa sotto la voce, cambi
//    d'inquadratura, neri e immagini ferme.
// Restano provati solo per nome: sottotitoli (ass), volume finale (loudnorm), conversione HDR (zscale, tonemap).
// La prova vera resta il primo montaggio: questa avvisa prima, se qualcosa manca. /salute (con la chiave) dice com'è
// andata. Non blocca niente: un filtro che manca fa fallire solo i montaggi che lo usano.
import fs from 'node:fs/promises';
import path from 'node:path';
import { esegui } from './processi.js';
import { STILI, filtroColore, filtroVoce, filtroZoomFoto, filtroRiempi, catenaAudio, grafoInquadratura, FILTRO_DIFETTI, VOCE_STUDIO_SENZA_RITARDO } from './regia-render.js';
import { filtroScene } from './analisi.js';
import { filtroLut } from './lut.js';

// Tutti i filtri (e le sorgenti sintetiche) che l'officina usa da qualche parte.
export const FILTRI_RICHIESTI = [
  'acompressor', 'aevalsrc', 'afade', 'afftdn', 'aformat', 'amix', 'anoisesrc', 'anull', 'anullsink', 'anullsrc', 'apad',
  'aresample', 'asetpts', 'asplit', 'ass', 'atrim', 'blackdetect', 'boxblur', 'color', 'concat', 'crop', 'curves', 'deesser',
  'eq', 'fade', 'format', 'fps', 'freezedetect', 'highpass', 'loudnorm', 'lut3d', 'noise', 'null', 'nullsink', 'overlay', 'pad', 'scale',
  'scdet', 'setpts', 'setsar', 'sidechaincompress', 'silencedetect', 'sine', 'split', 'tonemap', 'tpad', 'volume',
  'volumedetect', 'zoompan', 'zscale',
];

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
  } catch (e) {
    esito.errore = `FFmpeg non risponde: ${ultimeRighe(e)}`;
    return esito;
  }
  if (esito.mancanti.length) {
    esito.errore = `in questo FFmpeg mancano: ${esito.mancanti.join(', ')}`;
    return esito;
  }
  let cubo;
  try {
    const dir = path.join(cfg.datiDir, 'autoprova');
    await fs.mkdir(dir, { recursive: true });
    cubo = path.join(dir, 'identita.cube');
    await fs.writeFile(cubo, CUBO_IDENTITA);
    filtroLut(cubo);
  } catch (e) {
    esito.errore = `non riesco a preparare la prova nella cartella dei dati: ${ultimeRighe(e)}`;
    return esito;
  }
  // la voce da studio è quella dei montaggi (stessa misura del ritardo, una volta per processo)
  const s = STILI.sdg;
  const voce = await filtroVoce(s, cfg);
  const senzaVoce = voce === `${VOCE_STUDIO_SENZA_RITARDO},`;
  const erroreVoce = 'la voce da studio non si misura: i montaggi la puliscono senza il filtro del soffio';
  if (!senzaVoce) esito.ritardo_voce = Number((/start_sample=(\d+)/.exec(voce) || [0, 0])[1]);
  const fmt = { w: 320, h: 180 };
  const verticale = grafoInquadratura({ larghezza: 180, altezza: 320, trasferimento: '' }, fmt, { modo: 'intera', fps: s.fps, lut: cubo }).replace('[v]', '[g]');
  const grafo = [
    verticale,
    `[g]${filtroColore(s)},${filtroRiempi(25, s.fps)},split=2[v][d]`,
    `[d]${filtroScene()},${FILTRO_DIFETTI},nullsink`,
    `[1:v]${filtroZoomFoto(s, fmt, 25)},format=yuv420p,nullsink`,
    catenaAudio(2, 3, 1, 0.3, voce),
  ].join(';');
  try {
    await esegui(cfg.ffmpeg, ['-hide_banner', '-nostdin', '-v', 'error',
      '-f', 'lavfi', '-i', 'color=c=gray:s=180x320:d=1:r=25',
      '-f', 'lavfi', '-i', 'color=c=white:s=384x216:d=1:r=25',
      '-f', 'lavfi', '-i', 'sine=f=440:d=1:sample_rate=48000',
      '-f', 'lavfi', '-i', 'anoisesrc=d=1:a=0.1:r=48000',
      '-filter_complex', grafo, '-map', '[v]', '-map', '[mix]', '-f', 'null', '-'], { timeoutMs: 60_000 });
  } catch (e) {
    esito.errore = (senzaVoce ? `${erroreVoce}; e ` : '') + `i filtri del montaggio non girano: ${ultimeRighe(e)}`;
    return esito;
  }
  if (senzaVoce) {
    esito.errore = erroreVoce;
    return esito;
  }
  esito.ok = true;
  return esito;
}
