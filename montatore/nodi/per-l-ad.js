// Per l'AD: ogni richiesta (corpo, ed eventuali percorsi delle immagini nell'officina) diventa un lavoro per
// «90 · Chiedi all'AD». Tutti gli elementi insieme fanno una corsa sola della routine dell'AD.
return $input.all().map((x, i) => ({ json: lavoroAD(x.json && x.json.corpo, x.json && x.json.percorsi), pairedItem: { item: i } }));
