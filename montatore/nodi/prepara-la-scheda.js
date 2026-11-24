// (esecuzione «rivedi») La scheda di un contenuto per Telegram: cosa è, quando esce, il link, i due pulsanti.
// Foto e video con persone arrivano su Telegram solo se il cliente ha firmato il consenso (anteprime_con_persone).
const J = $('Config').first().json;
const E = J.esito || {};
const G = J.giro || {};
const c = E.contenuto || {};
const cl = G.cliente || {};
const attivo = norm(J.MODALITA) === 'attivo';
const v = Number(J.versione) || 1;
const video = (E.file || []).find((f) => f.tipo === 'video');
const immagini = (E.file || []).filter((f) => f.tipo === 'immagine');
const principale = video || immagini[0] || null;
const anteprima = cl.anteprime === true && !!principale;
const storia = c.tipo === 'storia_video' || c.tipo === 'storia_foto';
const righe = [
  '🎬 *' + md(cl.nome_locale) + '* · ' + md(NOMI_TIPO[c.tipo] || c.tipo) + (v > 1 ? ' · versione ' + v : ''),
  '*' + md(c.titolo) + '* · esce ' + md(leggibileData(c.data, c.ora)),
  c.idea ? md(accorcia(testo(c.idea), 300)) : '',
  Number(c.durata) > 0 ? 'Durata: ' + virgola(Number(c.durata)) + ' s' : '',
  E.controllo && E.controllo.esito === 'da_rivedere' ? '🔎 Il controllo di Claude dice: ' + md(accorcia(testo(E.controllo.motivo), 300)) : '',
  (E.avvisi || []).length ? 'Da sapere: ' + md(accorcia((E.avvisi || []).join(' '), 500)) : '',
  principale ? 'File su Drive: ' + md(principale.link) : '',
  anteprima ? '' : 'Anteprima qui non mandata: per questo cliente manca il consenso per le persone su Telegram.',
  '',
  '✅ Approva = va bene così' + (attivo ? (storia ? ' (nel Calendario, pronta da pubblicare)' : ' (nel Calendario: il 04 scrive la didascalia e te la chiede)') : ' (modalità prova: non scrivo nel Calendario)'),
  c.motore === 'regia' ? '✏️ Correggi = mi scrivi cosa cambiare e lo rimonto' : '✏️ Correggi = lo segno da sistemare a mano (le foto non si rimontano da qui)',
];
return [{ json: {
  messaggio_scheda: righe.filter((r, i) => r || i === 8).join('\n').slice(0, 3900),
  anteprima,
  anteprima_id: anteprima ? principale.id : '',
  anteprima_video: anteprima && !!video,
  didascalia_anteprima: accorcia(testo(cl.nome_locale) + ' · ' + testo(c.titolo) + (v > 1 ? ' · v' + v : ''), 900),
} }];
