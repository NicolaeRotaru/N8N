// 18 · Componi il messaggio — l'analisi dell'attività che arriva a Nicola su Telegram.
// I numeri vengono da «Calcola l'analisi»; il commento da Claude se ha risposto bene, altrimenti il
// messaggio parte lo stesso coi soli numeri e lo dice.

const cfg = $('Config').first().json;
const a = $("Calcola l'analisi").first().json;
const n = a.numeri || {};
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const MAX = 3900;

// ---- il commento di Claude -----------------------------------------------------------------------
let commento = null;
let motivoSenza = /^(si|sì)$/i.test(String(cfg.COMMENTO_CLAUDE ?? '').trim()) ? '' : 'commento di Claude spento nel Config';
if (!motivoSenza) {
  if (!$("Dall'AD: commento").isExecuted) motivoSenza = 'Claude non è stato chiamato';
  else {
    const r = $("Dall'AD: commento").first().json || {};
    if (r.error !== undefined) motivoSenza = 'Claude non ha risposto';
    else if (r.stop_reason === 'refusal') motivoSenza = 'Claude non ha dato una risposta';
    else {
      const testo = (Array.isArray(r.content) ? r.content : []).filter((b) => b && b.type === 'text').map((b) => b.text).join('').trim();
      try {
        const c = JSON.parse(testo);
        if (c && typeof c.punto_adesso === 'string' && Array.isArray(c.prossime_mosse)) commento = c;
        else motivoSenza = 'risposta di Claude fuori schema';
      } catch {
        motivoSenza = r.stop_reason === 'max_tokens' ? 'risposta di Claude troncata' : 'risposta di Claude non leggibile';
      }
    }
  }
}

// ---- i pezzi -----------------------------------------------------------------------------------
const nm = (v) => (v === null || v === undefined ? 'non misurato' : String(v));
const euroTesto = (v) => (v === null || v === undefined ? 'non misurato' : `${Number(v).toFixed(2).replace('.', ',')} €`);
const siNo = (v) => (v === null || v === undefined ? 'non misurato' : v ? 'sì' : 'no');
const spunta = (v) => (v ? '✅' : '❌');
const PALLINO = { rosso: '🔴', giallo: '🟡', verde: '🟢' };
const ora = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(a.quando));

const blocchi = [];
blocchi.push(`🏪 <b>Analisi dell'attività</b> · ${esc(a.nome)}${a.tipo ? ` (${esc(a.tipo)})` : ''} · ${esc(ora)}`
  + `\nArrivata: ${esc(a.origine || '—')}${a.esito_scheda ? ` · scheda Clienti: ${esc(a.esito_scheda)}` : ''}`);
blocchi.push(`<b>Il punto adesso</b>\n${commento ? esc(commento.punto_adesso) : a.cieco
  ? "Non sono riuscito a leggere il database: niente numeri su questa attività. Sotto, cosa non ha funzionato."
  : a.sentinelle.length ? `Ci sono ${a.sentinelle.length} cose da guardare: sono qui sotto.` : 'Nessun segnale da guardare. I numeri sono qui sotto.'}`);
blocchi.push(`<b>Cosa è scattato</b>\n${a.sentinelle.length ? a.sentinelle.map((s) => `${PALLINO[s.colore] || '•'} ${esc(s.titolo)}. ${esc(s.cosa_fare)}`).join('\n') : 'Niente.'}`);

const v = a.vetrina;
const punto = [
  `• Stato: <b>${esc(nm(n.stato))}</b>${n.giorni_dalla_richiesta !== null && n.giorni_dalla_richiesta !== undefined ? ` · iscritta da ${esc(n.giorni_dalla_richiesta)} giorni` : ''}`,
  `• Può incassare con la carta: <b>${esc(siNo(n.puo_incassare_con_carta))}</b>`,
  v ? `• Vetrina: logo ${spunta(v.logo)} · foto ${v.foto ? `${esc(v.foto)} ✅` : '❌'} · descrizione ${spunta(v.descrizione)} · orari ${spunta(v.orari)} · indirizzo ${spunta(v.indirizzo)} · sito ${spunta(v.sito)}${v.social.length ? ` · social: ${esc(v.social.join(', '))}` : ''}`
    : '• Vetrina: non misurata',
];
blocchi.push(`<b>A che punto è</b>\n${punto.join('\n')}`);
const confronto = n.media_prodotti_negozi_che_vendono !== null && n.media_prodotti_negozi_che_vendono !== undefined
  ? ` (i negozi che vendono ne hanno in media ${esc(n.media_prodotti_negozi_che_vendono)})` : '';
