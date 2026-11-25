// Il piano controllato (dopo l'eventuale correzione): l'elenco dei contenuti da montare e i messaggi per Telegram.
const J = $('Config').first().json;
const primo = $('Officina: controlla il piano').first().json || {};
let fin = primo;
let corretto = false;
if ($('Officina: ricontrolla il piano').isExecuted) {
  const sec = $('Officina: ricontrolla il piano').first().json || {};
  const conta = (x) => (Array.isArray(x.contenuti) ? x.contenuti.length : 0);
  const blocchi = (x) => (x.problemi || []).filter((p) => p.gravita === 'blocca').length;
  if (!sec.error && conta(sec) > 0 && (conta(sec) > conta(primo) || (conta(sec) === conta(primo) && blocchi(sec) <= blocchi(primo)))) { fin = sec; corretto = true; }
}
const note = corretto && $('Leggi la correzione').first().json.note ? $('Leggi la correzione').first().json.note : $('Leggi il piano').first().json.note;
const contenuti = Array.isArray(fin.contenuti) ? fin.contenuti : [];
if (fin.error || !contenuti.length) {
  return [{ json: { ok: false, messaggi: ['⚠️ <b>Montatore fermo</b> · ' + h(J.cliente.nome_locale) + '\nNel piano non è rimasto nessun contenuto valido. ' + h(accorcia((fin.problemi || []).map((p) => p.messaggio).join(' '), 1500))] } }];
}
const c = fin.conti || {};
const righe = [
  '🗓️ <b>Piano di ' + h(J.mese.nome) + '</b> · ' + h(J.cliente.nome_locale) + (corretto ? ' (corretto una volta)' : ''),
  c.reel + ' reel, ' + c.post + ' post e caroselli, ' + c.storie + ' storie in ' + c.giorni + ' giorni. Usati ' + c.scene_usate + ' momenti video su ' + c.scene_totali + ' e ' + c.foto_usate + ' foto su ' + c.foto_totali + '.',
  'Adesso monto tutto: ti scrivo alla fine.',
  '',
];
for (const x of contenuti) {
  righe.push('• ' + leggibileData(x.data, x.ora) + ' · ' + NOMI_TIPO[x.tipo] + ' · ' + h(x.titolo) + (x.durata ? ' (' + Math.round(x.durata) + ' s)' : x.foto && x.foto.length > 1 ? ' (' + x.foto.length + ' foto)' : ''));
}
const avvisi = (fin.problemi || []).filter((p) => p.gravita === 'blocca' || ['ripetizione', 'numeri_diversi'].includes(p.codice));
if (avvisi.length) { righe.push(''); righe.push('Da sapere: ' + h(accorcia(avvisi.map((p) => p.messaggio).join(' '), 1500))); }
if (note) { righe.push(''); righe.push('Nota di Claude: ' + h(accorcia(note, 800))); }
return [{ json: { ok: true, contenuti, conti: c, messaggi: aPezzi(righe) } }];
