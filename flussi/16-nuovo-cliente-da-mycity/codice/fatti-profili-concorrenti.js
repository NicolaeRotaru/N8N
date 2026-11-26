// 26 · Fatti · Instagram dei concorrenti — i profili Instagram dei concorrenti vicini, da leggere con Business Discovery
// (l'API ufficiale, con l'account professionale di MyCity: ammessa). Il nome del profilo viene da OpenStreetMap
// (contact:instagram) o da un collegamento instagram.com/… nella pagina del loro sito che n8n ha appena scaricato.
// Nessuna pagina di Instagram si apre: si legge solo l'API. Un elemento per profilo; se non ce n'è nessuno, salta = true.
// Inserito da N8N/flussi/16-nuovo-cliente-da-mycity/fatti.mjs.
const testo = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const eseguito = (nome) => { try { return $(nome).isExecuted; } catch (e) { return false; } };
const siti = $('Fatti · Siti dei concorrenti').all().map((x) => x.json || {});
const concorrenti = (siti[0] && Array.isArray(siti[0].concorrenti)) ? siti[0].concorrenti : [];
const NON_PROFILI = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'direct', 'about', 'legal', 'developer', 'sharer']);
const html = {};
if (eseguito('Fatti · Scarica i siti dei concorrenti')) {
  $('Fatti · Scarica i siti dei concorrenti').all().forEach((it, i) => {
    const k = it && it.pairedItem && typeof it.pairedItem.item === 'number' ? it.pairedItem.item : i;
    const s = siti[k];
    const j = (it && it.json) || {};
    const corpo = typeof j.data === 'string' ? j.data : typeof j.body === 'string' ? j.body : '';
    if (s && s.nome && corpo) html[s.nome] = corpo.slice(0, 1000000);
  });
}
const profili = [];
for (const c of concorrenti) {
  let profilo = c.profilo_osm;
  if (!profilo && html[c.nome]) {
    for (const m of html[c.nome].matchAll(/instagram\.com\/([A-Za-z0-9._]{2,30})/g)) { const h = m[1].replace(/\.+$/, ''); if (!NON_PROFILI.has(h.toLowerCase())) { profilo = h; break; } }
  }
  if (profilo && /^[A-Za-z0-9._]{2,30}$/.test(profilo) && !profili.some((p) => p.profilo.toLowerCase() === profilo.toLowerCase())) profili.push({ salta: false, nome: c.nome, profilo });
}
return profili.length ? profili.map((p) => ({ json: p })) : [{ json: { salta: true, motivo: 'nessun profilo Instagram trovato per i concorrenti' } }];
