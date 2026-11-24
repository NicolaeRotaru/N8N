// (guardiano delle cartelle) Un servizio è pronto quando ha del materiale e nessun file nuovo da QUIETE_MINUTI
// (la copia dalla scheda SD è finita). Allora parte il montaggio del mese prossimo, una volta sola per cartella.
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
const out = [];
for (const [id, e] of per) {
  if (e.errori) continue; // Drive non ha risposto: si riguarda al prossimo giro
  const materiale = [...e.file.values()].filter((f) => eVideo(f) || eFoto(f) || eAudio(f) || eHeic(f));
  if (!materiale.length) continue;
  const ultimo = Math.max(...materiale.map((f) => Date.parse(f.createdTime) || 0));
  if (ora - ultimo < quiete) continue; // si sta ancora copiando
  S.servizi[id] = { ...(S.servizi[id] || {}), avviato: new Date(ora).toISOString() };
  out.push({ json: {
    lavoro: 'avvia',
    origine: 'cartella',
    cliente: e.s.cliente,
    cartella: linkCartella(id),
    servizio_nome: e.s.servizio_nome,
    mese: '',
    reel: intero(J.REEL, 10),
    post: intero(J.POST, 8),
    storie: intero(J.STORIE, 16),
    note: '',
    messaggio: '👀 <b>Servizio nuovo</b> · ' + h(e.s.nome_locale) + ' · «' + h(e.s.servizio_nome) + '»\n' + materiale.length + ' file, l\'ultimo caricato ' + Math.round((ora - ultimo) / 60000) + ' minuti fa: parto da solo con il piano del mese prossimo.',
  } });
}
return out;
