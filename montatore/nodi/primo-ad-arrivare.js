// (partenza) Dopo aver messo il segno si rilegge l'elenco dei giri in corso: se un altro giro ha messo il suo segno un
// attimo prima (due moduli lanciati insieme, o il modulo e il guardiano nello stesso minuto), questo non parte e toglie il
// suo segno. Vince chi è arrivato prima (montatore_inizio; a parità, l'id più piccolo). «subito» in testa alle note parte
// lo stesso. Se l'elenco non arriva si parte: il controllo prima di mettere il segno c'è già stato.
const L = $('Segno sulla cartella').first().json;
const J = $('Config').first().json;
if (comandiNote(J.note).subito) return [{ json: L }];
const el = $input.first().json || {};
if (el.error || !Array.isArray(el.files)) return [{ json: L }];
const ora = Date.now();
const mio = L.pronti || {};
const mioInizio = Date.parse(mio.inizio || '') || ora;
const prima = el.files.filter((f) => f && f.id !== mio.id).filter((f) => {
  const p = f.appProperties || {};
  const fine = Date.parse(p.montatore_fine || '');
  if (!Number.isFinite(fine) || fine <= ora) return false;
  const inizio = Date.parse(p.montatore_inizio || '');
  // un segno senza inizio viene da una versione di prima: è partito prima
  return !Number.isFinite(inizio) || inizio < mioInizio || (inizio === mioInizio && String(f.id) < String(mio.id));
});
if (!prima.length) return [{ json: L }];
return [{ json: { ok: false, togli: testo(mio.id), messaggio: 'Un altro giro del montatore è partito pochi istanti prima: questo non parte, per non far lavorare due giri insieme. Rilancia dopo, oppure scrivi «subito» all\'inizio delle note.' } }];
