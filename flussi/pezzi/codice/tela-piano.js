// 94 · Foto sulla tela — il piano: quanto è grande la tela e dove va la foto.
// Entra (dal flusso che chiama): { larghezza, altezza, tela_w, tela_h, colore, qualita, nome_file } + il file in «data».
// Senza tela_w/tela_h la tela è grande quanto la foto: serve a togliere la trasparenza (sfondo pieno).
const d = $('Da un altro flusso').first().json || {};
const voce = $input.first() || {};
const m = voce.json || {};
const num = (v, n) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? Math.round(x) : n; };
const w = num((m.size || {}).width, num(d.larghezza, 1568));
const h = num((m.size || {}).height, num(d.altezza, 1568));
const tw = Math.max(w, num(d.tela_w, w));
const th = Math.max(h, num(d.tela_h, h));
const colore = /^#[0-9a-f]{6}$/i.test(String(d.colore || '')) ? String(d.colore) : '#ffffff';
const nome = String(d.nome_file || '').trim() || 'foto.jpg';
return [{ json: { tela_w: tw, tela_h: th, x: Math.round((tw - w) / 2), y: Math.round((th - h) / 2), colore,
  qualita: Math.min(100, num(d.qualita, 85)), nome_file: nome }, binary: voce.binary }];
