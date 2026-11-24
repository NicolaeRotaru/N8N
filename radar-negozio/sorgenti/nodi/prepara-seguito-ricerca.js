// La ricerca web di Claude si è fermata a metà (pause_turn): si rimanda la stessa conversazione
// con la risposta parziale in coda, e Claude riprende da dove era rimasto. Nessun messaggio in più.
const prima = $input.first().json;
const d = $('Prepara ricerca social').first().json;
const richiesta = Object.assign({}, d.richiesta_ricerca, {
  messages: d.richiesta_ricerca.messages.concat([{ role: 'assistant', content: prima.content }]),
});
return [{ json: { richiesta_seguito: richiesta } }];
