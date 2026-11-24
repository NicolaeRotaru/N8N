// Controllo del piano del mese scritto da Claude, contro il materiale VERO del progetto.
// Niente si fida della parola di Claude: ogni codice deve esistere, ogni taglio deve stare dentro la clip,
// ogni durata deve rispettare i limiti di Instagram e dell'officina. Quello che si può correggere si corregge
// (con un avviso), quello che non si può si toglie (con un problema «blocca» per quel contenuto).
import { etichetteQualita } from './catalogo.js';
import { controllaRegia, REGOLE } from './regia.js';

export const TIPI = ['reel', 'storia_video', 'post', 'carosello', 'storia_foto'];
export const LIMITI = {
  reel: { min: 5, max: 90, consigliato: 45 },
  storia_video: { min: 2, max: 59.9 },
  pezzoMin: 0.8,
  pezzoMax: 30,
  pezziMax: 20,
  carosello: { min: 2, max: 10 },
  intro: 60,
  outro: 60,
  righe: 6,
  riga: 220,
};

const testo = (v) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();
const due = (n) => String(n).padStart(2, '0');
const r2 = (n) => Math.round(n * 100) / 100;
const virgola = (n) => Number(n).toFixed(1).replace('.', ',');

function giorniNelMese(anno, mese) {
  return new Date(Date.UTC(anno, mese, 0)).getUTCDate();
}

export function leggiData(v) {
  const m = testo(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const [a, me, g] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (me < 1 || me > 12 || g < 1 || g > giorniNelMese(a, me)) return null;
  return { anno: a, mese: me, giorno: g, chiave: `${a}-${due(me)}-${due(g)}` };
}

export function leggiOra(v) {
  const m = testo(v).match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  const [o, mi] = [Number(m[1]), Number(m[2])];
  if (o > 23 || mi > 59) return null;
  return `${due(o)}:${due(mi)}`;
}

// Indice del materiale: codice scena → {video, scena}, codice foto → foto.
export function indice(progetto) {
  const scene = new Map();
  const foto = new Map();
  const video = new Map();
  for (const m of progetto.materiali) {
    if (m.tipo === 'video') {
      video.set(m.codice, m);
      for (const s of m.scene) scene.set(s.codice, { video: m, scena: s });
    } else foto.set(m.codice, m);
  }
  return { scene, foto, video, qualita: etichetteQualita(progetto.materiali) };
}

// Un pezzo del montaggio: {scena:"V03.2", inizio?, fine?} con i secondi DENTRO la clip V03.
// Senza inizio/fine = tutta la scena. Restituisce il pezzo pulito oppure null (con il problema già annotato).
function pezzoValido(p, idx, n, problemi, avvisi) {
  const codice = testo(p?.scena).toUpperCase();
  const voce = idx.scene.get(codice);
  if (!voce) {
    // «V03» senza scena: si accetta solo se il video ha una scena sola
    const v = idx.video.get(codice);
    if (v && v.scene.length === 1) return pezzoValido({ ...p, scena: v.scene[0].codice }, idx, n, problemi, avvisi);
    problemi.push({ n, gravita: 'avviso', codice: 'scena_inesistente', messaggio: `Contenuto ${n}: la scena «${testo(p?.scena) || '?'}» non esiste nel materiale, l'ho tolta.` });
    return null;
  }
  const { video, scena } = voce;
  let inizio = p.inizio === undefined || p.inizio === null || p.inizio === '' ? scena.inizio : Number(p.inizio);
  let fine = p.fine === undefined || p.fine === null || p.fine === '' ? scena.fine : Number(p.fine);
  if (!Number.isFinite(inizio) || !Number.isFinite(fine)) {
    problemi.push({ n, gravita: 'avviso', codice: 'tempi_non_validi', messaggio: `Contenuto ${n}: i tempi del pezzo ${codice} non sono numeri, ho usato tutta la scena.` });
    inizio = scena.inizio;
    fine = scena.fine;
  }
  if (inizio < 0) inizio = 0;
  if (fine > video.durata) {
    avvisi.push(`il pezzo ${codice} finiva dopo la fine della clip: fermato a ${virgola(video.durata)} s`);
    fine = video.durata;
  }
  if (fine <= inizio) {
    problemi.push({ n, gravita: 'avviso', codice: 'tempi_non_validi', messaggio: `Contenuto ${n}: il pezzo ${codice} ha la fine prima dell'inizio, l'ho tolto.` });
    return null;
  }
  // tempi fuori dalla scena indicata: si accettano (la scena è solo un'etichetta), ma si dice
  if (inizio < scena.inizio - 0.5 || fine > scena.fine + 0.5) avvisi.push(`il pezzo ${codice} esce dalla sua scena (${scena.inizio}–${scena.fine} s): va bene, ma ricontrolla che sia il momento giusto`);
  if (fine - inizio < LIMITI.pezzoMin) {
    // troppo corto: si allunga dentro la clip, se si può
    const manca = LIMITI.pezzoMin - (fine - inizio);
    const dopo = Math.min(manca, video.durata - fine);
    fine += dopo;
    inizio = Math.max(0, inizio - (manca - dopo));
    if (fine - inizio < LIMITI.pezzoMin - 0.01) {
      problemi.push({ n, gravita: 'avviso', codice: 'pezzo_troppo_corto', messaggio: `Contenuto ${n}: il pezzo ${codice} dura meno di ${virgola(LIMITI.pezzoMin)} s, l'ho tolto.` });
      return null;
    }
    avvisi.push(`il pezzo ${codice} era più corto di ${virgola(LIMITI.pezzoMin)} s: l'ho allungato`);
  }
  if (fine - inizio > LIMITI.pezzoMax) {
    avvisi.push(`il pezzo ${codice} durava più di ${LIMITI.pezzoMax} s: l'ho accorciato`);
    fine = inizio + LIMITI.pezzoMax;
  }
  const q = idx.qualita.get(scena.codice) || [];
  if (q.length) avvisi.push(`il pezzo ${codice} ha un difetto (${q.join(', ')})`);
  return { scena: scena.codice, video: video.codice, inizio: r2(inizio), fine: r2(fine) };
}

function righeValide(v, n, avvisi) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const r of v) {
    const t = testo(typeof r === 'string' ? r : r?.testo);
    if (!t) continue;
    if (out.length >= LIMITI.righe) {
      avvisi.push(`più di ${LIMITI.righe} righe di testo: tenute le prime ${LIMITI.righe}`);
      break;
    }
    out.push({ testo: t.slice(0, LIMITI.riga), ruolo: r?.ruolo === 'sotto' ? 'sotto' : out.length === 0 ? 'titolo' : r?.ruolo === 'titolo' ? 'titolo' : 'sotto' });
  }
  return out;
}

