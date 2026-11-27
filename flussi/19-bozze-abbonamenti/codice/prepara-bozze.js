// 19 · Prepara le bozze — le tre proposte di abbonamento (Base, Business, Premium) per UNA attività.
//
// Nicola, 25/11/2026: «un flusso con n8n che analizza la nuova azienda e prepara bozze dei 3 abbonamenti
// del sito». Le scrive questo codice, coi dati letti: niente IA a pagamento («non si paga MAI un'API di IA»,
// registro dei fatti, voce ad.uso-e-crediti). Ogni bozza è un messaggio pronto da copiare su WhatsApp, e
// parte solo se la manda Nicola: qui arriva a lui su Telegram, mai al titolare.
//
// Le regole sono quelle del sito (mycity, lib/agenzia/preventivo.ts e offerta-su-misura.ts):
//  · solo frasi vere: ogni riga personale nasce da un dato letto; senza il dato resta il testo del listino;
//  · le quantità di ogni fascia sono quelle del listino del sito (FASCE), copiate qui sotto parola per parola:
//    una prova le confronta col sito, e diventa rossa se lì cambiano;
//  · i canoni si leggono dalle impostazioni del sito (site_settings.agenzia.abbonamenti), come fa il sito;
//  · la fascia consigliata segue la stessa regola del sito (fasciaConsigliata);
//  · nessun prezzo per servizio: si vende l'abbonamento; il pareggio in scontrini è una stima e lo dice.

const richiesta = $('Leggi la richiesta').first().json;
const MAX_MESSAGGIO = 3900;
const MAX_BOZZA = 3300;

// LISTINO-INIZIO — copiato da mycity/lib/agenzia/preventivo.ts (FASCE, 24/11/2026). Non si cambia qui.
const SERVIZI = ['foto_video', 'sito_web', 'social', 'analisi'];
const FASCE = {
  base: {
    nome: 'Base',
    prezzoMese: 30000,
    perChi: 'Per essere online e vendere da subito, con un aiuto costante ma leggero.',
    servizi: {
      foto_video: 'Una sessione di foto all’avvio: copertina e prodotti principali.',
      sito_web: 'Un sito di una pagina col tuo nome, collegato alla vetrina.',
      social: '8 post al mese, preparati e pubblicati da noi. Scheda Google Maps creata o sistemata all’avvio.',
      analisi: 'Il rapporto completo all’avvio: reputazione, concorrenti vicini, zona, sito, i tuoi social, calendario della città, bandi e il piano dei primi 30 giorni.',
    },
    vetrina: 'Vetrina su MyCity con ordini, consegna e ritiro in negozio.',
    assistenza: 'Su WhatsApp, risposta entro 24 ore lavorative.',
  },
  business: {
    nome: 'Business',
    prezzoMese: 60000,
    perChi: 'Per crescere ogni settimana: più contenuti, più clienti che ti trovano.',
    servizi: {
      foto_video: 'Foto all’avvio e una nuova sessione ogni tre mesi, più un video al mese.',
      sito_web: 'Un sito completo di più pagine, col tuo nome.',
      social: '12 post al mese, 3 a settimana, con 2 video brevi. Scheda Google Maps sistemata, più le risposte alle recensioni scritte da noi.',
      analisi: 'Il rapporto all’avvio e ogni mese: le ricerche su Google, i tuoi 3 concorrenti principali sui social e sul web, cosa è cambiato.',
    },
    vetrina: 'Vetrina su MyCity con ordini, consegna e ritiro in negozio, in evidenza nella tua categoria una settimana al mese.',
    assistenza: 'Su WhatsApp, risposta entro 4 ore lavorative.',
  },
  premium: {
    nome: 'Premium',
    prezzoMese: 90000,
    perChi: 'Il servizio completo: foto e video ogni mese, un referente tutto tuo.',
    servizi: {
      foto_video: 'Una sessione di foto e video ogni mese.',
      sito_web: 'Un sito completo, aggiornato da noi ogni mese.',
      social: '20 post al mese, 4 video brevi e le storie. Scheda Google Maps curata ogni mese: foto nuove, post e risposte alle recensioni.',
      analisi: 'Il rapporto aggiornato ogni settimana, con fino a 5 concorrenti sui social e sul web e le idee che ne nascono, e un incontro al mese per leggerlo insieme.',
    },
    vetrina: 'Vetrina su MyCity con ordini, consegna e ritiro in negozio, in home page due settimane al mese.',
    assistenza: 'Un referente tutto tuo e una visita nel locale ogni mese.',
  },
};
const FOTO_LOCALE_CONSIGLIATE = 3;
const PRODOTTI_PER_IL_PREMIUM = 150;
const PREAVVISO_GIORNI = 30;
const GIORNI_DEL_MESE = 30;
const PREZZO_MINIMO_CENTESIMI = 1000;
const PREZZO_MASSIMO_CENTESIMI = 1000000;
const TIPI = ['negozio', 'bar', 'ristorante', 'artigiano', 'servizi', 'altro'];
const SCONTRINO_DI_PARTENZA = {
  negozio: { centesimi: 1500, cosa: 'scontrini', una: 'scontrino' },
  bar: { centesimi: 300, cosa: 'colazioni', una: 'colazione' },
  ristorante: { centesimi: 2500, cosa: 'coperti', una: 'coperto' },
  artigiano: { centesimi: 2000, cosa: 'scontrini', una: 'scontrino' },
  servizi: { centesimi: 3000, cosa: 'clienti', una: 'cliente' },
  altro: { centesimi: 1500, cosa: 'scontrini', una: 'scontrino' },
};
// LISTINO-FINE
const ABBONAMENTI = Object.keys(FASCE);

