// Per l'AD · trasforma la richiesta che il flusso preparava per l'API di Claude in un lavoro per il
// sotto-flusso «Chiedi all'AD»: { flusso, compito, dati, schema }.
//   - compito = il prompt di sistema di prima, più come leggere i dati;
//   - dati    = il testo del messaggio, e le foto quando sono indirizzi web;
//   - schema  = lo schema JSON della risposta, se c'era.
// Le foto mandate dentro il messaggio (base64) non possono arrivare all'AD: non ci stanno nei 64 KB della
// routine. Si dice all'AD che mancano; se il lavoro senza foto non ha senso, il lavoro non si manda.
// Inserito da N8N/flussi/chiedi-all-ad/collega.mjs: le modifiche vanno fatte lì.
const FLUSSO = __FLUSSO__;
const FOTO_NECESSARIE = __FOTO_NECESSARIE__;
const testoDi = (c) => (typeof c === 'string' ? c
  : Array.isArray(c) ? c.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n\n') : '');

return $input.all().map((item, indice) => {
  const $json = item.json;
  let richiesta;
  try {
    richiesta = __RICHIESTA__;
  } catch (e) {
    return { json: { flusso: FLUSSO, compito: '-', non_mandare: `richiesta non leggibile: ${String(e.message).slice(0, 150)}` }, pairedItem: { item: indice } };
  }
  const messaggi = Array.isArray(richiesta && richiesta.messages) ? richiesta.messages : [];
  const parti = messaggi.flatMap((m) => (typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : Array.isArray(m.content) ? m.content : []));
  const messaggio = parti.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n\n');
  const immagini = parti.filter((b) => b && (b.type === 'image' || b.type === 'document'));
  const foto = immagini.filter((b) => b.source && b.source.type === 'url' && b.source.url).map((b) => b.source.url);
  const nonMandate = immagini.length - foto.length;
  // Se la richiesta di prima dava a Claude la ricerca sul web, il compito lo dice: la routine cerca solo se il compito lo chiede.
  const strumenti = Array.isArray(richiesta && richiesta.tools) ? richiesta.tools.map((t) => String((t && t.type) || '')) : [];
  const cerca = strumenti.some((t) => t.startsWith('web_search') || t.startsWith('web_fetch'));
  const schema = (richiesta && richiesta.output_config && richiesta.output_config.format && richiesta.output_config.format.schema) || null;
  const compito = [
    testoDi(richiesta && richiesta.system),
    '---',
    'Il messaggio su cui lavorare è in «dati.messaggio»: fai quello che chiede, seguendo le regole qui sopra.',
    foto.length ? 'Le foto sono in «dati.foto», come indirizzi web: scaricale solo per guardarle. Se non riesci ad aprirle, lavora senza, non inventare cosa mostrano, e scrivilo negli avvisi.' : '',
    nonMandate ? `${nonMandate === 1 ? 'Una foto non è stata mandata' : `${nonMandate} foto non sono state mandate`} (non ci stanno nel messaggio): lavora senza e non inventare cosa mostrano.` : '',
    cerca ? 'Per questo compito puoi cercare sul web: è richiesto in modo esplicito.' : '',
    schema ? 'In «risultato» metti l\'oggetto che rispetta lo schema.' : 'In «risultato» metti il testo della tua risposta.',
  ].filter(Boolean).join('\n\n');
  const lavoro = { flusso: FLUSSO, compito, dati: { messaggio, ...(foto.length ? { foto } : {}) }, schema };
  if (FOTO_NECESSARIE && immagini.length && !foto.length) {
    lavoro.non_mandare = "le foto non possono arrivare all'AD dentro il messaggio: servono come indirizzi web, aperti nella rete della routine";
  }
  return { json: lavoro, pairedItem: { item: indice } };
});
