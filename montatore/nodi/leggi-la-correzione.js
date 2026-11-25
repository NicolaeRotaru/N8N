// La risposta di Claude alla correzione → il piano da ricontrollare (se non è leggibile resta il primo).
const x = leggiClaude($input.first().json);
if (!x.ok || !Array.isArray(x.dati.contenuti)) return [{ json: { ok: false, piano: $('Leggi il piano').first().json.piano, motivo: x.motivo || 'senza contenuti' } }];
return [{ json: { ok: true, piano: { contenuti: x.dati.contenuti }, note: testo(x.dati.note_per_il_team) } }];
