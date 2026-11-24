// Render della regia: esegue la TIMELINE PIATTA di regia.js (e solo quella) e restituisce un MP4 H.264 finito.
// 1) ogni inquadratura → un pezzo video della misura giusta (taglio al fotogramma, niente audio)
// 2) i pezzi in fila senza ricodifica
// 3) la voce: i pezzi audio della timeline in fila, con dissolvenze di pochi millesimi (niente schiocchi)
// 4) l'ultimo passaggio: colore dello stile (e grana, se lo stile la vuole), sottotitoli, cartello col nome, scritte, logo,
//    musica che si abbassa quando qualcuno parla, volume a -14 LUFS (due passate)
// 5) copertina, provino dei fotogrammi e controllo dei difetti sul file finito (neri, immagini ferme)
import fs from 'node:fs/promises';
import path from 'node:path';
import { esegui } from './processi.js';
import { errore } from './errori.js';
import { sonda, BASE, CODIFICA_FINALE, misuraVolume, filtroLoudnorm, durataFile, creaCopertina, creaFotogrammi, AVVISO_MUTO } from './video.js';
import { caricaFont, nomeFamigliaLibass } from './font.js';
import { apri, preparaLogo } from './immagini.js';
import { filtroLut } from './lut.js';

// Fotogrammi al secondo: li decide lo stile (Scatti di G gira e consegna a 25). Senza stile, 30.
export const FPS_BASE = 30;
export const FORMATI = {
  verticale: { w: 1080, h: 1920, alto: 250, basso: 340 },
  quadrato: { w: 1080, h: 1080, alto: 60, basso: 60 },
  orizzontale: { w: 1920, h: 1080, alto: 60, basso: 60 },
};

// Gli stili della regia.
// «sdg» = Scatti di G, dalla moodboard del 24/11/2026 (pagine 01-03): «mai di fretta», il nero è morbido (grigio-nero,
//   mai nero pieno), una triade calda (fumo, avorio, oro), un solo accento di colore, testi che non invadono, niente effetti.
//   Il ritmo (quanto dura un'inquadratura) è più lento di quello dei video virali: lo legge anche la regia (regia.js).
// «virale» = lo stile dei video virali: tagli veloci, parola detta evidenziata, grana. Era il primo «sdg».
// «pulito» = neutro, per i clienti senza un'identità visiva.
export const STILI = {
  sdg: {
    font_titoli: 'Poppins',
    peso_titoli: 600,
    font_testo: 'Poppins',
    peso_testo: 500,
    // segnaposto della triade finché Nicola non manda i codici esatti: Fumo, Avorio, Ambra (oro). L'accento lo può
    // cambiare il marchio del cliente; fondo e testo restano quelli di Scatti di G.
    colori: { fondo: '#2C2A27', testo: '#F4F1EC', accento: '#E0A95C' },
    sottotitoli: { modo: 'frase', maiuscolo: false, parole_max: 7, caratteri_max: 30, dimensione: 60 },
    cartello: 'linea',
    scritte: 'ombra',
    grana: 0,
    // nero morbido: i neri si alzano un poco e le alte luci non bruciano mai (una curva, uguale per ogni inquadratura)
    curva: '0/0.045 0.10/0.115 0.50/0.50 0.90/0.885 1/0.95',
    contrasto: 1,
    saturazione: 0.96,
    zoom_foto: 0.06,
    fps: 25,
    ritmo: { minima: 1.0, coperturaMin: 2.5, coperturaMax: 6, voltoMin: 1.5, voltoPrima: 3, voltoPoi: 2, fotoBase: 3.5, salto: 1.0, cartello: 3.5, scritta: 3 },
    volto: 'riempi',
    coperture: 'auto',
  },
  virale: {
    font_titoli: 'Bricolage Grotesque',
    peso_titoli: 800,
    font_testo: 'Inter',
    peso_testo: 700,
    colori: { fondo: '#0B0B0D', testo: '#F3F0EA', accento: '#D2FF3A' },
    sottotitoli: { modo: 'parola', maiuscolo: true, parole_max: 3, caratteri_max: 18, dimensione: 86 },
    cartello: 'riquadro',
    scritte: 'riquadro',
    grana: 7,
    curva: null,
    contrasto: 1.06,
    saturazione: 1.06,
    zoom_foto: 0.12,
    fps: 30,
    ritmo: {},
    volto: 'riempi',
    coperture: 'auto',
  },
  pulito: {
    font_titoli: 'Inter',
    peso_titoli: 700,
    font_testo: 'Inter',
    peso_testo: 700,
    colori: { fondo: '#111111', testo: '#FFFFFF', accento: '#FFD400' },
    sottotitoli: { modo: 'parola', maiuscolo: false, parole_max: 5, caratteri_max: 26, dimensione: 64 },
    cartello: 'riquadro',
    scritte: 'riquadro',
    grana: 0,
    curva: null,
    contrasto: 1,
    saturazione: 1,
    zoom_foto: 0.12,
    fps: 30,
    ritmo: {},
    volto: 'riempi',
    coperture: 'auto',
  },
};

