// Dentro la cartella Drive del cliente, la cartella del servizio scritta nel modulo (o un link incollato).
const CFG = $('Config').first().json;
const T = $('Trova il cliente').first().json;
const r = $input.first().json || {};
const scritto = testo(CFG.cartella);
const no = (messaggio) => [{ json: { ok: false, messaggio } }];
if (/drive\.google\.com/i.test(scritto) && idDrive(scritto)) {
  // dal guardiano delle cartelle arriva anche il nome vero della cartella
  return [{ json: { ok: true, servizio: { id: idDrive(scritto), nome: testo(CFG.servizio_nome) || 'cartella dal link' } } }];
}
if (!scritto) return no('Scrivi il nome della cartella del servizio (quella che contiene «video verticali», «video orizzontali» e «foto»).');
if (r.error || !Array.isArray(r.files)) return no('Non riesco a leggere la cartella Drive di ' + T.nome_locale + '. Controlla che la credenziale «Google Drive - Agenzia» la possa vedere.');
const k = chiaveNome(scritto);
const cartelle = r.files.filter((f) => !testo(f.name).startsWith('_')).sort(perNome);
let c = cartelle.filter((f) => chiaveNome(f.name) === k);
if (!c.length) c = cartelle.filter((f) => chiaveNome(f.name).includes(k));
if (c.length > 1) return no('Nella cartella di ' + T.nome_locale + ' ci sono più cartelle che somigliano a «' + scritto + '»: ' + c.map((f) => f.name).join(', ') + '. Scrivi il nome esatto.');
if (!c.length) return no('Nella cartella di ' + T.nome_locale + ' non trovo «' + scritto + '». Cartelle che ci sono: ' + (accorcia(cartelle.map((f) => f.name).join(', '), 600) || 'nessuna') + '.');
return [{ json: { ok: true, servizio: { id: c[0].id, nome: testo(c[0].name) } } }];
