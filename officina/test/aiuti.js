// Aiuti per le prove: avvio del servizio vero (processo separato, come in Docker), chiamate HTTP,
// materiale di prova SINTETICO (gradienti, forme, scritte, clip testsrc/sine/voce sintetica). Niente cibo.
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHIAVE = 'chiave-di-prova-lunga-32-caratteri!!';
export const TMP = process.env.OFFICINA_TMP || path.join(RADICE, 'test', '.tmp');
export const MATERIALE = path.join(TMP, 'materiale');
fs.mkdirSync(MATERIALE, { recursive: true });

export function cartellaNuova(nome) {
  const d = fs.mkdtempSync(path.join(TMP, `${nome}-`));
  return d;
}

// Avvia src/server.js come processo separato; restituisce { base, pid, datiDir, ferma(), log() }.
export async function avviaServer(envExtra = {}) {
  const datiDir = envExtra.DATI_DIR || cartellaNuova('dati');
  const env = {
    ...process.env,
    OFFICINA_CHIAVE: CHIAVE,
    DATI_DIR: datiDir,
    PORT: '0',
    HOST: '127.0.0.1',
    FONT_RETE: 'no', // nelle prove nessuna chiamata a Google
    WHISPER_BIN: path.join(RADICE, 'test', 'non-esiste'),
    LOG_LEVEL: 'info',
    ...envExtra,
  };
  const figlio = spawn(process.execPath, ['--max-old-space-size=512', path.join(RADICE, 'src', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let righe = '';
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`il servizio non parte:\n${righe}`)), 20_000);
    const leggi = (d) => {
      righe += d.toString();
      const m = righe.match(/listening at (http:\/\/127\.0\.0\.1:\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    };
    figlio.stdout.on('data', leggi);
    figlio.stderr.on('data', leggi);
    figlio.on('exit', (c) => reject(new Error(`il servizio è uscito (${c}):\n${righe}`)));
  });
  return {
    base,
    pid: figlio.pid,
    datiDir,
    log: () => righe,
    ferma: () => new Promise((r) => {
      // la cartella dati creata per la prova si cancella alla fine (il materiale di prova resta in cache)
      const fine = () => {
        if (!envExtra.DATI_DIR) fs.rmSync(datiDir, { recursive: true, force: true });
        r();
      };
      if (figlio.exitCode !== null) return fine();
      figlio.once('exit', fine);
      figlio.kill('SIGTERM');
    }),
  };
}

// POST multipart: campi = { dati: {...} }, file = { foto: [percorso, ...], logo: percorso },
// altriCampi = [[nome, valore], ...] campi di testo in più (es. i segnaposto vuoti che mandano i workflow).
export async function chiama(base, percorso, { dati = {}, file = {}, chiave = CHIAVE, altriCampi = [] } = {}) {
  const fd = new FormData();
  fd.append('dati', JSON.stringify(dati));
  for (const [nome, valore] of altriCampi) fd.append(nome, valore);
  for (const [campo, valore] of Object.entries(file)) {
    for (const p of [].concat(valore)) fd.append(campo, await fs.openAsBlob(p), path.basename(p));
  }
  const headers = chiave ? { 'x-officina-chiave': chiave } : {};
  const r = await fetch(base + percorso, { method: 'POST', body: fd, headers });
  const testo = await r.text();
  let json = null;
  try {
    json = JSON.parse(testo);
  } catch {
    json = { grezzo: testo };
  }
  return { stato: r.status, json, headers: r.headers };
}

export async function scarica(url, chiave = CHIAVE) {
  const r = await fetch(url, { headers: chiave ? { 'x-officina-chiave': chiave } : {} });
  return { stato: r.status, buf: Buffer.from(await r.arrayBuffer()), tipo: r.headers.get('content-type') };
}

// Immagine sintetica: gradiente + forme + scritta. seme cambia colori e forme.
export async function creaImmagine(nome, { w = 3000, h = 2000, seme = 1, formato = 'jpeg', rumore = false } = {}) {
  const p = path.join(MATERIALE, nome);
  if (fs.existsSync(p)) return p;
  const c1 = `hsl(${(seme * 67) % 360},70%,45%)`;
  const c2 = `hsl(${(seme * 67 + 140) % 360},70%,60%)`;
  const forme = Array.from({ length: 6 }, (_, i) => {
    const x = ((seme * 131 + i * 977) % 90) / 100;
    const y = ((seme * 71 + i * 613) % 90) / 100;
    return i % 2
      ? `<circle cx="${Math.round(x * w)}" cy="${Math.round(y * h)}" r="${Math.round(Math.min(w, h) * 0.12)}" fill="hsl(${(seme * 40 + i * 50) % 360},80%,50%)"/>`
      : `<rect x="${Math.round(x * w)}" y="${Math.round(y * h)}" width="${Math.round(w * 0.2)}" height="${Math.round(h * 0.15)}" fill="hsl(${(seme * 90 + i * 30) % 360},60%,35%)"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>${forme}
    <text x="50%" y="50%" font-size="${Math.round(h / 8)}" font-family="sans-serif" fill="#fff" text-anchor="middle">PROVA ${seme}</text></svg>`;
  let img = sharp(Buffer.from(svg));
  if (rumore) {
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, data[i] + ((Math.random() * 120) | 0) - 60));
    img = sharp(data, { raw: info });
  }
  if (formato === 'png') await img.png().toFile(p);
  else await img.jpeg({ quality: 95 }).toFile(p);
  return p;
}

