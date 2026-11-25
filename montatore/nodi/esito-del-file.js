// (esecuzione «carica») Il file è nell'officina: restituisco al giro il codice e gli avvisi.
const J = $('Config').first().json;
const r = $input.first().json || {};
if (r.error || !r.materiale) {
  return [{ json: { ok: false, file: J.file.nome, motivo: accorcia(testo(r.error && (r.error.message || r.error.description || r.error)) || 'risposta senza materiale', 300) } }];
}
const m = r.materiale;
return [{ json: { ok: true, file: J.file.nome, codice: m.codice, tipo: m.tipo, scene: (m.scene || []).length, durata: m.durata || 0, parlato: !!m.parlato, gia_caricato: !!r.gia_caricato, avvisi: (r.avvisi || []).map((a) => testo(a.messaggio)).filter(Boolean) } }];
