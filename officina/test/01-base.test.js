// Prove di base: /salute, chiave (401), errori nel formato del contratto, limiti dei file, /confronto.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { avviaServer, chiama, scarica, creaImmagine, CHIAVE, RADICE, MATERIALE } from './aiuti.js';

let s;
before(async () => {
  s = await avviaServer();
});
after(async () => s?.ferma());

test('/salute senza chiave risponde solo {ok:true}', async () => {
  const r = await fetch(`${s.base}/salute`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  const sbagliata = await fetch(`${s.base}/salute`, { headers: { 'x-officina-chiave': 'sbagliata' } });
  assert.deepEqual(await sbagliata.json(), { ok: true });
});

test('GET / (controllo di salute della piattaforma) risponde {ok:true} senza chiave e senza dati; POST / resta chiuso', async () => {
  const r = await fetch(`${s.base}/`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  const conChiave = await fetch(`${s.base}/`, { headers: { 'x-officina-chiave': CHIAVE } });
  assert.deepEqual(await conChiave.json(), { ok: true });
  const post = await fetch(`${s.base}/`, { method: 'POST' });
  assert.equal(post.status, 401);
  const altro = await fetch(`${s.base}/qualcosa`);
  assert.equal(altro.status, 401);
});

test('/salute con chiave risponde con tutti i campi del contratto', async () => {
  const r = await fetch(`${s.base}/salute`, { headers: { 'x-officina-chiave': CHIAVE } });
  const j = await r.json();
  assert.deepEqual(Object.keys(j).sort(), ['coda', 'ffmpeg', 'filtri', 'memoria_mb', 'ok', 'telegram', 'versione', 'whisper']);
  assert.equal(j.ok, true);
  assert.equal(j.ffmpeg, true);
  assert.equal(j.filtri.ok, true, JSON.stringify(j.filtri));
  assert.equal(j.whisper, false); // nelle prove di base whisper punta a un file che non esiste
  assert.equal(j.coda, 0);
  assert.ok(j.memoria_mb > 10 && j.memoria_mb < 1536);
  assert.match(j.versione, /^\d+\.\d+\.\d+$/);
});

test('401 senza chiave o con chiave sbagliata, su lavori e file', async () => {
  const a = await creaImmagine('base-a.jpg', { w: 800, h: 600, seme: 3 });
  const senza = await chiama(s.base, '/confronto', { file: { originale: a, risultato: a }, chiave: null });
  assert.equal(senza.stato, 401);
  assert.equal(senza.json.errore, 'non_autorizzato');
  assert.equal(typeof senza.json.messaggio, 'string');
  const sbagliata = await chiama(s.base, '/foto/provino', { file: { foto: [a, a] }, chiave: 'quasi-giusta-ma-no-quasi-giusta' });
  assert.equal(sbagliata.stato, 401);
  const file = await scarica(`${s.base}/file/0123456789abcdef0123/provino.jpg`, null);
  assert.equal(file.stato, 401);
});

test('/confronto: due immagini affiancate, JPEG con lato lungo ≤ 1568 px e ≤ 3,5 MB', async () => {
  const a = await creaImmagine('base-oriz.jpg', { w: 3000, h: 2000, seme: 4 });
  const b = await creaImmagine('base-vert.jpg', { w: 1080, h: 1920, seme: 5 });
  const r = await chiama(s.base, '/confronto', { file: { originale: a, risultato: b } });
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  assert.match(r.json.id, /^[a-f0-9]{20}$/);
  assert.equal(r.json.file.length, 1);
  const d = await scarica(r.json.file[0].url);
  assert.equal(d.stato, 200);
  assert.equal(d.tipo, 'image/jpeg');
  assert.ok(d.buf.length <= 3.5 * 1024 * 1024);
  const m = await sharp(d.buf).metadata();
  assert.equal(m.format, 'jpeg');
  assert.ok(Math.max(m.width, m.height) <= 1568, `${m.width}x${m.height}`);
});

test('errori nel formato {errore, messaggio}: non multipart, dati non JSON, campo sconosciuto, file mancante, immagine illeggibile, indirizzo inesistente', async () => {
  const j = await fetch(`${s.base}/foto/prepara`, { method: 'POST', headers: { 'x-officina-chiave': CHIAVE, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(j.status, 415);
  assert.equal((await j.json()).errore, 'serve_multipart');

  const a = await creaImmagine('base-a.jpg', { w: 800, h: 600, seme: 3 });
  const fd = new FormData();
  fd.append('dati', '{non è json');
  fd.append('foto', await fs.openAsBlob(a), 'a.jpg');
  const r1 = await fetch(`${s.base}/foto/prepara`, { method: 'POST', body: fd, headers: { 'x-officina-chiave': CHIAVE } });
  assert.equal(r1.status, 400);
  assert.equal((await r1.json()).errore, 'dati_non_validi');

  const r2 = await chiama(s.base, '/foto/prepara', { file: { foto: a, sbagliato: a } });
  assert.equal(r2.stato, 400);
  assert.equal(r2.json.errore, 'campo_sconosciuto');

  const r3 = await chiama(s.base, '/grafica/storia', { file: {} });
  assert.equal(r3.stato, 400);
  assert.equal(r3.json.errore, 'file_mancante');

  const testo = path.join(MATERIALE, 'non-immagine.jpg');
  fs.writeFileSync(testo, 'questo non è un jpeg '.repeat(100));
  const r4 = await chiama(s.base, '/foto/prepara', { file: { foto: testo } });
  assert.equal(r4.stato, 415);
  assert.equal(r4.json.errore, 'formato_file_non_supportato');

  const r5 = await fetch(`${s.base}/non/esiste`, { headers: { 'x-officina-chiave': CHIAVE } });
  assert.equal(r5.status, 404);
  assert.equal((await r5.json()).errore, 'non_trovato');

  const r6 = await scarica(`${s.base}/file/0123456789abcdef0123/provino.jpg`);
  assert.equal(r6.stato, 404);
  const r7 = await scarica(`${s.base}/file/..%2F..%2Fetc/passwd`);
  assert.equal(r7.stato, 404);
  // un file FUORI dalle cartelle dei lavori non si deve poter leggere risalendo con ".."
  fs.mkdirSync(path.join(s.datiDir, 'segreto', 'out'), { recursive: true });
  fs.writeFileSync(path.join(s.datiDir, 'segreto', 'out', 'dati.jpg'), 'riservato');
  const r8 = await scarica(`${s.base}/file/..%2Fsegreto/dati.jpg`);
  assert.equal(r8.stato, 404);
});

test('limiti: file oltre il limite (413 file_troppo_grande) e richiesta oltre il totale (413 richiesta_troppo_grande)', async () => {
  // Limiti ridotti con le stesse variabili d'ambiente che in produzione valgono 300 MB e 800 MB.
  const piccolo = await avviaServer({ MAX_FILE_MB: '1', MAX_TOTALE_MB: '1.5' });
  try {
    const grande = await creaImmagine('base-rumore.png', { w: 1200, h: 800, seme: 9, formato: 'png', rumore: true });
    assert.ok(fs.statSync(grande).size > 1024 * 1024);
    const r1 = await chiama(piccolo.base, '/foto/prepara', { file: { foto: grande } });
    assert.equal(r1.stato, 413);
    assert.equal(r1.json.errore, 'file_troppo_grande');
    const medio = path.join(MATERIALE, 'base-900k.bin');
    fs.writeFileSync(medio, Buffer.alloc(900 * 1024, 7));
    const r2 = await chiama(piccolo.base, '/confronto', { file: { originale: medio, risultato: medio } });
    assert.equal(r2.stato, 413);
    assert.equal(r2.json.errore, 'richiesta_troppo_grande');
  } finally {
    await piccolo.ferma();
  }
});

test('senza OFFICINA_CHIAVE il servizio non parte', () => {
  const r = spawnSync(process.execPath, [path.join(RADICE, 'src', 'server.js')], {
    env: { ...process.env, OFFICINA_CHIAVE: '', DATI_DIR: path.join(MATERIALE, 'dati-senza-chiave'), PORT: '0' },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /OFFICINA_CHIAVE/);
});
