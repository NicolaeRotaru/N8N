// Prove foto: /foto/provino e /foto/prepara (formati esatti, JPEG ≤ 8 MB, mai estensione, mai ingrandimento).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { avviaServer, chiama, scarica, creaImmagine, creaLogo, MATERIALE } from './aiuti.js';
import { jpegEntro } from '../src/immagini.js';

let s;
before(async () => {
  s = await avviaServer();
});
after(async () => s?.ferma());

const MB = 1024 * 1024;

async function gradiente(nome, w, h) {
  const p = path.join(MATERIALE, nome);
  if (fs.existsSync(p)) return p;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6a00"/><stop offset="0.5" stop-color="#2a9d8f"/><stop offset="1" stop-color="#3a0ca3"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toFile(p);
  return p;
}

// Deviazione standard dei pixel di una fila/colonna: ≈0 se è una banda di colore pieno (= estensione).
async function bordiUniformi(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const dev = (pixel) => {
    const media = pixel.reduce((a, b) => a + b, 0) / pixel.length;
    return Math.sqrt(pixel.reduce((a, b) => a + (b - media) ** 2, 0) / pixel.length);
  };
  const fila = (y) => Array.from({ length: info.width }, (_, x) => data[(y * info.width + x) * 3] + data[(y * info.width + x) * 3 + 1] + data[(y * info.width + x) * 3 + 2]);
  const colonna = (x) => Array.from({ length: info.height }, (_, y) => data[(y * info.width + x) * 3] + data[(y * info.width + x) * 3 + 1] + data[(y * info.width + x) * 3 + 2]);
  return [dev(fila(1)), dev(fila(info.height - 2)), dev(colonna(1)), dev(colonna(info.width - 2))].map((d) => d < 2);
}

test('/foto/provino: 12 foto (anche pesanti), griglia JPEG ≤ 1568 px e ≤ 3,5 MB, misure per ogni foto', async () => {
  const foto = [];
  for (let i = 1; i <= 10; i++) foto.push(await creaImmagine(`provino-${i}.jpg`, { seme: i, w: i % 3 ? 4000 : 3000, h: i % 3 ? 3000 : 4500, rumore: i <= 2 }));
  // 11 = quasi doppione della 3 (più chiara e rimpicciolita); 12 = la 4 sfocata (meno nitida)
  const doppione = path.join(MATERIALE, 'provino-11.jpg');
  if (!fs.existsSync(doppione)) await sharp(foto[2]).modulate({ brightness: 1.06 }).resize(2600).jpeg({ quality: 88 }).toFile(doppione);
  const sfocata = path.join(MATERIALE, 'provino-12.jpg');
  if (!fs.existsSync(sfocata)) await sharp(foto[3]).blur(8).jpeg({ quality: 90 }).toFile(sfocata);
  foto.push(doppione, sfocata);

  const r = await chiama(s.base, '/foto/provino', { file: { foto } });
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  const d = await scarica(r.json.provino.url);
  assert.equal(d.stato, 200);
  assert.ok(d.buf.length <= 3.5 * MB, `provino di ${d.buf.length} byte`);
  const m = await sharp(d.buf).metadata();
  assert.equal(m.format, 'jpeg');
  assert.ok(Math.max(m.width, m.height) <= 1568);
  assert.equal(m.width, r.json.provino.larghezza);
  assert.equal(m.height, r.json.provino.altezza);

  const f = r.json.foto;
  assert.equal(f.length, 12);
  f.forEach((x, i) => {
    assert.equal(x.numero, i + 1);
    assert.equal(x.nome_file, path.basename(foto[i]));
    assert.deepEqual(Object.keys(x).sort(), ['altezza', 'doppione_di', 'larghezza', 'luminosita', 'nitidezza', 'nome_file', 'numero', 'orientamento']);
    assert.ok(x.luminosita >= 0 && x.luminosita <= 255);
    assert.ok(x.nitidezza >= 0);
  });
  assert.equal(f[0].larghezza, 4000);
  assert.equal(f[0].altezza, 3000);
  assert.equal(f[0].orientamento, 'orizzontale');
  assert.equal(f[2].orientamento, 'verticale');
  assert.equal(f[10].doppione_di, 3, 'la 11 è il doppione della 3');
  assert.equal(f[11].doppione_di, 4, 'la 12 (sfocata) è la stessa scena della 4');
  assert.ok(f[11].nitidezza < f[3].nitidezza / 3, `sfocata ${f[11].nitidezza} vs originale ${f[3].nitidezza}`);
  for (const i of [0, 1, 3, 4, 5]) assert.equal(f[i].doppione_di, null, `la foto ${i + 1} non è un doppione`);
});

