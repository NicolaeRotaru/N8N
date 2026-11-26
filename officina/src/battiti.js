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
  // periodo e fase INSIEME: fra i periodi vicini a quello dell'autocorrelazione (±2%, a passi di 0,005) e tutte le fasi
  // (a quarti di passo), la coppia che mette più colpi sui battiti di TUTTO il tratto. Stimare prima il periodo e poi la
  // fase non basta: un periodo sbagliato dello 0,3% su un minuto sposta gli ultimi battiti di mezzo colpo, e la fase
  // migliore «in media» sbaglia l'inizio. I colpi si guardano allargati di un passo (il massimo dei tre vicini).
  const largo = new Float64Array(n);
  for (let i = 0; i < n; i++) largo[i] = Math.max(colpi[i], colpi[i - 1] || 0, colpi[i + 1] || 0);
  let p0 = lagBuono; let f0 = 0; let meglio = -1;
  for (let p = lagBuono * 0.98; p <= lagBuono * 1.02; p += 0.005) {
    for (let f = 0; f < p; f += 0.25) {
      let tot = 0;
      for (let t = f; t < n; t += p) tot += largo[Math.round(t)];
      if (tot > meglio) { meglio = tot; p0 = p; f0 = f; }
    }
  }
  // la rifinitura: per ogni battito previsto il colpo più forte vicino (2 passi prima o dopo, con la parabola sui tre
  // valori intorno per scendere sotto il passo), poi la retta dei minimi quadrati tempo = fase + k·periodo, due volte.
  // Se gli scarti dalla retta restano grandi (il brano cambia tempo, o il battito non c'è), l'affidabilità scende sotto
  // la soglia: meglio non spostare niente che tagliare in controtempo.
  let scarto = Infinity;
  let copertura = 0;
  for (let giro = 0; giro < 2; giro++) {
    const punti = [];
    let previsti = 0;
    for (let k = 0, t = f0; t < n; t += p0, k++) {
      const c = Math.round(t);
      previsti++;
      let forte = 0; let dove = -1;
      for (let i = Math.max(1, c - 2); i <= Math.min(n - 2, c + 2); i++) if (colpi[i] > forte) { forte = colpi[i]; dove = i; }
      if (dove < 0) continue;
      const a = colpi[dove - 1]; const b = colpi[dove]; const d = colpi[dove + 1];
      const curva = a - 2 * b + d;
      punti.push([k, dove + (curva < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - d)) / curva)) : 0)]);
    }
    if (punti.length < 8) break;
    const mk = punti.reduce((x, [k]) => x + k, 0) / punti.length;
    const mt = punti.reduce((x, [, t]) => x + t, 0) / punti.length;
    let sxy = 0; let sxx = 0;
    for (const [k, t] of punti) { sxy += (k - mk) * (t - mt); sxx += (k - mk) * (k - mk); }
    const p1 = sxx > 0 ? sxy / sxx : 0;
    if (!(Math.abs(p1 - p0) < p0 * 0.03)) break;
    p0 = p1; f0 = mt - p1 * mk;
    scarto = Math.sqrt(punti.reduce((x, [k, t]) => x + (t - (f0 + k * p0)) ** 2, 0) / punti.length);
    copertura = punti.length / Math.max(1, previsti);
  }
  while (f0 < 0) f0 += p0;
  while (f0 >= p0) f0 -= p0;
  const battiti = [];
  // il colpo entra in fondo alla finestra di 2 passi: il picco rifinito cade ~1,2 passi prima del battito vero (misurato su
  // un clic secco e su una cassa morbida: scarto rimasto entro 5 ms)
  for (let t = f0; t < n; t += p0) battiti.push(r3(((t + 1.2) * PASSO) / sr));
  // i colpi devono stare su una griglia sola: scarti medi entro 1,5 passi (~35 ms) e almeno il 70% dei battiti previsti con
  // un colpo vero vicino. Un brano che cambia tempo a metà ne trova il 65%; un'intro di 8 s senza battito su 32 il 75%.
  const affidabile = scarto <= 1.5 && copertura >= 0.7 ? affidabilita : Math.min(affidabilita, 1);
  return { bpm: Math.round((600 * passiAlSecondo) / p0) / 10, battiti, affidabilita: Math.round(affidabile * 100) / 100, copertura: Math.round(copertura * 100) / 100 };
}

