// 18 · Leggi la richiesta — quale attività analizzare.
// Arriva in due modi: dal flusso 16 (un'attività appena iscritta su MyCity, con la scheda del modulo 12)
// o dal webhook «Su richiesta» (protetto dal segreto), per rifare l'analisi quando serve.
// L'identificativo finisce dentro un indirizzo del database: si accetta solo un UUID, niente altro.
const testo = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const unaRiga = (v) => testo(v).replace(/\s+/g, ' ');
const taglia = (v, n) => Array.from(unaRiga(v)).slice(0, n).join('');
const lista = (v, quanti, lung) => (Array.isArray(v) ? v.map((x) => taglia(x, lung)).filter(Boolean).slice(0, quanti) : []);

const daWebhook = $('Su richiesta').isExecuted;
const entrata = daWebhook ? ($('Su richiesta').first().json || {}).body || {} : $('Da un altro flusso').first().json || {};
const id = testo(entrata.id || entrata.id_mycity).toLowerCase();
const nome = taglia(entrata.nome || entrata.nome_locale, 80);
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
  return [{ json: { valida: false, nome, motivo: "l'identificativo MyCity dell'attività manca o non è valido" } }];
}
// La scheda del modulo 12 (lettura delle fonti pubbliche fatta da Claude): solo i campi che servono, accorciati.
const s = entrata.scheda && typeof entrata.scheda === 'object' ? entrata.scheda : null;
const a = s && s.analisi && typeof s.analisi === 'object' ? s.analisi : {};
const scheda = s ? {
  tipo_di_locale: taglia(a.tipo_di_locale, 200), pubblico: taglia(a.pubblico, 200), tono_consigliato: taglia(a.tono_consigliato, 120),
  punti_di_forza: lista(a.punti_di_forza, 4, 160), idee_contenuti: lista(a.idee_contenuti, 4, 160),
  cosa_chiedere_al_titolare: lista(a.cosa_chiedere_al_titolare, 5, 200), dubbi: lista(a.dubbi, 4, 200),
  da_confermare: lista(s.da_confermare, 15, 40), sito_ufficiale: taglia(s.sito_ufficiale, 200),
} : null;
return [{ json: {
  valida: true, id, nome, scheda,
  origine: daWebhook ? 'su richiesta' : taglia(entrata.origine || 'da un altro flusso', 80),
  esito_scheda: taglia(entrata.esito_scheda, 120),
} }];
