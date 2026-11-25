// 97 · Messaggi da mandare — dove va ogni messaggio: la chat e, se c'è, l'argomento del negozio.
// L'argomento si prende dalla tabella; se non c'era, è quello appena aperto dall'officina. Se l'officina
// non è riuscita ad aprirlo, i messaggi vanno lo stesso nel gruppo (nello spazio generale), col nome del
// negozio in testa e un avviso sul perché: un messaggio non si perde mai per colpa dell'argomento.
const r = $('Raccogli i messaggi').first().json;
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const intero = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : 0; };
let thread = 0;
let avviso = '';
if (r.conGruppo) {
  const trovato = $("Cerca l'argomento").isExecuted ? $("Cerca l'argomento").first().json || {} : {};
  thread = intero(trovato.thread_id);
  if (!thread && $("Apri l'argomento").isExecuted) {
    const a = $("Apri l'argomento").first().json || {};
    thread = a.statusCode === 200 && a.body ? intero(a.body.message_thread_id) : 0;
    if (!thread) {
      const motivo = a.body && typeof a.body === 'object' && a.body.messaggio ? String(a.body.messaggio)
        : a.error ? "l'officina non ha risposto" : `risposta ${a.statusCode || 'assente'}`;
      avviso = `⚠️ Non sono riuscito ad aprire l'argomento di <b>${esc(r.nome)}</b>: ${esc(motivo.slice(0, 200))}. I suoi messaggi arrivano qui finché non si sistema.`;
    }
  }
}
const chat = r.conGruppo ? r.gruppo : r.privata;
// Nello spazio generale del gruppo il nome del negozio va in testa, se no non si capisce di chi è.
const testa = r.conGruppo && !thread ? `🏪 <b>${esc(r.nome)}</b>\n` : '';
return [...(avviso ? [avviso] : []), ...r.messaggi.map((m) => testa + m)].map((messaggio) => ({ json: { chat, thread, messaggio } }));
