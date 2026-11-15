// Sottotitoli: lettura/scrittura SRT, spostamento sui tagli del montaggio, conversione in ASS per libass.
//
// CONVENZIONE DEI TEMPI (vale per /video/trascrivi e /video/reel):
// - "linea sorgente" = le clip intere messe una dopo l'altra, nell'ordine in cui sono state mandate.
//   È la linea su cui /video/trascrivi scrive l'SRT.
// - /video/reel riceve l'SRT approvato su quella stessa linea e lo sposta da solo sui tagli
//   (le frasi che cadono fuori dai tagli spariscono, quelle a cavallo vengono accorciate).

export function secondiSrt(t) {
  const m = String(t).trim().match(/^(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
}

export function tempoSrt(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

export function leggiSrt(testo) {
  const frasi = [];
  const blocchi = String(testo).replace(/\r/g, '').replace(/^﻿/, '').split(/\n\s*\n/);
  for (const b of blocchi) {
    const righe = b.split('\n').map((r) => r.trimEnd()).filter((r) => r.trim() !== '');
    const i = righe.findIndex((r) => r.includes('-->'));
    if (i < 0) continue;
    const [a, z] = righe[i].split('-->');
    const inizio = secondiSrt(a);
    const fine = secondiSrt((z || '').trim().split(/\s+/)[0]);
    const parole = righe.slice(i + 1).join('\n').trim();
    if (inizio === null || fine === null || fine <= inizio || !parole) continue;
    frasi.push({ inizio, fine, testo: parole });
  }
  return frasi.sort((x, y) => x.inizio - y.inizio);
}

export function scriviSrt(frasi) {
  return frasi.map((f, i) => `${i + 1}\n${tempoSrt(f.inizio)} --> ${tempoSrt(f.fine)}\n${f.testo}\n`).join('\n');
}

// durate[k] = durata intera della clip k; segmenti = [{clip, inizio, fine, offset}] (offset = dove inizia nel montaggio)
export function spostaSuMontaggio(frasi, durate, segmenti, minimo = 0.25) {
  const partenza = [];
  let acc = 0;
  for (const d of durate) {
    partenza.push(acc);
    acc += d;
  }
  const out = [];
  for (const f of frasi) {
    for (const s of segmenti) {
      const a = partenza[s.clip] + s.inizio;
      const z = partenza[s.clip] + s.fine;
      const i = Math.max(f.inizio, a);
      const e = Math.min(f.fine, z);
      if (e - i >= minimo) out.push({ inizio: s.offset + (i - a), fine: s.offset + (e - a), testo: f.testo });
    }
  }
  return out.sort((x, y) => x.inizio - y.inizio);
}

function tempoAss(sec) {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

// Colore ASS = &HAABBGGRR (AA = trasparenza, 00 = pieno).
export function coloreAss(hex, trasparenza = 0) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const [r, g, b] = [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
  const a = Math.round(trasparenza * 255).toString(16).padStart(2, '0');
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

function testoAss(t) {
  return t.replace(/\\/g, '⧵').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\N');
}

// Sottotitoli in basso, centrati, sopra l'area sicura inferiore (MarginV 420 su 1920 => il fondo sta a y=1500).
export function creaAss(frasi, { famiglia, colori, larghezza = 1080, altezza = 1920 }) {
  const stile = [
    'Default', famiglia, 58,
    coloreAss(colori.testo), coloreAss(colori.testo), coloreAss(colori.primario, 0.15), coloreAss('#000000', 0.6),
    -1, 0, 0, 0, 100, 100, 0, 0, 3, 16, 0, 2, 90, 90, 420, 1,
  ].join(',');
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${larghezza}`,
    `PlayResY: ${altezza}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: ${stile}`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...frasi.map((f) => `Dialogue: 0,${tempoAss(f.inizio)},${tempoAss(f.fine)},Default,,0,0,0,,${testoAss(f.testo)}`),
    '',
  ].join('\n');
}
