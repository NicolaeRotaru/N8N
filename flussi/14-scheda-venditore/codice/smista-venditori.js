// 14c · Venditori della scheda · Smista
// Il sito del venditore chiede una di quattro cose: leggi (per entrare), iscrivi, segna (accesso riuscito o
// sbagliato), elenco (le sue schede). La password non arriva mai qui: arriva solo la sua impronta scrypt,
// calcolata dal sito. Il segreto l'ha già controllato «Segreto giusto?».
const b = ($('Dal sito del venditore').first().json || {}).body || {};
const AZIONI = ['leggi', 'iscrivi', 'segna', 'elenco'];
const email = String(b.email || '').trim().toLowerCase();
const no = (motivo) => [{ json: { azione: 'storta', motivo } }];
if (!AZIONI.includes(b.azione)) return no('azione sconosciuta');
if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) return no('email non valida');
if (b.azione === 'iscrivi') {
  const hash = String(b.hash || '');
  if (!/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=_-]{16,}\$[A-Za-z0-9+/=_-]{40,}$/.test(hash) || hash.length > 400) return no('impronta della password storta');
  return [{ json: { azione: 'iscrivi', email, hash, adesso: Date.now() } }];
}
if (b.azione === 'segna') {
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0);
  return [{ json: { azione: 'segna', email, errori: Math.min(n(b.errori), 1000), bloccato_fino: n(b.bloccato_fino), ultimo_accesso: n(b.ultimo_accesso) } }];
}
return [{ json: { azione: b.azione, email } }];
