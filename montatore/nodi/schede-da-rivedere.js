// (giro) Revisione su Telegram: un'esecuzione «rivedi» per ogni contenuto montato, che non si aspetta (ognuna resta
// in attesa della risposta del team, anche per giorni). Porta con sé tutto quello che serve per rimontare.
const J = $('Config').first().json;
const E = $input.first().json;
const P = $('Piano finale').first().json;
const usc = $('Trova la cartella d\'uscita').first().json;
const cartella = usc.id || testo(($('Crea la cartella d\'uscita').isExecuted ? $('Crea la cartella d\'uscita').first().json : {}).id);
// il contesto del piano (scheda del cliente, mese, note, catalogo descritto da Claude) serve a Claude per i ritocchi
const contesto = accorcia(testo($('Leggi cosa c\'è').first().json.testo_utente), 120000);
return (E.schede || []).map((x, i) => ({ json: {
  lavoro: 'rivedi',
  // una scheda ogni 4 secondi: Telegram accetta al massimo un messaggio al secondo nella stessa chat
  ritardo_s: i * 4,
  progetto: E.progetto,
  versione: 1,
  esito: x,
  giro: {
    cliente: J.cliente,
    servizio: J.servizio,
    mese: J.mese,
    musica: J.musica,
    cartella_uscita: cartella,
    controllo: siNo(J.USA_CONTROLLO, true),
    di: P.contenuti.length,
    contesto,
  },
} }));
