// 26 · Fatti · Prepara — decide quali fonti si leggono per il rapporto dell'imprenditore e prepara le richieste.
// Inserito da N8N/flussi/16-nuovo-cliente-da-mycity/fatti.mjs: le modifiche vanno fatte lì e in codice/.
//
// Le fonti GRATIS (OpenStreetMap, MET Norway, le pagine del radar, i controlli del sito) partono sempre.
// Le fonti A PAGAMENTO (Google Places, TripAdvisor, DataForSEO) e Instagram partono SOLO se, tutte insieme:
//   · la voce del Config è «si» (FONTE_GOOGLE, FONTE_TRIPADVISOR, FONTE_DATAFORSEO, FONTE_INSTAGRAM; di serie «no»);
//   · la credenziale è «collegata» (CREDENZIALE_… nel Config: la scrive il generatore solo quando Nicola gli dà l'id
//     della credenziale con la chiave vera; con la credenziale finta resta «finta» e il nodo HTTP è spento);
//   · il tetto del giorno (TETTO_…_GIORNO) non è raggiunto, contando le chiamate che questa corsa farebbe.
// Una fonte che non parte non è «zero»: il blocco esce «spento» col motivo.
const cfg = $('Config').first().json;
const f = $('Modulo nuovo cliente').first().json;
const prima = $input.first().json || {};
const testo = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const eseguito = (nome) => { try { return $(nome).isExecuted; } catch (e) { return false; } };
const adesso = new Date();

// ── Le fonti a pagamento: le voci del Config, le chiamate che fa ognuna, i tetti di serie ──
const PAGAMENTO = {
  google: { voce: 'FONTE_GOOGLE', credenziale: 'CREDENZIALE_GOOGLE', tetto: 'TETTO_GOOGLE_GIORNO', chiamate: 1, tettoBase: 20 },
  tripadvisor: { voce: 'FONTE_TRIPADVISOR', credenziale: 'CREDENZIALE_TRIPADVISOR', tetto: 'TETTO_TRIPADVISOR_GIORNO', chiamate: 1, tettoBase: 20 },
  dataforseo: { voce: 'FONTE_DATAFORSEO', credenziale: 'CREDENZIALE_DATAFORSEO', tetto: 'TETTO_DATAFORSEO_GIORNO', chiamate: 4, tettoBase: 12 },
  instagram: { voce: 'FONTE_INSTAGRAM', credenziale: 'CREDENZIALE_INSTAGRAM', tetto: 'TETTO_INSTAGRAM_GIORNO', chiamate: 6, tettoBase: 60 },
};
const numero = (v, base) => (v === '' || v == null || !Number.isFinite(Number(v)) ? base : Math.max(0, Math.floor(Number(v))));

