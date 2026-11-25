// Telegram: l'officina apre un argomento (forum topic) in un gruppo, per conto di n8n.
//
// Perché sta qui (Nicola, 25/11/2026: «1 Officina»): per aprire un argomento serve la chiamata
// createForumTopic con la chiave del bot nell'indirizzo, e la richiesta HTTP di n8n non sa usare la
// credenziale del bot (provato il 25/11: Telegram risponde «Not Found»). La chiave sta nella variabile
// TELEGRAM_BOT_TOKEN dell'officina, che non è raggiungibile da fuori: n8n chiede l'argomento con la
// chiave dell'officina e non vede mai quella del bot.
//
// Regole: la chiave del bot non esce mai, né nelle risposte né nei log; si accettano solo i gruppi
// grandi di Telegram (supergruppi, il numero comincia con -100), gli unici che hanno gli argomenti.
import { errore, nonValido } from './errori.js';

const ATTESA_MS = 15_000;
// Telegram vuole un nome da 1 a 128 caratteri.
const NOME_MAX = 128;

export function controllaRichiesta(corpo) {
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  const chat = String(c.chat_id ?? '').trim();
  if (!/^-100\d{5,}$/.test(chat)) {
    throw nonValido('chat_non_valida', 'Il gruppo non va bene: serve il numero di un gruppo con gli argomenti, che comincia con -100.');
  }
  const nome = Array.from(String(c.nome ?? '').replace(/\s+/g, ' ').trim()).slice(0, NOME_MAX).join('');
  if (!nome) throw nonValido('nome_mancante', "Manca il nome dell'argomento.");
  return { chat, nome };
}

/** Apre l'argomento e restituisce { message_thread_id, nome }. */
export async function apriArgomento(corpo, cfg, fetchFn = fetch) {
  if (!cfg.telegramToken) {
    throw errore(503, 'telegram_non_configurato', "L'officina non ha la chiave del bot: manca la variabile TELEGRAM_BOT_TOKEN.");
  }
  const { chat, nome } = controllaRichiesta(corpo);
  let risposta;
  try {
    risposta = await fetchFn(`${cfg.telegramApi}/bot${cfg.telegramToken}/createForumTopic`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, name: nome }),
      signal: AbortSignal.timeout(ATTESA_MS),
    });
  } catch {
    // L'errore di rete può contenere l'indirizzo, cioè la chiave: non si riporta.
    throw errore(502, 'telegram_non_raggiungibile', 'Telegram non ha risposto. Riprova fra poco.');
  }
  let dati = null;
  try {
    dati = await risposta.json();
  } catch {
    dati = null;
  }
  if (!risposta.ok || !dati || dati.ok !== true || !dati.result || !Number.isInteger(dati.result.message_thread_id)) {
    const motivo = dati && typeof dati.description === 'string' ? dati.description.split(cfg.telegramToken).join('…').slice(0, 200) : `risposta ${risposta.status}`;
    throw errore(502, 'telegram_rifiutato', `Telegram non ha aperto l'argomento: ${motivo}`);
  }
  return { message_thread_id: dati.result.message_thread_id, nome: typeof dati.result.name === 'string' ? dati.result.name : nome };
}
