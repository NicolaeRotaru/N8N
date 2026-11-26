// Tutti i contenuti sono passati dal montaggio: righe del Calendario (solo in modalità attivo e senza revisione su
// Telegram), schede da rivedere e riepilogo finale.
const J = $('Config').first().json;
const usc = $('Trova la cartella d\'uscita').first().json;
const cartella = usc.id || testo(($('Crea la cartella d\'uscita').isExecuted ? $('Crea la cartella d\'uscita').first().json : {}).id);
const progetto = $('Officina: nuovo progetto').first().json.progetto;
const P = $('Piano finale').first().json;
const esiti = $input.all().map((x) => x.json || {}).map((x, i) => (x.error && x.ok === undefined ? { ok: false, n: i + 1, contenuto: P.contenuti[i] || {}, motivo: testo(x.error.message || x.error) } : x));
const attivo = norm(J.MODALITA) === 'attivo';
const ok = esiti.filter((x) => x.ok);
const ko = esiti.filter((x) => !x.ok);
const daRivedere = ok.filter((x) => x.controllo && x.controllo.esito === 'da_rivedere');
const revisione = norm(J.REVISIONE) === 'telegram';
const righe = ok.map((x) => rigaCalendario(J, x, progetto));
const m = [];
m.push((ko.length ? '🎬 <b>Montaggio finito, con intoppi</b>' : '✅ <b>Montaggio finito</b>') + ' · ' + h(J.cliente.nome_locale) + ' · ' + h(J.mese.nome));
m.push(ok.length + ' contenuti pronti su Drive' + (daRivedere.length ? ' (' + daRivedere.length + ' da rivedere)' : '') + (ko.length ? ', ' + ko.length + ' non riusciti' : '') + '.');
if (cartella) m.push('Cartella: ' + linkCartella(cartella));
if (revisione) m.push('Adesso arriva una scheda per ogni contenuto: ✅ Approva ' + (attivo ? 'lo mette nel Calendario' : '(in prova non scrive nel Calendario)') + ', ✏️ Correggi lo rimonta con la vostra nota. Niente si pubblica senza di voi.');
else m.push(attivo ? 'Nel Calendario ho scritto ' + righe.length + ' righe: le storie sono «da approvare», reel e post «da scrivere» (il 04 prepara la didascalia), quelli da rivedere restano in «bozza». Niente si pubblica senza di voi.'
  : 'Modalità prova: nel Calendario non ho scritto niente. Se il risultato vi convince, mettete MODALITA = attivo nel Config del «31 · Montatore».');
for (const x of daRivedere) m.push('🔎 ' + leggibileData(x.contenuto.data, x.contenuto.ora) + ' · ' + h(x.contenuto.titolo) + ': ' + h(x.controllo.motivo));
for (const x of ko) m.push('❌ ' + leggibileData((x.contenuto || {}).data, (x.contenuto || {}).ora) + ' · ' + h((x.contenuto || {}).titolo || ('contenuto ' + x.n)) + ': ' + h(accorcia(testo(x.motivo) || 'errore sconosciuto', 300)));
const oltre = ok.filter((x) => x.controllo && x.controllo.oltre_il_tetto);
// quello che l'AD ha detto mentre guardava il materiale o scriveva il piano (es. un allegato che non si apriva)
const dalPasso = (n) => ($(n).isExecuted ? ($(n).first().json || {}).avvisi_ad : null);
const avvisi = [...new Set([...(dalPasso('Leggi il piano') || []), ...(dalPasso('Leggi la correzione') || []), ...ok.flatMap((x) => x.avvisi || [])])];
if (oltre.length) avvisi.unshift(oltre.length === 1 ? "Un reel non l'ha guardato l'AD (al massimo 12 in una corsa): guardatelo voi." : oltre.length + " reel non li ha guardati l'AD (al massimo 12 in una corsa): guardateli voi.");
if (avvisi.length) m.push('Da sapere: ' + h(accorcia(avvisi.join(' '), 1200)));
// con la revisione su Telegram il Calendario lo scrive «Approva», contenuto per contenuto; il progetto resta aperto
// nell'officina per le correzioni (scade da solo dopo PROGETTO_DURATA_ORE)
const scrivi = attivo && !revisione && righe.length > 0;
return [{ json: { righe: scrivi ? righe : [], scrivi, chiudi: ko.length === 0 && !revisione, schede: revisione ? ok : [], progetto, messaggi: aPezzi(m) } }];
