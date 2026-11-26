// (inizio del giro) Due partenze nello stesso momento (doppio invio del modulo, o modulo e guardiano nello stesso minuto)
// passano entrambe il controllo prima del segno. Per questo il giro, prima di cominciare, aspetta 45 secondi (i segni di
// tutte le partenze di quel momento sono scritti) e rilegge l'elenco. Regole, uguali per tutti i giri, così ne resta uno:
// - un altro giro ha preso la MIA cartella dopo di me (stesso servizio, due «rifai»): mi fermo e non tocco la cartella;
// - un altro giro è partito prima di me (montatore_inizio più vecchio; a parità decide l'id): mi fermo;
// - un altro giro è partito dopo di me, ma da più di 135 secondi (45 di attesa + 90 di margine): ha già fatto questo
//   controllo e sta lavorando, e io sono arrivato in ritardo (Drive lento): mi fermo io.
// «subito» in testa alle note salta il controllo. Se l'elenco non arriva si parte: il controllo prima del segno c'è stato.
const J = $('Config').first().json;
const ATTESA = 45000;
const MARGINE = 90000;
if (comandiNote(J.note).subito) return [{ json: { parti: true } }];
const el = $input.first().json || {};
if (el.error || !Array.isArray(el.files)) return [{ json: { parti: true } }];
const ora = Date.now();
const mio = J.pronti || {};
const mioInizio = Date.parse(mio.inizio || '');
if (!mio.id || !Number.isFinite(mioInizio)) return [{ json: { parti: true } }];
const attivi = el.files.filter((f) => f && Date.parse(((f.appProperties) || {}).montatore_fine || '') > ora);
const stessa = attivi.find((f) => f.id === mio.id);
const quando = (f) => Date.parse(((f.appProperties) || {}).montatore_inizio || '');
const servizio = 'Il giro di «' + h(J.servizio && J.servizio.nome) + '» (' + h(J.cliente && J.cliente.nome_locale) + ') non parte: ';
const rifare = ' Per rifarlo, quando l\'altro ha finito: modulo con «rifai» all\'inizio delle note.';
if (stessa && Number.isFinite(quando(stessa)) && quando(stessa) !== mioInizio) {
  return [{ json: { parti: false, tocca: false, messaggio: '⚠️ ' + servizio + 'un altro giro ha preso la stessa cartella subito dopo (due «rifai» insieme). Va avanti quello.' } }];
}
const prima = attivi.filter((f) => f.id !== mio.id).find((f) => {
  const t = quando(f);
  if (!Number.isFinite(t)) return true; // un segno senza inizio viene da una versione di prima: è partito prima
  if (t < mioInizio || (t === mioInizio && String(f.id) < String(mio.id))) return true;
  return t < ora - (ATTESA + MARGINE);
});
if (!prima) return [{ json: { parti: true } }];
return [{ json: { parti: false, tocca: true, cestina: mio.crea === true, id: mio.id, messaggio: '⚠️ ' + servizio + 'un altro giro del montatore è partito insieme, e due giri insieme sfasano il conto delle corse dell\'AD.' + rifare } }];
