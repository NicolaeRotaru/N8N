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
const mese = meseDelPiano(CFG.mese, intero(CFG.GIORNO_LIMITE_MESE, 10));
// quanti contenuti: quelli scritti nel modulo, altrimenti il pacchetto del cliente (foglio Clienti), altrimenti il Config
const Q = T.quantita || {};
// Nel modulo vale solo un numero intero da 0 a 999 («0» = nessuno); qualunque altra cosa («dieci», «-3», «7.5») si
// ignora e lo dice il messaggio di partenza.
const scrittoBene = (v) => /^\d{1,3}$/.test(testo(v).trim());
const malScritti = ['reel', 'post', 'storie'].filter((k) => testo(CFG[k]).trim() !== '' && !scrittoBene(CFG[k]));
const quanti = (scritto, pacchetto, diSerie) => (scrittoBene(scritto) ? Number(testo(scritto).trim()) : Number.isFinite(pacchetto) && pacchetto !== null ? Math.max(0, pacchetto) : diSerie);
const richiesta = { reel: quanti(CFG.reel, Q.reel, intero(CFG.REEL, 10)), post: quanti(CFG.post, Q.post, intero(CFG.POST, 8)), storie: quanti(CFG.storie, Q.storie, intero(CFG.STORIE, 16)) };
const dalPacchetto = ['reel', 'post', 'storie'].some((k) => !scrittoBene(CFG[k]) && Number.isFinite(Q[k]) && Q[k] !== null);
const nv = file.filter((x) => x.tipo === 'video').length;
const nf = file.length - nv;
const secondi = file.reduce((s, x) => s + (x.durata || 0), 0);
const trascrivi = siNo(CFG.TRASCRIVI, true);
// stima: analisi ~0,3× la durata (più ~0,8× se si trascrive), caricamento, Claude, montaggio
// un video senza la durata di Drive (ancora in elaborazione, o un formato che Drive non legge): la durata si stima dal
// peso, a 130 MB al minuto (il 1080p del telefono; col 4K la stima esce più lunga, e il posto si libera comunque a fine giro)
const secondiStimati = file.reduce((s, x) => s + (x.durata || (x.tipo === 'video' ? (x.byte / 1048576 / 130) * 60 : 0)), 0);
const minuti = Math.max(5, Math.round(secondiStimati * (0.3 + (trascrivi ? 0.8 : 0)) / 60 + nf * 0.05 + file.reduce((s, x) => s + x.byte, 0) / 1048576 / 600 + 6 + richiesta.reel * 1.2 + richiesta.post * 0.3 + richiesta.storie * 0.5));
const lavoro = {
  lavoro: 'giro',
  avviato: partiRoma().data + ' ' + partiRoma().ora,
  cliente: { cliente: T.cliente, nome_locale: T.nome_locale, scheda: T.scheda, marchio: T.marchio, marchio_valido: T.marchio_valido !== false, anteprime: T.anteprime === true, logo: T.logo },
  servizio: S,
  mese,
  richiesta,
  note: accorcia(testo(CFG.note).replace(/\b(rifai|subito)\b/gi, '').replace(/^[\s,;:.\-]+/, '').trim(), 2000),
  file,
  musica,
  scartati,
  secondi_video: Math.round(secondi),
  stima_minuti: minuti,
};
const durataTesto = secondi >= 60 ? Math.round(secondi / 60) + ' minuti di girato' : Math.round(secondi) + ' secondi di girato';
const messaggio = 'Ho trovato ' + nv + ' video' + (secondi ? ' (' + durataTesto + ')' : '') + ' e ' + nf + ' foto in «' + S.nome + '» di ' + T.nome_locale + '. '
  + 'Preparo il piano di ' + mese.nome + ': ' + richiesta.reel + ' reel, ' + richiesta.post + ' post e caroselli, ' + richiesta.storie + ' storie' + (dalPacchetto ? ' (dal pacchetto del cliente)' : '') + '. '
  + 'Ci vorrà circa ' + (minuti >= 90 ? Math.round(minuti / 60) + ' ore' : minuti + ' minuti') + ': ti scrivo su Telegram a ogni passo.'
  + malScritti.map((k) => ' Nel modulo «' + accorcia(testo(CFG[k]).trim(), 20) + '» (' + k + ') non è un numero da 0 a 999: ho usato ' + (Number.isFinite(Q[k]) && Q[k] !== null ? 'il pacchetto del cliente' : 'la quantità di serie') + ' (' + richiesta[k] + ').').join('')
  + (scartati.length ? ' File saltati: ' + accorcia(scartati.join('; '), 400) + '.' : '')
  + (norm(CFG.MODALITA) === 'attivo' ? '' : ' Modalità PROVA: i contenuti finiscono su Drive, nel Calendario non scrivo niente.');
// Lo stesso servizio non parte due volte. Il segno è la cartella «Pronti (montatore)» dentro il servizio: si crea
// appena il montaggio parte (dal modulo o dal guardiano), sta su Drive (uno solo per tutte le esecuzioni, non scade, lo
// vede anche il team). Se c'è già, il montaggio si ferma e lo dice; «rifai» nelle note lo fa ripartire.
const nomePronti = testo(CFG.NOME_CARTELLA_PRONTI || 'Pronti (montatore)') + (norm(CFG.MODALITA) === 'attivo' ? '' : ' - prova');
const radicePronti = chiaveNome(testo(CFG.NOME_CARTELLA_PRONTI || 'Pronti (montatore)'));
const figli = ($('Elenca il servizio').isExecuted ? $('Elenca il servizio').first().json || {} : {}).files || [];
const gia = figli.find((f) => eCartella(f) && chiaveNome(f.name).startsWith(radicePronti));
if (gia && !/\brifai\b/i.test(testo(CFG.note))) {
  return [{ json: { ok: false, messaggio: 'In «' + S.nome + '» c\'è già la cartella «' + testo(gia.name) + '»: questo servizio è già partito (o è già montato). Se vuoi rifarlo davvero, scrivi «rifai» nelle note.' } }];
}
// la fine stimata del giro si scrive sulla cartella «Pronti» (proprietà di Drive): il guardiano delle cartelle la legge e
// non fa partire un altro servizio finché il giro non ha finito, anche se è partito dal modulo o con «rifai». ×1,3 e 30
// minuti in più per le attese dell'AD (fino a 15 minuti a corsa).
const stessa = figli.find((f) => eCartella(f) && testo(f.name) === nomePronti);
// mai meno di GIRI_DISTANZA_MINUTI: anche un servizio piccolo fa 3-4 corse dell'AD, fino a 15 minuti l'una
const fine = new Date(Date.now() + Math.max(Math.max(30, intero(CFG.GIRI_DISTANZA_MINUTI, 120)), Math.round(minuti * 1.3) + 30) * 60000).toISOString();
lavoro.pronti = { nome: nomePronti, dentro: S.id, crea: !stessa, id: stessa ? testo(stessa.id) : '', fine };
return [{ json: { ok: true, lavoro, messaggio, pronti: lavoro.pronti } }];
