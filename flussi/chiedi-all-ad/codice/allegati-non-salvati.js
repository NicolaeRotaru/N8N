// Chiedi all'AD · Allegati non salvati
// La tabella degli allegati non ha accettato le righe (manca, è piena, n8n è occupato): la routine non parte.
// Si restituisce quello che «Prepara il lavoro» aveva contato (la corsa di oggi, la partenza dell'ultima ora, lo spazio
// degli allegati), così un guasto della tabella non consuma i posti della routine. Poi il flusso cancella le righe già
// scritte di questa corsa e «Componi la risposta» restituisce l'errore a chi ha chiamato.
const prep = $('Prepara il lavoro').first().json;
const memoria = $getWorkflowStaticData('global');
if (prep.azione === 'parti') {
  memoria.corse_oggi = Math.max(0, (Number(memoria.corse_oggi) || 0) - 1);
  if (Array.isArray(memoria.partenze)) memoria.partenze.pop();
}
if (Array.isArray(memoria.allegati)) memoria.allegati = memoria.allegati.filter((x) => x && x.corsa !== prep.corsa);
const e = ($input.first() && $input.first().json) || {};
const motivo = String((e.error && (e.error.message || e.error)) || e.message || 'errore sconosciuto').slice(0, 200);
return [{ json: { errore: `gli allegati non si sono salvati nella tabella: ${motivo}` } }];
