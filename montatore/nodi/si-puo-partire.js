// (partenza) Un giro alla volta (Nicola, 26/11): dal modulo, se un altro giro del montatore sta ancora lavorando (una
// cartella «Pronti» con la fine stimata nel futuro), non si parte e si dice fino a che ora. «subito» in testa alle note parte lo
// stesso. Dal guardiano delle cartelle il controllo l'ha già fatto «Guarda: servizi pronti».
// Due giri insieme fanno partire «90 · Chiedi all'AD» in parallelo, e il conto delle sue corse si sfasa.
const J = $('Config').first().json;
const P = $('Prepara il lavoro').first().json;
if (J.origine === 'cartella' || comandiNote(J.note).subito) return [{ json: P }];
const el = $input.first().json || {};
if (el.error || !Array.isArray(el.files) || el.nextPageToken || el.incompleteSearch) {
  return [{ json: { ok: false, messaggio: 'Non riesco a controllare su Drive se un altro giro del montatore sta lavorando. Riprova fra qualche minuto, oppure scrivi «subito» all\'inizio delle note per partire lo stesso.' } }];
}
const ora = Date.now();
// la fine più lontana fra i giri in corso (una fine oltre 24 ore vale 24 ore: tiene fermo al massimo un giorno)
const fine = Math.max(0, ...el.files.map((f) => Date.parse(((f && f.appProperties) || {}).montatore_fine || '')).filter((t) => Number.isFinite(t) && t > ora).map((t) => Math.min(t, ora + 24 * 3600000)));
if (!fine) return [{ json: P }];
const quando = partiRoma(new Date(fine));
const oggi = partiRoma(new Date(ora)).data === quando.data;
return [{ json: { ok: false, messaggio: 'C\'è un altro giro del montatore in corso, fino alle ' + quando.ora + (oggi ? '' : ' del ' + quando.giorno + '/' + quando.mese) + ' circa. Due giri insieme sfasano il conto delle corse dell\'AD: rilancia dopo, oppure scrivi «subito» all\'inizio delle note per partire lo stesso.' } }];
