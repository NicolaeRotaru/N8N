// (guardiano delle cartelle) Dentro ogni servizio: le sottocartelle da guardare (video verticali, orizzontali, foto…)
// più i file sciolti. Un servizio senza sottocartelle si guarda da solo.
const servizi = $('Guarda: servizi nuovi').all().map((x) => x.json);
const out = [];
$input.all().forEach((x, i) => {
  const s = servizi[i];
  if (!s || !x.json || x.json.error) return;
  const voci = x.json.files || [];
  const cartelle = voci.filter((f) => eCartella(f) && ruoloCartella(f.name) && !/pronti/i.test(testo(f.name)));
  const diretti = voci.filter((f) => !eCartella(f)).map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, createdTime: f.createdTime }));
  const dove = cartelle.length ? cartelle.map((f) => f.id) : [s.servizio_id];
  dove.forEach((id, k) => out.push({ json: { ...s, cartella: id, diretti: k === 0 && cartelle.length ? diretti : [] } }));
});
return out;
