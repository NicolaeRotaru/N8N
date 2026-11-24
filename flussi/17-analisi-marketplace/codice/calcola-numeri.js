// 17 · Calcola i numeri — l'analisi del marketplace che l'AD fa a ogni giro, senza la radiografia.
//
// Da dove viene: cervello/giro.md (passo 1: ordini e incassi a 7 giorni, nuovi clienti, consegne in
// corso e in ritardo, carrelli abbandonati, recensioni), la tabella «I numeri chiave» di STATO.md, le
// sentinelle di cervello/sentinella-dati.mjs (soglie uguali) e il cruscotto del Pannello
// (pannello/src/lib/marketplace-db.ts → getMetriche).
//
// Le regole che non si toccano:
//  · i numeri li fa questo codice, mai Claude: Claude li commenta e basta;
//  · una tabella che non si legge dà «non misurato» (null), MAI zero: zero per errore è una bugia;
//  · se una tabella ha più righe di quelle lette, il numero lo dice («letti i primi N su M»).

const cfg = $('Config').first().json;
const ADESSO = Date.now();
const ORA = 3600000;
const GIORNO = 24 * ORA;
const numero = (v, seVuoto) => { const n = Number(v); return Number.isFinite(n) ? n : seVuoto; };
const ORE_ORDINE_FERMO = numero(cfg.ORE_ORDINE_FERMO, 2);
const ORE_PAYOUT = numero(cfg.ORE_PAYOUT, 24);
const ORE_CARRELLO = numero(cfg.ORE_CARRELLO, 4);
const GIORNI_NEGOZIO_FERMO = numero(cfg.GIORNI_NEGOZIO_FERMO, 14);
const CALO_SOGLIA = numero(cfg.CALO_SOGLIA, 0.7);
const CALO_MEDIA_MINIMA = numero(cfg.CALO_MEDIA_MINIMA, 3);

const quando = (iso) => { const t = new Date(iso).getTime(); return Number.isFinite(t) ? t : NaN; };
const entro = (iso, ms) => { const t = quando(iso); return Number.isFinite(t) && ADESSO - t <= ms; };
const piuVecchio = (iso, ms) => { const t = quando(iso); return Number.isFinite(t) && ADESSO - t > ms; };
const euro = (v) => Math.round(numero(v, 0) * 100) / 100;

