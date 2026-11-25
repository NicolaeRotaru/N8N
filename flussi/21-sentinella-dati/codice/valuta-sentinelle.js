// 21 · Valuta le sentinelle — gli occhi a costo zero che l'AD aveva sul server, ora in n8n.
//
// Da dove viene: ad-mycity/cervello/sentinella-dati.mjs, il gruppo «azioni» (A1-A6): payout fermo,
// calo ordini, marketplace fermo, recensione bassa, negozio fermo, carrelli, consegne in ritardo.
// Le soglie sono le stesse. Il gruppo «macchina» (worker, battito, radiografia) resta fuori: il server
// dell'AD è spento per sempre (Nicola, 24/11), quelle sentinelle guarderebbero un morto.
//
// Due controlli del cervello non vedevano niente, e qui sono riparati:
//  · CARRELLI: il cervello contava con `select=id`, e la tabella abandoned_carts non ha la colonna id.
//    Il database rispondeva 400, il conteggio diventava «non misurato» e la regola taceva. Il
//    25/11 alle 12:10 i carrelli da recuperare erano 4. Qui si leggono le colonne che esistono.
//  · ORDINI IN RITARDO: il cervello cercava la colonna expected_delivery, che in orders non c'è.
//    Lo slot promesso è un testo, «Oggi · 11:00–13:00», «Domani · …», «Stasera · …», detto rispetto
//    al giorno dell'ordine (ora di Piacenza). Qui la scadenza si ricava da quel testo: la fine della
//    fascia, nel giorno dell'ordine (un giorno dopo se «Domani»). Il 25/11 gli ordini oltre lo slot
//    erano 4.
//
// Regole che non si toccano: sola lettura; una tabella che non si legge è «non misurato», mai zero;
// l'avviso parte solo quando qualcosa CAMBIA (una sentinella si accende, cambia numero o rientra).

const cfg = $('Config').first().json;
const ADESSO = Date.now();
const ORA = 3600000;
const GIORNO = 24 * ORA;
const numero = (v, seVuoto) => { const n = Number(v); return Number.isFinite(n) ? n : seVuoto; };
const ORE_PAYOUT = numero(cfg.ORE_PAYOUT, 24);
const ORE_CARRELLO = numero(cfg.ORE_CARRELLO, 4);
const ORE_ORDINE_FERMO = numero(cfg.ORE_ORDINE_FERMO, 2);
const GIORNI_NEGOZIO_FERMO = numero(cfg.GIORNI_NEGOZIO_FERMO, 14);
const CALO_SOGLIA = numero(cfg.CALO_SOGLIA, 0.7);
const CALO_MEDIA_MINIMA = numero(cfg.CALO_MEDIA_MINIMA, 3);
const SCALINI_FERMO = String(cfg.GIORNI_MARKETPLACE_FERMO || '3,7,14,30').split(',').map((x) => numero(x, NaN)).filter(Number.isFinite).sort((a, b) => a - b);
const VERO = String(cfg.MODALITA || '').trim().toLowerCase() === 'vero';

const quando = (iso) => { const t = new Date(iso).getTime(); return Number.isFinite(t) ? t : NaN; };
const entro = (iso, ms) => { const t = quando(iso); return Number.isFinite(t) && ADESSO - t <= ms; };
const piuVecchio = (iso, ms) => { const t = quando(iso); return Number.isFinite(t) && ADESSO - t > ms; };

