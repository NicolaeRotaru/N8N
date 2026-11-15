// Grafiche per storie (1080×1920) e post (1080×1350): foto vera ritagliata + scritte, fasce e logo sopra.
// Le scritte arrivano SOLO dal campo 'righe' (testi del team): qui non si inventa e non si taglia nulla con «…».
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { errore, nonValido } from './errori.js';
import { fontDelMarchio, fontPerSatori, setDiFont } from './font.js';
import { apri, infoImmagine, jpegEntro, MAX_JPEG_META, preparaLogo, creaConfronto, normalizzaStile, applicaStile } from './immagini.js';

export const STORIA = { W: 1080, H: 1920, alto: 250, basso: 340 };
export const MARGINE_LATO = 72;
const RESPIRO = 40; // distanza extra dal bordo delle aree sicure

const COLORI_NEUTRI = { primario: '#1F1F1F', secondario: '#F2F2F2', testo: '#FFFFFF' };
const RE_COLORE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RE_EMOJI = /(?![©®™])\p{Extended_Pictographic}|[\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu;

export function coloriValidi(colori, avvisi) {
  const c = colori && typeof colori === 'object' ? colori : {};
  const out = {};
  for (const [chiave, neutro] of Object.entries(COLORI_NEUTRI)) {
    const v = c[chiave];
    if (v === undefined || v === null || v === '') out[chiave] = neutro;
    else if (typeof v === 'string' && RE_COLORE.test(v.trim())) out[chiave] = v.trim();
    else {
      out[chiave] = neutro;
      avvisi.push({ codice: 'colore_non_valido', messaggio: `Il colore «${chiave}» (${String(v).slice(0, 20)}) non è un codice come #1F3B2D: ho usato ${neutro}.` });
    }
  }
  return out;
}

export function rgba(hex, alfa) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = Number.parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

export function pulisciRighe(righe, avvisi) {
  if (righe === undefined || righe === null) return [];
  if (!Array.isArray(righe)) throw nonValido('righe_non_valide', '«righe» deve essere una lista, per esempio [{"testo":"…","ruolo":"titolo"}].');
  if (righe.length > 6) throw nonValido('righe_non_valide', 'Al massimo 6 righe di testo per grafica.');
  const out = [];
  let tolteEmoji = false;
  righe.forEach((r, i) => {
    const voce = typeof r === 'string' ? { testo: r } : r;
    if (!voce || typeof voce.testo !== 'string') throw nonValido('righe_non_valide', `La riga ${i + 1} non ha un «testo».`);
    const ruolo = voce.ruolo ?? (i === 0 ? 'titolo' : 'sotto');
    if (ruolo !== 'titolo' && ruolo !== 'sotto') throw nonValido('righe_non_valide', `Il ruolo della riga ${i + 1} deve essere «titolo» o «sotto».`);
    let testo = voce.testo.replace(/[\u0000-\u001f\u007f]/g, ' ');
    const senza = testo.replace(RE_EMOJI, '');
    if (senza !== testo) tolteEmoji = true;
    testo = senza.replace(/\s+/g, ' ').trim();
    if (testo.length > 220) throw nonValido('righe_non_valide', `La riga ${i + 1} è lunghissima (${testo.length} caratteri, massimo 220).`);
    if (testo) out.push({ testo, ruolo });
  });
  if (tolteEmoji) avvisi.push({ codice: 'emoji_tolte', messaggio: 'Le emoji non si possono disegnare con il font del marchio: le ho tolte dalla grafica (il resto del testo è identico).' });
  return out;
}

// Titoli: famiglia «Marchio» al peso del marchio; righe «sotto»: famiglia «MarchioTesto», peso normale.
export function blocco(righe, { larghezza, scala, base, colore, ombra, allinea = 'center', pesoTitolo = 700 }) {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', width: larghezza, color: colore, fontFamily: 'Marchio' },
      children: righe.map((r, i) => ({
        type: 'div',
        props: {
          style: {
            display: 'flex',
            justifyContent: allinea === 'center' ? 'center' : 'flex-start',
            textAlign: allinea,
            width: '100%',
            fontSize: Math.round(base[r.ruolo] * scala),
            fontFamily: r.ruolo === 'titolo' ? 'Marchio' : 'MarchioTesto',
            fontWeight: r.ruolo === 'titolo' ? pesoTitolo : 400,
            lineHeight: r.ruolo === 'titolo' ? 1.12 : 1.28,
            marginTop: i === 0 ? 0 : Math.round((r.ruolo === 'titolo' ? 18 : 12) * scala),
            ...(ombra ? { textShadow: ombra } : {}),
          },
          children: r.testo,
        },
      })),
    },
  };
}

