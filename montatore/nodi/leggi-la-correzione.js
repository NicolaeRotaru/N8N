// La risposta dell'AD alla correzione → il piano da ricontrollare (se non è leggibile resta il primo).
const r = $input.first().json || {};
const x = leggiClaude(r);
const avvisi = (Array.isArray(r.avvisi) ? r.avvisi : []).map((a) => accorcia(testo(a && (a.messaggio || a)), 200)).filter(Boolean);
if (!x.ok || !Array.isArray(x.dati.contenuti)) return [{ json: { ok: false, piano: $('Leggi il piano').first().json.piano, motivo: x.motivo || 'senza contenuti', avvisi_ad: avvisi } }];
return [{ json: { ok: true, piano: { contenuti: x.dati.contenuti }, note: testo(x.dati.note_per_il_team), avvisi_ad: avvisi } }];
