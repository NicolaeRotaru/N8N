// 25 · Componi il messaggio — il testo dell'AD se è arrivato bene; altrimenti (AD fermo, tetto
// raggiunto, prova, database cieco) i soli numeri e le sentinelle, detto chiaramente.

const cfg = $('Config').first().json;
const a = $('Calcola i numeri').first().json;
const lavoro = $('Prepara il lavoro').first().json;
const VERO = String(cfg.MODALITA || '').trim().toLowerCase() === 'vero';
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let r = null;
try { r = $('Chiedi il testo all’AD').isExecuted ? ($('Chiedi il testo all’AD').first().json || {}) : null; } catch { r = null; }
const testoAD = r && r.ok === true && r.risultato && typeof r.risultato.testo === 'string' && r.risultato.testo.trim() ? r.risultato.testo.trim() : null;
const motivo = testoAD ? null : (lavoro.non_mandare || (r && r.errore) || (r && r.error && (r.error.message || String(r.error))) || "l'AD non ha risposto");

const momento = lavoro.dati.momento;
const ora = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date());
const titolo = momento === 'mattino' ? '🌅 <b>Piano del mattino</b>' : '🌙 <b>Report della sera</b>';
const n = a.numeri || {};
const v = (x) => (x === null || x === undefined ? 'non misurato' : esc(x));
const numeri = [
  `• Ordini nelle ultime 24 ore: ${v(n.ordini_24h)} · in 7 giorni: ${v(n.ordini_7g)}`,
  `• Incasso 7 giorni: ${n.incasso_7g === null || n.incasso_7g === undefined ? 'non misurato' : esc(Number(n.incasso_7g).toFixed(2).replace('.', ',')) + ' €'}`,
  `• Consegne in corso: ${v(n.consegne_in_corso)} · ferme: ${v(n.ordini_fermi)}`,
  `• Nuovi clienti in 24 ore: ${v(n.nuovi_clienti_24h)} · carrelli da recuperare: ${v(n.carrelli_da_recuperare)}`,
];
const PALLINO = { rosso: '🔴', giallo: '🟡', verde: '🟢' };
const blocchi = [`${titolo} · ${esc(ora)}${VERO ? '' : ' · 🧪 prova'}`];
if (testoAD) blocchi.push(esc(testoAD));
else blocchi.push(`<i>Solo i numeri: ${esc(motivo)}.</i>`, (a.sentinelle || []).length ? (a.sentinelle || []).map((s) => `${PALLINO[s.colore] || '•'} ${esc(s.titolo)}`).join('\n') : 'Nessun segnale acceso.');
blocchi.push(`<b>I numeri</b>\n${numeri.join('\n')}`);
if ((a.gap || []).length) blocchi.push(`<b>Non misurato</b>\n${a.gap.map((g) => `• ${esc(g)}`).join('\n')}`);
let messaggio = blocchi.join('\n\n');
if (messaggio.length > 3900) messaggio = `${messaggio.replace(/<\/?[bi]>/g, '').slice(0, 3860).replace(/&[a-z]*$/i, '')}\n… (accorciato)`;
return [{ json: { messaggio, con_testo_ad: !!testoAD, motivo, manda: VERO } }];