// ---- le letture -------------------------------------------------------------------------------
function lettura(nome) {
  if (!$(nome).isExecuted) return { ok: false, righe: [], motivo: 'non eseguita' };
  const j = $(nome).first().json || {};
  if (j.error !== undefined) {
    const m = typeof j.error === 'object' && j.error ? (j.error.message || j.error.description || JSON.stringify(j.error)) : String(j.error);
    return { ok: false, righe: [], motivo: String(m).slice(0, 140) };
  }
  const codice = numero(j.statusCode, 0);
  if (codice < 200 || codice >= 300) {
    // Il motivo corto, quello che dice il database («Invalid API key»), non tutto il corpo.
    const spiegazione = j.body && typeof j.body === 'object' && j.body.message ? String(j.body.message)
      : typeof j.body === 'string' ? j.body : '';
    return { ok: false, righe: [], motivo: `risposta ${codice || 'assente'}${spiegazione ? ': ' + spiegazione.slice(0, 80) : ''}` };
  }
  let righe = j.body;
  if (typeof righe === 'string') { try { righe = JSON.parse(righe); } catch { righe = null; } }
  if (!Array.isArray(righe)) return { ok: false, righe: [], motivo: 'la risposta non è un elenco' };
  const cr = String((j.headers || {})['content-range'] || '');
  const totale = cr.includes('/') ? numero(cr.split('/')[1], righe.length) : righe.length;
  return { ok: true, righe, totale, parziale: totale > righe.length };
}
// Solo quante righe ha una tabella (richiesta HEAD con «Prefer: count=exact»): le righe non servono.
function conteggio(nome) {
  if (!$(nome).isExecuted) return { ok: false, righe: [], motivo: 'non eseguita' };
  const j = $(nome).first().json || {};
  if (j.error !== undefined) return { ok: false, righe: [], motivo: String(j.error && j.error.message ? j.error.message : j.error).slice(0, 140) };
  const codice = numero(j.statusCode, 0);
  if (codice < 200 || codice >= 300) return { ok: false, righe: [], motivo: `risposta ${codice || 'assente'}` };
  const cr = String((j.headers || {})['content-range'] || '');
  const totale = cr.includes('/') ? numero(cr.split('/')[1], NaN) : NaN;
  if (!Number.isFinite(totale)) return { ok: false, righe: [], motivo: 'il conteggio non è arrivato' };
  return { ok: true, righe: [], totale, parziale: false };
}
function sito(nome) {
  if (!$(nome).isExecuted) return { ok: false, codice: null, motivo: 'non controllato' };
  const j = $(nome).first().json || {};
  if (j.error !== undefined) return { ok: false, codice: 0, motivo: 'non raggiungibile' };
  const codice = numero(j.statusCode, 0);
  // Il controllo «pronto» del sito può rispondere 200 e dire lo stesso «degradato» (lavori automatici
  // fermi): il 24/11 alle 03:35 diceva payout, email e notifiche fermi da quasi quattro mesi.
  let degradato = null;
  const corpo = typeof j.body === 'string' ? j.body : typeof j.data === 'string' ? j.data : j.body && typeof j.body === 'object' ? j.body : null;
  if (corpo) {
    let x = corpo;
    if (typeof x === 'string') { try { x = JSON.parse(x); } catch { x = null; } }
    if (x && typeof x === 'object' && x.degraded === true) {
      const dettaglio = (x.cron && (x.cron.error || x.cron.stato)) || x.error || x.motivo || '';
      degradato = String(dettaglio || 'senza dettaglio').replace(/\s+/g, ' ').slice(0, 220);
    }
  }
  return { ok: codice >= 200 && codice < 300, codice, degradato, motivo: codice ? `risposta ${codice}` : 'non raggiungibile' };
}

const L = {
  ordini: lettura('Leggi gli ordini'),
  profili: lettura('Leggi i profili'),
  prodotti: lettura('Leggi i prodotti'),
  carrelli: lettura('Leggi i carrelli'),
  recensioni: lettura('Leggi le recensioni dei prodotti'),
  recensioni_negozi: lettura('Leggi le recensioni dei negozi'),
  lead: conteggio('Leggi i lead dei negozi'),
};
const S = { home: sito('Guarda il sito'), pronto: sito('Guarda il controllo «pronto»') };
const se = (chiave, calcolo) => (L[chiave].ok ? calcolo(L[chiave].righe) : null);

// ---- i negozi in attesa concordata (non sono churn): «id:AAAA-MM-GG, id:AAAA-MM-GG» ----------------
const inAttesa = new Set(String(cfg.NEGOZI_IN_ATTESA || '').split(/[,\s]+/).filter(Boolean).map((voce) => {
  const [id, fino] = voce.split(':');
  const scade = fino ? quando(`${fino}T23:59:59+01:00`) : Infinity;
  return ADESSO <= scade ? String(id).toLowerCase() : null;
}).filter(Boolean));

// ---- i numeri ---------------------------------------------------------------------------------
const nonFallito = (o) => o.payment_status !== 'FAILED';
const pagato = (o) => o.payment_status === 'PAID';
const inCorso = (o) => nonFallito(o) && !['DELIVERED', 'CANCELED'].includes(o.delivery_status) && !o.canceled_at;