const f3 = (n) => Number(n).toFixed(3);
const RE_HEX = /^#[0-9a-fA-F]{6}$/;

// Luminanza relativa (0 nero, 1 bianco) di un colore #RRGGBB.
export function luminanza(hex) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

// Stile della richiesta = uno stile base + il marchio del cliente (facoltativo). Dal marchio arrivano solo l'accento
// (colori.accento, o il colore primario) e il font dei titoli con il suo peso: fondo, testo, sottotitoli e ritmo
// restano quelli dello stile (per Scatti di G: la moodboard). I sottotitoli restano nel font dello stile, che si legge.
export function stileDa(nome, marchio) {
  const base = STILI[String(nome || 'sdg').toLowerCase()] || STILI.sdg;
  const s = JSON.parse(JSON.stringify(base));
  const c = marchio?.colori || {};
  // l'accento del cliente si usa solo se si vede sul fondo scuro (un filo da 5 px nero su grigio-nero non si vede)
  const accento = [c.accento, c.primario].find((x) => RE_HEX.test(x || '') && luminanza(x) >= 0.12);
  if (accento) s.colori.accento = accento;
  if (typeof marchio?.font === 'string' && marchio.font.trim()) {
    s.font_titoli = marchio.font.trim();
    const peso = Number(marchio.peso_titolo);
    s.peso_titoli = peso >= 100 && peso <= 900 ? Math.round(peso / 100) * 100 : 700;
  }
  return s;
}

