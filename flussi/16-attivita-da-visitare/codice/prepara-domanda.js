// 16 · Prepara la domanda — la domanda per la mappa libera (OpenStreetMap, servizio Overpass):
// tutte le attività che vendono qualcosa nel raggio scelto intorno a Pane Quotidiano.
// Si chiede anche chi non ha il nome: «Metti in fila» lo conta fra quelli che non sa leggere (mai dato per assente).
const cfg = $('Config').first().json;
const lat = Number(cfg.CENTRO_LAT), lon = Number(cfg.CENTRO_LON), r = Math.round(Number(cfg.RAGGIO_M));
if (!Number.isFinite(lat) || !Number.isFinite(lon) || !(r > 0 && r <= 15000)) throw new Error('Config: centro o raggio non validi');
const vicino = `(around:${r},${lat},${lon})`;
const domanda = `[out:json][timeout:120];(` +
  `nwr${vicino}["shop"];` +
  `nwr${vicino}["amenity"~"^(restaurant|bar|cafe|pub|fast_food|ice_cream|pharmacy)$"];` +
  `nwr${vicino}["craft"];` +
  `);out tags center;`;
return [{ json: { url: `${String(cfg.OVERPASS_URL).replace(/\/+$/, '')}?data=${encodeURIComponent(domanda)}`, domanda } }];
