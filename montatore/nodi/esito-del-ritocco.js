// (esecuzione «rivedi») Il contenuto ritoccato è rimontato e su Drive: messaggio e scheda nuova da rivedere.
const J = $('Config').first().json;
const G = J.giro || {};
const L = $('Leggi il ritocco').first().json;
const x = $input.first().json || {};
const c = (L.monta || {}).contenuto || {};
const nome = h((G.cliente || {}).nome_locale) + ' · ' + h(c.titolo);
const v = (Number(J.versione) || 1) + 1;
if (x.error || !x.ok) return [{ json: { ok: false, messaggio: '⚠️ <b>Ritocco non montato</b> · ' + nome + '\n' + h(accorcia(testo(x.motivo || (x.error && (x.error.message || x.error))) || 'errore sconosciuto', 400)) + '\nLa versione di prima resta su Drive.' } }];
return [{ json: {
  ok: true,
  messaggio: '✏️ <b>Rimontato</b> · ' + nome + ' · versione ' + v + '\n' + h(L.cosa || 'Ho applicato la correzione.') + (L.non_posso ? '\n⚠️ ' + h(L.non_posso) : '') + '\nLa scheda nuova arriva qui sotto.',
  scheda: { lavoro: 'rivedi', progetto: J.progetto, versione: v, esito: x, giro: G },
} }];
