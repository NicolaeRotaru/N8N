// 24 · Prepara il lavoro — il compito per «Chiedi all'AD»: fra i titoli nuovi, cosa conta per MyCity.
// Senza titoli nuovi, in prova, o se non si è letta nessuna fonte, l'AD non si accende.
const cfg = $('Config').first().json;
const r = $('Estrai i titoli').first().json;
const VERO = String(cfg.MODALITA || '').trim().toLowerCase() === 'vero';
const lavoro = {
  flusso: '24 · Radar del web',
  compito: 'Sei l’AD di MyCity, il marketplace dei negozi di Piacenza (consegna locale, negozi del centro). Nei dati ci sono i titoli NUOVI di oggi da giornali locali, Comune, Camera di Commercio, associazioni, concorrenti ed eventi, ognuno con cosa cercarci. ' +
    'Scegli al massimo 5 notizie che contano davvero per MyCity (un negozio che apre o chiude, un bando, un evento che porta gente in centro, una mossa di un concorrente, il meteo che cambia gli ordini). Per ognuna: una riga con la notizia e la fonte, una riga con cosa può fare MyCity. ' +
    'Usa solo i titoli dei dati: non inventare dettagli che il titolo non dice, e dillo se serve aprire l’articolo per sapere di più. Se niente conta, scrivi «Niente di utile oggi». Italiano semplice, al massimo 1500 caratteri, senza markdown.',
  dati: { fonti: r.fonti.filter((f) => f.letta && f.nuovi && f.nuovi.length).map((f) => ({ fonte: f.nome, tipo: f.tipo, cosa_cercare: f.cosa_cercare, titoli: f.nuovi })), non_lette: r.non_lette },
  schema: { type: 'object', properties: { testo: { type: 'string' } }, required: ['testo'] },
};
if (!VERO) lavoro.non_mandare = 'modalità prova del flusso 24';
else if (!r.lette) lavoro.non_mandare = 'nessuna fonte letta';
else if (!r.nuovi_totali) lavoro.non_mandare = 'nessun titolo nuovo';
// Il tetto di «Chiedi all'AD» è 64 KB: si tolgono titoli dalle fonti più lunghe finché ci sta.
while (JSON.stringify(lavoro).length > 50000 && lavoro.dati.fonti.some((f) => f.titoli.length > 3)) {
  const piuLunga = lavoro.dati.fonti.reduce((a, b) => (b.titoli.length > a.titoli.length ? b : a));
  piuLunga.titoli.pop();
}
return [{ json: lavoro }];
