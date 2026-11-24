// 17 · Componi il messaggio — il briefing che arriva a Nicola su Telegram, e la riga per il Pannello.
// I numeri vengono da «Calcola i numeri». Il commento (il punto adesso, opportunità, rischi, azioni)
// da Claude, se ha risposto bene; altrimenti il messaggio parte lo stesso, coi soli numeri.

const cfg = $('Config').first().json;
const a = $('Calcola i numeri').first().json;
const n = a.numeri || {};
const d = a.delta || {};
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const MAX = 3900; // Telegram ne accetta 4096

// ---- il commento di Claude -----------------------------------------------------------------------
let commento = null;
let motivoSenza = /^(si|sì)$/i.test(String(cfg.COMMENTO_CLAUDE ?? '').trim()) ? '' : 'commento di Claude spento nel Config';
if (!motivoSenza) {
  if (!$('Chiedi il commento a Claude').isExecuted) motivoSenza = 'Claude non è stato chiamato';
  else {
    const r = $('Chiedi il commento a Claude').first().json || {};
    if (r.error !== undefined) motivoSenza = 'Claude non ha risposto';
    else if (r.stop_reason === 'refusal') motivoSenza = 'Claude non ha dato una risposta';
    else {
      const testo = (Array.isArray(r.content) ? r.content : []).filter((b) => b && b.type === 'text').map((b) => b.text).join('').trim();
      try {
        const c = JSON.parse(testo);
        if (c && typeof c.punto_adesso === 'string' && Array.isArray(c.azioni)) commento = c;
        else motivoSenza = 'risposta di Claude fuori schema';
      } catch {
        motivoSenza = r.stop_reason === 'max_tokens' ? 'risposta di Claude troncata' : 'risposta di Claude non leggibile';
      }
    }
  }
}

// ---- i numeri ----------------------------------------------------------------------------------
const fmt = (v, unita) => {
  if (v === null || v === undefined) return 'non misurato';
  if (unita === '€') return `${Number(v).toFixed(2).replace('.', ',')} €`;
  return String(v);
};
const var_ = (k, unita) => {
  if (!(k in d)) return '';
  const x = d[k];
  if (x === 0) return ' (=)';
  const v = unita === '€' ? `${Math.abs(x).toFixed(2).replace('.', ',')} €` : Math.abs(x);
  return x > 0 ? ` (▲ +${v})` : ` (▼ −${v})`;
};
const riga = (etichetta, k, unita) => `• ${etichetta}: <b>${esc(fmt(n[k], unita))}</b>${var_(k, unita)}`;
const sitoOk = (c) => (c === null || c === undefined ? 'non controllato' : c >= 200 && c < 300 ? 'risponde' : c === 0 ? 'non raggiungibile' : `risponde ${c}`);
const numeri = [
  riga('Ordini pagati da sempre (la stella polare)', 'ordini_pagati'),
  riga('Ordini negli ultimi 7 giorni', 'ordini_7g'),
  riga('Incassato negli ultimi 7 giorni', 'incasso_7g', '€'),
  riga('Nuovi clienti in 7 giorni', 'nuovi_clienti_7g'),
  riga('Negozi approvati', 'negozi_approvati'),
  riga('…di cui possono incassare con la carta', 'negozi_con_incassi_attivi'),
  riga('Prodotti in vendita', 'prodotti_disponibili'),
  riga('Ordini consegnati da sempre', 'ordini_consegnati'),
  riga('Consegne aperte adesso', 'consegne_in_corso'),
  riga('Fattorini approvati', 'fattorini_approvati'),
  riga('Carrelli abbandonati in 7 giorni', 'carrelli_abbandonati_7g'),
  riga('Recensioni', 'recensioni') + (n.voto_medio ? ` · media ${esc(n.voto_medio)} stelle` : ''),
  riga('Lead dei negozi da lavorare', 'lead_negozi'),
  `• Sito: ${sitoOk(n.sito_home)} · controllo «pronto»: ${sitoOk(n.sito_pronto)}`,
];

const PALLINO = { rosso: '🔴', giallo: '🟡', verde: '🟢' };
const ora = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(a.quando));

