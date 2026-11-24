// La sceneggiatura scritta dall'autore, in testo semplice, come la scriverebbe un giornalista.
// Esempio:
//
//   # Il pane dei Rossi
//   FORMATO: verticale
//   DURATA: 45
//   MUSICA: si
//
//   VOCE: voce.wav
//   Da trent'anni la famiglia Rossi impasta il pane alle quattro di mattina.
//   COPERTURA: mani nell'impasto, il forno acceso
//
//   INTERVISTA: Mario Rossi, fornaio
//   Ho cominciato a quattordici anni con mio padre.
//   [00:12-00:31]
//
//   SCRITTA: Dal 1994
//   IMMAGINI 5s: il negozio la mattina presto
//
// Regole: una parola chiave a inizio riga apre un blocco (VOCE, INTERVISTA, SCRITTA, IMMAGINI); COPERTURA e i tempi
// [mm:ss-mm:ss] si attaccano al blocco prima; le righe senza parola chiave sono il testo del blocco; «//» = nota per
// la regia. Maiuscole e minuscole non contano. Niente qui è obbligatorio tranne almeno un blocco.
// Questo modulo LEGGE e basta: cosa montare lo decide la regia (Claude), che riceve il risultato come dato.

export const FORMATI_SCENEGGIATURA = ['verticale', 'quadrato', 'orizzontale'];

// Le alternative più lunghe vengono prima («voce fuori campo» prima di «voce»); dopo la parola ci vuole uno spazio,
// i «:» o la fine: così «VOCE FUORI CAMPO:» e «V.O.:» si riconoscono interi.
const parola = (alternative) => new RegExp(`^(?:${alternative})(?=[\\s:(]|$)`, 'i');
const PAROLE = [
  ['voce', parola('voce fuori campo|voce off|voce narrante|speakeraggio|speaker|narratore|narrazione|v\\.\\s?o\\.?|voice ?over|voce|vo')],
  ['intervista', parola('intervista|dichiarazione|sound ?bite')],
  ['scritta', parola('testo a schermo|titolo a schermo|scritta|super|sovrimpressione')],
  ['immagini', parola('musica e immagini|solo immagini|immagini')],
  ['copertura', parola('copertura|coperture|copri con|b-?roll')],
  ['titolo', parola('titolo')],
  ['formato', parola('formato')],
  ['durata', parola('durata')],
  ['musica', parola('musica')],
  ['stile', parola('stile')],
  ['chiusura', parola('call to action|chiusura|cta')],
  ['nota', parola('note|nota')],
];

// «12», «0:12», «00:00:12», «12,5», «1:02.5» → secondi; null se non è un tempo.
export function leggiTempo(t) {
  const s = String(t).trim().replace(',', '.');
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (!m) return null;
  const secondi = Number(m[3]);
  if (secondi >= 60 || Number(m[2]) >= 60) return null;
  return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + secondi;
}

// «[00:12-00:31]», «00:12 - 00:31», «da 0:12 a 0:31», «tc 12-31» → {inizio, fine}; null se la riga non è un tempo.
export function leggiIntervallo(riga) {
  const s = String(riga).trim().replace(/^\[|\]$/g, '').replace(/^(tc|tempi|time ?code)\s*:?\s*/i, '').trim();
  const m = s.match(/^(?:da\s+)?([\d:.,]+)\s*(?:-|–|—|a|al|fino a)\s*([\d:.,]+)$/i);
  if (!m) return null;
  const inizio = leggiTempo(m[1]);
  const fine = leggiTempo(m[2]);
  if (inizio === null || fine === null || fine <= inizio) return null;
  return { inizio, fine };
}

function divisoPrimoDuePunti(riga) {
  const i = riga.indexOf(':');
  return i < 0 ? [riga, ''] : [riga.slice(0, i), riga.slice(i + 1)];
}

// «Mario Rossi, fornaio» / «Mario Rossi (fornaio)» / «Mario Rossi - fornaio» → {chi, ruolo}
function chiERuolo(t) {
  const s = String(t).trim();
  let m = s.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (m) return { chi: m[1].trim(), ruolo: m[2].trim() };
  m = s.match(/^(.+?)\s*(?:,|\s-\s|\s–\s|\s—\s)\s*(.+)$/);
  if (m) return { chi: m[1].trim(), ruolo: m[2].trim() };
  return { chi: s, ruolo: '' };
}

