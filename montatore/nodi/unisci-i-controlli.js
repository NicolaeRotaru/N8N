// (giro) I giudizi dell'AD tornano negli esiti dei montaggi, al loro posto; i contenuti non controllati restano come
// sono («non controllato»). Escono gli stessi elementi del montaggio, nello stesso ordine.
const esiti = $('Monta il contenuto').all().map((x) => ({ ...(x.json || {}) }));
if ($("Dall'AD: controlla i reel").isExecuted) {
  const domande = $('Domande di controllo').all().map((x) => x.json || {});
  const risposte = $("Dall'AD: controlla i reel").all().map((x) => x.json || {});
  domande.forEach((d, k) => {
    if (d.nessuno || !Number.isInteger(d.indice) || !esiti[d.indice]) return;
    esiti[d.indice].controllo = giudizioControllo(risposte[k] || {});
  });
}
return esiti.map((json) => ({ json }));
