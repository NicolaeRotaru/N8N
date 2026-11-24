// 18 · Calcola l'analisi — la stessa analisi del giro (flusso 17), fatta su UNA attività.
//
// A che punto è per arrivare al primo incasso: stato dell'approvazione, se può incassare con la carta,
// vetrina, prodotti, ordini, incassi, clienti, recensioni, e il confronto con gli altri negozi.
// Le sentinelle sono quelle del giro (soglie uguali), più i controlli dell'avvio di un negozio.
//
// Le regole del 17 valgono qui: i numeri li fa questo codice, mai Claude; una tabella che non si legge
// è «non misurato» (null), mai zero; nessun dato personale del titolare viene letto.

const cfg = $('Config').first().json;
const richiesta = $('Leggi la richiesta').first().json;
const ADESSO = Date.now();
const ORA = 3600000;
const GIORNO = 24 * ORA;
const numero = (v, seVuoto) => { const n = Number(v); return Number.isFinite(n) ? n : seVuoto; };
const ORE_ORDINE_FERMO = numero(cfg.ORE_ORDINE_FERMO, 2);
const ORE_PAYOUT = numero(cfg.ORE_PAYOUT, 24);
const GIORNI_NEGOZIO_FERMO = numero(cfg.GIORNI_NEGOZIO_FERMO, 14);
const quando = (iso) => { const t = new Date(iso).getTime(); return Number.isFinite(t) ? t : NaN; };
const entro = (iso, ms) => { const t = quando(iso); return Number.isFinite(t) && ADESSO - t <= ms; };
const piuVecchio = (iso, ms) => { const t = quando(iso); return Number.isFinite(t) && ADESSO - t > ms; };
const giorniDa = (iso) => { const t = quando(iso); return Number.isFinite(t) ? Math.max(0, Math.floor((ADESSO - t) / GIORNO)) : null; };
const euro = (v) => Math.round(numero(v, 0) * 100) / 100;
const pieno = (v) => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.values(v).some(pieno);
  return true;
};

function lettura(nome) {
  if (!$(nome).isExecuted) return { ok: false, righe: [], motivo: 'non eseguita' };
  const j = $(nome).first().json || {};
  if (j.error !== undefined) {
    const m = typeof j.error === 'object' && j.error ? (j.error.message || j.error.description || JSON.stringify(j.error)) : String(j.error);
    return { ok: false, righe: [], motivo: String(m).slice(0, 140) };
  }
  const codice = numero(j.statusCode, 0);
  if (codice < 200 || codice >= 300) {
    const spiegazione = j.body && typeof j.body === 'object' && j.body.message ? String(j.body.message) : typeof j.body === 'string' ? j.body : '';
    return { ok: false, righe: [], motivo: `risposta ${codice || 'assente'}${spiegazione ? ': ' + spiegazione.slice(0, 80) : ''}` };
  }
  let righe = j.body;
  if (typeof righe === 'string') { try { righe = JSON.parse(righe); } catch { righe = null; } }
  if (!Array.isArray(righe)) return { ok: false, righe: [], motivo: 'la risposta non è un elenco' };
  const cr = String((j.headers || {})['content-range'] || '');
  const totale = cr.includes('/') ? numero(cr.split('/')[1], righe.length) : righe.length;
  return { ok: true, righe, totale, parziale: totale > righe.length };
}

const L = {
  attivita: lettura("Leggi l'attività"),
  prodotti: lettura('Leggi i suoi prodotti'),
  ordini: lettura('Leggi i suoi ordini'),
  recensioni: lettura('Leggi le sue recensioni'),
  in_vendita: lettura('Leggi i prodotti in vendita di tutti'),
  negozi: lettura('Leggi i negozi approvati'),
};
// I venditori «di sistema» (il negozio «MyCity», SDG Agenzia) non entrano nel confronto con gli altri negozi.
const diSistema = (id) => String(id || '').toLowerCase().startsWith('11111111-1111-1111-1111-');
for (const [chiave, campo] of [['in_vendita', 'seller_id'], ['negozi', 'id']]) {
  const l = L[chiave];
  if (!l.ok) continue;
  const prima = l.righe.length;
  l.righe = l.righe.filter((r) => !diSistema(r[campo]));
  l.totale = Math.max(l.righe.length, l.totale - (prima - l.righe.length));
}
const p = L.attivita.ok ? L.attivita.righe[0] || null : null;
const trovata = L.attivita.ok ? !!p : null;
const se = (chiave, calcolo) => (L[chiave].ok ? calcolo(L[chiave].righe) : null);

