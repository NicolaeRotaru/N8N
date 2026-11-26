// (guardiano delle cartelle) Un servizio è pronto quando ha del materiale e nessun file nuovo da QUIETE_MINUTI
// (la copia dalla scheda SD è finita). Allora parte il montaggio, una volta sola per cartella (il mese lo decide «Prepara il lavoro»).
// UN servizio alla volta, e il successivo solo dopo GIRI_DISTANZA_MINUTI (di serie 120): due giri insieme fanno partire
// «90 · Chiedi all'AD» in parallelo, e le corse in parallelo si cancellano a vicenda il conto dei tetti (40 al giorno,
// 25 all'ora). Gli altri servizi pronti restano in fila e partono ai giri seguenti, il più vecchio per primo.
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
const ultimoAvvio = Date.parse(S.ultimo_avvio || '') || 0;
if (!pronti.length || ora - ultimoAvvio < distanza) return [];
pronti.sort((a, b) => a.ultimo - b.ultimo);
const out = [];
for (const { id, e, materiale, ultimo } of pronti.slice(0, 1)) {
  S.servizi[id] = { ...(S.servizi[id] || {}), avviato: new Date(ora).toISOString() };
  S.ultimo_avvio = new Date(ora).toISOString();
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
      + (inFila ? '\nAltri ' + inFila + ' servizi pronti aspettano in fila: ne parte uno ogni ' + Math.round(distanza / 60000) + ' minuti.' : ''),
  } });
}
return out;
