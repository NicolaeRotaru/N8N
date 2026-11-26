// (esecuzione «rivedi») La regia ritoccata da Claude → il contenuto nuovo da rimontare (stesso numero, versione +1).
const J = $('Config').first().json;
const E = J.esito || {};
const G = J.giro || {};
const c = E.contenuto || {};
const R = leggiClaude($input.first().json, (d) => (d.regia && typeof d.regia === 'object') || typeof d.non_posso === 'string');
const nome = h((G.cliente || {}).nome_locale) + ' · ' + h(c.titolo);
if (!R.ok || R.troncata) return [{ json: { ok: false, messaggio: '⚠️ <b>Ritocco non riuscito</b> · ' + nome + '\nAD: ' + h(R.ok ? 'risposta troncata' : R.motivo) + '. La scheda di prima torna qui sotto: approvate quella o scrivete un\'altra correzione.' } }];
const d = R.dati;
if (!d.regia || !Array.isArray(d.regia.battute) || !d.regia.battute.length) return [{ json: { ok: false, messaggio: '⚠️ <b>Ritocco vuoto</b> · ' + nome + '\n' + h(testo(d.non_posso) || 'L\'AD non ha scritto battute.') + '\nLa scheda di prima torna qui sotto.' } }];
const nuovo = { ...c, regia: d.regia };
// giorno e ora nuovi solo se validi e non già passati
const oggi = partiRoma();
const dataNuova = /^\d{4}-\d{2}-\d{2}$/.test(testo(d.data)) ? testo(d.data) : nuovo.data;
const oraNuova = /^\d{2}:\d{2}$/.test(testo(d.ora)) ? testo(d.ora) : nuovo.ora;
let notaData = '';
if (dataNuova + ' ' + oraNuova >= oggi.data + ' ' + oggi.ora) { nuovo.data = dataNuova; nuovo.ora = oraNuova; }
else if (dataNuova !== c.data || oraNuova !== c.ora) notaData = 'Il giorno chiesto (' + dataNuova + ' ' + oraNuova + ') è già passato: ho lasciato quello di prima.';
// i campi calcolati dall'officina si rifanno al nuovo montaggio
for (const k of ['durata', 'pezzi_usati', 'foto_usate', 'motore']) delete nuovo[k];
const cl = G.cliente || {};
return [{ json: {
  ok: true,
  cosa: testo(d.cosa_ho_cambiato),
  non_posso: [testo(d.non_posso), notaData].filter(Boolean).join(' '),
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
  },
} }];
