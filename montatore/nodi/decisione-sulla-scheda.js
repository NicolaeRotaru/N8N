// (esecuzione «rivedi») Cosa ha risposto il team: Approva, Correggi, niente entro il tempo, o messaggio non partito.
const r = $input.first().json || {};
const decisa = r.data && typeof r.data.approved === 'boolean';
const esito = r.error ? 'errore' : !decisa ? 'scaduto' : r.data.approved ? 'approva' : 'correggi';
return [{ json: { esito, errore: r.error ? testo(r.error.message || r.error) : '' } }];
