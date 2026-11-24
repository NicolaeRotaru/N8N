// Controlla il messaggio arrivato su Telegram.
// - Chi non è in CHAT_AUTORIZZATE riceve il proprio codice chat e nient'altro (nessun costo, nessun download).
// - Senza foto: risponde con le istruzioni.
// - Con la foto: sceglie la versione più grande che Claude può leggere (sotto i 4,5 MB) e la fa scaricare.
const cfg = $input.first().json;
const msg = cfg.message || cfg.edited_message || null;

// Aggiornamenti senza chat (per esempio il bot aggiunto a un gruppo): non si risponde.
if (!msg || !msg.chat) return [];

const chatId = msg.chat.id;
const mittente =
  [msg.from && msg.from.first_name, msg.from && msg.from.last_name].filter(Boolean).join(' ') ||
  (msg.from && msg.from.username) ||
  'qualcuno';
const autorizzate = String(cfg.CHAT_AUTORIZZATE || '')
  .split(/[\s,;]+/)
  .map((s) => s.trim())
  .filter(Boolean);

function rispondi(testo) {
  return [{ json: { azione: 'rispondi', chat_id: chatId, testo } }];
}

if (!autorizzate.includes(String(chatId))) {
  return rispondi(
    'Questo bot è riservato all\'agenzia SDG.\n' +
      'Il tuo codice chat è <code>' + chatId + '</code>: chiedi a chi gestisce n8n ' +
      'di aggiungerlo nel nodo Config, alla voce CHAT_AUTORIZZATE.',
  );
}

const ISTRUZIONI =
  '📸 Mandami una <b>foto del negozio</b>, con l\'insegna ben leggibile.\n' +
  'Se vuoi, nella didascalia scrivi la città o la via (per esempio «via Roma, Torino»): ' +
  'mi aiuta a trovare il negozio giusto su Google.\n\n' +
  'In 2-3 minuti ti rispondo con come è messo su Google, sul sito e sui social, e cosa proporgli.';

// Claude accetta immagini fino a 5 MB: si resta sotto i 4,5 MB per sicurezza.
const PESO_MAX = 4.5 * 1024 * 1024;
let fileId = '';
let peso = 0;
if (Array.isArray(msg.photo) && msg.photo.length) {
  // Telegram manda la stessa foto in più misure, dalla più piccola alla più grande.
  const adatte = msg.photo.filter((f) => !f.file_size || f.file_size <= PESO_MAX);
  const scelta = adatte.length ? adatte[adatte.length - 1] : msg.photo[0];
  fileId = scelta.file_id;
  peso = scelta.file_size || 0;
} else if (msg.document && /^image\//i.test(msg.document.mime_type || '')) {
  if (msg.document.file_size && msg.document.file_size > PESO_MAX) {
    return rispondi('La foto è troppo pesante. Mandala come <b>foto normale</b> (non come file), così Telegram la alleggerisce.');
  }
  fileId = msg.document.file_id;
  peso = msg.document.file_size || 0;
} else if (msg.document || msg.video || msg.video_note || msg.animation) {
  return rispondi('Mi serve una <b>foto</b> (non un video o un altro file).\n\n' + ISTRUZIONI);
} else {
  return rispondi(ISTRUZIONI);
}

return [
  {
    json: {
      azione: 'analizza',
      chat_id: chatId,
      mittente,
      didascalia: String(msg.caption || '').trim().slice(0, 300),
      ricevuta_il: new Date((msg.date || Date.now() / 1000) * 1000).toISOString(),
      file_id: fileId,
      peso_dichiarato: peso,
    },
  },
];
