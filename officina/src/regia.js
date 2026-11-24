// La regia: dal piano di montaggio scritto da Claude (le scelte di SENSO: quale frase, quali immagini sopra) alla
// TIMELINE PIATTA che il render esegue (i CALCOLI: secondi esatti, tagli fra le parole, salti coperti).
// Le regole contro i «bolli» stanno qui, scritte una volta, e valgono per ogni video:
//   1. i tagli della voce e dell'intervista cadono fra una parola e l'altra, mai dentro una parola;
//   2. la voce fuori campo (e l'audio senza video) è sempre coperta da immagini;
//   3. un salto nell'intervista (stessa persona, due pezzi non di seguito) è sempre coperto da un'immagine;
//   4. nessuna inquadratura dura meno di MINIMA secondi (niente lampi);
//   5. un volto si vede solo in sincrono con la sua voce (mai labbra fuori sincrono);
//   6. lo stesso momento non si usa due volte; i momenti con difetti si segnalano.
// Questo modulo non tocca file: calcola. Il render (regia-render.js) legge SOLO la timeline che esce da qui.
import { etichetteQualita } from './catalogo.js';

export const REGOLE = {
  minima: 0.6, // durata minima di un'inquadratura (s)
  voltoMin: 1.0, // un volto stretto fra due coperture deve durare almeno tanto, se no resta coperto (s)
  coperturaMin: 1.0, // durata preferita minima di una copertura (s)
  coperturaMax: 4.0, // durata preferita massima di una copertura (s)
  fotoBase: 2.5, // durata di una foto se non c'è altro da dire (s)
  voltoPrima: 2.0, // la prima volta che si vede una persona: almeno tanto volto prima delle coperture (s)
  voltoPoi: 1.2, // le volte dopo (s)
  salto: 0.6, // la copertura su un salto dell'intervista sta tanto prima e tanto dopo il taglio (s)
  primaParola: 0.08, // margine prima della prima parola (s)
  dopoParola: 0.15, // margine dopo l'ultima parola (s)
  aggancio: 0.4, // un tempo di Claude a meno di tanto da una parola si aggancia alla parola (s)
  cartello: 3.0, // durata del cartello col nome (s)
  scritta: 2.5, // durata di una scritta se non è detta (s)
};

const r3 = (n) => Math.round(n * 1000) / 1000;
const virgola = (n) => Number(n).toFixed(1).replace('.', ',');
const testo = (v) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();

export function indiceRegia(progetto) {
  const materiali = new Map();
  const scene = new Map();
  for (const m of progetto.materiali) {
    materiali.set(m.codice, m);
    if (m.tipo === 'video') for (const s of m.scene) scene.set(s.codice, { video: m, scena: s });
  }
  return { materiali, scene, qualita: etichetteQualita(progetto.materiali) };
}

// Tutte le parole di un materiale, in ordine, con i tempi (dalle frasi con parole; senza, le frasi stesse divise in
// proporzione ai caratteri: meno precise, ma i tagli cadono comunque fra due parole).
export function paroleDi(m) {
  const out = [];
  for (const f of m?.parlato || []) {
    if (Array.isArray(f.parole) && f.parole.length) {
      for (const p of f.parole) out.push({ testo: p.testo, inizio: p.inizio, fine: p.fine, stimata: false });
      continue;
    }
    const pp = testo(f.testo).split(' ').filter(Boolean);
    const tot = pp.reduce((s, p) => s + p.length + 1, 0) || 1;
    let t = f.inizio;
    for (const p of pp) {
      const d = ((f.fine - f.inizio) * (p.length + 1)) / tot;
      out.push({ testo: p, inizio: r3(t), fine: r3(t + d), stimata: true });
      t += d;
    }
  }
  return out.sort((a, b) => a.inizio - b.inizio);
}

