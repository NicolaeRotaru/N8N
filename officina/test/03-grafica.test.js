// Prove grafiche: misure esatte, aree sicure delle storie senza testo (misurate sui pixel), testo che si adatta,
// mai «…»: se non entra → 422 testo_troppo_lungo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { avviaServer, chiama, scarica, creaLogo, contaPixelColore, MATERIALE } from './aiuti.js';

let s;
before(async () => {
  s = await avviaServer();
});
after(async () => s?.ferma());

const MAGENTA = [255, 0, 255];
const COLORI = { primario: '#103020', secondario: '#F3E9D2', testo: '#FF00FF' }; // testo magenta: facile da trovare nei pixel

async function fotoGrigia() {
  const p = path.join(MATERIALE, 'grafica-grigia.jpg');
  if (!fs.existsSync(p)) await sharp({ create: { width: 3000, height: 4000, channels: 3, background: '#808080' } }).jpeg().toFile(p);
  return p;
}

const RIGHE_NORMALI = [
  { testo: 'Aperitivo del giovedì in terrazza', ruolo: 'titolo' },
  { testo: 'Dalle 18:30 con musica dal vivo', ruolo: 'sotto' },
];
const RIGHE_LUNGHE = [
  { testo: 'Aperitivo lungo del giovedì sera in terrazza con gli amici e tutta la famiglia', ruolo: 'titolo' },
  { testo: 'Dalle 18:30 alle 21:30 musica dal vivo con il trio jazz della città, tavoli all’aperto', ruolo: 'sotto' },
  { testo: 'Prenotazione consigliata: scrivici o chiamaci, ti teniamo il posto migliore', ruolo: 'sotto' },
  { testo: 'Via di prova 12, vicino alla piazza grande del centro storico', ruolo: 'sotto' },
];

async function controllaStoria(r, { conTesto = true } = {}) {
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  const d = await scarica(r.json.file[0].url);
  assert.ok(d.buf.length <= 8 * 1024 * 1024);
  const m = await sharp(d.buf).metadata();
  assert.equal(m.format, 'jpeg');
  assert.deepEqual([m.width, m.height], [1080, 1920]);
  const sopra = await contaPixelColore(d.buf, { y0: 0, y1: 250, colore: MAGENTA });
  const sotto = await contaPixelColore(d.buf, { y0: 1920 - 340, y1: 1920, colore: MAGENTA });
  const dentro = await contaPixelColore(d.buf, { y0: 250, y1: 1920 - 340, colore: MAGENTA });
  assert.equal(sopra, 0, 'testo nei 250 px in alto');
  assert.equal(sotto, 0, 'testo nei 340 px in basso');
  if (conTesto) assert.ok(dentro > 300, `il testo deve esserci nell'area sicura (${dentro} pixel)`);
  else assert.equal(dentro, 0);
  const c = await scarica(r.json.confronto.url);
  const mc = await sharp(c.buf).metadata();
  assert.ok(Math.max(mc.width, mc.height) <= 1568 && c.buf.length <= 3.5 * 1024 * 1024);
  return d.buf;
}

for (const modello of ['fascia', 'titolo', 'cornice']) {
  test(`/grafica/storia «${modello}»: 1080×1920, niente testo nelle aree sicure, anche con testo lungo (corpo ridotto)`, async () => {
    const foto = await fotoGrigia();
    const logo = await creaLogo();
    const normale = await chiama(s.base, '/grafica/storia', { file: { foto, logo }, dati: { modello, righe: RIGHE_NORMALI, colori: COLORI, font: 'Inter' } });
    await controllaStoria(normale);
    assert.ok(!normale.json.avvisi.some((a) => a.codice === 'testo_troppo_lungo'));
    const lungo = await chiama(s.base, '/grafica/storia', { file: { foto, logo }, dati: { modello, righe: RIGHE_LUNGHE, colori: COLORI, font: 'Playfair Display' } });
    const buf = await controllaStoria(lungo);
    assert.ok(lungo.json.avvisi.some((a) => a.codice === 'testo_troppo_lungo'), 'con tanto testo il corpo si riduce e lo dice');
    // il testo resta dentro i margini laterali (72 px)
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    let fuori = 0;
    for (let y = 0; y < info.height; y++) {
      for (const x of [...Array(50).keys(), ...Array.from({ length: 50 }, (_, i) => info.width - 1 - i)]) {
        const i = (y * info.width + x) * info.channels;
        if (Math.abs(data[i] - 255) + data[i + 1] + Math.abs(data[i + 2] - 255) < 60) fuori++;
      }
    }
    assert.equal(fuori, 0, 'testo oltre i margini laterali');
  });
}

