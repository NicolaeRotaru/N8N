// 26 · Fatti · Componi — dalle risposte delle fonti ai «fatti» del rapporto dell'imprenditore, nel formato del contratto
// (flussi/16-nuovo-cliente-da-mycity/CONTRATTO-RAPPORTO.md, versione 1.1).
// Regole: ogni blocco ha stato, motivo, fonte, fonte_nome, letto_il; un dato che manca è null col motivo, mai uno zero.
// Mai nomi di persone. Da Google Places solo il place_id (parere legale del 26/11/2026). I testi delle recensioni
// (DataForSEO) vanno solo all'AD in «fatti_per_ad», mai al sito, senza nomi.
// Inserito da N8N/flussi/16-nuovo-cliente-da-mycity/fatti.mjs.
__TESTO__
const prepara = $('Fatti · Prepara').first().json;
const { fatti_piano: piano, ...prima } = prepara;
const pos = $('Fatti · Posizione').first().json.fatti_posizione;
const f = $('Modulo nuovo cliente').first().json;
const testo = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const unaRiga = (v, n) => Array.from(testo(v).replace(/\s+/g, ' ')).slice(0, n).join('');
const eseguito = (nome) => { try { return $(nome).isExecuted; } catch (e) { return false; } };
const adesso = new Date();
const ora = adesso.toISOString();
const fra30 = new Date(adesso.getTime() + 30 * 86400000).toISOString();

const blocco = (stato, extra = {}) => ({ stato, motivo: null, fonte: null, fonte_nome: '', licenza: null, letto_il: null, conserva_fino_al: null, dati: null, ...extra });
const assente = (stato, motivo, fonte_nome, extra = {}) => blocco(stato, { motivo: unaRiga(motivo, 200) || 'dato non disponibile', fonte_nome, ...extra });
/** La risposta di un nodo HTTP (risposta intera: statusCode, body). null se il nodo non ha girato. */
const risposta = (nome) => (eseguito(nome) ? ($(nome).first().json || {}) : null);
const corpoJson = (r) => { if (!r) return null; const b = r.body !== undefined ? r.body : r.data; if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return null; } } return b && typeof b === 'object' ? b : null; };
const rispostaBuona = (r) => r && !r.error && Number(r.statusCode || 200) >= 200 && Number(r.statusCode || 200) < 300;
const motivoErrore = (r, chi) => (!r ? `${chi}: la richiesta non è partita` : r.error ? `${chi} non ha risposto` : `${chi} ha risposto ${Number(r.statusCode) || 'senza codice'}`);
const spenta = (nome, fonte_nome) => {
  const s = piano.spente[nome] || { motivo: 'fonte non letta' };
  return assente(s.non_applicabile ? 'non_applicabile' : 'spento', s.motivo, fonte_nome);
};

// ── Distanza in metri fra due punti ──
const metri = (a, b, c, d) => { const R = 6371000; const r = (x) => (x * Math.PI) / 180; const dl = r(c - a); const dn = r(d - b);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dn / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(h))); };

const fatti = { versione: 1, raccolti_il: ora };

// ── posizione ──
if (pos.posizione && !pos.posizione.solo_citta) {
  const p = pos.posizione;
  fatti.posizione = blocco('letto', { fonte: p.fonte, fonte_nome: p.fonte_nome, licenza: p.licenza || null, letto_il: p.letto_il || ora,
    dati: { lat: Number(p.lat.toFixed(5)), lon: Number(p.lon.toFixed(5)), precisione: p.precisione } });
} else fatti.posizione = assente(pos.posizione ? 'vuoto' : 'vuoto', pos.motivo || 'posizione non trovata', 'OpenStreetMap (Nominatim)', { licenza: 'ODbL' });