const ETICHETTA_TIPO = { negozio: 'negozio o bottega', bar: 'bar o caffetteria', ristorante: 'ristorante o pizzeria',
  artigiano: 'artigiano o laboratorio', servizi: 'servizi alla persona', altro: 'altra attività' };
const VIDEO_PER_TIPO = {
  negozio: 'un video della bottega e dei prodotti più scelti',
  bar: 'un video del bancone e delle colazioni, dal primo caffè',
  ristorante: 'un video della cucina e dei piatti che escono',
  artigiano: 'un video del laboratorio, con le mani al lavoro',
  servizi: 'un video dello studio e di come lavorate',
  altro: 'un video del locale e di chi ci lavora',
};
const STATI = { pending: 'in attesa di approvazione', approved: 'approvata', rejected: 'respinta', suspended: 'sospesa' };

// ---- gli attrezzi --------------------------------------------------------------------------------
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const numero = (v, seVuoto) => { const n = Number(v); return Number.isFinite(n) ? n : seVuoto; };
const it = (n) => Number(n).toLocaleString('it-IT');
// La prima lettera minuscola, tranne in un numero o in una sigla («8 post», «MyCity»).
const minuscola = (t) => (/^[A-ZÀ-Ý][a-zà-ý’']/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
const elenco = (v) => (v.length <= 1 ? v.join('') : `${v.slice(0, -1).join(', ')} e ${v[v.length - 1]}`);
const pieno = (o, k) => { const v = o && typeof o === 'object' ? o[k] : undefined; return typeof v === 'string' && v.trim().length > 0; };
const haFoto = (images) => Array.isArray(images) && images.some((i) => typeof i === 'string' && i.trim().length > 0);
const contaMedia = (media, tipo) => (Array.isArray(media)
  ? media.filter((m) => m && typeof m === 'object' && m.type === tipo && typeof m.url === 'string' && m.url.trim()).length : 0);
/** 30000 → «300 €», 49950 → «499,50 €». */
const euro = (centesimi) => (centesimi % 100 === 0 ? `${it(centesimi / 100)} €`
  : `${(centesimi / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

function lettura(nome) {
  if (!$(nome).isExecuted) return { ok: false, righe: [], motivo: 'non eseguita' };
  const j = $(nome).first().json || {};
  if (j.error !== undefined) return { ok: false, righe: [], motivo: 'errore nella lettura' };
  const codice = numero(j.statusCode, 0);
  if (codice < 200 || codice >= 300) return { ok: false, righe: [], motivo: `risposta ${codice || 'assente'}` };
  let righe = j.body;
  if (typeof righe === 'string') { try { righe = JSON.parse(righe); } catch { righe = null; } }
  if (!Array.isArray(righe)) return { ok: false, righe: [], motivo: 'la risposta non è un elenco' };
  const cr = String((j.headers || {})['content-range'] || '');
  const totale = cr.includes('/') ? numero(cr.split('/')[1], righe.length) : righe.length;
  return { ok: true, righe, totale, parziale: totale > righe.length };
}

const L = { attivita: lettura("Leggi l'attività"), prodotti: lettura('Leggi i suoi prodotti'), impostazioni: lettura('Leggi i canoni del sito') };
const p = L.attivita.ok ? L.attivita.righe[0] || null : null;
const nome = (p && String(p.store_name || '').trim()) || richiesta.nome || 'attività senza nome';
if (!p) {
  const motivo = L.attivita.ok ? "l'attività non c'è nel database di MyCity" : `la scheda dell'attività non si legge (${L.attivita.motivo})`;
  return [{ json: { messaggio: `📝 <b>Bozze non fatte</b> · ${esc(nome)}\nMotivo: ${esc(motivo)}` } }];
}

// ---- cosa dicono i dati ------------------------------------------------------------------------
const tipo = TIPI.includes(String(p.business_type)) ? String(p.business_type) : 'negozio';
const dettaglio = String(p.business_type_detail || '').trim();
const socials = (p.store_customization && typeof p.store_customization === 'object' && p.store_customization.socials) || {};
const prodotti = L.prodotti.ok ? L.prodotti.righe : null;
const quantiProdotti = prodotti ? Math.max(prodotti.length, L.prodotti.totale) : null;
const senzaFoto = prodotti ? prodotti.filter((x) => !haFoto(x.images)).length : null;
const fotoLocale = contaMedia(p.store_media, 'image');
const videoLocale = contaMedia(p.store_media, 'video');
const haSito = pieno(socials, 'website');
const profili = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok']].filter(([k]) => pieno(socials, k)).map(([, n]) => n);
const haMaps = pieno(socials, 'google_maps');
const canali = [...profili, ...(haMaps ? ['la scheda Google'] : []), ...(haSito ? ['il sito'] : [])];
const scheda = richiesta.scheda || null;
const idee = scheda ? scheda.idee_contenuti.slice(0, 2) : [];
const puntoDiForza = scheda && scheda.punti_di_forza.length ? scheda.punti_di_forza[0] : '';

// I canoni come li legge il sito: assente → listino; numero valido di centesimi → quello; altro → su richiesta.
let avvisoCanoni = '';
const scritti = (() => {
  if (!L.impostazioni.ok) { avvisoCanoni = `i canoni sono quelli del listino: le impostazioni del sito non si leggono (${L.impostazioni.motivo})`; return {}; }
  const ag = L.impostazioni.righe[0] && L.impostazioni.righe[0].agenzia;
  return ag && typeof ag === 'object' && ag.abbonamenti && typeof ag.abbonamenti === 'object' ? ag.abbonamenti : {};
})();
const canone = Object.fromEntries(ABBONAMENTI.map((f) => {
  const v = scritti[f];
  if (v === undefined) return [f, FASCE[f].prezzoMese];
  return [f, Number.isInteger(v) && v >= PREZZO_MINIMO_CENTESIMI && v <= PREZZO_MASSIMO_CENTESIMI ? v : null];
}));

// La fascia consigliata: la stessa regola del sito (preventivo.ts, fasciaConsigliata).
const fotoDaFare = fotoLocale < FOTO_LOCALE_CONSIGLIATE || (senzaFoto || 0) > 0 || videoLocale === 0;
let consigliata = { id: 'base', perche: 'la vetrina è già in ordine: il Base basta per tenerla viva' };
if ((quantiProdotti || 0) >= PRODOTTI_PER_IL_PREMIUM) consigliata = { id: 'premium', perche: `ha ${it(quantiProdotti)} prodotti in catalogo: con foto e video ogni mese si tengono in ordine` };
else if (fotoDaFare || !haSito) {
  const daRifare = [fotoDaFare ? 'foto e video' : null, !haSito ? 'sito web professionale' : null].filter(Boolean);
  consigliata = { id: 'business', perche: `alla vetrina mancano ${elenco(daRifare)}: il Business li fa e li tiene aggiornati` };
}

// ---- le righe di ogni fascia -----------------------------------------------------------------------
function rigaFoto(f) {
  const pezzi = [];
  if (fotoLocale < FOTO_LOCALE_CONSIGLIATE) pezzi.push(`scattiamo le foto della copertina (il locale, l’ingresso${tipo === 'bar' || tipo === 'ristorante' ? ', il bancone' : ''} e chi ci lavora)`);
  if (senzaFoto > 0) {
    const tutti = senzaFoto === 1 ? 'il prodotto che non ha ancora una foto' : `i tuoi ${it(senzaFoto)} prodotti senza foto`;
    // Il Base dice «copertina e prodotti principali» (FASCE): non tutti, se sono tanti.
    pezzi.push(`fotografiamo ${f === 'base' && senzaFoto > 1 ? `i prodotti principali fra i ${it(senzaFoto)} senza foto` : tutti}`);
  }
  let riga = FASCE[f].servizi.foto_video;
  if (pezzi.length) riga += ` All’avvio ${elenco(pezzi)}.`;
  if (videoLocale === 0 && f !== 'base') riga += ` Si parte con ${VIDEO_PER_TIPO[tipo]}.`;
  return riga;
}
function rigaSito(f) {
  if (!haSito) return `${FASCE[f].servizi.sito_web} Oggi non hai un sito tutto tuo.`;
  return `${FASCE[f].servizi.sito_web} Se vuoi, ci mettiamo dentro il sito che hai già.`;
}
function rigaSocial(f) {
  let riga = FASCE[f].servizi.social;
  riga += profili.length ? ` I post escono su ${elenco(profili)}.` : ' Oggi alla tua vetrina non è collegato nessun profilo social.';
  if (idee.length) riga += ` Per cominciare, idee come ${elenco(idee.map((x) => `«${x}»`))}.`;
  return riga;
}
function rigaAnalisi(f) {
  return FASCE[f].servizi.analisi + (canali.length ? ` Partiamo da ${elenco(canali)}, che ci hai già indicato.` : '');
}
function pareggio(f) {
  const c = canone[f];
  const s = SCONTRINO_DI_PARTENZA[tipo];
  if (!c) return null;
  const alGiorno = c / GIORNI_DEL_MESE;
  const quanti = Math.ceil(alGiorno / s.centesimi);
  const testoGiorno = alGiorno >= 1000 ? `${Math.round(alGiorno / 100)} €` : euro(Math.round(alGiorno));
  const articolo = { scontrino: 'uno', colazione: 'una', coperto: 'un', cliente: 'un' }[s.una] || 'un';
  return `Per ripagarlo bastano circa ${testoGiorno} al giorno: l’incasso di ${quanti} ${quanti === 1 ? s.una : s.cosa} in più al giorno (contando ${articolo} ${s.una} da ${euro(s.centesimi)}: è una nostra stima, col tuo prezzo rifacciamo il conto).`;
}

function bozza(f) {
  const F = FASCE[f];
  const c = canone[f];
  const righe = [
    `Ciao, ti scrivo da MyCity per ${nome}.`,
    `Ho guardato la tua vetrina${puntoDiForza ? ` e quello che si dice di voi (${puntoDiForza})` : ''}, e ti ho preparato la proposta col piano *${F.nome}*. ${F.perChi}`,
    '',
    '*Cosa facciamo noi per te*',
    `• Foto e video: ${minuscola(rigaFoto(f))}`,
    `• Sito: ${minuscola(rigaSito(f))}`,
    `• Social e Google Maps: ${minuscola(rigaSocial(f))}`,
    `• Analisi: ${minuscola(rigaAnalisi(f))}`,
    `• Vetrina: ${minuscola(F.vetrina)}`,
    `• Assistenza: ${minuscola(F.assistenza)}`,
    '',
    '*Quanto costa*',
    c ? `${euro(c)} al mese, solo canone. Il primo mese costa la metà: ${euro(Math.round(c / 2))}.` : 'Il canone te lo diciamo a voce: per questo piano è su richiesta.',
    ...(pareggio(f) ? [pareggio(f)] : []),
    `Nessun vincolo di durata: disdici quando vuoi, con ${PREAVVISO_GIORNI} giorni di preavviso.`,
    '',
    'Tu resti al bancone: foto, post, sito e scheda Google li facciamo noi.',
    'Se ti va, ne parliamo dieci minuti quando vuoi tu.',
  ];
  let t = righe.join('\n');
  // Il messaggio di Telegram ha un tetto: se la bozza è troppo lunga si taglia a fine riga, e lo dice.
  if (esc(t).length > MAX_BOZZA) {
    const r = t.split('\n');
    while (r.length > 1 && esc(r.join('\n')).length > MAX_BOZZA - 40) r.pop();
    t = `${r.join('\n')}\n[…bozza accorciata: troppo lunga per Telegram]`;
  }
  const stella = f === consigliata.id ? '⭐ ' : '';
  const testa = `${stella}<b>Bozza ${F.nome}</b> · ${c ? `${esc(euro(c))} al mese, primo mese ${esc(euro(Math.round(c / 2)))}` : 'canone su richiesta'}${stella ? ' · <i>la consigliata</i>' : ''}`;
  return `${testa}\nDa copiare su WhatsApp, dopo averla letta:\n<pre>${esc(t)}</pre>`;
}

// ---- il riepilogo per Nicola ---------------------------------------------------------------------
const ora = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date());
const stato = p.role === 'seller' ? STATI[p.approval_status] || `stato «${p.approval_status || 'vuoto'}»` : 'non è ancora un negozio';
const nm = (v) => (v === null || v === undefined ? 'non misurato' : it(v));
const riepilogo = [
  `📝 <b>Bozze dei 3 abbonamenti</b> · ${esc(nome)}`,
  `${esc(tipo === 'altro' && dettaglio ? dettaglio : ETICHETTA_TIPO[tipo])} · ${esc(stato)} · ${esc(ora)}`,
  `Consigliato: ⭐ <b>${FASCE[consigliata.id].nome}</b>, perché ${esc(consigliata.perche)}.`,
  '',
  '<b>Cosa ho letto dalla vetrina MyCity</b>',
  `• Prodotti in catalogo: ${nm(quantiProdotti)}${senzaFoto ? `, senza foto: ${it(senzaFoto)}` : ''}${L.prodotti.ok && L.prodotti.parziale ? ' (letti in parte)' : ''}`,
  `• Foto del locale in copertina: ${fotoLocale} su ${FOTO_LOCALE_CONSIGLIATE} consigliate · video: ${videoLocale ? it(videoLocale) : 'nessuno'}`,
  `• Sito suo: ${haSito ? 'sì' : 'no'} · social indicati: ${profili.length ? esc(elenco(profili)) : 'nessuno'} · scheda Google indicata: ${haMaps ? 'sì' : 'no'}`,
];
// La parte presa dal web è la sola che si accorcia se il messaggio supera il tetto di Telegram: ogni riga
// apre e chiude i suoi tag, quindi togliere righe intere non rompe mai l'HTML.
const dalWeb = [];
if (scheda) {
  dalWeb.push('', '<b>Dalla ricerca sul web (modulo 12)</b>');
  if (scheda.tipo_di_locale) dalWeb.push(`• Locale: ${esc(scheda.tipo_di_locale)}`);
  if (scheda.pubblico) dalWeb.push(`• Pubblico: ${esc(scheda.pubblico)}`);
  if (scheda.tono_consigliato) dalWeb.push(`• Tono consigliato: ${esc(scheda.tono_consigliato)}`);
  if (scheda.punti_di_forza.length) dalWeb.push(`• Punti di forza: ${esc(scheda.punti_di_forza.join(' · '))}`);
  if (scheda.cosa_chiedere_al_titolare.length) dalWeb.push('', '<b>Da chiedere al titolare</b>', ...scheda.cosa_chiedere_al_titolare.map((d) => `• ${esc(d)}`));
}
const controlli = ['Sono bozze: non parte niente da solo, le mandi tu dopo averle lette.'];
if (puntoDiForza) controlli.push(`Il punto di forza citato in apertura («${esc(puntoDiForza)}») viene dalla ricerca sul web: controllalo.`);
if (idee.length) controlli.push('Le idee per i post vengono dalla ricerca sul web: tienile o toglile.');
if (!scheda) controlli.push('La scheda della ricerca sul web non è arrivata: le bozze usano solo la vetrina.');
if (!L.prodotti.ok) controlli.push(`I prodotti non si sono letti (${esc(L.prodotti.motivo)}): le bozze non parlano delle foto dei prodotti.`);
if (avvisoCanoni) controlli.push(`${esc(avvisoCanoni.charAt(0).toUpperCase() + avvisoCanoni.slice(1))}: controllali prima di mandare.`);
if (ABBONAMENTI.some((f) => !canone[f])) controlli.push('Per almeno un piano il canone è «su richiesta» nelle impostazioni del sito.');
if (scheda && scheda.dubbi.length) controlli.push(`Dubbi della ricerca: ${esc(scheda.dubbi.join(' · '))}`);
const finale = ['', '<b>Prima di mandare</b>', ...controlli.map((c) => `• ${c}`)];
const componi = () => [...riepilogo, ...dalWeb, ...finale].join('\n');
let accorciato = false;
while (componi().length > MAX_MESSAGGIO && dalWeb.length) { dalWeb.pop(); accorciato = true; }
while (componi().length > MAX_MESSAGGIO && finale.length > 3) { finale.pop(); accorciato = true; }
const primo = componi() + (accorciato ? '\n…' : '');

return [primo, ...ABBONAMENTI.map(bozza)].map((messaggio) => ({ json: { messaggio } }));