test('/grafica/storia: testo che non entra nemmeno al corpo minimo → 422 testo_troppo_lungo (mai «…»)', async () => {
  const foto = await fotoGrigia();
  const righe = Array.from({ length: 6 }, (_, i) => ({ testo: `Riga ${i + 1} ` + 'parola lunga di prova '.repeat(9).trim(), ruolo: i === 0 ? 'titolo' : 'sotto' }));
  for (const modello of ['fascia', 'cornice']) {
    const r = await chiama(s.base, '/grafica/storia', { file: { foto }, dati: { modello, righe, colori: COLORI } });
    assert.equal(r.stato, 422, `${modello}: ${JSON.stringify(r.json)}`);
    assert.equal(r.json.errore, 'testo_troppo_lungo');
  }
});

test('/grafica/storia: una parola lunghissima non esce dai margini (corpo ridotto o 422)', async () => {
  const foto = await fotoGrigia();
  const r = await chiama(s.base, '/grafica/storia', { file: { foto }, dati: { modello: 'titolo', righe: [{ testo: 'Precipitevolissimevolmente', ruolo: 'titolo' }], colori: COLORI } });
  const buf = await controllaStoria(r);
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  let fuori = 0;
  for (let y = 250; y < 1580; y++) {
    for (let x = 0; x < 60; x++) {
      for (const xx of [x, info.width - 1 - x]) {
        const i = (y * info.width + xx) * info.channels;
        if (Math.abs(data[i] - 255) + data[i + 1] + Math.abs(data[i + 2] - 255) < 60) fuori++;
      }
    }
  }
  assert.equal(fuori, 0);
});

test('/grafica/storia «pulita»: nessuna scritta (righe ignorate con avviso), solo il logo', async () => {
  const r = await chiama(s.base, '/grafica/storia', { file: { foto: await fotoGrigia(), logo: await creaLogo() }, dati: { modello: 'pulita', righe: RIGHE_NORMALI, colori: COLORI } });
  await controllaStoria(r, { conTesto: false });
  assert.ok(r.json.avvisi.some((a) => a.codice === 'righe_ignorate'));
});

test('/grafica/post: 1080×1350 per pulita/fascia/titolo; «cornice» non esiste per i post', async () => {
  const foto = await fotoGrigia();
  for (const modello of ['pulita', 'fascia', 'titolo']) {
    const r = await chiama(s.base, '/grafica/post', { file: { foto, logo: await creaLogo() }, dati: { modello, righe: RIGHE_NORMALI, colori: COLORI } });
    assert.equal(r.stato, 200, JSON.stringify(r.json));
    const m = await sharp((await scarica(r.json.file[0].url)).buf).metadata();
    assert.deepEqual([m.width, m.height, m.format], [1080, 1350, 'jpeg']);
  }
  const no = await chiama(s.base, '/grafica/post', { file: { foto }, dati: { modello: 'cornice', righe: RIGHE_NORMALI } });
  assert.equal(no.stato, 400);
  assert.equal(no.json.errore, 'modello_non_valido');
});