const ordini = L.ordini.righe;
const pagati7 = ordini.filter((o) => pagato(o) && entro(o.created_at, 7 * GIORNO));
const pagati30 = ordini.filter((o) => pagato(o) && entro(o.created_at, 30 * GIORNO));
const ordiniSettimanaPrima = ordini.filter((o) => nonFallito(o) && entro(o.created_at, 8 * GIORNO) && !entro(o.created_at, GIORNO));
const venditoriRecenti = new Set(ordini.filter((o) => entro(o.created_at, GIORNI_NEGOZIO_FERMO * GIORNO)).map((o) => o.seller_id).filter(Boolean));
const profili = L.profili.righe;
const negoziApprovati = profili.filter((p) => p.role === 'seller' && p.approval_status === 'approved');
const carrelliAperti = L.carrelli.righe.filter((c) => c.recovered !== true);
const voti = [...L.recensioni.righe, ...L.recensioni_negozi.righe].map((r) => numero(r.rating, 0)).filter((n) => n > 0);

const n = {
  ordini_creati: L.ordini.ok ? L.ordini.totale : null,
  ordini_pagati: se('ordini', (r) => r.filter(pagato).length),
  ordini_consegnati: se('ordini', (r) => r.filter((o) => o.delivery_status === 'DELIVERED').length),
  ordini_24h: se('ordini', (r) => r.filter((o) => nonFallito(o) && entro(o.created_at, GIORNO)).length),
  ordini_7g: se('ordini', (r) => r.filter((o) => nonFallito(o) && entro(o.created_at, 7 * GIORNO)).length),
  ordini_30g: se('ordini', (r) => r.filter((o) => nonFallito(o) && entro(o.created_at, 30 * GIORNO)).length),
  incasso_7g: L.ordini.ok ? euro(pagati7.reduce((s, o) => s + numero(o.total_price, 0), 0)) : null,
  incasso_30g: L.ordini.ok ? euro(pagati30.reduce((s, o) => s + numero(o.total_price, 0), 0)) : null,
  scontrino_medio_30g: L.ordini.ok && pagati30.length ? euro(pagati30.reduce((s, o) => s + numero(o.total_price, 0), 0) / pagati30.length) : null,
  media_giornaliera_settimana_prima: L.ordini.ok ? Math.round((ordiniSettimanaPrima.length / 7) * 10) / 10 : null,
  annullati_7g: se('ordini', (r) => r.filter((o) => o.delivery_status === 'CANCELED' && entro(o.created_at, 7 * GIORNO)).length),
  consegne_in_corso: se('ordini', (r) => r.filter(inCorso).length),
  ordini_fermi: se('ordini', (r) => r.filter((o) => inCorso(o) && piuVecchio(o.created_at, ORE_ORDINE_FERMO * ORA)).length),
  pagati_senza_payout: se('ordini', (r) => r.filter((o) => pagato(o) && o.payment_method !== 'cod' && !o.payout_at && piuVecchio(o.created_at, ORE_PAYOUT * ORA)).length),
  clienti_attivi_30g: se('ordini', (r) => new Set(r.filter((o) => o.user_id && entro(o.created_at, 30 * GIORNO)).map((o) => o.user_id)).size),
  ultimo_ordine: se('ordini', (r) => r.map((o) => o.created_at).filter((x) => Number.isFinite(quando(x))).sort().pop() || null),

  clienti: se('profili', (r) => r.filter((p) => p.role === 'buyer').length),
  nuovi_clienti_24h: se('profili', (r) => r.filter((p) => p.role === 'buyer' && entro(p.created_at, GIORNO)).length),
  nuovi_clienti_7g: se('profili', (r) => r.filter((p) => p.role === 'buyer' && entro(p.created_at, 7 * GIORNO)).length),
  negozi_approvati: L.profili.ok ? negoziApprovati.length : null,
  negozi_con_incassi_attivi: L.profili.ok ? negoziApprovati.filter((p) => p.stripe_charges_enabled === true && p.stripe_payouts_enabled === true).length : null,
  negozi_da_approvare: se('profili', (r) => r.filter((p) => p.role === 'seller' && p.approval_status === 'pending' && p.approval_requested_at).length),
  fattorini_approvati: se('profili', (r) => r.filter((p) => p.role === 'rider' && p.approval_status === 'approved').length),
  fattorini_iscritti: se('profili', (r) => r.filter((p) => p.role === 'rider').length),

  prodotti_disponibili: se('prodotti', (r) => r.filter((p) => p.status === 'available').length),
  prodotti_in_catalogo: L.prodotti.ok ? L.prodotti.totale : null,

  carrelli_abbandonati: L.carrelli.ok ? carrelliAperti.length : null,
  carrelli_abbandonati_7g: L.carrelli.ok ? carrelliAperti.filter((c) => entro(c.last_activity, 7 * GIORNO)).length : null,
  carrelli_da_recuperare: L.carrelli.ok ? carrelliAperti.filter((c) => !c.recovery_email_sent_at && piuVecchio(c.last_activity, ORE_CARRELLO * ORA)).length : null,

  recensioni: L.recensioni.ok && L.recensioni_negozi.ok ? voti.length : null,
  voto_medio: L.recensioni.ok && L.recensioni_negozi.ok && voti.length ? Math.round((voti.reduce((a, b) => a + b, 0) / voti.length) * 10) / 10 : null,

  lead_negozi: L.lead.ok ? L.lead.totale : null,
  sito_home: S.home.codice,
  sito_pronto: S.pronto.codice,
};

