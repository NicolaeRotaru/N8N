// 14b · Scheda per il venditore: risultato · Componi la risposta
// La riga della tabella (o niente) → quello che legge il sito. Un lavoro che non c'è è «sconosciuto».
const riga = ($input.first() && $input.first().json) || {};
if (!riga.lavoro) return [{ json: { stato: 'sconosciuto' } }];
return [{ json: {
  stato: riga.stato || 'in_corso',
  prima: riga.prima || null,
  risultato: riga.risultato || null,
  avvisi: riga.avvisi || '[]',
  errore: riga.errore || null,
  secondi: typeof riga.secondi === 'number' ? riga.secondi : null,
} }];
