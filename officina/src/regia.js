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

// Le regole con il ritmo dello stile (es. Scatti di G: inquadrature più lunghe, «mai di fretta»). Si accettano solo
// numeri positivi e solo le chiavi che esistono; minima resta fra 0,4 e 2 secondi, i massimi mai sotto i minimi.
export function regoleDelloStile(stile) {
  const R = { ...REGOLE };
  for (const [k, v] of Object.entries(stile?.ritmo || {})) if (k in REGOLE && Number.isFinite(Number(v)) && Number(v) > 0) R[k] = Number(v);
  R.minima = Math.min(2, Math.max(0.4, R.minima));
  R.voltoMin = Math.max(R.voltoMin, R.minima);
  R.coperturaMin = Math.max(R.coperturaMin, R.minima);
  R.coperturaMax = Math.max(R.coperturaMax, R.coperturaMin);
  return R;
}

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
function coperturaDisponibile(c, idx, R = REGOLE) {
  // il codice è il primo campo non vuoto fra scena, foto e codice (lo schema di Claude manda anche stringhe vuote);
  // in una stringa può seguire la posizione del soggetto dopo uno spazio: «V07.2 sinistra»
  const grezzo = typeof c === 'string' ? c : [c?.scena, c?.foto, c?.codice].find((x) => testo(x));
  const [primo, dopo] = testo(grezzo).split(/\s+/);
  const codice = testo(primo).toUpperCase();
  const posizioneScritta = typeof c === 'string' ? posizioneValida(dopo) : posizioneValida(c?.posizione);
  if (/^F\d+$/.test(codice) && idx.materiali.get(codice)?.tipo === 'foto') {
    return { fonte: codice, tipo: 'foto', ci: 0, cf: Number(c?.durata) > 0 ? Number(c.durata) : R.fotoBase, max: Math.max(8, R.coperturaMax), etichetta: codice };
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
  return { fonte: video.codice, tipo: 'copertura', ci, cf, max: video.durata, etichetta: scena.codice, posizione: posizioneScritta };
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

// Dentro una battuta nessun pezzo resta sotto la durata minima: un avanzo corto non diventa mai un pezzo nuovo.
// Prima si dà il suo tempo a un vicino che ha ancora materiale nella sua clip; se nessuno ne ha, il pezzo corto
// cresce fino alla minima togliendo tempo al vicino (che resta sopra la minima). La durata totale non cambia mai.
export function senzaPezziCorti(pezzi, durataClip, R = REGOLE) {
  const lista = pezzi.map((p) => ({ ...p }));
  const spazioDopo = (p) => (p.tipo === 'foto' ? 8 - p.durata : durataClip(p.fonte) - p.fine);
  const spazioPrima = (p) => (p.tipo === 'foto' ? 8 - p.durata : p.inizio);
  const allunga = (p, d, verso) => {
    p.durata += d;
    if (p.tipo === 'foto') { p.fine += d; return; }
    if (verso > 0) p.fine += d;
    else p.inizio -= d;
  };
  for (let giro = 0; giro < lista.length * 3 && lista.length > 1; giro++) {
    const i = lista.findIndex((p) => p.durata < R.minima - 1e-6);
    if (i < 0) break;
    const q = lista[i];
    const prima = lista[i - 1];
    const dopo = lista[i + 1];
    // 1) il vicino si allunga dentro la sua clip e il pezzo corto sparisce
    if (prima && spazioDopo(prima) >= q.durata - 1e-6) { allunga(prima, q.durata, 1); lista.splice(i, 1); continue; }
    if (dopo && spazioPrima(dopo) >= q.durata - 1e-6) { allunga(dopo, q.durata, -1); lista.splice(i, 1); continue; }
    // 2) il pezzo corto cresce fino alla minima, prendendo tempo a un vicino che resta sopra la minima
    const manca = R.minima - q.durata;
    const donatore = [prima, dopo].find((x) => x && x.durata - manca >= R.minima - 1e-6);
    const cresce = spazioDopo(q) >= manca - 1e-6 ? 1 : spazioPrima(q) >= manca - 1e-6 ? -1 : 0;
    if (donatore && cresce) {
      donatore.durata -= manca;
      if (donatore.tipo === 'foto' || donatore === prima) donatore.fine -= manca;
      else donatore.inizio += manca;
      allunga(q, manca, cresce);
      continue;
    }
    // 3) nessun vicino da solo ha abbastanza tempo (succede con clip corte ripetute e una minima lunga, es. clip da
    // 1,5 s e minima 1 s): il tempo che manca si prende un poco da ciascuno dei pezzi della battuta, dai più vicini,
    // senza che nessuno scenda sotto la minima. Un pezzo si accorcia togliendo dalla fine: resta dentro la sua clip.
    if (cresce) {
      const ordine = lista.map((x, k) => ({ x, k })).filter((o) => o.k !== i).sort((a, b) => Math.abs(a.k - i) - Math.abs(b.k - i) || a.k - b.k);
      const libero = ordine.reduce((t, o) => t + Math.max(0, o.x.durata - R.minima), 0);
      if (libero >= manca - 1e-6) {
        let resto = manca;
        for (const { x } of ordine) {
          if (resto <= 1e-9) break;
          const d = Math.min(resto, Math.max(0, x.durata - R.minima));
          if (d <= 1e-9) continue;
          x.durata -= d;
          x.fine -= d;
          resto -= d;
        }
        allunga(q, manca, cresce);
        continue;
      }
    }
    // 4) niente da fare senza uscire dalle clip (clip più corte di due volte la minima e battuta senza tempo da
    // dare): il pezzo corto resta, e il controllo dei lampi più avanti lo segnala con l'avviso «inquadratura_corta»
    break;
  }
  return lista.map((p) => ({ ...p, inizio: r3(p.inizio), fine: r3(p.fine) }));
}

// La stessa scena subito dopo sé stessa, ricominciata da capo, è un salto visibile. I pezzi si mettono in un ordine
// in cui la scena cambia ogni volta che si può; quando non si può: se la clip ha ancora materiale dopo il pezzo di
// prima si continua da lì (nessun taglio), altrimenti si usa una copertura di riserva della stessa durata.
export function evitaStessaDiFila(pezzi, ultimo, durataClip, riserva = [], R = REGOLE) {
  const restanti = pezzi.map((p) => ({ ...p }));
  const uguale = (a, b) => a && b && b.tipo !== 'volto' && a.tipo === b.tipo && a.etichetta === b.etichetta && a.fonte === b.fonte;
  const out = [];
  let prima = ultimo;
  while (restanti.length) {
    let k = restanti.findIndex((p) => !uguale(prima, p));
    if (k < 0) k = 0;
    let q = restanti.splice(k, 1)[0];
    if (uguale(prima, q) && (q.tipo === 'foto' || Math.abs(prima.fine - q.inizio) >= 0.01)) {
      if (q.tipo !== 'foto' && durataClip(q.fonte) - prima.fine >= q.durata - 1e-6) {
        q.inizio = r3(prima.fine);
        q.fine = r3(prima.fine + q.durata);
      } else {
        let fatto = false;
        const alt = riserva.find((c) => c.etichetta !== q.etichetta && (c.tipo === 'foto' || c.max - c.ci >= q.durata - 1e-6));
        if (alt) {
          const r = riempiConCoperture([alt], q.durata, R);
          if (r.manca <= 1e-6 && r.pezzi.length === 1) { q = r.pezzi[0]; fatto = true; }
        }
        // nessuna alternativa lunga quanto tutto il pezzo: un'altra scena ne prende la prima parte e la scena di prima
        // torna solo dopo (succede con inquadrature lunghe, es. il ritmo lento di Scatti di G). Tutti e due i pezzi
        // restano sopra la minima, la durata totale non cambia.
        if (!fatto && q.durata >= 2 * R.minima - 1e-6) {
          for (const c of riserva) {
            if (c.etichetta === q.etichetta) continue;
            const disponibile = c.tipo === 'foto' ? Math.max(8, R.coperturaMax) : c.max - c.ci;
            const L1 = Math.min(disponibile, q.durata - R.minima, Math.max(q.durata / 2, R.minima));
            if (L1 < R.minima - 1e-6) continue;
            const r = riempiConCoperture([c], L1, R);
            if (r.manca > 1e-6 || r.pezzi.length !== 1) continue;
            out.push(r.pezzi[0]);
            // la durata NON si arrotonda: la somma dei pezzi della battuta deve restare esatta (niente millesimi di buco)
            const resto = q.durata - r.pezzi[0].durata;
            q = { ...q, durata: resto, fine: r3(q.inizio + resto) };
            break;
          }
        }
      }
    }
    out.push(q);
    prima = q;
  }
  return out;
}

// Mette in fila i pezzi da `da`, restituendo inquadrature con da/a sulla timeline.
function inFila(pezzi, da) {
  let t = da;
  return pezzi.filter((p) => p.durata > 1e-6).map((p) => {
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
  const riserva = (Array.isArray(piano?.coperture_riserva) ? piano.coperture_riserva : []).map((c) => coperturaDisponibile(c, idx, R)).filter(Boolean);
  const durataMax = Number(piano?.durata_max ?? sceneggiatura?.durata_max) > 0 ? Number(piano?.durata_max ?? sceneggiatura?.durata_max) : null;

  // 1) battute: fonte, tempi agganciati alle parole, posto sulla timeline
  const battute = [];
  let t = 0;
  battuteIn.forEach((b, i) => {
    const n = i + 1;
    const coperture = (Array.isArray(b?.coperture) ? b.coperture : []).map((c) => {
      const d = coperturaDisponibile(c, idx, R);
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
    // due battute dello stesso file attaccate (a meno di 5 centesimi) diventano esattamente attaccate: niente
    // millesimi di voce ripetuti o saltati fra l'una e l'altra
    const precedente = battute[battute.length - 1];
    if (precedente && precedente.fonte === codice && Math.abs(precedente.fine - ag.inizio) < 0.05 && ag.fine > precedente.fine + 0.3) ag.inizio = precedente.fine;
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
  const durataClip = (codice) => idx.materiali.get(codice)?.durata ?? 0;
  const visti = new Set();
  let video = [];
  for (const b of battute) {
    if (!b.volto) {
      if (!b.coperture.length) avviso(b.n, 'coperture_dalla_riserva', `Battuta ${b.n}: senza coperture sue, ho usato quelle di riserva.`);
      // giro 1: le coperture della battuta (o la riserva); giro 2: la riserva; poi si ripetono tutte. Ogni pezzo resta
      // dentro la sua clip: se il materiale è corto si ripete un'immagine, mai si allunga oltre la fine della clip.
      // la riserva senza le coperture che la battuta ha già (niente la stessa scena due volte di fila)
      const propria = new Set(b.coperture.map((c) => c.etichetta));
      const riservaNuova = riserva.filter((c) => !propria.has(c.etichetta));
      const giri = [b.coperture.length ? b.coperture : riservaNuova.length ? riservaNuova : riserva];
      if (b.coperture.length && riservaNuova.length) giri.push(riservaNuova);
      const tutte = [...b.coperture, ...riservaNuova];
      let resto = b.durata;
      let ripetuto = false;
      const pezzi = [];
      for (let g = 0; resto > 1e-6 && g < 40; g++) {
        let lista = g < giri.length ? giri[g] : tutte;
        if (g >= giri.length) {
          ripetuto = true;
          // nel ripetere, mai ricominciare dalla stessa scena appena vista se ce n'è un'altra
          const ultima = pezzi[pezzi.length - 1]?.etichetta;
          const k = lista.findIndex((c) => c.etichetta !== ultima);
          if (k > 0) lista = [...lista.slice(k), ...lista.slice(0, k)];
        }
        const r = riempiConCoperture(lista, resto, R);
        const fatto = resto - r.manca;
        if (!r.pezzi.length || fatto <= 1e-6) break;
        pezzi.push(...r.pezzi);
        resto = r.manca;
      }
      if (resto > 1e-6 && resto <= 0.02 && pezzi.length) {
        const ultimo = pezzi[pezzi.length - 1];
        const spazio = ultimo.tipo === 'foto' ? 8 - ultimo.durata : durataClip(ultimo.fonte) - ultimo.fine;
        if (spazio >= resto) {
          ultimo.durata += resto;
          ultimo.fine += resto;
          resto = 0;
        }
      }
      video.push(...inFila(evitaStessaDiFila(senzaPezziCorti(pezzi, durataClip, R), video[video.length - 1], durataClip, [...b.coperture, ...riservaNuova], R), b.da));
      if (ripetuto) avviso(b.n, 'coperture_corte', `Battuta ${b.n}: le coperture non bastavano per ${virgola(b.durata)} s, ho ripetuto delle immagini.`);
      if (resto > 1e-6) blocca(b.n, 'coperture_insufficienti', `Battuta ${b.n}: non sono riuscito a coprire ${virgola(resto)} s di voce.`);
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
    let pezzi = senzaPezziCorti(r.pezzi, durataClip, R);
    let restoVolto = (b.durata - lead) - pezzi.reduce((t2, p) => t2 + p.durata, 0);
    if (restoVolto > 1e-3 && restoVolto < R.voltoMin && pezzi.length) {
      const ultimo = pezzi[pezzi.length - 1];
      const spazio = ultimo.tipo === 'foto' ? 8 - ultimo.durata : durataClip(ultimo.fonte) - ultimo.fine;
      if (spazio >= restoVolto - 1e-6) {
        // resto troppo corto per un volto: l'ultima copertura arriva fino in fondo (dentro la sua clip)
        ultimo.durata += restoVolto;
        ultimo.fine = r3(ultimo.fine + restoVolto);
        restoVolto = 0;
      } else {
        // altrimenti l'ultima copertura si accorcia (o si toglie) perché il volto che torna duri almeno voltoMin
        const togli = R.voltoMin - restoVolto;
        if (ultimo.durata - togli >= R.minima - 1e-6) {
          ultimo.durata -= togli;
          ultimo.fine = r3(ultimo.fine - togli);
        } else pezzi = pezzi.slice(0, -1);
        restoVolto = (b.durata - lead) - pezzi.reduce((t2, p) => t2 + p.durata, 0);
      }
    }
    const coperte = inFila(evitaStessaDiFila(pezzi, null, durataClip, riserva, R), b.da + lead);
    const fineCoperture = coperte.length ? coperte[coperte.length - 1].a : b.da + lead;
    video.push({ ...voltoIntero, fine: r3(b.inizio + lead), a: r3(b.da + lead) });
    video.push(...coperte);
    if (b.a - fineCoperture > 1e-3) {
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
    if (r.manca > 1e-6) {
      // la copertura non basta per tutta la finestra: la finestra diventa lunga quanto la copertura (mai di più, se no
      // resterebbe un buco), sempre a cavallo del taglio
      const coperto = (a - da) - r.manca;
      da = Math.max(prima.da, Math.min(T - 0.15, T - coperto / 2));
      a = Math.min(dopo.a, da + coperto);
      da = Math.max(prima.da, a - coperto);
      // un volto ai lati più corto della minima si evita spostando la finestra, che resta della stessa lunghezza
      const sinistra = da - prima.da;
      if (sinistra > 1e-6 && sinistra < R.minima && a - sinistra > T + 0.1) { da -= sinistra; a -= sinistra; }
      const destra = dopo.a - a;
      if (destra > 1e-6 && destra < R.minima && da + destra < T - 0.1 && (da + destra - prima.da >= R.minima || da - prima.da > R.minima)) { da += destra; a += destra; }
      if (a <= T + 0.1 || da >= T - 0.1) {
        saltiScoperti++;
        avviso(B.n, 'taglio_scoperto', `Fra la battuta ${A.n} e la ${B.n} c'è un salto nell'intervista di ${A.fonte} e la copertura disponibile era troppo corta: si vedrà il salto.`);
        continue;
      }
    }
    const nuove = inFila(riempiConCoperture([candidata], a - da, R).pezzi, da);
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
      } else if (q.tipo === 'volto' && prima?.tipo === 'volto' && prima.fonte === q.fonte && Math.abs(prima.fine - q.inizio) < 0.002) {
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
    // si uniscono solo pezzi che continuano esattamente: con uno scarto, la lunghezza non tornerebbe più col posto
    const continua = Math.abs(u?.fine - q.inizio) < 0.001;
    if (u && u.fonte === q.fonte && u.tipo === q.tipo && q.tipo !== 'foto' && Math.abs(u.a - q.da) < 1e-3 && continua) {
      u.a = q.a;
      u.fine = q.fine;
    } else unite.push({ ...q });
  }
  video = unite.map((q) => ({ ...q, da: r3(q.da), a: r3(q.a) }));
  const lampi = video.filter((q) => q.a - q.da < R.minima - 1e-3);
  for (const q of lampi) avviso(0, 'inquadratura_corta', `Un'inquadratura di ${q.etichetta || q.fonte} a ${virgola(q.da)} s dura ${virgola(q.a - q.da)} s: troppo poco, ma non avevo altro da allungare.`);

  // 5) ripetizioni e difetti dei momenti usati
  const coperture = video.filter((q) => q.tipo === 'copertura');
  const ripetuti = [];
  for (let i = 0; i < coperture.length; i++) {
    for (let k = 0; k < i; k++) {
      const a = coperture[i];
      const b = coperture[k];
      if (a.fonte === b.fonte && Math.min(a.fine, b.fine) - Math.max(a.inizio, b.inizio) > 0.3) {
        ripetuti.push(`${a.etichetta || a.fonte} a ${virgola(b.da)} e ${virgola(a.da)} s`);
        break;
      }
    }
  }
  if (ripetuti.length) avviso(0, 'ripetizione', `${ripetuti.length === 1 ? 'Un momento si vede' : `${ripetuti.length} momenti si vedono`} due volte: ${ripetuti.slice(0, 4).join('; ')}${ripetuti.length > 4 ? '…' : ''}.`);
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
  // ogni pezzo di voce sotto un volto deve essere dello stesso file e con lo stesso scarto (due battute attaccate dello
  // stesso file sotto un volto solo sono giuste: il volto continua e la voce pure)
  const inSincrono = (q) => {
    const sotto = audio.filter((x) => x.da < q.a - 0.002 && x.a > q.da + 0.002);
    return sotto.length > 0 && sotto.every((x) => x.fonte === q.fonte && Math.abs((q.inizio - x.inizio) - (q.da - x.da)) <= 0.002);
  };
  for (const q of video) {
    const m = idx.materiali.get(q.fonte);
    const errori = [];
    if (Math.abs(q.da - tt) > 0.002) errori.push(`buco o sovrapposizione a ${virgola(tt)} s`);
    if (q.tipo !== 'foto') {
      if (Math.abs((q.fine - q.inizio) - (q.a - q.da)) > 0.002) errori.push('pezzo lungo diverso dal suo posto');
      if (q.inizio < -0.001 || q.fine > (m?.durata ?? 0) + 0.01) errori.push('pezzo fuori dalla clip');
    }
    if (q.tipo === 'volto' && !inSincrono(q)) errori.push('volto fuori sincrono');
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
