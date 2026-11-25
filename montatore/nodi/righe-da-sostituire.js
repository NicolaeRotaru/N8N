// Le idee del 03 per questo mese diventano «sostituito»: il piano del mese ora è quello del 16. Si arriva qui quando
// una riga del 16 è entrata davvero nel Calendario: a fine giro senza revisione (tutti i contenuti montati e scritti),
// oppure alla prima ✅ Approva su Telegram. Si segnano solo le righe ancora in stato «idea» nel foglio riletto adesso:
// le approvazioni dopo la prima non riscrivono niente, e un'idea che il team ha già cambiato a mano resta com'è.
const J = $('Config').first().json;
const ids = J.giro && Array.isArray(J.giro.idee_03) ? J.giro.idee_03 : ($('Leggi cosa c\'è').isExecuted ? $('Leggi cosa c\'è').first().json.idee_03 || [] : []);
const cal = $input.first().json || {};
const ancora = new Set((Array.isArray(cal.values) ? righeFoglio(cal) : []).filter((r) => norm(r.stato) === 'idea').map((r) => testo(r.id)));
const oggi = partiRoma().data;
return ids.filter((id) => ancora.has(testo(id))).map((id) => ({ json: { id, stato: 'sostituito', note: 'piano AI · sostituita dal piano del montatore (16) il ' + oggi } }));