test('font non scaricabile → font di riserva con avviso; emoji tolte con avviso; colori sbagliati → neutri con avviso', async () => {
  const r = await chiama(s.base, '/grafica/storia', {
    file: { foto: await fotoGrigia() },
    dati: { modello: 'fascia', righe: [{ testo: 'Serata speciale 🎉🍷', ruolo: 'titolo' }], colori: { primario: 'verde', testo: '#FF00FF' }, font: 'Lobster' },
  });
  await controllaStoria(r);
  const codici = r.json.avvisi.map((a) => a.codice);
  assert.ok(codici.includes('font_non_disponibile'));
  assert.ok(codici.includes('emoji_tolte'));
  assert.ok(codici.includes('colore_non_valido'));
});

// Marchio vero del locale pilota El Tropico Latino (colori misurati sul logo, Roboto Slab 800 per i titoli,
// Archivo per il testo). Logo sintetico largo 1440 px come logo-1440.png del sito; foto sintetica.
const TROPICO = {
  colori: { primario: '#D61D73', secondario: '#3D7C2B', testo: '#FFFFFF', accento: '#FBCA1E' },
  font: 'Roboto Slab',
  font_testo: 'Archivo',
  peso_titolo: 800,
  stile: { luminosita: 1.0, contrasto: 1.05, saturazione: 1.08, calore: 0.02 },
};

async function logoLargo() {
  const p = path.join(MATERIALE, 'logo-1440.png');
  if (!fs.existsSync(p)) await sharp(await creaLogo()).resize(1440).png().toFile(p);
  return p;
}

test('marchio del locale pilota (Tropico): storia e post con Roboto Slab 800 + Archivo inclusi, logo da 1440 px, aree sicure rispettate', async () => {
  const foto = await fotoGrigia();
  const logo = await logoLargo();
  const righe = [{ testo: 'Noche Latina', ruolo: 'titolo' }, { testo: 'Venerdì dalle 21:00', ruolo: 'sotto' }];
  for (const [rotta, modello] of [['/grafica/storia', 'fascia'], ['/grafica/storia', 'cornice'], ['/grafica/post', 'titolo']]) {
    const r = await chiama(s.base, rotta, { file: { foto, logo }, dati: { ...TROPICO, modello, righe } });
    assert.equal(r.stato, 200, JSON.stringify(r.json));
    const codici = r.json.avvisi.map((a) => a.codice);
    for (const c of ['font_non_disponibile', 'peso_non_disponibile', 'peso_non_valido', 'colore_non_valido', 'stile_limitato']) assert.ok(!codici.includes(c), `${rotta} ${modello}: avviso ${c} inatteso`);
    if (rotta === '/grafica/storia') {
      const buf = (await scarica(r.json.file[0].url)).buf;
      const BIANCO = [255, 255, 255];
      assert.equal(await contaPixelColore(buf, { y0: 0, y1: 250, colore: BIANCO, tolleranza: 30 }), 0);
      assert.equal(await contaPixelColore(buf, { y0: 1580, y1: 1920, colore: BIANCO, tolleranza: 30 }), 0);
    }
  }
});

test('/grafica: «stile» del marchio = correzione globale di luce (più luminoso → pixel più chiari), senza contenuto nuovo', async () => {
  const foto = await fotoGrigia();
  const media = async (stile) => {
    const r = await chiama(s.base, '/grafica/storia', { file: { foto }, dati: { modello: 'pulita', ...(stile ? { stile } : {}) } });
    assert.equal(r.stato, 200, JSON.stringify(r.json));
    const st = await sharp((await scarica(r.json.file[0].url)).buf).stats();
    return st.channels[0].mean;
  };
  const neutra = await media(null);
  const chiara = await media({ luminosita: 1.4 });
  assert.ok(chiara > neutra * 1.25, `luminosità ${chiara} contro ${neutra}`);
  const limitata = await chiama(s.base, '/grafica/post', { file: { foto }, dati: { modello: 'pulita', stile: { luminosita: 9 } } });
  assert.ok(limitata.json.avvisi.some((a) => a.codice === 'stile_limitato'));
});
