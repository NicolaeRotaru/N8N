// 16 · Metti in fila — dalla mappa alla fila della settimana.
// Toglie catene, categorie dove MyCity non vince, doppioni, negozi già su MyCity e attività già proposte;
// poi dà un punteggio: prima il fresco vicino a Pane Quotidiano (registro-fatti: negozi.ingresso), poi
// regali, cura della persona, bar e ristoranti, artigiani, altri negozi. Più punti a chi non ha sito o social
// (è quello che MyCity può offrirgli) e a chi ha un telefono (si può chiamare per fissare la visita).
// Mappa che non risponde = «non letta», mai «zero attività» (scorciatoie-note #10 e #11).
const cfg = $('Config').first().json;
const LAT = Number(cfg.CENTRO_LAT), LON = Number(cfg.CENTRO_LON), RAGGIO = Number(cfg.RAGGIO_M);
const QUANTE = Math.max(1, Math.min(30, Number(cfg.QUANTE_A_SETTIMANA) || 10));
// Forni e panetterie fuori finché Pane Quotidiano è l'unico negozio vero: sono suoi concorrenti (Nicola, 28/11/2026).
// Di serie è acceso; si spegne scrivendo false (o no, 0) in ESCLUDI_FORNI nel Config.
const ESCLUDI_FORNI = !/^(false|falso|no|0|off|spento)$/i.test(String(cfg.ESCLUDI_FORNI ?? true).trim());