// ---- le letture (stessa forma del 17) -----------------------------------------------------------
function lettura(nome) {
  if (!$(nome).isExecuted) return { ok: false, righe: [], motivo: 'non eseguita' };
  const j = $(nome).first().json || {};
  if (j.error !== undefined) {
    const m = typeof j.error === 'object' && j.error ? (j.error.message || JSON.stringify(j.error)) : String(j.error);
    return { ok: false, righe: [], motivo: String(m).slice(0, 140) };
  }
  const codice = numero(j.statusCode, 0);
  if (codice < 200 || codice >= 300) {
    const spieg = j.body && typeof j.body === 'object' && j.body.message ? String(j.body.message) : typeof j.body === 'string' ? j.body : '';
    return { ok: false, righe: [], motivo: `risposta ${codice || 'assente'}${spieg ? ': ' + spieg.slice(0, 80) : ''}` };
  }
  let righe = j.body;
  if (typeof righe === 'string') { try { righe = JSON.parse(righe); } catch { righe = null; } }
  if (!Array.isArray(righe)) return { ok: false, righe: [], motivo: 'la risposta non è un elenco' };
  const cr = String((j.headers || {})['content-range'] || '');
  const totale = cr.includes('/') ? numero(cr.split('/')[1], righe.length) : righe.length;
  return { ok: true, righe, totale, parziale: totale > righe.length };
}
const L = {
  ordini: lettura('Leggi gli ordini'),
  negozi: lettura('Leggi i negozi'),
  carrelli: lettura('Leggi i carrelli'),
  recensioni: lettura('Leggi le recensioni dei prodotti'),
  recensioni_negozi: lettura('Leggi le recensioni dei negozi'),
};

// I venditori «di sistema» (negozio MyCity dei prodotti importati, SDG Agenzia): fuori dai conti.
const diSistema = (id) => String(id || '').toLowerCase().startsWith('11111111-1111-1111-1111-');
if (L.ordini.ok) L.ordini.righe = L.ordini.righe.filter((o) => !diSistema(o.seller_id));
if (L.negozi.ok) L.negozi.righe = L.negozi.righe.filter((p) => !diSistema(p.id));

// Negozi in attesa concordata con Nicola: «id:AAAA-MM-GG», separati da virgola. Non sono churn.
const inAttesa = new Set(String(cfg.NEGOZI_IN_ATTESA || '').split(/[,\s]+/).filter(Boolean).map((voce) => {
  const [id, fino] = voce.split(':');
  const scade = fino ? quando(`${fino}T23:59:59+01:00`) : Infinity;
  return ADESSO <= scade ? String(id).toLowerCase() : null;
}).filter(Boolean));

// ---- la scadenza dello slot ---------------------------------------------------------------------
// Il giorno di calendario a Piacenza di un istante, e l'istante di un'ora di Piacenza in quel giorno.
const giornoRoma = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
function istanteRoma(giorno, ore, minuti) {
  const [a, m, g] = giorno.split('-').map(Number);
  const comeUtc = Date.UTC(a, m - 1, g, ore, minuti);
  // Lo scarto di Roma in quel momento (+1 d'inverno, +2 d'estate), letto dall'orologio stesso.
  const parti = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(new Date(comeUtc)).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  const romaComeUtc = Date.UTC(Number(parti.year), Number(parti.month) - 1, Number(parti.day), Number(parti.hour), Number(parti.minute));
  return comeUtc - (romaComeUtc - comeUtc);
}
/** La fine dello slot promesso, in millisecondi; NaN se il testo non si capisce. */
function scadenzaSlot(slot, creato) {
  const t = quando(creato);
  if (!Number.isFinite(t)) return NaN;
  const testo = String(slot || '').toLowerCase();
  const orari = [...testo.matchAll(/(\d{1,2})[:.](\d{2})/g)];
  if (!orari.length) return NaN;
  const fine = orari[orari.length - 1];
  // «dopodomani» contiene «domani»: va guardato prima (difetto trovato dal collaudo del 25/11).
  const piu = /dopodomani/.test(testo) ? 2 : /domani/.test(testo) ? 1 : (/oggi|stasera/.test(testo) ? 0 : NaN);
  if (!Number.isFinite(piu)) return NaN;
  // Il giorno dell'ordine a Piacenza, poi (se «Domani») il giorno dopo sul calendario, non +24 ore:
  // la notte del cambio d'ora dura 23 o 25 ore.
  const [a, m, g] = giornoRoma(t).split('-').map(Number);
  const giorno = new Date(Date.UTC(a, m - 1, g + piu)).toISOString().slice(0, 10);
  const fineMs = istanteRoma(giorno, Number(fine[1]), Number(fine[2]));
  // Una fascia che finisce a mezzanotte («22:00–00:00») finisce il giorno dopo: se la fine viene prima
  // dell'inizio, si aggiunge un giorno di calendario.
  if (orari.length >= 2) {
    const inizio = orari[orari.length - 2];
    if (Number(fine[1]) * 60 + Number(fine[2]) <= Number(inizio[1]) * 60 + Number(inizio[2])) {
      const [a2, m2, g2] = giorno.split('-').map(Number);
      return istanteRoma(new Date(Date.UTC(a2, m2 - 1, g2 + 1)).toISOString().slice(0, 10), Number(fine[1]), Number(fine[2]));
    }
  }
  return fineMs;
}

