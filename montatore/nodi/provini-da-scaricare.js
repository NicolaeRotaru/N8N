// Il catalogo è pronto: un elemento per provino da scaricare (le immagini da far vedere a Claude).
const J = $('Config').first().json;
const c = $input.first().json || {};
if (c.error || !Array.isArray(c.provini) || !c.provini.length) {
  return [{ json: { fermo: true, messaggio: '⚠️ <b>Montatore fermo</b> · ' + h(J.cliente.nome_locale) + '\nL\'officina non ha preparato il catalogo: ' + h(accorcia(testo(c.error && (c.error.message || c.error)) || 'nessun provino', 300)) } }];
}
return c.provini.map((p, i) => ({ json: { i, percorso: percorsoOfficina(p.url), codici: p.codici } }));
