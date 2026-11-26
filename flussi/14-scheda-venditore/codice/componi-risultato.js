// 14b · Scheda per il venditore: risultato · Componi la risposta
// La riga della tabella (o niente) → quello che legge il sito. Un lavoro che non c'è è «sconosciuto».
const riga = ($input.first() && $input.first().json) || {};
if (!riga.lavoro) return [{ json: { stato: 'sconosciuto' } }];
// Una riga «in_corso» da più di 16 minuti non finirà più (l'AD aspetta al massimo 15 minuti): è un errore.
const ADESSO = Date.now();
const ferma = (riga.stato || 'in_corso') === 'in_corso' && Number(riga.iniziato) > 0 && ADESSO - Number(riga.iniziato) > 16 * 60 * 1000;
return [{ json: {
  stato: ferma ? 'errore' : riga.stato || 'in_corso',
  venditore: riga.venditore || null,
  prima: riga.prima || null,
  risultato: riga.risultato || null,
  avvisi: riga.avvisi || '[]',
  errore: ferma ? "l'AD non ha risposto in 15 minuti" : riga.errore || null,
  secondi: typeof riga.secondi === 'number' ? riga.secondi : null,
} }];
