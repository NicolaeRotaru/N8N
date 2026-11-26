// I tagli a tempo di musica. Un montatore taglia sul battito: il cambio d'inquadratura cade col colpo della musica, e il
// video «balla». Qui:
// 1) trovaBattiti: dal suono (mono, pochi campioni al secondo) l'energia a passi di ~23 ms, i colpi (quando l'energia
//    sale), il tempo (autocorrelazione dei colpi fra 70 e 180 battiti al minuto) e la fase (dove cade il primo battito).
//    Se la musica non ha un battito chiaro (un pad, un pianoforte libero) l'affidabilità è bassa e non si sposta niente.
// 2) tagliATempo: sposta sul battito più vicino SOLO i tagli fra due inquadrature che non sono un volto (copertura o
//    foto). I tagli dove comincia o finisce un volto restano dove sono: lì comanda la voce (sincrono, parole intere).
//    Ogni pezzo tiene il suo punto d'inizio nella clip; cambia solo quanto dura. Un taglio si sposta solo se: il battito
//    è vicino (al massimo un terzo del pezzo più corto, e mai oltre 0,35 s), nessuno dei due pezzi scende sotto la durata
//    minima, e la clip di sinistra ha abbastanza girato per allungarsi.
import { esegui } from './processi.js';

const SR = 11025; // campioni al secondo per l'analisi: per i colpi basta
const PASSO = 256; // ~23 ms
const r3 = (n) => Math.round(n * 1000) / 1000;

export function trovaBattiti(pcm, sr = SR) {
  const n = Math.floor((pcm.length - PASSO * 2) / PASSO);
  if (n < 50) return { bpm: 0, battiti: [], affidabilita: 0 };
  // energia (in scala logaritmica) a finestre di 2 passi
  const energia = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let k = i * PASSO; k < i * PASSO + PASSO * 2; k++) e += pcm[k] * pcm[k];
    energia[i] = Math.log(1 + e / (PASSO * 2));
  }
  // i colpi: quanto sale l'energia rispetto al passo prima (le discese non contano), meno la media locale
  const colpi = new Float64Array(n);
  for (let i = 1; i < n; i++) colpi[i] = Math.max(0, energia[i] - energia[i - 1]);
  const media = colpi.reduce((a, b) => a + b, 0) / n;
  for (let i = 0; i < n; i++) colpi[i] = Math.max(0, colpi[i] - media);
  // il tempo: autocorrelazione dei colpi fra 70 e 180 bpm, con una leggera preferenza per 90-140 (i tempi dei reel)
  const passiAlSecondo = sr / PASSO;
  const lagMin = Math.floor((60 / 180) * passiAlSecondo);
  const lagMax = Math.ceil((60 / 70) * passiAlSecondo);
  let migliore = 0; let lagBuono = 0; let somma = 0; let conta = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let c = 0;
    for (let i = lag; i < n; i++) c += colpi[i] * colpi[i - lag];
    c /= (n - lag);
    const bpm = (60 * passiAlSecondo) / lag;
    const peso = bpm >= 90 && bpm <= 140 ? 1.1 : 1;
    somma += c; conta++;
    if (c * peso > migliore) { migliore = c * peso; lagBuono = lag; }
  }
  const mediaAuto = somma / Math.max(1, conta);
  const affidabilita = mediaAuto > 0 ? migliore / mediaAuto : 0;
  if (!lagBuono || !(affidabilita > 0)) return { bpm: 0, battiti: [], affidabilita: 0 };
  // il periodo più preciso: la media pesata intorno al lag migliore (passi frazionari)
  let num = 0; let den = 0;
  for (let lag = Math.max(lagMin, lagBuono - 1); lag <= Math.min(lagMax, lagBuono + 1); lag++) {
    let c = 0;
    for (let i = lag; i < n; i++) c += colpi[i] * colpi[i - lag];
    num += lag * c; den += c;
  }
  const periodo = den > 0 ? num / den : lagBuono;
  // la fase: lo spostamento (in passi) che mette più colpi sui battiti
  let fase = 0; let meglio = -1;
  for (let f = 0; f < periodo; f += 0.5) {
    let tot = 0;
    for (let t = f; t < n; t += periodo) tot += colpi[Math.round(t)] || 0;
    if (tot > meglio) { meglio = tot; fase = f; }
  }
  const battiti = [];
  // il colpo entra in fondo alla finestra di 2 passi: il battito vero è ~2 passi dopo l'inizio della finestra
  for (let t = fase; t < n; t += periodo) battiti.push(r3(((t + 2) * PASSO) / sr));
  return { bpm: Math.round((600 * passiAlSecondo) / periodo) / 10, battiti, affidabilita: Math.round(affidabilita * 100) / 100 };
}

