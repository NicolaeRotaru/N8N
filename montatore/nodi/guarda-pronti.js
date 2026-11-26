// (guardiano delle cartelle) Un servizio è pronto quando ha del materiale e nessun file nuovo da QUIETE_MINUTI
// (la copia dalla scheda SD è finita). Allora parte il montaggio, una volta sola per cartella (il mese lo decide «Prepara il lavoro»).
// UN servizio alla volta: due giri insieme fanno partire «90 · Chiedi all'AD» in parallelo, e le corse in parallelo si
// cancellano a vicenda il conto dei tetti (40 al giorno, 25 all'ora). Il successivo parte quando il giro di prima ha
// finito secondo la stima, mai prima di GIRI_DISTANZA_MINUTI. Dove si legge la fine stimata:
// - sulle cartelle «Pronti» dei giri (proprietà montatore_fine, scritta alla partenza da «Prepara il lavoro», qualunque
//   sia la strada: guardiano, modulo, «rifai»): le elenca «Guarda: giri in corso»;
// - nella memoria del guardiano (libero_dopo, la sua stima quando fa partire un servizio, prima che la cartella esista).
// Se l'elenco dei giri non arriva (Drive non risponde) non parte niente: si riguarda al giro dopo.
// Solo il guardiano scrive questa memoria: le esecuzioni del giro e del modulo non la toccano (la riscriverebbero intera).
const J = $('Config').first().json;
const S = $getWorkflowStaticData('global');
S.servizi = S.servizi || {};
const quiete = Math.max(5, intero(J.QUIETE_MINUTI, 30)) * 60000;
const ora = Date.now();
const dove = $('Guarda: sottocartelle').all().map((x) => x.json);
const per = new Map();
$input.all().forEach((x, i) => {
  const s = dove[i];
  if (!s) return;
  const e = per.get(s.servizio_id) || { s, file: new Map(), errori: 0 };
  if (!x.json || x.json.error) e.errori++;
  for (const f of [...((x.json && x.json.files) || []), ...(s.diretti || [])]) e.file.set(f.id, f);
  per.set(s.servizio_id, e);
});
const pronti = [];
for (const [id, e] of per) {
  if (e.errori) continue; // Drive non ha risposto: si riguarda al prossimo giro
  // conta solo il materiale che si monta: una cartella con sola musica o sole HEIC non «consuma» la partenza
  const materiale = [...e.file.values()].filter((f) => eVideo(f) || eFoto(f));
  if (!materiale.length) continue;
  const ultimo = Math.max(...materiale.map((f) => Date.parse(f.createdTime) || 0));
  if (ora - ultimo < quiete) continue; // si sta ancora copiando
  pronti.push({ id, e, materiale, ultimo });
}
const distanza = Math.max(30, intero(J.GIRI_DISTANZA_MINUTI, 120)) * 60000;
const elenco = $('Guarda: giri in corso').isExecuted ? $('Guarda: giri in corso').first().json || {} : { files: [] };
if (elenco.error || !Array.isArray(elenco.files) || elenco.nextPageToken || elenco.incompleteSearch) return [];
// la fine più lontana fra i giri in corso (una fine oltre 24 ore vale 24 ore: tiene fermo al massimo un giorno)
const fineGiri = Math.max(0, ...elenco.files.map((f) => Date.parse(((f && f.appProperties) || {}).montatore_fine || '')).filter((t) => Number.isFinite(t)).map((t) => Math.min(t, ora + 24 * 3600000)));
// un'ora scritta male, o nel futuro (orologio tornato indietro), non blocca il guardiano per sempre
const passato = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) && t <= ora ? t : 0; };
const liberoDopo = Date.parse(S.libero_dopo || '');
const libero = Math.max(fineGiri, Number.isFinite(liberoDopo) && liberoDopo <= ora + 24 * 3600000 ? liberoDopo : 0,
  passato(S.ultimo_avvio) && passato(S.ultimo_avvio) + distanza, passato(S.giro_visto) && passato(S.giro_visto) + distanza);
if (!pronti.length || ora < libero) return [];
pronti.sort((a, b) => a.ultimo - b.ultimo);
// quanto dura il giro di questo servizio (stima di «Prepara il lavoro» con le quantità di serie)
const stimaMinuti = (materiale) => {
  // senza la durata di Drive (video ancora in elaborazione) la durata si stima dal peso, a 130 MB al minuto
  const secondi = materiale.reduce((x, f) => x + ((Number(f.videoMediaMetadata && f.videoMediaMetadata.durationMillis) || 0) / 1000 || (eVideo(f) ? ((Number(f.size) || 0) / 1048576 / 130) * 60 : 0)), 0);
  const mb = materiale.reduce((x, f) => x + (Number(f.size) || 0), 0) / 1048576;
  const foto = materiale.filter((f) => eFoto(f)).length;
  const q = (k, d) => intero(J[k], d);
  return Math.round(secondi * (0.3 + (siNo(J.TRASCRIVI, true) ? 0.8 : 0)) / 60 + foto * 0.05 + mb / 600 + 6 + q('REEL', 10) * 1.2 + q('POST', 8) * 0.3 + q('STORIE', 16) * 0.5);
};
const out = [];
for (const { id, e, materiale, ultimo } of pronti.slice(0, 1)) {
  S.servizi[id] = { ...(S.servizi[id] || {}), avviato: new Date(ora).toISOString() };
  S.ultimo_avvio = new Date(ora).toISOString();
  const attesa = Math.max(distanza, (Math.round(stimaMinuti(materiale) * 1.3) + 30) * 60000);
  S.libero_dopo = new Date(ora + attesa).toISOString();
  const inFila = pronti.length - 1;
  out.push({ json: {
    lavoro: 'avvia',
    origine: 'cartella',
    cliente: e.s.cliente,
    cartella: linkCartella(id),
    servizio_nome: e.s.servizio_nome,
    // mese e quantità vuoti: li decide «Prepara il lavoro» (regola del giorno limite, pacchetto del cliente)
    mese: '',
    reel: '',
    post: '',
    storie: '',
    note: '',
    messaggio: '👀 <b>Servizio nuovo</b> · ' + h(e.s.nome_locale) + ' · «' + h(e.s.servizio_nome) + '»\n' + materiale.length + ' file, l\'ultimo caricato ' + Math.round((ora - ultimo) / 60000) + ' minuti fa: parto da solo con il piano del mese (quello in corso fino al giorno ' + intero(J.GIORNO_LIMITE_MESE, 10) + ', poi il successivo).'
      + (inFila ? '\n' + (inFila === 1 ? 'Un altro servizio pronto aspetta' : 'Altri ' + inFila + ' servizi pronti aspettano') + ' in fila: parte quando questo ha finito, fra circa ' + Math.round(attesa / 60000) + ' minuti.' : ''),
  } });
}
return out;
