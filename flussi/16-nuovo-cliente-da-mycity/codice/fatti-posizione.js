// 26 · Fatti · Posizione — le coordinate dell'attività (dal sito MyCity o da OpenStreetMap/Nominatim) e le richieste
// per i vicini (Overpass) e per il meteo (MET Norway). Senza coordinate vicini e meteo non partono: escono «vuoto» col motivo.
// Inserito da N8N/flussi/16-nuovo-cliente-da-mycity/fatti.mjs.
const prima = $('Fatti · Prepara').first().json;
const piano = prima.fatti_piano;
const eseguito = (nome) => { try { return $(nome).isExecuted; } catch (e) { return false; } };
const adesso = new Date().toISOString();
let posizione = null;
let motivo = '';
if (piano.coordinate) posizione = { ...piano.coordinate, letto_il: piano.iniziato_il };
else if (!piano.cerca_indirizzo) motivo = "l'attività non ha dichiarato un indirizzo";
else if (!eseguito("Fatti · OSM: cerca l'indirizzo")) motivo = "la ricerca dell'indirizzo non è partita";
else {
  const r = $("Fatti · OSM: cerca l'indirizzo").first().json || {};
  const corpo = Array.isArray(r.body) ? r.body : Array.isArray(r.data) ? r.data : (typeof r.body === 'string' ? (() => { try { return JSON.parse(r.body); } catch (e) { return null; } })() : null);
  const primo = Array.isArray(corpo) ? corpo[0] : null;
  const la = primo ? Number(primo.lat) : NaN;
  const lo = primo ? Number(primo.lon) : NaN;
  if (r.error || (Number(r.statusCode) && Number(r.statusCode) !== 200)) motivo = 'OpenStreetMap non ha risposto alla ricerca dell\'indirizzo';
  else if (!Number.isFinite(la) || !Number.isFinite(lo)) motivo = "OpenStreetMap non trova l'indirizzo dichiarato";
  else {
    const tipo = String(primo.addresstype || primo.type || '');
    const precisione = /house|building|amenity|shop|office|tourism|leisure/.test(tipo) ? 'indirizzo' : /road|street|pedestrian|square|residential|living_street/.test(tipo) ? 'via' : 'citta';
    posizione = { lat: la, lon: lo, precisione, fonte: primo.osm_type && primo.osm_id ? `https://www.openstreetmap.org/${primo.osm_type}/${primo.osm_id}` : 'https://nominatim.openstreetmap.org/',
      fonte_nome: 'OpenStreetMap (Nominatim)', licenza: 'ODbL', letto_il: adesso };
    // Solo la città: i vicini sarebbero quelli del centro, non i suoi. Si dice, e non si contano.
    if (precisione === 'citta') { motivo = "OpenStreetMap trova solo la città, non l'indirizzo"; posizione = { ...posizione, solo_citta: true }; }
  }
}
const buona = posizione && !posizione.solo_citta;
const R = piano.raggio_m;
const la4 = buona ? Number(posizione.lat.toFixed(4)) : null;
const lo4 = buona ? Number(posizione.lon.toFixed(4)) : null;
const intorno = `(around:${R},${la4},${lo4})`;
const tipo = piano.tipo_osm;
const query = buona ? [
  '[out:json][timeout:25];',
  '(',
  `nwr${intorno}[shop];`,
  `nwr${intorno}[amenity~"^(bar|cafe|restaurant|fast_food|pub|ice_cream|pharmacy|school|kindergarten|college|townhall|post_office|parking|bus_station)$"];`,
  `nwr${intorno}[highway=bus_stop];`,
  `nwr${intorno}[tourism~"^(hotel|guest_house)$"];`,
  `nwr${intorno}[leisure=fitness_centre];`,
  `nwr${intorno}[office=government];`,
  tipo && !['shop', 'amenity', 'tourism', 'leisure'].includes(tipo.chiave) ? `nwr${intorno}[${tipo.chiave}~"^(${tipo.valori})$"];` : '',
  ');',
  'out center tags 600;',
].filter(Boolean).join('\n') : null;
return [{ json: { ...prima, fatti_posizione: { posizione, motivo: motivo || null, buona: !!buona, overpass_query: query,
  meteo_url: buona ? `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${la4}&lon=${lo4}` : null } } }];
