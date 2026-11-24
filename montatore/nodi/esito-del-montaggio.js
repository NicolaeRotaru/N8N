// (esecuzione «monta») L'officina ha montato: che cosa scaricare, e se serve il controllo di Claude.
const J = $('Config').first().json;
const r = $input.first().json || {};
if (r.error || !Array.isArray(r.file)) {
  const e = r.error || {};
  let motivo = testo(e.message || e.description || e);
  const corpo = e.cause && e.cause.response && e.cause.response.body;
  try { const b = typeof corpo === 'string' ? JSON.parse(corpo) : corpo; if (b && b.messaggio) motivo = b.messaggio; } catch (x) { /* resta il motivo di n8n */ }
  return [{ json: { ok: false, controlla: false, motivo: accorcia(motivo || 'risposta senza file', 400) } }];
}
const video = r.file.find((f) => f.tipo === 'video');
const fotogrammi = r.file.find((f) => f.tipo === 'fotogrammi');
return [{ json: {
  ok: true,
  controlla: !!(J.controllo && video && fotogrammi),
  fotogrammi: fotogrammi ? percorsoOfficina(fotogrammi.url) : '',
  file: r.file.filter((f) => f.tipo !== 'fotogrammi').map((f) => ({ tipo: f.tipo, percorso: percorsoOfficina(f.url), durata: f.durata || null })),
  avvisi: (r.avvisi || []).map((a) => testo(a.messaggio)).filter(Boolean),
} }];
