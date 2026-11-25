// 25 · Prepara il lavoro per l'AD — i numeri li ha già fatti «Calcola i numeri» (lo stesso codice del
// 17). Qui si decide se è il piano del mattino o il report della sera e si scrive il compito per
// «Chiedi all'AD»: istruzioni per esteso, i numeri come dati, lo schema della risposta.
// In MODALITA prova il lavoro parte con «non_mandare»: la routine dell'AD non si accende e non si conta.

const cfg = $('Config').first().json;
const a = $('Calcola i numeri').first().json;
const VERO = String(cfg.MODALITA || '').trim().toLowerCase() === 'vero';
const ora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const forzato = String(cfg.MOMENTO || '').trim().toLowerCase();
const momento = forzato === 'mattino' || forzato === 'sera' ? forzato : (ora < 12 ? 'mattino' : 'sera');

const COMUNE = 'Scrivi in italiano semplice, per Nicola, il proprietario di MyCity (il marketplace dei negozi di Piacenza). ' +
  'I numeri nei dati sono misurati dal codice: usali così come sono, non inventarne altri e non ricalcolarli. ' +
  'Un valore null vuol dire «non misurato»: dillo, non scriverlo come zero. «gap» elenca cosa non si è potuto leggere. ' +
  'Niente sigle tecniche, niente percorsi di file. Al massimo 1200 caratteri, testo semplice senza markdown.';
const COMPITI = {
  mattino: `${COMUNE} È il PIANO DEL MATTINO: apri con «Il punto adesso» (due frasi), poi le tre mosse più utili di oggi per arrivare a più ordini pagati, ognuna con chi la fa e perché, partendo dalle sentinelle accese. Chiudi con una riga «Cosa non ho verificato».`,
  sera: `${COMUNE} È il REPORT DELLA SERA: apri con «Com'è andata oggi» (due frasi, coi numeri delle ultime 24 ore e il confronto col giro prima in «delta»), poi cosa resta aperto per domani partendo dalle sentinelle accese. Chiudi con una riga «Cosa non ho verificato».`,
};
const lavoro = {
  flusso: '25 · Numeri del mattino e della sera',
  compito: COMPITI[momento],
  dati: { momento, quando: a.quando, numeri: a.numeri, delta: a.delta, sentinelle: a.sentinelle, negozi_fermi: a.negozi_fermi, gap: a.gap, cieco: a.cieco },
  schema: { type: 'object', properties: { testo: { type: 'string' } }, required: ['testo'] },
};
if (!VERO) lavoro.non_mandare = 'modalità prova del flusso 25';
else if (a.cieco) lavoro.non_mandare = 'database non leggibile: niente numeri da commentare';
return [{ json: lavoro }];
