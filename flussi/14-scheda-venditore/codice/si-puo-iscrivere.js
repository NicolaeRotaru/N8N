// 14c · Venditori della scheda · Si può iscrivere?
// Un'email già iscritta non si sovrascrive: solo se Nicola ha messo il suo stato a «reset» (password dimenticata)
// il venditore può rifare l'iscrizione con la stessa email. Niente si cancella: la riga resta, cambia l'impronta.
const s = $('Smista').first().json;
const r = ($input.first() && $input.first().json) || {};
if (r.email && r.stato !== 'reset') return [{ json: { ok: false, motivo: 'esiste', ...s } }];
return [{ json: { ok: true, ...s, creato: r.email ? Number(r.creato) || s.adesso : s.adesso } }];