// Aggancia un pezzo [inizio, fine] di un materiale alle parole: dentro tutte le parole toccate, con un piccolo
// margine che non entra nella parola prima o dopo. Senza parole il pezzo resta com'è.
export function agganciaAlleParole(parole, inizio, fine, durata, R = REGOLE) {
  if (!parole.length) return { inizio, fine, agganciato: false };
  const dentro = parole.filter((p) => p.fine > inizio + 0.02 && p.inizio < fine - 0.02);
  if (!dentro.length) {
    // nessuna parola dentro: si aggancia alle più vicine se sono a portata, altrimenti si lascia
    return { inizio, fine, agganciato: false };
  }
  const i0 = dentro[0];
  const i1 = dentro[dentro.length - 1];
  // un tempo di Claude che cade appena prima di una parola intera la prende tutta, non la taglia
  const a = parole.indexOf(i0);
  const z = parole.indexOf(i1);
  const primaP = parole[a - 1];
  const dopoP = parole[z + 1];
  let nuovoInizio = i0.inizio - R.primaParola;
  if (primaP) nuovoInizio = Math.max(nuovoInizio, (primaP.fine + i0.inizio) / 2);
  let nuovoFine = i1.fine + R.dopoParola;
  if (dopoP) nuovoFine = Math.min(nuovoFine, (i1.fine + dopoP.inizio) / 2);
  nuovoInizio = Math.max(0, nuovoInizio);
  nuovoFine = Math.min(durata, nuovoFine);
  return { inizio: r3(nuovoInizio), fine: r3(nuovoFine), agganciato: true, prima: i0.testo, ultima: i1.testo, stimato: i0.stimata || i1.stimata };
}

// Dove sta il soggetto in un video da ritagliare (lo dice Claude guardando i provini): sinistra, centro, destra,
// oppure «intera» = non ritagliare (al centro con lo sfondo sfocato della stessa clip).
function posizioneValida(v) {
  const p = testo(v).toLowerCase();
  return ['sinistra', 'centro', 'destra', 'intera'].includes(p) ? p : undefined;
}

// Una copertura del piano → pezzo disponibile {fonte, tipo, ci, cf, max} (cf = dove finirebbe da sola, max = fino a dove
// si può allungare). null se non esiste.
function coperturaDisponibile(c, idx) {
  const codice = testo(typeof c === 'string' ? c : c?.scena ?? c?.foto ?? c?.codice).toUpperCase();
  if (/^F\d+$/.test(codice) && idx.materiali.get(codice)?.tipo === 'foto') {
    return { fonte: codice, tipo: 'foto', ci: 0, cf: Number(c?.durata) > 0 ? Number(c.durata) : REGOLE.fotoBase, max: 8, etichetta: codice };
  }
  let voce = idx.scene.get(codice);
  if (!voce) {
    const v = idx.materiali.get(codice);
    if (v?.tipo === 'video' && v.scene.length) voce = { video: v, scena: v.scene[0] };
  }
  if (!voce) return null;
  const { video, scena } = voce;
  let ci = Number.isFinite(Number(c?.inizio)) && c?.inizio !== null && c?.inizio !== '' ? Number(c.inizio) : scena.inizio;
  let cf = Number.isFinite(Number(c?.fine)) && c?.fine !== null && c?.fine !== '' ? Number(c.fine) : scena.fine;
  ci = Math.max(0, Math.min(ci, video.durata - 0.3));
  cf = Math.min(video.durata, Math.max(cf, ci + 0.3));
  return { fonte: video.codice, tipo: 'copertura', ci, cf, max: video.durata, etichetta: scena.codice, posizione: posizioneValida(c?.posizione) };
}

