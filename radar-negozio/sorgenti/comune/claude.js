// ---- comune: leggere le risposte di Claude (lo stesso codice in ogni nodo che ne ha bisogno) ----
// Restituisce il motivo dell'errore, oppure null se la risposta è buona.
function erroreClaude(r) {
  if (!r || typeof r !== 'object') return 'nessuna risposta';
  // Il nodo HTTP, quando fallisce dopo i tentativi, passa avanti { error: ... } (impostazione "On Error: Continue").
  if (r.error && r.type !== 'error') {
    const e = r.error;
    if (typeof e === 'string') return e.slice(0, 300);
    const parti = [e.message, e.description].filter((x) => typeof x === 'string' && x);
    return (parti.join(' — ') || 'errore di collegamento').slice(0, 300);
  }
  if (r.type === 'error') return String((r.error && r.error.message) || 'errore dell\'API').slice(0, 300);
  if (r.stop_reason === 'refusal') {
    const cat = r.stop_details && r.stop_details.category;
    return 'Claude non ha voluto rispondere' + (cat ? ' (' + cat + ')' : '');
  }
  if (r.stop_reason === 'max_tokens') return 'la risposta era troppo lunga ed è stata interrotta';
  if (!Array.isArray(r.content)) return 'risposta senza contenuto';
  return null;
}

function testoClaude(r) {
  return ((r && r.content) || [])
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
}

// Per le risposte con output_config.format (JSON garantito dallo schema).
function jsonClaude(r) {
  const errore = erroreClaude(r);
  if (errore) return { errore };
  try {
    return { dati: JSON.parse(testoClaude(r)) };
  } catch (e) {
    return { errore: 'la risposta non era nel formato atteso' };
  }
}

// Stima del costo in dollari, dai token che l'API dichiara. Prezzi di listino per milione di token (novembre 2026).
const PREZZI_CLAUDE = {
  'claude-opus-5-5': [4, 20, 0.2],
  'claude-sonnet-5-5': [2, 10, 0.1],
  'claude-haiku-5-5': [0.1, 0.5, 0.01],
  'claude-fable-5-2': [8, 40, 0.2],
};
function costoClaude(r) {
  if (!r || !r.usage) return 0;
  const u = r.usage;
  const [entrata, uscita, letturaCache] = PREZZI_CLAUDE[r.model] || PREZZI_CLAUDE['claude-opus-5-5'];
  const ricerche = (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
  return (
    ((u.input_tokens || 0) * entrata +
      (u.cache_creation_input_tokens || 0) * entrata * 1.25 +
      (u.cache_read_input_tokens || 0) * letturaCache +
      (u.output_tokens || 0) * uscita) /
      1e6 +
    ricerche * 0.01
  );
}
// ---- fine comune ----