// ---- i numeri -----------------------------------------------------------------------------------
const ordini = L.ordini.righe;
const nonFallito = (o) => o.payment_status !== 'FAILED';
const aperto = (o) => nonFallito(o) && !o.delivered_at && !o.canceled_at && !['DELIVERED', 'CANCELED'].includes(o.delivery_status);
const apertiConSlot = ordini.filter(aperto).map((o) => ({ o, scade: scadenzaSlot(o.delivery_slot, o.created_at) }));

const negozi = L.negozi.righe.filter((p) => p.role === 'seller' && p.approval_status === 'approved');
const venditoriRecenti = new Set(ordini.filter((o) => entro(o.created_at, GIORNI_NEGOZIO_FERMO * GIORNO)).map((o) => o.seller_id));
const basse = [...L.recensioni.righe, ...L.recensioni_negozi.righe].filter((r) => numero(r.rating, 5) <= 2 && Number.isFinite(quando(r.created_at)));
const memoria = $getWorkflowStaticData('global');
const vista = memoria.ultima_recensione_bassa_vista || null;
const recOk = L.recensioni.ok && L.recensioni_negozi.ok;

const ordiniSettimanaPrima = ordini.filter((o) => nonFallito(o) && entro(o.created_at, 8 * GIORNO) && !entro(o.created_at, GIORNO));
const ultimoOrdine = ordini.map((o) => o.created_at).filter((x) => Number.isFinite(quando(x))).sort().pop() || null;

const n = {
  pagati_senza_payout: L.ordini.ok ? ordini.filter((o) => o.payment_status === 'PAID' && o.payment_method !== 'cod' && !o.payout_at && piuVecchio(o.created_at, ORE_PAYOUT * ORA)).length : null,
  ordini_in_ritardo: L.ordini.ok ? apertiConSlot.filter((x) => Number.isFinite(x.scade) && x.scade < ADESSO).length : null,
  ordini_slot_illeggibile_fermi: L.ordini.ok ? apertiConSlot.filter((x) => !Number.isFinite(x.scade) && piuVecchio(x.o.created_at, ORE_ORDINE_FERMO * ORA)).length : null,
  carrelli_da_recuperare: L.carrelli.ok ? L.carrelli.righe.filter((c) => c.recovered !== true && !c.recovery_email_sent_at && piuVecchio(c.last_activity, ORE_CARRELLO * ORA)).length : null,
  recensioni_basse_nuove: recOk ? (vista ? basse.filter((r) => quando(r.created_at) > quando(vista)).length : 0) : null,
  ordini_24h: L.ordini.ok ? ordini.filter((o) => nonFallito(o) && entro(o.created_at, GIORNO)).length : null,
  media_giornaliera_settimana_prima: L.ordini.ok ? Math.round((ordiniSettimanaPrima.length / 7) * 10) / 10 : null,
  giorni_senza_ordini: L.ordini.ok && ultimoOrdine ? Math.floor((ADESSO - quando(ultimoOrdine)) / GIORNO) : null,
};
const negoziFermi = L.negozi.ok && L.ordini.ok
  ? negozi.filter((p) => piuVecchio(p.approved_at || p.created_at, GIORNI_NEGOZIO_FERMO * GIORNO))
    .filter((p) => !venditoriRecenti.has(p.id)).filter((p) => !inAttesa.has(String(p.id).toLowerCase()))
    .map((p) => p.store_name || 'negozio senza nome').sort()
  : null;