// Controlla UN contenuto. Restituisce {contenuto|null, problemi, avvisi}.
export function controllaContenuto(c, n, idx, { mese, progetto = null, R = REGOLE } = {}) {
  const problemi = [];
  const avvisi = [];
  const tipo = testo(c?.tipo).toLowerCase().replace(/[\s-]+/g, '_');
  if (!TIPI.includes(tipo)) {
    problemi.push({ n, gravita: 'blocca', codice: 'tipo_sconosciuto', messaggio: `Contenuto ${n}: il tipo «${testo(c?.tipo)}» non esiste (vanno bene: ${TIPI.join(', ')}). L'ho tolto.` });
    return { contenuto: null, problemi, avvisi };
  }
  const data = leggiData(c.data);
  if (!data) {
    problemi.push({ n, gravita: 'blocca', codice: 'data_non_valida', messaggio: `Contenuto ${n}: la data «${testo(c.data)}» non è valida (serve AAAA-MM-GG). L'ho tolto.` });
    return { contenuto: null, problemi, avvisi };
  }
  if (mese && data.chiave.slice(0, 7) !== mese) {
    problemi.push({ n, gravita: 'blocca', codice: 'fuori_mese', messaggio: `Contenuto ${n}: la data ${data.chiave} è fuori dal mese ${mese}. L'ho tolto.` });
    return { contenuto: null, problemi, avvisi };
  }
  let ora = leggiOra(c.ora);
  if (!ora) {
    avvisi.push(`l'ora «${testo(c.ora)}» non era valida: messa alle 18:30`);
    ora = '18:30';
  }
  const titolo = testo(c.titolo).slice(0, 80) || `Contenuto ${n}`;
  const base = {
    n,
    tipo,
    data: data.chiave,
    ora,
    titolo,
    idea: testo(c.idea).slice(0, 600),
    perche: testo(c.perche).slice(0, 400),
    didascalia: String(c.didascalia ?? '').trim().slice(0, 2200),
  };

  // reel e storie video con la REGIA (Scatti di G): le battute e le coperture le controlla la regia, con le stesse
  // regole che userà il montaggio. Il contenuto si tiene se la regia dà un video montabile della durata giusta.
  const battuteRegia = Array.isArray(c?.regia?.battute) ? c.regia.battute : [];
  if ((tipo === 'reel' || tipo === 'storia_video') && battuteRegia.length && progetto) {
    const tl = controllaRegia(c.regia, progetto, { R, formato: 'verticale' });
    if (!tl.video.length) {
      const motivi = tl.problemi.filter((p) => p.gravita === 'blocca').map((p) => p.messaggio).join(' ');
      problemi.push({ n, gravita: 'blocca', codice: 'regia_non_valida', messaggio: `Contenuto ${n} (${tipo}): la regia non si può montare. ${motivi} L'ho tolto.` });
      return { contenuto: null, problemi, avvisi };
    }
    for (const p of tl.problemi) avvisi.push(p.messaggio.replace(/[.\s]+$/, ''));
    const lim = LIMITI[tipo];
    if (tl.durata > lim.max + 1e-6) {
      problemi.push({ n, gravita: 'blocca', codice: 'troppo_lungo', messaggio: `Contenuto ${n} (${tipo}): la regia dura ${virgola(tl.durata)} s, il massimo è ${virgola(lim.max)}. L'ho tolto.` });
      return { contenuto: null, problemi, avvisi };
    }
    if (tl.durata < lim.min - 1e-6) {
      problemi.push({ n, gravita: 'blocca', codice: 'troppo_corto', messaggio: `Contenuto ${n} (${tipo}): la regia dura ${virgola(tl.durata)} s, ne servono almeno ${virgola(lim.min)}. L'ho tolto.` });
      return { contenuto: null, problemi, avvisi };
    }
    if (tipo === 'reel' && tl.durata > lim.consigliato) avvisi.push(`il reel dura ${Math.round(tl.durata)} s: sopra i ${lim.consigliato} s molti lo abbandonano`);
    return {
      contenuto: {
        ...base,
        motore: 'regia',
        regia: c.regia,
        durata: tl.durata,
        musica: Boolean(tl.musica?.usa),
        pezzi: [],
        foto: [],
        // i momenti e le foto usati davvero, per il controllo delle ripetizioni fra contenuti
        pezzi_usati: tl.video.filter((q) => q.tipo !== 'foto').map((q) => ({ scena: q.etichetta, video: q.fonte, inizio: q.inizio, fine: q.fine })),
        foto_usate: [...new Set(tl.video.filter((q) => q.tipo === 'foto').map((q) => q.fonte))],
      },
      problemi,
      avvisi,
    };
  }

  if (tipo === 'reel' || tipo === 'storia_video') {
    const pezzi = [];
    for (const p of Array.isArray(c.pezzi) ? c.pezzi : []) {
      if (pezzi.length >= LIMITI.pezziMax) {
        avvisi.push(`più di ${LIMITI.pezziMax} pezzi: tenuti i primi ${LIMITI.pezziMax}`);
        break;
      }
      const v = pezzoValido(p, idx, n, problemi, avvisi);
      if (v) pezzi.push(v);
    }
    if (!pezzi.length) {
      problemi.push({ n, gravita: 'blocca', codice: 'nessun_pezzo', messaggio: `Contenuto ${n} (${tipo}): nessun pezzo di video valido. L'ho tolto.` });
      return { contenuto: null, problemi, avvisi };
    }
    const lim = LIMITI[tipo];
    let durata = pezzi.reduce((s, p) => s + p.fine - p.inizio, 0);
    const intro = testo(c.intro).slice(0, LIMITI.intro);
    const outro = tipo === 'reel' ? testo(c.outro).slice(0, LIMITI.outro) : '';
    const durataOutro = outro ? 2.5 : 0;
    // troppo lungo: si accorcia l'ultimo pezzo (e se serve si tolgono gli ultimi)
    while (durata + durataOutro > lim.max && pezzi.length) {
      const ultimo = pezzi[pezzi.length - 1];
      const eccesso = durata + durataOutro - lim.max;
      if (ultimo.fine - ultimo.inizio - eccesso >= LIMITI.pezzoMin) {
        ultimo.fine = r2(ultimo.fine - eccesso);
        durata -= eccesso;
      } else {
        durata -= ultimo.fine - ultimo.inizio;
        pezzi.pop();
      }
      avvisi.push(`il montaggio superava ${lim.max} s: ho accorciato la fine`);
    }
    if (durata + durataOutro < lim.min) {
      problemi.push({ n, gravita: 'blocca', codice: 'troppo_corto', messaggio: `Contenuto ${n} (${tipo}): dura ${virgola(durata + durataOutro)} s, ne servono almeno ${virgola(lim.min)}. L'ho tolto.` });
      return { contenuto: null, problemi, avvisi };
    }
    if (tipo === 'reel' && durata > lim.consigliato) avvisi.push(`il reel dura ${Math.round(durata)} s: sopra i ${lim.consigliato} s molti lo abbandonano`);
    const parlato = pezzi.some((p) => {
      const v = idx.video.get(p.video);
      return Array.isArray(v.parlato) && v.parlato.some((s) => s.fine > p.inizio && s.inizio < p.fine);
    });
    return {
      contenuto: {
        ...base,
        pezzi,
        durata: r2(durata + durataOutro),
        intro,
        outro,
        sottotitoli: c.sottotitoli !== false && parlato,
        musica: c.musica === true,
        volume_musica: Number.isFinite(Number(c.volume_musica)) && c.volume_musica !== null && c.volume_musica !== '' ? Math.min(1, Math.max(0, Number(c.volume_musica))) : null,
      },
      problemi,
      avvisi,
    };
  }

  // contenuti di foto
  const visti = new Set();
  const foto = [];
  for (const f of Array.isArray(c.foto) ? c.foto : []) {
    const codice = testo(f).toUpperCase();
    if (!idx.foto.has(codice)) {
      problemi.push({ n, gravita: 'avviso', codice: 'foto_inesistente', messaggio: `Contenuto ${n}: la foto «${testo(f) || '?'}» non esiste nel materiale, l'ho tolta.` });
      continue;
    }
    if (visti.has(codice)) continue;
    visti.add(codice);
    const q = idx.qualita.get(codice) || [];
    if (q.length) avvisi.push(`la foto ${codice} ha un difetto (${q.join(', ')})`);
    foto.push(codice);
  }
  const quante = tipo === 'carosello' ? LIMITI.carosello : { min: 1, max: 1 };
  if (foto.length > quante.max) {
    avvisi.push(`${foto.length} foto per un ${tipo}: tenute le prime ${quante.max}`);
    foto.length = quante.max;
  }
  if (foto.length < quante.min) {
    problemi.push({ n, gravita: 'blocca', codice: 'foto_mancanti', messaggio: `Contenuto ${n} (${tipo}): servono almeno ${quante.min} foto valide, ce ne sono ${foto.length}. L'ho tolto.` });
    return { contenuto: null, problemi, avvisi };
  }
  return { contenuto: { ...base, foto, righe: righeValide(c.righe, n, avvisi) }, problemi, avvisi };
}

