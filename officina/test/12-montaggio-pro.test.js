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

// ------------------------------------------------------------------ stabilizzazione e colori uguali
import { bilanciamento, vaStabilizzata, scenaDi, haFiltro, SOGLIA_MOSSA, DESHAKE, coloreMedio } from '../src/ritocco-clip.js';
import { conScelte, stileDa } from '../src/regia-render.js';

test('colori uguali: ogni clip va a metà strada verso la mediana, entro il 12% per canale; una clip già giusta non si tocca', () => {
  const misure = new Map([['neutra', { r: 120, g: 120, b: 120 }], ['neutra2', { r: 122, g: 120, b: 118 }], ['calda', { r: 160, g: 120, b: 80 }], ['vuota', null]]);
  const c = bilanciamento(misure);
  assert.equal(c.has('vuota'), false);
  assert.equal(c.get('neutra'), '', 'già vicina al riferimento');
  const [, rr, gg, bb] = c.get('calda').match(/colorchannelmixer=rr=([\d.]+):gg=([\d.]+):bb=([\d.]+)/).map(Number);
  assert.ok(rr < 1 && bb > 1, `la clip calda perde rosso e prende blu: ${c.get('calda')}`);
  assert.ok(rr >= 0.88 && bb <= 1.12, 'mai oltre il 12%');
  assert.ok(Math.abs(gg - 1) < 0.05);
  // la luce: una clip più scura si schiarisce di poco (al massimo 0,05)
  const luce = bilanciamento(new Map([['a', { r: 60, g: 60, b: 60 }], ['b', { r: 140, g: 140, b: 140 }], ['c', { r: 145, g: 145, b: 145 }]]));
  assert.match(luce.get('a'), /eq=brightness=0\.05,$/);
  assert.deepEqual([...bilanciamento(new Map([['sola', { r: 200, g: 100, b: 50 }]])).keys()], [], 'con una clip sola non c\'è niente da uniformare');
});

test('stabilizzazione: quando si fa, e la scena di un pezzo', async () => {
  assert.equal(vaStabilizzata({}, { movimento: SOGLIA_MOSSA + 1 }), true, 'auto: la scena mossa sì');
  assert.equal(vaStabilizzata({}, { movimento: SOGLIA_MOSSA }), false);
  assert.equal(vaStabilizzata({ stabilizza: 'si' }, { movimento: 0 }), true);
  assert.equal(vaStabilizzata({ stabilizza: 'no' }, { movimento: 99 }), false);
  assert.equal(vaStabilizzata({}, null), false);
  const m = { scene: [{ codice: 'V01.1', inizio: 0, fine: 4 }, { codice: 'V01.2', inizio: 4, fine: 9 }] };
  assert.equal(scenaDi(m, { etichetta: 'V01.2' }).codice, 'V01.2');
  assert.equal(scenaDi(m, { inizio: 5 }).codice, 'V01.2', 'un volto: la scena dal tempo');
  assert.equal(scenaDi(null, { inizio: 1 }), null);
  assert.equal(await haFiltro(CFG, 'deshake'), true);
  assert.equal(await haFiltro(CFG, 'filtro-che-non-esiste'), false);
  // le scelte dalla richiesta
  const s = conScelte(stileDa('sdg'), { stabilizza: 'SI', colori_uguali: 'no', tagli_a_tempo: false, segui_soggetto: 'si' });
  assert.deepEqual([s.stabilizza, s.colori_uguali, s.tagli_a_tempo, s.segui_soggetto], ['si', false, false, true]);
  assert.deepEqual(conScelte(stileDa('sdg'), {}), stileDa('sdg'), 'senza scelte lo stile resta com\'è');
});

// quanto «trema» un video: la differenza media fra fotogrammi vicini, su una fascia centrale
async function tremolio(video) {
  const dir = fs.mkdtempSync(path.join(TMP, 'tremolio-'));
  ffmpeg(['-i', video, '-vf', 'fps=12,scale=108:192,format=gray', path.join(dir, 'f-%03d.png')]);
  const file = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  let prima = null; let tot = 0; let n = 0;
  for (const f of file) {
    const { data } = await sharp(path.join(dir, f)).raw().toBuffer({ resolveWithObject: true });
    if (prima) { let d = 0; for (let i = 0; i < data.length; i++) d += Math.abs(data[i] - prima[i]); tot += d / data.length; n++; }
    prima = data;
  }
  return tot / Math.max(1, n);
}

