// L'elenco del materiale da montare + il messaggio del modulo. Poi parte il giro vero, in un'esecuzione sua.
const CFG = $('Config').first().json;
const T = $('Trova il cliente').first().json;
const S = $('Trova la cartella del servizio').first().json.servizio;
const SC = $('Trova le sottocartelle').first().json;
const r = $input.first().json || {};
if (r.error || !Array.isArray(r.files)) return [{ json: { ok: false, messaggio: 'Non riesco a leggere i file della cartella «' + S.nome + '».' } }];
const maxByte = numero(CFG.MAX_MB_FILE, 500) * 1024 * 1024;
// una pagina di Drive = 1000 file: oltre, gli altri restano fuori (lo si dice)
const oltreMille = !!r.nextPageToken;
const maxFile = intero(CFG.MAX_FILE, 400);
const video = [];
const foto = [];
const audio = [];
const scartati = [];
for (const f of [...r.files].sort(perNome)) {
  const genitore = (f.parents || [])[0];
  const ruolo = SC.ruoli[genitore] ? SC.ruoli[genitore].ruolo : '';
  const nomeCartella = SC.ruoli[genitore] ? SC.ruoli[genitore].nome : S.nome;
  if (f.mimeType === 'application/vnd.google-apps.shortcut') { scartati.push(f.name + ' (scorciatoia: metti il file vero)'); continue; }
  if (testo(f.name).startsWith('._')) continue; // copie nascoste del Mac
  if (eAudio(f)) { audio.push({ id: f.id, nome: testo(f.name), ruolo }); continue; }
  if (eHeic(f)) { scartati.push(f.name + ' (HEIC: esportala in JPEG)'); continue; }
  const v = eVideo(f);
  if (!v && !eFoto(f)) { if (!/\.(txt|md|srt|json|ds_store)$/i.test(f.name)) scartati.push(f.name + ' (non è né foto né video)'); continue; }
  if (byteDi(f) > maxByte) { scartati.push(f.name + ' (' + Math.round(byteDi(f) / 1048576) + ' MB: il limite è ' + Math.round(maxByte / 1048576) + ' MB, esportalo in 1080p)'); continue; }
  const durata = v && f.videoMediaMetadata ? numero(f.videoMediaMetadata.durationMillis, 0) / 1000 : 0;
  const voce = { id: f.id, nome: testo(f.name), tipo: v ? 'video' : 'foto', cartella: nomeCartella, ruolo, byte: byteDi(f), durata };
  (v ? video : foto).push(voce);
}
// prima i verticali (sono quelli che servono di più), poi gli orizzontali, poi le foto
const peso = (x) => (x.ruolo === 'video verticali' ? 0 : x.ruolo === 'video orizzontali' ? 2 : 1);
video.sort((a, b) => peso(a) - peso(b) || perNome(a, b));
let file = [...video, ...foto];
if (oltreMille) scartati.push('la cartella ha più di 1000 file: ho letto solo i primi 1000 (dividete il servizio in due)');
if (file.length > maxFile) { scartati.push((file.length - maxFile) + ' file oltre il massimo di ' + maxFile + ' per servizio'); file = file.slice(0, maxFile); }
if (!file.length) {
  return [{ json: { ok: false, messaggio: 'Nella cartella «' + S.nome + '» non ho trovato foto o video da montare.' + (scartati.length ? ' Saltati: ' + accorcia(scartati.join('; '), 500) : '') + ' Le sottocartelle devono chiamarsi per esempio «video verticali», «video orizzontali», «foto».' } }];
}
const musica = audio.find((a) => /^musica\b/i.test(chiaveNome(a.nome))) || audio.find((a) => a.ruolo === 'musica') || audio[0] || null;
const mese = meseDelPiano(CFG.mese);
const richiesta = { reel: Math.max(0, intero(CFG.reel, intero(CFG.REEL, 8))), post: Math.max(0, intero(CFG.post, intero(CFG.POST, 8))), storie: Math.max(0, intero(CFG.storie, intero(CFG.STORIE, 16))) };
const nv = file.filter((x) => x.tipo === 'video').length;
const nf = file.length - nv;
const secondi = file.reduce((s, x) => s + (x.durata || 0), 0);
const trascrivi = siNo(CFG.TRASCRIVI, true);
// stima: analisi ~0,3× la durata (più ~0,8× se si trascrive), caricamento, Claude, montaggio
const minuti = Math.max(5, Math.round(secondi * (0.3 + (trascrivi ? 0.8 : 0)) / 60 + nf * 0.05 + file.reduce((s, x) => s + x.byte, 0) / 1048576 / 600 + 6 + richiesta.reel * 1.2 + richiesta.post * 0.3 + richiesta.storie * 0.5));
const lavoro = {
  lavoro: 'giro',
  avviato: partiRoma().data + ' ' + partiRoma().ora,
  cliente: { cliente: T.cliente, nome_locale: T.nome_locale, scheda: T.scheda, marchio: T.marchio, marchio_valido: T.marchio_valido !== false, anteprime: T.anteprime === true, logo: T.logo },
  servizio: S,
  mese,
  richiesta,
  note: accorcia(testo(CFG.note).replace(/\brifai\b/gi, '').trim(), 2000),
  file,
  musica,
  scartati,
  secondi_video: Math.round(secondi),
  stima_minuti: minuti,
};
const durataTesto = secondi >= 60 ? Math.round(secondi / 60) + ' minuti di girato' : Math.round(secondi) + ' secondi di girato';
const messaggio = 'Ho trovato ' + nv + ' video' + (secondi ? ' (' + durataTesto + ')' : '') + ' e ' + nf + ' foto in «' + S.nome + '» di ' + T.nome_locale + '. '
  + 'Preparo il piano di ' + mese.nome + ': ' + richiesta.reel + ' reel, ' + richiesta.post + ' post e caroselli, ' + richiesta.storie + ' storie. '
  + 'Ci vorrà circa ' + (minuti >= 90 ? Math.round(minuti / 60) + ' ore' : minuti + ' minuti') + ': ti scrivo su Telegram a ogni passo.'
  + (scartati.length ? ' File saltati: ' + accorcia(scartati.join('; '), 400) + '.' : '')
  + (norm(CFG.MODALITA) === 'attivo' ? '' : ' Modalità PROVA: i contenuti finiscono su Drive, nel Calendario non scrivo niente.');
