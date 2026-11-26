// (inizio del giro) Il messaggio di chi si ferma perché un altro giro è partito insieme. Se il segno non si è potuto
// togliere, lo dice con l'ora in cui si libera da solo.
const P = $('Primo ad arrivare?').first().json;
const J = $('Config').first().json;
const r = $('Togli il mio segno').isExecuted ? $('Togli il mio segno').first().json || {} : {};
let messaggio = P.messaggio;
if (P.tocca && (r.error || !r.id)) {
  const fine = Date.parse(testo(J.pronti && J.pronti.fine));
  const quando = Number.isFinite(fine) ? partiRoma(new Date(fine)) : null;
  messaggio += '\nAttenzione: non sono riuscito a togliere il segno dalla cartella «Pronti» (' + h(accorcia(testo(r.error && (r.error.message || r.error)) || 'nessuna risposta', 160)) + '): fino alle ' + (quando ? quando.ora : '?') + ' il modulo dirà che un giro è in corso. Per partire prima: «rifai subito» all\'inizio delle note.';
}
return [{ json: { messaggio } }];
