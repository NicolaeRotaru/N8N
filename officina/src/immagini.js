// Foto: misure (nitidezza, luce, doppioni), provino numerato, preparazione nei formati, confronto.
// Regola ferrea: solo ritaglio vero, correzioni GLOBALI di luce/colore, logo sopra. Mai estendere l'immagine.
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { errore, nonValido } from './errori.js';

sharp.concurrency(2);
sharp.cache(false);

export const MAX_JPEG_META = 8 * 1024 * 1024; // limite Meta per le foto IG
export const MAX_ANTEPRIMA = Math.floor(3.5 * 1024 * 1024); // provini/anteprime per Claude e Telegram
export const LATO_ANTEPRIMA = 1568;

// Formati supportati: rapporto larghezza/altezza e misura d'uscita standard per Meta.
export const FORMATI = {
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
  '3:4': { w: 1080, h: 1440 },
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
  '1.91:1': { w: 1200, h: 628 },
};

export function apri(input) {
  return sharp(input, { failOn: 'error', limitInputPixels: 120_000_000 }).rotate();
}

// Metadati con larghezza/altezza già girate secondo l'EXIF. Errore 415 se non è un'immagine leggibile.
export async function infoImmagine(file, nome = 'immagine') {
  let meta;
  try {
    meta = await sharp(file, { failOn: 'error', limitInputPixels: 120_000_000 }).metadata();
  } catch {
    throw errore(415, 'formato_file_non_supportato', `Il file «${nome}» non è un'immagine leggibile (vanno bene JPEG, PNG, WebP, TIFF, AVIF).`);
  }
  if (!meta.width || !meta.height) throw errore(415, 'formato_file_non_supportato', `Il file «${nome}» non è un'immagine leggibile.`);
  const girata = (meta.orientation || 1) >= 5;
  return { ...meta, larghezza: girata ? meta.height : meta.width, altezza: girata ? meta.width : meta.height };
}

export function orientamento(w, h) {
  if (w > h * 1.02) return 'orizzontale';
  if (h > w * 1.02) return 'verticale';
  return 'quadrata';
}

async function grigio(file, lato) {
  const { data, info } = await apri(file)
    .flatten({ background: '#ffffff' })
    .resize(lato, lato, { fit: 'inside', withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, c: info.channels };
}

// Varianza del Laplaciano (più alta = più nitida), su una copia con lato lungo 1024 px per confrontare foto diverse.
export function varianzaLaplaciano(data, w, h, c = 1) {
  let somma = 0;
  let somma2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * c;
      const v = data[i - w * c] + data[i + w * c] + data[i - c] + data[i + c] - 4 * data[i];
      somma += v;
      somma2 += v * v;
      n++;
    }
  }
  if (!n) return 0;
  const media = somma / n;
  return somma2 / n - media * media;
}

const COSENI = (() => {
  const t = [];
  for (let u = 0; u < 8; u++) {
    t.push([]);
    for (let x = 0; x < 32; x++) t[u].push(Math.cos(((2 * x + 1) * u * Math.PI) / 64));
  }
  return t;
})();

// Hash percettivo (pHash, DCT 32x32 -> 8x8): 64 bit.
export async function hashPercettivo(file) {
  const { data, info } = await apri(file)
    .flatten({ background: '#ffffff' })
    .resize(32, 32, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const c = info.channels;
  const valori = [];
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) s += data[(y * 32 + x) * c] * COSENI[u][y] * COSENI[v][x];
      }
      valori.push(s);
    }
  }
  const senzaDc = valori.slice(1);
  const ordinati = [...senzaDc].sort((a, b) => a - b);
  const mediana = (ordinati[31] + ordinati[32]) / 2;
  return valori.map((v) => (v > mediana ? 1 : 0));
}

export function distanzaHamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

export const SOGLIA_DOPPIONE = 10;

export async function misuraFoto(file, nome) {
  const info = await infoImmagine(file, nome);
  const g = await grigio(file, 1024);
  let somma = 0;
  for (let i = 0; i < g.data.length; i += g.c) somma += g.data[i];
  return {
    larghezza: info.larghezza,
    altezza: info.altezza,
    nitidezza: Math.round(varianzaLaplaciano(g.data, g.w, g.h, g.c) * 10) / 10,
    luminosita: Math.round((somma / (g.data.length / g.c)) * 10) / 10,
    hash: await hashPercettivo(file),
    orientamento: orientamento(info.larghezza, info.altezza),
  };
}

