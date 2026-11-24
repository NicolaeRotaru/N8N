// Font: Google Font scaricati al primo uso e tenuti in cache su /dati/font-cache, più alcuni font inclusi
// nell'immagine: i due di riserva (Inter = senza grazie, Playfair Display = con grazie) e quelli del locale
// pilota (Roboto Slab con il peso 800 dei titoli, Archivo), che così non dipendono dalla rete.
import fs from 'node:fs/promises';
import path from 'node:path';

const INCLUSI = {
  inter: { famiglia: 'Inter', file: { 400: 'Inter-400.ttf', 700: 'Inter-700.ttf' } },
  'playfair display': { famiglia: 'Playfair Display', file: { 400: 'PlayfairDisplay-400.ttf', 700: 'PlayfairDisplay-700.ttf' } },
  'roboto slab': { famiglia: 'Roboto Slab', file: { 400: 'RobotoSlab-400.ttf', 700: 'RobotoSlab-700.ttf', 800: 'RobotoSlab-800.ttf' } },
  archivo: { famiglia: 'Archivo', file: { 400: 'Archivo-400.ttf', 700: 'Archivo-700.ttf' } },
  // Scatti di G (SDG): il font dei titoli del marchio dell'agenzia, per lo stile «sdg» della regia.
  'bricolage grotesque': { famiglia: 'Bricolage Grotesque', file: { 400: 'BricolageGrotesque-400.ttf', 700: 'BricolageGrotesque-700.ttf', 800: 'BricolageGrotesque-800.ttf' } },
  // Scatti di G (SDG), moodboard del 24/11/2026: Poppins per tutti i testi dei video (sobrio, leggibile sul telefono).
  poppins: { famiglia: 'Poppins', file: { 300: 'Poppins-300.ttf', 400: 'Poppins-400.ttf', 500: 'Poppins-500.ttf', 600: 'Poppins-600.ttf', 700: 'Poppins-700.ttf' } },
};
const RISERVA = { sans: 'inter', serif: 'playfair display' };

// Famiglie con grazie note: se non si scaricano, si ripiega sul font di riserva con grazie.
const RE_SERIF = /serif|slab|playfair|lora|merriweather|garamond|baskerville|bodoni|cormorant|crimson|libre caslon|abril|prata|cinzel|spectral|vollkorn|bitter|alegreya(?! sans)|noto serif|pt serif|dm serif|fraunces|gloock|young serif|eb garamond|marcellus|literata|newsreader|domine|rufina|gilda/i;

const RE_NOME_FONT = /^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/;
const ORE_24 = 24 * 3600 * 1000;

const inMemoria = new Map(); // chiave -> Promise<font>

