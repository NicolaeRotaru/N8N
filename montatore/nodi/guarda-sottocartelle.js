// (guardiano delle cartelle) Dentro ogni servizio: le sottocartelle da guardare (video verticali, orizzontali, foto…)
// più i file sciolti. Un servizio senza sottocartelle si guarda da solo.
const servizi = $('Guarda: servizi nuovi').all().map((x) => x.json);
const out = [];
$input.all().forEach((x, i) => {
  const s = servizi[i];
  if (!s || !x.json || x.json.error) return;
  const voci = x.json.files || [];
  // c'è già la cartella «Pronti»: il servizio è già partito (dal modulo o da un giro di prima). Non si riparte.
  const radicePronti = chiaveNome(testo($('Config').first().json.NOME_CARTELLA_PRONTI || 'Pronti (montatore)'));
  if (voci.some((f) => eCartella(f) && chiaveNome(f.name).startsWith(radicePronti))) {
    const S = $getWorkflowStaticData('global');
    S.servizi = S.servizi || {};
    S.servizi[s.servizio_id] = { ...(S.servizi[s.servizio_id] || {}), avviato: new Date().toISOString(), da: 'pronti' };
    return;
  }
  const cartelle = voci.filter((f) => eCartella(f) && ruoloCartella(f.name) && !/pronti/i.test(testo(f.name)));
  const diretti = voci.filter((f) => !eCartella(f)).map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, createdTime: f.createdTime }));
  // un servizio è una cartella con le sottocartelle del servizio (video verticali, video orizzontali, foto…): una cartella
  // qualunque («Grafiche», «Menu») non fa partire niente. I servizi con i file sciolti si lanciano dal modulo.
  if (!cartelle.length) return;
  cartelle.forEach((f, k) => out.push({ json: { ...s, cartella: f.id, diretti: k === 0 ? diretti : [] } }));
});
return out;