// ---- a che punto è -------------------------------------------------------------------------------
const STATI = { pending: 'in attesa di approvazione', approved: 'approvata', rejected: 'respinta', suspended: 'sospesa' };
const stato = p ? (p.role === 'seller' ? STATI[p.approval_status] || `stato «${p.approval_status || 'vuoto'}»` : 'non è ancora un negozio') : null;
const socials = p && p.store_customization && typeof p.store_customization === 'object' && p.store_customization.socials && typeof p.store_customization.socials === 'object'
  ? Object.entries(p.store_customization.socials).filter(([, v]) => pieno(v)).map(([k]) => k) : [];
const vetrina = p ? {
  logo: pieno(p.store_logo),
  foto: Array.isArray(p.store_media) ? p.store_media.length : 0,
  descrizione: typeof p.store_description === 'string' && p.store_description.trim().length >= 40,
  orari: pieno(p.store_hours),
  indirizzo: pieno(p.store_address),
  sito: pieno(p.store_site),
  social: socials,
} : null;
const mancaInVetrina = vetrina ? [
  !vetrina.logo && 'logo', !vetrina.foto && 'foto del negozio', !vetrina.descrizione && 'descrizione', !vetrina.orari && 'orari',
  !vetrina.indirizzo && 'indirizzo',
].filter(Boolean) : null;

// ---- i numeri ----------------------------------------------------------------------------------
const nonFallito = (o) => o.payment_status !== 'FAILED';
const pagato = (o) => o.payment_status === 'PAID';
const inCorso = (o) => nonFallito(o) && !['DELIVERED', 'CANCELED'].includes(o.delivery_status) && !o.canceled_at;
const ordini = L.ordini.righe;
const pagati30 = ordini.filter((o) => pagato(o) && entro(o.created_at, 30 * GIORNO));
const perCliente = {};
for (const o of ordini.filter((x) => nonFallito(x) && x.user_id)) perCliente[o.user_id] = (perCliente[o.user_id] || 0) + 1;
const prodotti = L.prodotti.righe;
const venditori = {};
for (const r of L.in_vendita.righe) if (r.seller_id) venditori[r.seller_id] = (venditori[r.seller_id] || 0) + 1;
const quantiVendono = Object.keys(venditori).length;
const voti = L.recensioni.righe.map((r) => numero(r.rating, 0)).filter((x) => x > 0);