// Codifica JPEG sRGB senza metadati sotto un limite di byte, scendendo di qualità se serve.
export async function jpegEntro(input, limiteByte, { qualita = 90, minima = 50, rawInfo } = {}) {
  for (let q = qualita; q >= minima; q -= 8) {
    const base = rawInfo ? sharp(input, { raw: rawInfo }) : sharp(input);
    const buf = await base.toColourspace('srgb').jpeg({ quality: q, chromaSubsampling: '4:2:0' }).toBuffer();
    if (buf.length <= limiteByte) return { buf, qualita: q };
  }
  throw errore(500, 'jpeg_troppo_grande', `Non riesco a stare sotto ${(limiteByte / 1048576).toFixed(1)} MB nemmeno abbassando la qualità.`);
}

const FONT_ETICHETTE = (dir) => ({
  fontFiles: [path.join(dir, 'Inter-700.ttf'), path.join(dir, 'Inter-400.ttf')],
  loadSystemFonts: false,
  defaultFontFamily: 'Inter',
});

export function svgInPng(svg, dirFont) {
  return Buffer.from(new Resvg(svg, { font: FONT_ETICHETTE(dirFont) }).render().asPng());
}

const xml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

// ---------------------------------------------------------------- PROVINO
export async function creaProvino(foto, dirOut, cfg) {
  const misure = [];
  for (const f of foto) misure.push(await misuraFoto(f.percorso, f.nome));
  const n = foto.length;
  const colonne = n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const righe = Math.ceil(n / colonne);
  const spazio = 12;
  const lati = Math.max(colonne, righe);
  const cella = Math.floor((LATO_ANTEPRIMA - spazio * (lati + 1)) / lati);
  const W = colonne * cella + spazio * (colonne + 1);
  const H = righe * cella + spazio * (righe + 1);
  const composizioni = [];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  const raggio = Math.max(30, Math.round(cella * 0.11));
  for (let i = 0; i < n; i++) {
    const x0 = spazio + (i % colonne) * (cella + spazio);
    const y0 = spazio + Math.floor(i / colonne) * (cella + spazio);
    const { data, info } = await apri(foto[i].percorso)
      .resize(cella, cella, { fit: 'inside' })
      .toColourspace('srgb')
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const png = await sharp(data, { raw: info }).png({ compressionLevel: 1 }).toBuffer();
    composizioni.push({ input: png, left: x0 + Math.floor((cella - info.width) / 2), top: y0 + Math.floor((cella - info.height) / 2) });
    const cx = x0 + raggio + 10;
    const cy = y0 + raggio + 10;
    svg += `<circle cx="${cx}" cy="${cy}" r="${raggio}" fill="#000000" fill-opacity="0.78" stroke="#ffffff" stroke-width="4"/>`;
    svg += `<text x="${cx}" y="${cy + raggio * 0.36}" font-family="Inter" font-weight="700" font-size="${Math.round(raggio * 1.05)}" fill="#ffffff" text-anchor="middle">${i + 1}</text>`;
  }
  svg += '</svg>';
  composizioni.push({ input: svgInPng(svg, cfg.fontRiservaDir), left: 0, top: 0 });
  const tela = await sharp({ create: { width: W, height: H, channels: 3, background: '#1c1c1c' } })
    .composite(composizioni)
    .png({ compressionLevel: 1 })
    .toBuffer();
  const { buf } = await jpegEntro(tela, MAX_ANTEPRIMA, { qualita: 85 });
  await fs.writeFile(path.join(dirOut, 'provino.jpg'), buf);

  const elenco = misure.map((m, i) => {
    let doppione = null;
    for (let j = 0; j < i; j++) {
      if (distanzaHamming(m.hash, misure[j].hash) <= SOGLIA_DOPPIONE) {
        doppione = j + 1;
        break;
      }
    }
    return {
      numero: i + 1,
      nome_file: foto[i].nome,
      larghezza: m.larghezza,
      altezza: m.altezza,
      nitidezza: m.nitidezza,
      luminosita: m.luminosita,
      doppione_di: doppione,
      orientamento: m.orientamento,
    };
  });
  return { provino: { nome: 'provino.jpg', larghezza: W, altezza: H }, foto: elenco };
}

