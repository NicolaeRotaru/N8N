// 24 · Le fonti di oggi — l'elenco del radar dell'AD (ad-mycity/cervello/radar-fonti.json, senza la
// ricerca Google, che non si scarica da un programma). Le giornaliere ogni giorno, le settimanali il
// lunedì (o sempre, con TUTTE_LE_FONTI = si nel Config). Un elemento per fonte.
const FONTI = __FONTI__;
const cfg = $('Config').first().json;
const tutte = /^(si|sì)$/i.test(String(cfg.TUTTE_LE_FONTI || '').trim());
const giorno = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', weekday: 'short' }).format(new Date());
return FONTI.filter((f) => tutte || f.cadenza === 'giornaliera' || giorno === 'Mon').map((f) => ({ json: f }));
