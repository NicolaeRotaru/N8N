// (fine del giro) Il segno sulla cartella «Pronti» non si è potuto togliere: il modulo dirà «giro in corso» fino alla fine
// stimata. Lo si dice al team, con l'ora e la via d'uscita.
const J = $('Config').first().json;
const x = $input.first().json || {};
const fine = Date.parse(testo(J.pronti && J.pronti.fine));
const quando = Number.isFinite(fine) ? partiRoma(new Date(fine)) : null;
const motivo = x.avviso || ('Drive non ha accettato la modifica' + (x.error ? ' (' + accorcia(testo(x.error.message || x.error), 160) + ')' : ''));
return [{ json: { messaggio: '⚠️ <b>Montatore</b> · ' + h(J.cliente && J.cliente.nome_locale) + ' · il giro è finito, ma ' + h(motivo) + '.\nFino alle ' + (quando ? quando.ora + (quando.data !== partiRoma().data ? ' del ' + quando.giorno + '/' + quando.mese : '') : '?') + ' il modulo dirà che un giro è in corso: per partire prima, scrivete «subito» all\'inizio delle note.' } }];
