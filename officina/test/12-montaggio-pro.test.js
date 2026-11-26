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

// ------------------------------------------------------------------ tagli a tempo di musica
import { trovaBattiti, battitiMusica, battitiSulVideo, tagliATempo } from '../src/battiti.js';
import { SOGLIA_BATTITO } from '../src/regia-render.js';

const suono = (nome, espr, durata = 30) => {
  const p = path.join(MATERIALE, nome);
  if (!fs.existsSync(p)) ffmpeg(['-f', 'lavfi', '-i', `aevalsrc='${espr}':s=44100:d=${durata}`, p]);
  return p;
};
// colpi ogni 0,5 s a partire da 0,13 s (120 battiti al minuto), e un ritmo «vero» a 100: cassa, charleston, un suono lungo
const CLICK120 = () => suono('bt-click120.wav', '0.8*exp(-60*mod(t-0.13\\,0.5))*sin(2*PI*120*t)*gte(t\\,0.13)');
const BEAT100 = () => suono('bt-beat100.wav', '0.9*exp(-25*mod(t-0.2\\,0.6))*sin(2*PI*55*t)*gte(t\\,0.2) + 0.25*exp(-120*mod(t-0.5\\,0.6))*sin(2*PI*7000*t)*gte(t\\,0.5) + 0.15*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*0.25*t))', 40);
const RUMORE = () => { const p = path.join(MATERIALE, 'bt-rumore.wav'); if (!fs.existsSync(p)) ffmpeg(['-f', 'lavfi', '-i', 'anoisesrc=d=30:a=0.2:r=44100:c=pink', p]); return p; };

test('battiti: il tempo e la fase di una base; il rumore non ha un battito affidabile', async () => {
  const c = await battitiMusica(CLICK120(), CFG);
  assert.ok(Math.abs(c.bpm - 120) <= 1, `120 bpm: ${c.bpm}`);
  assert.ok(c.affidabilita >= SOGLIA_BATTITO);
  assert.ok(Math.abs(c.battiti[0] - 0.13) <= 0.02, `il primo battito a 0,13 s: ${c.battiti[0]}`);
  assert.ok(c.battiti.every((b, i) => i === 0 || Math.abs(b - c.battiti[i - 1] - 0.5) <= 0.02), 'uno ogni mezzo secondo');
  assert.equal(c.durata, 30);
  const b = await battitiMusica(BEAT100(), CFG);
  assert.ok(Math.abs(b.bpm - 100) <= 1, `100 bpm: ${b.bpm}`);
  assert.ok(Math.abs(b.battiti[0] - 0.2) <= 0.02, `sulla cassa (0,2 s), non sul charleston: ${b.battiti[0]}`);
  const r = await battitiMusica(RUMORE(), CFG);
  assert.ok(r.affidabilita < SOGLIA_BATTITO, `il rumore non ha battito: ${r.affidabilita}`);
  assert.deepEqual(trovaBattiti(new Float32Array(100)), { bpm: 0, battiti: [], affidabilita: 0 }, 'troppo corto');
  // la musica che riparte da capo: i battiti si ripetono ogni «durata» secondi
  assert.deepEqual(battitiSulVideo({ battiti: [0.5, 1.5], durata: 2 }, 5), [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]);
  assert.deepEqual(battitiSulVideo({ battiti: [], durata: 2 }, 5), []);
});

