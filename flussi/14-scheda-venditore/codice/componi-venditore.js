// 14c · Venditori della scheda · Componi il venditore
// La riga della tabella (o niente) → quello che serve al sito per far entrare il venditore.
const r = ($input.first() && $input.first().json) || {};
if (!r.email) return [{ json: { trovato: false } }];
return [{ json: {
  trovato: true, email: r.email, hash: r.hash || '', stato: r.stato || 'attivo',
  errori: Number(r.errori) || 0, bloccato_fino: Number(r.bloccato_fino) || 0,
} }];
