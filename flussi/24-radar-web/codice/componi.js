// 24 · Componi il messaggio — il testo dell'AD se è arrivato; altrimenti quanti titoli nuovi per
// fonte, con i primi tre. Sempre in fondo le fonti non lette.
const cfg = $('Config').first().json;
const r = $('Estrai i titoli').first().json;
const lavoro = $('Prepara il lavoro').first().json;
const VERO = String(cfg.MODALITA || '').trim().toLowerCase() === 'vero';
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let ad = null;
try { ad = $('Chiedi all’AD cosa conta').isExecuted ? ($('Chiedi all’AD cosa conta').first().json || {}) : null; } catch { ad = null; }
const testoAD = ad && ad.ok === true && ad.risultato && typeof ad.risultato.testo === 'string' && ad.risultato.testo.trim() ? ad.risultato.testo.trim() : null;
const ora = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date());
const blocchi = [`📡 <b>Radar del web</b> · ${esc(ora)}${VERO ? '' : ' · 🧪 prova'}`, `Fonti lette: ${r.lette} su ${r.fonti.length} · titoli nuovi: ${r.nuovi_totali}`];
if (testoAD) blocchi.push(esc(testoAD));
else {
  const motivo = lavoro.non_mandare || (ad && (ad.errore || (ad.error && (ad.error.message || String(ad.error))))) || "l'AD non ha risposto";
  blocchi.push(`<i>Senza il commento dell'AD: ${esc(motivo)}.</i>`);
  for (const f of r.fonti.filter((x) => x.letta && x.nuovi && x.nuovi.length)) blocchi.push(`<b>${esc(f.nome)}</b> (${f.nuovi.length})\n${f.nuovi.slice(0, 3).map((t) => `• ${esc(t)}`).join('\n')}`);
  if (r.fonti.some((x) => x.primo_giro)) blocchi.push('<i>Primo giro su alcune fonti: i loro titoli di oggi fanno da base, i nuovi si vedono da domani.</i>');
}
if (r.non_lette.length) blocchi.push(`<b>Non lette</b>\n${r.non_lette.map((x) => `• ${esc(x)}`).join('\n')}`);
let messaggio = blocchi.join('\n\n');
if (messaggio.length > 3900) messaggio = `${messaggio.replace(/<\/?[bi]>/g, '').slice(0, 3860).replace(/&[a-z]*$/i, '')}\n… (accorciato)`;
// Senza niente di nuovo e senza fonti cieche, nessun messaggio: non serve un «niente» ogni mattina.
const manda = VERO && (r.nuovi_totali > 0 || r.non_lette.length > 0);
return [{ json: { messaggio, con_testo_ad: !!testoAD, manda } }];
