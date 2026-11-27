// 16 · Metti in fila — dalla mappa alla fila della settimana.
// Toglie catene, categorie dove MyCity non vince, doppioni, negozi già su MyCity e attività già proposte;
// poi dà un punteggio: prima il fresco vicino a Pane Quotidiano (registro-fatti: negozi.ingresso), poi
// regali, cura della persona, bar e ristoranti, artigiani, altri negozi. Più punti a chi non ha sito o social
// (è quello che MyCity può offrirgli) e a chi ha un telefono (si può chiamare per fissare la visita).
// Mappa che non risponde = «non letta», mai «zero attività» (scorciatoie-note #10 e #11).
const cfg = $('Config').first().json;
const LAT = Number(cfg.CENTRO_LAT), LON = Number(cfg.CENTRO_LON), RAGGIO = Number(cfg.RAGGIO_M);
const QUANTE = Math.max(1, Math.min(30, Number(cfg.QUANTE_A_SETTIMANA) || 10));

// ── la mappa ──
let elementi = null, motivo = '';
try {
  const r = $('Chiedi alla mappa').first().json || {};
  const corpo = typeof r.body === 'string' ? r.body : (r.body ? JSON.stringify(r.body) : (r.data || ''));
  if (r.statusCode && r.statusCode !== 200) motivo = `la mappa ha risposto ${r.statusCode}`;
  else if (r.error) motivo = `la mappa non ha risposto (${String(r.error.message || r.error).slice(0, 120)})`;
  else {
    const j = typeof corpo === 'string' ? JSON.parse(corpo) : corpo;
    if (Array.isArray(j.elements)) elementi = j.elements;
    else motivo = 'la mappa ha risposto senza elenco';
    if (j.remark && /error|timeout|runtime/i.test(j.remark)) { elementi = null; motivo = `la mappa si è fermata: ${String(j.remark).slice(0, 120)}`; }
  }
} catch (e) { motivo = `risposta della mappa illeggibile (${String(e.message).slice(0, 80)})`; }
if (!elementi) return [{ json: { letta: false, motivo, fila: [], conti: null } }];

// ── le categorie: chi serviamo prima (CONTESTO_BUSINESS §3 e §6, registro strategia.segmenti-onboarding) ──
const SEGMENTI = {
  fresco: { peso: 100, nome: 'fresco', shop: ['greengrocer', 'butcher', 'bakery', 'deli', 'cheese', 'pastry', 'dairy', 'farm', 'convenience', 'grocery', 'health_food', 'organic', 'pasta', 'spices', 'nuts', 'food'] },
  regali: { peso: 70, nome: 'regali', shop: ['wine', 'florist', 'stationery', 'gift', 'chocolate', 'confectionery', 'books', 'toys', 'coffee', 'tea', 'beverages', 'alcohol', 'craft', 'art', 'antiques', 'jewelry', 'perfumery', 'garden_centre'] },
  persona: { peso: 60, nome: 'cura della persona', shop: ['optician', 'beauty', 'hairdresser', 'cosmetics', 'herbalist', 'chemist', 'medical_supply', 'massage', 'nutrition_supplements', 'tattoo'], amenity: ['pharmacy'] },
  ristoro: { peso: 45, nome: 'bar e ristoranti', amenity: ['restaurant', 'bar', 'cafe', 'pub', 'ice_cream', 'fast_food'] },
  pesce: { peso: 35, nome: 'pescheria (fase 2)', shop: ['seafood'] },
  artigiani: { peso: 35, nome: 'artigiani' },
  altri: { peso: 25, nome: 'altri negozi' },
};
// Dove non si vince o non si entra (CONTESTO_BUSINESS §3: elettronica persa; catene escluse; niente usato).
const ESCLUSE = new Set(['vacant', 'disused', 'no', 'yes', 'electronics', 'computer', 'mobile_phone', 'telecommunication', 'hifi', 'appliance',
  'car', 'car_parts', 'car_repair', 'motorcycle', 'fuel', 'tyres', 'truck', 'caravan', 'boat', 'second_hand', 'charity', 'pawnbroker',
  'money_lender', 'bookmaker', 'lottery', 'betting', 'gambling', 'e-cigarette', 'weapons', 'erotic', 'funeral_directors', 'storage_rental',
  'supermarket', 'department_store', 'mall', 'wholesale', 'trade', 'kiosk', 'ticket', 'travel_agency', 'rental', 'vending_machine', 'outpost']);