// I battiti di un file musicale (i primi `maxSecondi`), e quanto dura: nel montaggio la musica riparte da capo se il
// video è più lungo, quindi i battiti si ripetono ogni `durata` secondi.
export async function battitiMusica(file, cfg, segnale, maxSecondi = 180) {
  const { stdout } = await esegui(cfg.ffmpeg, ['-hide_banner', '-nostdin', '-v', 'error', '-t', String(maxSecondi), '-i', file, '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'], { segnale, timeoutMs: 120_000 });
  const pcm = new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 2));
  const r = trovaBattiti(Float32Array.from(pcm, (x) => x / 32768));
  return { ...r, durata: r3(pcm.length / SR) };
}

// La griglia dei battiti sul tempo del video (con la musica che riparte da capo ogni `durata` secondi).
export function battitiSulVideo(musica, durataVideo) {
  if (!musica || !musica.battiti || !musica.battiti.length || !(musica.durata > 0)) return [];
  const fuori = [];
  for (let giro = 0; giro * musica.durata < durataVideo + 1; giro++) {
    for (const b of musica.battiti) {
      const t = b + giro * musica.durata;
      if (t <= durataVideo + 1) fuori.push(r3(t));
    }
  }
  return fuori;
}

// Sposta sul battito i tagli fra due inquadrature che non sono volti. `durataClip(fonte)` dice quanto girato c'è (null =
// senza limite, per le foto). Restituisce le inquadrature nuove e quanti tagli si sono spostati.
export function tagliATempo(video, battiti, { fps = 25, minima = 0.6, durataClip = () => null, tolleranza = 0.35 } = {}) {
  const fuori = video.map((q) => ({ ...q }));
  if (!battiti.length || fuori.length < 2) return { video: fuori, spostati: 0 };
  const alFotogramma = (t) => Math.round(t * fps) / fps;
  let spostati = 0;
  for (let k = 0; k < fuori.length - 1; k++) {
    const sx = fuori[k];
    const dx = fuori[k + 1];
    if (sx.tipo === 'volto' || dx.tipo === 'volto') continue;
    const taglio = sx.a;
    const corto = Math.min(sx.a - sx.da, dx.a - dx.da);
    const limite = Math.min(tolleranza, corto / 3);
    let vicino = null;
    for (const b of battiti) if (Math.abs(b - taglio) <= limite && (vicino === null || Math.abs(b - taglio) < Math.abs(vicino - taglio))) vicino = b;
    if (vicino === null) continue;
    const nuovo = r3(alFotogramma(vicino));
    if (Math.abs(nuovo - taglio) < 0.5 / fps) continue;
    const durSx = r3(nuovo - sx.da);
    const durDx = r3(dx.a - nuovo);
    if (durSx < minima || durDx < minima) continue;
    // la clip di sinistra deve avere il girato per allungarsi; quella di destra, se il taglio va prima, anche
    const limiteSx = durataClip(sx.fonte);
    const limiteDx = durataClip(dx.fonte);
    if (limiteSx !== null && sx.tipo !== 'foto' && sx.inizio + durSx > limiteSx) continue;
    if (limiteDx !== null && dx.tipo !== 'foto' && dx.inizio + durDx > limiteDx) continue;
    sx.a = nuovo; sx.fine = r3(sx.inizio + durSx);
    dx.da = nuovo; dx.fine = r3(dx.inizio + durDx);
    spostati++;
  }
  return { video: fuori, spostati };
}