function slug(nome) {
  return nome.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function eFontValido(buf) {
  if (!buf || buf.length < 1024) return false;
  const firma = buf.readUInt32BE(0);
  return firma === 0x00010000 || firma === 0x4f54544f /* OTTO */ || firma === 0x74727565 /* true */;
}

// Legge il nome di famiglia dalla tabella 'name' del TTF (serve a libass per i sottotitoli).
// preferiti = gli id della tabella da provare in ordine: di serie 16 (famiglia tipografica) poi 1.
export function nomeFamigliaTtf(buf, preferiti = [16, 1]) {
  try {
    const numTabelle = buf.readUInt16BE(4);
    let offName = -1;
    for (let i = 0; i < numTabelle; i++) {
      const r = 12 + i * 16;
      if (buf.toString('latin1', r, r + 4) === 'name') offName = buf.readUInt32BE(r + 8);
    }
    if (offName < 0) return null;
    const conteggio = buf.readUInt16BE(offName + 2);
    const offStringhe = offName + buf.readUInt16BE(offName + 4);
    const trovati = {};
    for (let i = 0; i < conteggio; i++) {
      const r = offName + 6 + i * 12;
      const piattaforma = buf.readUInt16BE(r);
      const idNome = buf.readUInt16BE(r + 6);
      const lunghezza = buf.readUInt16BE(r + 8);
      const off = offStringhe + buf.readUInt16BE(r + 10);
      if (!preferiti.includes(idNome)) continue;
      let testo;
      if (piattaforma === 3 || piattaforma === 0) {
        const b = Buffer.from(buf.subarray(off, off + lunghezza));
        b.swap16();
        testo = b.toString('utf16le');
      } else if (piattaforma === 1) {
        testo = buf.toString('latin1', off, off + lunghezza);
      }
      if (testo && !trovati[idNome]) trovati[idNome] = testo;
    }
    for (const id of preferiti) if (trovati[id]) return trovati[id];
    return null;
  } catch {
    return null;
  }
}

async function caricaIncluso(cfg, chiave) {
  const r = INCLUSI[chiave];
  const pesi = {};
  for (const [peso, nome] of Object.entries(r.file)) {
    const file = path.join(cfg.fontRiservaDir, nome);
    pesi[peso] = { file, dati: await fs.readFile(file) };
  }
  return { famiglia: r.famiglia, pesi, ripiego: false };
}

async function caricaRiserva(cfg, tipo) {
  return { ...(await caricaIncluso(cfg, RISERVA[tipo])), ripiego: true };
}

async function scaricaTesto(url, timeoutMs) {
  const risposta = await fetch(url, {
    // Un User-Agent "vecchio" fa rispondere Google Fonts con file TTF (non WOFF2), che servono a satori e libass.
    headers: { 'user-agent': 'Mozilla/4.0 (officina-agenzia)' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!risposta.ok) {
    const e = new Error(`HTTP ${risposta.status}`);
    e.stato = risposta.status;
    throw e;
  }
  return risposta.text();
}

async function scaricaBinario(url, cfg, timeoutMs) {
  const u = new URL(url);
  if (!cfg.fontHostAmmessi.includes(u.host) && !cfg.fontHostAmmessi.includes(u.hostname)) {
    throw new Error(`host del font non ammesso: ${u.host}`);
  }
  const risposta = await fetch(u, { signal: AbortSignal.timeout(timeoutMs) });
  if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
  const buf = Buffer.from(await risposta.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) throw new Error('font troppo grande');
  if (!eFontValido(buf)) throw new Error('il file scaricato non è un font TTF/OTF');
  return buf;
}

// Dal CSS di Google Fonts: { 400: url, 700: url } (solo stile normale).
export function urlDalCss(css) {
  const risultato = {};
  for (const blocco of css.split('@font-face').slice(1)) {
    if (/font-style:\s*italic/i.test(blocco)) continue;
    const peso = Number((blocco.match(/font-weight:\s*(\d+)/i) || [])[1] || 400);
    const url = (blocco.match(/url\(([^)]+)\)/i) || [])[1];
    if (url && !risultato[peso]) risultato[peso] = url.replace(/^['"]|['"]$/g, '');
  }
  return risultato;
}

async function scaricaDaGoogle(nome, cfg, dirCache) {
  const famiglia = encodeURIComponent(nome.trim()).replace(/%20/g, '+');
  let css;
  try {
    css = await scaricaTesto(`${cfg.fontCssUrl}?family=${famiglia}:wght@400;700`, 10_000);
  } catch (e) {
    if (e.stato !== 400) throw e;
    // La famiglia non ha il 700: si chiede solo il peso normale.
    css = await scaricaTesto(`${cfg.fontCssUrl}?family=${famiglia}`, 10_000);
  }
  const urls = urlDalCss(css);
  const url400 = urls[400] || Object.values(urls)[0];
  if (!url400) throw new Error('nessun font nel CSS');
  const dati400 = await scaricaBinario(url400, cfg, 20_000);
  const dati700 = urls[700] ? await scaricaBinario(urls[700], cfg, 20_000) : dati400;
  await fs.mkdir(dirCache, { recursive: true });
  const s = slug(nome);
  for (const [peso, dati] of [[400, dati400], [700, dati700]]) {
    const finale = path.join(dirCache, `${s}-${peso}.ttf`);
    const tmp = `${finale}.${process.pid}.tmp`;
    await fs.writeFile(tmp, dati);
    await fs.rename(tmp, finale);
  }
}

async function dallaCache(nome, dirCache) {
  const s = slug(nome);
  const pesi = {};
  for (const peso of [400, 700]) {
    const file = path.join(dirCache, `${s}-${peso}.ttf`);
    const dati = await fs.readFile(file);
    if (!eFontValido(dati)) throw new Error('cache rovinata');
    pesi[peso] = { file, dati };
  }
  return { famiglia: nomeFamigliaTtf(pesi[400].dati) || nome.trim(), pesi, ripiego: false };
}

async function segnoRecente(file) {
  try {
    return Date.now() - (await fs.stat(file)).mtimeMs < ORE_24;
  } catch {
    return false;
  }
}

// Un peso in più (es. 800 per i titoli) di un Google Font già in cache. null se la famiglia non ce l'ha.
async function pesoExtraGoogle(nome, peso, cfg, dirCache) {
  const file = path.join(dirCache, `${slug(nome)}-${peso}.ttf`);
  try {
    const dati = await fs.readFile(file);
    if (eFontValido(dati)) return { file, dati };
  } catch {
    // non in cache
  }
  const segno = path.join(dirCache, `${slug(nome)}-${peso}.mancante`);
  if (!cfg.fontRete || (await segnoRecente(segno))) return null;
  try {
    const famiglia = encodeURIComponent(nome.trim()).replace(/%20/g, '+');
    const css = await scaricaTesto(`${cfg.fontCssUrl}?family=${famiglia}:wght@${peso}`, 10_000);
    const url = urlDalCss(css)[peso];
    if (!url) throw new Error(`peso ${peso} assente`);
    const dati = await scaricaBinario(url, cfg, 20_000);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, dati);
    await fs.rename(tmp, file);
    return { file, dati };
  } catch (e) {
    if (e.stato === 400 || e.stato === 404 || /assente/.test(e.message)) await fs.writeFile(segno, e.message).catch(() => {});
    return null;
  }
}

async function caricaSenzaMemoria(nome, cfg, pesoExtra) {
  const tipoRiserva = RE_SERIF.test(nome) ? 'serif' : 'sans';
  const dirCache = path.join(cfg.datiDir, 'font-cache');
  // I font inclusi sono già nell'immagine: nessun download.
  const incluso = INCLUSI[nome.trim().toLowerCase()];
  if (incluso) return caricaIncluso(cfg, nome.trim().toLowerCase());
  try {
    const f = await dallaCache(nome, dirCache);
    if (pesoExtra) {
      const extra = await pesoExtraGoogle(nome, pesoExtra, cfg, dirCache);
      if (extra) f.pesi[pesoExtra] = extra;
    }
    return f;
  } catch {
    // non in cache
  }
  const segnoMancante = path.join(dirCache, `${slug(nome)}.mancante`);
  let motivo = 'download dei font spento';
  if (cfg.fontRete) {
    let recente = false;
    try {
      const st = await fs.stat(segnoMancante);
      recente = Date.now() - st.mtimeMs < ORE_24;
    } catch {
      recente = false;
    }
    if (recente) {
      motivo = 'non trovato nelle ultime 24 ore';
    } else {
      try {
        await scaricaDaGoogle(nome, cfg, dirCache);
        const f = await dallaCache(nome, dirCache);
        if (pesoExtra) {
          const extra = await pesoExtraGoogle(nome, pesoExtra, cfg, dirCache);
          if (extra) f.pesi[pesoExtra] = extra;
        }
        return f;
      } catch (e) {
        motivo = e.message;
        await fs.mkdir(dirCache, { recursive: true }).catch(() => {});
        // Si ricorda il fallimento solo se Google ha detto chiaramente "non esiste" (evita di martellare).
        if (e.stato === 400 || e.stato === 404) await fs.writeFile(segnoMancante, motivo).catch(() => {});
      }
    }
  }
  const riserva = await caricaRiserva(cfg, tipoRiserva);
  return { ...riserva, motivo };
}

// Restituisce { famiglia, pesi: {400:{file,dati}, 700:{file,dati}, [pesoExtra]?}, ripiego, avviso? }.
// pesoExtra (es. 800): si prova a caricarlo in più; se la famiglia non ce l'ha, in «pesi» non c'è.
export async function caricaFont(nomeRichiesto, cfg, pesoExtra = null) {
  const nome = typeof nomeRichiesto === 'string' ? nomeRichiesto.trim() : '';
  if (!nome) return { ...(await caricaRiserva(cfg, 'sans')), ripiego: false };
  if (!RE_NOME_FONT.test(nome)) {
    const r = await caricaRiserva(cfg, 'sans');
    return { ...r, avviso: { codice: 'font_non_disponibile', messaggio: `Il nome del font «${nome.slice(0, 60)}» non è valido: ho usato ${r.famiglia}.` } };
  }
  const extra = pesoExtra && pesoExtra !== 400 && pesoExtra !== 700 ? pesoExtra : null;
  const chiave = `${nome.toLowerCase()}|${extra || ''}`;
  if (!inMemoria.has(chiave)) {
    const p = caricaSenzaMemoria(nome, cfg, extra);
    inMemoria.set(chiave, p);
    p.then((f) => { if (f.ripiego) inMemoria.delete(chiave); }, () => inMemoria.delete(chiave));
    if (inMemoria.size > 30) inMemoria.delete(inMemoria.keys().next().value);
  }
  const font = await inMemoria.get(chiave);
  if (font.ripiego) {
    return { ...font, avviso: { codice: 'font_non_disponibile', messaggio: `Il font «${nome}» non si è potuto scaricare: ho usato ${font.famiglia}.` } };
  }
  return font;
}

// Il nome con cui libass trova un font caricato da fontsdir: la famiglia «legacy» (id 1, poi il nome completo id 4).
// Per un peso fuori da regolare/grassetto (es. ExtraBold 800) è «Bricolage Grotesque ExtraBold», non «Bricolage Grotesque».
export function nomeFamigliaLibass(buf) {
  return nomeFamigliaTtf(buf, [1, 4]);
}

// Pesi ammessi per i titoli: 100-900 a passi di 100. Un valore sbagliato non ferma la grafica: si usa 700.
export function leggiPesoTitolo(valore, avvisi) {
  if (valore === undefined || valore === null || valore === '') return 700;
  const n = Number(valore);
  if (Number.isInteger(n) && n >= 100 && n <= 900 && n % 100 === 0) return n;
  avvisi.push({ codice: 'peso_non_valido', messaggio: `«peso_titolo» (${String(valore).slice(0, 20)}) deve essere 100, 200 … 900: ho usato 700.` });
  return 700;
}

// Font del marchio per una grafica: titoli con «font» al peso «peso_titolo» (predefinito 700),
// righe «sotto» con «font_testo» (predefinito: lo stesso «font»). Tutti i campi sono facoltativi.
export async function fontDelMarchio(dati, cfg, avvisi) {
  const peso = leggiPesoTitolo(dati.peso_titolo, avvisi);
  const titolo = await caricaFont(dati.font, cfg, peso);
  if (titolo.avviso) avvisi.push(titolo.avviso);
  let testo = titolo;
  const nomeTesto = typeof dati.font_testo === 'string' ? dati.font_testo.trim() : '';
  if (nomeTesto && nomeTesto.toLowerCase() !== String(dati.font ?? '').trim().toLowerCase()) {
    testo = await caricaFont(nomeTesto, cfg);
    if (testo.avviso) avvisi.push({ ...testo.avviso, messaggio: testo.avviso.messaggio.replace('Il font', 'Il font del testo') });
  }
  let pesoTitolo = peso;
  if (!titolo.pesi[peso]) {
    pesoTitolo = 700;
    avvisi.push({ codice: 'peso_non_disponibile', messaggio: `Il font «${titolo.famiglia}» non ha il peso ${peso}: per i titoli ho usato il grassetto (700).` });
  }
  return { titolo, testo, pesoTitolo };
}

// Accetta sia il risultato di fontDelMarchio sia un font singolo di caricaFont.
export function setDiFont(f) {
  return f.titolo ? f : { titolo: f, testo: f, pesoTitolo: 700 };
}

// Due famiglie per satori: «Marchio» (titoli, tutti i pesi caricati) e «MarchioTesto» (righe sotto).
export function fontPerSatori(f) {
  const m = setDiFont(f);
  const lista = Object.entries(m.titolo.pesi).map(([peso, x]) => ({ name: 'Marchio', data: x.dati, weight: Number(peso), style: 'normal' }));
  for (const peso of [400, 700]) lista.push({ name: 'MarchioTesto', data: m.testo.pesi[peso].dati, weight: peso, style: 'normal' });
  return lista;
}
