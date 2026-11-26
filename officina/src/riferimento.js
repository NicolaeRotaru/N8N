// La misura di un reel di riferimento: un video che il team considera perfetto (suo o di altri) diventa numeri, così
// lo stile si regola sui fatti e non a sensazione. Si misura:
//   - dove sono i tagli (cambi d'inquadratura) e quanto dura ogni inquadratura (media, mediana, 10° e 90° percentile);
//   - quanti tagli al minuto;
//   - la musica: battiti al minuto e quanti tagli cadono sul battito (entro 0,1 s), accanto a quanti ci cadrebbero a caso
//     (a 120 bpm un taglio qualsiasi ha già il 40% di probabilità di cadere entro 0,1 s da un battito);
//   - un ritmo proposto, con le stesse chiavi di stile.ritmo (minima, coperturaMin, coperturaMax) e se tagliare a tempo.
// Si guardano i primi MAX_SECONDI (un reel di riferimento dura meno). Il testo sullo schermo NON si misura: servirebbe
// un lettore di testo (OCR) che sul server non c'è. Le dissolvenze lente non si vedono come tagli.
// Non salva niente: il video si guarda e si butta (cartella del lavoro). Lo stile lo cambia una persona.
import { esegui } from './processi.js';
import { sonda } from './video.js';
import { battitiMusica } from './battiti.js';
import { errore } from './errori.js';

const r2 = (n) => Math.round(n * 100) / 100;
export const MAX_SECONDI = 300;
const VICINO = 0.1; // un taglio entro 0,1 s da un battito «cade sul battito»
const quantile = (v, q) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i); const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};

// I tagli di un video montato: scdet su fotogrammi piccoli (tutti: il tempo del taglio resta preciso al fotogramma).
// Fra due tagli almeno 0,25 s (un lampo o un movimento veloce non fanno due tagli).
export async function tagliDelVideo(file, cfg, segnale, soglia = 10) {
  const { stderr } = await esegui(cfg.ffmpeg, ['-hide_banner', '-nostdin', '-v', 'info', '-t', String(MAX_SECONDI), '-i', file, '-an', '-vf', `scale=320:-2,scdet=threshold=${soglia},metadata=print`, '-f', 'null', '-'],
    { segnale, timeoutMs: cfg.timeoutProcessoMs || 600_000 });
  const tempi = [...String(stderr).matchAll(/lavfi\.scd\.time=([\d.]+)/g)].map((m) => Number(m[1])).filter((t) => t > 0.1);
  const fuori = [];
  for (const t of tempi) if (!fuori.length || t - fuori[fuori.length - 1] >= 0.25) fuori.push(r2(t));
  return fuori;
}

// I numeri dai tagli e dalla musica (funzione pura: la provano le prove anche senza video).
export function numeriDelRitmo({ durata, tagli, musica = null }) {
  const confini = [0, ...tagli.filter((t) => t > 0 && t < durata), durata];
  const inquadrature = confini.slice(1).map((t, i) => r2(t - confini[i])).filter((d) => d > 0);
  const media = inquadrature.length ? inquadrature.reduce((a, b) => a + b, 0) / inquadrature.length : 0;
  const stat = { quante: inquadrature.length, media: r2(media), mediana: r2(quantile(inquadrature, 0.5)), p10: r2(quantile(inquadrature, 0.1)), p90: r2(quantile(inquadrature, 0.9)) };
  let sulBattito = null;
  let aCaso = null;
  // contano solo i tagli dentro la musica analizzata (i battiti coprono i primi secondi del brano)
  const tagliMusica = musica && musica.battiti && musica.battiti.length ? tagli.filter((t) => t <= (musica.durata || Infinity) + VICINO) : [];
  if (tagliMusica.length && musica.bpm > 0) {
    const vicini = tagliMusica.filter((t) => musica.battiti.some((b) => Math.abs(b - t) <= VICINO)).length;
    sulBattito = Math.round((vicini / tagliMusica.length) * 100);
    aCaso = Math.round(Math.min(1, (2 * VICINO) / (60 / musica.bpm)) * 100);
  }
  const ritmo = {
    minima: r2(Math.min(2, Math.max(0.4, stat.p10 * 0.8))),
    coperturaMin: r2(Math.min(6, Math.max(0.6, stat.p10))),
    coperturaMax: r2(Math.min(10, Math.max(1, stat.p90))),
  };
  ritmo.coperturaMax = Math.max(ritmo.coperturaMax, ritmo.coperturaMin);
  return {
    inquadrature: stat,
    tagli_al_minuto: durata > 0 ? r2((tagli.length / durata) * 60) : 0,
    musica: musica ? { bpm: musica.bpm, affidabile: musica.affidabile, tagli_sul_battito_percento: sulBattito, a_caso_sarebbe_percento: aCaso } : null,
    // a tempo solo se i tagli sul battito sono molti più di quelli che ci cadrebbero a caso
    ritmo_proposto: { ...ritmo, tagli_a_tempo: sulBattito !== null && sulBattito >= Math.max(60, aCaso + 25) },
  };
}

export async function misuraRiferimento(file, cfg, segnale, { sogliaBattito = 2.5 } = {}) {
  const info = await sonda(file.percorso, file.nome, cfg, segnale);
  if (info.immagine || !info.video || !info.larghezza || !info.altezza) throw errore(415, 'video_non_leggibile', `Il file «${file.nome}» non è un video.`);
  if (!(info.durata > 0)) throw errore(415, 'video_non_leggibile', `Non riesco a leggere la durata di «${file.nome}».`);
  const durata = Math.min(Number(info.durata), MAX_SECONDI);
  const avvisi = [];
  if (info.durata > MAX_SECONDI + 1) avvisi.push({ codice: 'troppo_lungo', messaggio: `Il video dura ${Math.round(info.durata)} secondi: ho misurato i primi ${MAX_SECONDI}.` });
  const tagli = await tagliDelVideo(file.percorso, cfg, segnale);
  let musica = null;
  if (info.audio) {
    try {
      const m = await battitiMusica(file.percorso, cfg, segnale);
      const affidabile = m.affidabilita >= sogliaBattito;
      musica = { bpm: affidabile ? m.bpm : null, affidabile, durata: m.durata, battiti: affidabile ? m.battiti : [] };
      if (!musica.affidabile) avvisi.push({ codice: 'battito_incerto', messaggio: 'La musica di questo video non ha un battito chiaro: non posso dire se i tagli sono a tempo.' });
    } catch (e) {
      if (segnale?.aborted || e.annullato) throw e;
      avvisi.push({ codice: 'musica_non_letta', messaggio: 'Non sono riuscito a leggere l\'audio: ho misurato solo i tagli.' });
    }
  } else {
    avvisi.push({ codice: 'senza_audio', messaggio: 'Il video non ha audio: ho misurato solo i tagli.' });
  }
  if (tagli.length < 2) avvisi.push({ codice: 'pochi_tagli', messaggio: `Ho trovato ${tagli.length} tagli: o è un piano sequenza, o i cambi sono dissolvenze lente che non vedo.` });
  const numeri = numeriDelRitmo({ durata, tagli, musica });
  return {
    durata: r2(durata),
    formato: info.larghezza > info.altezza ? 'orizzontale' : info.larghezza < info.altezza ? 'verticale' : 'quadrato',
    larghezza: info.larghezza, altezza: info.altezza, fps: info.fps ? r2(info.fps) : null,
    tagli,
    ...numeri,
    avvisi,
  };
}