// ── vicini (OpenStreetMap / Overpass) ──
const OSM = { fonte_nome: 'OpenStreetMap', licenza: 'ODbL' };
if (!pos.buona) fatti.vicini = assente('vuoto', pos.motivo || 'senza la posizione i vicini non si contano', OSM.fonte_nome, { licenza: OSM.licenza });
else {
  const r = risposta('Fatti · OSM: intorno');
  const b = corpoJson(r);
  if (!rispostaBuona(r) || !b || !Array.isArray(b.elements)) fatti.vicini = assente('errore', motivoErrore(r, 'OpenStreetMap (Overpass)'), OSM.fonte_nome, { licenza: OSM.licenza });
  else {
    const { lat, lon } = pos.posizione;
    const norma = (s) => testo(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const io = norma(piano.nome);
    const elementi = b.elements.map((e) => {
      const la = Number(e.lat ?? (e.center && e.center.lat)); const lo = Number(e.lon ?? (e.center && e.center.lon));
      return { e, t: e.tags || {}, d: Number.isFinite(la) && Number.isFinite(lo) ? metri(lat, lon, la, lo) : null };
    }).filter((x) => x.d !== null && x.d <= piano.raggio_m);
    const conta = (prova) => elementi.filter((x) => prova(x.t)).length;
    const tipo = piano.tipo_osm;
    const valori = tipo ? new RegExp(`^(${tipo.valori})$`) : null;
    const stessoTipo = tipo ? elementi.filter((x) => valori.test(testo(x.t[tipo.chiave]))) : [];
    // Lei stessa non è un concorrente: stesso nome (o contenuto l'uno nell'altro) entro 60 metri.
    const eLei = (x) => { const n = norma(x.t.name); return !!io && !!n && x.d <= 60 && (n === io || n.includes(io) || io.includes(n)); };
    const concorrenti = stessoTipo.filter((x) => !eLei(x));
    fatti.vicini = blocco(elementi.length ? 'letto' : 'vuoto', {
      motivo: elementi.length ? null : 'OpenStreetMap non ha niente segnato nel raggio', fonte: 'https://www.openstreetmap.org/', ...OSM, letto_il: ora,
      dati: {
        raggio_m: piano.raggio_m,
        // Overpass dà al massimo 600 voci: arrivate tutte, i conteggi possono essere più bassi del vero.
        troncato: b.elements.length >= 600,
        concorrenti: tipo ? {
          numero: concorrenti.length, tipo_osm: `${tipo.chiave}=${tipo.valori}`,
          elenco: concorrenti.filter((x) => testo(x.t.name)).sort((a, z) => a.d - z.d).slice(0, 10)
            .map((x) => ({ nome: unaRiga(x.t.name, 80), tipo_osm: `${tipo.chiave}=${testo(x.t[tipo.chiave])}`, distanza_m: x.d, fonte: `https://www.openstreetmap.org/${x.e.type}/${x.e.id}` })),
        } : { numero: null, motivo: "tipo di attività non riconosciuto: i concorrenti non si contano", tipo_osm: null, elenco: [] },
        servizi: {
          fermate_bus: conta((t) => t.highway === 'bus_stop' || t.amenity === 'bus_station'),
          parcheggi: conta((t) => t.amenity === 'parking'),
          scuole: conta((t) => ['school', 'kindergarten', 'college'].includes(t.amenity)),
          uffici_pubblici: conta((t) => ['townhall', 'post_office'].includes(t.amenity) || t.office === 'government'),
          farmacie: conta((t) => t.amenity === 'pharmacy'),
          negozi_totali: conta((t) => !!t.shop),
        },
      } });
  }
}

// ── meteo (MET Norway) ──
const MET = { fonte: 'https://api.met.no/', fonte_nome: 'MET Norway (api.met.no)', licenza: 'CC BY 4.0' };
if (!pos.buona) fatti.meteo = assente('vuoto', pos.motivo || 'senza la posizione il meteo non si chiede', MET.fonte_nome, { fonte: MET.fonte, licenza: MET.licenza });
else {
  const r = risposta('Fatti · Meteo MET Norway');
  const b = corpoJson(r);
  const serie = b && b.properties && Array.isArray(b.properties.timeseries) ? b.properties.timeseries : null;
  if (!rispostaBuona(r) || !serie) fatti.meteo = assente('errore', motivoErrore(r, 'MET Norway'), MET.fonte_nome, { fonte: MET.fonte, licenza: MET.licenza });
  else {
    const giornoDi = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(t));
    const tempoDi = (s) => (/thunder/.test(s) ? 'temporale' : /snow|sleet/.test(s) ? 'neve' : /rain/.test(s) ? 'pioggia' : /fog/.test(s) ? 'nebbia'
      : /clearsky|fair/.test(s) ? 'sole' : /cloudy/.test(s) ? 'nuvoloso' : 'variabile');
    const giorni = new Map();
    for (const x of serie) {
      const g = giornoDi(x.time);
      const d = x.data || {};
      const temp = d.instant && d.instant.details ? Number(d.instant.details.air_temperature) : NaN;
      const v = giorni.get(g) || { data: g, min_c: null, max_c: null, pioggia_mm: 0, letta_pioggia: false, simboli: {} };
      if (Number.isFinite(temp)) { v.min_c = v.min_c === null ? temp : Math.min(v.min_c, temp); v.max_c = v.max_c === null ? temp : Math.max(v.max_c, temp); }
      // La pioggia: l'ora dopo quando c'è, se no le sei ore dopo (solo sulle ore 0, 6, 12, 18 per non contarla due volte).
      const h1 = d.next_1_hours; const h6 = d.next_6_hours;
      if (h1 && h1.details && Number.isFinite(Number(h1.details.precipitation_amount))) { v.pioggia_mm += Number(h1.details.precipitation_amount); v.letta_pioggia = true; }
      else if (h6 && h6.details && Number.isFinite(Number(h6.details.precipitation_amount)) && new Date(x.time).getUTCHours() % 6 === 0) { v.pioggia_mm += Number(h6.details.precipitation_amount); v.letta_pioggia = true; }
      const s = (h1 && h1.summary && h1.summary.symbol_code) || (h6 && h6.summary && h6.summary.symbol_code) || '';
      if (s) { const k = tempoDi(s); v.simboli[k] = (v.simboli[k] || 0) + 1; }
      giorni.set(g, v);
    }
    const elenco = [...giorni.values()].slice(0, 7).map((v) => ({ data: v.data, min_c: v.min_c === null ? null : Math.round(v.min_c * 10) / 10,
      max_c: v.max_c === null ? null : Math.round(v.max_c * 10) / 10, pioggia_mm: v.letta_pioggia ? Math.round(v.pioggia_mm * 10) / 10 : null,
      tempo: Object.entries(v.simboli).sort((a, z) => z[1] - a[1])[0]?.[0] || null }));
    fatti.meteo = blocco(elenco.length ? 'letto' : 'vuoto', { ...MET, motivo: elenco.length ? null : 'MET Norway non ha dato previsioni', letto_il: ora, dati: { giorni: elenco } });
  }
}