n.negozi_fermi = negoziFermi ? negoziFermi.length : null;

// ---- le sentinelle -------------------------------------------------------------------------------
// «firma» = quello che, se cambia, merita un avviso. Il numero sì; l'ora no (altrimenti suonerebbe sempre).
const accese = [];
const suona = (id, colore, firma, titolo, cosaFare) => accese.push({ id, colore, firma: `${id}:${firma}`, titolo, cosa_fare: cosaFare });
if (n.pagati_senza_payout > 0) suona('payout-fermo', '🔴', n.pagati_senza_payout, `${n.pagati_senza_payout} ordini pagati con carta da più di ${ORE_PAYOUT} ore, e il negozio non ha ancora ricevuto i soldi`, 'Controlla i payout: sono soldi del negozio fermi da noi. Il pagamento lo firma Nicola.');
if (n.ordini_in_ritardo > 0) suona('consegne-in-ritardo', '🟡', n.ordini_in_ritardo, `${n.ordini_in_ritardo} ordini oltre lo slot promesso e non ancora consegnati`, 'Chiama il negozio o il fattorino, e avvisa il cliente.');
if (n.ordini_slot_illeggibile_fermi > 0) suona('ordini-fermi', '🟡', n.ordini_slot_illeggibile_fermi, `${n.ordini_slot_illeggibile_fermi} ordini aperti da più di ${ORE_ORDINE_FERMO} ore con uno slot che non so leggere`, 'Guarda a mano quando era promessa la consegna.');
if (n.carrelli_da_recuperare > 0) suona('carrelli', '🟡', n.carrelli_da_recuperare, `${n.carrelli_da_recuperare} carrelli abbandonati da più di ${ORE_CARRELLO} ore senza email di recupero`, "Preparare l'email di recupero: mandarla tocca clienti veri, la firma è di Nicola.");
if (n.recensioni_basse_nuove > 0) suona('recensione-bassa', '🟡', `${n.recensioni_basse_nuove}@${basse.map((r) => r.created_at).sort().pop()}`, `${n.recensioni_basse_nuove} recensioni nuove con 1 o 2 stelle`, 'Preparare una risposta e richiamare il cliente.');
if (negoziFermi && negoziFermi.length) suona('negozio-fermo', '🟡', negoziFermi.join('|'), `Negozi approvati senza ordini da ${GIORNI_NEGOZIO_FERMO} giorni: ${negoziFermi.slice(0, 5).join(', ')}${negoziFermi.length > 5 ? ` e altri ${negoziFermi.length - 5}` : ''}`, 'Una telefonata di controllo prima che mollino.');
if (n.media_giornaliera_settimana_prima !== null && n.media_giornaliera_settimana_prima >= CALO_MEDIA_MINIMA && n.ordini_24h < CALO_SOGLIA * n.media_giornaliera_settimana_prima) {
  suona('calo-ordini', '🟢', 'calo', `Ordini in calo: ${n.ordini_24h} nelle ultime 24 ore contro una media di ${n.media_giornaliera_settimana_prima} al giorno`, 'Capire la causa prima di agire.');
}
// Marketplace fermo: suona una volta per scalino (3, 7, 14, 30 giorni), non a ogni giro.
const scalino = n.giorni_senza_ordini === null ? null : SCALINI_FERMO.filter((g) => n.giorni_senza_ordini >= g).pop();
if (scalino) suona('marketplace-fermo', '🟡', scalino, `Nessun ordine nuovo da ${n.giorni_senza_ordini} giorni (traguardo dei ${scalino} superato)`, 'La mossa n.1 è il primo ordine pagato.');

// ---- cosa non ho potuto misurare -----------------------------------------------------------------
const NOMI = { ordini: 'ordini', negozi: 'negozi', carrelli: 'carrelli', recensioni: 'recensioni dei prodotti', recensioni_negozi: 'recensioni dei negozi' };
const gap = [];
for (const [k, l] of Object.entries(L)) {
  if (!l.ok) gap.push(`${NOMI[k]}: non letti (${l.motivo})`);
  else if (l.parziale) gap.push(`${NOMI[k]}: letti i primi ${l.righe.length} su ${l.totale}, i conteggi sono parziali`);
}
const cieco = Object.values(L).every((l) => !l.ok);

