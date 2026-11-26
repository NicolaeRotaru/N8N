// 26 · I FATTI DEL RAPPORTO DELL'IMPRENDITORE — i nodi che, nel flusso 26, raccolgono i numeri dalle fonti
// prima della domanda all'AD («Prepara l'analisi del business»).
//
// 26/11/2026 — Firma di Nicola (~14:45) sul piano «analisi imprenditore»: l'analisi di ogni attività che si iscrive
// diventa molto più ricca, con numeri veri e la loro fonte. Il formato sta in CONTRATTO-RAPPORTO.md.
//
// Fonti GRATIS, accese: OpenStreetMap (Nominatim per l'indirizzo, Overpass per concorrenti e servizi entro 300-500 m,
// una richiesta al secondo, nome di programma generico), MET Norway (meteo 7 giorni, citato), le pagine di eventi e
// bandi del radar dell'AD, i controlli del sito sulle pagine già scaricate nella ricerca.
// Fonti A PAGAMENTO, pronte ma SPENTE: Google Places (solo place_id, parere legale), TripAdvisor (solo location_id),
// DataForSEO (recensioni, volumi, posizione), Instagram Business Discovery (gratis, ma serve l'account di MyCity).
// Ognuna ha TRE freni, e ne basta uno per non far partire niente:
//   1. la voce del Config FONTE_… = «no» di serie;
//   2. la credenziale: finché Nicola non dà al generatore l'id della credenziale con la chiave vera
//      (--credenziale-google <id>, …), il Config dice CREDENZIALE_… = «finta» e il nodo HTTP è SPENTO (disabled);
//   3. il tetto di chiamate al giorno nel Config (TETTO_…_GIORNO).
// Il controllo di ogni freno sta in «Fatti · Prepara» e di nuovo nella condizione del nodo IF davanti alla chiamata.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const codice = (nome) => readFileSync(join(QUI, 'codice', nome), 'utf8');
/** Le fonti di eventi e bandi del radar dell'AD (24-radar-web/codice/fonti.json), solo quelle che servono qui. */
export const ID_FONTI_RADAR = ['comune-eventi', 'sagre-provincia', 'comune-imprese', 'cciaa-emilia-bandi', 'unionecommercianti-bandi'];
export const FONTI_RADAR = JSON.parse(readFileSync(join(QUI, '..', '24-radar-web', 'codice', 'fonti.json'), 'utf8'))
  .filter((f) => ID_FONTI_RADAR.includes(f.id)).map(({ id, nome, url, tipo }) => ({ id, nome, url, tipo }));

export const CODICE_FATTI_PREPARA = codice('fatti-prepara.js');
export const CODICE_FATTI_POSIZIONE = codice('fatti-posizione.js');
export const CODICE_FATTI_FONTI_RADAR = codice('fatti-fonti-radar.js').replace('__FONTI__', JSON.stringify(FONTI_RADAR));
const INDIRIZZI = readFileSync(join(QUI, '..', 'chiedi-all-ad', 'codice', 'pagine-indirizzi.js'), 'utf8').trimEnd();
const TESTO = readFileSync(join(QUI, '..', 'chiedi-all-ad', 'codice', 'pagine-testo.js'), 'utf8').trimEnd();
export const CODICE_FATTI_CONCORRENTI = codice('fatti-concorrenti.js').replace('__INDIRIZZI__', () => INDIRIZZI);
export const CODICE_FATTI_PROFILI_CONCORRENTI = codice('fatti-profili-concorrenti.js');
export const CODICE_FATTI_COMPONI = codice('fatti-componi.js').replace('__TESTO__', () => TESTO);

/** Il nome di programma con cui ci si presenta alle fonti gratis: generico, senza nomi né contatti personali. */
export const USER_AGENT = 'rapporto-attivita/1.0';