// ── eventi e bandi (le pagine del radar) ──
const decodifica = (t) => t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;|&#8217;/g, '’')
  .replace(/&agrave;/g, 'à').replace(/&egrave;/g, 'è').replace(/&eacute;/g, 'é').replace(/&igrave;/g, 'ì').replace(/&ograve;/g, 'ò').replace(/&ugrave;/g, 'ù')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&[a-z]+;/gi, ' ');
const titoli = (html) => {
  const pulito = String(html).slice(0, 1000000).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<nav[\s\S]*?<\/nav>/gi, ' ').replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  const visti = new Set(); const fuori = [];
  for (const m of pulito.matchAll(/<(h[1-4]|a)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = decodifica(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (t.length < 25 || t.length > 180) continue;
    if (/cookie|privacy|accedi|abbonati|newsletter|iscriviti|leggi tutto|continua a leggere|salta al contenuto|vai al contenuto|^esplora |^menu|^cerca|area riservata|amministrazione trasparente|^home/i.test(t)) continue;
    const k = t.toLowerCase(); if (visti.has(k)) continue; visti.add(k); fuori.push(t);
  }
  return fuori;
};
const fontiRadar = eseguito('Fatti · Fonti del radar') ? $('Fatti · Fonti del radar').all().map((x) => x.json) : [];
const scaricate = eseguito('Fatti · Scarica eventi e bandi') ? $('Fatti · Scarica eventi e bandi').all() : [];
const perTipo = { eventi: { elenco: [], lette: 0, errori: [] }, bandi: { elenco: [], lette: 0, errori: [] } };
scaricate.forEach((it, i) => {
  const k = it && it.pairedItem && typeof it.pairedItem.item === 'number' ? it.pairedItem.item : i;
  const fonte = fontiRadar[k];
  if (!fonte || !perTipo[fonte.tipo]) return;
  const j = it.json || {};
  const codice = Number(j.statusCode) || 0;
  if (j.error || codice < 200 || codice >= 300) { perTipo[fonte.tipo].errori.push(fonte.nome); return; }
  perTipo[fonte.tipo].lette += 1;
  for (const t of titoli(typeof j.body === 'string' ? j.body : typeof j.data === 'string' ? j.data : '').slice(0, 6)) {
    perTipo[fonte.tipo].elenco.push({ titolo: unaRiga(t, 180), fonte: fonte.url, fonte_nome: fonte.nome, tipo: fonte.tipo });
  }
});
for (const [tipo, quanti] of [['eventi', 8], ['bandi', 6]]) {
  const v = perTipo[tipo];
  const nomi = fontiRadar.filter((x) => x.tipo === tipo).map((x) => x.nome).join(', ');
  if (!fontiRadar.length) fatti[tipo] = assente('errore', 'le pagine del radar non sono state scaricate', 'Radar dell\'AD');
  else if (!v.lette) fatti[tipo] = assente('errore', `nessuna pagina letta (${v.errori.join(', ') || nomi})`, nomi);
  else fatti[tipo] = blocco(v.elenco.length ? 'letto' : 'vuoto', { motivo: v.elenco.length ? null : 'nessun titolo trovato nelle pagine', fonte: v.elenco[0]?.fonte || null,
    fonte_nome: nomi, letto_il: ora, dati: { elenco: v.elenco.slice(0, quanti) } });
}

// ── sito: i controlli sulle pagine che n8n ha già scaricato nella ricerca ──
const proposta = eseguito('Controlla la proposta') ? $('Controlla la proposta').first().json || {} : {};
const sitoNoto = testo(f.sito) || testo(proposta.sito_ufficiale);
const hostDi = (u) => { try { return new URL(testo(u)).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; } };
const hostSito = hostDi(sitoNoto);
let htmlSito = null; let urlSito = null;
for (const [richieste, uscite] of [['Pagine da leggere', 'Scarica le pagine'], ['Sottopagine da leggere', 'Scarica le sottopagine']]) {
  if (htmlSito || !hostSito || !eseguito(richieste) || !eseguito(uscite)) continue;
  const rich = $(richieste).all();
  const candidati = [];
  $(uscite).all().forEach((it, i) => {
    const k = it && it.pairedItem && typeof it.pairedItem.item === 'number' ? it.pairedItem.item : i;
    const url = testo(rich[k] && rich[k].json && rich[k].json.url);
    const j = (it && it.json) || {};
    const corpo = typeof j.data === 'string' ? j.data : typeof j.body === 'string' ? j.body : '';
    if (!url || j.error || (Number(j.statusCode) && (Number(j.statusCode) < 200 || Number(j.statusCode) >= 300)) || !/<html|<head|<title/i.test(corpo)) return;
    if (hostDi(url) !== hostSito && !hostDi(url).endsWith('.' + hostSito)) return;
    candidati.push({ url, corpo, profondita: (url.replace(/^[a-z]+:\/\/[^/]+/i, '').match(/\/[^/]/g) || []).length });
  });
  candidati.sort((a, z) => a.profondita - z.profondita);
  if (candidati[0]) { htmlSito = candidati[0].corpo.slice(0, 1000000); urlSito = candidati[0].url; }
}
if (!hostSito) fatti.sito = assente('vuoto', "l'attività non ha un sito noto", 'Controlli di n8n');
else if (!htmlSito) fatti.sito = assente('vuoto', 'le pagine del sito non sono state scaricate nella ricerca', 'Controlli di n8n', { fonte: /^https:\/\//i.test(sitoNoto) ? sitoNoto : null });
else {
  const cima = htmlSito.slice(0, 200000);
  const meta = (nome) => { const re1 = new RegExp(`<meta[^>]{0,300}name=["']${nome}["'][^>]{0,300}?content=["']([^"']{0,2000})`, 'i');
    const re2 = new RegExp(`<meta[^>]{0,300}content=["']([^"']{0,2000})["'][^>]{0,300}name=["']${nome}["']`, 'i');
    const m = cima.match(re1) || cima.match(re2); return m ? decodifica(m[1]).replace(/\s+/g, ' ').trim() : null; };
  const titolo = (cima.match(/<title[^>]{0,200}>([^<]{0,500})/i) || [])[1];
  const viewport = meta('viewport');
  const descrizione = meta('description');
  const tipi = new Set();
  for (const m of htmlSito.matchAll(/<script[^>]{0,200}application\/ld\+json[^>]{0,200}>([\s\S]{0,50000}?)<\/script>/gi)) {
    try {
      const giro = (x) => { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) { x.forEach(giro); return; }
        const t = x['@type']; (Array.isArray(t) ? t : [t]).forEach((v) => { if (typeof v === 'string' && /^[A-Za-z]{2,40}$/.test(v)) tipi.add(v); }); if (x['@graph']) giro(x['@graph']); };
      giro(JSON.parse(m[1]));
    } catch (e) { /* un blocco rotto non conta */ }
  }
  fatti.sito = blocco('letto', { fonte: urlSito.slice(0, 500), fonte_nome: 'Controlli di n8n sulla pagina scaricata', letto_il: ora, dati: {
    indirizzo: urlSito.slice(0, 500), https: /^https:\/\//i.test(urlSito),
    viewport_mobile: !!viewport && /width\s*=\s*device-width/i.test(viewport),
    titolo: titolo ? unaRiga(decodifica(titolo), 120) || null : null,
    descrizione: !!descrizione, descrizione_caratteri: descrizione ? Array.from(descrizione).length : null,
    dati_strutturati: [...tipi].slice(0, 10),
  } });
}

// ── Google Places: SOLO il place_id (parere legale, termini EEA dall'8/7/2025) ──
const GOOGLE = { fonte: 'https://developers.google.com/maps/documentation/places/web-service/op-overview', fonte_nome: 'Google Places' };
if (!piano.chiama.google) fatti.google = spenta('google', GOOGLE.fonte_nome);
else {
  const r = risposta('Fatti · Google: la scheda');
  const b = corpoJson(r);
  const id = b && Array.isArray(b.places) && b.places[0] && typeof b.places[0].id === 'string' && /^[A-Za-z0-9_-]{10,300}$/.test(b.places[0].id) ? b.places[0].id : null;
  if (!rispostaBuona(r)) fatti.google = assente('errore', motivoErrore(r, 'Google Places'), GOOGLE.fonte_nome);
  // Nient'altro da Google: niente voto, recensioni, orari, nome, indirizzo, coordinate.
  else fatti.google = id ? blocco('letto', { ...GOOGLE, letto_il: ora, dati: { place_id: id } }) : assente('vuoto', 'Google non trova la scheda', GOOGLE.fonte_nome);
}

// ── TripAdvisor: SOLO il location_id (spento finché non c'è un sì scritto) ──
const TA = { fonte: 'https://www.tripadvisor.com/developers', fonte_nome: 'TripAdvisor' };
if (!piano.chiama.tripadvisor) fatti.tripadvisor = spenta('tripadvisor', TA.fonte_nome);
else {
  const r = risposta('Fatti · TripAdvisor: cerca');
  const b = corpoJson(r);
  const id = b && Array.isArray(b.data) && b.data[0] && /^\d{1,20}$/.test(testo(b.data[0].location_id)) ? testo(b.data[0].location_id) : null;
  if (!rispostaBuona(r)) fatti.tripadvisor = assente('errore', motivoErrore(r, 'TripAdvisor'), TA.fonte_nome);
  else fatti.tripadvisor = id ? blocco('letto', { ...TA, letto_il: ora, dati: { location_id: id } }) : assente('vuoto', "TripAdvisor non trova l'attività", TA.fonte_nome);
}

// ── DataForSEO: recensioni (solo numeri al sito; i testi all'AD), volumi di ricerca e posizione ──
const DFS = { fonte: 'https://dataforseo.com/', fonte_nome: 'DataForSEO', conserva_fino_al: fra30 };
let testiRecensioni = [];
if (!piano.chiama.dataforseo) { fatti.recensioni = spenta('dataforseo', DFS.fonte_nome); fatti.ricerche = spenta('dataforseo', DFS.fonte_nome); }
else {
  const compito = (nome) => { const r = risposta(nome); const b = corpoJson(r); const t = b && Array.isArray(b.tasks) ? b.tasks[0] : null;
    return { r, t, ok: rispostaBuona(r) && t && Number(t.status_code) === 20000, risultato: t && Array.isArray(t.result) ? t.result[0] : null }; };
  const rec = compito('Fatti · DataForSEO: prendi le recensioni');
  const items = rec.ok && rec.risultato && Array.isArray(rec.risultato.items) ? rec.risultato.items : null;
  if (!items) fatti.recensioni = assente('errore', rec.t ? `DataForSEO: ${unaRiga(rec.t.status_message, 120) || 'recensioni non pronte'}` : motivoErrore(rec.r, 'DataForSEO'), DFS.fonte_nome);
  else {
    const per = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; let somma = 0; let n = 0; let risposte = 0; let ultima = '';
    for (const it of items) {
      const v = Math.round(Number(it && it.rating && it.rating.value));
      if (v >= 1 && v <= 5) { per[v] += 1; somma += v; n += 1; }
      if (it && testo(it.owner_answer)) risposte += 1;
      const d = testo(it && it.timestamp).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d > ultima) ultima = d;
      // Solo il testo, accorciato: mai il nome di chi scrive, mai foto o link al profilo.
      const t = unaRiga(it && (it.review_text || it.original_review_text), 220);
      if (t.length >= 15 && testiRecensioni.length < 40) testiRecensioni.push({ stelle: v >= 1 && v <= 5 ? v : null, testo: t });
    }
    fatti.recensioni = blocco(n ? 'letto' : 'vuoto', { ...DFS, motivo: n ? null : 'nessuna recensione', letto_il: ora,
      dati: { lette: n, voto_medio: n ? Math.round((somma / n) * 10) / 10 : null, per_stelle: per, con_risposta: risposte, ultima_il: ultima || null } });
  }
  const vol = compito('Fatti · DataForSEO: volumi');
  const serp = compito('Fatti · DataForSEO: posizione');
  const volumi = vol.ok && vol.t && Array.isArray(vol.t.result) ? vol.t.result : null;
  if (!volumi) fatti.ricerche = assente('errore', vol.t ? `DataForSEO: ${unaRiga(vol.t.status_message, 120)}` : motivoErrore(vol.r, 'DataForSEO'), DFS.fonte_nome);
  else {
    // La posizione del sito dell'attività fra i risultati di Google per la prima parola (null = non tra quelli letti).
    const prima_parola = piano.parole_chiave[0] || '';
    let posizione = null;
    const voci = serp.ok && serp.risultato && Array.isArray(serp.risultato.items) ? serp.risultato.items : null;
    if (voci && hostSito) { const trovato = voci.find((x) => x && x.type === 'organic' && (hostDi(x.url) === hostSito || hostDi(x.url).endsWith('.' + hostSito))); posizione = trovato ? Number(trovato.rank_group) || null : null; }
    fatti.ricerche = blocco('letto', { ...DFS, letto_il: ora, dati: { zona: piano.citta,
      parole: volumi.slice(0, 10).map((x) => ({ parola: unaRiga(x.keyword, 80), ricerche_al_mese: Number.isInteger(x.search_volume) ? x.search_volume : null,
        posizione: x.keyword === prima_parola ? posizione : null })) } });
  }
}

// ── Instagram (Business Discovery, con l'account professionale di MyCity): lei e i concorrenti ──
const IG = { fonte_nome: 'Instagram (Business Discovery)' };
const fascia = (iso) => { const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));
  return h >= 6 && h < 11 ? 'mattina' : h >= 11 && h < 15 ? 'pranzo' : h >= 15 && h < 19 ? 'pomeriggio' : 'sera'; };