test('stabilizzazione e colori nel montaggio vero: la clip mossa trema meno; la clip calda si avvicina alle altre', async () => {
  // una clip che trema: un quadro dettagliato che salta di qualche pixel a ogni fotogramma
  const mossa = clip('st-mossa.mp4', ['-f', 'lavfi', '-i', 'testsrc2=s=2000x1160:d=6:r=25', '-vf', "crop=1920:1080:'40+30*sin(n*1.7)':'40+30*cos(n*2.3)'", '-t', '6']);
  const pid = await progettoNuovo('stabile');
  assert.equal((await carica(pid, mossa)).stato, 200);
  const monta = async (stabilizza) => {
    const r = await chiama(s.base, `/progetto/${pid}/regia/monta`, { dati: { piano: { battute: [{ immagini: 4, coperture: ['V01.1 centro'] }] }, stile: 'sdg', formato: 'orizzontale', stabilizza, colori_uguali: false }, file: {} });
    assert.equal(r.stato, 200, JSON.stringify(r.json));
    const p = path.join(TMP, `st-${stabilizza}.mp4`);
    fs.writeFileSync(p, (await scarica(r.json.file.find((x) => x.tipo === 'video').url)).buf);
    return p;
  };
  const senza = await tremolio(await monta('no'));
  const con = await tremolio(await monta('si'));
  assert.ok(con < senza * 0.8, `stabilizzata dovrebbe tremare meno: ${con.toFixed(1)} contro ${senza.toFixed(1)}`);

  // i colori: una clip neutra e una calda, con un po' di grana (così hanno una miniatura vera)
  const tinta = (nome, colore) => clip(nome, ['-f', 'lavfi', '-i', `color=c=${colore}:s=1080x1920:d=6:r=25`, '-vf', 'noise=alls=12:allf=t', '-t', '6']);
  const pid2 = await progettoNuovo('colori');
  for (const f of [tinta('cl-neutra.mp4', '0x7f7f7f'), tinta('cl-neutra2.mp4', '0x828080'), tinta('cl-calda.mp4', '0xa8805a')]) assert.equal((await carica(pid2, f)).stato, 200);
  const rapporto = async (uguali) => {
    const r = await chiama(s.base, `/progetto/${pid2}/regia/monta`, { dati: { piano: { battute: [{ immagini: 9, coperture: ['V01.1', 'V02.1', 'V03.1'] }] }, stile: 'sdg', formato: 'verticale', colori_uguali: uguali, tagli_a_tempo: false }, file: {} });
    assert.equal(r.stato, 200, JSON.stringify(r.json));
    const p = path.join(TMP, `cl-${uguali}.mp4`);
    fs.writeFileSync(p, (await scarica(r.json.file.find((x) => x.tipo === 'video').url)).buf);
    const png = path.join(TMP, `cl-${uguali}.png`);
    ffmpeg(['-ss', '7.5', '-i', p, '-frames:v', '1', '-y', png]);
    const m = await coloreMedio(png);
    return m.r / m.b;
  };
  const prima = await rapporto(false);
  const dopo = await rapporto(true);
  assert.ok(dopo < prima - 0.08, `la clip calda dovrebbe essere meno calda: rosso/blu ${dopo.toFixed(2)} contro ${prima.toFixed(2)}`);
  assert.ok(dopo > 1.05, `ma resta un po' calda (metà strada): ${dopo.toFixed(2)}`);
});

// ------------------------------------------------------------------ reel di riferimento
import { numeriDelRitmo } from '../src/riferimento.js';

