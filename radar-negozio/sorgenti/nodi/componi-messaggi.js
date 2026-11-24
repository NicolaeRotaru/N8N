// Compone i due messaggi Telegram (la scheda e i dettagli) e la riga per il foglio.
// Se la parte scritta da Claude manca, i messaggi escono lo stesso con i soli dati misurati.
// @comune claude

const r = $input.first().json;
const d = Object.assign({}, $('Prepara scheda').first().json);
delete d.richiesta_scheda;

const esito = jsonClaude(r);
const scheda = esito.dati || null;
const costo = (d.costo_usd || 0) + costoClaude(r);
const g = d.google || {};
const s = d.sito || {};
const l = d.lettura || {};
const rs = d.ricerca_social || {};

// ---------- aiuti ----------
const esc = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (x) => esc(x).replace(/"/g, '&quot;');
const taglia = (x, n) => {
  const t = String(x == null ? '' : x).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
};
const link = (url, testo) => (/^https?:\/\/[^\s"<>]+$/i.test(String(url || '')) ? '<a href="' + attr(url) + '">' + esc(testo) + '</a>' : esc(testo));
const numero = (x, dec) => Number(x).toLocaleString('it-IT', { maximumFractionDigits: dec == null ? 1 : dec });
const si = (v) => (v === true ? '✔' : v === false ? '✖' : '?');
const semaforo = (v) => (v === null || v === undefined ? '⚪' : v >= 7 ? '🟢' : v >= 4 ? '🟡' : '🔴');
const lista = (a, n) => (Array.isArray(a) ? a : []).map((x) => taglia(x, 170)).filter(Boolean).slice(0, n);
// Niente `new URL()`: nei nodi Code di n8n 2.x non esiste.
function dominio(u) {
  const m = String(u || '').match(/^https?:\/\/(?:[^\/?#@]*@)?([^\/?#:]+)/i);
  return m ? m[1].replace(/^www\./i, '') : String(u || '');
}
function visibile(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}
// Telegram accetta al massimo 4096 caratteri visibili per messaggio: i blocchi che non ci stanno si saltano.
function componi(blocchi, max) {
  let out = '';
  for (const b of blocchi) {
    if (b === null || b === undefined) continue; // '' è una riga vuota e resta
    const prova = out ? out + '\n' + b : b;
    if (visibile(prova).length <= max) out = prova;
  }
  return out;
}

// ---------- voti ----------
const votoGoogle = g.trovato ? Number(g.voto) || 0 : 0;
const votoSito = Number(s.voto) || 0;
let votoSocial = null;
if (scheda && scheda.social && Number.isFinite(Number(scheda.social.voto))) {
  votoSocial = Math.max(0, Math.min(10, Math.round(Number(scheda.social.voto))));
}
const pesi = [[votoGoogle, 0.4], [votoSito, 0.3]];
if (votoSocial !== null) pesi.push([votoSocial, 0.3]);
const totale = pesi.reduce((t, [v, p]) => t + v * p, 0) / pesi.reduce((t, [, p]) => t + p, 0);
const voti = {
  totale: Math.round(totale * 10) / 10,
  google: votoGoogle,
  sito: votoSito,
  social: votoSocial,
};
const v10 = (v) => (v === null ? 'n.d.' : numero(Math.round(v), 0) + '/10');

// ---------- titoli di riserva (senza Claude) ----------
function titoloGoogleMisurato() {
  if (!g.trovato) return g.errore ? 'ricerca su Google non riuscita' : 'scheda Google non trovata';
  const parti = [];
  if (g.stelle !== null && g.stelle !== undefined) parti.push(numero(g.stelle) + '★');
  parti.push(numero(g.recensioni, 0) + ' recensioni');
  if (!g.orari || !g.orari.length) parti.push('senza orari');
  if (!g.sito) parti.push('nessun sito collegato');
  return parti.join(', ');
}
function titoloSitoMisurato() {
  if (s.tipo === 'nessuno') return 'nessun sito';
  if (s.tipo === 'social') return 'al posto del sito c\'è ' + (s.piattaforma || 'un profilo social');
  if (!s.raggiungibile) return 'il sito non si apre';
  const ps = s.pagespeed || {};
  return typeof ps.velocita === 'number' ? 'velocità da telefono ' + ps.velocita + '/100' : 'sito presente';
}

const nome = g.nome || l.nome_attivita || 'Negozio';
const tipo = l.tipo_attivita || g.categoria || '';

// ---------- messaggio 1: la scheda ----------
function area(titoloArea, voto, dati, titoloRiserva) {
  const righe = [semaforo(voto) + ' <b>' + titoloArea + ' ' + v10(voto) + '</b> — ' + esc(taglia((dati && dati.titolo) || titoloRiserva, 170))];
  if (dati) {
    for (const p of lista(dati.punti_forti, 2)) righe.push('   ✔ ' + esc(p));
    for (const p of lista(dati.problemi, 2)) righe.push('   ✖ ' + esc(p));
  }
  return righe.join('\n');
}

const m1 = [];
m1.push('🏪 <b>' + esc(taglia(nome, 80)) + '</b>' + (tipo ? ' · ' + esc(taglia(tipo, 40)) : ''));
if (g.indirizzo) m1.push('📍 ' + link(g.maps_url, taglia(g.indirizzo, 120)));
m1.push(semaforo(voti.totale) + ' <b>Presenza online: ' + v10(voti.totale) + '</b>');
if (g.trovato && g.abbinamento === 'bassa') m1.push('⚠️ <i>Non sono sicuro che la scheda Google sia quella giusta: controlla nei dettagli.</i>');
if (g.stato && g.stato !== 'OPERATIONAL') {
  m1.push('⚠️ <b>Su Google risulta ' + (g.stato === 'CLOSED_PERMANENTLY' ? 'chiuso definitivamente' : 'chiuso temporaneamente') + '.</b>');
}
if (scheda && scheda.sintesi) m1.push('<i>' + esc(taglia(scheda.sintesi, 400)) + '</i>');
if (!scheda) m1.push('⚠️ <i>La parte scritta da Claude non è arrivata (' + esc(taglia(esito.errore, 150)) + '): qui ci sono solo i dati misurati.</i>');
m1.push('');
m1.push(area('Google', votoGoogle, scheda && scheda.google, titoloGoogleMisurato()));
m1.push(area('Sito', votoSito, scheda && scheda.sito, titoloSitoMisurato()));
m1.push(area('Social', votoSocial, scheda && scheda.social, rs.errore ? 'ricerca non riuscita' : 'non valutati'));
const proposte = scheda && Array.isArray(scheda.proposte) ? scheda.proposte.slice(0, 3) : [];
if (proposte.length) {
  m1.push('');
  m1.push('💡 <b>Cosa proporre</b>');
  proposte.forEach((p, i) => {
    m1.push((i + 1) + '. <b>' + esc(p.servizio) + '</b>: ' + esc(taglia(p.cosa, 220)) + (p.perche ? ' — <i>' + esc(taglia(p.perche, 200)) + '</i>' : ''));
  });
}
if (scheda && scheda.rompighiaccio) {
  m1.push('');
  m1.push('🗣 <b>Per rompere il ghiaccio</b>');
  m1.push('«' + esc(taglia(scheda.rompighiaccio, 400)) + '»');
}
const messaggio1 = componi(m1, 4000);

// ---------- messaggio 2: i dettagli ----------
const m2 = [];
m2.push('📋 <b>Dettagli</b> · ' + esc(taglia(nome, 80)));
m2.push('');
m2.push('<b>Google</b>');
if (g.trovato) {
  m2.push('• ' + link(g.maps_url, 'Apri la scheda su Maps') + ' · abbinamento: ' + esc(g.abbinamento));
  const stelle = g.stelle !== null && g.stelle !== undefined ? numero(g.stelle) + '★ · ' : '';
  const giorni = g.giorni_ultima_recensione;
  const recente = giorni !== null && giorni !== undefined ? ' · la più recente tra le 5 che Google mostra: ' + (giorni === 0 ? 'oggi' : giorni + ' giorni fa') : '';
  m2.push('• ' + stelle + numero(g.recensioni, 0) + ' recensioni' + recente);
  m2.push('• Orari ' + si(!!(g.orari && g.orari.length)) + ' · Telefono ' + si(!!g.telefono) + ' · Foto ' + (g.foto >= 10 ? '10 o più' : g.foto) + ' · Sito collegato ' + si(!!g.sito));
  m2.push('• Voto: ' + (g.dettaglio_voto || []).map((v) => esc(v.voce) + ' ' + numero(v.punti) + '/' + numero(v.max)).join(', '));
  if (g.altri_risultati && g.altri_risultati.length && g.abbinamento !== 'alta') m2.push('• Altri risultati: ' + esc(taglia(g.altri_risultati.join(' | '), 250)));
} else if (g.errore) {
  m2.push('• Ricerca su Google non riuscita: ' + esc(taglia(g.errore, 200)));
} else {
  m2.push('• Nessuna scheda trovata cercando «' + esc(taglia(g.ricerca, 120)) + '».');
  if (g.altri_risultati && g.altri_risultati.length) m2.push('• Google proponeva (nome diverso): ' + esc(taglia(g.altri_risultati.join(' | '), 250)));
  m2.push('• Controlla a mano: se davvero non c\'è, è la prima cosa da proporre.');
}

m2.push('');
m2.push('<b>Sito</b>');
if (s.tipo === 'nessuno') {
  m2.push('• Nessun sito trovato, né su Google né sulla vetrina.');
} else if (s.tipo === 'social') {
  m2.push('• Al posto del sito: ' + link(s.url, s.piattaforma || dominio(s.url)) + '.');
} else {
  m2.push('• ' + link(s.url, dominio(s.url)) + ' (preso da ' + (s.fonte === 'foto' ? 'vetrina' : 'Google') + ')');
  if (!s.raggiungibile) {
    m2.push('• Non si apre: ' + esc(taglia(s.errore_home || (s.pagespeed && s.pagespeed.errore) || 'nessuna risposta', 200)));
  } else {
    const h = s.pagina || {};
    const ps = s.pagespeed || {};
    m2.push('• https ' + si(s.https) + ' · Adatto al telefono ' + si(h.letta ? h.adatto_telefono : ps.viewport_ok));
    if (typeof ps.velocita === 'number') {
      m2.push('• Velocità da telefono ' + ps.velocita + '/100' + (ps.caricamento ? ' (pagina pronta in ' + esc(ps.caricamento) + ')' : '') + (typeof ps.seo === 'number' ? ' · SEO ' + ps.seo + '/100' : ''));
    } else {
      m2.push('• Velocità non misurata: ' + esc(taglia(ps.errore || 'nessun risultato', 150)));
    }
    if (h.letta) {
      m2.push('• Contatti cliccabili: telefono ' + si(h.telefono_cliccabile) + ', WhatsApp ' + si(h.whatsapp) + ', email ' + si(h.email_cliccabile) + ' · P.IVA ' + si(!!h.partita_iva) + (h.anno_copyright ? ' · © ' + h.anno_copyright : ''));
      m2.push('• Fatto con: ' + esc(h.fatto_con || 'non riconosciuto') + ' · Statistiche Google ' + si(h.statistiche_google) + ' · Pixel Meta ' + si(h.pixel_meta) + ' · Banner cookie ' + (h.banner_cookie ? esc(h.banner_cookie) : '✖'));
      if (h.prenotazioni && h.prenotazioni.length) m2.push('• Prenotazioni / consegne: ' + esc(h.prenotazioni.join(', ')));
    } else {
      m2.push('• La pagina non si è lasciata leggere (' + esc(taglia(s.errore_home || 'blocca i controlli automatici', 120)) + ').');
    }
    m2.push('• Voto: ' + (s.dettaglio_voto || []).map((v) => esc(v.voce) + ' ' + numero(v.punti) + '/' + numero(v.max)).join(', '));
  }
}

m2.push('');
m2.push('<b>Social</b>');
if (scheda && scheda.social && Array.isArray(scheda.social.profili) && scheda.social.profili.length) {
  for (const p of scheda.social.profili.slice(0, 6)) {
    if (!p.indirizzo) {
      m2.push('• ' + esc(p.piattaforma) + ': non trovato');
      continue;
    }
    const dove = link(p.indirizzo, p.indirizzo.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''));
    m2.push('• ' + esc(p.piattaforma) + ': ' + dove + ' · ' + esc(taglia(p.seguito, 60)) + ' · ultimo post: ' + esc(taglia(p.ultimo_post, 60)) + ' (sicurezza ' + esc(p.sicurezza) + ')');
  }
} else if (rs.testo) {
  m2.push(esc(taglia(rs.testo, 900)));
} else {
  m2.push('• ' + esc(rs.errore ? 'Ricerca non riuscita: ' + taglia(rs.errore, 200) : 'Nessun profilo trovato.'));
}
if (scheda && Array.isArray(scheda.altre_piattaforme) && scheda.altre_piattaforme.length) {
  m2.push('');
  m2.push('<b>Altre piattaforme</b>');
  for (const x of lista(scheda.altre_piattaforme, 5)) m2.push('• ' + esc(x));
}
const fotoRighe = [];
if (scheda && scheda.dalla_foto) fotoRighe.push(taglia(scheda.dalla_foto, 250));
else if (l.vetrina) fotoRighe.push('Insegna ' + (l.insegna || 'non valutata') + '. ' + taglia(l.vetrina, 200));
if (l.segni_online && l.segni_online.length) fotoRighe.push('Sulla vetrina: ' + taglia(l.segni_online.join(', '), 200));
if (fotoRighe.length) {
  m2.push('');
  m2.push('<b>Dalla foto</b>');
  for (const x of fotoRighe) m2.push('• ' + esc(x));
}
if (scheda && Array.isArray(scheda.da_verificare) && scheda.da_verificare.length) {
  m2.push('');
  m2.push('❓ <b>Da verificare a voce</b>');
  for (const x of lista(scheda.da_verificare, 5)) m2.push('• ' + esc(x));
}
const quando = $now.setLocale('it').toFormat('dd/LL/yyyy HH:mm');
const quante = (n, uno, tanti) => n + ' ' + (n === 1 ? uno : tanti);
const piede =
  '<i>Analisi del ' + quando + ' per ' + esc(d.mittente || '') + ' · ' + quante(rs.ricerche_web || 0, 'ricerca web', 'ricerche web') + ' · ' +
  quante(rs.fonti ? rs.fonti.length : 0, 'fonte', 'fonti') + ' · costo stimato ' + numero(costo, 2) + ' $</i>';
const messaggio2 = componi(m2.concat(['', piede]), 4000);

// ---------- riga per il foglio «Prospetti» ----------
const profilo = (nomePiattaforma) => {
  if (!scheda || !scheda.social) return '';
  const p = (scheda.social.profili || []).find((x) => String(x.piattaforma).toLowerCase().includes(nomePiattaforma));
  return p ? p.indirizzo : '';
};
const riga = {
  Data: quando,
  Negozio: nome,
  Tipo: tipo,
  Indirizzo: g.indirizzo || [l.indirizzo, d.ricerca && d.ricerca.citta].filter(Boolean).join(', '),
  Telefono: g.telefono || l.telefono || '',
  'Voto totale': voti.totale,
  'Voto Google': voti.google,
  'Voto sito': voti.sito,
  'Voto social': voti.social === null ? '' : voti.social,
  Stelle: g.stelle === null || g.stelle === undefined ? '' : g.stelle,
  Recensioni: g.recensioni || 0,
  Sito: s.url || '',
  Instagram: profilo('instagram'),
  Facebook: profilo('facebook'),
  TikTok: profilo('tiktok'),
  'Scheda Maps': g.maps_url || '',
  Proposte: proposte.map((p) => p.servizio + ': ' + p.cosa).join(' | '),
  Rompighiaccio: (scheda && scheda.rompighiaccio) || '',
  'Inviato da': d.mittente || '',
  'Costo stimato $': Math.round(costo * 100) / 100,
};

return [
  {
    json: {
      chat_id: d.chat_id,
      messaggio_1: messaggio1,
      messaggio_2: messaggio2,
      voti,
      costo_usd: costo,
      scheda_claude: scheda,
      errore_scheda: esito.errore || '',
      riga,
    },
  },
];
