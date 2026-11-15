// Officina dell'agenzia: servizio HTTP interno (porta 8080) che lavora foto, grafiche e video per n8n.
// Contratto API v1: vedi LEGGIMI.md. Una richiesta = un "lavoro"; un solo lavoro pesante alla volta.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { leggiConfig, VERSIONE } from './config.js';
import { Coda } from './coda.js';
import { traduciErrore } from './errori.js';
import { esegui, processiAttivi } from './processi.js';
import { creaLavoro, chiudiLavoro, eliminaLavoro, trovaFile, pulisci } from './lavori.js';
import { riceviUpload } from './upload.js';
import { creaProvino, preparaFoto, creaConfronto } from './immagini.js';
import { creaGrafica } from './grafiche.js';
import { creaReel, creaStoriaVideo } from './video.js';
import { trascrivi, whisperDisponibile, presetDtw } from './trascrizione.js';

const TIPI = { '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.srt': 'application/x-subrip; charset=utf-8' };

function chiaveGiusta(attesa, arrivata) {
  if (typeof arrivata !== 'string' || !arrivata) return false;
  const a = crypto.createHash('sha256').update(attesa).digest();
  const b = crypto.createHash('sha256').update(arrivata).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function creaServer(cfg = leggiConfig()) {
  if (!cfg.chiave || cfg.chiave.length < 16) {
    throw new Error('Manca OFFICINA_CHIAVE (almeno 16 caratteri): senza chiave l\'officina non parte.');
  }
  fs.mkdirSync(cfg.datiDir, { recursive: true });
  const coda = new Coda(cfg.maxAttesa);
  const lavoriAttivi = new Set();
  let ffmpegOk = false;
  try {
    await esegui(cfg.ffmpeg, ['-version'], { timeoutMs: 15_000 });
    ffmpegOk = true;
  } catch {
    ffmpegOk = false;
  }

  const app = Fastify({
    logger: { level: cfg.livelloLog },
    bodyLimit: 1024 * 1024,
    requestTimeout: 60 * 60 * 1000, // caricamenti grandi + video lunghi
    keepAliveTimeout: 65_000,
    return503OnClosing: true,
  });
  await app.register(multipart, { throwFileSizeLimit: true });

  app.setErrorHandler((e, req, reply) => {
    const t = traduciErrore(e);
    if (t.stato >= 500) req.log.error({ err: e, stderr: e?.stderr?.slice?.(-2000) }, 'lavoro fallito');
    else req.log.info({ codice: t.codice }, t.messaggio);
    if (reply.raw.headersSent || reply.raw.destroyed) return;
    reply.code(t.stato === 499 ? 400 : t.stato).send({ errore: t.codice, messaggio: t.messaggio });
  });
  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ errore: 'non_trovato', messaggio: `L'indirizzo ${req.method} ${req.url.split('?')[0]} non esiste nell'officina.` });
  });

  // Chiave: header X-Officina-Chiave. /salute senza chiave risponde solo {ok:true}.
  app.addHook('onRequest', async (req, reply) => {
    req.autorizzato = chiaveGiusta(cfg.chiave, req.headers['x-officina-chiave']);
    if (req.url === '/salute' || req.url.startsWith('/salute?')) return;
    // GET / = controllo di salute minimo per la piattaforma (es. Sliplane), senza chiave e senza dati.
    if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) return;
    if (!req.autorizzato) {
      reply.code(401).send({ errore: 'non_autorizzato', messaggio: "Manca la chiave dell'officina (header X-Officina-Chiave) o è sbagliata." });
      return reply;
    }
  });

  app.get('/', async () => ({ ok: true }));

  app.get('/salute', async (req) => {
    if (!req.autorizzato) return { ok: true };
    return {
      ok: true,
      versione: VERSIONE,
      ffmpeg: ffmpegOk,
      whisper: whisperDisponibile(cfg),
      coda: coda.lunghezza,
      memoria_mb: Math.round(process.memoryUsage().rss / 1048576),
    };
  });

  app.get('/file/:id/:nome', async (req, reply) => {
    const f = await trovaFile(cfg.datiDir, req.params.id, req.params.nome, cfg.durataFileMs);
    if (!f) {
      reply.code(404).send({ errore: 'file_non_trovato', messaggio: "Il file non c'è: i file restano 24 ore e poi si cancellano, oppure l'indirizzo è sbagliato." });
      return reply;
    }
    const est = req.params.nome.slice(req.params.nome.lastIndexOf('.')).toLowerCase();
    reply.header('content-type', TIPI[est] || 'application/octet-stream');
    reply.header('content-length', f.byte);
    reply.header('cache-control', 'no-store');
    reply.header('content-disposition', `inline; filename="${req.params.nome}"`);
    return reply.send(fs.createReadStream(f.percorso));
  });

  // Prenota il posto in coda PRIMA di leggere i file: a coda piena si risponde subito 429.
  async function prenota(req, reply) {
    const b = coda.prenota();
    if (!b) {
      reply.code(429).header('retry-after', String(coda.riprovaTraSecondi())).send({ errore: 'coda_piena', messaggio: "L'officina è piena (un lavoro in corso e 5 in attesa). Riprova fra poco." });
      return reply;
    }
    req.biglietto = b;
  }

  function rotta(url, spec, lavora) {
    app.post(url, {
      onRequest: prenota,
      onResponse: async (req) => {
        if (req.biglietto && !req.lavoroInCorso) req.biglietto.libera();
      },
    }, async (req, reply) => {
      const biglietto = req.biglietto;
      const controllo = new AbortController();
      reply.raw.on('close', () => {
        if (!reply.raw.writableFinished) controllo.abort();
      });
      const lavoro = await creaLavoro(cfg.datiDir);
      lavoriAttivi.add(lavoro.id);
      const base = cfg.urlBase || `${req.protocol}://${req.headers.host}`;
      const indirizzo = (nome) => `${base}/file/${lavoro.id}/${nome}`;
      req.lavoroInCorso = true;
      try {
        const { dati, file } = await riceviUpload(req, lavoro.dirIn, spec, cfg);
        await biglietto.turno(controllo.signal);
        const inizio = Date.now();
        const risultato = await lavora({ dati, file, lavoro, url: indirizzo, segnale: controllo.signal });
        await chiudiLavoro(lavoro);
        req.log.info({ lavoro: lavoro.id, ms: Date.now() - inizio, url }, 'lavoro finito');
        return { id: lavoro.id, ...risultato };
      } catch (e) {
        await eliminaLavoro(lavoro).catch(() => {});
        throw e;
      } finally {
        lavoriAttivi.delete(lavoro.id);
        req.lavoroInCorso = false;
        biglietto.libera();
      }
    });
  }

  const unaFoto = { foto: { min: 1, max: 1 }, logo: { min: 0, max: 1 } };

  rotta('/foto/provino', { foto: { min: 2, max: 12 } }, async ({ file, lavoro, url }) => {
    const r = await creaProvino(file.foto, lavoro.dirOut, cfg);
    return { provino: { url: url(r.provino.nome), larghezza: r.provino.larghezza, altezza: r.provino.altezza }, foto: r.foto };
  });
  rotta('/foto/prepara', unaFoto, ({ dati, file, lavoro, url }) => preparaFoto({ foto: file.foto[0], logo: file.logo?.[0], dati, dirOut: lavoro.dirOut, url }));
  rotta('/grafica/storia', unaFoto, ({ dati, file, lavoro, url }) => creaGrafica({ tipo: 'storia', foto: file.foto[0], logo: file.logo?.[0], dati, dirOut: lavoro.dirOut, url, cfg }));
  rotta('/grafica/post', unaFoto, ({ dati, file, lavoro, url }) => creaGrafica({ tipo: 'post', foto: file.foto[0], logo: file.logo?.[0], dati, dirOut: lavoro.dirOut, url, cfg }));
  rotta('/video/trascrivi', { clip: { min: 1, max: 20 } }, ({ dati, file, lavoro, url, segnale }) => trascrivi({ clip: file.clip, dati, lavoro, url, cfg, segnale }));
  rotta('/video/reel', { clip: { min: 1, max: 20 }, logo: { min: 0, max: 1 }, musica: { min: 0, max: 1 } }, ({ dati, file, lavoro, url, segnale }) => creaReel({ clip: file.clip, logo: file.logo?.[0], musica: file.musica?.[0], dati, lavoro, url, cfg, segnale }));
  rotta('/video/storia', { clip: { min: 1, max: 1 }, logo: { min: 0, max: 1 } }, ({ dati, file, lavoro, url, segnale }) => creaStoriaVideo({ clip: file.clip[0], logo: file.logo?.[0], dati, lavoro, url, cfg, segnale }));
  rotta('/confronto', { originale: { min: 1, max: 1 }, risultato: { min: 1, max: 1 } }, async ({ file, lavoro, url }) => {
    const r = await creaConfronto(file.originale[0].percorso, file.risultato[0].percorso, lavoro.dirOut, 'confronto.jpg', cfg);
    return { file: [{ url: url(r.nome) }] };
  });

  // Pulizia: all'avvio e poi a intervalli regolari.
  const fai = () => pulisci(cfg.datiDir, cfg.durataFileMs, lavoriAttivi)
    .then((n) => { if (n) app.log.info({ cancellati: n }, 'pulizia dei file scaduti'); })
    .catch((e) => app.log.warn({ err: e }, 'pulizia fallita'));
  await fai();
  const timer = setInterval(fai, cfg.puliziaOgniMs);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));

  app.decorate('coda', coda);
  return app;
}

async function avvia() {
  const cfg = leggiConfig();
  let app;
  try {
    app = await creaServer(cfg);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const chiudi = async (segnale) => {
    app.log.info({ segnale }, 'chiusura in corso');
    const forza = setTimeout(() => {
      for (const p of processiAttivi) p.kill('SIGKILL');
      process.exit(0);
    }, 30_000);
    forza.unref();
    await app.close().catch(() => {});
    for (const p of processiAttivi) p.kill('SIGKILL');
    process.exit(0);
  };
  process.on('SIGTERM', () => chiudi('SIGTERM'));
  process.on('SIGINT', () => chiudi('SIGINT'));
  await app.listen({ port: cfg.porta, host: cfg.host });
  // Senza tempi per parola i sottotitoli si dividono in proporzione (meno precisi): meglio saperlo dal log.
  if (whisperDisponibile(cfg)) app.log.info({ tempi_per_parola: presetDtw(cfg) || 'spenti' }, 'trascrizione: allineamento delle parole (-dtw)');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  avvia();
}