test('/foto/provino: orientamento EXIF rispettato; meno di 2 o più di 12 foto → 400', async () => {
  const girata = path.join(MATERIALE, 'provino-exif6.jpg');
  if (!fs.existsSync(girata)) await sharp(await creaImmagine('provino-base-exif.jpg', { w: 3000, h: 2000, seme: 21 })).withMetadata({ orientation: 6 }).jpeg().toFile(girata);
  const altra = await creaImmagine('provino-1.jpg', { seme: 1, w: 4000, h: 3000, rumore: true });
  const r = await chiama(s.base, '/foto/provino', { file: { foto: [girata, altra] } });
  assert.equal(r.stato, 200);
  assert.equal(r.json.foto[0].larghezza, 2000);
  assert.equal(r.json.foto[0].altezza, 3000);
  assert.equal(r.json.foto[0].orientamento, 'verticale');

  const una = await chiama(s.base, '/foto/provino', { file: { foto: [altra] } });
  assert.equal(una.stato, 400);
  assert.equal(una.json.errore, 'file_mancante');
  const tredici = await chiama(s.base, '/foto/provino', { file: { foto: Array(13).fill(girata) } });
  assert.equal(tredici.stato, 400);
  assert.equal(tredici.json.errore, 'troppi_file');
});

// I workflow mandano un campo di testo vuoto per ogni posto libero (campo_vuoto_N): l'officina li ignora.
// Prima il limite era 10 campi di testo, «dati» compreso: un provino con 2 foto e 10 segnaposto dava 400.
test('/foto/provino: segnaposto vuoti ignorati (2 foto + 10 segnaposto, 12 foto + 11 segnaposto); oltre 40 campi di testo → 400', async () => {
  const segnaposto = (n) => Array.from({ length: n }, (_, i) => [`campo_vuoto_${i + 1}`, '']);
  const due = [await creaImmagine('provino-1.jpg', { seme: 1, w: 4000, h: 3000, rumore: true }), await creaImmagine('provino-2.jpg', { seme: 2, w: 4000, h: 3000, rumore: true })];
  const r = await chiama(s.base, '/foto/provino', { file: { foto: due }, altriCampi: segnaposto(10) });
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  assert.equal(r.json.foto.length, 2);
  const dodici = Array.from({ length: 12 }, (_, i) => due[i % 2]);
  const r12 = await chiama(s.base, '/foto/provino', { file: { foto: dodici }, altriCampi: [...segnaposto(10), ['campo_vuoto_logo', '']] });
  assert.equal(r12.stato, 200, JSON.stringify(r12.json));
  assert.equal(r12.json.foto.length, 12);
  const troppi = await chiama(s.base, '/foto/provino', { file: { foto: due }, altriCampi: segnaposto(40) });
  assert.equal(troppi.stato, 400);
  assert.equal(troppi.json.errore, 'troppi_campi');
  assert.match(troppi.json.messaggio, /40/);
});

