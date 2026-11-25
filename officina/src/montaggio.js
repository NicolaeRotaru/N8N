// Montaggio di UN contenuto del piano usando il materiale già caricato nel progetto (niente si ricarica).
// Usa gli stessi motori di /video/reel, /grafica/post, /grafica/storia e /foto/prepara: stesse regole,
// stesso «solo montaggio vero» (tagli, ritaglio, sfondo sfocato della stessa clip, scritte e logo sopra).
import fs from 'node:fs/promises';
import path from 'node:path';
import { errore } from './errori.js';
import { creaReel } from './video.js';
import { creaGrafica } from './grafiche.js';
import { preparaFoto } from './immagini.js';
import { scriviSrt } from './srt.js';
import { controllaRegia, regoleDelloStile } from './regia.js';
import { montaRegia, stileDa } from './regia-render.js';
import { lutPerMateriali } from './lut.js';
import { indice, controllaContenuto } from './piano.js';

// I campi del marchio che i motori conoscono (gli altri si ignorano).
function campiMarchio(m) {
  const x = m && typeof m === 'object' ? m : {};
  const out = {};
  for (const k of ['colori', 'font', 'font_testo', 'peso_titolo', 'stile']) if (x[k] !== undefined && x[k] !== null) out[k] = x[k];
  return out;
}

function fileDelMateriale(dirProgetto, m) {
  return { percorso: path.join(dirProgetto, m.file), nome: m.nome_originale || path.basename(m.file) };
}

// Sottotitoli sulla «linea sorgente» delle clip scelte (le clip intere una dopo l'altra), come vuole /video/reel.
export function srtSorgente(clipVideo) {
  const frasi = [];
  let partenza = 0;
  for (const v of clipVideo) {
    for (const s of v.parlato || []) frasi.push({ inizio: partenza + s.inizio, fine: partenza + s.fine, testo: s.testo });
    partenza += v.durata;
  }
  return frasi.length ? scriviSrt(frasi) : '';
}

// Sposta i file prodotti da un motore (cartella temporanea) nella cartella d'uscita con un prefisso.
async function sposta(dirDa, dirOut, prefisso) {
  const out = {};
  for (const n of await fs.readdir(dirDa)) {
    const nuovo = `${prefisso}${n}`;
    await fs.rename(path.join(dirDa, n), path.join(dirOut, nuovo));
    out[n] = nuovo;
  }
  return out;
}