// Colore ASS: &HAABBGGRR (AA = trasparenza: 00 pieno, FF invisibile).
export function coloreAss(hex, alfa = 0) {
  const h = RE_HEX.test(hex) ? hex.slice(1) : 'FFFFFF';
  const a = Math.round(Math.max(0, Math.min(1, alfa)) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `&H${a}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
}

function assTempo(t) {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

const assTesto = (s) => String(s).replace(/\\/g, '／').replace(/[{}]/g, '').replace(/\n/g, ' ');

// Parole → gruppi da mostrare insieme (al massimo parole_max parole o caratteri_max lettere; un gruppo nuovo dopo una
// pausa o dopo la punteggiatura forte, e quando cambia la battuta).
export function gruppiDiParole(parole, { parole_max = 3, caratteri_max = 18 } = {}) {
  const gruppi = [];
  let g = null;
  for (const p of parole) {
    const lunghezza = g ? g.parole.map((x) => x.testo).join(' ').length + 1 + p.testo.length : p.testo.length;
    const ultima = g?.parole[g.parole.length - 1];
    const nuovo = !g || g.parole.length >= parole_max || lunghezza > caratteri_max || p.battuta !== g.battuta || (ultima && (p.da - ultima.a > 0.35 || /[.!?…;:]$/.test(ultima.testo)));
    if (nuovo) {
      g = { battuta: p.battuta, parole: [] };
      gruppi.push(g);
    }
    g.parole.push(p);
  }
  return gruppi;
}

// Il file ASS della regia: sottotitoli, cartello col nome, scritte. Due modi per ogni pezzo, secondo lo stile:
// - sottotitoli «parola» (virale): un evento per parola, la parola detta nel colore d'accento e un po' più grande;
//   «frase» (sdg): la frase intera, sobria, che entra e esce piano, senza niente che salta.
// - cartello «riquadro»: nome sul colore d'accento; «linea»: nome e ruolo nel colore del testo, con un filo d'accento a sinistra.
// - scritte «riquadro»: testo su un fondo; «ombra»: solo testo, con un alone morbido per leggerlo su ogni immagine.
export function creaAssRegia(tl, stile, fmt, famiglie) {
  const W = fmt.w;
  const H = fmt.h;
  const c = stile.colori;
  const verticale = H > W;
  const st = stile.sottotitoli;
  const frase = st.modo === 'frase';
  const linea = stile.cartello === 'linea';
  const ombra = stile.scritte === 'ombra';
  const dim = verticale ? st.dimensione : Math.round(st.dimensione * 0.75);
  const margineSotto = verticale ? fmt.basso + (frase ? 120 : 160) : 90;
  const alone = coloreAss(c.fondo, 0.45);
  const stili = frase
    ? [`Style: Sotto,${famiglie.testo},${dim},${coloreAss(c.testo)},${coloreAss(c.testo)},${alone},${coloreAss(c.fondo, 0.7)},0,0,0,0,100,100,0.5,0,1,${verticale ? 3 : 2.5},0,2,80,80,${margineSotto},1`]
    : [`Style: Sotto,${famiglie.titoli},${dim},${coloreAss(c.testo)},${coloreAss(c.testo)},${coloreAss(c.fondo)},${coloreAss('#000000', 0.6)},0,0,0,0,100,100,0,0,1,${verticale ? 7 : 5},2,2,60,60,${margineSotto},1`];
  if (linea) {
    stili.push(
      `Style: Nome,${famiglie.titoli},${verticale ? 54 : 46},${coloreAss(c.testo)},${coloreAss(c.testo)},${alone},${alone},0,0,0,0,100,100,0.5,0,1,2.5,0,7,0,0,0,1`,
      `Style: Ruolo,${famiglie.testo},${verticale ? 36 : 30},${coloreAss(c.testo, 0.12)},${coloreAss(c.testo, 0.12)},${alone},${alone},0,0,0,0,100,100,1,0,1,2,0,7,0,0,0,1`,
      `Style: Filo,${famiglie.testo},10,${coloreAss(c.accento)},${coloreAss(c.accento)},${coloreAss(c.accento)},${coloreAss(c.accento)},0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    );
  } else {
    stili.push(
      `Style: Nome,${famiglie.titoli},${verticale ? 62 : 52},${coloreAss(c.fondo)},${coloreAss(c.fondo)},${coloreAss(c.accento)},${coloreAss(c.accento)},0,0,0,0,100,100,0,0,3,16,0,7,0,0,0,1`,
      `Style: Ruolo,${famiglie.testo},${verticale ? 36 : 32},${coloreAss(c.testo)},${coloreAss(c.testo)},${coloreAss(c.fondo)},${coloreAss(c.fondo)},0,0,0,0,100,100,1,0,3,12,0,7,0,0,0,1`,
    );
  }
  if (ombra) {
    stili.push(
      `Style: Scritta,${famiglie.titoli},${verticale ? 84 : 70},${coloreAss(c.testo)},${coloreAss(c.testo)},${alone},${alone},0,0,0,0,100,100,0.5,0,1,3,0,5,90,90,0,1`,
      `Style: Chiusura,${famiglie.titoli},${verticale ? 70 : 58},${coloreAss(c.testo)},${coloreAss(c.testo)},${alone},${alone},0,0,0,0,100,100,0.5,0,1,3,0,5,90,90,0,1`,
    );
  } else {
    stili.push(
      `Style: Scritta,${famiglie.titoli},${verticale ? 100 : 84},${coloreAss(c.testo)},${coloreAss(c.testo)},${coloreAss(c.fondo, 0.2)},${coloreAss(c.fondo, 0.2)},0,0,0,0,100,100,0,0,3,24,0,5,80,80,0,1`,
      `Style: Chiusura,${famiglie.titoli},${verticale ? 80 : 68},${coloreAss(c.fondo)},${coloreAss(c.fondo)},${coloreAss(c.accento)},${coloreAss(c.accento)},0,0,0,0,100,100,0,0,3,22,0,5,80,80,0,1`,
    );
  }
  const righe = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', 'YCbCr Matrix: TV.709', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...stili,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const ev = (inizio, fine, stileNome, t, livello = 0) => {
    if (fine - inizio < 0.04) return;
    righe.push(`Dialogue: ${livello},${assTempo(inizio)},${assTempo(fine)},${stileNome},,0,0,0,,${t}`);
  };
  const maiuscolo = (s) => (st.maiuscolo ? s.toLocaleUpperCase('it-IT') : s);
  const accento = coloreAss(c.accento);
  const gruppi = gruppiDiParole(tl.parole || [], st);
  gruppi.forEach((g, gi) => {
    const prossimo = gruppi[gi + 1];
    const precedente = gruppi[gi - 1];
    const lunghezza = g.parole.map((p) => p.testo).join(' ').length;
    const scala = lunghezza > st.caratteri_max ? Math.max(55, Math.round((100 * st.caratteri_max) / lunghezza)) : 100;
    if (frase) {
      // la frase resta tutta insieme dalla prima all'ultima parola; entra e esce piano solo se prima o dopo c'è una pausa
      // (fra due frasi attaccate il cambio è netto: una dissolvenza lì farebbe lampeggiare il testo)
      const inizio = g.parole[0].da;
      let fine = Math.min(g.parole[g.parole.length - 1].a + 0.25, tl.durata);
      if (prossimo) fine = Math.min(fine, prossimo.parole[0].da);
      const entra = !precedente || inizio - precedente.parole[precedente.parole.length - 1].a > 0.3 ? 140 : 0;
      const esce = !prossimo || prossimo.parole[0].da - fine > 0.05 ? 160 : 0;
      ev(inizio, fine, 'Sotto', `{\\blur3\\fad(${entra},${esce})\\fscx${scala}\\fscy${scala}}${assTesto(maiuscolo(g.parole.map((p) => p.testo).join(' ')))}`);
      return;
    }
    // modo «parola»: un evento per parola, con la parola detta evidenziata
    g.parole.forEach((p, i) => {
      const inizio = p.da;
      let fine = i + 1 < g.parole.length ? g.parole[i + 1].da : p.a + 0.25;
      if (i + 1 === g.parole.length && prossimo) fine = Math.min(fine, prossimo.parole[0].da);
      fine = Math.min(fine, tl.durata);
      const pezzi = g.parole.map((x, k) => (k === i ? `{\\c${accento}\\fscx${Math.round(scala * 1.08)}\\fscy${Math.round(scala * 1.08)}}${assTesto(maiuscolo(x.testo))}{\\fscx${scala}\\fscy${scala}\\c${coloreAss(c.testo)}}` : assTesto(maiuscolo(x.testo))));
      ev(inizio, fine, 'Sotto', `{\\fscx${scala}\\fscy${scala}}${pezzi.join(' ')}`);
    });
  });
  // cartello col nome, in alto a sinistra in ogni formato: in basso ci sono i sottotitoli
  const x0 = verticale ? 72 : 96;
  const y0 = verticale ? fmt.alto + 70 : 60;
  for (const k of tl.cartelli || []) {
    if (linea) {
      const altezzaNome = verticale ? 70 : 60;
      const altezza = k.sotto ? altezzaNome + (verticale ? 50 : 42) : altezzaNome;
      ev(k.da, k.a, 'Filo', `{\\an7\\pos(${x0},${y0 + 6})\\fad(240,240)\\p1}m 0 0 l 5 0 l 5 ${altezza} l 0 ${altezza}{\\p0}`, 2);
      ev(k.da + 0.08, k.a, 'Nome', `{\\an7\\pos(${x0 + 26},${y0})\\blur2\\fad(240,240)}${assTesto(maiuscolo(k.testo))}`, 2);
      if (k.sotto) ev(k.da + 0.2, k.a, 'Ruolo', `{\\an7\\pos(${x0 + 26},${y0 + altezzaNome})\\blur2\\fad(240,240)}${assTesto(maiuscolo(k.sotto))}`, 2);
      continue;
    }
    ev(k.da, k.a, 'Nome', `{\\an7\\pos(${x0},${y0})\\fad(160,160)}${assTesto(maiuscolo(k.testo))}`, 2);
    if (k.sotto) ev(k.da + 0.12, k.a, 'Ruolo', `{\\an7\\pos(${x0},${y0 + (verticale ? 98 : 84)})\\fad(160,160)}${assTesto(maiuscolo(k.sotto))}`, 2);
  }
  // scritte: titolo in alto, scritte al centro, chiusura più in basso (mai una sopra l'altra); \q0 = vanno a capo da sole
  const altezza = { titolo: 0.3, scritta: 0.44, chiusura: 0.6 };
  const fade = ombra ? '\\fad(320,320)' : '\\fad(200,200)';
  for (const s of tl.scritte || []) {
    const y = Math.round(H * (altezza[s.tipo] ?? 0.44));
    const chiusura = s.tipo === 'chiusura';
    ev(s.da, s.a, chiusura ? 'Chiusura' : 'Scritta', `{\\an5\\q0\\pos(${Math.round(W / 2)},${y})${ombra ? '\\blur2' : ''}${fade}}${assTesto(maiuscolo(s.testo))}`, 1);
    // in modo «ombra» la chiusura ha sotto un filo corto del colore d'accento (l'unico accento del video)
    if (chiusura && ombra && linea) ev(s.da + 0.2, s.a, 'Filo', `{\\an8\\pos(${Math.round(W / 2)},${y + Math.round((verticale ? 70 : 58) * 1.1)})\\fad(320,320)\\p1}m 0 0 l 120 0 l 120 5 l 0 5{\\p0}`, 1);
  }
  return `${righe.join('\n')}\n`;
}