test('tagli a tempo: si spostano solo i tagli fra coperture, sul battito vicino, senza pezzi troppo corti né girato che manca', () => {
  const cop = (fonte, da, a, inizio = 0) => ({ fonte, tipo: 'copertura', inizio, fine: inizio + (a - da), da, a });
  const volto = (da, a) => ({ fonte: 'A01', tipo: 'volto', inizio: da, fine: a, da, a });
  const clip = (fonte) => ({ V01: 20, V02: 20, V03: 3.2 })[fonte] ?? null;
  const video = [cop('V01', 0, 3), cop('V02', 3, 6), volto(6, 9), cop('V01', 9, 12, 5), cop('V03', 12, 15)];
  const battiti = [0.12, 3.12, 6.12, 9.12, 11.72, 15.12];
  const { video: v, spostati } = tagliATempo(video, battiti, { fps: 25, minima: 2.5, durataClip: clip });
  assert.equal(v[0].a, 3.12, 'copertura → copertura: sul battito');
  assert.equal(v[1].da, 3.12);
  assert.deepEqual([v[0].fine, v[1].inizio, v[1].fine], [3.12, 0, 2.88], 'ogni pezzo tiene il suo inizio nella clip, cambia la durata');
  assert.deepEqual([v[1].a, v[2].da, v[2].a, v[3].da], [6, 6, 9, 9], 'i tagli col volto restano dove sono');
  assert.equal(v[3].a, 12, 'col taglio a 11,72 V03 dovrebbe durare 3,28 s, oltre i suoi 3,2 s di girato: resta');
  assert.equal(spostati, 1);
  assert.deepEqual(tagliATempo(video, [], { fps: 25 }).video, video, 'senza battiti niente cambia');
  // continuità: nessun buco, la durata totale è la stessa
  for (let k = 1; k < v.length; k++) assert.equal(v[k].da, v[k - 1].a);
  assert.equal(v.at(-1).a, 15);
  // la tolleranza: un battito oltre 0,35 s (o oltre un terzo del pezzo più corto) non tira il taglio
  assert.equal(tagliATempo([cop('V01', 0, 3), cop('V02', 3, 6)], [3.5], { fps: 25, minima: 1, durataClip: clip }).spostati, 0);
  assert.equal(tagliATempo([cop('V01', 0, 0.9), cop('V02', 0.9, 6)], [1.25], { fps: 25, minima: 0.5, durataClip: clip }).spostati, 0, 'un terzo del pezzo più corto (0,3 s): 0,35 è troppo');
  assert.equal(tagliATempo([cop('V01', 0, 0.9), cop('V02', 0.9, 6)], [1.1], { fps: 25, minima: 0.5, durataClip: clip }).spostati, 1, '0,2 s va bene');
  // la durata minima e il girato della clip di sinistra
  assert.equal(tagliATempo([cop('V01', 0, 3), cop('V02', 3, 6)], [3.3], { fps: 25, minima: 2.8, durataClip: clip }).spostati, 0, 'V02 scenderebbe a 2,7 s, sotto la minima');
  assert.equal(tagliATempo([cop('V03', 0, 3), cop('V02', 3, 6)], [3.3], { fps: 25, minima: 1, durataClip: clip }).spostati, 0, 'V03 ha 3,2 s di girato: non arriva a 3,3');
  // il taglio va al fotogramma; le foto non hanno limite di girato
  const f = tagliATempo([{ fonte: 'F01', tipo: 'foto', inizio: 0, fine: 3, da: 0, a: 3 }, cop('V02', 3, 6)], [3.137], { fps: 25, minima: 1, durataClip: clip }).video;
  assert.equal(f[0].a, 3.12, 'arrotondato al fotogramma (25 al secondo)');
});

test('tagli a tempo nel montaggio vero: i cambi di colore cadono sul battito; col rumore restano dove li mette la regia', async () => {
  const colore = (c) => clip(`bt-${c}.mp4`, ['-f', 'lavfi', '-i', `color=c=${c}:s=1080x1920:d=8:r=25`, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '8', '-shortest']);
  const pid = await progettoNuovo('battiti');
  // colori con la luce molto diversa: il rilevatore di scene guarda la luminosità
  for (const c of ['white', 'gray', 'black']) assert.equal((await carica(pid, colore(c))).stato, 200);
  const piano = { battute: [{ immagini: 9, coperture: ['V01.1', 'V02.1', 'V03.1'] }], musica: true };
  const tagli = async (musica) => {
    const r = await chiama(s.base, `/progetto/${pid}/regia/monta`, { dati: { piano, stile: 'sdg', formato: 'verticale' }, file: { musica } });
    assert.equal(r.stato, 200, JSON.stringify(r.json));
    const p = path.join(TMP, `bt-${path.basename(musica)}.mp4`);
    fs.writeFileSync(p, (await scarica(r.json.file.find((x) => x.tipo === 'video').url)).buf);
    const { stderr } = await import('node:child_process').then((m) => m.spawnSync('ffmpeg', ['-hide_banner', '-i', p, '-vf', 'scdet=threshold=5,metadata=print', '-an', '-f', 'null', '-'], { encoding: 'utf8' }));
    return { cambi: [...stderr.matchAll(/lavfi\.scd\.time=([\d.]+)/g)].map((m) => Number(m[1])), avvisi: r.json.avvisi };
  };
  const conBase = await tagli(CLICK120());
  assert.ok(conBase.avvisi.some((a) => a.codice === 'tagli_a_tempo' && /2 tagli spostati/.test(a.messaggio)), JSON.stringify(conBase.avvisi));
  assert.equal(conBase.cambi.length, 2, `due cambi di luce: ${conBase.cambi}`);
  for (const t of conBase.cambi) {
    const battito = 0.13 + Math.round((t - 0.13) / 0.5) * 0.5;
    assert.ok(Math.abs(t - battito) <= 0.05, `il cambio a ${t} s dovrebbe stare sul battito (${battito.toFixed(2)} s)`);
  }
  const conRumore = await tagli(RUMORE());
  assert.ok(!conRumore.avvisi.some((a) => a.codice === 'tagli_a_tempo'), 'senza battito chiaro non si sposta niente');
  assert.deepEqual(conRumore.cambi.map((t) => Math.round(t * 25)), [75, 150], 'i tagli della regia: 3 e 6 secondi');
});