const RE_FILE = /\.(wav|mp3|m4a|aac|flac|ogg|opus|mp4|mov|m4v|mxf|mts|avi|mkv)$/i;
const RE_CODICE = /^[AVF]\d{2,3}$/i;

export function leggiSceneggiatura(testo) {
  const avvisi = [];
  const s = { titolo: '', formato: 'verticale', durata_max: null, musica: null, stile: 'sdg', chiusura: '', note: [], blocchi: [] };
  let corrente = null;
  const chiudi = () => {
    if (!corrente) return;
    corrente.testo = corrente.righe.join(' ').replace(/\s+/g, ' ').trim();
    delete corrente.righe;
    s.blocchi.push(corrente);
    corrente = null;
  };
  const nuovo = (tipo, extra = {}) => {
    chiudi();
    corrente = { n: s.blocchi.length + 1, tipo, righe: [], coperture: [], tempi: null, note: [], ...extra };
  };
  const righe = String(testo ?? '').replace(/\r/g, '').replace(/^﻿/, '').split('\n');
  righe.forEach((grezza, i) => {
    const riga = grezza.trim();
    if (!riga) return;
    if (riga.startsWith('//')) {
      (corrente ? corrente.note : s.note).push(riga.slice(2).trim());
      return;
    }
    if (/^#\s+/.test(riga) && !s.titolo) {
      s.titolo = riga.replace(/^#+\s*/, '').trim();
      return;
    }
    const intervallo = leggiIntervallo(riga);
    if (intervallo) {
      if (corrente) corrente.tempi = intervallo;
      else avvisi.push({ riga: i + 1, messaggio: `Riga ${i + 1}: un tempo prima di qualsiasi blocco, l'ho ignorato.` });
      return;
    }
    const [testa, resto] = divisoPrimoDuePunti(riga);
    const parola = PAROLE.find(([, re]) => re.test(testa.trim()));
    // una parola chiave vale solo se è seguita da «:» (o da una durata, per IMMAGINI 5s: …)
    const avanzo = parola ? testa.trim().replace(parola[1], '').trim() : '';
    // dopo la parola chiave, prima dei «:», ci può stare solo una durata (IMMAGINI 5s:) o chi parla (INTERVISTA Mario Rossi:)
    const conDuePunti = riga.includes(':') && parola && (avanzo === '' || /^\d+(?:[.,]\d+)?\s*s(ec(ondi)?)?$/i.test(avanzo) || (parola[0] === 'intervista' && /^(a\s+)?[\p{L}(]/u.test(avanzo)));
    if (!parola || !conDuePunti) {
      // «PAROLA:» in maiuscolo all'inizio che non è una parola chiave: probabilmente un errore di battitura, lo si dice
      const sospetta = riga.match(/^([A-ZÀÈÉÌÒÙ][A-ZÀÈÉÌÒÙ .']{1,24}):/);
      if (sospetta && !parola) avvisi.push({ riga: i + 1, messaggio: `Riga ${i + 1}: «${sospetta[1]}:» non è una parola che conosco (VOCE, INTERVISTA, SCRITTA, IMMAGINI, COPERTURA…): l'ho trattata come testo${corrente ? ` del blocco ${corrente.n}` : ''}.` });
      if (corrente) corrente.righe.push(riga.replace(/^["“«]|["”»]$/g, ''));
      else s.note.push(riga);
      return;
    }
    const [tipo] = parola;
    const valore = resto.trim();
    // le impostazioni (titolo, formato, durata, musica, stile, chiusura) chiudono il blocco aperto: il testo libero
    // che viene dopo non si attacca più alla voce o all'intervista di prima, ma va nelle note
    if (['titolo', 'formato', 'durata', 'musica', 'stile', 'chiusura'].includes(tipo)) chiudi();
    switch (tipo) {
      case 'titolo':
        s.titolo = valore;
        break;
      case 'formato': {
        const f = valore.toLowerCase();
        const scelto = /9\s*[:/x]\s*16|vertic|reel|storia|tiktok/.test(f) ? 'verticale' : /1\s*[:/x]\s*1|quadr|4\s*[:/x]\s*5/.test(f) ? 'quadrato' : /16\s*[:/x]\s*9|orizz|youtube/.test(f) ? 'orizzontale' : null;
        if (scelto) s.formato = scelto;
        else avvisi.push({ riga: i + 1, messaggio: `Riga ${i + 1}: il formato «${valore}» non lo conosco (verticale, quadrato, orizzontale): resta verticale.` });
        break;
      }
      case 'durata': {
        const n = leggiTempo(valore.replace(/\s*(s|sec|secondi)$/i, ''));
        if (n && n > 0) s.durata_max = n;
        else avvisi.push({ riga: i + 1, messaggio: `Riga ${i + 1}: la durata «${valore}» non è un numero di secondi.` });
        break;
      }
      case 'musica': {
        const v = valore.toLowerCase();
        if (/^(no|niente|nessuna|senza)\b/.test(v)) s.musica = { usa: false };
        else if (RE_FILE.test(valore) || RE_CODICE.test(valore)) s.musica = { usa: true, file: valore };
        else s.musica = { usa: true, ...(valore && !/^(si|sì|yes)$/.test(v) ? { descrizione: valore } : {}) };
        break;
      }
      case 'stile':
        s.stile = valore.toLowerCase() || 'sdg';
        break;
      case 'chiusura':
        s.chiusura = valore;
        break;
      case 'nota':
        s.note.push(valore);
        break;
      case 'copertura':
        if (corrente) corrente.coperture.push(...valore.split(/\s*[;,]\s*(?=\S)/).map((x) => x.trim()).filter(Boolean));
        else avvisi.push({ riga: i + 1, messaggio: `Riga ${i + 1}: COPERTURA prima di qualsiasi blocco, l'ho ignorata.` });
        break;
      case 'voce': {
        const file = RE_FILE.test(valore) || RE_CODICE.test(valore) ? valore : '';
        nuovo('voce', file ? { file } : {});
        if (!file && valore) corrente.righe.push(valore);
        break;
      }
      case 'intervista': {
        // «INTERVISTA: Mario Rossi, fornaio [file]» oppure «INTERVISTA Mario Rossi (fornaio): intervista1.mp4 | prima frase»
        const RE_FILE_FINE = /\s*[[(]?(?:file:?\s*)?([^\s[\]()]+\.(?:mp4|mov|m4v|mxf|mts|avi|mkv|wav|mp3|m4a)|[AV]\d{2,3})[\])]?\s*$/i;
        let chiTesto;
        let file = '';
        let frase = '';
        if (avanzo) {
          chiTesto = avanzo.replace(/^a\s+/i, '').replace(/^\((.*)\)$/, '$1');
          const f = valore.match(RE_FILE_FINE);
          if (f && f.index === 0) file = f[1];
          else frase = valore;
        } else {
          chiTesto = valore;
          const f = chiTesto.match(RE_FILE_FINE);
          if (f) {
            file = f[1];
            chiTesto = chiTesto.slice(0, f.index).replace(/[\s,–—-]+$/, '');
          }
        }
        nuovo('intervista', { ...chiERuolo(chiTesto), ...(file ? { file } : {}) });
        if (frase) corrente.righe.push(frase.replace(/^["“«]|["”»]$/g, ''));
        break;
      }
      case 'scritta':
        nuovo('scritta');
        corrente.righe.push(valore);
        break;
      case 'immagini': {
        const d = testa.match(/(\d+(?:[.,]\d+)?)\s*s/i);
        nuovo('immagini', d ? { durata: Number(d[1].replace(',', '.')) } : {});
        if (valore) corrente.coperture.push(...valore.split(/\s*[;,]\s*(?=\S)/).map((x) => x.trim()).filter(Boolean));
        break;
      }
      default:
        break;
    }
  });
  chiudi();
  if (!s.blocchi.length) avvisi.push({ riga: 0, messaggio: 'La sceneggiatura non ha nessun blocco (VOCE, INTERVISTA, SCRITTA o IMMAGINI): la regia farà da sola con il materiale.' });
  for (const b of s.blocchi) {
    if (b.tipo === 'scritta' && !b.testo) avvisi.push({ riga: 0, messaggio: `Blocco ${b.n}: SCRITTA senza testo.` });
    if (b.tipo === 'immagini' && !b.coperture.length && !b.testo) avvisi.push({ riga: 0, messaggio: `Blocco ${b.n}: IMMAGINI senza dire quali; le sceglie la regia.` });
  }
  return { ...s, avvisi };
}
