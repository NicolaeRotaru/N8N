// 26 · Fatti · Fonti del radar — le pagine di eventi e bandi del radar dell'AD (24-radar-web/codice/fonti.json), una per
// elemento: le scarica il nodo dopo, una al secondo. Sono pagine pubbliche di enti e associazioni.
// Inserito da N8N/flussi/16-nuovo-cliente-da-mycity/fatti.mjs: l'elenco lo mette il generatore.
const FONTI = __FONTI__;
return FONTI.map((f) => ({ json: f }));