// ---------------------------------------------------------------- STILE (correzioni globali)
function limita(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function normalizzaStile(stile, avvisi) {
  const s = stile && typeof stile === 'object' ? stile : {};
  const leggi = (chiave, neutro, min, max, valore = s[chiave]) => {
    const v = valore;
    if (v === undefined || v === null || v === '') return neutro;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      avvisi.push({ codice: 'stile_non_valido', messaggio: `Il valore di «${chiave}» nello stile non è un numero: l'ho ignorato.` });
      return neutro;
    }
    const l = limita(n, min, max);
    if (l !== n) avvisi.push({ codice: 'stile_limitato', messaggio: `«${chiave}» era ${n}: l'ho portato a ${l} per non stravolgere la foto.` });
    return l;
  };
  let calore = s.calore;
  // accetta anche la scala -100..100
  if (calore !== null && calore !== '' && Number.isFinite(Number(calore)) && Math.abs(Number(calore)) > 1) calore = Number(calore) / 100;
  return {
    luminosita: leggi('luminosita', 1, 0.5, 1.5),
    contrasto: leggi('contrasto', 1, 0.5, 1.5),
    saturazione: leggi('saturazione', 1, 0, 2),
    calore: leggi('calore', 0, -1, 1, calore),
  };
}

export function applicaStile(img, st) {
  let p = img;
  if (st.luminosita !== 1 || st.saturazione !== 1) p = p.modulate({ brightness: st.luminosita, saturation: st.saturazione });
  if (st.contrasto !== 1 || st.calore !== 0) {
    const c = st.contrasto;
    const b = 128 * (1 - c);
    const rosso = 1 + 0.08 * st.calore;
    const blu = 1 - 0.08 * st.calore;
    p = p.linear([c * rosso, c, c * blu], [b * rosso, b, b * blu]);
  }
  return p;
}

// ---------------------------------------------------------------- POSIZIONE LOGO
export const POSIZIONI_LOGO = ['alto-sinistra', 'alto-centro', 'alto-destra', 'basso-sinistra', 'basso-centro', 'basso-destra'];

export async function preparaLogo(file, larghezza, altezzaMax) {
  const logo = await apri(file)
    .resize(Math.max(8, Math.round(larghezza)), Math.max(8, Math.round(altezzaMax)), { fit: 'inside' })
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });
  return { buf: logo.data, w: logo.info.width, h: logo.info.height };
}

// Margini: per il 9:16 si rispettano le aree sicure delle storie (250 px in alto, 340 in basso su 1920).
export function puntoLogo(posizione, W, H, lw, lh) {
  const m = Math.round(W * 0.045);
  const verticale = H / W > 1.7;
  const alto = verticale ? Math.round((250 / 1920) * H) + m : m;
  const basso = verticale ? Math.round((340 / 1920) * H) + m : m;
  const [riga, colonna] = posizione.split('-');
  const left = colonna === 'sinistra' ? m : colonna === 'centro' ? Math.round((W - lw) / 2) : W - lw - m;
  const top = riga === 'alto' ? alto : H - lh - basso;
  return { left, top };
}