const blocchi = [];
blocchi.push(`📊 <b>Il giro sul marketplace</b> · ${esc(ora)}`);
blocchi.push(`<b>Il punto adesso</b>\n${commento ? esc(commento.punto_adesso) : a.cieco
  ? 'Non sono riuscito a leggere il database: niente numeri nuovi oggi. Sotto, cosa non ha funzionato.'
  : a.sentinelle.length ? `Sono scattati ${a.sentinelle.length} segnali da guardare: sono qui sotto.` : 'Nessun segnale da guardare. I numeri sono qui sotto.'}`);
blocchi.push(`<b>Cosa è scattato</b>\n${a.sentinelle.length ? a.sentinelle.map((s) => `${PALLINO[s.colore] || '•'} ${esc(s.titolo)}. ${esc(s.cosa_fare)}`).join('\n') : 'Niente.'}`);
blocchi.push(`<b>I numeri</b>${a.giro_prima ? ' (fra parentesi: rispetto al giro prima)' : ''}\n${numeri.join('\n')}`);
if (commento && commento.azioni.length) {
  blocchi.push(`<b>Cosa propongo</b>\n${commento.azioni.map((x) => `${PALLINO[x.colore] || '•'} ${esc(x.titolo)} — ${esc(x.perche)} (${esc(x.reparto)})`).join('\n')}`);
}
if (commento && commento.opportunita.length) {
  blocchi.push(`<b>Opportunità</b>\n${commento.opportunita.map((o) => `• ${esc(o.titolo)} — ${esc(o.perche)} (impatto ${esc(o.impatto)}, sforzo ${esc(o.sforzo)})`).join('\n')}`);
}
if (commento && commento.rischi.length) blocchi.push(`<b>Rischi</b>\n${commento.rischi.map((r) => `• ${esc(r)}`).join('\n')}`);
const nonVerificato = [...a.gap];
if (motivoSenza) nonVerificato.push(`commento: ${motivoSenza}, qui ci sono solo i numeri`);
if (!a.giro_prima) nonVerificato.push('confronto col giro prima: questo è il primo giro automatico (o un giro a mano), non c\'è un prima');
nonVerificato.push('i rischi e le opportunità sono il parere di Claude sui numeri: da pesare, non sono misure');
blocchi.push(`<b>Cosa non ho verificato</b>\n${nonVerificato.map((g) => `• ${esc(g)}`).join('\n')}`);

// Troppo lungo per Telegram: prima si tolgono rischi e opportunità (sono pareri), mai numeri e segnali.
// Come ultima risorsa si tolgono i grassetti e si taglia: un tag o un «&amp;» tagliato a metà
// farebbe rifiutare a Telegram l'intero messaggio.
const togliBlocco = (titolo) => { const i = blocchi.findIndex((b) => b.startsWith(`<b>${titolo}</b>`)); if (i >= 0) blocchi.splice(i, 1); };
let messaggio = blocchi.join('\n\n');
for (const titolo of ['Rischi', 'Opportunità']) {
  if (messaggio.length <= MAX) break;
  togliBlocco(titolo);
  messaggio = blocchi.join('\n\n');
}
if (messaggio.length > MAX) {
  messaggio = `${messaggio.replace(/<\/?b>/g, '').slice(0, MAX - 30).replace(/&[a-z]*$/i, '')}\n… (messaggio accorciato)`;
}

// La riga per la tabella «briefings» della memoria dell'AD (la card in alto del Pannello).
const rigaPannello = { data: {
  situazione: commento ? commento.punto_adesso : (a.sentinelle.map((s) => s.titolo).join('. ') || 'Nessun segnale scattato.'),
  opportunita: commento ? commento.opportunita.map((o) => ({ titolo: o.titolo, motivo: o.perche, impatto: o.impatto, sforzo: o.sforzo })) : [],
  azioni: commento ? commento.azioni.map((x) => ({ titolo: x.titolo, motivo: x.perche, livello: x.colore })) : [],
  fonte: 'n8n · 17 · Analisi del marketplace', numeri: n, sentinelle: a.sentinelle,
} };

return [{ json: { messaggio, riga_pannello: rigaPannello, con_commento: !!commento } }];