// Catene e franchising: chi ha un marchio sulla mappa, più i nomi più comuni a Piacenza che spesso non lo hanno.
// Il confronto si fa sul nome normalizzato (minuscole, senza accenti né apostrofi): «Tigotà» con l'accento sfuggiva al \b.
const CATENE = /\b(conad|coop|esselunga|carrefour|lidl|eurospin|penny|pam|despar|eurospar|interspar|crai|sigma|md discount|aldi|famila|ins mercato|tigota|acqua (e )?sapone|mc ?donald|burger king|old wild west|roadhouse|autogrill|starbucks|douglas|sephora|kiko|limoni|calzedonia|intimissimi|tezenis|yamamay|zara|h m|ovs|benetton|pandora|bata|carpisa|alcott|original marines|primadonna|unieuro|euronics|mediaworld|trony|feltrinelli|mondadori|giunti|tim|vodafone|wind ?tre|iliad|fastweb|poste|bricocenter|leroy merlin|decathlon|pittarello|scarpe (e )?scarpe|ottica avanzi|salmoiraghi|grandvision|vision ottica|optissimo|marionnaud|yves rocher|l?erbolario|lush|flying tiger|thun|rinascente|upim|sorbino|piazza italia|terranova|stroili|blue spirit|cisalfa|foot locker|kfc|poke house|dominos?|spizzico|rossopomodoro|la piadineria|panino giusto|cioccolatitaliani|grom|venchi|lindt|caffe borbone|nespresso|segafredo|arcaplanet|isola dei tesori|maxi zoo|bennet|ipercoop|tuodi|dpiu|todis|ard discount|ekom|basko|sole 365|risparmio casa|tedi|pepco|kasanova|ipersoap|caddys?)\b/;

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const distanza = (a, b) => { // metri, formula dell'emisenoverso
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
};
const TIPI = { food: 'alimentari', greengrocer: 'frutta e verdura', butcher: 'macelleria', bakery: 'panetteria', deli: 'gastronomia', cheese: 'formaggi', pastry: 'pasticceria', dairy: 'latteria', farm: 'prodotti della fattoria', convenience: 'alimentari', grocery: 'alimentari', health_food: 'prodotti naturali', organic: 'biologico', pasta: 'pasta fresca', seafood: 'pescheria', wine: 'enoteca', florist: 'fiorista', stationery: 'cartoleria', gift: 'regali', chocolate: 'cioccolateria', confectionery: 'dolciumi', books: 'libreria', toys: 'giocattoli', coffee: 'caffè', tea: 'tè', beverages: 'bevande', alcohol: 'alcolici', jewelry: 'gioielleria', perfumery: 'profumeria', optician: 'ottica', beauty: 'centro estetico', hairdresser: 'parrucchiere', cosmetics: 'cosmetici', herbalist: 'erboristeria', chemist: 'drogheria', clothes: 'abbigliamento', shoes: 'calzature', restaurant: 'ristorante', bar: 'bar', cafe: 'caffetteria', pub: 'pub', ice_cream: 'gelateria', fast_food: 'cibo da asporto', pharmacy: 'farmacia', garden_centre: 'vivaio', art: 'arte', antiques: 'antiquariato', tattoo: 'tatuaggi' };

// ── chi è già su MyCity (sola lettura: profili con ruolo negozio) ──
const suMyCity = new Set();
try {
  const r = $('Leggi i negozi di MyCity').first().json || {};
  const corpo = typeof r.body === 'string' ? JSON.parse(r.body) : r.body;
  for (const p of Array.isArray(corpo) ? corpo : []) { const n = norm(p.store_name); if (n.length >= 4) suMyCity.add(n); }
} catch { /* se il database non risponde si va avanti: lo dice il conto */ }
const giaSuMyCity = (nome) => { const n = norm(nome); if (suMyCity.has(n)) return true; for (const s of suMyCity) if (s.length >= 6 && n.length >= 6 && (n.includes(s) || s.includes(n))) return true; return false; };

// ── chi è già stato proposto (la tabella non si svuota mai: chi c'è non torna in fila) ──
const proposte = new Set();
const stati = {};
for (const it of $('Leggi le attività già proposte').all()) {
  const j = it.json || {};
  if (j.osm) { proposte.add(String(j.osm)); const s = String(j.stato || 'da_visitare').trim().toLowerCase() || 'da_visitare'; stati[s] = (stati[s] || 0) + 1; }
}

