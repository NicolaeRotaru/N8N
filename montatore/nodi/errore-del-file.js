// (esecuzione «carica») Drive o officina hanno detto di no: il giro va avanti senza questo file.
const J = $('Config').first().json;
const r = $input.first().json || {};
const e = r.error || {};
let motivo = testo(e.message || e.description || e);
const corpo = e.cause && e.cause.response && e.cause.response.body;
try { const b = typeof corpo === 'string' ? JSON.parse(corpo) : corpo; if (b && b.messaggio) motivo = b.messaggio; } catch (x) { /* resta il motivo di n8n */ }
return [{ json: { ok: false, file: J.file.nome, motivo: accorcia(motivo || 'errore sconosciuto', 300) } }];