test('riferimento: i numeri del ritmo dai tagli; sul battito solo se sono molti più che a caso', () => {
  const pari = numeriDelRitmo({ durata: 10, tagli: [2, 4, 6, 8] });
  assert.deepEqual(pari.inquadrature, { quante: 5, media: 2, mediana: 2, p10: 2, p90: 2 });
  assert.equal(pari.tagli_al_minuto, 24);
  assert.deepEqual(pari.ritmo_proposto, { minima: 1.6, coperturaMin: 2, coperturaMax: 2, tagli_a_tempo: false });
  assert.equal(pari.musica, null);
  // durate diverse: 1, 0,5, 2,5, 5, 1 → 10° percentile 0,7, 90° percentile 4 (interpolati)
  const vari = numeriDelRitmo({ durata: 10, tagli: [1, 1.5, 4, 9] });
  assert.deepEqual([vari.inquadrature.p10, vari.inquadrature.p90, vari.inquadrature.mediana], [0.7, 4, 1]);
  assert.deepEqual(vari.ritmo_proposto, { minima: 0.56, coperturaMin: 0.7, coperturaMax: 4, tagli_a_tempo: false });
  // un piano sequenza: una sola inquadratura lunga quanto il video; i limiti del ritmo tengono
  const uno = numeriDelRitmo({ durata: 40, tagli: [] });
  assert.deepEqual(uno.inquadrature, { quante: 1, media: 40, mediana: 40, p10: 40, p90: 40 });
  assert.deepEqual(uno.ritmo_proposto, { minima: 2, coperturaMin: 6, coperturaMax: 10, tagli_a_tempo: false });
  // la musica a 120 bpm (un battito ogni 0,5 s, il primo a 0,13): a caso il 40% dei tagli cade entro 0,1 s da un battito
  const musica = { bpm: 120, affidabile: true, durata: 30, battiti: Array.from({ length: 60 }, (_, k) => Math.round((0.13 + k * 0.5) * 1000) / 1000) };
  const aTempo = numeriDelRitmo({ durata: 10, tagli: [2.13, 4.15, 6.1, 8.13], musica });
  assert.deepEqual(aTempo.musica, { bpm: 120, affidabile: true, tagli_sul_battito_percento: 100, a_caso_sarebbe_percento: 40 });
  assert.equal(aTempo.ritmo_proposto.tagli_a_tempo, true);
  const fuori = numeriDelRitmo({ durata: 10, tagli: [2.38, 4.38, 6.38, 8.13], musica });
  assert.equal(fuori.musica.tagli_sul_battito_percento, 25);
  assert.equal(fuori.ritmo_proposto.tagli_a_tempo, false, '25% è meno di quanto farebbe il caso');
  // 3 tagli su 4 sul battito (75%) contro il 40% del caso: a tempo
  assert.equal(numeriDelRitmo({ durata: 10, tagli: [2.13, 4.13, 6.13, 8.38], musica }).ritmo_proposto.tagli_a_tempo, true);
  // a 180 bpm (un battito ogni 0,33 s) il caso fa già il 60%: lo stesso 75% non basta
  const veloce = { bpm: 180, affidabile: true, durata: 30, battiti: Array.from({ length: 90 }, (_, k) => Math.round(k * 1000 / 3) / 1000) };
  const r180 = numeriDelRitmo({ durata: 10, tagli: [2, 4, 6, 8.17], musica: veloce });
  assert.deepEqual([r180.musica.tagli_sul_battito_percento, r180.musica.a_caso_sarebbe_percento, r180.ritmo_proposto.tagli_a_tempo], [75, 60, false]);
  // i tagli oltre la musica analizzata non contano (né a favore né contro)
  const corta = numeriDelRitmo({ durata: 10, tagli: [2.13, 4.13, 6.38, 8.38], musica: { ...musica, durata: 5 } });
  assert.equal(corta.musica.tagli_sul_battito_percento, 100);
  // musica senza battito chiaro: niente percentuale, niente tagli a tempo
  const incerta = numeriDelRitmo({ durata: 10, tagli: [2, 4], musica: { bpm: null, affidabile: false, durata: 30, battiti: [] } });
  assert.deepEqual(incerta.musica, { bpm: null, affidabile: false, tagli_sul_battito_percento: null, a_caso_sarebbe_percento: null });
  assert.equal(incerta.ritmo_proposto.tagli_a_tempo, false);
});

