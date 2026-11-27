// 16 · Componi i messaggi — la lista della settimana per Nicola su Telegram, col dossier dell'AD se è arrivato.
// Più messaggi se non ci sta in uno (Telegram: 4096 caratteri). Mappa non letta = lo si dice, mai «zero attività».
const cfg = $('Config').first().json;
const f = $('Metti in fila').first().json;
const VERO = String(cfg.MODALITA || '').trim().toLowerCase() === 'vero';
// Ogni testo si accorcia PRIMA di proteggerlo: così un blocco non si taglia mai dentro un tag (collaudo m6).
const corto = (v, n) => { const t = Array.from(String(v ?? '').replace(/\s+/g, ' ').trim()); return t.length > n ? `${t.slice(0, n - 1).join('')}…` : t.join(''); }; // per caratteri interi: un'emoji non si spezza
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let ad = null;
try { ad = $('Chiedi all’AD i dossier').isExecuted ? ($('Chiedi all’AD i dossier').first().json || {}) : null; } catch { ad = null; }
const schede = {};
// L'AD a volte scrive l'identificativo senza «node/»: si riconosce lo stesso dal numero (terzo collaudo n.4).
if (ad && ad.ok === true && ad.risultato && Array.isArray(ad.risultato.schede)) for (const s of ad.risultato.schede) if (s && s.osm) { schede[String(s.osm)] = s; schede[String(s.osm).split('/').pop()] = s; }
const schedaDi = (a) => schede[a.osm] || schede[String(a.osm).split('/').pop()];
const conDossierN = (f.fila || []).filter((a) => schedaDi(a)).length;
const conDossier = conDossierN > 0;
const avvisiAD = ad && ad.ok === true ? [].concat(ad.avvisi || []).map((x) => String(typeof x === 'string' ? x : (x && (x.testo || x.messaggio)) || '')).filter(Boolean) : [];
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
  blocchi.push(`${testa}\n\nQuesta settimana la lista non c’è: ${esc(f.motivo || 'la mappa non ha risposto')}. Non vuol dire che non ci sono attività da visitare. Il flusso riprova lunedì prossimo, o lo si avvia a mano da n8n.`);
} else {
  const c = f.conti;
  const st = c.stati_finora || {};
  const fuori = [c.catene && `${num(c.catene)} catene`, c.categorie_escluse && `${num(c.categorie_escluse)} in categorie dove non entriamo`, c.chiuse && `${num(c.chiuse)} chiuse`, c.doppioni && `${num(c.doppioni)} doppioni`, c.gia_su_mycity && `${num(c.gia_su_mycity)} già su MyCity`, c.gia_proposte && `${num(c.gia_proposte)} già proposte`, c.senza_nome && `${num(c.senza_nome)} senza nome`].filter(Boolean).join(', ');
  const elenco = (c.stati_non_capiti || []).map((x) => `${esc(x.nome)} («${esc(x.stato)}»)`).join(', ');
  const nonCapiti = st.non_capito ? ` · ${num(st.non_capito)} con uno stato che non capisco${elenco ? `: ${elenco}` : ''}. Nella tabella scrivi solo visitata, si, no o iscritta` : '';
  const conto = c.proposte_finora ? `\nIl conto finora: ${num(c.proposte_finora)} proposte · ${num((st.visitata || 0) + (st.si || 0) + (st.no || 0) + (st.iscritta || 0))} visitate · ${num((st.si || 0) + (st.iscritta || 0))} hanno detto sì · ${num(st.iscritta || 0)} iscritte${nonCapiti}.` : '';
  blocchi.push(`${testa}\n\nSulla mappa ci sono ${num(c.letti)} attività entro ${metri(Number(cfg.RAGGIO_M))} da ${esc(cfg.CENTRO_NOME)}. Tolte ${fuori || 'nessuna'}, ne restano ${num(c.in_fila)} in fila. Queste sono le prime ${f.fila.length}.${c.negozi_mycity_letti ? '' : '\n<i>Il database di MyCity non ha risposto: qualcuna potrebbe essere già iscritta.</i>'}${conto}` +
    (conDossier && conDossierN < f.fila.length ? `\n<i>L’AD ha scritto il dossier per ${conDossierN} attività su ${f.fila.length}: le altre sono senza.</i>` : '') +
    (avvisiAD.length ? `\n<i>Avvisi dell’AD: ${esc(corto(avvisiAD.join(' · '), 600))}</i>` : '') +
    (conDossier ? '' : `\n<i>Senza il dossier dell’AD: ${esc((ad && (ad.errore || (ad.prova ? 'Chiedi all’AD è in prova' : ''))) || $('Prepara il lavoro').first().json.non_mandare || 'l’AD non ha risposto')}.</i>`));
  const bloccoDi = (a, i, conDossierPieno) => {
    const s = schedaDi(a);
    const righe = [`<b>${i + 1}. ${esc(corto(a.nome, 120))}</b> · ${esc(corto(a.tipo, 60))} · ${metri(a.distanza_m)}`,
      [a.indirizzo && esc(corto(a.indirizzo, 120)), a.telefono ? `tel ${esc(corto(a.telefono, 40))}` : 'telefono da trovare'].filter(Boolean).join(' · '),
      `Perché: ${esc(corto(a.perche, 300))}.`];
    if (s) {
      if (s.attenzione) righe.push(`<b>Attenzione:</b> ${esc(corto(s.attenzione, 500))}`);
      if (conDossierPieno) {
        righe.push(`Chi è: ${esc(corto(s.chi_e, 500))}`);
        if (s.cosa_vende) righe.push(`Cosa vende: ${esc(corto(s.cosa_vende, 500))}`);
        righe.push(`Cosa ci guadagna: ${esc(corto(s.cosa_ci_guadagna, 500))}`, `Come convincerlo: ${esc(corto(s.come_convincerlo, 500))}`, `Da proporre: ${esc(corto(s.cosa_proporre, 500))}`);
        if (/^https:\/\/[^\s"<>]+$/.test(String(s.fonte || ''))) righe.push(`<a href="${esc(s.fonte)}">Fonte del dossier</a>`);
      } else righe.push('<i>Dossier troppo lungo per Telegram: è intero nella tabella.</i>');
    } else if (a.offerta) righe.push(`Da proporre: ${esc(a.offerta)} (da verificare: la mappa può essere vecchia).`);
    righe.push(`<a href="${esc(a.mappa)}">Apri su Google Maps</a>`);
    return righe.join('\n');
  };
  f.fila.forEach((a, i) => {
    const b = bloccoDi(a, i, true);
    // Un blocco che non sta in un messaggio perde il dossier, mai un pezzo di tag.
    blocchi.push(b.length <= 3800 ? b : bloccoDi(a, i, false));
  });
  blocchi.push('<i>Il primo contatto lo fa una persona, di persona o al telefono: niente messaggi automatici. Dopo la visita scrivi lo stato nella tabella «Attività da visitare» su n8n: visitata, si, no o iscritta.</i>');
}
const messaggi = [];
let corrente = '';
for (const b of blocchi) {
  const pezzo = b; // ogni blocco sta già sotto i 3.800 caratteri: qui non si taglia niente
  if (corrente && corrente.length + pezzo.length + 2 > 3900) { messaggi.push(corrente); corrente = pezzo; } else corrente = corrente ? `${corrente}\n\n${pezzo}` : pezzo;
}
if (corrente) messaggi.push(corrente);
const manda = VERO;
return messaggi.map((messaggio, i) => ({ json: { messaggio, parte: i + 1, parti: messaggi.length, manda, con_dossier: conDossier, settimana } }));