const formato = (m) => (testo(m.media_product_type) === 'REELS' ? 'reel' : testo(m.media_type) === 'CAROUSEL_ALBUM' ? 'carosello' : testo(m.media_type) === 'VIDEO' ? 'reel' : 'foto');
/** Dal profilo di Business Discovery ai numeri del contratto (1.2). Niente testi dei post, niente commenti, niente persone. */
const numeriIg = (d, profiloNoto) => {
  const media = d.media && Array.isArray(d.media.data) ? d.media.data.filter((m) => m && Number.isFinite(Date.parse(m.timestamp))) : [];
  const limite = adesso.getTime() - 30 * 86400000;
  const recenti = media.filter((m) => Date.parse(m.timestamp) >= limite);
  const interazioni = (m) => (Number.isInteger(m.like_count) ? m.like_count : 0) + (Number.isInteger(m.comments_count) ? m.comments_count : 0);
  const conNumeri = media.filter((m) => Number.isInteger(m.like_count) || Number.isInteger(m.comments_count));
  const formati = { reel: 0, foto: 0, carosello: 0 };
  const orari = { mattina: 0, pranzo: 0, pomeriggio: 0, sera: 0 };
  for (const m of recenti) { formati[formato(m)] += 1; orari[fascia(m.timestamp)] += 1; }
  const ultimo = media.map((m) => testo(m.timestamp).slice(0, 10)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().pop() || null;
  const link = (u) => (/^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_\/.-]{1,200}$/.test(testo(u)) ? testo(u) : null);
  return {
    profilo: unaRiga(d.username || profiloNoto, 30), follower: Number.isInteger(d.followers_count) ? d.followers_count : null,
    post_totali: Number.isInteger(d.media_count) ? d.media_count : null,
    post_ultimi_30_giorni: media.length ? recenti.length : null,
    video_ultimi_30_giorni: media.length ? recenti.filter((m) => formato(m) === 'reel').length : null,
    ultimo_post_il: ultimo,
    formati: media.length ? formati : null,
    interazioni_medie: conNumeri.length ? Math.round(conNumeri.reduce((t, m) => t + interazioni(m), 0) / conNumeri.length) : null,
    migliori: conNumeri.slice().sort((x, z) => interazioni(z) - interazioni(x)).slice(0, 3)
      .map((m) => ({ link: link(m.permalink), data: testo(m.timestamp).slice(0, 10), formato: formato(m), interazioni: interazioni(m) })).filter((m) => m.link),
    orari: media.length ? orari : null,
  };
};
if (!piano.chiama.instagram) fatti.instagram = spenta('instagram', IG.fonte_nome);
else {
  const r = risposta('Fatti · Instagram: profilo');
  const b = corpoJson(r);
  const d = b && b.business_discovery;
  if (!rispostaBuona(r) || !d) fatti.instagram = assente(rispostaBuona(r) ? 'vuoto' : 'errore', rispostaBuona(r) ? 'il profilo non è professionale o non esiste' : motivoErrore(r, 'Instagram'), IG.fonte_nome);
  else fatti.instagram = blocco('letto', { ...IG, fonte: `https://www.instagram.com/${encodeURIComponent(testo(d.username) || piano.profilo_instagram)}/`, letto_il: ora, dati: numeriIg(d, piano.profilo_instagram) });
}

