// Prove font: download al primo uso da un finto "Google Fonts" locale (nessuna chiamata a Google), cache su disco,
// ricordo dei font inesistenti, host non ammessi rifiutati, nome di famiglia letto dal TTF.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { avviaServer, chiama, scarica, contaPixelColore, MATERIALE, RADICE } from './aiuti.js';
import { nomeFamigliaTtf, urlDalCss } from '../src/font.js';

let finto;
let porta;
const richieste = [];
let s;

before(async () => {
  finto = http.createServer((req, res) => {
    richieste.push(req.url);
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/css2') {
      const famiglia = u.searchParams.get('family') || '';
      if (famiglia.startsWith('Prova Font')) {
        res.setHeader('content-type', 'text/css');
        res.end(`@font-face { font-family: 'Prova Font'; font-style: normal; font-weight: 400; src: url(http://127.0.0.1:${porta}/f/400.ttf) format('truetype'); }
@font-face { font-family: 'Prova Font'; font-style: normal; font-weight: 700; src: url(http://127.0.0.1:${porta}/f/700.ttf) format('truetype'); }`);
        return;
      }
      if (famiglia.startsWith('Font Altrove')) {
        res.end(`@font-face { font-family: 'Font Altrove'; font-weight: 400; src: url(http://altrove.invalid/f.ttf) format('truetype'); }`);
        return;
      }
      res.statusCode = 400;
      res.end('famiglia sconosciuta');
      return;
    }
    if (u.pathname === '/f/400.ttf' || u.pathname === '/f/700.ttf') {
      const peso = u.pathname.includes('700') ? 700 : 400;
      res.end(fs.readFileSync(path.join(RADICE, 'font', `PlayfairDisplay-${peso}.ttf`)));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => finto.listen(0, '127.0.0.1', r));
  porta = finto.address().port;
  s = await avviaServer({ FONT_RETE: 'si', FONT_CSS_URL: `http://127.0.0.1:${porta}/css2`, FONT_HOST_AMMESSI: `127.0.0.1:${porta}` });
});

after(async () => {
  await s?.ferma();
  finto?.close();
});

async function foto() {
  const p = path.join(MATERIALE, 'font-foto.jpg');
  if (!fs.existsSync(p)) await sharp({ create: { width: 1200, height: 1600, channels: 3, background: '#556677' } }).jpeg().toFile(p);
  return p;
}

const dati = (font) => ({ modello: 'fascia', righe: [{ testo: 'Prova del carattere', ruolo: 'titolo' }], font });

test('primo uso: il font si scarica, va in cache su /dati/font-cache; secondo uso: nessun nuovo download', async () => {
  const r1 = await chiama(s.base, '/grafica/storia', { file: { foto: await foto() }, dati: dati('Prova Font') });
  assert.equal(r1.stato, 200, JSON.stringify(r1.json));
  assert.ok(!r1.json.avvisi.some((a) => a.codice === 'font_non_disponibile'), JSON.stringify(r1.json.avvisi));
  assert.ok(fs.existsSync(path.join(s.datiDir, 'font-cache', 'prova-font-400.ttf')));
  assert.ok(fs.existsSync(path.join(s.datiDir, 'font-cache', 'prova-font-700.ttf')));
  const dopoPrimo = richieste.length;
  assert.equal(richieste.filter((u) => u.startsWith('/css2')).length, 1);
  assert.match(richieste[0], /family=Prova\+Font:wght@400;700/);
  const r2 = await chiama(s.base, '/grafica/storia', { file: { foto: await foto() }, dati: dati('Prova Font') });
  assert.equal(r2.stato, 200);
  assert.equal(richieste.length, dopoPrimo, 'il secondo uso deve leggere la cache');
});

test('font inesistente: riserva + avviso, e il fallimento si ricorda (nessun nuovo tentativo per 24 ore)', async () => {
  const r = await chiama(s.base, '/grafica/storia', { file: { foto: await foto() }, dati: dati('Non Esiste Davvero') });
  assert.equal(r.stato, 200);
  assert.ok(r.json.avvisi.some((a) => a.codice === 'font_non_disponibile'));
  assert.ok(fs.existsSync(path.join(s.datiDir, 'font-cache', 'non-esiste-davvero.mancante')));
  const prima = richieste.length;
  await chiama(s.base, '/grafica/storia', { file: { foto: await foto() }, dati: dati('Non Esiste Davvero') });
  assert.equal(richieste.length, prima);
});

test('un file di font su un host non ammesso non si scarica (riserva + avviso)', async () => {
  const r = await chiama(s.base, '/grafica/storia', { file: { foto: await foto() }, dati: dati('Font Altrove') });
  assert.equal(r.stato, 200);
  assert.ok(r.json.avvisi.some((a) => a.codice === 'font_non_disponibile'));
});

test('nome di famiglia letto dal TTF e lettura del CSS di Google', () => {
  assert.equal(nomeFamigliaTtf(fs.readFileSync(path.join(RADICE, 'font', 'Inter-400.ttf'))), 'Inter');
  assert.equal(nomeFamigliaTtf(fs.readFileSync(path.join(RADICE, 'font', 'PlayfairDisplay-700.ttf'))), 'Playfair Display');
  const css = `@font-face { font-style: italic; font-weight: 400; src: url(https://fonts.gstatic.com/i.ttf) }
  @font-face { font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/r.ttf) format('truetype'); }
  @font-face { font-style: normal; font-weight: 700; src: url(https://fonts.gstatic.com/b.ttf) format('truetype'); }`;
  assert.deepEqual(urlDalCss(css), { 400: 'https://fonts.gstatic.com/r.ttf', 700: 'https://fonts.gstatic.com/b.ttf' });
});

// Peso dei titoli: Roboto Slab 800 (incluso) disegna tratti più spessi del 700: più pixel del colore del testo.
async function pixelTitolo(peso) {
  const dati = { modello: 'fascia', righe: [{ testo: 'Noche Latina', ruolo: 'titolo' }], font: 'Roboto Slab', colori: { primario: '#103020', testo: '#FF00FF' }, peso_titolo: peso };
  const prima = richieste.length;
  const r = await chiama(s.base, '/grafica/storia', { file: { foto: await foto() }, dati });
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  assert.equal(richieste.length, prima, 'Roboto Slab è incluso: nessun download');
  assert.ok(!r.json.avvisi.some((a) => /^(font|peso)_/.test(a.codice)), JSON.stringify(r.json.avvisi));
  const buf = (await scarica(r.json.file[0].url)).buf;
  return contaPixelColore(buf, { y0: 250, y1: 1580, colore: [255, 0, 255], tolleranza: 90 });
}

test('font inclusi (Roboto Slab 400/700/800, Archivo): nessun download; peso_titolo 800 più spesso del 700', async (t) => {
  const p700 = await pixelTitolo(700);
  const p800 = await pixelTitolo(800);
  t.diagnostic(`pixel del titolo: 800 → ${p800}, 700 → ${p700}`);
  assert.ok(p800 > p700 * 1.04, `pixel del titolo: 800 → ${p800}, 700 → ${p700}`);
  const prima = richieste.length;
  const r = await chiama(s.base, '/grafica/storia', { file: { foto: await foto() }, dati: { ...dati('Roboto Slab'), font_testo: 'Archivo', righe: [{ testo: 'Noche Latina', ruolo: 'titolo' }, { testo: 'Venerdì dalle 21:00', ruolo: 'sotto' }] } });
  assert.equal(r.stato, 200);
  assert.equal(richieste.length, prima, 'Archivo è incluso: nessun download');
  assert.deepEqual(r.json.avvisi, []);
});

test('peso_titolo che la famiglia non ha → grassetto 700 con avviso (e il tentativo si ricorda); peso sbagliato → 700 con avviso', async () => {
  const r = await chiama(s.base, '/grafica/storia', { file: { foto: await foto() }, dati: { ...dati('Prova Font'), peso_titolo: 800 } });
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  assert.ok(r.json.avvisi.some((a) => a.codice === 'peso_non_disponibile'), JSON.stringify(r.json.avvisi));
  assert.ok(richieste.some((u) => /family=Prova\+Font:wght@800/.test(u)));
  assert.ok(fs.existsSync(path.join(s.datiDir, 'font-cache', 'prova-font-800.mancante')));
  const strano = await chiama(s.base, '/grafica/storia', { file: { foto: await foto() }, dati: { ...dati('Inter'), peso_titolo: 'grassetto' } });
  assert.equal(strano.stato, 200);
  assert.ok(strano.json.avvisi.some((a) => a.codice === 'peso_non_valido'));
});