// ── la mappa ──
let elementi = null, motivo = '';
try {
  const r = $('Chiedi alla mappa').first().json || {};
  // n8n vero (risposta «text» con fullResponse) mette il testo in `data`: è la forma di tutti i lunedì. `body` resta per sicurezza.
  const grezzo = r.data !== undefined ? r.data : r.body;
  const corpo = typeof grezzo === 'string' ? grezzo : (grezzo ? JSON.stringify(grezzo) : '');
  if (r.statusCode && r.statusCode !== 200) motivo = `la mappa ha risposto ${r.statusCode}`;
  else if (r.error) {
    const testo = typeof r.error === 'string' ? r.error : [r.error.message, r.error.description, r.error.httpCode, r.error.code].filter(Boolean).join(' ');
    if (/\b429\b|too many|spacing your requests|rate.?limit/i.test(testo)) motivo = 'la mappa ha detto «troppe richieste» anche dopo 3 tentativi';
    else if (/\b50[234]\b|timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED/i.test(testo)) motivo = 'la mappa non ha risposto in tempo, anche dopo 3 tentativi';
    else motivo = `la mappa non ha risposto (${Array.from(testo).slice(0, 120).join('')})`;
  }
  else {
    const j = typeof corpo === 'string' ? JSON.parse(corpo) : corpo;
    if (Array.isArray(j.elements) && j.elements.length) elementi = j.elements;
    else if (Array.isArray(j.elements)) motivo = 'la mappa ha risposto senza nessuna attività nel raggio: è quasi certamente un suo guasto, non una città vuota';
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
const ESCLUSE = new Set(['vacant', 'disused', 'no', 'tobacco', 'mobile_phone_accessories', 'printer_ink', 'energy', 'gas', 'electronics', 'computer', 'mobile_phone', 'telecommunication', 'hifi', 'appliance',
  'car', 'car_parts', 'car_repair', 'motorcycle', 'fuel', 'tyres', 'truck', 'caravan', 'boat', 'second_hand', 'charity', 'pawnbroker',
  'money_lender', 'bookmaker', 'lottery', 'betting', 'gambling', 'e-cigarette', 'weapons', 'erotic', 'funeral_directors', 'storage_rental',
  'supermarket', 'department_store', 'mall', 'wholesale', 'trade', 'kiosk', 'ticket', 'travel_agency', 'rental', 'vending_machine', 'outpost']);
// Tabaccherie, ricevitorie e sigarette anche quando la mappa le segna come alimentari (collaudo m2: «Zilli Paola Tabaccheria» era nel fresco).
const NOME_ESCLUSO = /tabacc|ricevitori|totocalcio|sigarett|svapo|scommess|\b(lotto|sala giochi|slot)\b/;
// Catene e franchising: chi ha un marchio sulla mappa, più i nomi più comuni a Piacenza che spesso non lo hanno.
// Il confronto si fa sul nome normalizzato (minuscole, senza accenti né apostrofi): «Tigotà» con l'accento sfuggiva al \b.
const CATENE = /\b(conad|coop|esselunga|carrefour|lidl|eurospin|penny|pam|despar|eurospar|interspar|crai|sigma|md discount|aldi|famila|ins mercato|tigota|acqua (e )?sapone|mc ?donald|burger king|old wild west|roadhouse|autogrill|starbucks|douglas|sephora|kiko|limoni|calzedonia|intimissimi|tezenis|yamamay|zara|h m|ovs|benetton|pandora|bata|carpisa|alcott|original marines|primadonna|unieuro|euronics|mediaworld|trony|feltrinelli|mondadori|giunti|tim|vodafone|wind ?tre|iliad|fastweb|poste|bricocenter|leroy merlin|decathlon|pittarello|scarpe (e )?scarpe|ottica avanzi|salmoiraghi|grandvision|vision ottica|optissimo|marionnaud|yves rocher|l?erbolario|lush|flying tiger|thun|rinascente|upim|sorbino|piazza italia|terranova|stroili|blue spirit|cisalfa|foot locker|kfc|poke house|dominos?|spizzico|rossopomodoro|la piadineria|panino giusto|cioccolatitaliani|grom|venchi|lindt|caffe borbone|nespresso|segafredo|arcaplanet|isola dei tesori|maxi zoo|bennet|ipercoop|tuodi|dpiu|todis|ard discount|ekom|basko|sole 365|risparmio casa|tedi|pepco|kasanova|ipersoap|caddys?|pinalli|citta del sole|yogorino|la piad[ie]neria|pizzium|chef express|pinko|borbonese|luisa spagnoli|grimaldi immobiliare|sun68|sun 68|furla|pitta ?rosso|maxi ?zoo|df sport specialist|sport ?specialist|poltronesofa|lycamobile|md discount|eurospin)\b/;
// Nomi corti che da soli sarebbero parole comuni: valgono solo se il nome è esattamente quello.
const CATENE_ESATTE = new Set(['coin', 'obi', 'pam', 'tim', 'crudo', 'md', 'sma']);

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Nomi che dicono solo il mestiere («forneria», «macelleria»): accanto a un negozio dello stesso tipo sono quasi sempre lui.
const GENERICO = /^(forneria|panetteria|panificio|macelleria|salumeria|gastronomia|alimentari|pasticceria|gelateria|fruttivendolo|frutta e verdura|ortofrutta|drogheria|enoteca|fioraio|fiorista|bar|caffe|caffetteria|pizzeria|ristorante|trattoria|edicola|parrucchiere|barbiere|estetica|centro estetico|ottica|erboristeria|merceria|ferramenta|cartoleria|libreria|calzature|abbigliamento)$/;
// Il forno si riconosce da shop=bakery (o craft=bakery) e, fra i negozi di alimentari, dal nome: «Bio Forno», «La Boutique
// del Pane». «Forni» da solo è un cognome («Alimentari Forni»): non conta. La pasticceria resta, anche quando la mappa la
// segna come forno; restano bar e ristoranti col forno a legna o che fanno il pane: il nome si guarda solo sui negozi di
// alimentari. «Pane» in testa al nome non basta («Pane & Vino», «Pane e Salame» sono gastronomie: collaudo del 28/11).
const NOME_FORNO = /\b(forno|forneria|fornaio|fornai|panetteri[ae]|panifici[oa]?|panificazione)\b|\b(del|di|il) pane\b/;
const ALIMENTARI_GENERICI = new Set(['food', 'convenience', 'grocery', 'deli', 'organic', 'health_food', 'farm', 'yes']);
const eForno = (t, nome) => t.shop !== 'pastry' && !/pasticc/.test(norm(nome)) && (t.shop === 'bakery' || (!t.shop && !t.amenity && t.craft === 'bakery') || (ALIMENTARI_GENERICI.has(t.shop) && NOME_FORNO.test(norm(nome))));
const chiaveNome = (s) => norm(s).replace(/ /g, '');
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
// Lo stato lo scrive a mano chi visita. Valgono SOLO le parole giuste, scritte anche con maiuscole, accenti o spazi:
// visitata (visitato, visto, vista), si (sì, yes), no, iscritta (iscritto). Una frase («sì, non ancora iscritta», «non
// visitata») non si indovina: va fra i «non capiti», e il messaggio la mostra col nome del negozio (ricollaudo G1-bis).
// «esclusa» la scrive il flusso (o chi la toglie a mano) per un'attività che non si visita più: non conta fra le visitate.
const PAROLE_STATO = { esclusa: 'esclusa', escluso: 'esclusa', '': 'da_visitare', 'da visitare': 'da_visitare', visitata: 'visitata', visitato: 'visitata', visto: 'visitata', vista: 'visitata', si: 'si', yes: 'si', no: 'no', iscritta: 'iscritta', iscritto: 'iscritta' };
const leggiStato = (v) => {
  const grezzo = String(v ?? '').trim();
  const t = grezzo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t && grezzo) return 'non_capito'; // solo segni (una spunta, un pollice): qualcuno ha scritto qualcosa, non si sa cosa
  return PAROLE_STATO[t] || 'non_capito';
};
const nonCapiti = [];
let tabellaRotta = '';
const taglia60 = (v) => Array.from(String(v ?? '')).slice(0, 60).join(''); // per caratteri interi: un'emoji non si spezza
const ultimaRiga = new Map(); // osm → riga: una riga doppia (due avvii, una copia a mano) conta una volta sola
// Se la mappa ridisegna il punto, l'identificativo cambia ma nome e indirizzo restano. Il nome da solo non basta:
// «L'Arte della Pizza» o «Lavasecco» esistono in più vie, e sono negozi diversi (terzo collaudo, verifica della PR).
const nomiProposti = new Map(); // chiave del nome → [{ via, civico }]
const viaCivico = (indirizzo) => { const m = String(indirizzo || '').trim().match(/^(.*?)(?:\s+(\d+\s*[a-z]?(?:\s*\/\s*\d+\s*[a-z]?)?))?$/i); return { via: norm(m ? m[1] : ''), civico: norm(m && m[2] ? m[2] : '').replace(/ /g, '') }; };
const giaPropostaDalNome = (chiave, via, civico) => (nomiProposti.get(chiave) || []).some((p) => via && p.via && via === p.via && (!civico || !p.civico || civico === p.civico));
for (const it of $('Leggi le attività già proposte').all()) {
  const j = it.json || {};
  if (j.error) { tabellaRotta = String(j.error.message || j.error).slice(0, 120); continue; }
  if (j.osm) {
    proposte.add(String(j.osm));
    ultimaRiga.set(String(j.osm), j);
    const n = chiaveNome(j.nome);
    if (n.length >= 5 && !GENERICO.test(norm(j.nome))) nomiProposti.set(n, [...(nomiProposti.get(n) || []), viaCivico(j.indirizzo)]);
  }
}
for (const j of ultimaRiga.values()) {
  const s = leggiStato(j.stato);
  stati[s] = (stati[s] || 0) + 1;
  if (s === 'non_capito' && nonCapiti.length < 5) nonCapiti.push({ nome: taglia60(j.nome || j.osm), stato: taglia60(j.stato) });
}
// Tabella che non risponde: niente lista, se no le prime 10 tornerebbero in fila e si riscriverebbero (collaudo m7).
if (tabellaRotta) return [{ json: { letta: false, motivo: `la tabella «Attività da visitare» non ha risposto (${tabellaRotta})`, fila: [], conti: null } }];

const conti = { letti: elementi.length, senza_nome: 0, senza_posizione: 0, chiuse: 0, catene: 0, categorie_escluse: 0, doppioni: 0, gia_su_mycity: 0, gia_proposte: 0, forni: 0, fuori_raggio: 0, in_fila: 0, per_segmento: {}, negozi_mycity_letti: suMyCity.size, proposte_finora: proposte.size, stati_finora: stati, stati_non_capiti: nonCapiti };
const visti = []; // { chiave, pos, tipo } per togliere i doppioni (stesso negozio come punto e come edificio, o con due nomi)
const candidate = [];
// I nomi che dicono solo il mestiere passano per ultimi: fra due doppioni resta «La Pecora Nera», non «Drogheria».
const inOrdine = [...elementi].sort((a, b) => Number(GENERICO.test(norm(a.tags?.name || ''))) - Number(GENERICO.test(norm(b.tags?.name || ''))));
for (const e of inOrdine) {
  const t = e.tags || {};
  const nome = String(t.name || t['name:it'] || '').trim();
  if (!nome || /^(unknown|sconosciuto|senza nome|n\/?a|test|\?+)$/i.test(nome)) { conti.senza_nome++; continue; }
  const pos = e.type === 'node' ? { lat: e.lat, lon: e.lon } : (e.center || null);
  if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) { conti.senza_posizione++; continue; }
  if (/^closed$/i.test(String(t.opening_hours || '').trim()) || t['disused:shop'] || t.disused === 'yes' || t.abandoned === 'yes') { conti.chiuse++; continue; }
  const marchioAltrui = t.brand && !chiaveNome(nome).includes(chiaveNome(t.brand));
  if (t['brand:wikidata'] || t['operator:wikidata'] || marchioAltrui || CATENE.test(norm(nome)) || CATENE_ESATTE.has(norm(nome))) { conti.catene++; continue; }
  const shop = t.shop, amenity = t.amenity, craft = t.craft;
  if ((shop && ESCLUSE.has(shop)) || NOME_ESCLUSO.test(norm(nome))) { conti.categorie_escluse++; continue; }
  let seg = 'altri';
  for (const [k, s] of Object.entries(SEGMENTI)) if ((shop && s.shop?.includes(shop)) || (!shop && amenity && s.amenity?.includes(amenity))) { seg = k; break; }
  if (seg === 'altri' && !shop && !amenity && craft) seg = 'artigiani';
  const m = distanza({ lat: LAT, lon: LON }, pos);
  if (m > RAGGIO + 50) { conti.fuori_raggio++; continue; }
  const chiave = chiaveNome(nome);
  const tipoGrezzo = shop || amenity || craft || '';
  const civico = norm(t['addr:housenumber'] || '');
  const generico = GENERICO.test(norm(nome));
  const doppio = visti.some((v) => {
    const d = distanza(v.pos, pos);
    if (civico && v.civico && civico !== v.civico) return false; // due civici diversi sono due negozi (Via Calzolai 34 e 36, le Metrò di Via Cavour 35 e 40)
    if (v.chiave === chiave) return d < 80;
    if (d < 30 && v.chiave.length >= 5 && chiave.length >= 5 && (v.chiave.includes(chiave) || chiave.includes(v.chiave))) return true;
    return d < 15 && v.tipo === tipoGrezzo && (generico || v.generico);
  });
  visti.push({ chiave, pos, tipo: tipoGrezzo, civico, generico }); // anche il doppione resta come punto noto: così si riconosce il terzo nome dello stesso negozio
  if (doppio) { conti.doppioni++; continue; }
  const osm = `${e.type}/${e.id}`;
  if (giaSuMyCity(nome)) { conti.gia_su_mycity++; continue; }
  if (proposte.has(osm) || giaPropostaDalNome(chiave, norm(t['addr:street'] || ''), civico.replace(/ /g, ''))) { conti.gia_proposte++; continue; }
  if (ESCLUDI_FORNI && eForno(t, nome)) { conti.forni++; continue; }
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
