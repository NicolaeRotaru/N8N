// Analizza il sito (la home scaricata e la misura di Google PageSpeed) e gli dà un voto da 0 a 10.
// Se il negozio non ha un sito suo, lo scrive e basta.
const base = $('Scegli scheda Google').first().json;
const ANNO = new Date().getFullYear();

const sito = {
  tipo: base.sito_tipo, // proprio | social | nessuno
  url: base.sito_url,
  fonte: base.sito_fonte,
  piattaforma: base.sito_piattaforma,
  voto: 0,
  dettaglio_voto: [],
};

function uscita() {
  const o = Object.assign({}, base);
  delete o.sito_url;
  delete o.sito_tipo;
  delete o.sito_piattaforma;
  delete o.sito_fonte;
  o.sito = sito;
  return [{ json: o }];
}

if (sito.tipo !== 'proprio') return uscita();

const scaricata = $('Sito: scarica la home').isExecuted ? $('Sito: scarica la home').first().json : null;
const misura = $('Sito: misura velocità').isExecuted ? $('Sito: misura velocità').first().json : null;

// ---------- la home ----------
function messaggioErrore(e) {
  if (!e) return '';
  if (typeof e === 'string') return e.slice(0, 200);
  return String([e.message, e.description].filter(Boolean).join(' — ') || 'errore').slice(0, 200);
}

let html = '';
sito.stato_http = null;
sito.errore_home = '';
if (scaricata) {
  if (scaricata.error) {
    sito.errore_home = messaggioErrore(scaricata.error);
  } else {
    sito.stato_http = scaricata.statusCode || null;
    const corpo = scaricata.body !== undefined ? scaricata.body : scaricata.data;
    if (typeof corpo === 'string') html = corpo;
    if (sito.stato_http && sito.stato_http >= 400) {
      sito.errore_home = 'il sito risponde con errore ' + sito.stato_http;
      html = '';
    }
  }
}

