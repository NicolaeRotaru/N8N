// Prove video: reel 30 s (formato, audio -14 LUFS, faststart, memoria di picco), sottotitoli spostati sui tagli
// e fuori dall'area sicura, durata massima, storie video ≤ 60 s, clip senza audio e HDR.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { avviaServer, chiama, scarica, creaClip, creaLogo, creaImmagine, sondaFile, loudnessIntegrata, campionaMemoria, contaPixelColore, ffmpeg, MATERIALE, TMP } from './aiuti.js';

let s;
before(async () => {
  s = await avviaServer();
});
after(async () => s?.ferma());

const MB = 1024 * 1024;

function salva(buf, nome) {
  const p = path.join(TMP, nome);
  fs.writeFileSync(p, buf);
  return p;
}

// moov prima di mdat = "faststart" (il video parte prima di essere scaricato tutto).
function moovPrimaDiMdat(buf) {
  let off = 0;
  const visti = [];
  while (off + 8 <= buf.length) {
    let taglia = buf.readUInt32BE(off);
    const tipo = buf.toString('latin1', off + 4, off + 8);
    if (taglia === 1) taglia = Number(buf.readBigUInt64BE(off + 8));
    visti.push(tipo);
    if (taglia < 8) break;
    off += taglia;
  }
  return visti.indexOf('moov') >= 0 && visti.indexOf('moov') < visti.indexOf('mdat');
}

function fotogramma(video, t) {
  const p = path.join(TMP, `fg-${path.basename(video)}-${t}.png`);
  ffmpeg(['-ss', String(t), '-i', video, '-frames:v', '1', p]);
  return fs.readFileSync(p);
}

async function controllaVideo(r, nome, { durataAttesa, tolleranza = 0.15 }) {
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  const [video, copertina, fotogrammi] = r.json.file;
  assert.deepEqual(r.json.file.map((f) => f.tipo), ['video', 'copertina', 'fotogrammi']);
  const d = await scarica(video.url);
  assert.equal(d.tipo, 'video/mp4');
  assert.equal(d.buf.length, video.byte);
  const p = salva(d.buf, nome);
  const info = sondaFile(p);
  const v = info.streams.find((x) => x.codec_type === 'video');
  const a = info.streams.find((x) => x.codec_type === 'audio');
  assert.equal(v.codec_name, 'h264');
  assert.equal(v.width, 1080);
  assert.equal(v.height, 1920);
  assert.equal(v.avg_frame_rate, '30/1');
  assert.equal(v.pix_fmt, 'yuv420p');
  assert.ok(a, "l'audio deve stare dentro il file");
  assert.equal(a.codec_name, 'aac');
  assert.equal(a.sample_rate, '48000');
  assert.equal(a.channels, 2);
  assert.ok(moovPrimaDiMdat(d.buf), 'faststart: moov prima di mdat');
  const durata = Number(info.format.duration);
  if (durataAttesa !== undefined) assert.ok(Math.abs(durata - durataAttesa) <= tolleranza, `durata ${durata} invece di ${durataAttesa}`);
  assert.ok(Math.abs(durata - video.durata) < 0.05);
  const c = await scarica(copertina.url);
  const mc = await sharp(c.buf).metadata();
  assert.deepEqual([mc.format, mc.width, mc.height], ['jpeg', 1080, 1920]);
  assert.ok(c.buf.length <= 3.5 * MB);
  const f = await scarica(fotogrammi.url);
  const mf = await sharp(f.buf).metadata();
  assert.equal(mf.format, 'jpeg');
  assert.ok(Math.max(mf.width, mf.height) <= 1568 && f.buf.length <= 3.5 * MB);
  return { p, info, durata };
}

