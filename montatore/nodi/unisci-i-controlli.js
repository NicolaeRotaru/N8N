// (giro) I giudizi dell'AD tornano negli esiti dei montaggi, al loro posto; i contenuti non controllati restano come
// sono («non controllato»). Escono gli stessi elementi del montaggio, nello stesso ordine.
const esiti = $('Monta il contenuto').all().map((x) => ({ ...(x.json || {}) }));
if ($("Dall'AD: controlla i reel").isExecuted) {
  const domande = $('Domande di controllo').all().map((x) => x.json || {});
  const risposte = $("Dall'AD: controlla i reel").all().map((x) => x.json || {});
  const chiesti = new Set();
  domande.forEach((d, k) => {
    if (d.nessuno || !Number.isInteger(d.indice) || !esiti[d.indice]) return;
    chiesti.add(d.indice);
    esiti[d.indice].controllo = giudizioControllo(risposte[k] || {});
    // quello che l'AD ha detto guardando il reel (es. «il provino non si apriva») arriva nel riepilogo, col titolo
    const detti = (Array.isArray((risposte[k] || {}).avvisi) ? risposte[k].avvisi : []).map((a) => accorcia(testo(a && (a.messaggio || a)), 200)).filter(Boolean);
    if (detti.length) esiti[d.indice].avvisi = [...(esiti[d.indice].avvisi || []), ...detti.map((a) => testo((esiti[d.indice].contenuto || {}).titolo) + ': ' + a)];
  });
  // i reel oltre il tetto di una corsa (vedi «Domande di controllo»): restano da guardare a voi, e il riepilogo lo dice
  esiti.forEach((e, i) => {
    if (!chiesti.has(i) && e.ok && testo(e.fotogrammi) && e.contenuto && e.contenuto.tipo === 'reel') {
      e.controllo = { esito: 'non_controllato', motivo: "oltre i reel che l'AD guarda in una corsa: guardatelo voi", oltre_il_tetto: true };
    }
  });
}
return esiti.map((json) => ({ json }));