// ── Che attività è: il tipo dichiarato su MyCity, o quello che ha capito la ricerca ──
const proposta = eseguito('Controlla la proposta') ? $('Controlla la proposta').first().json || {} : {};
const tipoDetto = [testo(f.tipo_dichiarato), testo(proposta.analisi && proposta.analisi.tipo_di_locale), (testo(f.appunti).match(/Tipo di attività dichiarato: ([^\n.]+)/) || ['', ''])[1]].join(' ').toLowerCase();
// Il tipo per OpenStreetMap: la prima parola che riconosciamo. Senza tipo i concorrenti non si contano (null col motivo).
// [parola, chiave OSM, valori OSM, come lo cerca la gente, tipo di Google Places]
const TIPI_OSM = [
  [/pizzer/, 'amenity', 'restaurant|fast_food', 'pizzeria', 'pizza_restaurant'], [/ristor|trattor|osteria|bistr|sushi|braceria|agriturismo/, 'amenity', 'restaurant', 'ristorante', 'restaurant'],
  [/\bpub\b|birreria/, 'amenity', 'pub|bar', 'pub', 'pub'], [/\bbar\b|caff[eè]|caffetteria|aperitiv/, 'amenity', 'bar|cafe', 'bar', 'bar'],
  [/gelat/, 'amenity', 'ice_cream', 'gelateria', 'ice_cream_shop'], [/pasticc/, 'shop', 'pastry|confectionery', 'pasticceria', 'bakery'],
  [/panific|forno|panetter/, 'shop', 'bakery', 'panificio', 'bakery'], [/parrucch|barbier/, 'shop', 'hairdresser', 'parrucchiere', 'hair_salon'],
  [/estetic|estetist|unghie|nail/, 'shop', 'beauty', 'centro estetico', 'beauty_salon'], [/macell/, 'shop', 'butcher', 'macelleria', 'butcher_shop'],
  [/fior/, 'shop', 'florist', 'fiorista', 'florist'], [/abbigliam|moda|boutique/, 'shop', 'clothes|boutique', 'negozio abbigliamento', 'clothing_store'],
  [/scarp|calzatur/, 'shop', 'shoes', 'negozio scarpe', 'shoe_store'], [/farmac/, 'amenity', 'pharmacy', 'farmacia', 'pharmacy'],
  [/ferrament/, 'shop', 'hardware|doityourself', 'ferramenta', 'hardware_store'], [/librer/, 'shop', 'books', 'libreria', 'book_store'],
  [/ottic/, 'shop', 'optician', 'ottica', null], [/gioiell|orolog/, 'shop', 'jewelry|watches', 'gioielleria', 'jewelry_store'],
  [/enotec|vini\b/, 'shop', 'wine', 'enoteca', 'liquor_store'], [/hotel|albergo|b&b|bed and breakfast|locanda/, 'tourism', 'hotel|guest_house', 'hotel', 'hotel'],
  [/palestr|fitness/, 'leisure', 'fitness_centre', 'palestra', 'gym'], [/tabacch/, 'shop', 'tobacco', 'tabaccheria', null],
  [/edicol/, 'shop', 'newsagent', 'edicola', null], [/profumer/, 'shop', 'perfumery|cosmetics', 'profumeria', null],
  [/erborist/, 'shop', 'herbalist', 'erboristeria', null], [/animal|\bpet\b/, 'shop', 'pet', 'negozio animali', 'pet_store'],
  [/cartoler/, 'shop', 'stationery', 'cartoleria', null], [/bici|cicl/, 'shop', 'bicycle', 'negozio bici', 'bicycle_store'],
  [/telefon|cellular/, 'shop', 'mobile_phone', 'negozio telefonia', 'cell_phone_store'], [/elettronic/, 'shop', 'electronics', 'negozio elettronica', 'electronics_store'],
  [/mobil|arredament/, 'shop', 'furniture', 'negozio mobili', 'furniture_store'], [/giocattol/, 'shop', 'toys', 'negozio giocattoli', null],
  [/lavander|tintor/, 'shop', 'laundry|dry_cleaning', 'lavanderia', 'laundry'], [/gastronom|salumer/, 'shop', 'deli', 'gastronomia', null],
  [/frutt|verdur|ortofrutt/, 'shop', 'greengrocer', 'fruttivendolo', 'grocery_store'], [/pescher/, 'shop', 'seafood', 'pescheria', null],
  [/formagg|caseific/, 'shop', 'cheese', 'formaggi', null], [/cioccolat|dolci/, 'shop', 'chocolate|confectionery', 'cioccolateria', null],
  [/alimentar|minimarket|drogher/, 'shop', 'convenience|supermarket', 'alimentari', 'grocery_store'],
];
const tipoOsm = (() => { for (const [re, chiave, valori, etichetta, google] of TIPI_OSM) if (re.test(tipoDetto)) return { chiave, valori, etichetta, google }; return null; })();
// TripAdvisor solo per bar, ristoranti e hotel (Nicola, 26/11/2026).
const ristoroOAlloggio = /pizzer|ristor|trattor|osteria|bistr|sushi|braceria|agriturismo|\bpub\b|birreria|\bbar\b|caff[eè]|caffetteria|enotec|hotel|albergo|b&b|bed and breakfast|locanda/.test(tipoDetto);
const categoriaTripadvisor = /hotel|albergo|b&b|bed and breakfast|locanda/.test(tipoDetto) ? 'hotels' : 'restaurants';

// ── Dove si trova: le coordinate dal sito MyCity, se no si cerca l'indirizzo dichiarato su OpenStreetMap ──
const lat = Number(f.lat_dichiarata);
const lon = Number(f.lon_dichiarata);
const coordinateBuone = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
const indirizzo = testo(f.indirizzo_dichiarato);
const citta = testo(f.citta) || 'Piacenza';
const cercaIndirizzo = !coordinateBuone && indirizzo.length >= 5;

