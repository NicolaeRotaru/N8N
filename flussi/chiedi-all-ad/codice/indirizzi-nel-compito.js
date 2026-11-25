// Chiedi gli indirizzi delle pagine · una riga in più nel compito della ricerca: le pagine le scarica n8n.
// La routine dell'AD cerca sul web ma non apre le pagine dei locali (la sua rete è chiusa): le serve solo trovare
// gli indirizzi giusti e scriverli in una riga «PAGINE DA LEGGERE:», che il nodo «Pagine da leggere» legge.
// 25/11 22:38, prova vera su Ora del Gusto: con la regola «solo citazioni lette» l'AD lasciava la riga vuota. La riga
// è un elenco di candidati: va scritta anche per le pagine non lette e dubbie, la verifica la fa il controllo.
// Inserito da N8N/flussi/chiedi-all-ad/leggi-pagine.mjs: le modifiche vanno fatte lì.
const RIGA = [
  'LE PAGINE LE SCARICA n8n',
  "Non serve che tu apra le pagine: dopo di te n8n le scarica, e la scheda si scrive sul loro testo. Se una pagina non si apre, non insistere e non chiedere di aprire la rete.",
  "Alla fine degli APPUNTI scrivi una riga che comincia con «PAGINE DA LEGGERE:» con gli indirizzi esatti (con https://) di TUTTI i risultati di ricerca che potrebbero essere di questo locale: il suo sito, le pagine di menu, contatti e orari, le schede su elenchi e siti di ristoranti, gli articoli.",
  "Mettili anche se non li hai letti e anche se hai un dubbio sull'omonimo: questa riga è un elenco di candidati, non un fatto, e non vuole citazioni. n8n li scarica, e il controllo tiene solo quello che il testo scaricato conferma.",
  'Al massimo 10, separati da spazi, i più probabili per primi. Mai Facebook, Instagram, mappe o portali (TripAdvisor, TheFork, Glovo). Se non hai trovato nessun indirizzo, scrivi «PAGINE DA LEGGERE: nessuna».',
].join('\n');
return $input.all().map((item, indice) => {
  const j = item.json || {};
  if (!j.compito || j.non_mandare || String(j.compito).includes('PAGINE DA LEGGERE')) return { json: j, pairedItem: { item: indice } };
  return { json: { ...j, compito: `${j.compito}\n\n${RIGA}` }, pairedItem: { item: indice } };
});