// Negozi approvati da più di 14 giorni senza ordini negli ultimi 14 (servono profili E ordini).
const negoziFermi = L.profili.ok && L.ordini.ok
  ? negoziApprovati.filter((p) => piuVecchio(p.approved_at || p.created_at, GIORNI_NEGOZIO_FERMO * GIORNO))
    .filter((p) => !venditoriRecenti.has(p.id)).filter((p) => !inAttesa.has(String(p.id).toLowerCase()))
    .map((p) => p.store_name || 'negozio senza nome')
  : null;

// ---- il giro prima (memoria del flusso: vale solo nei giri automatici, non in quelli a mano) ----
const memoria = $getWorkflowStaticData('global');
const prima = memoria.ultimo_giro && typeof memoria.ultimo_giro === 'object' ? memoria.ultimo_giro : null;
const delta = {};
for (const [k, v] of Object.entries(n)) {
  const p = prima && prima.numeri ? prima.numeri[k] : undefined;
  if (typeof v === 'number' && typeof p === 'number') delta[k] = Math.round((v - p) * 100) / 100;
}
// Recensioni basse NUOVE: solo quelle dopo l'ultima già vista. Al primo giro si fissa la base, non si suona sullo storico.
const basse = [...L.recensioni.righe, ...L.recensioni_negozi.righe].filter((r) => numero(r.rating, 5) <= 2 && Number.isFinite(quando(r.created_at)));
const vista = memoria.ultima_recensione_bassa_vista || null;
const recensioniBasseNuove = (L.recensioni.ok && L.recensioni_negozi.ok)
  ? (vista ? basse.filter((r) => quando(r.created_at) > quando(vista)).length : 0)
  : null;
const ultimaBassa = basse.map((r) => r.created_at).sort().pop() || vista;