// Lo stesso servizio non parte due volte: il modulo e il guardiano delle cartelle segnano nella memoria del workflow
// (static data) le cartelle avviate. Dal modulo, una cartella partita nelle ultime 12 ore si ferma, salvo «rifai» nelle note.
const ST = $getWorkflowStaticData('global');
ST.servizi = ST.servizi || {};
const gia = ST.servizi[S.id];
const daGuardiano = CFG.origine === 'cartella';
const adesso = new Date();
if (!daGuardiano && gia && gia.avviato && !/\brifai\b/i.test(testo(CFG.note)) && adesso - (Date.parse(gia.avviato) || 0) < 12 * 3600000) {
  const quando = partiRoma(new Date(gia.avviato));
  return [{ json: { ok: false, messaggio: 'Il servizio «' + S.nome + '» è già partito il ' + quando.giorno + '/' + quando.mese + ' alle ' + quando.ora + (gia.da === 'cartella' ? ', da solo (il guardiano delle cartelle)' : ', dal modulo') + ': i messaggi arrivano su Telegram. Se vuoi rifarlo davvero, scrivi «rifai» nelle note.' } }];
}
ST.servizi[S.id] = { ...(gia || {}), visto: (gia && gia.visto) || adesso.toISOString(), avviato: adesso.toISOString(), nome: S.nome, cliente: T.cliente, da: daGuardiano ? 'cartella' : 'modulo' };
return [{ json: { ok: true, lavoro, messaggio } }];