async function altezzaBlocco(el, larghezza, fonts) {
  const svg = await satori(el, { width: larghezza, fonts });
  const m = svg.match(/height="([\d.]+)"/);
  return m ? Math.ceil(Number(m[1])) : Infinity;
}

// Larghezza della parola più lunga per ruolo, a corpo 100 px (scala in modo lineare col corpo).
async function paroleLunghe(righe, fonts, pesoTitolo) {
  const lista = [];
  const visti = new Set();
  for (const r of righe) {
    for (const parola of r.testo.split(' ')) {
      const k = `${r.ruolo}|${parola}`;
      if (parola && !visti.has(k)) {
        visti.add(k);
        lista.push({ parola, ruolo: r.ruolo });
      }
    }
  }
  const nodi = [];
  await satori(
    {
      type: 'div',
      props: {
        style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', fontFamily: 'Marchio' },
        children: lista.map((p) => ({ type: 'div', props: { style: { display: 'flex', fontSize: 100, fontFamily: p.ruolo === 'titolo' ? 'Marchio' : 'MarchioTesto', fontWeight: p.ruolo === 'titolo' ? pesoTitolo : 400 }, children: p.parola } })),
      },
    },
    { width: 30000, fonts, onNodeDetected: (n) => nodi.push(n) },
  );
  const massimi = { titolo: 0, sotto: 0 };
  nodi.slice(1, 1 + lista.length).forEach((n, i) => {
    massimi[lista[i].ruolo] = Math.max(massimi[lista[i].ruolo], n.width);
  });
  return massimi;
}

// Riduce il corpo finché il testo entra (larghezza delle parole + altezza). Mai «…»: se non entra, errore 422.
export async function adattaTesto(righe, font, { larghezza, altezzaMax, base, scalaMin, colore, ombra }) {
  const fonts = fontPerSatori(font);
  const { pesoTitolo } = setDiFont(font);
  const parole = await paroleLunghe(righe, fonts, pesoTitolo);
  const scale = [];
  for (let s = 1; s > scalaMin; s *= 0.93) scale.push(s);
  scale.push(scalaMin);
  for (const s of scale) {
    const parolaMax = Math.max(...righe.map((r) => (parole[r.ruolo] * base[r.ruolo] * s) / 100));
    if (parolaMax > larghezza) continue;
    const elemento = blocco(righe, { larghezza, scala: s, base, colore, ombra, pesoTitolo });
    const altezza = await altezzaBlocco(elemento, larghezza, fonts);
    if (altezza <= altezzaMax) return { elemento, altezza, scala: s };
  }
  throw errore(422, 'testo_troppo_lungo', 'Il testo non entra nella grafica nemmeno col carattere più piccolo ammesso. Accorcia le frasi: non taglio mai il testo con «…».');
}

export function avvisoRiduzione(scala, avvisi) {
  if (scala < 0.999) {
    avvisi.push({ codice: 'testo_troppo_lungo', messaggio: `Il testo era lungo: ho ridotto il carattere al ${Math.round(scala * 100)}% per farlo entrare (nessuna parola tagliata).` });
  }
}

export async function disegnaLivello(figli, W, H, font) {
  const svg = await satori(
    { type: 'div', props: { style: { display: 'flex', position: 'relative', width: W, height: H }, children: figli } },
    { width: W, height: H, fonts: fontPerSatori(font) },
  );
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng());
}

export const assoluto = (left, top, style, children) => ({
  type: 'div',
  props: { style: { position: 'absolute', left, top, display: 'flex', ...style }, children },
});

export function immagineLogo(logo, left, top) {
  return {
    type: 'img',
    props: { src: `data:image/png;base64,${logo.buf.toString('base64')}`, width: logo.w, height: logo.h, style: { position: 'absolute', left, top } },
  };
}