// ---- le sentinelle (stesse soglie di cervello/sentinella-dati.mjs) -----------------------------
const sentinelle = [];
const suona = (id, colore, titolo, cosaFare) => sentinelle.push({ id, colore, titolo, cosa_fare: cosaFare });
if (n.pagati_senza_payout > 0) suona('payout-bloccato', 'rosso', `${n.pagati_senza_payout} ordini pagati con carta da più di ${ORE_PAYOUT} ore e il negozio non ha ancora ricevuto i soldi`, 'Controlla i payout: sono soldi del negozio fermi da noi.');
if (S.home.codice !== null && (!S.home.ok || !S.pronto.ok)) suona('sito-giu', 'rosso', `Il sito non risponde bene: pagina iniziale ${S.home.motivo}, controllo «pronto» ${S.pronto.motivo}`, 'Guarda Vercel e i log: chi apre il sito adesso non può comprare.');
if (S.pronto.ok && S.pronto.degradato) suona('sito-degradato', 'giallo', `Il sito risponde ma si dice «degradato»: ${S.pronto.degradato}`, 'Guarda i lavori automatici del sito (payout, email, notifiche): se sono fermi, quello che dovrebbero fare non succede.');
if (n.media_giornaliera_settimana_prima !== null && n.media_giornaliera_settimana_prima >= CALO_MEDIA_MINIMA && n.ordini_24h < CALO_SOGLIA * n.media_giornaliera_settimana_prima) {
  suona('calo-ordini', 'verde', `Ordini in calo: ${n.ordini_24h} nelle ultime 24 ore contro una media di ${n.media_giornaliera_settimana_prima} al giorno nella settimana prima`, 'Capire la causa prima di agire (meteo, un negozio chiuso, un guasto al pagamento).');
}
if (recensioniBasseNuove > 0) suona('recensione-bassa', 'giallo', `${recensioniBasseNuove} recensioni nuove con 1 o 2 stelle`, 'Preparare una risposta e richiamare il cliente.');
if (negoziFermi && negoziFermi.length) suona('negozio-fermo', 'giallo', `Negozi approvati senza ordini da ${GIORNI_NEGOZIO_FERMO} giorni: ${negoziFermi.slice(0, 5).join(', ')}${negoziFermi.length > 5 ? ` e altri ${negoziFermi.length - 5}` : ''}`, 'Una telefonata di controllo prima che mollino.');
if (n.carrelli_da_recuperare > 0) suona('carrelli', 'giallo', `${n.carrelli_da_recuperare} carrelli abbandonati da più di ${ORE_CARRELLO} ore senza email di recupero`, 'Preparare l\'email di recupero (la firma per mandarla è di Nicola).');
if (n.ordini_fermi > 0) suona('ordini-fermi', 'giallo', `${n.ordini_fermi} ordini aperti da più di ${ORE_ORDINE_FERMO} ore e non ancora consegnati`, 'Chiamare il negozio o il fattorino: il cliente sta aspettando.');
if (n.fattorini_approvati === 0 && n.consegne_in_corso > 0) suona('nessun-fattorino', 'giallo', `${n.consegne_in_corso} ordini da consegnare e nessun fattorino approvato`, 'Approvare un fattorino o organizzare il ritiro a mano.');
if (n.negozi_da_approvare > 0) suona('negozi-da-approvare', 'giallo', `${n.negozi_da_approvare} negozi aspettano l'approvazione`, 'Approvali da Utenti nel pannello del sito.');

// ---- cosa non ho potuto misurare -----------------------------------------------------------------
const NOMI = { ordini: 'ordini', profili: 'clienti, negozi e fattorini', prodotti: 'prodotti', carrelli: 'carrelli',
  recensioni: 'recensioni dei prodotti', recensioni_negozi: 'recensioni dei negozi', lead: 'lead dei negozi' };
const gap = [];
for (const [k, l] of Object.entries(L)) {
  if (!l.ok) gap.push(`${NOMI[k]}: non letti (${l.motivo})`);
  else if (l.parziale) gap.push(`${NOMI[k]}: letti i primi ${l.righe.length} su ${l.totale}, i conteggi su quella tabella sono parziali`);
}
if (!S.home.ok && S.home.codice === null) gap.push('sito: non controllato');
const cieco = !L.ordini.ok && !L.profili.ok;

// Un giro cieco non cancella il giro buono di prima: il confronto di domani resta vero.
if (!cieco) memoria.ultimo_giro = { data: new Date(ADESSO).toISOString(), numeri: n };
if (ultimaBassa) memoria.ultima_recensione_bassa_vista = ultimaBassa;

return [{ json: {
  quando: new Date(ADESSO).toISOString(),
  numeri: n, delta, negozi_fermi: negoziFermi, recensioni_basse_nuove: recensioniBasseNuove,
  sentinelle, gap, cieco, giro_prima: prima ? prima.data : null,
} }];
