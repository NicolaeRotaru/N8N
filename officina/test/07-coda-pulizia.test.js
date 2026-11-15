// Prove coda e pulizia: 429 con Retry-After a coda piena, posti liberati quando il client se ne va,
// un solo lavoro pesante alla volta (misurato sui processi), file cancellati dopo la scadenza (simulata).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { avviaServer, chiama, scarica, creaImmagine, creaClip, CHIAVE } from './aiuti.js';
import { Coda } from '../src/coda.js';

const daFermare = [];
after(async () => {
  for (const s of daFermare) await s.ferma();
});

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

async function codaDi(base) {
  const r = await fetch(`${base}/salute`, { headers: { 'x-officina-chiave': CHIAVE } });
  return (await r.json()).coda;
}

async function aspettaCoda(base, valore, ms = 5000) {
  const fine = Date.now() + ms;
  while (Date.now() < fine) {
    if ((await codaDi(base)) === valore) return true;
    await attendi(50);
  }
  return false;
}

// Una richiesta che inizia a caricare un file e poi si ferma: tiene occupato un posto in coda.
function caricamentoLento(base) {
  const u = new URL(`${base}/confronto`);
  const confine = '----provaofficina';
  const req = http.request({
    hostname: u.hostname,
    port: u.port,
    path: u.pathname,
    method: 'POST',
    headers: { 'x-officina-chiave': CHIAVE, 'content-type': `multipart/form-data; boundary=${confine}`, 'transfer-encoding': 'chunked' },
  });
  req.on('error', () => {});
  req.on('response', (res) => res.resume());
  req.write(`--${confine}\r\nContent-Disposition: form-data; name="originale"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`);
  req.write(Buffer.alloc(2048, 1));
  return req;
}

test('coda piena (1 in corso + 5 in attesa): la 7ª richiesta riceve 429 con Retry-After; i posti si liberano quando i client chiudono', async () => {
  const s = await avviaServer();
  daFermare.push(s);
  const lente = Array.from({ length: 6 }, () => caricamentoLento(s.base));
  assert.ok(await aspettaCoda(s.base, 6), 'le 6 richieste lente occupano 6 posti');
  const a = await creaImmagine('coda-a.jpg', { w: 600, h: 400, seme: 8 });
  const r = await chiama(s.base, '/confronto', { file: { originale: a, risultato: a } });
  assert.equal(r.stato, 429);
  assert.equal(r.json.errore, 'coda_piena');
  assert.ok(Number(r.headers.get('retry-after')) >= 1);
  for (const q of lente) q.destroy();
  assert.ok(await aspettaCoda(s.base, 0), 'chiusi i client, la coda torna a zero');
  const ok = await chiama(s.base, '/confronto', { file: { originale: a, risultato: a } });
  assert.equal(ok.stato, 200);
});

test('Coda: un solo lavoro pesante alla volta, in ordine di arrivo, massimo 5 in attesa', async () => {
  const coda = new Coda(5);
  const biglietti = Array.from({ length: 6 }, () => coda.prenota());
  assert.ok(biglietti.every(Boolean));
  assert.equal(coda.prenota(), null, 'il 7° non entra');
  let attivi = 0;
  let picco = 0;
  const ordine = [];
  await Promise.all(biglietti.map(async (b, i) => {
    await b.turno();
    attivi += 1;
    picco = Math.max(picco, attivi);
    ordine.push(i);
    await attendi(10);
    attivi -= 1;
    b.libera();
    b.libera(); // idempotente
  }));
  assert.equal(picco, 1);
  assert.deepEqual(ordine, [0, 1, 2, 3, 4, 5]);
  assert.equal(coda.lunghezza, 0);
  assert.ok(coda.prenota());
});

test('due video chiesti insieme: mai due processi pesanti (ffmpeg/whisper) contemporanei', async () => {
  const s = await avviaServer();
  daFermare.push(s);
  const clip = creaClip('coda-clip.mp4', { w: 640, h: 360, durata: 4 });
  let picco = 0;
  const conta = () => {
    let n = 0;
    for (const voce of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(voce)) continue;
      try {
        const st = fs.readFileSync(`/proc/${voce}/stat`, 'utf8');
        const nome = st.slice(st.indexOf('(') + 1, st.lastIndexOf(')'));
        const ppid = Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]);
        if (ppid === s.pid && (nome === 'ffmpeg' || nome.startsWith('whisper'))) n++;
      } catch {
        // finito
      }
    }
    picco = Math.max(picco, n);
  };
  const t = setInterval(conta, 20);
  const [a, b] = await Promise.all([
    chiama(s.base, '/video/storia', { file: { clip }, dati: {} }),
    chiama(s.base, '/video/storia', { file: { clip }, dati: { sfondo: 'colore' } }),
  ]);
  clearInterval(t);
  assert.equal(a.stato, 200);
  assert.equal(b.stato, 200);
  assert.equal(picco, 1, `processi pesanti contemporanei: ${picco}`);
});

test('pulizia: i file più vecchi di 24 ore (scadenza simulata) si cancellano, quelli nuovi restano', async () => {
  const s = await avviaServer({ PULIZIA_OGNI_SEC: '1' });
  daFermare.push(s);
  const a = await creaImmagine('coda-a.jpg', { w: 600, h: 400, seme: 8 });
  const vecchio = await chiama(s.base, '/confronto', { file: { originale: a, risultato: a } });
  const nuovo = await chiama(s.base, '/confronto', { file: { originale: a, risultato: a } });
  assert.equal((await scarica(vecchio.json.file[0].url)).stato, 200);
  const dir = path.join(s.datiDir, 'lavori', vecchio.json.id);
  const fa25ore = new Date(Date.now() - 25 * 3600 * 1000);
  fs.utimesSync(dir, fa25ore, fa25ore);
  const fine = Date.now() + 5000;
  while (fs.existsSync(dir) && Date.now() < fine) await attendi(100);
  assert.equal(fs.existsSync(dir), false, 'la cartella scaduta va cancellata dalla pulizia automatica');
  assert.equal((await scarica(vecchio.json.file[0].url)).stato, 404);
  assert.equal((await scarica(nuovo.json.file[0].url)).stato, 200);
});

test('un file scaduto non si scarica nemmeno prima del giro di pulizia', async () => {
  const s = await avviaServer({ PULIZIA_OGNI_SEC: '3600' });
  daFermare.push(s);
  const a = await creaImmagine('coda-a.jpg', { w: 600, h: 400, seme: 8 });
  const r = await chiama(s.base, '/confronto', { file: { originale: a, risultato: a } });
  const dir = path.join(s.datiDir, 'lavori', r.json.id);
  const vecchia = new Date(Date.now() - 24 * 3600 * 1000 - 60_000);
  fs.utimesSync(dir, vecchia, vecchia);
  const d = await scarica(r.json.file[0].url);
  assert.equal(d.stato, 404);
  assert.equal(fs.existsSync(dir), false);
});