// ── parte 12: i concorrenti sui social e sul web ──
const sitiConc = eseguito('Fatti · Siti dei concorrenti') ? $('Fatti · Siti dei concorrenti').all().map((x) => x.json || {}) : [];
const elencoConc = sitiConc[0] && Array.isArray(sitiConc[0].concorrenti) ? sitiConc[0].concorrenti : [];
const estrattiConc = [];
if (!elencoConc.length) fatti.concorrenti_canali = assente('vuoto', (sitiConc[0] && sitiConc[0].motivo) || 'nessun concorrente vicino da guardare', 'OpenStreetMap', { licenza: 'ODbL' });
else {
  // I siti scaricati, per nome del concorrente.
  const paginaDi = {};
  if (eseguito('Fatti · Scarica i siti dei concorrenti')) $('Fatti · Scarica i siti dei concorrenti').all().forEach((it, i) => {
    const k = it && it.pairedItem && typeof it.pairedItem.item === 'number' ? it.pairedItem.item : i;
    const s = sitiConc[k]; const j = (it && it.json) || {};
    if (!s || s.salta) return;
    const codice = Number(j.statusCode) || 0;
    const corpo = typeof j.data === 'string' ? j.data : typeof j.body === 'string' ? j.body : '';
    paginaDi[s.nome] = j.error ? { motivo: 'il sito non risponde' } : codice >= 300 && codice < 400 ? { motivo: 'il sito rinvia altrove' }
      : codice && (codice < 200 || codice >= 300) ? { motivo: `il sito risponde ${codice}` } : !/<html|<head|<body/i.test(corpo) ? { motivo: 'non è una pagina' } : { url: s.url, html: corpo.slice(0, 1000000) };
  });
  // I profili Instagram letti, per nome del concorrente.
  const profiliConc = eseguito('Fatti · Instagram dei concorrenti') ? $('Fatti · Instagram dei concorrenti').all().map((x) => x.json || {}) : [];
  const igDi = {};
  if (eseguito('Fatti · Instagram: concorrenti') && piano.chiama.instagram) $('Fatti · Instagram: concorrenti').all().forEach((it, i) => {
    const k = it && it.pairedItem && typeof it.pairedItem.item === 'number' ? it.pairedItem.item : i;
    const p = profiliConc[k]; if (!p || p.salta) return;
    const j = (it && it.json) || {}; const b = corpoJson(j); const d = b && b.business_discovery;
    igDi[p.nome] = rispostaBuona(j) && d ? numeriIg(d, p.profilo) : { motivo: rispostaBuona(j) ? 'profilo non professionale o inesistente' : 'Instagram non ha risposto' };
  });
  const profiloDi = Object.fromEntries(profiliConc.filter((p) => !p.salta).map((p) => [p.nome, p.profilo]));
  // Le posizioni su Google (DataForSEO, stessa ricerca della parte 7): mai dati di Google Places.
  const serpConc = (() => { const r = risposta('Fatti · DataForSEO: posizione'); const b = corpoJson(r); const t = b && Array.isArray(b.tasks) ? b.tasks[0] : null;
    const res = t && Array.isArray(t.result) ? t.result[0] : null; return piano.chiama.dataforseo && res && Array.isArray(res.items) ? res.items : null; })();
  const livelloDi = (html) => {
    const basso = html.toLowerCase();
    const interni = new Set((basso.match(/href=["'](\/[a-z0-9\-_/]{2,80})["']/g) || []).map((x) => x.replace(/["'\/]+$/, ''))).size;
    const funzioni = [/prenot|booking|reserv/, /carrello|cart|shop|negozio online|e-commerce/, /hreflang=|\/en\/|lang=["']en/].filter((re) => re.test(basso)).length;
    return funzioni >= 2 || interni >= 25 ? 'pregio' : interni >= 6 || funzioni === 1 ? 'medio' : 'semplice';
  };
  const elenco = elencoConc.map((c) => {
    const p = paginaDi[c.nome];
    let sito;
    if (!c.sito) sito = { c_e: c.sito_motivo === 'OpenStreetMap non indica un sito' ? null : true, indirizzo: null, livello: null, https: null, viewport_mobile: null, motivo: c.sito_motivo || 'non letto' };
    else if (!p || !p.html) sito = { c_e: true, indirizzo: c.sito, livello: null, https: /^https:/i.test(c.sito), viewport_mobile: null, motivo: (p && p.motivo) || 'non letto' };
    else {
      const vp = (p.html.slice(0, 200000).match(/<meta[^>]{0,300}name=["']viewport["'][^>]{0,300}?content=["']([^"']{0,500})/i) || [])[1] || '';
      sito = { c_e: true, indirizzo: p.url, livello: livelloDi(p.html), https: /^https:/i.test(p.url), viewport_mobile: /width\s*=\s*device-width/i.test(vp), motivo: null };
      estrattiConc.push({ nome: c.nome, url: p.url, testo: LT.taglia(LT.htmlInTesto(p.html).replace(/\s+/g, ' '), 700) });
    }
    const ig = igDi[c.nome];
    const motivoIg = !piano.chiama.instagram ? (piano.spente.instagram ? piano.spente.instagram.motivo : 'Instagram spento')
      : !profiloDi[c.nome] ? 'profilo Instagram non trovato (né su OpenStreetMap né sul suo sito)' : ig && ig.motivo ? ig.motivo : ig ? null : 'non letto';
    const hostC = c.sito ? hostDi(c.sito) : '';
    let posizioneGoogle = null;
    if (serpConc && hostC) { const t = serpConc.find((x) => x && x.type === 'organic' && (hostDi(x.url) === hostC || hostDi(x.url).endsWith('.' + hostC))); posizioneGoogle = t ? Number(t.rank_group) || null : null; }
    return { nome: c.nome, distanza_m: c.distanza_m, fonte: c.fonte, sito, instagram: ig && !ig.motivo ? ig : null, instagram_motivo: motivoIg, posizione_google: posizioneGoogle, letto_il: ora };
  });
  fatti.concorrenti_canali = blocco('letto', { fonte: 'https://www.openstreetmap.org/', fonte_nome: 'OpenStreetMap, siti dei concorrenti, Instagram (Business Discovery), DataForSEO', licenza: 'ODbL', letto_il: ora, dati: { elenco } });
}

// ── le parti per abbonamento (contratto 1.2; numeri provvisori) ──
const PARTI = { posizione: 1, vicini: 3, sito: 5, instagram: 6, google: 7, tripadvisor: 7, ricerche: 7, recensioni: 4, eventi: 8, meteo: 8, bandi: 9, concorrenti_canali: 12 };
for (const [k, v] of Object.entries(PARTI)) if (fatti[k]) fatti[k].parte = v;
if (fatti.vicini && fatti.vicini.dati) fatti.vicini.dati.servizi_parte = 2;

return [{ json: { ...prima, fatti, fatti_per_ad: { testi_recensioni: testiRecensioni, siti_dei_concorrenti: estrattiConc } } }];