test('/video/reel da 30 s: H.264 1080×1920 30 fps, AAC 48 kHz stereo, -14 LUFS, faststart, memoria di picco < 1,5 GB', async (t) => {
  const oriz = creaClip('reel-oriz.mp4', { w: 1920, h: 1080, durata: 20 });
  const vert = creaClip('reel-vert.mp4', { w: 1080, h: 1920, durata: 15, audio: 'flite', testo: 'Hello and welcome to our place. Fresh pasta every day.' });
  const musica = path.join(MATERIALE, 'musica.wav');
  if (!fs.existsSync(musica)) ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=10', '-ar', '44100', musica]);
  const srt = '1\n00:00:01,000 --> 00:00:03,000\nBenvenuti\n\n2\n00:00:21,000 --> 00:00:23,500\nOggi pasta fresca\n';
  const ferma = campionaMemoria(s.pid);
  const inizio = Date.now();
  const r = await chiama(s.base, '/video/reel', {
    file: { clip: [oriz, vert], logo: await creaLogo(), musica },
    dati: {
      tagli: [{ clip: 0, inizio: 0, fine: 14 }, { clip: 1, inizio: 0, fine: 13.5 }],
      sottotitoli_srt: srt,
      colori: { primario: '#1F3B2D', secondario: '#F3E9D2', testo: '#FFFFFF' },
      font: 'Playfair Display',
      intro: { testo: 'Il giovedì da noi' },
      outro: { testo: 'Prenota il tuo tavolo' },
      volume_musica: 0.4,
      durata_max: 90,
    },
  });
  const memoria = ferma();
  const secondi = (Date.now() - inizio) / 1000;
  const { p } = await controllaVideo(r, 'reel-30s.mp4', { durataAttesa: 30 });
  assert.ok(r.json.avvisi.some((a) => a.codice === 'sfondo_sfocato'), 'la clip orizzontale va su sfondo sfocato');
  const lufs = loudnessIntegrata(p);
  assert.ok(Math.abs(lufs - -14) <= 1.5, `loudness ${lufs} LUFS`);
  fs.writeFileSync(path.join(TMP, 'misura-reel-30s.json'), JSON.stringify({ ...memoria, secondi, lufs }, null, 2));
  t.diagnostic(`reel 30 s: ${secondi.toFixed(1)} s di lavoro, picco memoria servizio+figli ${memoria.piccoTotaleMb} MB ${JSON.stringify(memoria.perProcessoMb)}, ${lufs} LUFS`);
  assert.ok(memoria.piccoTotaleMb < 1536, `picco ${memoria.piccoTotaleMb} MB`);
});

test('/video/reel: sottotitoli spostati sui tagli, bruciati nel video e fuori dai 340 px in basso', async () => {
  const a = creaClip('sub-a.mp4', { w: 1080, h: 1920, durata: 6, video: 'grigio' });
  const b = creaClip('sub-b.mp4', { w: 1080, h: 1920, durata: 6, video: 'grigio', audio: 'nessuno' });
  // Tempi sulla "linea sorgente" (clip intere una dopo l'altra), come li restituisce /video/trascrivi.
  const srt = [
    '1\n00:00:01,000 --> 00:00:02,000\nPrima frase\n',
    '2\n00:00:07,000 --> 00:00:08,000\nSeconda frase\n',
    '3\n00:00:03,500 --> 00:00:04,500\nFuori dal taglio\n',
  ].join('\n');
  const r = await chiama(s.base, '/video/reel', {
    file: { clip: [a, b] },
    dati: { tagli: [{ clip: 1, inizio: 0.5, fine: 3 }, { clip: 0, inizio: 0.5, fine: 2.5 }], sottotitoli_srt: srt, colori: { primario: '#FF00FF', testo: '#FFFFFF' } },
  });
  const { p } = await controllaVideo(r, 'reel-sottotitoli.mp4', { durataAttesa: 4.5 });
  // Montaggio: B[0.5-3] poi A[0.5-2.5] → "Seconda frase" a 0.5-1.5 s, "Prima frase" a 3.0-4.0 s, la terza sparisce.
  const MAGENTA = [255, 0, 255];
  const attese = { 1.0: true, 2.0: false, 3.5: true, 4.3: false };
  for (const [t, presente] of Object.entries(attese)) {
    const png = fotogramma(p, t);
    const zona = await contaPixelColore(png, { y0: 1100, y1: 1580, colore: MAGENTA, tolleranza: 90 });
    const fondo = await contaPixelColore(png, { y0: 1580, y1: 1920, colore: MAGENTA, tolleranza: 90 });
    const cima = await contaPixelColore(png, { y0: 0, y1: 250, colore: MAGENTA, tolleranza: 90 });
    assert.equal(fondo, 0, `sottotitolo nell'area sicura in basso a ${t}s`);
    assert.equal(cima, 0);
    if (presente) assert.ok(zona > 500, `a ${t}s il sottotitolo deve vedersi (${zona})`);
    else assert.equal(zona, 0, `a ${t}s non ci deve essere sottotitolo (${zona})`);
  }
});

// Marchio del locale pilota (El Tropico Latino) come dati finti; il logo è sintetico (rettangolo blu scuro #2C3E50).
const TROPICO = { primario: '#D61D73', secondario: '#3D7C2B', testo: '#FFFFFF', accento: '#FBCA1E' };

test('/video/reel con logo e cartello finale: il logo piccolo c\'è sulle clip e sparisce nel cartello (mai due loghi)', async () => {
  const a = creaClip('logo-a.mp4', { w: 1080, h: 1920, durata: 4, video: 'grigio' });
  const r = await chiama(s.base, '/video/reel', {
    file: { clip: [a], logo: await creaLogo() },
    dati: { colori: TROPICO, font: 'Roboto Slab', outro: { testo: 'Prenota il tuo tavolo' } },
  });
  const { p } = await controllaVideo(r, 'reel-logo-outro.mp4', { durataAttesa: 6.5 });
  const BLU = [44, 62, 80];
  const zonaLogoPiccolo = { y0: 262, y1: 370, colore: BLU, tolleranza: 60 };
  const clip = await contaPixelColore(fotogramma(p, 1.5), zonaLogoPiccolo);
  assert.ok(clip > 500, `sulle clip il logo piccolo deve vedersi (${clip} pixel)`);
  const cartello = fotogramma(p, 5.5);
  assert.equal(await contaPixelColore(cartello, zonaLogoPiccolo), 0, 'nel cartello finale il logo piccolo in alto non ci deve essere');
  assert.ok(await contaPixelColore(cartello, { y0: 500, y1: 1000, colore: BLU, tolleranza: 60 }) > 1000, 'nel cartello finale c\'è il logo grande');
});

