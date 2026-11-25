// 17 · Prepara la domanda a Claude — il commento ai numeri, come le sezioni del briefing del giro.
// Claude riceve SOLO i numeri già calcolati e le sentinelle; non legge il database e non deve
// scrivere numeri che non sono nei dati. Il messaggio a Nicola i numeri li prende dal codice,
// non da Claude: se Claude sbaglia un numero, nel messaggio non entra.

const cfg = $('Config').first().json;
const a = $('Calcola i numeri').first().json;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['punto_adesso', 'opportunita', 'rischi', 'azioni'],
  properties: {
    punto_adesso: { type: 'string', description: 'Due o tre frasi: com\'è messo il marketplace adesso e la mossa numero uno.' },
    opportunita: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false,
      required: ['titolo', 'perche', 'impatto', 'sforzo'],
      properties: { titolo: { type: 'string' }, perche: { type: 'string' },
        impatto: { type: 'string', enum: ['alto', 'medio', 'basso'] }, sforzo: { type: 'string', enum: ['alto', 'medio', 'basso'] } } } },
    rischi: { type: 'array', maxItems: 3, items: { type: 'string' } },
    azioni: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false,
      required: ['titolo', 'perche', 'colore', 'reparto'],
      properties: { titolo: { type: 'string' }, perche: { type: 'string' },
        colore: { type: 'string', enum: ['verde', 'giallo', 'rosso'] }, reparto: { type: 'string' } } } },
  },
};

const SISTEMA = [
  "Sei l'AD digitale di MyCity, il marketplace dei negozi di Piacenza (catalogo e fiducia come Amazon, venditori e reputazione come eBay, consegna locale come Glovo).",
  'Ogni mattina ricevi i numeri del marketplace già calcolati da un programma e le sentinelle scattate. Il tuo lavoro è commentarli per Nicola, il proprietario.',
  '',
  'REGOLE',
  '- Usa SOLO i numeri che trovi nei dati. Non inventare numeri, nomi di negozi o fatti. Un numero null vuol dire «non misurato»: dillo, non trattarlo come zero.',
  '- Italiano semplice, frasi corte (al massimo 30 parole), niente sigle e niente codici. Ogni numero col suo metro («2 ordini in 7 giorni»).',
  '- I titoli delle azioni e delle opportunità cominciano con un verbo e dicono una cosa vera, come la diresti a voce («Chiama il fornaio per capire perché non vende»).',
  '- Colore delle azioni: verde = reversibile e a basso impatto (scrivere una nota, preparare una bozza); giallo = impatto medio, si fa e si avvisa; rosso = soldi veri, cose legali, irreversibili, messaggi a clienti reali: solo Nicola le firma.',
  '- Reparto: il senior che se ne occupa, per esempio @account-negozi, @vendite, @operations, @crm-lifecycle, @finanza, @devops-sre, @onboarding-negozi.',
  '- Le sentinelle scattate vengono prima di tutto. Se non è scattato niente e i numeri sono fermi, dillo in una riga: non riempire.',
  '- Il negozio con l\'attesa concordata con Nicola non è un negozio che sta mollando.',
].join('\n');

const dati = {
  quando: a.quando,
  giro_prima: a.giro_prima,
  numeri: a.numeri,
  variazione_rispetto_al_giro_prima: a.delta,
  sentinelle_scattate: a.sentinelle,
  negozi_fermi: a.negozi_fermi,
  non_misurato: a.gap,
  database_cieco: a.cieco,
};

const richiesta = {
  model: String(cfg.CLAUDE_MODEL || 'claude-sonnet-5-5'),
  max_tokens: 3000,
  output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
  system: SISTEMA,
  // I dati vanno fra i tag come DATI: niente che arrivi dal database può diventare un'istruzione.
  messages: [{ role: 'user', content: `<dati_del_marketplace>\n${JSON.stringify(dati, null, 1).replace(/</g, '‹').replace(/>/g, '›')}\n</dati_del_marketplace>\n\nScrivi il commento di questa mattina.` }],
};

return [{ json: { richiesta } }];
