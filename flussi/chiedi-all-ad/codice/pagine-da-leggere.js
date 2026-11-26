// Pagine da leggere · dalla risposta dell'AD agli indirizzi che n8n scarica (al massimo MAX_LETTURE del Config).
// Prima il sito che l'attività ha dichiarato, poi la riga «PAGINE DA LEGGERE:» dell'AD, poi i campi «URL:»,
// poi ogni altro indirizzo scritto negli appunti. Mai Meta, mappe, portali o indirizzi interni.
// Esce con un elemento per pagina ({ leggi: true, url }), oppure uno solo con leggi: false.
// Inserito da N8N/flussi/chiedi-all-ad/leggi-pagine.mjs: le modifiche vanno fatte lì.
__INDIRIZZI__
const LP = LI;
const cfg = $('Config').first().json;
const MAX = Math.min(10, Math.max(1, Number(cfg.MAX_LETTURE) || 10));
const r = $input.first().json || {};
const salta = (motivo, scartati = []) => [{ json: { leggi: false, motivo, scartati } }];
if (r.statusCode !== 200 || !r.body || !Array.isArray(r.body.content)) return salta("l'AD non ha risposto: niente da leggere");
// Solo le risposte dell'AD: la risposta dell'API di prima portava già il testo delle pagine lette.
if (!r.body.fatto_da) return salta("la ricerca non l'ha fatta l'AD: le pagine sono già nella risposta");
const appunti = r.body.content.filter((b) => b && b.type === 'text').map((b) => LP.testo(b.text)).join('\n');
const base = $('Prepara la ricerca').first().json;
const candidati = [];
if (base && base.richiesta && base.richiesta.sito) candidati.push(base.richiesta.sito);
for (const riga of appunti.split(/\r?\n/)) {
  const m = riga.match(/PAGINE\s+DA\s+LEGGERE\s*:?(.*)$/i);
  if (m) candidati.push(...LP.indirizziIn(m[1]));
}
for (const m of appunti.matchAll(/URL\s*:\s*(\S+)/gi)) candidati.push(m[1]);
candidati.push(...LP.indirizziIn(appunti));

const visti = new Set();
const pagine = [];
const scartati = [];
for (const c of candidati) {
  const v = LP.indirizzoSicuro(c);
  if (!v.ok) { if (v.url && !scartati.some((s) => s.url === v.url)) scartati.push({ url: LP.taglia(v.url, 200), motivo: v.motivo }); continue; }
  if (visti.has(v.chiave)) continue;
  visti.add(v.chiave);
  if (pagine.length < MAX) pagine.push(v.url);
}
if (!pagine.length) return salta("negli appunti dell'AD non c'è nessun indirizzo da leggere", scartati.slice(0, 20));
return pagine.map((url, i) => ({ json: { leggi: true, url, giro: 1, ...(i === 0 ? { scartati: scartati.slice(0, 20) } : {}) } }));