// ---- è cambiato qualcosa? -----------------------------------------------------------------------
const firme = accese.map((s) => s.firma).sort();
const ciechi = Object.entries(L).filter(([, l]) => !l.ok).map(([k]) => `cieco:${k}`).sort();
const firma = [...firme, ...ciechi].join(';');
const primaVolta = memoria.ultima_firma === undefined;
const modalitaCambiata = memoria.modalita !== undefined && memoria.modalita !== (VERO ? 'vero' : 'prova');
const cambiato = primaVolta || modalitaCambiata || memoria.ultima_firma !== firma;
const primaAccese = new Set((memoria.ultime_accese || []));
// Una sentinella accesa prima, la cui tabella adesso non si legge, NON è rientrata: non è misurata.
// Resta accesa in memoria e non si annuncia (difetto trovato dal collaudo del 25/11).
const FONTI = { 'payout-fermo': ['ordini'], 'consegne-in-ritardo': ['ordini'], 'ordini-fermi': ['ordini'], 'calo-ordini': ['ordini'],
  'marketplace-fermo': ['ordini'], carrelli: ['carrelli'], 'recensione-bassa': ['recensioni', 'recensioni_negozi'], 'negozio-fermo': ['negozi', 'ordini'] };
const nonMisurata = (id) => (FONTI[id] || Object.keys(L)).some((k) => !L[k].ok);
const sospese = [...primaAccese].filter((id) => !accese.some((s) => s.id === id) && nonMisurata(id));
const rientrate = [...primaAccese].filter((id) => !accese.some((s) => s.id === id) && !nonMisurata(id));
const nuove = accese.filter((s) => !primaAccese.has(s.id)).map((s) => s.id);

// ---- il messaggio --------------------------------------------------------------------------------
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ora = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ADESSO));
const righe = [`<b>👁️ Sentinella dei dati</b> · ${esc(ora)}${VERO ? '' : ' · 🧪 prova'}`];
if (cieco) righe.push('', '⛔ Non riesco a leggere il database: non so dire niente dei numeri. Non vuol dire che vada tutto bene.');
else if (!accese.length) righe.push('', '✅ Nessuna sentinella accesa.');
for (const s of accese) righe.push('', `${s.colore} ${nuove.includes(s.id) ? '<b>nuovo</b> · ' : ''}${esc(s.titolo)}`, `   → ${esc(s.cosa_fare)}`);
if (rientrate.length) righe.push('', `↩️ Rientrate: ${esc(rientrate.join(', '))}`);
if (gap.length && !cieco) righe.push('', '<i>Non misurato:</i>', ...gap.map((g) => `· ${esc(g)}`));

// Memoria: si aggiorna in prova e in vero, così il passaggio a «vero» riparte da uno stato vero.
// Un giro cieco non cancella le sentinelle che erano accese: il confronto resta onesto.
memoria.ultima_firma = firma;
memoria.modalita = VERO ? 'vero' : 'prova';
if (!cieco) memoria.ultime_accese = [...accese.map((s) => s.id), ...sospese];
const ultimaBassa = basse.map((r) => r.created_at).sort().pop();
if (recOk) memoria.ultima_recensione_bassa_vista = ultimaBassa && (!vista || quando(ultimaBassa) > quando(vista)) ? ultimaBassa : (vista || new Date(ADESSO).toISOString());
memoria.ultimo_giro = new Date(ADESSO).toISOString();

return [{ json: {
  quando: new Date(ADESSO).toISOString(), modalita: VERO ? 'vero' : 'prova',
  numeri: n, negozi_fermi: negoziFermi, sentinelle: accese, nuove, rientrate, gap, cieco,
  cambiato, manda: cambiato && VERO, messaggio: righe.join('\n').slice(0, 3900),
} }];