// Riempie `durata` secondi con le coperture date, in ordine: ognuna fra coperturaMin e coperturaMax se può, poi si
// allungano quelle che hanno ancora materiale. Restituisce i pezzi e quanto manca (se le coperture non bastano).
export function riempiConCoperture(coperture, durata, R = REGOLE) {
  if (durata <= 0 || !coperture.length) return { pezzi: [], manca: Math.max(0, durata) };
  let usate = coperture.slice(0, Math.max(1, Math.floor(durata / R.minima)));
  // troppe coperture per il tempo: si tengono le prime, ognuna almeno coperturaMin (o minima se il tempo è poco)
  const minimo = Math.min(R.coperturaMin, durata);
  if (usate.length * minimo > durata) usate = usate.slice(0, Math.max(1, Math.floor(durata / minimo)));
  const n = usate.length;
  const lunghezze = usate.map((c) => Math.min(c.cf - c.ci, Math.max(minimo, Math.min(R.coperturaMax, durata / n))));
  let somma = lunghezze.reduce((a, b) => a + b, 0);
  // troppo lungo: si accorcia l'ultima, poi le altre (mai sotto minima)
  for (let k = n - 1; k >= 0 && somma > durata + 1e-6; k--) {
    const taglio = Math.min(somma - durata, lunghezze[k] - R.minima);
    if (taglio > 0) { lunghezze[k] -= taglio; somma -= taglio; }
  }
  // troppo corto: si allungano, a turno, prima dentro la propria scena e poi fino alla fine della clip
  for (const limite of ['cf', 'max']) {
    let giro = 0;
    while (somma < durata - 1e-6 && giro < 50) {
      giro++;
      let allungato = false;
      for (let k = 0; k < n && somma < durata - 1e-6; k++) {
        const c = usate[k];
        const fino = limite === 'cf' ? c.cf : c.max;
        const spazio = c.tipo === 'foto' ? (limite === 'cf' ? Math.max(0, R.coperturaMax - lunghezze[k]) : Math.max(0, c.max - lunghezze[k])) : fino - (c.ci + lunghezze[k]);
        const aggiunta = Math.min(spazio, durata - somma, limite === 'cf' ? R.coperturaMax : Infinity);
        if (aggiunta > 1e-6) { lunghezze[k] += aggiunta; somma += aggiunta; allungato = true; }
      }
      if (!allungato) break;
    }
  }
  const pezzi = usate.map((c, k) => ({ fonte: c.fonte, tipo: c.tipo, inizio: r3(c.ci), fine: r3(c.ci + lunghezze[k]), etichetta: c.etichetta, durata: lunghezze[k], ...(c.posizione ? { posizione: c.posizione } : {}) }));
  return { pezzi, manca: Math.max(0, r3(durata - somma)) };
}

// Mette in fila i pezzi da `da`, restituendo inquadrature con da/a sulla timeline.
function inFila(pezzi, da) {
  let t = da;
  return pezzi.map((p) => {
    const q = { fonte: p.fonte, tipo: p.tipo, inizio: p.inizio, fine: p.fine, da: r3(t), a: r3(t + p.durata), etichetta: p.etichetta, ...(p.posizione ? { posizione: p.posizione } : {}) };
    t += p.durata;
    return q;
  });
}