// Il peso giusto di un font caricato: quello chiesto dallo stile, poi il più vicino fra quelli che ci sono.
export function pesoDi(font, voluto) {
  if (font.pesi[voluto]) return font.pesi[voluto];
  const pesi = Object.keys(font.pesi).map(Number).sort((a, b) => Math.abs(a - voluto) - Math.abs(b - voluto) || b - a);
  return font.pesi[pesi[0]];
}

// I nomi con cui libass trova i due font copiati in fontsdir (ogni peso diverso da regolare/grassetto ha un nome suo:
// «Poppins SemiBold», «Bricolage Grotesque ExtraBold»).
export function famiglieAss(fontTitoli, fontTesto, pesoTitoli = 800, pesoTesto = 700) {
  const t = pesoDi(fontTitoli, pesoTitoli);
  const x = pesoDi(fontTesto, pesoTesto);
  return { titoli: nomeFamigliaLibass(t.dati) || fontTitoli.famiglia, testo: nomeFamigliaLibass(x.dati) || fontTesto.famiglia };
}

// Il colore dello stile, uguale per ogni inquadratura: la curva (nero morbido) e poi contrasto e saturazione.
export function filtroColore(stile) {
  const f = [];
  if (stile.curva) f.push(`curves=master='${stile.curva}'`);
  if (stile.contrasto !== 1 || stile.saturazione !== 1) f.push(`eq=contrast=${stile.contrasto}:saturation=${stile.saturazione}`);
  if (stile.grana > 0) f.push(`noise=c0s=${stile.grana}:allf=t`);
  return f.length ? f.join(',') : 'null';
}