const n = {
  stato,
  giorni_dalla_richiesta: p ? giorniDa(p.approval_requested_at || p.created_at) : null,
  giorni_dall_approvazione: p && p.approval_status === 'approved' ? giorniDa(p.approved_at) : null,
  puo_incassare_con_carta: p ? p.stripe_charges_enabled === true && p.stripe_payouts_enabled === true : null,
  dati_stripe_inviati: p ? p.stripe_details_submitted === true : null,

  prodotti: L.prodotti.ok ? L.prodotti.totale : null,
  prodotti_in_vendita: se('prodotti', (r) => r.filter((x) => x.status === 'available').length),
  prodotti_in_bozza: se('prodotti', (r) => r.filter((x) => x.status === 'draft').length),
  prodotti_da_approvare: se('prodotti', (r) => r.filter((x) => x.status === 'pending_approval').length),
  prodotti_esauriti: se('prodotti', (r) => r.filter((x) => x.status === 'out_of_stock' || (x.status === 'available' && numero(x.stock, 1) === 0)).length),
  prodotti_senza_foto: se('prodotti', (r) => r.filter((x) => !Array.isArray(x.images) || x.images.length === 0).length),
  prodotti_senza_prezzo: se('prodotti', (r) => r.filter((x) => !(numero(x.price, 0) > 0)).length),

  ordini: L.ordini.ok ? L.ordini.totale : null,
  ordini_pagati: se('ordini', (r) => r.filter(pagato).length),
  ordini_consegnati: se('ordini', (r) => r.filter((o) => o.delivery_status === 'DELIVERED').length),
  ordini_7g: se('ordini', (r) => r.filter((o) => nonFallito(o) && entro(o.created_at, 7 * GIORNO)).length),
  ordini_30g: se('ordini', (r) => r.filter((o) => nonFallito(o) && entro(o.created_at, 30 * GIORNO)).length),
  incasso_30g: L.ordini.ok ? euro(pagati30.reduce((s, o) => s + numero(o.total_price, 0), 0)) : null,
  scontrino_medio_30g: L.ordini.ok && pagati30.length ? euro(pagati30.reduce((s, o) => s + numero(o.total_price, 0), 0) / pagati30.length) : null,
  consegne_in_corso: se('ordini', (r) => r.filter(inCorso).length),
  ordini_fermi: se('ordini', (r) => r.filter((o) => inCorso(o) && piuVecchio(o.created_at, ORE_ORDINE_FERMO * ORA)).length),
  pagati_senza_payout: se('ordini', (r) => r.filter((o) => pagato(o) && o.payment_method !== 'cod' && !o.payout_at && piuVecchio(o.created_at, ORE_PAYOUT * ORA)).length),
  annullati: se('ordini', (r) => r.filter((o) => o.delivery_status === 'CANCELED').length),
  ordini_14g: se('ordini', (r) => r.filter((o) => nonFallito(o) && entro(o.created_at, GIORNI_NEGOZIO_FERMO * GIORNO)).length),
  clienti: L.ordini.ok ? Object.keys(perCliente).length : null,
  clienti_tornati: L.ordini.ok ? Object.values(perCliente).filter((x) => x >= 2).length : null,
  primo_ordine: se('ordini', (r) => r.map((o) => o.created_at).filter((x) => Number.isFinite(quando(x))).sort()[0] || null),

  recensioni: L.recensioni.ok ? voti.length : null,
  voto_medio: L.recensioni.ok && voti.length ? Math.round((voti.reduce((x, y) => x + y, 0) / voti.length) * 10) / 10 : null,
  recensioni_basse: se('recensioni', (r) => r.filter((x) => numero(x.rating, 5) <= 2).length),

  negozi_approvati: L.negozi.ok ? L.negozi.totale : null,
  negozi_che_vendono: L.in_vendita.ok ? quantiVendono : null,
  media_prodotti_negozi_che_vendono: L.in_vendita.ok && quantiVendono ? Math.round((L.in_vendita.righe.length / quantiVendono) * 10) / 10 : null,
};

// ---- i negozi in attesa concordata: «id:AAAA-MM-GG» (come nel 17) ---------------------------------
const inAttesa = String(cfg.NEGOZI_IN_ATTESA || '').split(/[,\s]+/).filter(Boolean).some((voce) => {
  const [idAtt, fino] = voce.split(':');
  const scade = fino ? quando(`${fino}T23:59:59+01:00`) : Infinity;
  return String(idAtt).toLowerCase() === richiesta.id && ADESSO <= scade;
});

