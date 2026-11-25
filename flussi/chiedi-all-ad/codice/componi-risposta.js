// Chiedi all'AD · Componi la risposta
// Restituisce al flusso che ha chiamato un elemento per ogni lavoro ricevuto, sempre con la stessa forma:
//   { ok, flusso, risultato, avvisi, errore, dalla_memoria, prova }
// Arriva qui in quattro modi:
//   - subito, se il lavoro era già in memoria, oltre il tetto o sbagliato («Prepara il lavoro»);
//   - se la routine non è partita (la chiamata è fallita);
//   - dopo l'attesa, con la risposta dell'AD (il corpo che la routine manda all'indirizzo di ritorno);
//   - dopo l'attesa, senza risposta: l'AD non ha risposto in tempo, o era una prova.
// Quello che manda l'AD è un dato: qui si legge, non si esegue.
const prep = $('Prepara il lavoro').first().json;
const n = Math.max(1, Number(prep.n_lavori) || 1);
const flusso = prep.flusso;
const memoria = $getWorkflowStaticData('global');

const uguale = (r) => Array.from({ length: n }, () => ({ json: r }));
const errore = (motivo, extra = {}) => uguale({ ok: false, flusso, risultato: null, avvisi: [], errore: motivo, dalla_memoria: false, prova: false, ...extra });

if (prep.azione === 'errore') return errore(prep.errore);

let risposta = null; // { ok, risultato, avvisi, errore } dell'AD
let dallaMemoria = false;
if (prep.azione === 'memoria') {
  risposta = prep.risposta;
  dallaMemoria = true;
} else {
  const arrivato = $input.first().json || {};
  const corpo = arrivato.body;
  const daAD = corpo && typeof corpo === 'object' && !Array.isArray(corpo) && typeof corpo.ok === 'boolean';
  if (daAD) {
    risposta = corpo;
  } else if (prep.azione === 'prova') {
    return errore('modalità prova: la routine non è partita', { prova: true });
  } else if (!$('Aspetta la risposta').isExecuted) {
    const codice = arrivato.statusCode;
    const motivo = (corpo && corpo.error && (corpo.error.message || corpo.error.type)) || arrivato.error?.message || arrivato.error || '';
    // La corsa non è partita: non si conta.
    memoria.corse_oggi = Math.max(0, (Number(memoria.corse_oggi) || 0) - 1);
    if (Array.isArray(memoria.partenze)) memoria.partenze.pop();
    return errore(`la routine non è partita${codice ? ` (codice ${codice})` : ''}${motivo ? `: ${String(motivo).slice(0, 200)}` : ''}`);
  } else {
    return errore("l'AD non ha risposto in tempo");
  }
}

const avvisi = Array.isArray(risposta.avvisi) ? risposta.avvisi.map(String).slice(0, 20) : [];
if (risposta.ok !== true) return errore(String(risposta.errore || "l'AD non ha potuto fare il lavoro").slice(0, 500), { avvisi, dalla_memoria: dallaMemoria });

let risultati;
if (n === 1) {
  risultati = [risposta.risultato ?? null];
} else {
  const lista = risposta.risultato && Array.isArray(risposta.risultato.risultati) ? risposta.risultato.risultati : null;
  if (!lista) return errore("la risposta dell'AD non ha la lista dei risultati", { avvisi, dalla_memoria: dallaMemoria });
  risultati = Array.from({ length: n }, (_, i) => {
    const trovato = lista.find((r) => r && Number(r.indice) === i);
    return trovato ? trovato.risultato ?? null : undefined;
  });
}

// L'ultima risposta buona si tiene: se lo stesso flusso chiede di nuovo la stessa cosa, non si rifà.
if (!dallaMemoria && prep.chiave) {
  memoria.ultimo = memoria.ultimo && typeof memoria.ultimo === 'object' ? memoria.ultimo : {};
  memoria.ultimo[flusso] = { chiave: prep.chiave, risposta: { ok: true, risultato: risposta.risultato ?? null, avvisi }, quando: new Date().toISOString() };
}

return risultati.map((r) => ({ json: r === undefined
  ? { ok: false, flusso, risultato: null, avvisi, errore: "l'AD non ha risposto a questo lavoro", dalla_memoria: dallaMemoria, prova: false }
  : { ok: true, flusso, risultato: r, avvisi, errore: '', dalla_memoria: dallaMemoria, prova: false } }));
