// Il montaggio «da professionisti»: la striscia verticale che segue il soggetto, i tagli a tempo di musica, la
// stabilizzazione delle clip mosse, i colori uguali fra le clip, la misura dei reel di riferimento.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { avviaServer, chiama, scarica, ffmpeg, MATERIALE, TMP, CHIAVE } from './aiuti.js';
import { centroSoggetto, centroInImmagine } from '../src/soggetto.js';
import { grafoInquadratura } from '../src/regia-render.js';

const CFG = { ffmpeg: 'ffmpeg' };
const H = { 'x-officina-chiave': CHIAVE, 'content-type': 'application/json' };
const clip = (nome, args) => {
  const p = path.join(MATERIALE, nome);
  if (!fs.existsSync(p)) ffmpeg([...args, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', p]);
  return p;
};
// un quadro nero 16:9 con un soggetto colorato (testsrc2) in una posizione: x del suo angolo sinistro
const conSoggetto = (nome, x, durata = 6) => clip(nome, ['-f', 'lavfi', '-i', `color=c=black:s=1920x1080:d=${durata}:r=25`, '-f', 'lavfi', '-i', `testsrc2=s=360x360:d=${durata}:r=25`,
  '-filter_complex', `[0:v][1:v]overlay=x=${x}:y=360`, '-t', String(durata)]);
const VERTICALE = { w: 1080, h: 1920 };

let s;
before(async () => { s = await avviaServer(); });
after(async () => { await s?.ferma(); });
const progettoNuovo = async (nome) => (await (await fetch(`${s.base}/progetto`, { method: 'POST', headers: H, body: JSON.stringify({ nome }) })).json()).progetto;
const carica = async (pid, f) => chiama(s.base, `/progetto/${pid}/materiale`, { dati: { nome: path.basename(f), drive_id: f }, file: { file: f } });
// quanta «roba» (pixel non neri) c'è al centro di un fotogramma del video, in una fascia larga quanto metà quadro
async function soggettoAlCentro(video, t) {
  const png = path.join(TMP, `${path.basename(video)}-${t}.png`);
  ffmpeg(['-ss', String(t), '-i', video, '-frames:v', '1', '-y', png]);
  const { data, info } = await sharp(png).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  let accesi = 0; let tot = 0;
  for (let y = Math.round(info.height * 0.3); y < info.height * 0.7; y += 4) {
    for (let x = Math.round(info.width * 0.25); x < info.width * 0.75; x += 4) { tot++; if (data[y * info.width + x] > 40) accesi++; }
  }
  return accesi / tot;
}

test('soggetto: il centro segue quello che conta; vicino al centro resta il centro; senza fotogrammi null', async () => {
  const destra = await centroSoggetto(conSoggetto('sg-destra.mp4', 1350), 0, 6, VERTICALE, CFG);
  const sinistra = await centroSoggetto(conSoggetto('sg-sinistra.mp4', 200), 0, 6, VERTICALE, CFG);
  const centro = await centroSoggetto(conSoggetto('sg-centro.mp4', 780), 0, 6, VERTICALE, CFG);
  assert.ok(destra > 0.7 && destra < 0.9, `a destra: ${destra}`);
  assert.ok(sinistra > 0.1 && sinistra < 0.3, `a sinistra: ${sinistra}`);
  assert.equal(centro, 0.5, 'quasi al centro = centro');
  assert.equal(await centroSoggetto(path.join(TMP, 'non-esiste.mp4'), 0, 2, VERTICALE, CFG), null);
  // un'immagine già stretta come il formato non ha niente da ritagliare
  const stretta = await sharp({ create: { width: 270, height: 480, channels: 3, background: '#000' } }).png().toBuffer();
  assert.equal(await centroInImmagine(stretta, VERTICALE), 0.5);
});

test('soggetto: la posizione in numero diventa il centro del ritaglio; le parole restano come prima', () => {
  const info = { larghezza: 1920, altezza: 1080, trasferimento: '' };
  assert.match(grafoInquadratura(info, VERTICALE, { modo: 'riempi', posizione: 0.8 }), /crop=1080:1920:max\(0\\,min\(iw-ow\\,0\.800\*iw-ow\/2\)\)/);
  assert.match(grafoInquadratura(info, VERTICALE, { modo: 'riempi', posizione: 7 }), /1\.000\*iw/, 'fuori scala: si tiene dentro');
  assert.match(grafoInquadratura(info, VERTICALE, { modo: 'riempi', posizione: 'sinistra' }), /iw\/3-ow\/2/);
  assert.match(grafoInquadratura(info, VERTICALE, { modo: 'riempi', posizione: 'centro' }), /iw\/2-ow\/2/);
});

test('soggetto: nel reel verticale la copertura senza posizione segue il soggetto; con la posizione scritta resta dove dice la regia', async () => {
  const f = conSoggetto('sg-reel-destra.mp4', 1450, 8);
  const pid = await progettoNuovo('soggetto');
  assert.equal((await carica(pid, f)).stato, 200);
  const monta = async (coperture) => {
    const r = await chiama(s.base, `/progetto/${pid}/regia/monta`, { dati: { piano: { battute: [{ immagini: 5, coperture }] }, stile: 'sdg', formato: 'verticale' }, file: {} });
    assert.equal(r.stato, 200, JSON.stringify(r.json));
    const p = path.join(TMP, `sg-${coperture[0].replace(/\W/g, '_')}.mp4`);
    fs.writeFileSync(p, (await scarica(r.json.file.find((x) => x.tipo === 'video').url)).buf);
    return p;
  };
  const auto = await soggettoAlCentro(await monta(['V01.1']), 2.5);
  const fermo = await soggettoAlCentro(await monta(['V01.1 centro']), 2.5);
  assert.ok(auto > 0.5, `il soggetto dovrebbe stare al centro del reel: ${auto.toFixed(2)}`);
  assert.ok(fermo < 0.05, `con «centro» scritto dalla regia la striscia resta al centro della clip (soggetto fuori): ${fermo.toFixed(2)}`);
});
