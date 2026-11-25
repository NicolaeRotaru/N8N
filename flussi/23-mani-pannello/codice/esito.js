// 23 · Prepara la risposta — quello che il Pannello legge come Esito ({ stato, dettaglio }).
// Se il controllo ha già deciso (coda o simulata), si risponde quello. Se si è mandato su Telegram,
// «fatta» solo se Telegram ha detto ok; altrimenti «coda» col motivo.

const c = $('Controlla la richiesta').first().json;
if (c.risposta) return [{ json: c.risposta }];
let r = null;
try { r = $('Manda con Telegram').isExecuted ? $('Manda con Telegram').first().json : null; } catch { r = null; }
const ora = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(new Date());
if (r && r.error === undefined && (r.ok === true || r.message_id !== undefined || (r.result && r.result.message_id !== undefined))) {
  return [{ json: { stato: 'fatta', dettaglio: `mandata su Telegram · ${ora}` } }];
}
const motivo = r && r.error ? String(r.error.message || r.error.description || r.error).slice(0, 120) : 'Telegram non ha risposto';
return [{ json: { stato: 'coda', dettaglio: `invio su Telegram non riuscito (${motivo}): resta in coda` } }];
