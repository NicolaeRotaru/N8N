// Prepara la richiesta finale a Claude: la scheda per il collega che sta per entrare nel negozio.
const d = $input.first().json;
const cfg = $('Config').first().json;

const SERVIZI = [
  { servizio: 'Brand & Strategia', cosa: 'posizionamento, logo e identità visiva, tono di voce, naming' },
  { servizio: 'Web & Digital', cosa: 'siti vetrina, e-commerce, landing page, SEO tecnica e locale, manutenzione' },
  { servizio: 'Social & Advertising', cosa: 'gestione social con calendario editoriale, campagne Meta, Google e TikTok, report mensile' },
  { servizio: 'Foto & Video Making', cosa: 'shooting di prodotto e locale, ritratti, spot, reel verticali, video di eventi, drone' },
  { servizio: 'Editing & Post-produzione', cosa: 'montaggio, color grading, grafiche animate, ritocco foto, anche su materiale del cliente' },
];

const SISTEMA = `Sei il consulente commerciale di SDG, agenzia creativa (web, marketing, foto e video).
Un collega è davanti a un negozio e sta per entrare a proporsi. Scrivi per lui una scheda breve e concreta su come il negozio è messo online: scheda Google, sito, social.

Regole:
- Usa solo i dati che ti passo. Non inventare numeri, nomi o profili. Se un dato è incerto, dillo.
- Italiano semplice, frasi brevi, niente gergo (per esempio «interazioni», non «engagement»). Il collega legge dal telefono, per strada.
- I voti di Google e del sito sono già calcolati da regole fisse: non cambiarli, spiega da cosa dipendono con i numeri.
- Il voto dei social lo dai tu, da 0 a 10:
  0 = nessun profilo trovato;
  1-3 = profili presenti ma fermi da più di 3 mesi, o quasi senza seguito;
  4-6 = attivi almeno una volta al mese, seguito modesto;
  7-8 = attivi ogni settimana, buon seguito e interazioni;
  9-10 = eccellenti su più piattaforme.
  Se i dati dei social sono incerti, resta prudente e dillo nel titolo.
- "titolo" di ogni area: una riga sola, con i numeri chiave (per esempio «4,6★ con 212 recensioni, mancano le foto»).
- "punti_forti" e "problemi": al massimo 3 per area, brevi, ognuno con il fatto concreto.
- "proposte": da 1 a 3, in ordine di impatto per il negozio, ognuna legata a uno dei servizi dell'agenzia.
  Dì cosa faremmo e cosa ci guadagna lui (più chiamate da Google Maps, più prenotazioni, più clienti dal quartiere...).
  Proponi solo ciò che i dati giustificano.
- "rompighiaccio": una frase che il collega può dire entrando. Parte da un complimento vero, basato sui dati, e poi accenna a un'opportunità. Mai offensiva verso il lavoro del titolare.
- "da_verificare": cose da chiedere o controllare a voce (chi gestisce i social, se la scheda Google è rivendicata dal titolare, dati incerti).
- "dalla_foto": una frase su insegna e vetrina, solo se c'è qualcosa di utile; altrimenti stringa vuota.`;

const testo = { type: 'string' };
const lista = { type: 'array', items: { type: 'string' } };
const area = {
  type: 'object',
  properties: { titolo: testo, punti_forti: lista, problemi: lista },
  required: ['titolo', 'punti_forti', 'problemi'],
  additionalProperties: false,
};
const schema = {
  type: 'object',
  properties: {
    sintesi: { type: 'string', description: 'Due frasi: com\'è messo online e dove sta l\'opportunità principale' },
    google: area,
    sito: area,
    social: {
      type: 'object',
      properties: {
        voto: { type: 'integer', description: 'Da 0 a 10, secondo la scala data' },
        titolo: testo,
        profili: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              piattaforma: testo,
              indirizzo: { type: 'string', description: 'Indirizzo del profilo, oppure stringa vuota se non trovato' },
              seguito: { type: 'string', description: 'Follower o mi piace, come trovati (es. «circa 1.200 follower»), oppure «non trovato»' },
              ultimo_post: { type: 'string', description: 'Quando ha pubblicato l\'ultima volta, oppure «non trovato»' },
              sicurezza: { type: 'string', enum: ['alta', 'media', 'bassa'] },
            },
            required: ['piattaforma', 'indirizzo', 'seguito', 'ultimo_post', 'sicurezza'],
            additionalProperties: false,
          },
        },
        problemi: lista,
      },
      required: ['voto', 'titolo', 'profili', 'problemi'],
      additionalProperties: false,
    },
    altre_piattaforme: { type: 'array', items: { type: 'string' }, description: 'Es. «TripAdvisor: 4,5 su 80 recensioni»' },
    dalla_foto: testo,
    proposte: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          servizio: { type: 'string', enum: SERVIZI.map((s) => s.servizio) },
          cosa: testo,
          perche: testo,
        },
        required: ['servizio', 'cosa', 'perche'],
        additionalProperties: false,
      },
    },
    rompighiaccio: testo,
    da_verificare: lista,
  },
  required: ['sintesi', 'google', 'sito', 'social', 'altre_piattaforme', 'dalla_foto', 'proposte', 'rompighiaccio', 'da_verificare'],
  additionalProperties: false,
};

// Si tolgono i campi lunghi che a Claude non servono.
const google = Object.assign({}, d.google);
const sito = JSON.parse(JSON.stringify(d.sito || {}));
const dati = {
  oggi: new Date().toISOString().slice(0, 10),
  servizi_agenzia: SERVIZI,
  dalla_foto: d.lettura,
  nota_del_collega: d.didascalia || '',
  scheda_google: google,
  sito,
  ricerca_social: d.ricerca_social,
};

const richiesta = {
  model: cfg.CLAUDE_MODELLO || 'claude-opus-5-5',
  max_tokens: 16000,
  fallbacks: 'default',
  output_config: {
    effort: cfg.CLAUDE_EFFORT || 'medium',
    format: { type: 'json_schema', schema },
  },
  system: SISTEMA,
  messages: [{ role: 'user', content: 'Dati raccolti (JSON):\n' + JSON.stringify(dati, null, 1) }],
};

return [{ json: Object.assign({}, d, { richiesta_scheda: richiesta }) }];