function attributi(tag) {
  const o = {};
  const re = /([a-zA-Z_:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(tag))) o[m[1].toLowerCase()] = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5];
  return o;
}
function decodifica(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function analizzaHtml(h) {
  const a = { letta: true };
  a.dimensione_kb = Math.round(h.length / 1024); // circa: caratteri, non byte
  const t = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  a.titolo = t ? decodifica(t[1]).slice(0, 150) : '';
  const meta = {};
  for (const tag of h.match(/<meta\b[^>]*>/gi) || []) {
    const at = attributi(tag);
    const chiave = (at.name || at.property || '').toLowerCase();
    if (chiave && at.content !== undefined && meta[chiave] === undefined) meta[chiave] = at.content;
  }
  a.descrizione = decodifica(meta.description || '').slice(0, 200);
  a.adatto_telefono = /width\s*=\s*device-width/i.test(meta.viewport || '');
  const lingua = h.match(/<html[^>]*\slang\s*=\s*["']?([a-zA-Z-]+)/i);
  a.lingua = lingua ? lingua[1] : '';

  const CMS = [
    [/wp-content|wp-includes/i, 'WordPress'], [/wixstatic\.com|wix\.com/i, 'Wix'], [/cdn\.shopify\.com|myshopify\.com/i, 'Shopify'],
    [/squarespace/i, 'Squarespace'], [/jimdo/i, 'Jimdo'], [/webnode/i, 'Webnode'], [/img1\.wsimg\.com/i, 'GoDaddy'],
    [/weebly/i, 'Weebly'], [/site123/i, 'SITE123'], [/\/media\/jui\/|joomla/i, 'Joomla'], [/prestashop/i, 'PrestaShop'],
    [/webflow/i, 'Webflow'], [/framerusercontent|framer\.com/i, 'Framer'], [/aruba|sitebuilder/i, 'costruttore di siti dell\'hosting'],
  ];
  a.fatto_con = '';
  if (meta.generator) a.fatto_con = decodifica(meta.generator).split(/[;,]/)[0].slice(0, 40);
  if (!a.fatto_con) for (const [re, nome] of CMS) if (re.test(h)) { a.fatto_con = nome; break; }

  const link = [];
  const reHref = /href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = reHref.exec(h))) link.push(decodifica(m[1]));
  const social = {};
  const aggiungi = (dove, valore) => {
    social[dove] = social[dove] || [];
    if (!social[dove].includes(valore) && social[dove].length < 3) social[dove].push(valore);
  };
  for (const l of link) {
    let x;
    if ((x = l.match(/instagram\.com\/([A-Za-z0-9_.]{2,30})/i)) && !/^(p|reel|reels|explore|accounts|stories|tv)$/i.test(x[1])) aggiungi('instagram', 'https://www.instagram.com/' + x[1]);
    else if ((x = l.match(/facebook\.com\/([^?#"']+)/i)) && !/^(sharer|share|plugins|tr|dialog|login|events\/?$)/i.test(x[1])) aggiungi('facebook', 'https://www.facebook.com/' + x[1].replace(/\/$/, ''));
    else if ((x = l.match(/tiktok\.com\/(@[A-Za-z0-9_.]{2,30})/i))) aggiungi('tiktok', 'https://www.tiktok.com/' + x[1]);
    else if ((x = l.match(/youtube\.com\/((?:@|channel\/|c\/|user\/)[^?#"'/]+)/i))) aggiungi('youtube', 'https://www.youtube.com/' + x[1]);
    else if ((x = l.match(/linkedin\.com\/((?:company|in)\/[^?#"'/]+)/i))) aggiungi('linkedin', 'https://www.linkedin.com/' + x[1]);
  }
  a.social = social;
  a.whatsapp = link.some((l) => /wa\.me\/|api\.whatsapp\.com|whatsapp:\/\//i.test(l));
  a.telefono_cliccabile = link.some((l) => /^tel:/i.test(l));
  a.email_cliccabile = link.some((l) => /^mailto:/i.test(l));
  a.privacy = link.some((l) => /privacy/i.test(l));

  const PRENOTA = [
    [/thefork\.|lafourchette/i, 'TheFork'], [/quandoo/i, 'Quandoo'], [/opentable/i, 'OpenTable'], [/treatwell/i, 'Treatwell'],
    [/fresha\.com/i, 'Fresha'], [/uala\./i, 'Uala'], [/booksy/i, 'Booksy'], [/glovoapp/i, 'Glovo'], [/deliveroo/i, 'Deliveroo'],
    [/justeat|just-eat/i, 'Just Eat'], [/calendly/i, 'Calendly'], [/booking\.com/i, 'Booking'], [/plateform|prenota/i, 'pagina prenotazioni'],
  ];
  a.prenotazioni = [];
  for (const [re, nome] of PRENOTA) if (link.some((l) => re.test(l)) && !a.prenotazioni.includes(nome)) a.prenotazioni.push(nome);
  a.negozio_online = /woocommerce|cdn\.shopify\.com|prestashop|add[-_]to[-_]cart|aggiungi al carrello/i.test(h);

  const testo = decodifica(
    h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '),
  );
  const piva = testo.match(/(?:p\.?\s*iva|partita\s+iva|vat(?:\s+number)?|p\.\s*i\.)[^0-9]{0,25}(?:it\s*)?(\d{11})/i) || testo.match(/\bIT\s?(\d{11})\b/);
  a.partita_iva = piva ? piva[1] : '';
  let annoMax = null;
  const reAnno = /(?:©|copyright)[^0-9]{0,40}((?:19|20)\d{2})(?:\s*[-–—/]\s*((?:19|20)\d{2}))?/gi;
  while ((m = reAnno.exec(testo))) {
    for (const y of [m[1], m[2]]) if (y && Number(y) <= ANNO + 1) annoMax = Math.max(annoMax || 0, Number(y));
  }
  a.anno_copyright = annoMax;

  a.statistiche_google = /googletagmanager\.com|google-analytics\.com|gtag\(|GTM-[A-Z0-9]{4,}/.test(h);
  a.pixel_meta = /connect\.facebook\.net\/[^"']*fbevents|fbq\(\s*['"]init/.test(h);
  const COOKIE = [
    [/iubenda/i, 'iubenda'], [/cookiebot/i, 'Cookiebot'], [/cookieyes/i, 'CookieYes'], [/complianz/i, 'Complianz'],
    [/onetrust/i, 'OneTrust'], [/cookie-law-info|cookielawinfo/i, 'Cookie Law Info'], [/cookie-notice/i, 'Cookie Notice'],
    [/usercentrics/i, 'Usercentrics'], [/cookiefirst/i, 'CookieFirst'], [/cookie-script/i, 'Cookie-Script'], [/termly/i, 'Termly'],
  ];
  a.banner_cookie = '';
  for (const [re, nome] of COOKIE) if (re.test(h)) { a.banner_cookie = nome; break; }
  a.dati_strutturati = /"@type"\s*:\s*\[?\s*"(LocalBusiness|Restaurant|Store|[A-Za-z]*Shop|[A-Za-z]*Store|Bakery|BeautySalon|HairSalon|CafeOrCoffeeShop|BarOrPub|FoodEstablishment|HealthAndBeautyBusiness|Dentist|AutoRepair|Hotel|LodgingBusiness|ProfessionalService|MedicalBusiness|Pharmacy|Optician)"/.test(h);
  return a;
}

// ---------- PageSpeed ----------
function leggiPageSpeed(ps) {
  if (!ps) return { errore: 'misura non eseguita' };
  if (ps.error) return { errore: messaggioErrore(ps.error) };
  const lr = ps.lighthouseResult;
  if (!lr) return { errore: 'Google PageSpeed non ha dato risultati' };
  if (lr.runtimeError && lr.runtimeError.code && lr.runtimeError.code !== 'NO_ERROR') {
    return { errore: String(lr.runtimeError.message || lr.runtimeError.code).slice(0, 200) };
  }
  const cat = lr.categories || {};
  const pct = (c) => (c && typeof c.score === 'number' ? Math.round(c.score * 100) : null);
  const au = lr.audits || {};
  const dv = (k) => (au[k] && au[k].displayValue ? String(au[k].displayValue) : '');
  return {
    velocita: pct(cat.performance),
    seo: pct(cat.seo),
    accessibilita: pct(cat.accessibility),
    buone_pratiche: pct(cat['best-practices']),
    caricamento: dv('largest-contentful-paint'),
    primo_contenuto: dv('first-contentful-paint'),
    url_finale: lr.finalDisplayedUrl || lr.finalUrl || '',
    viewport_ok: au.viewport ? au.viewport.score === 1 : null,
    dati_reali: (ps.loadingExperience && ps.loadingExperience.overall_category) || '',
  };
}

const h = html ? analizzaHtml(html) : { letta: false };
const ps = leggiPageSpeed(misura);
Object.assign(sito, { pagina: h, pagespeed: ps });

const raggiungibile = !!html || ps.velocita !== undefined;
sito.raggiungibile = raggiungibile;
if (!raggiungibile) {
  sito.voto = 1;
  sito.dettaglio_voto = [{ voce: 'il sito non si apre', punti: 1, max: 10 }];
  return uscita();
}

let https = null;
if (ps.url_finale) https = /^https:/i.test(ps.url_finale);
else if (html && /^https:/i.test(sito.url)) https = true;
sito.https = https;

const voci = [];
const voce = (nome, punti, max) => voci.push({ voce: nome, punti, max });
const nonLetta = !h.letta;
voce('il sito si apre', 2, 2);
voce('sicuro (https)', https === true ? 1 : https === null ? 0.5 : 0, 1);
const telefono = h.letta ? h.adatto_telefono : ps.viewport_ok;
voce('adatto al telefono', telefono === true ? 1 : telefono === false ? 0 : 0.5, 1);
const vel = typeof ps.velocita === 'number' ? ps.velocita : null;
voce('velocità da telefono', vel === null ? 1 : vel >= 90 ? 2 : vel >= 50 ? 1 : 0, 2);
const seo = typeof ps.seo === 'number' ? ps.seo : null;
voce('base per Google (SEO)', seo === null ? 0.5 : seo >= 90 ? 1 : seo >= 70 ? 0.5 : 0, 1);
voce('titolo e descrizione', nonLetta ? 0.5 : (h.titolo ? 0.5 : 0) + (h.descrizione ? 0.5 : 0), 1);
voce('contatti cliccabili', nonLetta ? 0.25 : h.telefono_cliccabile || h.whatsapp || h.email_cliccabile ? 0.5 : 0, 0.5);
voce('link ai social', nonLetta ? 0.25 : Object.keys(h.social).length ? 0.5 : 0, 0.5);
voce('partita IVA in pagina', nonLetta ? 0.25 : h.partita_iva ? 0.5 : 0, 0.5);
const annoOk = h.anno_copyright === null || h.anno_copyright === undefined ? 0.25 : h.anno_copyright >= ANNO - 1 ? 0.5 : 0;
voce('aggiornato di recente', nonLetta ? 0.25 : annoOk, 0.5);
sito.dettaglio_voto = voci;
sito.voto = Math.min(10, voci.reduce((t, v) => t + v.punti, 0));

return uscita();