// I battiti di un file musicale, nei primi `maxSecondi` (chi chiama passa la durata del video più 2 s: si legge solo il
// tratto che serve). `durata` è quanto dura il brano davvero: nel montaggio la musica riparte da capo alla sua fine, e i
// battiti si ripetono da lì (battitiSulVideo). `letti` è il tratto analizzato: oltre, in ogni giro, nessun battito.
export async function battitiMusica(file, cfg, segnale, maxSecondi = 180) {
  const limite = Math.max(5, Math.min(600, Number(maxSecondi) || 180));
  const { stdout } = await esegui(cfg.ffmpeg, ['-hide_banner', '-nostdin', '-v', 'error', '-t', String(limite), '-i', file, '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'], { segnale, timeoutMs: 120_000 });
  const pcm = new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 2));
  const r = trovaBattiti(Float32Array.from(pcm, (x) => x / 32768));
  const letti = r3(pcm.length / SR);
  let durata = letti;
  if (pcm.length >= (limite - 0.05) * SR) {
    // il brano continua oltre il tratto letto: quanto dura lo dice ffprobe (se non risponde, niente ripetizioni)
    try {
      const { stdout: j } = await esegui(cfg.ffprobe || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { segnale, timeoutMs: 30_000 });
      // un brano lungo quanto il tratto letto (o un soffio di più) vale per quello che è
      const d = Number(String(j).trim());
      durata = d > 0 ? Math.max(letti, r3(d)) : Infinity;
    } catch (e) {
      if (segnale?.aborted) throw e;
      durata = Infinity;
    }
  }
  return { ...r, durata, letti };
}

// La griglia dei battiti sul tempo del video (con la musica che riparte da capo ogni `durata` secondi).
export function battitiSulVideo(musica, durataVideo) {
  if (!musica || !musica.battiti || !musica.battiti.length || !(musica.durata > 0)) return [];
  const fuori = [];
  for (let giro = 0; giro === 0 || giro * musica.durata < durataVideo + 1; giro++) {
    for (const b of musica.battiti) {
      // al primo giro il battito è quello (con una durata infinita, 0 × ∞ darebbe NaN)
      const t = giro === 0 ? b : b + giro * musica.durata;
      if (t <= durataVideo + 1) fuori.push(r3(t));
    }
  }
  return fuori;
}

// Sposta sul battito i tagli fra due inquadrature che non sono volti. Quanto un pezzo può allungarsi nella sua clip lo dice
// `fineDi(pezzo)`: la fine della SCENA in cui il pezzo finisce (oltre c'è un'altra inquadratura della stessa clip, e se ne
// vedrebbe un lampo), null = senza limite (foto). Senza `fineDi` vale `durataClip(fonte)`, quanto girato c'è.
// Restituisce le inquadrature nuove e quanti tagli si sono spostati.
export function tagliATempo(video, battiti, { fps = 25, minima = 0.6, durataClip = () => null, fineDi = null, tolleranza = 0.35 } = {}) {
  const fuori = video.map((q) => ({ ...q }));
  if (!battiti.length || fuori.length < 2) return { video: fuori, spostati: 0 };
  // due pezzi di fila della stessa ripresa (il secondo riparte dove finisce il primo), sui valori di partenza
  const diFila = (a, b) => !!(a && b && a.fonte === b.fonte && a.tipo !== 'foto' && b.tipo !== 'foto' && Math.abs(a.fine - b.inizio) < 1.5 / fps);
  const alFotogramma = (t) => Math.round(t * fps) / fps;
  let spostati = 0;
  for (let k = 0; k < fuori.length - 1; k++) {
    const sx = fuori[k];
    const dx = fuori[k + 1];
    if (sx.tipo === 'volto' || dx.tipo === 'volto') continue;
    // la stessa ripresa di fila: il taglio fra le due non si vede, e spostarlo ripeterebbe o salterebbe dei fotogrammi.
    // Lo stesso se la destra è seguita dalla sua ripresa: spostando il taglio la destra cambia dove finisce.
    if (diFila(video[k], video[k + 1]) || diFila(video[k + 1], video[k + 2])) continue;
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
    const limiteSx = fineDi ? fineDi(sx) : durataClip(sx.fonte);
    const limiteDx = fineDi ? fineDi(dx) : durataClip(dx.fonte);
    if (limiteSx !== null && sx.tipo !== 'foto' && sx.inizio + durSx > limiteSx) continue;
    if (limiteDx !== null && dx.tipo !== 'foto' && dx.inizio + durDx > limiteDx) continue;
    sx.a = nuovo; sx.fine = r3(sx.inizio + durSx);
    dx.da = nuovo; dx.fine = r3(dx.inizio + durDx);
    spostati++;
  }
  return { video: fuori, spostati };
}