const MODELLI = {
  storia: ['pulita', 'fascia', 'titolo', 'cornice'],
  post: ['pulita', 'fascia', 'titolo'],
};

// Ritaglio "attention" della foto alla misura voluta; segnala se la foto è più piccola della misura.
// stile = correzioni GLOBALI di luce e colore (come /foto/prepara): mai contenuto nuovo.
async function fotoRitagliata(file, W, H, avvisi, stile) {
  const info = await infoImmagine(file.percorso, file.nome);
  const rapporto = W / H;
  let cw = info.larghezza;
  let ch = cw / rapporto;
  if (ch > info.altezza) {
    ch = info.altezza;
    cw = ch * rapporto;
  }
  if (cw < W * 0.75) {
    avvisi.push({ codice: 'risoluzione_bassa', messaggio: `La foto è piccola (${info.larghezza}×${info.altezza}): nella grafica può sembrare poco definita.` });
  }
  return applicaStile(apri(file.percorso).resize(W, H, { fit: 'cover', position: sharp.strategy.attention }), stile)
    .toColourspace('srgb')
    .removeAlpha()
    .png({ compressionLevel: 1 })
    .toBuffer();
}

export async function creaGrafica({ tipo, foto, logo, dati, dirOut, url, cfg }) {
  const avvisi = [];
  const modello = dati.modello ?? 'fascia';
  if (!MODELLI[tipo].includes(modello)) {
    throw nonValido('modello_non_valido', `Il modello «${modello}» non esiste per ${tipo === 'storia' ? 'le storie' : 'i post'}. Modelli possibili: ${MODELLI[tipo].join(', ')}.`);
  }
  const righe = pulisciRighe(dati.righe, avvisi);
  const colori = coloriValidi(dati.colori, avvisi);
  const stile = normalizzaStile(dati.stile, avvisi);
  const font = await fontDelMarchio(dati, cfg, avvisi);
  if (modello === 'pulita' && righe.length) {
    avvisi.push({ codice: 'righe_ignorate', messaggio: 'Il modello «pulita» non ha scritte: le righe di testo non sono state usate.' });
  }

  const storia = tipo === 'storia';
  const W = 1080;
  const H = storia ? STORIA.H : 1350;
  const z0 = storia ? STORIA.alto + RESPIRO : 64; // primo pixel in cui può esserci testo
  const z1 = storia ? H - STORIA.basso - RESPIRO : H - 64; // ultimo pixel in cui può esserci testo
  const tw = W - 2 * MARGINE_LATO;
  const figli = [];
  let base; // sharp della foto di base (oppure tela colorata per la cornice)

  const logoPronto = async (frazione, hMax) => (logo ? preparaLogo(logo.percorso, W * frazione, hMax) : null);

  if (modello === 'pulita') {
    base = sharp(await fotoRitagliata(foto, W, H, avvisi, stile));
    const l = await logoPronto(storia ? 0.22 : 0.14, storia ? 160 : 110);
    if (l) figli.push(immagineLogo(l, W - (storia ? MARGINE_LATO : 56) - l.w, (storia ? z1 : H - 56) - l.h));
  } else if (modello === 'fascia') {
    base = sharp(await fotoRitagliata(foto, W, H, avvisi, stile));
    const pad = storia ? 48 : 44;
    const l = await logoPronto(storia ? 0.2 : 0.16, storia ? 150 : 120);
    if (l) figli.push(immagineLogo(l, W - MARGINE_LATO - l.w, z0));
    if (righe.length) {
      const t = await adattaTesto(righe, font, {
        larghezza: tw,
        altezzaMax: storia ? 620 : 440,
        base: storia ? { titolo: 84, sotto: 46 } : { titolo: 72, sotto: 40 },
        scalaMin: 0.6,
        colore: colori.testo,
      });
      avvisoRiduzione(t.scala, avvisi);
      const fondoFascia = storia ? z1 : H;
      const testoTop = fondoFascia - pad - t.altezza - (storia ? 0 : 16);
      const fasciaTop = testoTop - pad;
      figli.push(assoluto(0, fasciaTop, { width: W, height: fondoFascia - fasciaTop, backgroundColor: rgba(colori.primario, 0.9) }));
      figli.push(assoluto(MARGINE_LATO, testoTop, { width: tw }, [t.elemento]));
    }
  } else if (modello === 'titolo') {
    base = sharp(await fotoRitagliata(foto, W, H, avvisi, stile));
    const l = await logoPronto(storia ? 0.2 : 0.16, storia ? 150 : 110);
    if (righe.length) {
      const testoTop = storia ? z0 + 40 : 96;
      const t = await adattaTesto(righe, font, {
        larghezza: tw,
        altezzaMax: storia ? 820 : 620,
        base: storia ? { titolo: 96, sotto: 50 } : { titolo: 84, sotto: 44 },
        scalaMin: 0.58,
        colore: colori.testo,
        ombra: '0px 3px 14px rgba(0,0,0,0.55)',
      });
      avvisoRiduzione(t.scala, avvisi);
      // Velo scuro dietro al testo (pieno fino alla fine del testo, poi sfuma): leggibile su qualsiasi foto.
      const fondoTesto = testoTop + t.altezza;
      const hSfumatura = Math.min(H, fondoTesto + 260);
      const tappa = Math.round((fondoTesto / hSfumatura) * 100);
      figli.push(assoluto(0, 0, { width: W, height: hSfumatura, backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.66) 0%, rgba(0,0,0,0.5) ${tappa}%, rgba(0,0,0,0) 100%)` }));
      figli.push(assoluto(MARGINE_LATO, testoTop, { width: tw }, [t.elemento]));
    }
    if (l) figli.push(immagineLogo(l, W - MARGINE_LATO - l.w, (storia ? z1 : H - 56) - l.h));
  } else {
    // cornice (solo storie): fondo pieno del colore primario, foto incorniciata, testo sotto.
    const l = await logoPronto(0.4, 110);
    let fotoTop = z0;
    if (l) {
      figli.push(immagineLogo(l, Math.round((W - l.w) / 2), z0));
      fotoTop = z0 + l.h + 32;
    }
    let fotoFondo = z1;
    if (righe.length) {
      const t = await adattaTesto(righe, font, {
        larghezza: tw,
        altezzaMax: z1 - 40 - 640 - fotoTop,
        base: { titolo: 72, sotto: 42 },
        scalaMin: 0.6,
        colore: colori.testo,
      });
      avvisoRiduzione(t.scala, avvisi);
      const testoTop = z1 - t.altezza;
      fotoFondo = testoTop - 40;
      figli.push(assoluto(MARGINE_LATO, testoTop, { width: tw }, [t.elemento]));
    }
    const pw = tw;
    const ph = fotoFondo - fotoTop;
    const raggio = 28;
    const maschera = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}"><rect width="${pw}" height="${ph}" rx="${raggio}" ry="${raggio}" fill="#fff"/></svg>`);
    const fotoTonda = await sharp(await fotoRitagliata(foto, pw, ph, avvisi, stile)).ensureAlpha().composite([{ input: maschera, blend: 'dest-in' }]).png().toBuffer();
    base = sharp({ create: { width: W, height: H, channels: 3, background: colori.primario } }).composite([{ input: fotoTonda, left: MARGINE_LATO, top: fotoTop }]);
    figli.push(assoluto(MARGINE_LATO, fotoTop, { width: pw, height: ph, border: `6px solid ${colori.secondario}`, borderRadius: raggio }));
  }

  const livello = await disegnaLivello(figli, W, H, font);
  const fondo = await base.png({ compressionLevel: 1 }).toBuffer();
  const tela = await sharp(fondo).composite([{ input: livello, left: 0, top: 0 }]).removeAlpha().png({ compressionLevel: 1 }).toBuffer();
  const { buf } = await jpegEntro(tela, MAX_JPEG_META, { qualita: 90 });
  const nome = `${tipo}.jpg`;
  await fs.writeFile(path.join(dirOut, nome), buf);
  const conf = await creaConfronto(foto.percorso, buf, dirOut, 'confronto.jpg', cfg);
  return { file: [{ url: url(nome) }], confronto: { url: url(conf.nome) }, avvisi };
}
