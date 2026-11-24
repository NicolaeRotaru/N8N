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
import path from 'node:path';
import fsp from 'node:fs/promises';
import { errore, nonValido } from './errori.js';
import { creaProgetto, apriProgetto, chiudiProgetto, salvaProgetto, prossimoCodice, byteProgetto, scadenza, pulisciProgetti, Registro } from './progetti.js';
import { analizzaVideo, analizzaFoto, analizzaAudio, tipoDelFile } from './analisi.js';
import { materialiPubblici, testoCatalogo, celleProvini, disegnaProvini } from './catalogo.js';
import { controllaPiano } from './piano.js';
import { montaContenuto } from './montaggio.js';
import { leggiSceneggiatura } from './sceneggiatura.js';
import { controllaRegia, regoleDelloStile } from './regia.js';
import { montaRegia, stileDa } from './regia-render.js';

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
  const progettiAttivi = new Registro();
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

  function rotta(url, spec, lavora, opz = {}) {
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
      if (opz.prima) await opz.prima(req);
      const lavoro = await creaLavoro(cfg.datiDir);
      lavoriAttivi.add(lavoro.id);
      if (req.params?.pid) progettiAttivi.entra(req.params.pid);
      const base = cfg.urlBase || `${req.protocol}://${req.headers.host}`;
      const indirizzo = (nome) => `${base}/file/${lavoro.id}/${nome}`;
      req.lavoroInCorso = true;
      try {
        const { dati, file } = await riceviUpload(req, lavoro.dirIn, spec, opz.cfgUpload || cfg);
        await biglietto.turno(controllo.signal);
        const inizio = Date.now();
        const risultato = await lavora({ dati, file, lavoro, url: indirizzo, segnale: controllo.signal, params: req.params || {} });
        await chiudiLavoro(lavoro);
        req.log.info({ lavoro: lavoro.id, ms: Date.now() - inizio, url }, 'lavoro finito');
        return { id: lavoro.id, ...risultato };
      } catch (e) {
        await eliminaLavoro(lavoro).catch(() => {});
        throw e;
      } finally {
        lavoriAttivi.delete(lavoro.id);
        if (req.params?.pid) progettiAttivi.esce(req.params.pid);
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

  // ------------------------------------------------------------ MONTATORE (progetti)
  // Un progetto = il materiale di un servizio, caricato una volta sola (un file per richiesta) e usato per il mese.
  // Rotte leggere (niente coda): crea, stato, controllo del piano, chiudi. Rotte pesanti (in coda): materiale,
  // catalogo, monta. Le rotte leggere accettano JSON oppure multipart con il campo «dati».
  async function datiLeggeri(req) {
    if (req.isMultipart && req.isMultipart()) {
      const dir = await fsp.mkdtemp(path.join(cfg.datiDir, 'tmp-'));
      try {
        return (await riceviUpload(req, dir, {}, cfg)).dati;
      } finally {
        await fsp.rm(dir, { recursive: true, force: true });
      }
    }
    const b = req.body;
    if (b === undefined || b === null || b === '') return {};
    if (typeof b !== 'object' || Array.isArray(b)) throw nonValido('dati_non_validi', 'Il corpo della richiesta deve essere un oggetto JSON.');
    return b.dati && typeof b.dati === 'object' && !Array.isArray(b.dati) ? b.dati : b;
  }

  function statoProgetto(progetto) {
    const conta = (t) => progetto.materiali.filter((m) => m.tipo === t).length;
    return {
      progetto: progetto.id,
      nome: progetto.nome,
      video: conta('video'),
      foto: conta('foto'),
      audio: conta('audio'),
      scene: progetto.materiali.filter((m) => m.tipo === 'video').reduce((s, m) => s + m.scene.length, 0),
      durata_video: Math.round(progetto.materiali.filter((m) => m.tipo === 'video').reduce((s, m) => s + m.durata, 0) * 10) / 10,
      byte: byteProgetto(progetto),
      scade_alle: scadenza(cfg.progettoDurataMs),
    };
  }

  app.post('/progetto', async (req) => {
    const dati = await datiLeggeri(req);
    const { progetto } = await creaProgetto(cfg.datiDir, { nome: dati.nome });
    return statoProgetto(progetto);
  });

  app.get('/progetto/:pid', async (req) => {
    const { progetto } = await apriProgetto(cfg.datiDir, req.params.pid, cfg.progettoDurataMs);
    return { ...statoProgetto(progetto), materiali: materialiPubblici(progetto) };
  });

  app.post('/progetto/:pid/chiudi', async (req) => {
    if (progettiAttivi.has(req.params.pid)) throw errore(409, 'progetto_in_uso', 'Il progetto sta lavorando adesso: chiudilo quando il lavoro è finito.');
    await apriProgetto(cfg.datiDir, req.params.pid, cfg.progettoDurataMs);
    await chiudiProgetto(cfg.datiDir, req.params.pid);
    return { ok: true, progetto: req.params.pid };
  });

  app.post('/progetto/:pid/piano', { bodyLimit: 4 * 1024 * 1024 }, async (req) => {
    const dati = await datiLeggeri(req);
    const { progetto } = await apriProgetto(cfg.datiDir, req.params.pid, cfg.progettoDurataMs);
    if (!dati.piano) throw nonValido('dati_non_validi', 'Manca «piano»: serve {piano:{contenuti:[…]}, mese:"AAAA-MM"}.');
    return { progetto: progetto.id, ...controllaPiano(dati.piano, progetto, { mese: dati.mese ?? null, richiesta: dati.richiesta ?? null, oggi: dati.oggi ?? null }) };
  });

  const controllaEsiste = async (req) => {
    await apriProgetto(cfg.datiDir, req.params.pid, cfg.progettoDurataMs);
  };
  const cfgMateriale = { ...cfg, maxFileByte: cfg.maxMaterialeByte, maxTotaleByte: cfg.maxMaterialeByte };

  rotta('/progetto/:pid/materiale', { file: { min: 1, max: 1 } }, async ({ dati, file, lavoro, segnale, params }) => {
    const { dir, progetto } = await apriProgetto(cfg.datiDir, params.pid, cfg.progettoDurataMs);
    const f = file.file[0];
    const nomeOriginale = String(dati.nome || f.nome).slice(0, 200);
    const driveId = dati.drive_id ? String(dati.drive_id).slice(0, 200) : null;
    // Lo stesso file mandato due volte (es. «Retry on Fail» di n8n): si restituisce quello già caricato.
    const gia = progetto.materiali.find((m) => (driveId && m.drive_id === driveId) || (!driveId && !m.drive_id && m.nome_originale === nomeOriginale && m.byte === f.byte));
    if (gia) {
      const pub = materialiPubblici(progetto).find((m) => m.codice === gia.codice);
      return { progetto: progetto.id, materiale: pub, gia_caricato: true, avvisi: [{ codice: 'gia_caricato', messaggio: `«${nomeOriginale}» era già nel progetto come ${gia.codice}: non l'ho caricato due volte.` }] };
    }
    if (byteProgetto(progetto) + f.byte > cfg.maxProgettoByte) {
      throw errore(413, 'progetto_troppo_grande', `Il materiale di questo progetto supera ${Math.round(cfg.maxProgettoByte / 1048576)} MB: esporta i video in 1080p oppure dividi il servizio in due progetti.`);
    }
    const tipo = await tipoDelFile(f, cfg, segnale);
    const codice = prossimoCodice(progetto, tipo);
    const est = path.extname(f.percorso).toLowerCase() || (tipo === 'video' ? '.mp4' : tipo === 'audio' ? '.wav' : '.jpg');
    const rel = `materiale/${codice}${est}`;
    const assoluto = path.join(dir, rel);
    await fsp.rename(f.percorso, assoluto);
    const fileMat = { percorso: assoluto, nome: nomeOriginale };
    let r;
    try {
      if (tipo === 'video') r = await analizzaVideo({ file: fileMat, codice, dirProgetto: dir, dirTmp: lavoro.dirTmp, dati, cfg, segnale });
      else if (tipo === 'audio') r = await analizzaAudio({ file: fileMat, codice, dirTmp: lavoro.dirTmp, dati, cfg, segnale });
      else r = await analizzaFoto({ file: fileMat, codice, dirProgetto: dir, progetto, dati });
    } catch (e) {
      await fsp.rm(assoluto, { force: true });
      for (const n of await fsp.readdir(path.join(dir, 'miniature')).catch(() => [])) {
        if (n === `${codice}.jpg` || n.startsWith(`${codice}-`)) await fsp.rm(path.join(dir, 'miniature', n), { force: true });
      }
      throw e;
    }
    // rileggo il progetto subito prima di scrivere (l'analisi può durare minuti)
    const { progetto: fresco } = await apriProgetto(cfg.datiDir, params.pid, cfg.progettoDurataMs);
    fresco.materiali.push({ ...r.materiale, nome_originale: nomeOriginale, cartella: String(dati.cartella || '').slice(0, 100), drive_id: driveId, file: rel, byte: f.byte, caricato: new Date().toISOString() });
    await salvaProgetto(dir, fresco);
    const pub = materialiPubblici(fresco).find((m) => m.codice === codice);
    return { progetto: fresco.id, materiale: pub, avvisi: r.avvisi };
  }, { prima: controllaEsiste, cfgUpload: cfgMateriale });

  rotta('/progetto/:pid/catalogo', {}, async ({ lavoro, url, params }) => {
    const { dir, progetto } = await apriProgetto(cfg.datiDir, params.pid, cfg.progettoDurataMs);
    if (!progetto.materiali.length) throw errore(422, 'progetto_vuoto', 'Nel progetto non c\'è ancora materiale: carica prima video e foto.');
    const { celle, esclusi } = celleProvini(progetto);
    const provini = await disegnaProvini(celle, dir, lavoro.dirOut, cfg);
    const avvisi = esclusi ? [{ codice: 'provini_ridotti', messaggio: `Il materiale è tanto: ${esclusi} scene o foto (le peggiori) non sono nei provini, ma restano nel testo del catalogo.` }] : [];
    return {
      ...statoProgetto(progetto),
      provini: provini.map((p) => ({ url: url(p.nome), codici: p.codici, larghezza: p.larghezza, altezza: p.altezza })),
      testo: testoCatalogo(progetto),
      materiali: materialiPubblici(progetto),
      avvisi,
    };
  }, { prima: controllaEsiste });

  rotta('/progetto/:pid/monta', { logo: { min: 0, max: 1 }, musica: { min: 0, max: 1 } }, async ({ dati, file, lavoro, url, segnale, params }) => {
    const { dir, progetto } = await apriProgetto(cfg.datiDir, params.pid, cfg.progettoDurataMs);
    if (!dati.contenuto || typeof dati.contenuto !== 'object') throw nonValido('dati_non_validi', 'Manca «contenuto»: uno dei contenuti del piano controllato.');
    return montaContenuto({ progetto, dirProgetto: dir, dati, file, lavoro, url, cfg, segnale });
  }, { prima: controllaEsiste });

  // ------------------------------------------------------------ REGIA (montaggio da sceneggiatura)
  app.post('/sceneggiatura/leggi', { bodyLimit: 1024 * 1024 }, async (req) => {
    const dati = await datiLeggeri(req);
    if (typeof dati.testo !== 'string') throw nonValido('dati_non_validi', 'Manca «testo»: il testo della sceneggiatura.');
    return leggiSceneggiatura(dati.testo);
  });

  app.post('/progetto/:pid/regia/controlla', { bodyLimit: 4 * 1024 * 1024 }, async (req) => {
    const dati = await datiLeggeri(req);
    const { progetto } = await apriProgetto(cfg.datiDir, req.params.pid, cfg.progettoDurataMs);
    if (!dati.piano || typeof dati.piano !== 'object') throw nonValido('dati_non_validi', 'Manca «piano»: il piano di regia {battute:[…]}.');
    // il ritmo dipende dallo stile: la timeline controllata qui è la stessa che /regia/monta monterà con quello stile
    const R = regoleDelloStile(stileDa(dati.stile, dati.marchio));
    return { progetto: progetto.id, ...controllaRegia(dati.piano, progetto, { sceneggiatura: dati.sceneggiatura ?? null, formato: dati.formato ?? null, R }) };
  });

  rotta('/progetto/:pid/regia/monta', { logo: { min: 0, max: 1 }, musica: { min: 0, max: 1 } }, async ({ dati, file, lavoro, url, segnale, params }) => {
    const { dir, progetto } = await apriProgetto(cfg.datiDir, params.pid, cfg.progettoDurataMs);
    if (!dati.piano || typeof dati.piano !== 'object') throw nonValido('dati_non_validi', 'Manca «piano»: il piano di regia {battute:[…]}.');
    // la timeline si ricalcola qui dal piano: il render non si fida di una timeline arrivata da fuori
    const stile = stileDa(dati.stile, dati.marchio);
    const tl = controllaRegia(dati.piano, progetto, { sceneggiatura: dati.sceneggiatura ?? null, formato: dati.formato ?? null, R: regoleDelloStile(stile) });
    if (!tl.video.length) throw errore(422, 'regia_non_valida', `Non posso montare: ${tl.problemi.filter((p) => p.gravita === 'blocca').map((p) => p.messaggio).join(' ') || 'la timeline è vuota.'}`);
    const r = await montaRegia({ tl, progetto, dirProgetto: dir, stile, logo: file.logo?.[0], musicaFile: file.musica?.[0]?.percorso, lavoro, url, cfg, segnale });
    return { ...r, timeline: { durata: tl.durata, formato: tl.formato, conti: tl.conti }, problemi: tl.problemi };
  }, { prima: controllaEsiste });

  // Pulizia: all'avvio e poi a intervalli regolari.
  const fai = () => Promise.all([
    pulisci(cfg.datiDir, cfg.durataFileMs, lavoriAttivi),
    pulisciProgetti(cfg.datiDir, cfg.progettoDurataMs, progettiAttivi),
  ])
    .then(([n, p]) => { if (n || p) app.log.info({ cancellati: n, progetti_cancellati: p }, 'pulizia dei file scaduti'); })
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