test('/video/reel: durata_max taglia la coda; errori su tagli, durata minima e file non video', async () => {
  const a = creaClip('sub-a.mp4', { w: 1080, h: 1920, durata: 6, video: 'grigio' });
  const b = creaClip('sub-b.mp4', { w: 1080, h: 1920, durata: 6, video: 'grigio', audio: 'nessuno' });
  const r = await chiama(s.base, '/video/reel', { file: { clip: [a, b] }, dati: { durata_max: 4 } });
  await controllaVideo(r, 'reel-4s.mp4', { durataAttesa: 4 });
  assert.ok(r.json.avvisi.some((x) => x.codice === 'durata_tagliata'));

  const fuori = await chiama(s.base, '/video/reel', { file: { clip: [a] }, dati: { tagli: [{ clip: 1, inizio: 0, fine: 2 }] } });
  assert.equal(fuori.stato, 400);
  assert.equal(fuori.json.errore, 'tagli_non_validi');
  const corto = await chiama(s.base, '/video/reel', { file: { clip: [a] }, dati: { tagli: [{ clip: 0, inizio: 0, fine: 2 }] } });
  assert.equal(corto.stato, 422);
  assert.equal(corto.json.errore, 'video_troppo_corto');
  const foto = await creaImmagine('video-non-video.jpg', { w: 400, h: 300, seme: 2 });
  const nonVideo = await chiama(s.base, '/video/reel', { file: { clip: [foto] } });
  assert.equal(nonVideo.stato, 415);
  assert.equal(nonVideo.json.errore, 'video_non_leggibile');
});

test('/video/storia: 75 s richiesti → al massimo 60 s (limite Facebook) con avviso', async (t) => {
  const lunga = creaClip('storia-75s.mp4', { w: 640, h: 360, durata: 80 });
  const ferma = campionaMemoria(s.pid);
  const r = await chiama(s.base, '/video/storia', { file: { clip: lunga, logo: await creaLogo() }, dati: { inizio: 5, fine: 80, sfondo: 'sfocato' } });
  const memoria = ferma();
  t.diagnostic(`storia 60 s: picco memoria servizio+figli ${memoria.piccoTotaleMb} MB ${JSON.stringify(memoria.perProcessoMb)}`);
  assert.ok(memoria.piccoTotaleMb < 1536);
  const { info, durata } = await controllaVideo(r, 'storia-60s.mp4', {});
  assert.ok(durata <= 60 && durata >= 59, `durata ${durata}`);
  for (const st of info.streams) assert.ok(Number(st.duration) <= 60, `${st.codec_type} dura ${st.duration}`);
  assert.ok(r.json.avvisi.some((a) => a.codice === 'durata_tagliata'));
});

test('/video/storia: clip senza audio → traccia audio comunque presente; clip HDR → convertita in SDR; sfondo colore', async () => {
  const hdr = creaClip('storia-hdr.mp4', { w: 1080, h: 1920, durata: 4, audio: 'nessuno', colori: { trc: 'arib-std-b67' } });
  const r = await chiama(s.base, '/video/storia', { file: { clip: hdr }, dati: {} });
  await controllaVideo(r, 'storia-hdr.mp4', { durataAttesa: 4 });
  const codici = r.json.avvisi.map((a) => a.codice);
  assert.ok(codici.includes('audio_silenzioso'));
  assert.ok(codici.includes('hdr_convertito'));

  const oriz = creaClip('storia-oriz.mp4', { w: 1920, h: 1080, durata: 4 });
  const c = await chiama(s.base, '/video/storia', { file: { clip: oriz }, dati: { sfondo: 'colore', colori: { primario: '#FF00FF' } } });
  const { p } = await controllaVideo(c, 'storia-colore.mp4', { durataAttesa: 4 });
  const png = fotogramma(p, 2);
  const alto = await contaPixelColore(png, { y0: 0, y1: 300, colore: [255, 0, 255], tolleranza: 40 });
  assert.ok(alto > 1080 * 250, 'sopra e sotto la clip orizzontale c\'è il colore pieno');
  assert.ok(c.json.avvisi.some((a) => a.codice === 'sfondo_colore'));
  const sbagliato = await chiama(s.base, '/video/storia', { file: { clip: oriz }, dati: { sfondo: 'arcobaleno' } });
  assert.equal(sbagliato.stato, 400);
});