// ── Il profilo Instagram dell'attività, se la ricerca l'ha trovato (solo il nome del profilo) ──
const corpus = eseguito('Leggi la ricerca') ? (($('Leggi la ricerca').last().json || {}).corpus || {}) : {};
const testiRicerca = [JSON.stringify(proposta.campi || {}), ...Object.values(corpus.pagine || {}).map((pg) => testo(pg && pg.url) + ' ' + testo(pg && pg.testo).slice(0, 20000))].join(' ');
const NON_PROFILI = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'direct', 'about', 'legal', 'developer']);
const profiloInstagram = (() => {
  for (const m of testiRicerca.matchAll(/instagram\.com\/([A-Za-z0-9._]{2,30})/g)) { const h = m[1].replace(/\.+$/, ''); if (!NON_PROFILI.has(h.toLowerCase())) return h; }
  return '';
})();

// ── I tetti del giorno, nella memoria del flusso ──
const memoria = $getWorkflowStaticData('global');
const giorno = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(adesso);
if (!memoria.fonti_rapporto || memoria.fonti_rapporto.giorno !== giorno) memoria.fonti_rapporto = { giorno, chiamate: {} };
const contate = memoria.fonti_rapporto.chiamate;

const chiama = {};
const spente = {};
for (const [nome, p] of Object.entries(PAGAMENTO)) {
  const voce = testo(cfg[p.voce]).toLowerCase();
  const credenziale = testo(cfg[p.credenziale]).toLowerCase();
  const tetto = numero(cfg[p.tetto], p.tettoBase);
  const gia = Number(contate[nome]) || 0;
  let motivo = '';
  if (voce !== 'si') motivo = `fonte spenta nel Config (${p.voce} = ${voce || 'vuoto'})`;
  else if (credenziale !== 'collegata') motivo = 'credenziale finta: manca la chiave vera';
  else if (nome === 'tripadvisor' && !ristoroOAlloggio) motivo = 'TripAdvisor vale solo per bar, ristoranti e hotel';
  else if (nome === 'instagram' && !profiloInstagram) motivo = 'la ricerca non ha trovato un profilo Instagram';
  else if (nome === 'instagram' && !/^\d{5,30}$/.test(testo(cfg.INSTAGRAM_ID_MYCITY))) motivo = "manca l'account professionale Instagram di MyCity (INSTAGRAM_ID_MYCITY)";
  else if (gia + p.chiamate > tetto) motivo = `tetto del giorno raggiunto (${gia} chiamate su ${tetto})`;
  chiama[nome] = !motivo;
  if (motivo) spente[nome] = { motivo, non_applicabile: /vale solo|non ha trovato/.test(motivo) };
  else contate[nome] = gia + p.chiamate;
}

const nome = testo(f.nome_locale);
return [{ json: {
  ...prima,
  fatti_piano: {
    nome, citta, indirizzo: indirizzo || null,
    coordinate: coordinateBuone ? { lat, lon, precisione: 'indirizzo', fonte: 'https://www.mycity-marketplace.com', fonte_nome: 'MyCity (dichiarato dal negozio)' } : null,
    cerca_indirizzo: cercaIndirizzo,
    query_indirizzo: cercaIndirizzo ? `${indirizzo}${new RegExp(citta, 'i').test(indirizzo) ? '' : ', ' + citta}` : null,
    raggio_m: Math.min(500, Math.max(300, numero(cfg.RAGGIO_VICINI_M, 400))),
    tipo_osm: tipoOsm, tipo_detto: tipoDetto.slice(0, 200),
    tripadvisor_categoria: categoriaTripadvisor,
    profilo_instagram: profiloInstagram || null,
    // Instagram: 1 chiamata per lei e al massimo 5 per i concorrenti (si contano tutte e 6 prima di partire).
  // Le parole che la gente cerca su Google per trovarla (DataForSEO: volumi e posizione). Al massimo 5.
    parole_chiave: [...new Set([tipoOsm ? `${tipoOsm.etichetta} ${citta}` : '', tipoOsm ? `${tipoOsm.etichetta} vicino a me` : '', tipoOsm ? `miglior ${tipoOsm.etichetta} ${citta}` : '', nome ? `${nome} ${citta}` : ''].map((p) => p.toLowerCase().replace(/\s+/g, ' ').trim()).filter((p) => p.length >= 3 && p.length <= 80))].slice(0, 5),
    chiama, spente,
    iniziato_il: adesso.toISOString(),
  },
} }];