const conti = { letti: elementi.length, senza_nome: 0, senza_posizione: 0, chiuse: 0, catene: 0, categorie_escluse: 0, doppioni: 0, gia_su_mycity: 0, gia_proposte: 0, fuori_raggio: 0, in_fila: 0, per_segmento: {}, negozi_mycity_letti: suMyCity.size, proposte_finora: proposte.size, stati_finora: stati };
const visti = new Map(); // nome normalizzato → [posizioni] per togliere i doppioni (stesso negozio come punto e come edificio)
const candidate = [];
for (const e of elementi) {
  const t = e.tags || {};
  const nome = String(t.name || t['name:it'] || '').trim();
  if (!nome) { conti.senza_nome++; continue; }
  const pos = e.type === 'node' ? { lat: e.lat, lon: e.lon } : (e.center || null);
  if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) { conti.senza_posizione++; continue; }
  if (/^closed$/i.test(String(t.opening_hours || '').trim()) || t['disused:shop'] || t.disused === 'yes' || t.abandoned === 'yes') { conti.chiuse++; continue; }
  if (t.brand || t['brand:wikidata'] || t['operator:wikidata'] || CATENE.test(norm(nome))) { conti.catene++; continue; }
  const shop = t.shop, amenity = t.amenity, craft = t.craft;
  if (shop && ESCLUSE.has(shop)) { conti.categorie_escluse++; continue; }
  let seg = 'altri';
  for (const [k, s] of Object.entries(SEGMENTI)) if ((shop && s.shop?.includes(shop)) || (!shop && amenity && s.amenity?.includes(amenity))) { seg = k; break; }
  if (seg === 'altri' && !shop && !amenity && craft) seg = 'artigiani';
  const m = distanza({ lat: LAT, lon: LON }, pos);
  if (m > RAGGIO + 50) { conti.fuori_raggio++; continue; }
  const chiave = norm(nome);
  const gia = visti.get(chiave) || [];
  if (gia.some((p) => distanza(p, pos) < 80)) { conti.doppioni++; continue; }
  visti.set(chiave, [...gia, pos]);
  const osm = `${e.type}/${e.id}`;
  if (giaSuMyCity(nome)) { conti.gia_su_mycity++; continue; }
  if (proposte.has(osm)) { conti.gia_proposte++; continue; }
  const sito = String(t.website || t['contact:website'] || t.url || '').trim();
  const social = [t['contact:facebook'], t.facebook, t['contact:instagram'], t.instagram].filter(Boolean).map(String);
  const telefono = String(t.phone || t['contact:phone'] || t['contact:mobile'] || t.mobile || '').split(';')[0].trim();
  const via = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  const fattoreDistanza = Math.max(0.4, 1 - 0.12 * (m / 1000));
  let punti = SEGMENTI[seg].peso * fattoreDistanza;
  const perche = [];
  const offerta = [];
  if (seg === 'fresco') perche.push(m <= 1500 ? 'fresco vicino a Pane Quotidiano' : 'fresco');
  else perche.push(SEGMENTI[seg].nome);
  if (!sito) { punti += 15; perche.push('sulla mappa non ha un sito'); offerta.push('sito'); }
  if (!social.length) { punti += 10; perche.push('sulla mappa nessun social'); offerta.push('social'); }
  if (telefono) punti += 5; else perche.push('telefono da trovare');
  if (t.opening_hours) punti += 3;
  candidate.push({
    osm, nome, tipo: TIPI[shop || amenity] || TIPI[craft] || (craft ? `artigiano (${craft})` : (shop || amenity || 'attività')).replace(/_/g, ' '),
    segmento: SEGMENTI[seg].nome, indirizzo: via, telefono, sito, social: social.join(' '), distanza_m: m, punteggio: Math.round(punti * 10) / 10,
    perche: perche.join('; '), offerta: offerta.join(', '),
    mappa: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([nome, via, 'Piacenza'].filter(Boolean).join(', '))}`,
  });
  conti.per_segmento[SEGMENTI[seg].nome] = (conti.per_segmento[SEGMENTI[seg].nome] || 0) + 1;
}
candidate.sort((a, b) => b.punteggio - a.punteggio || a.distanza_m - b.distanza_m || a.nome.localeCompare(b.nome));
conti.in_fila = candidate.length;
return [{ json: { letta: true, motivo: '', fila: candidate.slice(0, QUANTE), conti } }];