const HDR = ['smpte2084', 'arib-std-b67'];
const PRE_HDR = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,';
const FINE = 'setsar=1,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p';

// Filtro di un'inquadratura video: riempi (ritaglio, con la posizione del soggetto) o sfondo sfocato della stessa clip.
export function grafoInquadratura(info, fmt, { modo = 'auto', posizione = 'centro', fps = FPS_BASE, lut = null } = {}) {
  const FPS = fps;
  const { w: W, h: H } = fmt;
  // girato in log: prima la LUT della camera (i colori «veri»), poi tutto il resto
  const pre = (HDR.includes(info.trasferimento) ? PRE_HDR : '') + filtroLut(lut);
  const r = info.larghezza / info.altezza;
  const t = W / H;
  const tenuto = r > t ? t / r : r / t;
  const riempi = modo === 'riempi' || (modo === 'auto' && tenuto >= 0.8);
  if (modo === 'intera' || !riempi) {
    return `[0:v]${pre}fps=${FPS},split=2[a][b];[a]scale=${Math.round(W / 4)}:${Math.round(H / 4)}:force_original_aspect_ratio=increase,crop=${Math.round(W / 4)}:${Math.round(H / 4)},boxblur=10:2,scale=${W}:${H},eq=brightness=-0.06[sf];[b]scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos[pp];[sf][pp]overlay=(W-w)/2:(H-h)/2,${FINE}[v]`;
  }
  const centro = { sinistra: 'iw/3', destra: '2*iw/3', centro: 'iw/2' }[posizione] || 'iw/2';
  const x = `max(0\\,min(iw-ow\\,${centro}-ow/2))`;
  return `[0:v]${pre}fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}:${x}:(ih-oh)/2,${FINE}[v]`;
}

// Fotogrammi di un file (si contano i pacchetti del flusso video: veloce, senza decodificare).
export async function contaFotogrammi(file, cfg, segnale) {
  const { stdout } = await esegui(cfg.ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file], { segnale, timeoutMs: 120_000 });
  return Number.parseInt(stdout.toString().trim(), 10);
}

const CODIFICA_PEZZO = (t, fps) => ['-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(fps), '-g', String(fps * 2), '-threads', t, '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];

async function pezzoVideo(q, sorgente, info, fmt, stile, fotogrammi, uscita, dirTmp, cfg, segnale, lut = null) {
  const t = String(cfg.threadFfmpeg);
  const FPS = stile.fps || FPS_BASE;
  if (q.tipo === 'foto') {
    // la foto girata secondo l'EXIF e un po' più grande del quadro: poi uno zoom lento (le foto non restano ferme)
    const W2 = Math.round(fmt.w * 1.2 / 2) * 2;
    const H2 = Math.round(fmt.h * 1.2 / 2) * 2;
    const jpg = path.join(dirTmp, `${path.basename(uscita)}.jpg`);
    await apri(sorgente).flatten({ background: '#000000' }).resize(W2, H2, { fit: 'cover', position: 'attention' }).jpeg({ quality: 92 }).toFile(jpg);
    const zoom = `zoompan=z='1+${stile.zoom_foto ?? 0.12}*on/${Math.max(1, fotogrammi)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${fmt.w}x${fmt.h}:fps=${FPS}`;
    await esegui(cfg.ffmpeg, [...BASE, '-v', 'error', '-threads', t, '-loop', '1', '-framerate', String(FPS), '-i', jpg, '-filter_complex', `[0:v]${zoom},${FINE}[v]`, '-map', '[v]', '-frames:v', String(fotogrammi), ...CODIFICA_PEZZO(t, FPS), uscita], { segnale, timeoutMs: cfg.timeoutProcessoMs });
    return;
  }
  const modo = q.tipo === 'volto' ? (q.posizione === 'intera' ? 'intera' : stile.volto) : (q.posizione === 'intera' ? 'intera' : stile.coperture);
  const grafo = grafoInquadratura(info, fmt, { modo, posizione: q.posizione || 'centro', fps: FPS, lut }).replace('[v]', '[g]');
  // tpad: se la clip finisce prima (la regia non lo permette, ma un file può dichiarare una durata sbagliata), l'ultimo
  // fotogramma resta fino a riempire il pezzo: mai un pezzo più corto, quindi mai le immagini dopo che scivolano
  await esegui(cfg.ffmpeg, [...BASE, '-v', 'error', '-threads', t, '-ss', f3(q.inizio), '-t', f3(fotogrammi / FPS + 0.5), '-i', sorgente,
    '-filter_threads', t, '-filter_complex', `${grafo};[g]tpad=stop_mode=clone:stop_duration=${f3(fotogrammi / FPS + 1)}[v]`, '-map', '[v]', '-frames:v', String(fotogrammi), ...CODIFICA_PEZZO(t, FPS), uscita], { segnale, timeoutMs: cfg.timeoutProcessoMs });
}

