// (fine del giro) Si toglie il segno dalla cartella «Pronti» solo se è ancora questo giro: con «rifai» un giro nuovo può
// aver riscritto la stessa cartella, e toglierlo libererebbe il posto mentre quello lavora ancora. Il confronto è sulla
// fine stimata scritta alla partenza (Config.pronti.fine). Se la cartella non si legge, il segno resta (si libera alla
// fine stimata) e il team lo sa.
const J = $('Config').first().json;
const r = $input.first().json || {};
const mia = testo(J.pronti && J.pronti.fine);
if (r.error) return [{ json: { libera: false, avviso: 'non riesco a leggere la cartella «Pronti» (' + accorcia(testo(r.error.message || r.error), 160) + ')' } }];
const scritta = testo(((r.appProperties) || {}).montatore_fine);
return [{ json: { libera: !!mia && scritta === mia } }];