function sovrapposti(a, b) {
  return a.video === b.video && Math.min(a.fine, b.fine) - Math.max(a.inizio, b.inizio) > 0.5;
}

// Controlla tutto il piano. richiesta = {reel, post, storie} (facoltativa) per confrontare i numeri.
export function controllaPiano(piano, progetto, { mese = null, richiesta = null, oggi = null, R = REGOLE } = {}) {
  const idx = indice(progetto);
  const lista = Array.isArray(piano?.contenuti) ? piano.contenuti : Array.isArray(piano) ? piano : null;
  const problemi = [];
  if (!lista) {
    return { contenuti: [], problemi: [{ n: 0, gravita: 'blocca', codice: 'piano_vuoto', messaggio: 'Il piano non contiene la lista «contenuti».' }], bloccante: true, conti: {} };
  }
  if (mese !== null && !/^\d{4}-\d{2}$/.test(String(mese))) {
    return { contenuti: [], problemi: [{ n: 0, gravita: 'blocca', codice: 'mese_non_valido', messaggio: `Il mese «${mese}» non è valido: serve AAAA-MM.` }], bloccante: true, conti: {} };
  }
  const contenuti = [];
  lista.forEach((c, i) => {
    const n = i + 1;
    const r = controllaContenuto(c, n, idx, { mese, progetto, R });
    problemi.push(...r.problemi);
    if (r.avvisi.length) problemi.push({ n, gravita: 'avviso', codice: 'corretto', messaggio: `Contenuto ${n}: ${[...new Set(r.avvisi)].join('; ')}.` });
    if (r.contenuto) {
      // una data già passata finirebbe pubblicata in ritardo (o subito): il contenuto si toglie
      if (oggi && r.contenuto.data < String(oggi)) {
        problemi.push({ n, gravita: 'blocca', codice: 'data_passata', messaggio: `Contenuto ${n}: la data ${r.contenuto.data} è già passata (oggi è ${oggi}). L'ho tolto.` });
        return;
      }
      contenuti.push(r.contenuto);
    }
  });

  // ripetizioni fra contenuti diversi: lo stesso momento in due video, la stessa foto in due post
  const pezziVisti = [];
  const fotoViste = new Map();
  for (const c of contenuti) {
    for (const p of c.pezzi_usati || c.pezzi || []) {
      const prima = pezziVisti.find((x) => x.n !== c.n && sovrapposti(x.p, p));
      if (prima) problemi.push({ n: c.n, gravita: 'avviso', codice: 'ripetizione', messaggio: `Contenuto ${c.n}: il momento ${p.scena} (${p.inizio}–${p.fine} s) è già usato nel contenuto ${prima.n}.` });
      pezziVisti.push({ n: c.n, p });
    }
    for (const f of c.foto_usate || c.foto || []) {
      if (fotoViste.has(f)) problemi.push({ n: c.n, gravita: 'avviso', codice: 'ripetizione', messaggio: `Contenuto ${c.n}: la foto ${f} è già usata nel contenuto ${fotoViste.get(f)}.` });
      else fotoViste.set(f, c.n);
    }
  }
  // due contenuti dello stesso tipo nello stesso giorno e ora
  const slot = new Map();
  for (const c of contenuti) {
    const k = `${c.tipo.startsWith('storia') ? 'storia' : 'feed'} ${c.data} ${c.ora}`;
    if (slot.has(k)) problemi.push({ n: c.n, gravita: 'avviso', codice: 'stesso_orario', messaggio: `Contenuto ${c.n}: esce il ${c.data} alle ${c.ora} come il contenuto ${slot.get(k)}.` });
    else slot.set(k, c.n);
  }

  const conta = (f) => contenuti.filter(f).length;
  const conti = {
    reel: conta((c) => c.tipo === 'reel'),
    post: conta((c) => c.tipo === 'post' || c.tipo === 'carosello'),
    storie: conta((c) => c.tipo.startsWith('storia')),
    giorni: new Set(contenuti.map((c) => c.data)).size,
    scene_usate: new Set(contenuti.flatMap((c) => (c.pezzi || []).map((p) => p.scena))).size,
    scene_totali: idx.scene.size,
    foto_usate: fotoViste.size,
    foto_totali: idx.foto.size,
  };
  if (richiesta && typeof richiesta === 'object') {
    for (const [k, chiave] of [['reel', 'reel'], ['post', 'post'], ['storie', 'storie']]) {
      const voluti = Number(richiesta[k]);
      if (Number.isFinite(voluti) && voluti >= 0 && conti[chiave] !== voluti) {
        problemi.push({ n: 0, gravita: 'avviso', codice: 'numeri_diversi', messaggio: `Richiesti ${voluti} ${k}, nel piano ce ne sono ${conti[chiave]}.` });
      }
    }
  }
  contenuti.sort((a, b) => (a.data + a.ora).localeCompare(b.data + b.ora) || a.n - b.n);
  const bloccante = !contenuti.length || problemi.some((p) => p.gravita === 'blocca');
  return { contenuti, problemi, bloccante, conti };
}