export function controllaRegia(piano, progetto, { sceneggiatura = null, formato = null, R = REGOLE } = {}) {
  const idx = indiceRegia(progetto);
  const problemi = [];
  const blocca = (n, codice, messaggio) => problemi.push({ n, gravita: 'blocca', codice, messaggio });
  const avviso = (n, codice, messaggio) => problemi.push({ n, gravita: 'avviso', codice, messaggio });
  const battuteIn = Array.isArray(piano?.battute) ? piano.battute : [];
  if (!battuteIn.length) blocca(0, 'piano_vuoto', 'Il piano di regia non ha nessuna battuta.');
  const riserva = (Array.isArray(piano?.coperture_riserva) ? piano.coperture_riserva : []).map((c) => coperturaDisponibile(c, idx)).filter(Boolean);
  const durataMax = Number(piano?.durata_max ?? sceneggiatura?.durata_max) > 0 ? Number(piano?.durata_max ?? sceneggiatura?.durata_max) : null;

  // 1) battute: fonte, tempi agganciati alle parole, posto sulla timeline
  const battute = [];
  let t = 0;
  battuteIn.forEach((b, i) => {
    const n = i + 1;
    const coperture = (Array.isArray(b?.coperture) ? b.coperture : []).map((c) => {
      const d = coperturaDisponibile(c, idx);
      if (!d) avviso(n, 'copertura_inesistente', `Battuta ${n}: la copertura «${testo(c?.scena ?? c)}» non esiste nel materiale, l'ho tolta.`);
      return d;
    }).filter(Boolean);
    const soloImmagini = !b?.fonte && Number(b?.immagini) > 0;
    if (soloImmagini) {
      const durata = Math.min(30, Math.max(1, Number(b.immagini)));
      if (!coperture.length) { blocca(n, 'immagini_senza_coperture', `Battuta ${n}: solo immagini, ma nessuna copertura valida. L'ho tolta.`); return; }
      battute.push({ n, tipo: 'immagini', fonte: null, inizio: 0, fine: durata, durata, da: r3(t), a: r3(t + durata), volto: false, coperture, scritta: testo(b.scritta) });
      t += durata;
      return;
    }
    const codice = testo(b?.fonte).toUpperCase();
    const m = idx.materiali.get(codice);
    if (!m || (m.tipo !== 'audio' && m.tipo !== 'video')) { blocca(n, 'fonte_inesistente', `Battuta ${n}: la fonte «${testo(b?.fonte) || '?'}» non è un audio o un video del progetto. L'ho tolta.`); return; }
    if (m.tipo === 'video' && m.audio === false) { blocca(n, 'fonte_senza_audio', `Battuta ${n}: il video ${codice} non ha audio, non può fare da voce. L'ho tolta.`); return; }
    let inizio = Number(b.inizio);
    let fine = Number(b.fine);
    if (!Number.isFinite(inizio)) inizio = 0;
    if (!Number.isFinite(fine)) fine = m.durata;
    inizio = Math.max(0, Math.min(inizio, m.durata));
    fine = Math.min(m.durata, Math.max(fine, inizio));
    if (fine - inizio < 0.3) { blocca(n, 'battuta_troppo_corta', `Battuta ${n}: dura meno di 0,3 s. L'ho tolta.`); return; }
    const parole = paroleDi(m);
    const ag = agganciaAlleParole(parole, inizio, fine, m.durata, R);
    if (parole.length && !ag.agganciato) avviso(n, 'senza_parole', `Battuta ${n}: nel pezzo ${codice} ${virgola(inizio)}–${virgola(fine)} s non si sente nessuna parola.`);
    if (ag.stimato) avviso(n, 'tempi_stimati', `Battuta ${n}: i tempi delle parole di ${codice} sono stimati (manca l'allineamento di whisper): il taglio può essere impreciso.`);
    const durata = ag.fine - ag.inizio;
    const volto = m.tipo === 'video' && b.volto !== false;
    if (!volto && !coperture.length && !riserva.length) {
      // voce senza volto e senza nessuna immagine da mettere sopra: resterebbe un buco (o il volto di prima sopra un'altra voce)
      blocca(n, 'voce_scoperta', `Battuta ${n}: la voce di ${codice} non mostra un volto e non ha nessuna copertura valida (né di riserva). L'ho tolta.`);
      return;
    }
    battute.push({
      n, tipo: b.tipo === 'voce' || m.tipo === 'audio' ? 'voce' : 'intervista', fonte: codice, inizio: ag.inizio, fine: ag.fine, durata,
      da: r3(t), a: r3(t + durata), volto, coperture, nome: testo(b.nome), ruolo: testo(b.ruolo), scritta: testo(b.scritta), posizione: posizioneValida(b.posizione_volto),
      prima: ag.prima, ultima: ag.ultima,
    });
    t += durata;
  });

  // durata massima: si tolgono le ultime battute intere (mai a metà parola)
  if (durataMax) {
    while (battute.length > 1 && battute[battute.length - 1].a > durataMax + 0.5) {
      const via = battute.pop();
      avviso(via.n, 'oltre_durata', `Battuta ${via.n}: il video superava ${virgola(durataMax)} s, l'ho tolta (le battute non si tagliano a metà).`);
    }
    if (battute.length && battute[battute.length - 1].a > durataMax + 0.5) avviso(0, 'oltre_durata', `Il video dura ${virgola(battute[battute.length - 1].a)} s, oltre i ${virgola(durataMax)} s chiesti: la prima battuta da sola è più lunga.`);
  }
  // la stessa frase due volte: due battute dello stesso file che si sovrappongono
  for (let i = 0; i < battute.length; i++) {
    for (let k = 0; k < i; k++) {
      const a = battute[i];
      const b = battute[k];
      if (a.fonte && a.fonte === b.fonte && Math.min(a.fine, b.fine) - Math.max(a.inizio, b.inizio) > 0.3) {
        avviso(a.n, 'parole_ripetute', `Le battute ${b.n} e ${a.n} usano lo stesso pezzo di ${a.fonte} (${virgola(Math.max(a.inizio, b.inizio))}–${virgola(Math.min(a.fine, b.fine))} s): quelle parole si sentono due volte.`);
      }
    }
  }
  const durataTot = battute.length ? battute[battute.length - 1].a : 0;

  // 2) inquadrature di ogni battuta
  const visti = new Set();
  let video = [];
  for (const b of battute) {
    if (!b.volto) {
      if (!b.coperture.length) avviso(b.n, 'coperture_dalla_riserva', `Battuta ${b.n}: senza coperture sue, ho usato quelle di riserva.`);
      // giro 1: le coperture della battuta (o la riserva); giro 2: la riserva; poi si ripetono tutte. Ogni pezzo resta
      // dentro la sua clip: se il materiale è corto si ripete un'immagine, mai si allunga oltre la fine della clip.
      const giri = [b.coperture.length ? b.coperture : riserva];
      if (b.coperture.length && riserva.length) giri.push(riserva);
      const tutte = [...b.coperture, ...riserva];
      let resto = b.durata;
      let da = b.da;
      let ripetuto = false;
      for (let g = 0; resto > 1e-3 && g < 40; g++) {
        const lista = g < giri.length ? giri[g] : tutte;
        if (g >= giri.length) ripetuto = true;
        const r = riempiConCoperture(lista, resto, R);
        const fatto = resto - r.manca;
        if (!r.pezzi.length || fatto <= 1e-6) break;
        video.push(...inFila(r.pezzi, da));
        da += fatto;
        resto = r.manca;
      }
      if (ripetuto) avviso(b.n, 'coperture_corte', `Battuta ${b.n}: le coperture non bastavano per ${virgola(b.durata)} s, ho ripetuto delle immagini.`);
      if (resto > 1e-3) blocca(b.n, 'coperture_insufficienti', `Battuta ${b.n}: non sono riuscito a coprire ${virgola(resto)} s di voce.`);
      continue;
    }
    // la stessa persona = lo stesso video o lo stesso nome: la seconda volta basta meno volto prima delle coperture
    const primaVolta = !visti.has(b.fonte) && !(b.nome && visti.has(b.nome));
    visti.add(b.fonte);
    if (b.nome) visti.add(b.nome);
    const lead = Math.min(b.durata, primaVolta ? R.voltoPrima : R.voltoPoi);
    const voltoIntero = { fonte: b.fonte, tipo: 'volto', inizio: b.inizio, fine: b.fine, da: b.da, a: b.a, battuta: b.n, ...(b.posizione ? { posizione: b.posizione } : {}) };
    if (!b.coperture.length || b.durata - lead < R.coperturaMin) {
      video.push(voltoIntero);
      continue;
    }
    const r = riempiConCoperture(b.coperture, b.durata - lead, R);
    const coperte = inFila(r.pezzi, b.da + lead);
    const fineCoperture = coperte.length ? coperte[coperte.length - 1].a : b.da + lead;
    video.push({ ...voltoIntero, fine: r3(b.inizio + lead), a: r3(b.da + lead) });
    video.push(...coperte);
    const restoVolto = b.a - fineCoperture;
    const ultimaC = coperte[coperte.length - 1];
    if (restoVolto > 1e-3 && restoVolto < R.voltoMin && ultimaC && ultimaC.tipo !== 'foto' && ultimaC.fine + restoVolto <= (idx.materiali.get(ultimaC.fonte)?.durata ?? 0)) {
      // resto troppo corto per un volto: l'ultima copertura arriva fino in fondo (dentro la sua clip)
      ultimaC.a = r3(b.a);
      ultimaC.fine = r3(ultimaC.fine + restoVolto);
    } else if (restoVolto > 1e-3) {
      // le coperture finiscono prima della battuta: si torna sul volto, in sincrono
      video.push({ ...voltoIntero, inizio: r3(b.inizio + (fineCoperture - b.da)), da: r3(fineCoperture) });
    }
  }

  // 3) salti dell'intervista: stessa persona, due pezzi non di seguito, volto prima e dopo il taglio → copertura sopra
  const usaRiserva = [...riserva];
  let saltiCoperti = 0;
  let saltiScoperti = 0;
  for (let i = 0; i + 1 < battute.length; i++) {
    const A = battute[i];
    const B = battute[i + 1];
    if (A.fonte !== B.fonte || !A.volto || !B.volto || Math.abs(A.fine - B.inizio) < 0.05) continue;
    const T = A.a;
    const prima = video.find((q) => q.da < T - 1e-6 && q.a >= T - 1e-6);
    const dopo = video.find((q) => q.da <= T + 1e-6 && q.a > T + 1e-6);
    if (!prima || !dopo || prima.tipo !== 'volto' || dopo.tipo !== 'volto') continue; // già coperto da una copertura
    const candidata = B.coperture.find((c) => !video.some((q) => q.fonte === c.fonte && q.etichetta === c.etichetta)) || A.coperture.find((c) => !video.some((q) => q.fonte === c.fonte && q.etichetta === c.etichetta)) || usaRiserva.shift() || null;
    if (!candidata) {
      saltiScoperti++;
      avviso(B.n, 'taglio_scoperto', `Fra la battuta ${A.n} e la ${B.n} c'è un salto nell'intervista di ${A.fonte} e non avevo una copertura da metterci sopra: si vedrà il salto.`);
      continue;
    }
    let da = Math.max(prima.da, T - R.salto);
    let a = Math.min(dopo.a, T + R.salto);
    if (da - prima.da < R.minima) da = prima.da;
    if (dopo.a - a < R.minima) a = dopo.a;
    const r = riempiConCoperture([candidata], a - da, R);
    const nuove = inFila(r.pezzi, da);
    if (r.manca > 0.01 && nuove.length) nuove[nuove.length - 1].a = r3(a);
    const resto = [];
    for (const q of video) {
      if (q !== prima && q !== dopo) { resto.push(q); continue; }
      if (q === prima && da - q.da > 1e-6) resto.push({ ...q, a: r3(da), fine: r3(q.inizio + (da - q.da)) });
      if (q === prima) resto.push(...nuove);
      if (q === dopo && q.a - a > 1e-6) resto.push({ ...q, da: r3(a), inizio: r3(q.inizio + (a - q.da)) });
    }
    video = resto;
    saltiCoperti++;
  }

  // 4) niente lampi: un'inquadratura più corta di minima si dà alla vicina (mai un volto fuori dalla sua battuta)
  video.sort((x, y) => x.da - y.da);
  for (let giro = 0; giro < 3; giro++) {
    for (let i = 0; i < video.length; i++) {
      const q = video[i];
      const prima = video[i - 1];
      const dopo = video[i + 1];
      // un volto breve stretto fra due coperture è un lampo anche sopra la durata minima
      const voltoStretto = q.tipo === 'volto' && prima && dopo && prima.tipo !== 'volto' && dopo.tipo !== 'volto' && q.a - q.da < R.voltoMin - 1e-6;
      if (q.a - q.da >= R.minima - 1e-6 && !voltoStretto) continue;
      const allungabile = (x, verso) => x && x.tipo !== 'volto' && (x.tipo === 'foto' || (verso > 0 ? x.fine + (q.a - q.da) <= (idx.materiali.get(x.fonte)?.durata ?? 0) : x.inizio - (q.a - q.da) >= 0));
      if (allungabile(prima, 1)) {
        prima.a = q.a;
        if (prima.tipo !== 'foto') prima.fine = r3(prima.fine + (q.a - q.da));
        video.splice(i, 1);
        i--;
      } else if (allungabile(dopo, -1)) {
        dopo.da = q.da;
        if (dopo.tipo !== 'foto') dopo.inizio = r3(dopo.inizio - (q.a - q.da));
        video.splice(i, 1);
        i--;
      } else if (q.tipo === 'volto' && prima?.tipo === 'volto' && prima.fonte === q.fonte && Math.abs(prima.fine - q.inizio) < 0.05) {
        prima.a = q.a;
        prima.fine = q.fine;
        video.splice(i, 1);
        i--;
      }
    }
  }
  // inquadrature dello stesso pezzo, una dopo l'altra e di seguito: una sola
  const unite = [];
  for (const q of video) {
    const u = unite[unite.length - 1];
    if (u && u.fonte === q.fonte && u.tipo === q.tipo && q.tipo !== 'foto' && Math.abs(u.a - q.da) < 1e-3 && Math.abs(u.fine - q.inizio) < 0.05) {
      u.a = q.a;
      u.fine = q.fine;
    } else unite.push({ ...q });
  }
  video = unite.map((q) => ({ ...q, da: r3(q.da), a: r3(q.a) }));
  const lampi = video.filter((q) => q.a - q.da < R.minima - 1e-3);
  for (const q of lampi) avviso(0, 'inquadratura_corta', `Un'inquadratura di ${q.etichetta || q.fonte} a ${virgola(q.da)} s dura ${virgola(q.a - q.da)} s: troppo poco, ma non avevo altro da allungare.`);

  // 5) ripetizioni e difetti dei momenti usati
  const coperture = video.filter((q) => q.tipo === 'copertura');
  for (let i = 0; i < coperture.length; i++) {
    for (let k = 0; k < i; k++) {
      const a = coperture[i];
      const b = coperture[k];
      if (a.fonte === b.fonte && Math.min(a.fine, b.fine) - Math.max(a.inizio, b.inizio) > 0.3) {
        avviso(0, 'ripetizione', `Lo stesso momento di ${a.fonte} (${virgola(Math.max(a.inizio, b.inizio))} s) si vede due volte, a ${virgola(b.da)} s e a ${virgola(a.da)} s.`);
        break;
      }
    }
  }
  for (const q of video) {
    const et = idx.qualita.get(q.etichetta) || [];
    if (q.tipo !== 'volto' && et.length) avviso(0, 'difetto', `La copertura ${q.etichetta} a ${virgola(q.da)} s ha un difetto (${et.join(', ')}).`);
  }

  // 6) audio, parole per i sottotitoli, cartelli col nome, scritte
  const audio = battute.map((b) => (b.fonte ? { fonte: b.fonte, inizio: b.inizio, fine: b.fine, da: b.da, a: b.a } : { fonte: null, inizio: 0, fine: b.durata, da: b.da, a: b.a }));
  const parole = [];
  for (const b of battute) {
    if (!b.fonte) continue;
    for (const p of paroleDi(idx.materiali.get(b.fonte))) {
      const mezzo = (p.inizio + p.fine) / 2;
      if (mezzo < b.inizio || mezzo > b.fine) continue;
      parole.push({ testo: p.testo, da: r3(b.da + Math.max(0, p.inizio - b.inizio)), a: r3(b.da + Math.min(b.durata, p.fine - b.inizio)), battuta: b.n });
    }
  }
  const cartelli = [];
  const presentati = new Set();
  for (const q of video) {
    if (q.tipo !== 'volto') continue;
    const b = battute.find((x) => x.n === q.battuta);
    if (!b?.nome || presentati.has(b.nome) || q.a - q.da < 1.5) continue;
    presentati.add(b.nome);
    cartelli.push({ tipo: 'nome', testo: b.nome, sotto: b.ruolo, da: r3(q.da + 0.3), a: r3(Math.min(q.a, q.da + 0.3 + R.cartello)) });
  }
  const scritte = [];
  const corto = (v, n, cosa) => {
    const x = testo(v);
    if (x.length <= n) return x;
    avviso(0, 'testo_lungo', `${cosa} «${x.slice(0, 30)}…» era lungo ${x.length} caratteri: l'ho accorciato a ${n}.`);
    return `${x.slice(0, n - 1).trimEnd()}…`;
  };
  const titolo = testo(piano?.titolo ?? '');
  if (titolo && durataTot > 0) scritte.push({ tipo: 'titolo', testo: corto(titolo, 40, 'Il titolo'), da: 0, a: r3(Math.min(durataTot, R.scritta)) });
  const daMettere = [];
  for (const b of battute) if (b.scritta) daMettere.push({ testo: b.scritta, da: b.da + 0.2, durata: R.scritta });
  for (const s of Array.isArray(piano?.scritte) ? piano.scritte : []) {
    const b = battute.find((x) => x.n === Number(s?.battuta));
    if (!b || !testo(s?.testo)) { avviso(0, 'scritta_senza_battuta', `La scritta «${testo(s?.testo).slice(0, 40)}» non dice a quale battuta va: l'ho tolta.`); continue; }
    daMettere.push({ testo: s.testo, da: b.da + 0.2, durata: Number(s.durata) > 0 ? Math.min(8, Number(s.durata)) : R.scritta });
  }
  // due scritte nello stesso momento (o sopra il titolo) andrebbero una sopra l'altra: la seconda aspetta la prima
  let liberoDa = scritte.length ? scritte[0].a : 0;
  for (const x of daMettere.sort((p, q) => p.da - q.da)) {
    const da = Math.max(x.da, liberoDa);
    if (da >= durataTot - 0.5) { avviso(0, 'scritta_senza_spazio', `La scritta «${testo(x.testo).slice(0, 40)}» non trova spazio prima della fine: l'ho tolta.`); continue; }
    const a = Math.min(durataTot, da + x.durata);
    scritte.push({ tipo: 'scritta', testo: corto(x.testo, 48, 'La scritta'), da: r3(da), a: r3(a) });
    liberoDa = a;
  }
  const chiusura = testo(piano?.chiusura ?? sceneggiatura?.chiusura ?? '');
  if (chiusura && durataTot > 1) scritte.push({ tipo: 'chiusura', testo: corto(chiusura, 40, 'La chiusura'), da: r3(Math.max(0, durataTot - R.scritta)), a: r3(durataTot) });

  // controllo finale: nessun buco, nessun pezzo oltre la sua clip, ogni pezzo lungo quanto il suo posto, volti in sincrono
  let tt = 0;
  const audioDi = (q) => audio.find((x) => x.fonte === q.fonte && x.da <= q.da + 0.002 && x.a >= q.a - 0.002);
  for (const q of video) {
    const m = idx.materiali.get(q.fonte);
    const errori = [];
    if (Math.abs(q.da - tt) > 0.002) errori.push(`buco o sovrapposizione a ${virgola(tt)} s`);
    if (q.tipo !== 'foto') {
      if (Math.abs((q.fine - q.inizio) - (q.a - q.da)) > 0.002) errori.push('pezzo lungo diverso dal suo posto');
      if (q.inizio < -0.001 || q.fine > (m?.durata ?? 0) + 0.01) errori.push('pezzo fuori dalla clip');
    }
    if (q.tipo === 'volto') {
      const a = audioDi(q);
      if (!a || Math.abs((q.inizio - a.inizio) - (q.da - a.da)) > 0.002) errori.push('volto fuori sincrono');
    }
    if (errori.length) blocca(0, 'timeline_incoerente', `Inquadratura ${q.etichetta || q.fonte} a ${virgola(q.da)} s: ${errori.join(', ')}. È un errore della regia: non monto.`);
    tt = q.a;
  }
  if (video.length && Math.abs(tt - durataTot) > 0.002) blocca(0, 'timeline_incoerente', `Le immagini finiscono a ${virgola(tt)} s, le voci a ${virgola(durataTot)} s. È un errore della regia: non monto.`);
  const incoerente = problemi.some((p) => p.codice === 'timeline_incoerente');

  const usaMusica = piano?.musica === true || (piano?.musica === undefined && sceneggiatura?.musica?.usa === true);
  const volume = Number.isFinite(Number(piano?.volume_musica)) && piano?.volume_musica !== null ? Math.min(1, Math.max(0, Number(piano.volume_musica))) : 0.3;
  const bloccante = !battute.length || problemi.some((p) => p.gravita === 'blocca');
  return {
    durata: r3(durataTot),
    formato: formato || sceneggiatura?.formato || 'verticale',
    audio,
    video: incoerente ? [] : video,
    parole,
    cartelli,
    scritte,
    musica: { usa: usaMusica, volume, ...(testo(piano?.musica_fonte) ? { fonte: testo(piano.musica_fonte).toUpperCase() } : {}) },
    problemi,
    bloccante,
    conti: {
      battute: battute.length,
      inquadrature: video.length,
      coperture: coperture.length,
      volti: video.filter((q) => q.tipo === 'volto').length,
      foto: video.filter((q) => q.tipo === 'foto').length,
      tagli_coperti: saltiCoperti,
      tagli_scoperti: saltiScoperti,
      parole: parole.length,
    },
  };
}
