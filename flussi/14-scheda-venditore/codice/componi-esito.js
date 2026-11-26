// 14 · Scheda per il venditore · Componi l'esito
// Da quello che torna da «90 · Chiedi all'AD» ({ ok, risultato, avvisi, errore, prova }) alla riga della tabella.
const l = $('Controlla il lavoro').first().json;
const r = ($input.first() && $input.first().json) || {};
const secondi = Math.max(0, Math.round((Date.now() - Number(l.iniziato || Date.now())) / 1000));
const testo = (v, max) => String(v == null ? '' : v).slice(0, max);
let stato = 'errore';
let errore = '';
if (r.prova) errore = "«Chiedi all'AD» è in prova: la routine non è partita";
else if (r.ok === true && r.risultato && typeof r.risultato === 'object') stato = 'pronta';
else errore = testo(r.errore || (r.error && (r.error.message || r.error)) || "l'AD non ha risposto", 400);
let risultato = '';
if (stato === 'pronta') {
  risultato = JSON.stringify(r.risultato);
  if (risultato.length > 200000) { stato = 'errore'; errore = 'risposta troppo grande'; risultato = ''; }
}
const avvisi = JSON.stringify((Array.isArray(r.avvisi) ? r.avvisi : []).map((a) => testo(a, 300)).slice(0, 10));
return [{ json: { lavoro: l.lavoro, stato, risultato, avvisi, errore, secondi } }];
