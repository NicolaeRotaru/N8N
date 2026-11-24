// Tutti i contenuti sono passati dal montaggio: righe del Calendario (solo in modalità attivo) e riepilogo finale.
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
const righe = [];
for (const x of ok) {
  const c = x.contenuto || {};
  const tipo = TIPI_CALENDARIO[c.tipo] || c.tipo;
  const video = (x.file || []).find((f) => f.tipo === 'video');
  const copertina = (x.file || []).find((f) => f.tipo === 'copertina');
  const immagini = (x.file || []).filter((f) => f.tipo === 'immagine');
  const media = video ? video.link : immagini.map((f) => f.link).join(' | ');
  const rivedere = x.controllo && x.controllo.esito === 'da_rivedere';
  const stato = rivedere ? 'bozza' : tipo === 'storia' ? 'da_approvare' : 'da_scrivere';
  const brief = ['Idea: ' + testo(c.idea), c.perche ? 'Perché funziona: ' + testo(c.perche) : '', c.didascalia ? 'Didascalia proposta dal montatore: ' + testo(c.didascalia) : '',
    'Montato dal montatore dal servizio «' + testo(J.servizio.nome) + '» (' + (c.tipo === 'reel' || c.tipo === 'storia_video' ? (c.pezzi || []).map((p) => p.scena).join(', ') : (c.foto || []).join(', ')) + ').'].filter(Boolean).join('\n');
  const riga = {
    id: 'MO-' + slug(J.cliente.cliente, 20) + '-' + testo(c.data).replace(/-/g, '') + '-' + testo(c.ora).replace(':', '') + '-' + progetto.slice(0, 4) + x.n,
    cliente: J.cliente.cliente,
    tipo,
    piattaforme: 'ig+fb',
    data_ora: testo(c.data) + ' ' + testo(c.ora),
    brief,
    media,
    stato,
    note: 'montatore AI' + (rivedere ? ' · da rivedere: ' + accorcia(testo(x.controllo.motivo), 200) : ''),
  };
  if (copertina) riga.copertina = copertina.link;
  righe.push(riga);
}
const m = [];
m.push((ko.length ? '🎬 <b>Montaggio finito, con intoppi</b>' : '✅ <b>Montaggio finito</b>') + ' · ' + h(J.cliente.nome_locale) + ' · ' + h(J.mese.nome));
m.push(ok.length + ' contenuti pronti su Drive' + (daRivedere.length ? ' (' + daRivedere.length + ' da rivedere)' : '') + (ko.length ? ', ' + ko.length + ' non riusciti' : '') + '.');
if (cartella) m.push('Cartella: ' + linkCartella(cartella));
m.push(attivo ? 'Nel Calendario ho scritto ' + righe.length + ' righe: le storie sono «da approvare», reel e post «da scrivere» (il 04 prepara la didascalia), quelli da rivedere restano in «bozza». Niente si pubblica senza di voi.'
  : 'Modalità prova: nel Calendario non ho scritto niente. Se il risultato vi convince, mettete MODALITA = attivo nel Config del workflow 16.');
for (const x of daRivedere) m.push('🔎 ' + leggibileData(x.contenuto.data, x.contenuto.ora) + ' · ' + h(x.contenuto.titolo) + ': ' + h(x.controllo.motivo));
for (const x of ko) m.push('❌ ' + leggibileData((x.contenuto || {}).data, (x.contenuto || {}).ora) + ' · ' + h((x.contenuto || {}).titolo || ('contenuto ' + x.n)) + ': ' + h(accorcia(testo(x.motivo) || 'errore sconosciuto', 300)));
const avvisi = [...new Set(ok.flatMap((x) => x.avvisi || []))];
if (avvisi.length) m.push('Da sapere: ' + h(accorcia(avvisi.join(' '), 1200)));
return [{ json: { righe: attivo ? righe : [], scrivi: attivo && righe.length > 0, chiudi: ko.length === 0, progetto, messaggi: aPezzi(m) } }];
