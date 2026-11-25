// (guardiano delle cartelle) Le cartelle nuove dentro quelle dei clienti = servizi appena caricati (non ancora avviati).
const S = $getWorkflowStaticData('global');
S.servizi = S.servizi || {};
const clienti = $('Guarda: cartelle dei clienti').all().map((x) => x.json);
const out = [];
$input.all().forEach((x, i) => {
  const cl = clienti[i];
  if (!cl || !x.json || x.json.error) return;
  for (const f of x.json.files || []) {
    if (/pronti|logo|contratt|archivio|fattur|document|preventiv/i.test(testo(f.name))) continue;
    const st = S.servizi[f.id];
    if (st && st.avviato) continue;
    if (!st) S.servizi[f.id] = { visto: new Date().toISOString(), nome: testo(f.name), cliente: cl.cliente };
    out.push({ json: { ...cl, servizio_id: f.id, servizio_nome: testo(f.name), creata: testo(f.createdTime) } });
  }
});
// i più recenti prima; al massimo 25 per giro (ognuno costa due o tre letture di Drive)
return out.sort((a, b) => testo(b.json.creata).localeCompare(testo(a.json.creata))).slice(0, 25);