// Voce continua: i pezzi audio della timeline in fila (sample per sample), con dissolvenze brevissime ai tagli.
async function voceContinua(tl, sorgenti, uscita, cfg, segnale) {
  const ingressi = [];
  const indice = new Map();
  for (const a of tl.audio) {
    if (a.fonte && !indice.has(a.fonte)) {
      indice.set(a.fonte, ingressi.length / 2);
      ingressi.push('-i', sorgenti.get(a.fonte));
    }
  }
  const parti = [];
  const etichette = [];
  tl.audio.forEach((a, k) => {
    const d = a.fine - a.inizio;
    const fmtA = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
    if (a.fonte) {
      const fadeOut = Math.max(0, d - 0.025);
      parti.push(`[${indice.get(a.fonte)}:a]atrim=start=${f3(a.inizio)}:end=${f3(a.fine)},asetpts=PTS-STARTPTS,${fmtA},afade=t=in:st=0:d=0.015,afade=t=out:st=${f3(fadeOut)}:d=0.025[p${k}]`);
    } else {
      parti.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${f3(d)},${fmtA}[p${k}]`);
    }
    etichette.push(`[p${k}]`);
  });
  const grafo = `${parti.join(';')};${etichette.join('')}concat=n=${etichette.length}:v=0:a=1[voce]`;
  await esegui(cfg.ffmpeg, [...BASE, '-v', 'error', ...ingressi, '-filter_complex', grafo, '-map', '[voce]', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', uscita], { segnale, timeoutMs: cfg.timeoutProcessoMs });
}

// Audio finale: la voce, più la musica che si abbassa da sola quando qualcuno parla (sidechain).
function catenaAudio(iVoce, iMusica, durata, volume) {
  let c = `[${iVoce}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asplit=2[vm][vk]`;
  if (iMusica === null) return `${c};[vk]anullsink;[vm]anull[mix]`;
  c += `;[${iMusica}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=0:${f3(durata)},volume=${volume},afade=t=in:st=0:d=0.6,afade=t=out:st=${f3(Math.max(0, durata - 1.5))}:d=1.5[mus]`;
  c += ';[mus][vk]sidechaincompress=threshold=0.015:ratio=10:attack=15:release=450:makeup=1[musd]';
  return `${c};[vm][musd]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]`;
}

// Neri e immagini ferme nel file finito (i «bolli» che si vedono solo guardando).
export function leggiDifetti(stderr) {
  const neri = [...stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)/g)].map((m) => ({ da: Number(m[1]), a: Number(m[2]) }));
  const inizi = [...stderr.matchAll(/freeze_start:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const fini = [...stderr.matchAll(/freeze_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const fermi = inizi.map((da, i) => ({ da, a: fini[i] ?? null }));
  return { neri, fermi };
}

export async function montaRegia({ tl, progetto, dirProgetto, stile, logo, musicaFile, lavoro, url, cfg, segnale, lut = new Map() }) {
  const avvisi = [];
  const fmt = FORMATI[tl.formato] || FORMATI.verticale;
  const { dirTmp, dirOut } = lavoro;
  const t = String(cfg.threadFfmpeg);
  const FPS = stile.fps || FPS_BASE;
  if (!(tl.durata >= 1) || !tl.video.length) throw errore(422, 'video_troppo_corto', 'La timeline dura meno di un secondo: niente da montare.');
  const materiali = new Map(progetto.materiali.map((m) => [m.codice, m]));
  const sorgenti = new Map();
  for (const codice of new Set([...tl.video.map((q) => q.fonte), ...tl.audio.map((a) => a.fonte).filter(Boolean), ...(tl.musica?.usa && tl.musica.fonte && materiali.has(tl.musica.fonte) ? [tl.musica.fonte] : [])])) {
    const m = materiali.get(codice);
    if (!m) throw errore(422, 'timeline_non_valida', `La timeline cita ${codice}, che non è nel progetto.`);
    sorgenti.set(codice, path.join(dirProgetto, m.file));
  }
  const info = new Map();
  for (const q of tl.video) {
    if (q.tipo !== 'foto' && !info.has(q.fonte)) info.set(q.fonte, await sonda(sorgenti.get(q.fonte), q.fonte, cfg, segnale));
  }

  // 1-2) inquadrature → pezzi, poi in fila. I confini si arrotondano al fotogramma sulla timeline assoluta: niente deriva.
  const lista = [];
  let fotogrammiFatti = 0;
  for (const [k, q] of tl.video.entries()) {
    // un'inquadratura che arrotondata al fotogramma vale 0 non occupa nessun fotogramma: si salta (non si gonfia a 1,
    // che sposterebbe tutto il resto di un fotogramma)
    // i fotogrammi si contano in fila: ogni inquadratura comincia dove finisce la precedente, quindi un millesimo di
    // buco o di arrotondamento fra due inquadrature non può far sparire (o raddoppiare) un fotogramma
    const fineFotogramma = k === tl.video.length - 1 ? Math.round(tl.durata * FPS) : Math.round(q.a * FPS);
    const fotogrammi = fineFotogramma - fotogrammiFatti;
    if (fotogrammi <= 0) continue;
    fotogrammiFatti = fineFotogramma;
    const nome = `inq-${String(k).padStart(3, '0')}.mkv`;
    await pezzoVideo(q, sorgenti.get(q.fonte), info.get(q.fonte), fmt, stile, fotogrammi, path.join(dirTmp, nome), dirTmp, cfg, segnale, lut.get(q.fonte) || null);
    if (info.get(q.fonte) && HDR.includes(info.get(q.fonte).trasferimento) && !avvisi.some((a) => a.codice === 'hdr_convertito')) {
      avvisi.push({ codice: 'hdr_convertito', messaggio: `Il video ${q.fonte} è in HDR: l'ho convertito nei colori normali (SDR).` });
    }
    lista.push(nome);
  }
  await fs.writeFile(path.join(dirTmp, 'lista.txt'), lista.map((n) => `file '${n}'`).join('\n'));
  await esegui(cfg.ffmpeg, [...BASE, '-v', 'error', '-f', 'concat', '-safe', '0', '-i', 'lista.txt', '-c', 'copy', 'video.mkv'], { segnale, timeoutMs: cfg.timeoutProcessoMs, cwd: dirTmp });
  // il sincrono si controlla, non si spera: le immagini devono avere esattamente i fotogrammi della timeline
  const attesi = Math.round(tl.durata * FPS);
  const contati = await contaFotogrammi(path.join(dirTmp, 'video.mkv'), cfg, segnale);
  if (contati !== attesi) throw errore(500, 'timeline_desincronizzata', `Le immagini montate hanno ${contati} fotogrammi invece di ${attesi}: voci e volti andrebbero fuori sincrono, quindi non consegno il video.`);

  // 3) voce continua
  await voceContinua(tl, sorgenti, path.join(dirTmp, 'voce.wav'), cfg, segnale);

  // 4) testi (ASS) con i font dello stile, inclusi nell'officina
  const pesoT = stile.peso_titoli || 800;
  const pesoX = stile.peso_testo || 700;
  const fontTitoli = await caricaFont(stile.font_titoli, cfg, pesoT);
  const fontTesto = await caricaFont(stile.font_testo, cfg, pesoX);
  if (fontTitoli.avviso) avvisi.push(fontTitoli.avviso);
  if (fontTesto.avviso && fontTesto.avviso.messaggio !== fontTitoli.avviso?.messaggio) avvisi.push(fontTesto.avviso);
  const dirFont = path.join(dirTmp, 'font');
  await fs.mkdir(dirFont, { recursive: true });
  await fs.copyFile(pesoDi(fontTitoli, pesoT).file, path.join(dirFont, 'titoli.ttf'));
  await fs.copyFile(pesoDi(fontTesto, pesoX).file, path.join(dirFont, 'testo.ttf'));
  const famiglie = famiglieAss(fontTitoli, fontTesto, pesoT, pesoX);
  await fs.writeFile(path.join(dirTmp, 'regia.ass'), creaAssRegia(tl, stile, fmt, famiglie));

  // 5) ultimo passaggio: colore dello stile, testi, logo; voce + musica, -14 LUFS
  const ingressi = ['-i', 'video.mkv', '-i', 'voce.wav'];
  let iMusica = null;
  let musica = musicaFile;
  if (tl.musica?.usa && !musica && tl.musica.fonte && sorgenti.has(tl.musica.fonte)) musica = sorgenti.get(tl.musica.fonte);
  if (tl.musica?.usa && !musica) avvisi.push({ codice: 'musica_mancante', messaggio: 'La regia voleva la musica, ma non è arrivato nessun file musicale: il video esce solo con le voci.' });
  if (tl.musica?.usa && musica) {
    iMusica = 2;
    ingressi.push('-stream_loop', '-1', '-i', musica);
  }
  // i testi vanno DOPO il colore: l'avorio e l'oro dei testi restano esatti, la curva tocca solo le immagini
  let grafoV = `[0:v]${filtroColore(stile)},ass=regia.ass:fontsdir=font[v0]`;
  let ultimo = 'v0';
  if (logo) {
    const l = await preparaLogo(logo.percorso, Math.round(fmt.w * 0.16), 120);
    await fs.writeFile(path.join(dirTmp, 'logo.png'), l.buf);
    const iLogo = ingressi.filter((x) => x === '-i').length;
    ingressi.push('-i', 'logo.png');
    grafoV += `;[${ultimo}][${iLogo}:v]overlay=${fmt.w - 64 - l.w}:${fmt.alto + 20}:format=auto[v1]`;
    ultimo = 'v1';
  }
  grafoV += `;[${ultimo}]format=yuv420p[v]`;
  const ingressiMisura = ['-i', 'voce.wav', ...(iMusica !== null ? ['-stream_loop', '-1', '-i', musica] : [])];
  const misura = await misuraVolume(ingressiMisura, catenaAudio(0, iMusica !== null ? 1 : null, tl.durata, tl.musica?.volume ?? 0.3), cfg, segnale, dirTmp);
  if (!misura) avvisi.push(AVVISO_MUTO);
  const grafoA = `${catenaAudio(1, iMusica, tl.durata, tl.musica?.volume ?? 0.3)};[mix]${filtroLoudnorm(misura)}[a]`;
  const finale = path.join(dirOut, 'video.mp4');
  await esegui(cfg.ffmpeg, [...BASE, '-v', 'error', '-threads', t, ...ingressi, '-filter_threads', t, '-filter_complex_threads', t,
    '-filter_complex', `${grafoV};${grafoA}`, '-map', '[v]', '-map', '[a]', ...CODIFICA_FINALE(t, FPS), '-t', f3(tl.durata), finale], { segnale, timeoutMs: cfg.timeoutProcessoMs, cwd: dirTmp });

  // 6) copertina, provino dei fotogrammi, controllo dei difetti
  const durata = await durataFile(finale, cfg, segnale);
  const copertina = await creaCopertina(path.join(dirTmp, 'video.mkv'), Math.min(tl.durata, durata), [], dirTmp, dirOut, cfg, segnale, { w: fmt.w, h: fmt.h });
  const fotogrammi = await creaFotogrammi(finale, durata, dirTmp, dirOut, cfg, segnale);
  // neri e immagini ferme si cercano sulle immagini montate PRIMA della grana e dei testi: la grana cambia ogni fotogramma
  // e un'immagine ferma con la grana sopra non risulterebbe mai ferma
  const { stderr } = await esegui(cfg.ffmpeg, ['-hide_banner', '-nostdin', '-nostats', '-v', 'info', '-i', path.join(dirTmp, 'video.mkv'), '-vf', 'blackdetect=d=0.12:pix_th=0.10,freezedetect=n=0.003:d=2.5', '-an', '-f', 'null', '-'], { segnale, timeoutMs: cfg.timeoutProcessoMs });
  const difetti = leggiDifetti(stderr);
  for (const n of difetti.neri) avvisi.push({ codice: 'nero', messaggio: `Da ${n.da.toFixed(1).replace('.', ',')} a ${n.a.toFixed(1).replace('.', ',')} s il video è nero.` });
  for (const f of difetti.fermi) avvisi.push({ codice: 'immagine_ferma', messaggio: `Da ${f.da.toFixed(1).replace('.', ',')} s l'immagine resta ferma per più di 2,5 s.` });
  const { size } = await fs.stat(finale);
  return {
    file: [
      { tipo: 'video', url: url('video.mp4'), durata, byte: size },
      { tipo: 'copertina', url: url(copertina) },
      { tipo: 'fotogrammi', url: url(fotogrammi) },
    ],
    controllo: difetti,
    avvisi,
  };
}