// Logo sintetico PNG con trasparenza.
export async function creaLogo() {
  const p = path.join(MATERIALE, 'logo.png');
  if (fs.existsSync(p)) return p;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect x="10" y="10" width="580" height="280" rx="60" fill="#ffffff" fill-opacity="0.9"/><circle cx="150" cy="150" r="90" fill="#c0392b"/><rect x="290" y="100" width="240" height="100" fill="#2c3e50"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(p);
  return p;
}

export function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-v', 'error', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
}

// Clip sintetica: testsrc2 + audio ('sine' | 'nessuno' | 'flite' (voce inglese di ffmpeg) | file wav).
export function creaClip(nome, { w = 1920, h = 1080, durata = 10, audio = 'sine', testo = 'Hello and welcome', colori = {}, video = 'testsrc2' } = {}) {
  const p = path.join(MATERIALE, nome);
  if (fs.existsSync(p)) return p;
  const sorgente = video === 'grigio' ? `color=c=gray:size=${w}x${h}:rate=30:duration=${durata}` : `testsrc2=size=${w}x${h}:rate=30:duration=${durata}`;
  const args = ['-f', 'lavfi', '-i', sorgente];
  if (audio === 'sine') args.push('-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${durata},volume=0.3`);
  else if (audio === 'muto') args.push('-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:duration=${durata}`);
  else if (audio === 'flite') args.push('-f', 'lavfi', '-i', `flite=text='${testo}':voice=slt`);
  else if (audio !== 'nessuno') args.push('-i', audio);
  args.push('-map', '0:v');
  if (audio !== 'nessuno') args.push('-map', '1:a', '-af', 'apad', '-c:a', 'aac', '-ar', '48000');
  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', ...(colori.trc ? ['-color_trc', colori.trc, '-color_primaries', 'bt2020', '-colorspace', 'bt2020nc'] : []), '-t', String(durata), p);
  ffmpeg(args);
  return p;
}

export function sondaFile(p) {
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', p]).toString());
}

export function loudnessIntegrata(p) {
  const r = spawnSyncTesto('ffmpeg', ['-hide_banner', '-nostats', '-i', p, '-af', 'ebur128', '-f', 'null', '-']);
  const m = [...r.matchAll(/I:\s+(-?[\d.]+) LUFS/g)];
  return m.length ? Number(m[m.length - 1][1]) : null;
}

function spawnSyncTesto(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return `${r.stdout || ''}${r.stderr || ''}`;
}

// Memoria: somma della RSS del servizio e di tutti i suoi figli (ffmpeg, whisper), campionata ogni 100 ms.
function figliDi(pid) {
  const out = [];
  for (const voce of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(voce)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${voce}/stat`, 'utf8');
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
      if (ppid === pid) out.push(Number(voce));
    } catch {
      // processo finito
    }
  }
  return out;
}

function rssMb(pid) {
  try {
    const s = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const m = s.match(/VmRSS:\s+(\d+) kB/);
    const n = s.match(/Name:\s+(\S+)/);
    return { mb: m ? Number(m[1]) / 1024 : 0, nome: n ? n[1] : '?' };
  } catch {
    return { mb: 0, nome: '?' };
  }
}

export function campionaMemoria(pidRadice) {
  let picco = 0;
  const perNome = {};
  const giro = () => {
    const tutti = [pidRadice];
    for (let i = 0; i < tutti.length; i++) tutti.push(...figliDi(tutti[i]));
    let somma = 0;
    for (const p of tutti) {
      const { mb, nome } = rssMb(p);
      somma += mb;
      perNome[nome] = Math.max(perNome[nome] || 0, mb);
    }
    picco = Math.max(picco, somma);
  };
  giro();
  const t = setInterval(giro, 100);
  return () => {
    clearInterval(t);
    giro();
    return { piccoTotaleMb: Math.round(picco), perProcessoMb: Object.fromEntries(Object.entries(perNome).map(([k, v]) => [k, Math.round(v)])) };
  };
}

// Pixel "colore del testo" in una fascia di righe di un JPEG (per le aree sicure).
export async function contaPixelColore(buf, { y0, y1, colore, tolleranza = 60 }) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const d = Math.abs(data[i] - colore[0]) + Math.abs(data[i + 1] - colore[1]) + Math.abs(data[i + 2] - colore[2]);
      if (d < tolleranza) n++;
    }
  }
  return n;
}

export function percorsoLocale(...p) {
  return path.join(RADICE, '.locale', ...p);
}
