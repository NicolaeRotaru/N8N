// 97 · Raccogli i messaggi — chi chiama (l'analisi, le bozze…) manda uno o più messaggi della STESSA attività,
// una voce per messaggio: { id, nome, messaggio }. Qui si mettono insieme e si decide dove vanno.
// Con il gruppo «Attività» collegato nel Config (CHAT_ATTIVITA) vanno nell'argomento del negozio;
// senza, vanno nella chat privata di Nicola, come prima: finché il gruppo non c'è non si perde niente.
const cfg = $('Config').first().json;
const testo = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const voci = $('Da un altro flusso').all().map((i) => i.json || {});
const primo = voci.find((v) => testo(v.id)) || voci[0] || {};
const id = testo(primo.id).toLowerCase();
const valido = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
// Telegram vuole il nome di un argomento fra 1 e 128 caratteri.
const nome = Array.from(testo(primo.nome).replace(/\s+/g, ' ')).slice(0, 128).join('') || 'Attività senza nome';
const messaggi = voci.map((v) => testo(v.messaggio)).filter(Boolean);
const gruppo = testo(cfg.CHAT_ATTIVITA);
return [{ json: {
  id, nome, messaggi, gruppo, privata: testo(cfg.TELEGRAM_CHAT_ID),
  // L'argomento serve un gruppo grande di Telegram (il numero comincia con -100) e un'attività vera.
  conGruppo: /^-100\d{5,}$/.test(gruppo) && valido,
} }];
