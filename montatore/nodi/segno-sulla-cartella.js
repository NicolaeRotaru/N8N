// (partenza) Il giro parte solo se la sua cartella «Pronti» porta la fine stimata (creata adesso, o segnata con «rifai»):
// è il segno che il guardiano delle cartelle e il modulo leggono per non far partire un altro giro insieme. A fine giro
// il segno si toglie («Libera il posto»). L'id della cartella viaggia col lavoro.
const L = $('Prepara la partenza').first().json;
const r = $input.first().json || {};
const id = testo(r.id);
if (r.error || !id) {
  const motivo = accorcia(testo(r.error && (r.error.message || r.error)) || 'nessuna risposta', 200);
  return [{ json: { ok: false, messaggio: 'Non riesco a scrivere su Drive la cartella «' + testo(L.pronti && L.pronti.nome) + '» (' + motivo + '): senza quel segno il guardiano non saprebbe che il giro sta lavorando. Riprova fra qualche minuto.' } }];
}
return [{ json: { ...L, pronti: { ...(L.pronti || {}), id } } }];