test('/foto/prepara: misure esatte per formato, JPEG sRGB senza metadati ≤ 8 MB, miniatura ≤ 1080 px, nessuna banda (mai estensione)', async () => {
  const sorgente = await gradiente('prepara-gradiente.jpg', 4000, 3000);
  const r = await chiama(s.base, '/foto/prepara', {
    file: { foto: sorgente, logo: await creaLogo() },
    dati: { formati: ['4:5', '9:16', '1:1'], stile: { luminosita: 1, contrasto: 1.05, saturazione: 1.05, calore: 0 }, logo: { posizione: 'alto-sinistra', larghezza_percento: 15 } },
  });
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  const attese = { '4:5': [1080, 1350], '9:16': [1080, 1920], '1:1': [1080, 1080] };
  assert.equal(r.json.file.length, 3);
  for (const f of r.json.file) {
    const d = await scarica(f.url);
    assert.equal(d.buf[0], 0xff);
    assert.equal(d.buf[1], 0xd8);
    assert.ok(d.buf.length <= 8 * MB);
    assert.equal(d.buf.length, f.byte);
    const m = await sharp(d.buf).metadata();
    assert.deepEqual([m.width, m.height], attese[f.formato]);
    assert.deepEqual([f.larghezza, f.altezza], attese[f.formato]);
    assert.equal(m.space, 'srgb');
    assert.equal(m.exif, undefined, 'niente EXIF');
    assert.equal(m.icc, undefined, 'niente profilo incorporato (sRGB implicito)');
    const uniformi = await bordiUniformi(d.buf);
    // il logo sta in alto a sinistra ma a distanza dal bordo: le file ai bordi devono restare foto vera
    assert.deepEqual(uniformi, [false, false, false, false], `bande di colore pieno ai bordi nel ${f.formato}`);
  }
  assert.ok(r.json.avvisi.some((a) => a.codice === 'taglio_forte'), 'una foto 4:3 portata a 9:16 perde molto: deve avvisare');
  const mini = await scarica(r.json.miniatura.url);
  const mm = await sharp(mini.buf).metadata();
  assert.ok(Math.max(mm.width, mm.height) <= 1080);
  assert.ok(mini.buf.length <= 3.75 * MB);
});

test('/foto/prepara: foto piccola → nessun ingrandimento, rapporto esatto, avviso risoluzione_bassa', async () => {
  const piccola = await gradiente('prepara-piccola.jpg', 600, 400);
  const r = await chiama(s.base, '/foto/prepara', { file: { foto: piccola }, dati: { formati: ['4:5'] } });
  assert.equal(r.stato, 200);
  const m = await sharp((await scarica(r.json.file[0].url)).buf).metadata();
  assert.deepEqual([m.width, m.height], [320, 400]);
  assert.ok(r.json.avvisi.some((a) => a.codice === 'risoluzione_bassa'));
});

test('/foto/prepara: foto da più di 8 MB esce ≤ 8 MB; stile più luminoso = pixel più chiari; formato sconosciuto → 400', async () => {
  const pesante = await creaImmagine('prepara-pesante.jpg', { w: 6000, h: 4000, seme: 33, rumore: true });
  assert.ok(fs.statSync(pesante).size > 8 * MB, `la foto di prova pesa ${fs.statSync(pesante).size} byte`);
  const neutra = await chiama(s.base, '/foto/prepara', { file: { foto: pesante }, dati: { formati: ['4:5'] } });
  const chiara = await chiama(s.base, '/foto/prepara', { file: { foto: pesante }, dati: { formati: ['4:5'], stile: { luminosita: 1.3 } } });
  assert.equal(neutra.stato, 200);
  assert.ok(neutra.json.file[0].byte <= 8 * MB);
  const media = async (u) => (await sharp((await scarica(u)).buf).stats()).channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3;
  assert.ok((await media(chiara.json.file[0].url)) > (await media(neutra.json.file[0].url)) + 5);

  const fuori = await chiama(s.base, '/foto/prepara', { file: { foto: pesante }, dati: { formati: ['5:7'] } });
  assert.equal(fuori.stato, 400);
  assert.equal(fuori.json.errore, 'formato_non_valido');
  const estremo = await chiama(s.base, '/foto/prepara', { file: { foto: pesante }, dati: { formati: ['1:1'], stile: { luminosita: 9 } } });
  assert.equal(estremo.stato, 200);
  assert.ok(estremo.json.avvisi.some((a) => a.codice === 'stile_limitato'));
});

test('jpegEntro: rispetta il limite di byte scendendo di qualità, oppure si ferma con un errore', async () => {
  const rumore = await creaImmagine('jpeg-rumore.png', { w: 1500, h: 1500, seme: 7, formato: 'png', rumore: true });
  const libero = await jpegEntro(rumore, 50 * MB, { qualita: 95 });
  const limite = Math.floor(libero.buf.length * 0.5);
  const stretto = await jpegEntro(rumore, limite, { qualita: 95 });
  assert.ok(stretto.buf.length <= limite);
  assert.ok(stretto.qualita < 95);
  await assert.rejects(() => jpegEntro(rumore, 1000, { qualita: 95 }), (e) => e.codice === 'jpeg_troppo_grande');
});