export const N = {
  prepara: 'Fatti · Prepara',
  ifIndirizzo: "Fatti · Cercare l'indirizzo?",
  nominatim: "Fatti · OSM: cerca l'indirizzo",
  aspetta1: 'Fatti · Aspetta 1 secondo',
  posizione: 'Fatti · Posizione',
  ifPosizione: 'Fatti · Posizione nota?',
  overpass: 'Fatti · OSM: intorno',
  meteo: 'Fatti · Meteo MET Norway',
  radar: 'Fatti · Fonti del radar',
  scaricaRadar: 'Fatti · Scarica eventi e bandi',
  sitiConc: 'Fatti · Siti dei concorrenti',
  ifSitiConc: 'Fatti · Ci sono siti dei concorrenti?',
  scaricaSitiConc: 'Fatti · Scarica i siti dei concorrenti',
  ifGoogle: 'Fatti · Google?',
  google: 'Fatti · Google: la scheda',
  ifTripadvisor: 'Fatti · TripAdvisor?',
  tripadvisor: 'Fatti · TripAdvisor: cerca',
  ifDataforseo: 'Fatti · DataForSEO?',
  dfsRecensioni: 'Fatti · DataForSEO: chiedi le recensioni',
  dfsVolumi: 'Fatti · DataForSEO: volumi',
  dfsPosizione: 'Fatti · DataForSEO: posizione',
  dfsAspetta: 'Fatti · Aspetta le recensioni',
  dfsPrendi: 'Fatti · DataForSEO: prendi le recensioni',
  ifInstagram: 'Fatti · Instagram?',
  instagram: 'Fatti · Instagram: profilo',
  profiliConc: 'Fatti · Instagram dei concorrenti',
  ifProfiliConc: 'Fatti · Instagram ai concorrenti?',
  instagramConc: 'Fatti · Instagram: concorrenti',
  componi: 'Fatti · Componi',
};

/** Le fonti a pagamento: voce del Config, credenziale n8n (nome e tipo), i nodi HTTP che chiamano. */
export const FONTI_A_PAGAMENTO = {
  google: { voce: 'FONTE_GOOGLE', stato: 'CREDENZIALE_GOOGLE', tetto: ['TETTO_GOOGLE_GIORNO', 20], se: N.ifGoogle, nodi: [N.google],
    credenziale: { nome: 'Rapporto - Google Places (chiave)', tipo: 'httpHeaderAuth', finta: { name: 'X-Goog-Api-Key', value: 'FINTO-DA-SOSTITUIRE' } } },
  tripadvisor: { voce: 'FONTE_TRIPADVISOR', stato: 'CREDENZIALE_TRIPADVISOR', tetto: ['TETTO_TRIPADVISOR_GIORNO', 20], se: N.ifTripadvisor, nodi: [N.tripadvisor],
    credenziale: { nome: 'Rapporto - TripAdvisor (chiave)', tipo: 'httpQueryAuth', finta: { name: 'key', value: 'FINTO-DA-SOSTITUIRE' } } },
  dataforseo: { voce: 'FONTE_DATAFORSEO', stato: 'CREDENZIALE_DATAFORSEO', tetto: ['TETTO_DATAFORSEO_GIORNO', 12], se: N.ifDataforseo,
    nodi: [N.dfsRecensioni, N.dfsVolumi, N.dfsPosizione, N.dfsPrendi],
    credenziale: { nome: 'Rapporto - DataForSEO (accesso)', tipo: 'httpBasicAuth', finta: { user: 'FINTO-DA-SOSTITUIRE', password: 'FINTO-DA-SOSTITUIRE' } } },
  instagram: { voce: 'FONTE_INSTAGRAM', stato: 'CREDENZIALE_INSTAGRAM', tetto: ['TETTO_INSTAGRAM_GIORNO', 60], se: N.ifInstagram, nodi: [N.instagram, N.instagramConc],
    credenziale: { nome: 'Rapporto - Instagram (token di MyCity)', tipo: 'httpQueryAuth', finta: { name: 'access_token', value: 'FINTO-DA-SOSTITUIRE' } } },
};

