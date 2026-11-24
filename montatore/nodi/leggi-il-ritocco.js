// (esecuzione «rivedi») La regia ritoccata da Claude → il contenuto nuovo da rimontare (stesso numero, versione +1).
const J = $('Config').first().json;
const E = J.esito || {};
const G = J.giro || {};
const c = E.contenuto || {};
const R = leggiClaude($input.first().json);
const nome = h((G.cliente || {}).nome_locale) + ' · ' + h(c.titolo);
if (!R.ok || R.troncata) return [{ json: { ok: false, messaggio: '⚠️ <b>Ritocco non riuscito</b> · ' + nome + '\nClaude: ' + h(R.ok ? 'risposta troncata' : R.motivo) + '. Il contenuto di prima resta su Drive; potete riprovare dal modulo o sistemarlo a mano.' } }];
const d = R.dati;
if (!d.regia || !Array.isArray(d.regia.battute) || !d.regia.battute.length) return [{ json: { ok: false, messaggio: '⚠️ <b>Ritocco vuoto</b> · ' + nome + '\n' + h(testo(d.non_posso) || 'Claude non ha scritto battute.') } }];
const nuovo = { ...c, regia: d.regia };
if (/^\d{4}-\d{2}-\d{2}$/.test(testo(d.data))) nuovo.data = testo(d.data);
if (/^\d{2}:\d{2}$/.test(testo(d.ora))) nuovo.ora = testo(d.ora);
// i campi calcolati dall'officina si rifanno al nuovo montaggio
for (const k of ['durata', 'pezzi_usati', 'foto_usate', 'motore']) delete nuovo[k];
const cl = G.cliente || {};
return [{ json: {
  ok: true,
  cosa: testo(d.cosa_ho_cambiato),
  non_posso: testo(d.non_posso),
  monta: {
    lavoro: 'monta',
    progetto: J.progetto,
    n: E.n,
    di: G.di,
    contenuto: nuovo,
    marchio: cl.marchio,
    marchio_valido: cl.marchio_valido !== false,
    versione: (Number(J.versione) || 1) + 1,
    logo: cl.logo || { tipo: 'nessuno' },
    musica: G.musica,
    cartella_uscita: G.cartella_uscita,
    cliente: { cliente: cl.cliente, nome_locale: cl.nome_locale },
    controllo: G.controllo !== false,
  },
} }];
