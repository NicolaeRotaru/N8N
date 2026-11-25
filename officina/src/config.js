// Configurazione dell'officina: tutto arriva dalle variabili d'ambiente (mai segreti nel codice).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VERSIONE = JSON.parse(readFileSync(path.join(RADICE, 'package.json'), 'utf8')).version;

const MB = 1024 * 1024;

function intero(valore, predefinito) {
  const n = Number.parseInt(valore ?? '', 10);
  return Number.isFinite(n) ? n : predefinito;
}

function numero(valore, predefinito) {
  const n = Number.parseFloat(valore ?? '');
  return Number.isFinite(n) ? n : predefinito;
}

export function leggiConfig(env = process.env) {
  return {
    porta: intero(env.PORT, 8080),
    host: env.HOST || '0.0.0.0',
    chiave: env.OFFICINA_CHIAVE || '',
    datiDir: path.resolve(env.DATI_DIR || '/dati'),
    // Font di riserva inclusi nell'immagine (Inter e Playfair Display, licenza OFL).
    fontRiservaDir: path.resolve(env.FONT_RISERVA_DIR || path.join(RADICE, 'font')),
    // Download dei Google Font al primo uso. FONT_RETE=no lo spegne (si usano solo i font di riserva).
    fontRete: (env.FONT_RETE || 'si') !== 'no',
    fontCssUrl: env.FONT_CSS_URL || 'https://fonts.googleapis.com/css2',
    fontHostAmmessi: (env.FONT_HOST_AMMESSI || 'fonts.gstatic.com').split(',').map((h) => h.trim()).filter(Boolean),
    ffmpeg: env.FFMPEG_BIN || 'ffmpeg',
    ffprobe: env.FFPROBE_BIN || 'ffprobe',
    whisperBin: env.WHISPER_BIN || '/opt/whisper/whisper-cli',
    whisperModello: env.WHISPER_MODELLO || '/opt/whisper/ggml-small.bin',
    whisperVad: env.WHISPER_VAD || '/opt/whisper/ggml-silero-v5.1.2.bin',
    // Programma che trova le zone di parlato (silero): serve a stringere i tempi dei sottotitoli.
    whisperVadBin: env.WHISPER_VAD_BIN || '/opt/whisper/whisper-vad-speech-segments',
    // Allineamento parola per parola di whisper (-dtw): vuoto = si legge dal modello; «no» = spento; «small»… = imposto.
    whisperDtw: env.WHISPER_DTW || '',
    threadFfmpeg: intero(env.FFMPEG_THREADS, 2),
    threadWhisper: intero(env.WHISPER_THREADS, 2),
    durataFileMs: numero(env.FILE_DURATA_ORE, 24) * 3600 * 1000,
    puliziaOgniMs: numero(env.PULIZIA_OGNI_SEC, 600) * 1000,
    maxAttesa: intero(env.CODA_MAX_ATTESA, 5),
    maxFileByte: numero(env.MAX_FILE_MB, 300) * MB,
    maxTotaleByte: numero(env.MAX_TOTALE_MB, 800) * MB,
    urlBase: (env.URL_BASE || '').replace(/\/+$/, ''),
    timeoutProcessoMs: numero(env.TIMEOUT_PROCESSO_MIN, 20) * 60 * 1000,
    livelloLog: env.LOG_LEVEL || 'info',
    // La chiave del bot Telegram, per aprire gli argomenti dei gruppi (25/11/2026). Vuota = porta spenta.
    telegramToken: (env.TELEGRAM_BOT_TOKEN || '').trim(),
    telegramApi: (env.TELEGRAM_API_URL || 'https://api.telegram.org').replace(/\/+$/, ''),
  };
}
