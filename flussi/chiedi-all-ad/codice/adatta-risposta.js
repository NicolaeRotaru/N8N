// Dall'AD · rimette la risposta di «Chiedi all'AD» nella forma che il nodo dopo leggeva dall'API di Claude,
// così il resto del flusso non cambia: content[0].text con il risultato (in JSON se è un oggetto).
//   FORMA «completa»: { statusCode, body } (il nodo HTTP di prima dava la risposta completa);
//   FORMA «corpo»:    il corpo soltanto, e { error } se qualcosa non va.
// Inserito da N8N/flussi/chiedi-all-ad/collega.mjs: le modifiche vanno fatte lì.
const FORMA = __FORMA__;
const voci = $input.all();
return voci.map((item, indice) => {
  const r = (item && item.json) || {};
  let fuori;
  if (r.ok === true) {
    const text = typeof r.risultato === 'string' ? r.risultato : JSON.stringify(r.risultato ?? null);
    const corpo = { type: 'message', role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: {},
      fatto_da: "l'AD con la routine «Chiedi all'AD»", avvisi: Array.isArray(r.avvisi) ? r.avvisi : [], dalla_memoria: !!r.dalla_memoria };
    fuori = FORMA === 'completa' ? { statusCode: 200, body: corpo } : corpo;
  } else {
    const errore = r.errore || (r.error && (r.error.message || r.error)) || "l'AD non ha risposto";
    const message = `AD: ${String(errore).slice(0, 300)}`;
    fuori = FORMA === 'completa' ? { statusCode: 503, body: { error: { type: 'ad', message } } } : { error: { message } };
  }
  return { json: fuori, pairedItem: { item: indice } };
});