blocchi.push(`<b>I numeri</b>\n${[
  `• Prodotti in vendita: <b>${esc(nm(n.prodotti_in_vendita))}</b> su ${esc(nm(n.prodotti))}${confronto}`,
  `• …senza foto: ${esc(nm(n.prodotti_senza_foto))} · senza prezzo: ${esc(nm(n.prodotti_senza_prezzo))} · in bozza: ${esc(nm(n.prodotti_in_bozza))}`,
  `• Ordini: <b>${esc(nm(n.ordini))}</b> · negli ultimi 7 giorni: ${esc(nm(n.ordini_7g))} · consegnati: ${esc(nm(n.ordini_consegnati))}`,
  `• Incassato in 30 giorni: <b>${esc(euroTesto(n.incasso_30g))}</b>${n.scontrino_medio_30g ? ` · scontrino medio ${esc(euroTesto(n.scontrino_medio_30g))}` : ''}`,
  `• Clienti: ${esc(nm(n.clienti))} · tornati a comprare: ${esc(nm(n.clienti_tornati))}`,
  `• Recensioni: ${esc(nm(n.recensioni))}${n.voto_medio ? ` · media ${esc(n.voto_medio)} stelle` : ''}`,
].join('\n')}`);
const s = a.scheda;
if (s && (s.tipo_di_locale || s.pubblico || s.punti_di_forza.length)) {
  blocchi.push(`<b>Dal web</b> (scheda del modulo 12, da confermare)\n${[
    s.tipo_di_locale && `• Che attività è: ${esc(s.tipo_di_locale)}`,
    s.pubblico && `• Pubblico: ${esc(s.pubblico)}`,
    s.punti_di_forza.length && `• Punti di forza: ${esc(s.punti_di_forza.join('; '))}`,
    s.idee_contenuti.length && `• Idee per i contenuti: ${esc(s.idee_contenuti.join('; '))}`,
  ].filter(Boolean).join('\n')}`);
}
if (commento && commento.prossime_mosse.length) {
  blocchi.push(`<b>Prossime mosse</b>\n${commento.prossime_mosse.map((x) => `${PALLINO[x.colore] || '•'} ${esc(x.titolo)} — ${esc(x.perche)} (${esc(x.reparto)})`).join('\n')}`);
}
const domande = [...(commento ? commento.domande_per_il_titolare : []), ...(!commento && s ? s.cosa_chiedere_al_titolare : [])];
if (domande.length) blocchi.push(`<b>Da chiedere al titolare</b>\n${domande.map((d) => `• ${esc(d)}`).join('\n')}`);
if (commento && commento.rischi.length) blocchi.push(`<b>Rischi</b>\n${commento.rischi.map((r) => `• ${esc(r)}`).join('\n')}`);
const nonVerificato = [...a.gap];
if (motivoSenza) nonVerificato.push(`commento: ${motivoSenza}, qui ci sono solo i numeri`);
if (s && s.da_confermare.length) nonVerificato.push(`nella scheda Clienti restano da confermare: ${s.da_confermare.join(', ')}`);
nonVerificato.push('le mosse e i rischi sono il parere di Claude sui numeri: da pesare, non sono misure');
blocchi.push(`<b>Cosa non ho verificato</b>\n${nonVerificato.map((g) => `• ${esc(g)}`).join('\n')}`);

// Troppo lungo per Telegram: si tolgono prima i pareri, mai numeri e segnali; come ultima risorsa si
// tolgono i grassetti e si taglia senza lasciare un'entità a metà.
const togli = (titolo) => { const i = blocchi.findIndex((b) => b.startsWith(`<b>${titolo}</b>`)); if (i >= 0) blocchi.splice(i, 1); };
let messaggio = blocchi.join('\n\n');
for (const titolo of ['Rischi', 'Dal web', 'Da chiedere al titolare']) {
  if (messaggio.length <= MAX) break;
  togli(titolo);
  messaggio = blocchi.join('\n\n');
}
if (messaggio.length > MAX) messaggio = `${messaggio.replace(/<\/?b>/g, '').slice(0, MAX - 30).replace(/&[a-z]*$/i, '')}\n… (messaggio accorciato)`;

return [{ json: { messaggio, con_commento: !!commento } }];
