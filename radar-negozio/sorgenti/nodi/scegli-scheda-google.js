// Sceglie, tra i risultati di Google Maps, la scheda del negozio fotografato e le dà un voto da 0 a 10.
// Decide anche quale sito controllare.
const r = $input.first().json;
const base = $('Leggi risposta foto').first().json;
const lettura = base.lettura;

// ---------- abbinamento ----------
const PAROLE_VUOTE = new Set([
  'di', 'da', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'il', 'lo', 'la', 'le', 'gli', 'un', 'una',
  'e', 'ed', 'al', 'alla', 'allo', 'ai', 'agli', 'alle', 'in', 'srl', 'srls', 'snc', 'sas', 'spa', 'the', 'and',
]);
function norma(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function parole(s) {
  return norma(s).split(' ').filter((w) => w.length > 1 && !PAROLE_VUOTE.has(w));
}
function somiglianza(a, b) {
  const A = new Set(parole(a));
  const B = new Set(parole(b));
  if (!A.size || !B.size) return 0;
  let comuni = 0;
  for (const w of A) if (B.has(w)) comuni++;
  return comuni / Math.min(A.size, B.size);
}
function cifre(s) {
  return String(s || '').replace(/\D/g, '');
}
function stessoTelefono(a, b) {
  const x = cifre(a);
  const y = cifre(b);
  return x.length >= 7 && y.length >= 7 && x.slice(-7) === y.slice(-7);
}

// Con "On Error: Continue" il nodo HTTP passa avanti { error: ... } se Google ha risposto con un errore.
let erroreApi = '';
if (r.error) {
  erroreApi = typeof r.error === 'string' ? r.error : [r.error.message, r.error.description].filter(Boolean).join(' — ');
  erroreApi = String(erroreApi || 'errore sconosciuto').slice(0, 200);
}
const candidati = Array.isArray(r.places) ? r.places : [];
const nomeCercato = lettura.nome_attivita || base.ricerca.query;

let scelto = null;
let migliore = -1;
const valutati = candidati.map((p, i) => {
  const nome = (p.displayName && p.displayName.text) || '';
  const sim = somiglianza(nomeCercato, nome);
  const tel = stessoTelefono(lettura.telefono, p.nationalPhoneNumber || p.internationalPhoneNumber);
  const via = lettura.indirizzo ? somiglianza(lettura.indirizzo, p.formattedAddress) >= 0.5 : false;
  const punti = sim * 3 + (tel ? 3 : 0) + (via ? 1 : 0) + (i === 0 ? 0.5 : 0);
  return { p, nome, sim, tel, via, punti };
});
for (const v of valutati) {
  if (v.punti > migliore) {
    migliore = v.punti;
    scelto = v;
  }
}
// Un risultato con un nome completamente diverso e senza lo stesso telefono non è il nostro negozio.
if (scelto && scelto.sim === 0 && !scelto.tel) scelto = null;

let abbinamento = 'nessuno';
if (scelto) abbinamento = scelto.tel || scelto.sim >= 0.6 ? 'alta' : scelto.sim >= 0.34 ? 'media' : 'bassa';

// ---------- dati e voto della scheda Google ----------
const google = {
  trovato: !!scelto,
  errore: erroreApi || '',
  abbinamento,
  ricerca: base.ricerca.query,
  altri_risultati: valutati
    .filter((v) => !scelto || v.p !== scelto.p)
    .map((v) => v.nome + ' — ' + (v.p.formattedAddress || ''))
    .slice(0, 3),
  voto: 0,
  dettaglio_voto: [],
};

if (scelto) {
  const p = scelto.p;
  const recensioni = Array.isArray(p.reviews) ? p.reviews : [];
  const date = recensioni.map((x) => Date.parse(x.publishTime)).filter((t) => !isNaN(t));
  const ultima = date.length ? Math.max(...date) : null;
  const giorni = ultima ? Math.floor((Date.now() - ultima) / 86400000) : null;
  Object.assign(google, {
    nome: scelto.nome,
    indirizzo: p.formattedAddress || '',
    maps_url: p.googleMapsUri || '',
    categoria: (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || '',
    stato: p.businessStatus || '',
    stelle: typeof p.rating === 'number' ? p.rating : null,
    recensioni: typeof p.userRatingCount === 'number' ? p.userRatingCount : 0,
    telefono: p.nationalPhoneNumber || p.internationalPhoneNumber || '',
    sito: p.websiteUri || '',
    orari: (p.regularOpeningHours && p.regularOpeningHours.weekdayDescriptions) || [],
    foto: Array.isArray(p.photos) ? p.photos.length : 0,
    descrizione: (p.editorialSummary && p.editorialSummary.text) || '',
    giorni_ultima_recensione: giorni,
    ultime_recensioni: recensioni.slice(0, 5).map((x) => ({
      stelle: x.rating,
      quando: x.relativePublishTimeDescription || '',
      testo: String((x.text && x.text.text) || (x.originalText && x.originalText.text) || '').slice(0, 220),
    })),
  });

  const voci = [];
  const voce = (nome, punti, max) => voci.push({ voce: nome, punti, max });
  voce('scheda presente', 2, 2);
  const s = google.stelle || 0;
  voce('stelle', s >= 4.5 ? 2 : s >= 4 ? 1.5 : s >= 3.5 ? 1 : s > 0 ? 0.5 : 0, 2);
  const n = google.recensioni;
  voce('numero di recensioni', n >= 200 ? 2 : n >= 50 ? 1.5 : n >= 15 ? 1 : n >= 1 ? 0.5 : 0, 2);
  voce('orari', google.orari.length ? 1 : 0, 1);
  voce('telefono', google.telefono ? 0.5 : 0, 0.5);
  voce('sito collegato', google.sito ? 1 : 0, 1);
  voce('foto', google.foto >= 10 ? 1 : google.foto >= 3 ? 0.5 : 0, 1);
  voce('recensione negli ultimi 3 mesi', giorni !== null && giorni <= 90 ? 0.5 : 0, 0.5);
  google.dettaglio_voto = voci;
  google.voto = Math.min(10, voci.reduce((t, v) => t + v.punti, 0));
}

// ---------- quale sito controllare ----------
const NON_SITI = [
  ['facebook.com', 'Facebook'], ['fb.com', 'Facebook'], ['fb.me', 'Facebook'], ['instagram.com', 'Instagram'],
  ['tiktok.com', 'TikTok'], ['linktr.ee', 'Linktree'], ['wa.me', 'WhatsApp'], ['whatsapp.com', 'WhatsApp'],
  ['t.me', 'Telegram'], ['linkedin.com', 'LinkedIn'], ['youtube.com', 'YouTube'], ['tripadvisor.', 'TripAdvisor'],
  ['thefork.', 'TheFork'], ['business.site', 'sito gratuito di Google (chiuso nel 2024)'], ['g.page', 'Google'],
  ['google.com', 'Google'], ['goo.gl', 'Google'], ['paginegialle.it', 'PagineGialle'], ['booking.com', 'Booking'],
  ['glovoapp.com', 'Glovo'], ['deliveroo.', 'Deliveroo'], ['justeat.', 'Just Eat'], ['treatwell.', 'Treatwell'],
  ['fresha.com', 'Fresha'], ['uala.', 'Uala'], ['beacons.ai', 'Beacons'], ['linkin.bio', 'link in bio'],
];
// Niente `new URL()`: nei nodi Code di n8n 2.x (task runner) non esiste. Si legge l'indirizzo con le espressioni regolari.
const RE_INDIRIZZO = /^(https?):\/\/(?:[^\/?#@]*@)?(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d{1,5})?([\/?#].*)?$/i;
function normalizzaUrl(u) {
  let s = String(u || '').trim().replace(/\s+/g, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s.replace(/^\/+/, '');
  const m = s.match(RE_INDIRIZZO);
  if (!m || !/[a-z0-9]\.[a-z0-9]/i.test(m[2])) return '';
  return m[1].toLowerCase() + '://' + m[2].toLowerCase() + (m[3] || '') + (m[4] || '/');
}
function nomeHost(url) {
  const m = String(url || '').match(RE_INDIRIZZO);
  return m ? m[2].toLowerCase().replace(/^www\./, '') : '';
}
function piattaforma(url) {
  const h = nomeHost(url);
  if (!h) return null;
  for (const [dominio, nome] of NON_SITI) {
    if (dominio.endsWith('.') ? h.includes(dominio) : h === dominio || h.endsWith('.' + dominio)) return nome;
  }
  return null;
}

const daGoogle = normalizzaUrl(google.sito);
const dallaFoto = normalizzaUrl(lettura.sito);
let sitoUrl = daGoogle || dallaFoto;
let sitoFonte = daGoogle ? 'google' : dallaFoto ? 'foto' : '';
// Se Google rimanda a Facebook ma sulla vetrina c'è un sito vero, si controlla quello.
if (daGoogle && piattaforma(daGoogle) && dallaFoto && !piattaforma(dallaFoto)) {
  sitoUrl = dallaFoto;
  sitoFonte = 'foto';
}
const sitoPiattaforma = sitoUrl ? piattaforma(sitoUrl) : null;
const sitoTipo = !sitoUrl ? 'nessuno' : sitoPiattaforma ? 'social' : 'proprio';

if (google.trovato && google.sito && piattaforma(daGoogle)) {
  // Un link a Facebook o Instagram al posto del sito vale metà punto.
  const v = google.dettaglio_voto.find((x) => x.voce === 'sito collegato');
  if (v) {
    v.punti = 0.5;
    v.voce = 'sito collegato (è un profilo ' + piattaforma(daGoogle) + ')';
    google.voto = Math.min(10, google.dettaglio_voto.reduce((t, x) => t + x.punti, 0));
  }
}

const uscita = Object.assign({}, base);
delete uscita.testo;
delete uscita.azione;
Object.assign(uscita, {
  google,
  sito_url: sitoUrl,
  sito_tipo: sitoTipo,
  sito_piattaforma: sitoPiattaforma || '',
  sito_fonte: sitoFonte,
});
return [{ json: uscita }];