// ---- le sentinelle -------------------------------------------------------------------------------
const sentinelle = [];
const suona = (id, colore, titolo, cosaFare) => sentinelle.push({ id, colore, titolo, cosa_fare: cosaFare });
if (trovata === false) suona('non-trovata', 'giallo', "L'attività non c'è nel database di MyCity", "Controlla l'identificativo: forse l'iscrizione è stata cancellata.");
if (n.pagati_senza_payout > 0) suona('payout-bloccato', 'rosso', `${n.pagati_senza_payout} ordini pagati con carta da più di ${ORE_PAYOUT} ore e il negozio non ha ancora ricevuto i soldi`, 'Controlla i payout di questo negozio.');
if (p && p.role === 'seller' && p.approval_status === 'pending') suona('da-approvare', 'giallo', `Aspetta l'approvazione da ${n.giorni_dalla_richiesta} giorni`, 'Controlla i dati e approvala da Utenti nel pannello del sito: finché non è approvata non vende.');
if (p && ['rejected', 'suspended'].includes(p.approval_status)) suona('ferma', 'giallo', `L'attività è ${stato}`, 'Niente da spingere finché lo stato non cambia.');
if (p && p.approval_status === 'approved' && n.puo_incassare_con_carta === false) suona('niente-carta', 'giallo', 'Non può ancora incassare con la carta: i dati per i pagamenti non sono completi', 'Aiutarla a finire la registrazione dei pagamenti, o partire coi contanti alla consegna.');
if (n.prodotti_in_vendita === 0) suona('nessun-prodotto', 'giallo', 'Nessun prodotto in vendita', `Caricare i primi prodotti con foto e prezzo${n.media_prodotti_negozi_che_vendono ? `: gli altri negozi che vendono ne hanno in media ${n.media_prodotti_negozi_che_vendono}` : ''}.`);
if (n.prodotti_senza_foto > 0) suona('senza-foto', 'giallo', `${n.prodotti_senza_foto} prodotti senza foto`, 'Senza foto un prodotto non si vende: farle o farle fare.');
if (n.prodotti_senza_prezzo > 0) suona('senza-prezzo', 'giallo', `${n.prodotti_senza_prezzo} prodotti senza prezzo`, 'Chiedere i prezzi al titolare.');
if (mancaInVetrina && mancaInVetrina.length >= 2) suona('vetrina', 'giallo', `Vetrina incompleta: manca ${mancaInVetrina.join(', ')}`, 'Completare la pagina del negozio: è la prima cosa che vede il cliente.');
if (n.ordini_fermi > 0) suona('ordini-fermi', 'giallo', `${n.ordini_fermi} ordini aperti da più di ${ORE_ORDINE_FERMO} ore e non ancora consegnati`, 'Chiamare il negozio o il fattorino: il cliente sta aspettando.');
if (p && p.approval_status === 'approved' && n.giorni_dall_approvazione !== null && n.giorni_dall_approvazione > GIORNI_NEGOZIO_FERMO && n.ordini_14g === 0 && !inAttesa) {
  suona('negozio-fermo', 'giallo', `Approvata da ${n.giorni_dall_approvazione} giorni e nessun ordine negli ultimi ${GIORNI_NEGOZIO_FERMO}`, 'Una telefonata di controllo prima che molli.');
}
if (n.recensioni_basse > 0) suona('recensione-bassa', 'giallo', `${n.recensioni_basse} recensioni con 1 o 2 stelle`, 'Preparare una risposta e richiamare il cliente.');

// ---- cosa non ho potuto misurare -----------------------------------------------------------------
const NOMI = { attivita: "scheda dell'attività", prodotti: 'i suoi prodotti', ordini: 'i suoi ordini', recensioni: 'le sue recensioni',
  in_vendita: 'i prodotti in vendita di tutti (per il confronto)', negozi: 'i negozi approvati (per il confronto)' };
const gap = [];
for (const [k, l] of Object.entries(L)) {
  if (!l.ok) gap.push(`${NOMI[k]}: non letti (${l.motivo})`);
  else if (l.parziale) gap.push(`${NOMI[k]}: letti i primi ${l.righe.length} su ${l.totale}, i conteggi sono parziali`);
}
if (inAttesa) gap.push("questa attività è in attesa concordata con Nicola: se è ferma non è un abbandono");

return [{ json: {
  quando: new Date(ADESSO).toISOString(),
  id: richiesta.id, nome: (p && p.store_name) || richiesta.nome || 'attività senza nome',
  tipo: p ? (p.business_type === 'altro' ? p.business_type_detail || 'altro' : p.business_type || null) : null,
  origine: richiesta.origine, esito_scheda: richiesta.esito_scheda, scheda: richiesta.scheda,
  trovata, vetrina, manca_in_vetrina: mancaInVetrina, numeri: n, sentinelle, gap,
  cieco: !L.attivita.ok && !L.ordini.ok && !L.prodotti.ok,
} }];
