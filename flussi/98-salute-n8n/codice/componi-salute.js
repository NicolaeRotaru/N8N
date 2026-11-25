// 98 · Componi la salute — per ogni flusso acceso: quando ha girato bene l'ultima volta e quante
// volte è fallito nelle ultime ORE_FINESTRA ore. Esce un testo corto (HTML di Telegram) che il 17
// mette in fondo al messaggio delle 8:10, e i numeri per chi lo chiama.
//
// Onestà: un flusso che per scelta non salva i giri buoni (saveDataSuccessExecution = none) non ha
// un «ultimo giro buono» leggibile: si scrive «giri buoni non salvati», mai «mai girato».

const cfg = $('Config').first().json;
const ADESSO = Date.now();
const FINESTRA = (Number(cfg.ORE_FINESTRA) || 24) * 3600000;
const VECCHIO = (Number(cfg.ORE_SENZA_GIRO_BUONO) || 48) * 3600000;
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtOra = (t) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(t));

const flussi = $('Un elemento per flusso acceso').all().map((x) => x.json);
if (flussi.length === 1 && flussi[0]._niente) {
  const f = flussi[0];
  const testo = f.motivo === 'nessun flusso acceso'
    ? `<b>⚙️ Salute di n8n</b>\n🟡 Nessun flusso acceso su ${f.totali}.`
    : `<b>⚙️ Salute di n8n</b>\n⛔ Non riesco a leggere n8n (${esc(f.motivo)}): non so dire quali flussi girano.`;
  return [{ json: { letto: false, testo, flussi: [] } }];
}

const corpo = (item) => {
  const j = (item && item.json) || {};
  const codice = Number(j.statusCode) || 0;
  let b = j.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  return codice >= 200 && codice < 300 && b && Array.isArray(b.data) ? b.data : null;
};
const buoni = $('Ultimo giro buono').all();
const falliti = $('Giri falliti').all();
const quando = (e) => new Date(e.stoppedAt || e.startedAt || 0).getTime();

const righe = flussi.map((f, i) => {
  const b = corpo(buoni[i]);
  const e = corpo(falliti[i]);
  const ultimoBuono = b && b.length ? quando(b[0]) : null;
  const fallitiFinestra = e ? e.filter((x) => ADESSO - quando(x) <= FINESTRA) : null;
  const ultimoFallito = e && e.length ? quando(e[0]) : null;
  return { nome: f.nome, id: f.id, salva_buoni: f.salva_buoni, ultimo_buono: ultimoBuono, falliti: fallitiFinestra ? fallitiFinestra.length : null,
    ultimo_fallito: ultimoFallito, letto: b !== null && e !== null };
});

// In cima chi ha problemi: falliti nella finestra, poi chi non gira bene da troppo, poi i non letti.
const male = righe.filter((r) => r.falliti > 0);
const fermi = righe.filter((r) => !(r.falliti > 0) && r.salva_buoni && r.letto && (r.ultimo_buono === null || ADESSO - r.ultimo_buono > VECCHIO));
const nonLetti = righe.filter((r) => !r.letto);
const ore = Math.round(FINESTRA / 3600000);
const linee = [`<b>⚙️ Salute di n8n</b> · ${righe.length} flussi accesi su ${flussi[0].totali}`];
if (!male.length && !fermi.length && !nonLetti.length) linee.push(`✅ Nessun flusso fallito nelle ultime ${ore} ore.`);
for (const r of male) linee.push(`🔴 ${esc(r.nome)}: fallito ${r.falliti} ${r.falliti === 1 ? 'volta' : 'volte'} in ${ore} ore (l'ultima ${fmtOra(r.ultimo_fallito)})${r.ultimo_buono ? `, ultimo giro buono ${fmtOra(r.ultimo_buono)}` : ''}`);
for (const r of fermi) linee.push(`🟡 ${esc(r.nome)}: ${r.ultimo_buono ? `ultimo giro buono ${fmtOra(r.ultimo_buono)}` : 'nessun giro buono salvato'}`);
for (const r of nonLetti) linee.push(`⛔ ${esc(r.nome)}: giri non letti`);
const tranquilli = righe.filter((r) => !male.includes(r) && !fermi.includes(r) && !nonLetti.includes(r));
if (tranquilli.length) {
  linee.push(`<i>Senza errori:</i> ${tranquilli.map((r) => `${esc(r.nome)} (${r.ultimo_buono ? fmtOra(r.ultimo_buono) : r.salva_buoni ? 'mai' : 'giri buoni non salvati'})`).join(' · ')}`);
}
return [{ json: { letto: true, testo: linee.join('\n').slice(0, 1800), flussi: righe, falliti_totali: male.reduce((s, r) => s + r.falliti, 0) } }];
