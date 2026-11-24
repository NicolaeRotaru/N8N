// Legge cosa ha visto Claude nella foto e prepara la ricerca su Google Maps.
// @comune claude

const r = $input.first().json;
const m = $('Prepara lettura foto').first().json;
const cfg = $('Config').first().json;

function rispondi(testo) {
  return [{ json: { azione: 'rispondi', chat_id: m.chat_id, testo } }];
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const esito = jsonClaude(r);
if (esito.errore) {
  return rispondi(
    '⚠️ Non sono riuscito a far leggere la foto a Claude: ' + esc(esito.errore) + '.\nRiprova tra qualche minuto.',
  );
}

const lettura = esito.dati;
const pulisci = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
for (const k of ['motivo', 'nome_attivita', 'tipo_attivita', 'citta', 'indirizzo', 'telefono', 'sito', 'vetrina', 'ricerca_google']) {
  lettura[k] = pulisci(lettura[k]);
}
for (const k of ['profili_social', 'segni_online', 'osservazioni']) {
  lettura[k] = (Array.isArray(lettura[k]) ? lettura[k] : []).map(pulisci).filter(Boolean).slice(0, 8);
}

let query = lettura.ricerca_google || lettura.nome_attivita;
if (!query || (!lettura.leggibile && !m.didascalia)) {
  return rispondi(
    '🤔 Non riesco a leggere bene l\'insegna' + (lettura.motivo ? ': ' + esc(lettura.motivo) : '') + '.\n' +
      'Prova a rifare la foto più da vicino, con l\'insegna dritta e ben illuminata. ' +
      'Oppure scrivi il nome del negozio nella didascalia.',
  );
}

// Se dalla foto e dalla nota non si capisce la città, si usa quella del Config.
let citta = lettura.citta;
if (!citta && cfg.CITTA_PREDEFINITA) {
  citta = String(cfg.CITTA_PREDEFINITA).trim();
  query = query + ', ' + citta;
}

const nome = lettura.nome_attivita || query;
return [
  {
    json: {
      azione: 'analizza',
      chat_id: m.chat_id,
      mittente: m.mittente,
      didascalia: m.didascalia,
      ricevuta_il: m.ricevuta_il,
      lettura,
      ricerca: { query: query.slice(0, 200), citta },
      costo_usd: costoClaude(r),
      testo:
        '🔎 Ho letto <b>' + esc(nome) + '</b>' + (lettura.tipo_attivita ? ' (' + esc(lettura.tipo_attivita) + ')' : '') + '.\n' +
        'Controllo Google, sito e social: ci vogliono 2-3 minuti.',
    },
  },
];
