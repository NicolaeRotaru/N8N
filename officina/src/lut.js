// LUT: il girato in profilo piatto/log (S-Log, V-Log, C-Log, D-Log, HLG «flat»…) esce slavato finché non gli si
// applica la tabella colori della camera (un file .cube). L'officina li tiene in /dati/lut/<nome>.cube: si caricano
// una volta (POST /lut) e poi la regia li usa per nome, per tutto il video o per una clip sola.
import fs from 'node:fs/promises';
import path from 'node:path';
import { errore } from './errori.js';

const RE_NOME = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const MAX_LUT_BYTE = 12 * 1024 * 1024;

export const dirLut = (cfg) => path.join(cfg.datiDir, 'lut');

export function nomeLut(v) {
  const n = String(v ?? '').trim().toLowerCase().replace(/\.cube$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return RE_NOME.test(n) ? n : null;
}

// Un .cube valido: LUT_3D_SIZE fra 2 e 129 e almeno tante righe di tre numeri quanti sono i punti (N³).
export function controllaCube(testo) {
  const righe = String(testo).split(/\r?\n/);
  let n = 0;
  let valori = 0;
  for (const r of righe) {
    const t = r.trim();
    if (!t || t.startsWith('#')) continue;
    const m = /^LUT_3D_SIZE\s+(\d+)$/i.exec(t);
    if (m) { n = Number(m[1]); continue; }
    if (/^LUT_1D_SIZE/i.test(t)) return { ok: false, motivo: 'è una LUT 1D: serve una LUT 3D (LUT_3D_SIZE)' };
    if (/^-?[\d.]+(e-?\d+)?\s+-?[\d.]+(e-?\d+)?\s+-?[\d.]+(e-?\d+)?$/i.test(t)) valori++;
  }
  if (!(n >= 2 && n <= 129)) return { ok: false, motivo: 'manca LUT_3D_SIZE (o non è fra 2 e 129)' };
  if (valori < n ** 3) return { ok: false, motivo: `ci sono ${valori} punti invece di ${n ** 3}` };
  return { ok: true, punti: n };
}

export async function salvaLut(cfg, nome, file) {
  const n = nomeLut(nome);
  if (!n) throw errore(400, 'dati_non_validi', 'Il nome della LUT deve essere di lettere minuscole, numeri e trattini (es. «slog3-sony-a7iv»).');
  if (file.byte > MAX_LUT_BYTE) throw errore(413, 'file_troppo_grande', 'La LUT supera 12 MB: non è un file .cube normale.');
  const testo = await fs.readFile(file.percorso, 'utf8');
  const c = controllaCube(testo);
  if (!c.ok) throw errore(415, 'lut_non_valida', `Il file «${file.nome}» non è una LUT .cube valida: ${c.motivo}.`);
  await fs.mkdir(dirLut(cfg), { recursive: true });
  const dest = path.join(dirLut(cfg), `${n}.cube`);
  await fs.writeFile(`${dest}.tmp`, testo);
  await fs.rename(`${dest}.tmp`, dest);
  return { nome: n, punti: c.punti };
}

export async function elencoLut(cfg) {
  const nomi = await fs.readdir(dirLut(cfg)).catch(() => []);
  return nomi.filter((x) => x.endsWith('.cube')).map((x) => x.slice(0, -5)).sort();
}

// Quale LUT per ogni materiale video: lut_materiali[codice] > lut del materiale (dato al caricamento) > lut del video.
// «no» toglie la LUT. Restituisce Map codice → percorso del .cube, e gli errori (LUT che non esiste).
export async function lutPerMateriali(cfg, materiali, { lut = null, lut_materiali = null } = {}) {
  const scelte = new Map();
  const mancanti = new Set();
  const disponibili = new Set(await elencoLut(cfg));
  const perCodice = lut_materiali && typeof lut_materiali === 'object' ? lut_materiali : {};
  for (const m of materiali) {
    if (m.tipo !== 'video') continue;
    const voluta = perCodice[m.codice] ?? m.lut ?? lut;
    if (voluta === null || voluta === undefined || String(voluta).trim() === '' || String(voluta).trim().toLowerCase() === 'no') continue;
    const n = nomeLut(voluta);
    if (!n || !disponibili.has(n)) { mancanti.add(String(voluta).slice(0, 40)); continue; }
    scelte.set(m.codice, path.join(dirLut(cfg), `${n}.cube`));
  }
  if (mancanti.size) throw errore(422, 'lut_mancante', `La LUT ${[...mancanti].map((x) => `«${x}»`).join(', ')} non c'è nell'officina: caricala con POST /lut (elenco: ${[...disponibili].join(', ') || 'nessuna'}).`);
  return scelte;
}

// Il pezzo di filtro: dopo la conversione HDR (se c'è), prima del ritaglio. Il nome è già ripulito (lettere, numeri,
// trattini); un percorso con caratteri che il filtergraph legge in modo speciale non si usa.
export function filtroLut(percorso) {
  if (!percorso) return '';
  if (!/^[\w/.-]+$/.test(percorso)) throw errore(500, 'lut_percorso', 'La cartella delle LUT ha caratteri che FFmpeg non accetta in un filtro.');
  return `lut3d=file=${percorso}:interp=tetrahedral,`;
}