const DFS_ZONA = 'Piacenza,Emilia-Romagna,Italy';
const P = "$('Fatti · Prepara').first().json.fatti_piano";
const POS = "$('Fatti · Posizione').first().json.fatti_posizione";

const nodoCodice = (nome, js, position) => ({ id: randomUUID(), name: nome, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: { jsCode: js } });
const se = (nome, expr, position) => ({ id: randomUUID(), name: nome, type: 'n8n-nodes-base.if', typeVersion: 2.3, position, executeOnce: true,
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
    conditions: [{ id: randomUUID(), leftValue: expr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and' }, looseTypeValidation: true, options: {} } });
const risposta = (extra = {}) => ({ response: { response: { fullResponse: true, neverError: true, ...extra } }, timeout: 30000 });
const intestazioni = (lista) => ({ sendHeaders: true, headerParameters: { parameters: lista.map(([name, value]) => ({ name, value })) } });
const http = (nome, position, parametri, extra = {}) => ({ id: randomUUID(), name: nome, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position,
  onError: 'continueRegularOutput', alwaysOutputData: true, executeOnce: true, ...extra, parameters: parametri });
/** Un nodo a pagamento: con la credenziale vera è acceso; senza (credenziale finta) è SPENTO e senza credenziale. */
const aPagamento = (fonte, nodo, credenzialeId) => {
  const c = FONTI_A_PAGAMENTO[fonte].credenziale;
  nodo.parameters = { ...nodo.parameters, authentication: 'genericCredentialType', genericAuthType: c.tipo };
  if (credenzialeId) nodo.credentials = { [c.tipo]: { id: credenzialeId, name: c.nome } };
  else nodo.disabled = true;
  return nodo;
};

/** Le voci del Config che servono ai fatti. credenziali = { google: id?, … } (solo quelle con la chiave vera). */
export function vociConfig({ credenziali = {}, instagramId, accese = [] } = {}) {
  const voci = [['RAGGIO_VICINI_M', 400]];
  for (const [nome, f] of Object.entries(FONTI_A_PAGAMENTO)) {
    // «si» solo se Nicola la chiede accesa (--fonti-accese) E la credenziale è quella vera; TripAdvisor mai, finché non c'è un sì scritto.
    const si = accese.includes(nome) && !!credenziali[nome] && nome !== 'tripadvisor';
    voci.push([f.voce, si ? 'si' : 'no'], [f.stato, credenziali[nome] ? 'collegata' : 'finta'], f.tetto);
  }
  // L'id dell'account professionale Instagram di MyCity: lo dà Nicola al generatore, mai nel repository.
  voci.push(['INSTAGRAM_ID_MYCITY', instagramId && /^\d{5,30}$/.test(String(instagramId)) ? String(instagramId) : '']);
  return voci;
}

/**
 * I nodi dei fatti e i loro collegamenti, dall'ingresso (prima: «Fatti · Prepara») all'uscita («Fatti · Componi»).
 * opzioni: { credenziali: { google?, tripadvisor?, dataforseo?, instagram? } (id delle credenziali con la chiave vera) }
 */
export function nodiFatti([x, y], { credenziali = {} } = {}) {
  const pos = (i, riga = 0) => [x + i * 220, y + riga * 200];
  const UA = [['User-Agent', USER_AGENT], ['Accept-Language', 'it-IT,it']];
  const nodi = [
    nodoCodice(N.prepara, CODICE_FATTI_PREPARA, pos(0)),
    se(N.ifIndirizzo, `={{ ${P}.cerca_indirizzo === true }}`, pos(1)),
    http(N.nominatim, pos(2, -1), { method: 'GET', url: 'https://nominatim.openstreetmap.org/search',
      sendQuery: true, queryParameters: { parameters: [{ name: 'format', value: 'jsonv2' }, { name: 'limit', value: '1' }, { name: 'countrycodes', value: 'it' }, { name: 'q', value: `={{ ${P}.query_indirizzo }}` }] },
      ...intestazioni(UA), options: risposta() }),
    // OpenStreetMap: al massimo una richiesta al secondo, anche fra Nominatim e Overpass.
    { id: randomUUID(), name: N.aspetta1, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: pos(3, -1), parameters: { resume: 'timeInterval', amount: 1, unit: 'seconds' } },
    nodoCodice(N.posizione, CODICE_FATTI_POSIZIONE, pos(4)),
    se(N.ifPosizione, `={{ ${POS}.buona === true }}`, pos(5)),
    http(N.overpass, pos(6, -1), { method: 'POST', url: 'https://overpass-api.de/api/interpreter', ...intestazioni(UA),
      sendBody: true, contentType: 'form-urlencoded', bodyParameters: { parameters: [{ name: 'data', value: `={{ ${POS}.overpass_query }}` }] }, options: risposta() }),
    http(N.meteo, pos(7, -1), { method: 'GET', url: `={{ ${POS}.meteo_url }}`, ...intestazioni(UA), options: risposta() }),
    nodoCodice(N.radar, CODICE_FATTI_FONTI_RADAR, pos(8)),
    http(N.scaricaRadar, pos(9), { method: 'GET', url: '={{ $json.url }}', ...intestazioni(UA),
      options: { batching: { batch: { batchSize: 1, batchInterval: 1000 } }, ...risposta({ responseFormat: 'text' }), timeout: 20000 } }, { executeOnce: false, retryOnFail: true, maxTries: 2, waitBetweenTries: 3000 }),
    // ── parte 12: i siti dei concorrenti vicini, solo se OpenStreetMap li indica, una pagina ciascuno, rinvii non seguiti ──
    nodoCodice(N.sitiConc, CODICE_FATTI_CONCORRENTI, pos(9, 1)),
    // Tutti gli elementi vanno dalla stessa parte: o c'è almeno un sito da leggere, o niente.
    { ...se(N.ifSitiConc, `={{ $('${N.sitiConc}').all().some((x) => x.json.salta === false) }}`, pos(10, 1)), executeOnce: false },
    http(N.scaricaSitiConc, pos(11, 2), { method: 'GET', url: '={{ $json.url }}', ...intestazioni([['User-Agent', 'Mozilla/5.0 (compatible; lettore-pagine/1.0)'], ['Accept-Language', 'it-IT,it']]),
      options: { batching: { batch: { batchSize: 1, batchInterval: 1000 } }, redirect: { redirect: { followRedirects: false } }, ...risposta({ responseFormat: 'text' }), timeout: 15000 } }, { executeOnce: false }),
    // ── a pagamento: ogni chiamata dietro il suo IF, che ricontrolla la voce del Config ──
    se(N.ifGoogle, `={{ ${P}.chiama.google === true && $('Config').first().json.FONTE_GOOGLE === 'si' && $('Config').first().json.CREDENZIALE_GOOGLE === 'collegata' }}`, pos(10)),
    // Solo l'id (Text Search «IDs Only»): nient'altro da Google, per i termini EEA.
    aPagamento('google', http(N.google, pos(11, -1), { method: 'POST', url: 'https://places.googleapis.com/v1/places:searchText',
      ...intestazioni([['X-Goog-FieldMask', 'places.id']]), sendBody: true, specifyBody: 'json',
      jsonBody: `={{ JSON.stringify({ textQuery: [${P}.nome, ${P}.indirizzo || ${P}.citta].join(', '), languageCode: 'it', regionCode: 'IT', pageSize: 1 }) }}`, options: risposta() }), credenziali.google),
    se(N.ifTripadvisor, `={{ ${P}.chiama.tripadvisor === true && $('Config').first().json.FONTE_TRIPADVISOR === 'si' && $('Config').first().json.CREDENZIALE_TRIPADVISOR === 'collegata' }}`, pos(12)),
    aPagamento('tripadvisor', http(N.tripadvisor, pos(13, -1), { method: 'GET', url: 'https://api.content.tripadvisor.com/api/v1/location/search',
      sendQuery: true, queryParameters: { parameters: [{ name: 'searchQuery', value: `={{ ${P}.nome + ' ' + ${P}.citta }}` }, { name: 'category', value: `={{ ${P}.tripadvisor_categoria }}` }, { name: 'language', value: 'it' }] },
      ...intestazioni([['Accept', 'application/json']]), options: risposta() }), credenziali.tripadvisor),
    se(N.ifDataforseo, `={{ ${P}.chiama.dataforseo === true && $('Config').first().json.FONTE_DATAFORSEO === 'si' && $('Config').first().json.CREDENZIALE_DATAFORSEO === 'collegata' }}`, pos(14)),
    aPagamento('dataforseo', http(N.dfsRecensioni, pos(15, -1), { method: 'POST', url: 'https://api.dataforseo.com/v3/business_data/google/reviews/task_post',
      sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify([{ keyword: ${P}.nome + ' ' + ${P}.citta, location_name: '${DFS_ZONA}', language_code: 'it', depth: 100, sort_by: 'newest' }]) }}`, options: risposta() }), credenziali.dataforseo),
    aPagamento('dataforseo', http(N.dfsVolumi, pos(16, -1), { method: 'POST', url: 'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live',
      sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify([{ keywords: ${P}.parole_chiave, location_name: '${DFS_ZONA}', language_code: 'it' }]) }}`, options: risposta() }), credenziali.dataforseo),
    aPagamento('dataforseo', http(N.dfsPosizione, pos(17, -1), { method: 'POST', url: 'https://api.dataforseo.com/v3/serp/google/organic/live/regular',
      sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify([{ keyword: ${P}.parole_chiave[0] || ${P}.nome, location_name: '${DFS_ZONA}', language_code: 'it', depth: 30 }]) }}`, options: risposta() }), credenziali.dataforseo),
    { id: randomUUID(), name: N.dfsAspetta, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: pos(18, -1), parameters: { resume: 'timeInterval', amount: 60, unit: 'seconds' } },
    aPagamento('dataforseo', http(N.dfsPrendi, pos(19, -1), { method: 'GET',
      url: `={{ 'https://api.dataforseo.com/v3/business_data/google/reviews/task_get/' + encodeURIComponent(((($('${N.dfsRecensioni}').first().json.body || {}).tasks || [])[0] || {}).id || 'nessuno') }}`, options: risposta() }), credenziali.dataforseo),
    se(N.ifInstagram, `={{ ${P}.chiama.instagram === true && $('Config').first().json.FONTE_INSTAGRAM === 'si' && $('Config').first().json.CREDENZIALE_INSTAGRAM === 'collegata' }}`, pos(20)),
    aPagamento('instagram', http(N.instagram, pos(21, -1), { method: 'GET',
      url: `={{ 'https://graph.facebook.com/v21.0/' + $('Config').first().json.INSTAGRAM_ID_MYCITY }}`,
      sendQuery: true, queryParameters: { parameters: [{ name: 'fields', value: `={{ 'business_discovery.username(' + ${P}.profilo_instagram + '){username,followers_count,media_count,media.limit(30){timestamp,media_type,media_product_type,like_count,comments_count,permalink}}' }}` }] },
      options: risposta() }), credenziali.instagram),
    nodoCodice(N.profiliConc, CODICE_FATTI_PROFILI_CONCORRENTI, pos(22, 1)),
    { ...se(N.ifProfiliConc, `={{ $('${N.profiliConc}').all().some((x) => x.json.salta === false) && ${P}.chiama.instagram === true && $('Config').first().json.FONTE_INSTAGRAM === 'si' && $('Config').first().json.CREDENZIALE_INSTAGRAM === 'collegata' }}`, pos(23, 1)), executeOnce: false },
    aPagamento('instagram', http(N.instagramConc, pos(24, 2), { method: 'GET',
      url: `={{ 'https://graph.facebook.com/v21.0/' + $('Config').first().json.INSTAGRAM_ID_MYCITY }}`,
      sendQuery: true, queryParameters: { parameters: [{ name: 'fields', value: `={{ 'business_discovery.username(' + $json.profilo + '){username,followers_count,media_count,media.limit(30){timestamp,media_type,media_product_type,like_count,comments_count,permalink}}' }}` }] },
      options: { batching: { batch: { batchSize: 1, batchInterval: 1000 } }, ...risposta() } }, { executeOnce: false }), credenziali.instagram),
    nodoCodice(N.componi, CODICE_FATTI_COMPONI, pos(25)),
  ];
  const c = {};
  const vai = (da, ...verso) => { c[da] = { main: verso.map((v) => (v ? (Array.isArray(v) ? v : [v]).map((node) => ({ node, type: 'main', index: 0 })) : [])) }; };
  vai(N.prepara, N.ifIndirizzo);
  vai(N.ifIndirizzo, N.nominatim, N.posizione);
  vai(N.nominatim, N.aspetta1);
  vai(N.aspetta1, N.posizione);
  vai(N.posizione, N.ifPosizione);
  vai(N.ifPosizione, N.overpass, N.radar);
  vai(N.overpass, N.meteo);
  vai(N.meteo, N.radar);
  vai(N.radar, N.scaricaRadar);
  vai(N.scaricaRadar, N.sitiConc);
  vai(N.sitiConc, N.ifSitiConc);
  vai(N.ifSitiConc, N.scaricaSitiConc, N.ifGoogle);
  vai(N.scaricaSitiConc, N.ifGoogle);
  vai(N.ifGoogle, N.google, N.ifTripadvisor);
  vai(N.google, N.ifTripadvisor);
  vai(N.ifTripadvisor, N.tripadvisor, N.ifDataforseo);
  vai(N.tripadvisor, N.ifDataforseo);
  vai(N.ifDataforseo, N.dfsRecensioni, N.ifInstagram);
  vai(N.dfsRecensioni, N.dfsVolumi);
  vai(N.dfsVolumi, N.dfsPosizione);
  vai(N.dfsPosizione, N.dfsAspetta);
  vai(N.dfsAspetta, N.dfsPrendi);
  vai(N.dfsPrendi, N.ifInstagram);
  vai(N.ifInstagram, N.instagram, N.componi);
  vai(N.instagram, N.profiliConc);
  vai(N.profiliConc, N.ifProfiliConc);
  vai(N.ifProfiliConc, N.instagramConc, N.componi);
  vai(N.instagramConc, N.componi);
  // «Componi» e «Posizione» girano una volta sola, anche se arrivano più elementi (le pagine del radar).
  for (const n of nodi) if (n.type === 'n8n-nodes-base.code') n.executeOnce = ![N.radar, N.sitiConc, N.profiliConc].includes(n.name);
  return { nodi, collegamenti: c, ingresso: N.prepara, uscita: N.componi };
}

/** I controlli sui fatti (vuoto = a posto). Si chiamano da controlla() del 26. */
export function controllaFatti(w) {
  const problemi = [];
  const per = Object.fromEntries(w.nodes.map((n) => [n.name, n]));
  if (!per[N.prepara]) return problemi;
  const cfg = per.Config?.parameters?.assignments?.assignments || [];
  const valore = (nome) => cfg.find((a) => a.name === nome)?.value;
  // Chi arriva a un nodo: dai collegamenti.
  const entrate = {};
  for (const [da, uscite] of Object.entries(w.connections)) (uscite.main || []).forEach((ramo, i) => (ramo || []).forEach((v) => { (entrate[v.node] ||= []).push({ da, uscita: i }); }));
  for (const [nome, f] of Object.entries(FONTI_A_PAGAMENTO)) {
    if (!['no', 'si'].includes(valore(f.voce))) problemi.push(`${f.voce} nel Config è «${valore(f.voce)}»`);
    const stato = valore(f.stato);
    const frenatoSe = (nomeIf) => { const t = JSON.stringify(per[nomeIf]?.parameters?.conditions || {}); return t.includes(`chiama.${nome} === true`) && t.includes(`${f.voce} === 'si'`) && t.includes(`${f.stato} === 'collegata'`); };
    if (!frenatoSe(f.se)) problemi.push(`«${f.se}» non controlla i freni di ${nome}`);
    const frenato = (nomeIf) => { const t = JSON.stringify(per[nomeIf]?.parameters?.conditions || {});
      return per[nomeIf]?.type === 'n8n-nodes-base.if' && t.includes(`chiama.${nome} === true`) && t.includes(`${f.voce} === 'si'`) && t.includes(`${f.stato} === 'collegata'`); };
    f.nodi.forEach((n) => {
      const nodo = per[n];
      if (!nodo) { problemi.push(`manca «${n}»`); return; }
      const cred = nodo.credentials?.[f.credenziale.tipo];
      if (stato !== 'collegata' && !nodo.disabled) problemi.push(`«${n}» è acceso con la credenziale finta`);
      if (stato === 'collegata' && (!cred?.id || nodo.disabled)) problemi.push(`«${n}»: la credenziale è «collegata» ma il nodo non ce l'ha`);
      if (nodo.parameters?.authentication !== 'genericCredentialType' || nodo.parameters?.genericAuthType !== f.credenziale.tipo) problemi.push(`«${n}» non usa la sua credenziale`);
      // Si arriva a una chiamata a pagamento solo: dal «sì» di un IF con tutti e tre i freni della sua fonte, da un'altra
      // chiamata della stessa fonte, o da un'attesa fra due chiamate della stessa fonte.
      const da = entrate[n] || [];
      if (!da.length) problemi.push(`a «${n}» non si arriva da nessuna parte`);
      for (const e of da) {
        const buono = (frenato(e.da) && e.uscita === 0) || f.nodi.includes(e.da)
          || (per[e.da]?.type === 'n8n-nodes-base.wait' && (entrate[e.da] || []).every((x) => f.nodi.includes(x.da)));
        if (!buono) problemi.push(`a «${n}» si arriva da «${e.da}» senza i freni di ${nome}`);
      }
    });
    if (nodiSenzaFreno(w, f).length) problemi.push(`${nome}: chiamate a pagamento fuori dal loro IF (${nodiSenzaFreno(w, f).join(', ')})`);
  }
  // Google: solo il place_id (parere legale): nessun altro campo chiesto, nessuna ricerca dei vicini su Google.
  const mask = JSON.stringify(per[N.google]?.parameters?.headerParameters || {});
  if (!/"X-Goog-FieldMask","value":"places\.id"/.test(mask)) problemi.push('a Google si chiede più del place_id');
  if (w.nodes.some((n) => /places\.googleapis\.com\/v1\/places:searchNearby/.test(JSON.stringify(n.parameters || {})))) problemi.push('i concorrenti non si cercano su Google: solo OpenStreetMap');
  return problemi;
}

/** I nodi HTTP che vanno verso l'host di una fonte a pagamento senza essere fra i suoi nodi (quindi senza freno). */
const HOST = { google: /googleapis\.com/, tripadvisor: /tripadvisor\.com/, dataforseo: /dataforseo\.com/, instagram: /graph\.facebook\.com|graph\.instagram\.com/ };
function nodiSenzaFreno(w, f) {
  const nome = Object.keys(FONTI_A_PAGAMENTO).find((k) => FONTI_A_PAGAMENTO[k] === f);
  return w.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest' && HOST[nome].test(JSON.stringify(n.parameters?.url || '')) && !f.nodi.includes(n.name)).map((n) => n.name);
}
