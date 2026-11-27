// 16 · Componi i messaggi — la lista della settimana per Nicola su Telegram, col dossier dell'AD se è arrivato.
// Più messaggi se non ci sta in uno (Telegram: 4096 caratteri). Mappa non letta = lo si dice, mai «zero attività».
const cfg = $('Config').first().json;
const f = $('Metti in fila').first().json;
const VERO = String(cfg.MODALITA || '').trim().toLowerCase() === 'vero';
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let ad = null;
try { ad = $('Chiedi all’AD i dossier').isExecuted ? ($('Chiedi all’AD i dossier').first().json || {}) : null; } catch { ad = null; }
const schede = {};
if (ad && ad.ok === true && ad.risultato && Array.isArray(ad.risultato.schede)) for (const s of ad.risultato.schede) if (s && s.osm) schede[String(s.osm)] = s;
const conDossier = Object.keys(schede).length > 0;
const settimana = (() => { // il lunedì di questa settimana, ora di Piacenza
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  const gs = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[p.weekday] ?? 0;
  d.setUTCDate(d.getUTCDate() - gs);
  return d.toISOString().slice(0, 10);
})();
const gg = settimana.split('-').reverse().slice(0, 2).join('/');
const num = (n) => Number(n || 0).toLocaleString('it-IT');
const metri = (m) => (m < 1000 ? `${m} m` : `${(m / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} km`);
const testa = `<b>Attività da visitare</b> · settimana del ${gg}${VERO ? '' : ' · prova'}`;
const blocchi = [];
if (!f.letta) {
  blocchi.push(`${testa}\n\nQuesta settimana la lista non c’è: ${esc(f.motivo || 'la mappa non ha risposto')}. Non vuol dire che non ci sono attività: la mappa non è stata letta. Il flusso riprova lunedì prossimo, o a mano da n8n.`);
} else {
  const c = f.conti;
  const st = c.stati_finora || {};
  const fuori = [c.catene && `${num(c.catene)} catene`, c.categorie_escluse && `${num(c.categorie_escluse)} in categorie dove non entriamo`, c.chiuse && `${num(c.chiuse)} chiuse`, c.doppioni && `${num(c.doppioni)} doppioni`, c.gia_su_mycity && `${num(c.gia_su_mycity)} già su MyCity`, c.gia_proposte && `${num(c.gia_proposte)} già proposte`, c.senza_nome && `${num(c.senza_nome)} senza nome`].filter(Boolean).join(', ');
  const conto = c.proposte_finora ? `\nIl conto finora: ${num(c.proposte_finora)} proposte · ${num((st.visitata || 0) + (st.si || 0) + (st.no || 0) + (st.iscritta || 0))} visitate · ${num((st.si || 0) + (st.iscritta || 0))} hanno detto sì · ${num(st.iscritta || 0)} iscritte.` : '';
  blocchi.push(`${testa}\n\nSulla mappa ci sono ${num(c.letti)} attività entro ${metri(Number(cfg.RAGGIO_M))} da ${esc(cfg.CENTRO_NOME)}. Tolte ${fuori || 'nessuna'}, ne restano ${num(c.in_fila)} in fila. Queste sono le prime ${f.fila.length}.${c.negozi_mycity_letti ? '' : '\n<i>Il database di MyCity non ha risposto: qualcuna potrebbe essere già iscritta.</i>'}${conto}` +
    (conDossier ? '' : `\n<i>Senza il dossier dell’AD: ${esc((ad && (ad.errore || (ad.prova ? 'Chiedi all’AD è in prova' : ''))) || $('Prepara il lavoro').first().json.non_mandare || 'l’AD non ha risposto')}.</i>`));
  f.fila.forEach((a, i) => {
    const s = schede[a.osm];
    const righe = [`<b>${i + 1}. ${esc(a.nome)}</b> · ${esc(a.tipo)} · ${metri(a.distanza_m)}`,
      [a.indirizzo && esc(a.indirizzo), a.telefono ? `tel ${esc(a.telefono)}` : 'telefono da trovare'].filter(Boolean).join(' · '),
      `Perché: ${esc(a.perche)}.`];
    if (s) {
      if (s.attenzione) righe.push(`<b>Attenzione:</b> ${esc(s.attenzione)}`);
      righe.push(`Chi è: ${esc(s.chi_e)}`);
      if (s.cosa_vende) righe.push(`Cosa vende: ${esc(s.cosa_vende)}`);
      righe.push(`Cosa ci guadagna: ${esc(s.cosa_ci_guadagna)}`, `Come convincerlo: ${esc(s.come_convincerlo)}`, `Da proporre: ${esc(s.cosa_proporre)}`);
    } else if (a.offerta) righe.push(`Da proporre: ${esc(a.offerta)} (da verificare: la mappa può essere vecchia).`);
    righe.push(`<a href="${esc(a.mappa)}">Apri su Google Maps</a>`);
    blocchi.push(righe.join('\n'));
  });
  blocchi.push('<i>Il primo contatto lo fa una persona, di persona o al telefono: niente messaggi automatici. Dopo la visita scrivi lo stato nella tabella «Attività da visitare» su n8n: visitata, si, no o iscritta.</i>');
}
const messaggi = [];
let corrente = '';
for (const b of blocchi) {
  const pezzo = b.length > 3800 ? `${b.slice(0, 3780).replace(/&[a-z]*$/i, '')}…` : b;
  if (corrente && corrente.length + pezzo.length + 2 > 3900) { messaggi.push(corrente); corrente = pezzo; } else corrente = corrente ? `${corrente}\n\n${pezzo}` : pezzo;
}
if (corrente) messaggi.push(corrente);
const manda = VERO;
return messaggi.map((messaggio, i) => ({ json: { messaggio, parte: i + 1, parti: messaggi.length, manda, con_dossier: conDossier, settimana } }));
