// Controlla la foto scaricata da Telegram e prepara la richiesta a Claude per leggerla:
// nome, tipo di attività, contatti e segni di presenza online.
const scaricata = $input.first();
const m = $('Controlla messaggio').first().json;
const cfg = $('Config').first().json;

function rispondi(testo) {
  return [{ json: { azione: 'rispondi', chat_id: m.chat_id, testo } }];
}

if (!scaricata.binary || !scaricata.binary.data) {
  return rispondi('Non sono riuscito a scaricare la foto da Telegram. Riprova a mandarla tra un momento.');
}
const buffer = await this.helpers.getBinaryDataBuffer(0, 'data');
if (buffer.length > 4.5 * 1024 * 1024) {
  return rispondi('La foto è troppo pesante. Mandala come <b>foto normale</b> (non come file), così Telegram la alleggerisce.');
}
function tipoImmagine(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length > 6 && b.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  return null;
}
const mediaType = tipoImmagine(buffer);
if (!mediaType) {
  return rispondi(
    'Non riesco ad aprire questo formato di foto (forse HEIC dell\'iPhone). Mandala come <b>foto normale</b>, non come file.',
  );
}

const SISTEMA = `Sei l'assistente di SDG, un'agenzia di marketing (siti, social, foto e video).
Un collega ha fotografato un negozio dalla strada. Leggi la foto con attenzione e riporta solo quello che si vede davvero.

Cosa ci serve:
- nome dell'attività, scritto come sull'insegna;
- tipo di attività (per esempio pasticceria, parrucchiere, ferramenta, ristorante);
- città e indirizzo, se si leggono sulla foto o nella nota del collega;
- contatti scritti: telefono, sito, profili social;
- segni di presenza online: adesivi (Google, TripAdvisor, TheFork, Glovo, Deliveroo, Just Eat, Satispay...), QR code, nomi di profili;
- com'è la vetrina vista da un'agenzia: insegna, ordine, luce, orari esposti.

Regole:
- Non inventare. Se un dato non si vede, lascia la stringa vuota o la lista vuota.
- Se il nome non si legge con sicurezza, metti "leggibile" a false e spiega perché in "motivo".
  Se però il collega ha scritto il nome nella nota, usalo e metti "leggibile" a true.
- "ricerca_google" è la frase migliore da cercare su Google Maps per trovare questo negozio:
  nome + tipo di attività + via e città se le conosci (dalla foto o dalla nota).
- "osservazioni": al massimo 3 note brevi utili a un'agenzia (per esempio «orari scritti a mano», «insegna sbiadita», «logo diverso tra insegna e tenda»).`;

const nota = m.didascalia
  ? `Nota del collega (può contenere città, via o nome del negozio): «${m.didascalia}»`
  : 'Il collega non ha scritto note.';

const testo = (descrizione) => ({ type: 'string', description: descrizione });
const lista = (descrizione) => ({ type: 'array', items: { type: 'string' }, description: descrizione });

const schema = {
  type: 'object',
  properties: {
    leggibile: { type: 'boolean', description: 'true se il nome dell\'attività si legge con sicurezza' },
    motivo: testo('Se non leggibile: perché (foto mossa, insegna coperta...). Altrimenti stringa vuota'),
    nome_attivita: testo('Nome come scritto sull\'insegna'),
    tipo_attivita: testo('Tipo di attività, in italiano, minuscolo'),
    citta: testo('Città o paese, se si legge sulla foto o nella nota. Altrimenti stringa vuota'),
    indirizzo: testo('Via e numero, se si leggono. Altrimenti stringa vuota'),
    telefono: testo('Telefono scritto sulla vetrina o sull\'insegna'),
    sito: testo('Indirizzo del sito scritto sulla vetrina'),
    profili_social: lista('Nomi o indirizzi di profili social scritti o su adesivi'),
    segni_online: lista('Adesivi, QR code, loghi di piattaforme visibili'),
    insegna: {
      type: 'string',
      enum: ['curata', 'datata o rovinata', 'assente o illeggibile', 'non si vede'],
    },
    vetrina: testo('Una frase su vetrina, luce e ordine, vista da un\'agenzia'),
    osservazioni: lista('Al massimo 3 note brevi utili a un\'agenzia'),
    ricerca_google: testo('Frase da cercare su Google Maps per trovare questo negozio'),
  },
  required: [
    'leggibile', 'motivo', 'nome_attivita', 'tipo_attivita', 'citta', 'indirizzo', 'telefono', 'sito',
    'profili_social', 'segni_online', 'insegna', 'vetrina', 'osservazioni', 'ricerca_google',
  ],
  additionalProperties: false,
};

const richiesta = {
  model: cfg.CLAUDE_MODELLO || 'claude-opus-5-5',
  max_tokens: 16000,
  // Se il modello rifiuta per un filtro di sicurezza, l'API riprova da sola con un modello di riserva.
  fallbacks: 'default',
  output_config: {
    effort: cfg.CLAUDE_EFFORT || 'medium',
    format: { type: 'json_schema', schema },
  },
  system: SISTEMA,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
        { type: 'text', text: nota },
      ],
    },
  ],
};

return [
  {
    json: {
      azione: 'analizza',
      chat_id: m.chat_id,
      mittente: m.mittente,
      didascalia: m.didascalia,
      ricevuta_il: m.ricevuta_il,
      richiesta,
    },
  },
];
