// Dall'AD: la risposta di «90 · Chiedi all'AD» (un elemento per lavoro, nello stesso ordine) torna nella forma che il
// nodo dopo leggeva dall'API di Claude.
return $input.all().map((x, i) => ({ json: rispostaAD(x.json), pairedItem: { item: i } }));
