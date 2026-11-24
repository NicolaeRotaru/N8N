// Un'esecuzione «monta» per contenuto, con tutto quello che le serve.
const J = $('Config').first().json;
const P = $('Piano finale').first().json;
const usc = $('Trova la cartella d\'uscita').first().json;
let cartella = usc.id;
if (!cartella && $('Crea la cartella d\'uscita').isExecuted) cartella = testo(($('Crea la cartella d\'uscita').first().json || {}).id);
if (!cartella) return [{ json: { fermo: true, messaggio: '⚠️ <b>Montatore fermo</b> · ' + h(J.cliente.nome_locale) + '\nNon riesco a creare la cartella «' + h(usc.nome) + '» su Drive.' } }];
const progetto = $('Officina: nuovo progetto').first().json.progetto;
return P.contenuti.map((c, i) => ({ json: {
  lavoro: 'monta',
  progetto,
  n: i + 1,
  di: P.contenuti.length,
  contenuto: c,
  marchio: J.cliente.marchio,
  marchio_valido: J.cliente.marchio_valido !== false,
  versione: 1,
  logo: J.cliente.logo || { tipo: 'nessuno' },
  musica: J.musica,
  cartella_uscita: cartella,
  cliente: { cliente: J.cliente.cliente, nome_locale: J.cliente.nome_locale },
  controllo: siNo(J.USA_CONTROLLO, true),
} }));
