// Chiedi gli indirizzi delle pagine · una riga in più nel compito della ricerca: le pagine le scarica n8n.
// La routine dell'AD cerca sul web ma non apre le pagine dei locali (la sua rete è chiusa): le serve solo trovare
// gli indirizzi giusti e scriverli in una riga «PAGINE DA LEGGERE:», che il nodo «Pagine da leggere» legge.
// Inserito da N8N/flussi/chiedi-all-ad/leggi-pagine.mjs: le modifiche vanno fatte lì.
const RIGA = [
  'LE PAGINE LE SCARICA n8n',
  "Non serve che tu apra le pagine: dopo di te n8n le scarica, e la scheda si scrive sul loro testo. Se una pagina non si apre, non insistere e non chiedere di aprire la rete: non è un problema.",
  'Alla fine degli APPUNTI scrivi una riga che comincia con «PAGINE DA LEGGERE:» e dentro gli indirizzi esatti (con https://) delle pagine utili di QUESTO locale: sito ufficiale, menu, contatti, orari, chi siamo, prenotazioni, ed elenchi pubblici come PagineGialle o articoli dei giornali locali. Al massimo 10, separati da spazi. Mai Facebook, Instagram, mappe o portali (TripAdvisor, TheFork, Glovo).',
].join('\n');
return $input.all().map((item, indice) => {
  const j = item.json || {};
  if (!j.compito || j.non_mandare || String(j.compito).includes('PAGINE DA LEGGERE')) return { json: j, pairedItem: { item: indice } };
  return { json: { ...j, compito: `${j.compito}\n\n${RIGA}` }, pairedItem: { item: indice } };
});