export async function montaContenuto({ progetto, dirProgetto, dati, file, lavoro, url, cfg, segnale }) {
  const idx = indice(progetto);
  // lo stile della regia (di serie Scatti di G) decide anche il ritmo con cui si controllano le battute
  const marchioRegia = dati.marchio_valido === false ? null : dati.marchio;
  const stile = stileDa(dati.stile, marchioRegia, dati.identita);
  const R = regoleDelloStile(stile);
  const r = controllaContenuto(dati.contenuto, Number(dati.contenuto?.n) || 1, idx, { progetto, R });
  if (!r.contenuto) {
    throw errore(422, 'contenuto_non_valido', `Non posso montare questo contenuto: ${r.problemi.map((p) => p.messaggio).join(' ')}`);
  }
  const c = r.contenuto;
  const marchio = campiMarchio(dati.marchio);
  const logo = file.logo?.[0];
  const avvisi = r.avvisi.map((a) => ({ codice: 'corretto', messaggio: a }));
  const conSottotitoli = dati.sottotitoli !== false;

  if (c.motore === 'regia') {
    const tl = controllaRegia(c.regia, progetto, { R, formato: 'verticale' });
    const lut = await lutPerMateriali(cfg, progetto.materiali, { lut: dati.lut ?? null, lut_materiali: dati.lut_materiali ?? null });
    let musicaFile = null;
    if (tl.musica?.usa) {
      musicaFile = file.musica?.[0]?.percorso || null;
      if (!musicaFile) avvisi.push({ codice: 'musica_mancante', messaggio: 'La regia voleva la musica ma non è arrivato nessun file musicale: il video esce solo con le voci.' });
    }
    // la regia avvisa da sola se manca la musica: qui non lo ripeto
    const ris = await montaRegia({ tl: { ...tl, musica: { ...tl.musica, usa: Boolean(musicaFile) } }, progetto, dirProgetto, stile, lut, logo, musicaFile, lavoro, url, cfg, segnale });
    return { tipo: c.tipo, contenuto: c, file: ris.file, controllo: ris.controllo, avvisi: [...avvisi, ...ris.avvisi] };
  }

  if (c.tipo === 'reel' || c.tipo === 'storia_video') {
    const ordine = [];
    for (const p of c.pezzi) if (!ordine.includes(p.video)) ordine.push(p.video);
    const video = ordine.map((k) => idx.video.get(k));
    const tagli = c.pezzi.map((p) => ({ clip: ordine.indexOf(p.video), inizio: p.inizio, fine: p.fine }));
    let musica = null;
    if (c.musica) {
      musica = file.musica?.[0] || null;
      if (!musica) avvisi.push({ codice: 'musica_mancante', messaggio: 'Il piano voleva la musica ma non è arrivato nessun file musicale: il video esce con il suo audio.' });
    }
    const srt = conSottotitoli && c.sottotitoli ? srtSorgente(video) : '';
    const datiReel = {
      ...marchio,
      tagli,
      intro: c.intro ? { testo: c.intro } : null,
      outro: c.outro ? { testo: c.outro } : null,
      durata_max: c.tipo === 'storia_video' ? 59.9 : 90,
      ...(srt ? { sottotitoli_srt: srt } : {}),
      ...(musica && c.volume_musica !== null ? { volume_musica: c.volume_musica } : {}),
    };
    const ris = await creaReel({ clip: video.map((v) => fileDelMateriale(dirProgetto, v)), logo, musica, dati: datiReel, lavoro, url, cfg, segnale });
    // creaReel numera le clip da 0 nei suoi avvisi: le riporto ai codici del materiale (V03…)
    const avvisiReel = ris.avvisi.map((a) => ({ ...a, messaggio: a.messaggio.replace(/\b([Ll])a clip (\d+)\b/g, (_, l, k) => `${l === 'L' ? 'Il' : 'il'} video ${ordine[Number(k)] || k}`) }));
    return { tipo: c.tipo, contenuto: c, file: ris.file, avvisi: [...avvisi, ...avvisiReel] };
  }

  const foto = c.foto.map((k) => idx.foto.get(k));
  const righe = c.righe || [];
  if (c.tipo === 'post' || c.tipo === 'storia_foto') {
    const tipo = c.tipo === 'post' ? 'post' : 'storia';
    const ris = await creaGrafica({
      tipo,
      foto: fileDelMateriale(dirProgetto, foto[0]),
      logo,
      dati: { ...marchio, modello: righe.length ? (dati.modello_testo || 'fascia') : 'pulita', righe },
      dirOut: lavoro.dirOut,
      url,
      cfg,
    });
    return { tipo: c.tipo, contenuto: c, file: ris.file.map((f) => ({ tipo: 'immagine', url: f.url })), confronto: ris.confronto, avvisi: [...avvisi, ...ris.avvisi] };
  }

  // carosello: la prima foto con il titolo (se c'è) e il logo, le altre solo ritagliate in 4:5 con lo stile del marchio
  const usciti = [];
  const tutti = [...avvisi];
  for (const [i, f] of foto.entries()) {
    const n = String(i + 1).padStart(2, '0');
    const dirSlide = path.join(lavoro.dirTmp, `slide-${n}`);
    await fs.mkdir(dirSlide, { recursive: true });
    const nomeDi = (x) => x;
    if (i === 0) {
      const ris = await creaGrafica({
        tipo: 'post',
        foto: fileDelMateriale(dirProgetto, f),
        logo,
        dati: { ...marchio, modello: righe.length ? (dati.modello_testo || 'fascia') : 'pulita', righe },
        dirOut: dirSlide,
        url: nomeDi,
        cfg,
      });
      tutti.push(...ris.avvisi);
      const mappa = await sposta(dirSlide, lavoro.dirOut, `slide-${n}-`);
      usciti.push({ tipo: 'immagine', url: url(mappa['post.jpg']) });
    } else {
      const ris = await preparaFoto({ foto: fileDelMateriale(dirProgetto, f), logo: null, dati: { formati: ['4:5'], stile: marchio.stile }, dirOut: dirSlide, url: nomeDi });
      tutti.push(...ris.avvisi);
      const mappa = await sposta(dirSlide, lavoro.dirOut, `slide-${n}-`);
      usciti.push({ tipo: 'immagine', url: url(mappa['foto-4x5.jpg']) });
    }
  }
  return { tipo: c.tipo, contenuto: c, file: usciti, avvisi: tutti };
}