// ---------------------------------------------------------------- PREPARA
export async function preparaFoto({ foto, logo, dati, dirOut, url }) {
  const avvisi = [];
  const formati = Array.isArray(dati.formati) && dati.formati.length ? dati.formati : ['4:5'];
  for (const f of formati) {
    if (!FORMATI[f]) throw nonValido('formato_non_valido', `Il formato «${f}» non esiste. Formati possibili: ${Object.keys(FORMATI).join(', ')}.`);
  }
  if (new Set(formati).size !== formati.length) throw nonValido('formato_non_valido', 'Lo stesso formato è chiesto due volte.');
  const info = await infoImmagine(foto.percorso, foto.nome);
  const stile = normalizzaStile(dati.stile, avvisi);
  const optLogo = dati.logo && typeof dati.logo === 'object' ? dati.logo : {};
  const posizione = POSIZIONI_LOGO.includes(optLogo.posizione) ? optLogo.posizione : 'basso-destra';
  if (optLogo.posizione && !POSIZIONI_LOGO.includes(optLogo.posizione)) {
    avvisi.push({ codice: 'posizione_logo_non_valida', messaggio: `La posizione del logo «${optLogo.posizione}» non esiste: l'ho messo in basso a destra.` });
  }
  const percento = limita(Number(optLogo.larghezza_percento) || 15, 5, 40);

  const file = [];
  for (const formato of formati) {
    const obiettivo = FORMATI[formato];
    const rapporto = obiettivo.w / obiettivo.h;
    // Il ritaglio più grande del rapporto giusto che sta DENTRO la foto (mai estendere).
    let cw = info.larghezza;
    let ch = Math.round(cw / rapporto);
    if (ch > info.altezza) {
      ch = info.altezza;
      cw = Math.round(ch * rapporto);
    }
    const scala = Math.min(1, obiettivo.w / cw);
    const W = Math.max(1, Math.round(cw * scala));
    const H = Math.max(1, Math.round(W / rapporto));
    const tenuto = (cw * ch) / (info.larghezza * info.altezza);
    if (tenuto < 0.6) {
      avvisi.push({ codice: 'taglio_forte', messaggio: `Per il formato ${formato} la foto perde il ${Math.round((1 - tenuto) * 100)}% dell'immagine: controlla che il soggetto sia dentro.` });
    }
    if (W < obiettivo.w) {
      avvisi.push({ codice: 'risoluzione_bassa', messaggio: `La foto è piccola per il ${formato}: esce ${W}×${H} invece di ${obiettivo.w}×${obiettivo.h} (non la ingrandisco).` });
    }
    let img = apri(foto.percorso).resize(W, H, { fit: 'cover', position: sharp.strategy.attention });
    img = applicaStile(img, stile);
    let tela = await img.toColourspace('srgb').removeAlpha().png({ compressionLevel: 1 }).toBuffer();
    if (logo) {
      const l = await preparaLogo(logo.percorso, (W * percento) / 100, H * 0.2);
      const { left, top } = puntoLogo(posizione, W, H, l.w, l.h);
      tela = await sharp(tela).composite([{ input: l.buf, left, top }]).png({ compressionLevel: 1 }).toBuffer();
    }
    const { buf } = await jpegEntro(tela, MAX_JPEG_META, { qualita: 92 });
    const nome = `foto-${formato.replace(':', 'x').replace('.', '_')}.jpg`;
    await fs.writeFile(path.join(dirOut, nome), buf);
    file.push({ formato, url: url(nome), larghezza: W, altezza: H, byte: buf.length, _buf: buf });
  }
  const mini = await sharp(file[0]._buf).resize(1080, 1080, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  await fs.writeFile(path.join(dirOut, 'miniatura.jpg'), mini);
  return {
    file: file.map(({ _buf, ...resto }) => resto),
    miniatura: { url: url('miniatura.jpg') },
    avvisi,
  };
}

// ---------------------------------------------------------------- CONFRONTO
// Due immagini affiancate (originale | risultato) con etichette, lato lungo ≤ 1568 px, ≤ 3,5 MB.
export async function creaConfronto(originale, risultato, dirOut, nome, cfg) {
  const a = await apri(originale).toColourspace('srgb').removeAlpha().png({ compressionLevel: 1 }).toBuffer({ resolveWithObject: true });
  const b = await apri(risultato).toColourspace('srgb').removeAlpha().png({ compressionLevel: 1 }).toBuffer({ resolveWithObject: true });
  const spazio = 16;
  const fascia = 56;
  const ra = a.info.width / a.info.height;
  const rb = b.info.width / b.info.height;
  // Altezza comune h: larghezza totale = h*ra + h*rb + 3*spazio ≤ 1568, altezza = h + fascia + 2*spazio ≤ 1568.
  let h = Math.floor((LATO_ANTEPRIMA - 3 * spazio) / (ra + rb));
  h = Math.min(h, LATO_ANTEPRIMA - fascia - 2 * spazio);
  const wa = Math.max(1, Math.round(h * ra));
  const wb = Math.max(1, Math.round(h * rb));
  const W = wa + wb + 3 * spazio;
  const H = h + fascia + 2 * spazio;
  const ia = await sharp(a.data).resize(wa, h, { fit: 'fill' }).png({ compressionLevel: 1 }).toBuffer();
  const ib = await sharp(b.data).resize(wb, h, { fit: 'fill' }).png({ compressionLevel: 1 }).toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <text x="${spazio + wa / 2}" y="${spazio + 38}" font-family="Inter" font-weight="700" font-size="34" fill="#ffffff" text-anchor="middle">${xml('Originale')}</text>
    <text x="${2 * spazio + wa + wb / 2}" y="${spazio + 38}" font-family="Inter" font-weight="700" font-size="34" fill="#ffffff" text-anchor="middle">${xml('Risultato')}</text>
  </svg>`;
  const tela = await sharp({ create: { width: W, height: H, channels: 3, background: '#111111' } })
    .composite([
      { input: ia, left: spazio, top: spazio + fascia },
      { input: ib, left: 2 * spazio + wa, top: spazio + fascia },
      { input: svgInPng(svg, cfg.fontRiservaDir), left: 0, top: 0 },
    ])
    .png({ compressionLevel: 1 })
    .toBuffer();
  const { buf } = await jpegEntro(tela, MAX_ANTEPRIMA, { qualita: 85 });
  await fs.writeFile(path.join(dirOut, nome), buf);
  return { nome, larghezza: W, altezza: H, byte: buf.length };
}