test('riferimento: un reel vero, coi tagli sul battito; col rumore il battito è incerto; senza audio solo i tagli; un\'immagine no', async () => {
  // cinque inquadrature (bianco, grigio, nero, grigio, bianco) coi cambi ai fotogrammi 41, 78, 116, 153: 1,64 3,12 4,64 6,12 s,
  // tutti a meno di 0,02 s da un battito della base a 120 (0,13 + mezzo secondo)
  const fotogrammi = [41, 37, 38, 37, 47];
  const colori = ['white', 'gray', 'black', 'gray', 'white'];
  const reel = (nome, audio) => clip(nome, [
    ...colori.flatMap((c, i) => ['-f', 'lavfi', '-i', `color=c=${c}:s=360x640:r=25:d=${(fotogrammi[i] / 25).toFixed(2)}`]),
    ...(audio ? ['-i', audio] : []),
    '-filter_complex', `${colori.map((_, i) => `[${i}:v]`).join('')}concat=n=5:v=1:a=0[v]`, '-map', '[v]',
    ...(audio ? ['-map', '5:a', '-c:a', 'aac', '-t', '8'] : []),
  ]);
  const misura = async (f) => chiama(s.base, '/riferimento', { file: { video: f } });
  const conBase = await misura(reel('rif-base.mp4', CLICK120()));
  assert.equal(conBase.stato, 200, JSON.stringify(conBase.json));
  const m = conBase.json;
  assert.deepEqual([m.formato, m.larghezza, m.altezza, m.fps], ['verticale', 360, 640, 25]);
  assert.ok(Math.abs(m.durata - 8) <= 0.1, `dura 8 s: ${m.durata}`);
  assert.equal(m.tagli.length, 4, `quattro tagli: ${m.tagli}`);
  [1.64, 3.12, 4.64, 6.12].forEach((t, i) => assert.ok(Math.abs(m.tagli[i] - t) <= 0.05, `taglio ${i + 1} a ${t} s: ${m.tagli[i]}`));
  assert.equal(m.inquadrature.quante, 5);
  assert.ok(Math.abs(m.musica.bpm - 120) <= 1, `120 bpm: ${m.musica.bpm}`);
  assert.equal(m.musica.affidabile, true);
  assert.equal(m.musica.tagli_sul_battito_percento, 100);
  assert.equal(m.musica.a_caso_sarebbe_percento, 40);
  assert.equal(m.ritmo_proposto.tagli_a_tempo, true);
  assert.ok(m.ritmo_proposto.coperturaMin >= 1.4 && m.ritmo_proposto.coperturaMax <= 1.9, JSON.stringify(m.ritmo_proposto));
  assert.deepEqual(m.avvisi, []);
  assert.ok(!('battiti' in m.musica), 'i battiti non escono: servono solo al conto');

  const conRumore = (await misura(reel('rif-rumore.mp4', RUMORE()))).json;
  assert.equal(conRumore.musica.affidabile, false);
  assert.equal(conRumore.musica.bpm, null);
  assert.equal(conRumore.ritmo_proposto.tagli_a_tempo, false);
  assert.ok(conRumore.avvisi.some((a) => a.codice === 'battito_incerto'));
  assert.equal(conRumore.tagli.length, 4, 'i tagli si misurano lo stesso');

  const muto = (await misura(reel('rif-muto.mp4', null))).json;
  assert.equal(muto.musica, null);
  assert.ok(muto.avvisi.some((a) => a.codice === 'senza_audio'));
  assert.equal(muto.tagli.length, 4);

  const png = path.join(TMP, 'rif-foto.png');
  await sharp({ create: { width: 64, height: 64, channels: 3, background: '#808080' } }).png().toFile(png);
  const foto = await misura(png);
  assert.equal(foto.stato, 415, JSON.stringify(foto.json));
  assert.equal(foto.json.errore, 'video_non_leggibile');
});
