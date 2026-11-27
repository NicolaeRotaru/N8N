// (inizio del giro) Due partenze nello stesso momento (doppio invio del modulo, o modulo e guardiano nello stesso minuto)
// passano entrambe il controllo prima del segno. Per questo il giro aspetta 45 secondi dopo aver scritto il suo segno e
// rilegge l'elenco. Regole (l'orologio è quello di n8n, lo stesso per tutti i giri):
// - il mio segno è stato scritto più di 40 secondi dopo il mio inizio (Drive lento): un giro partito poco dopo di me può
//   aver riletto prima di vederlo e stare già lavorando. Non posso saperlo: mi fermo;
// - un altro giro ha preso la MIA cartella dopo di me (stesso servizio, due «rifai»): mi fermo e non tocco la cartella;
// - un altro giro è partito prima di me (montatore_inizio più vecchio, o senza inizio; a parità decide l'id): mi fermo.
// Perché basta: se A è partito prima di B e ha scritto entro 40 s, B rilegge almeno 45 s dopo il proprio inizio, quindi
// dopo il segno di A, e si ferma; A parte. Con Drive lentissimo per tutti possono fermarsi entrambi, e lo dicono.
// «subito» scritto nel modulo salta il controllo. Un elenco che non arriva o incompleto vale «non lo so»: mi fermo.
const J = $('Config').first().json;
const RITARDO_MAX = 40000;
if (J.subito === true) return [{ json: { parti: true } }];
const mio = J.pronti || {};
const mioInizio = Date.parse(mio.inizio || '');
if (!mio.id || !Number.isFinite(mioInizio)) return [{ json: { parti: true } }];
const servizio = 'Il giro di «' + h(J.servizio && J.servizio.nome) + '» (' + h(J.cliente && J.cliente.nome_locale) + ') non parte: ';
const rifare = ' Per rifarlo: modulo con «rifai» all\'inizio delle note' + (J.origine === 'cartella' ? ' (il guardiano non lo rifà da solo).' : '.');
const fermati = (perche, tocca = true) => [{ json: { parti: false, tocca, cestina: tocca && mio.crea === true, id: mio.id, messaggio: '⚠️ ' + servizio + perche + rifare } }];
// con «rifai» la cartella non si tocca: potrebbe esserci sopra un altro giro al lavoro. Il segno resta fino alla fine
// stimata, e il messaggio dice fino a che ora e come partire prima
const fineMia = Date.parse(mio.fine || '');
const restaFino = Number.isFinite(fineMia) ? ' Il segno sulla cartella resta fino alle ' + partiRoma(new Date(fineMia)).ora + ': per rifarlo prima, «rifai subito» all\'inizio delle note.' : '';
const fermatiSenzaToccare = (perche) => (mio.crea === true ? fermati(perche) : [{ json: { ...fermati(perche, false)[0].json, messaggio: fermati(perche, false)[0].json.messaggio + restaFino } }]);
const segnato = Date.parse(mio.segnato || '');
if (Number.isFinite(segnato) && segnato - mioInizio > RITARDO_MAX) return fermatiSenzaToccare('Drive ha risposto lentamente, e non posso essere sicuro che un altro giro partito insieme abbia visto il mio segno.');
const el = $input.first().json || {};
if (el.error || !Array.isArray(el.files) || el.nextPageToken || el.incompleteSearch) return fermatiSenzaToccare('non riesco a controllare su Drive se un altro giro è partito insieme.');
const ora = Date.now();
const attivi = el.files.filter((f) => f && Date.parse(((f.appProperties) || {}).montatore_fine || '') > ora);
const quando = (f) => Date.parse(((f.appProperties) || {}).montatore_inizio || '');
const stessa = attivi.find((f) => f.id === mio.id);
if (stessa && Number.isFinite(quando(stessa)) && quando(stessa) !== mioInizio) return fermati('un altro giro ha preso la stessa cartella subito dopo (due «rifai» insieme). Va avanti quello.', false);
const prima = attivi.filter((f) => f.id !== mio.id).find((f) => {
  const t = quando(f);
  return !Number.isFinite(t) || t < mioInizio || (t === mioInizio && String(f.id) < String(mio.id));
});
if (prima) return fermati('un altro giro del montatore è partito insieme, e due giri insieme sfasano il conto delle corse dell\'AD.');
return [{ json: { parti: true } }];
