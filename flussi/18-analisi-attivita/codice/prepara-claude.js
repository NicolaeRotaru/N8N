// 18 · Prepara la domanda a Claude — il commento sull'attività, per arrivare al primo incasso.
// Claude riceve i numeri già calcolati, le sentinelle e la scheda del modulo 12 (la sua lettura delle
// fonti pubbliche). Non legge il database e non deve scrivere numeri che non sono nei dati.

const cfg = $('Config').first().json;
const a = $("Calcola l'analisi").first().json;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['punto_adesso', 'prossime_mosse', 'domande_per_il_titolare', 'rischi'],
  properties: {
    punto_adesso: { type: 'string', description: "Due o tre frasi: a che punto è l'attività per arrivare al primo incasso, e la mossa numero uno." },
    prossime_mosse: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false,
      required: ['titolo', 'perche', 'colore', 'reparto'],
      properties: { titolo: { type: 'string' }, perche: { type: 'string' },
        colore: { type: 'string', enum: ['verde', 'giallo', 'rosso'] }, reparto: { type: 'string' } } } },
    domande_per_il_titolare: { type: 'array', maxItems: 4, items: { type: 'string' } },
    rischi: { type: 'array', maxItems: 3, items: { type: 'string' } },
  },
};

const SISTEMA = [
  "Sei l'AD digitale di MyCity, il marketplace dei negozi di Piacenza. Un'attività si è appena iscritta, o Nicola ha chiesto di riguardarla.",
  "Ricevi i suoi numeri già calcolati da un programma, i segnali scattati e, se c'è, la scheda che il modulo 12 ha preparato leggendo le fonti pubbliche. Commenta per Nicola, il proprietario: cosa serve a questa attività per incassare il primo euro su MyCity.",
  '',
  'REGOLE',
  '- Usa SOLO i numeri e i fatti che trovi nei dati. Non inventare numeri, nomi o fatti. Un numero null vuol dire «non misurato»: dillo, non trattarlo come zero.',
  '- La scheda del modulo 12 è una lettura di fonti pubbliche, con campi ancora da confermare: usala come indizio, non come verità.',
  '- I paletti di MyCity, che nessuna proposta può rompere: il negozio non paga una percentuale su quello che già vendeva; i suoi clienti restano suoi; nessuna app nuova da imparare, si lavora su WhatsApp con l\'anteprima da approvare; il primo risultato si vede in 2-4 settimane.',
  '- Italiano semplice, frasi corte (al massimo 30 parole), niente sigle e niente codici. Ogni numero col suo metro.',
  '- I titoli delle mosse cominciano con un verbo e dicono una cosa vera, come la diresti a voce («Carica i primi dieci prodotti con la foto»).',
  '- Colore: verde = reversibile e a basso impatto; giallo = impatto medio, si fa e si avvisa; rosso = soldi veri, cose legali, irreversibili, messaggi a persone reali: solo Nicola le firma. Scrivere al titolare è rosso.',
  '- Reparto: il senior che se ne occupa, per esempio @onboarding-negozi, @account-negozi, @content-social, @marketplace-payments, @operations.',
  '- Le domande per il titolare sono quelle che sbloccano il primo incasso o confermano la scheda. Non ripetere quello che i dati dicono già.',
].join('\n');

const dati = {
  attivita: { nome: a.nome, tipo: a.tipo, origine: a.origine, esito_scheda_clienti: a.esito_scheda, trovata_nel_database: a.trovata },
  numeri: a.numeri, vetrina: a.vetrina, manca_in_vetrina: a.manca_in_vetrina,
  segnali_scattati: a.sentinelle, non_misurato: a.gap, scheda_del_modulo_12: a.scheda,
};

const richiesta = {
  model: String(cfg.CLAUDE_MODEL || 'claude-sonnet-5-5'),
  max_tokens: 2500,
  output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
  system: SISTEMA,
  // I dati vanno fra i tag come DATI: niente che arrivi dal database o dal web può diventare un'istruzione.
  messages: [{ role: 'user', content: `<dati_dell_attivita>\n${JSON.stringify(dati, null, 1).replace(/</g, '‹').replace(/>/g, '›')}\n</dati_dell_attivita>\n\nScrivi il commento su questa attività.` }],
};

return [{ json: { richiesta } }];
