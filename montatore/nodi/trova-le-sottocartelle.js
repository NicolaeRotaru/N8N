// Nella cartella del servizio: le sottocartelle «video verticali», «video orizzontali», «foto» (e «musica»).
// I file sciolti nella cartella del servizio valgono lo stesso (si riconoscono dal tipo).
const S = $('Trova la cartella del servizio').first().json.servizio;
const r = $input.first().json || {};
if (r.error || !Array.isArray(r.files)) return [{ json: { ok: false, messaggio: 'Non riesco a leggere la cartella «' + S.nome + '» su Drive.' } }];
const ruoli = {};
const ignorate = [];
for (const f of r.files) {
  if (!eCartella(f)) continue;
  const ruolo = ruoloCartella(f.name);
  if (ruolo && !testo(f.name).startsWith('_') && !/pronti/i.test(f.name)) ruoli[f.id] = { ruolo, nome: testo(f.name) };
  else ignorate.push(testo(f.name));
}
const genitori = [S.id, ...Object.keys(ruoli)];
// Una sola ricerca per tutte le cartelle: ('a' in parents or 'b' in parents …)
const q = '(' + genitori.map((id) => "'" + id + "' in parents").join(' or ') + ") and trashed = false and mimeType != '" + CARTELLA_MIME + "'";
return [{ json: { ok: true, q, ruoli, ignorate } }];
