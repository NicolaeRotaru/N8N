// Prove del montatore (1.2.0): progetto, materiale (scene, qualità, doppioni, parlato), catalogo con i provini,
// controllo del piano di Claude, montaggio per riferimento (reel, storia, post, carosello), scadenza e chiusura.
// Materiale SINTETICO: testsrc2/colore/mandelbrot con tagli noti, gradienti con forme, voce del whisper finto.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { avviaServer, chiama, scarica, creaClip, creaImmagine, creaLogo, sondaFile, ffmpeg, MATERIALE, TMP, RADICE, CHIAVE } from './aiuti.js';
import { confiniScene, leggiTagliScdet, leggiVolumeMassimo, dentroIlLato, SCENE } from '../src/analisi.js';
import { controllaPiano } from '../src/piano.js';
import { Registro } from '../src/progetti.js';
import { srtSorgente } from '../src/montaggio.js';
import { leggiSrt } from '../src/srt.js';

const intestazioni = { 'x-officina-chiave': CHIAVE, 'content-type': 'application/json' };
const json = async (base, percorso, corpo, metodo = 'POST') => {
  const r = await fetch(base + percorso, { method: metodo, headers: intestazioni, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { stato: r.status, json: await r.json() };
};

function modelloFinto() {
  const p = path.join(MATERIALE, 'modello-finto.bin');
  if (!fs.existsSync(p)) fs.writeFileSync(p, Buffer.alloc(2 * 1024 * 1024, 1));
  return p;
}

// Clip verticale con tre inquadrature: testsrc2 (0-4 s), rosso pieno (4-7 s), mandelbrot (7-11 s).
function clipTreScene() {
  const p = path.join(MATERIALE, 'mont-tre-vert.mp4');
  if (fs.existsSync(p)) return p;
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=4', '-f', 'lavfi', '-i', 'color=c=red:size=1080x1920:rate=30:duration=3',
    '-f', 'lavfi', '-i', 'mandelbrot=size=1080x1920:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=11',
    '-filter_complex', '[2:v]trim=duration=4,setpts=PTS-STARTPTS[m];[0:v][1:v][m]concat=n=3:v=1[v]',
    '-map', '[v]', '-map', '3:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', p]);
  return p;
}

const MARCHIO = { colori: { primario: '#D61D73', secondario: '#3D7C2B', testo: '#FFFFFF' }, font: 'Roboto Slab', font_testo: 'Archivo', peso_titolo: 800 };

// ---------------------------------------------------------------- unità
test('confiniScene: tagli vicini uniti, scene lunghe divise in pezzi da ~4,5 s, al massimo 40 per video', () => {
  assert.deepEqual(confiniScene(11, [4, 7]).map((s) => [s.inizio, s.fine]), [[0, 4], [4, 7], [7, 11]]);
  // taglio a 0,4 s dall'inizio e a 0,5 s dalla fine: troppo vicini, ignorati (10 s senza tagli = 3 pezzi uguali)
  assert.deepEqual(confiniScene(10, [0.4, 9.5]).map((s) => Math.round((s.fine - s.inizio) * 100) / 100), [3.33, 3.33, 3.33]);
  // taglio a 5 s: due scene da 5 s (sotto i 6 s non si divide)
  assert.deepEqual(confiniScene(10, [5]).map((s) => [s.inizio, s.fine]), [[0, 5], [5, 10]]);
  // 20 s senza tagli = 5 pezzi da 4 s
  assert.deepEqual(confiniScene(20, []).map((s) => s.fine - s.inizio), [4, 4, 4, 4, 4]);
  // 10 minuti: mai più di 40 scene, e coprono tutto il video senza buchi
  const lunghe = confiniScene(600, []);
  assert.ok(lunghe.length <= SCENE.maxPerVideo, `${lunghe.length} scene`);
  assert.equal(lunghe[0].inizio, 0);
  assert.equal(lunghe[lunghe.length - 1].fine, 600);
  for (let i = 1; i < lunghe.length; i++) assert.equal(lunghe[i].inizio, lunghe[i - 1].fine);
  // un taglio ogni 2 s per 4 minuti (119 tagli): il tetto di 40 vale lo stesso, senza buchi
  const fitte = confiniScene(240, Array.from({ length: 119 }, (_, i) => 2 * (i + 1)));
  assert.ok(fitte.length <= SCENE.maxPerVideo, `${fitte.length} scene`);
  assert.equal(fitte[0].inizio, 0);
  assert.equal(fitte[fitte.length - 1].fine, 240);
  for (let i = 1; i < fitte.length; i++) assert.equal(fitte[i].inizio, fitte[i - 1].fine);
  assert.equal(confiniScene(11, [4, 7])[1].taglio, true);
  assert.equal(confiniScene(20, [])[1].taglio, false);
});

test('lettura di scdet e volumedetect; dimensioni pari dentro il lato', () => {
  const err = '[scdet @ 0x1] lavfi.scd.score: 23.522, lavfi.scd.time: 4\n[scdet @ 0x1] lavfi.scd.score: 29.790, lavfi.scd.time: 7.25\n[Parsed_volumedetect_0 @ 0x2] max_volume: -3.5 dB';
  assert.deepEqual(leggiTagliScdet(err), [{ punteggio: 23.522, tempo: 4 }, { punteggio: 29.79, tempo: 7.25 }]);
  assert.equal(leggiVolumeMassimo(err), -3.5);
  assert.equal(leggiVolumeMassimo('max_volume: -inf dB'), -91);
  assert.deepEqual(dentroIlLato(1920, 1080, 192), { w: 192, h: 108 });
  assert.deepEqual(dentroIlLato(1080, 1920, 192), { w: 108, h: 192 });
  assert.deepEqual(dentroIlLato(100, 50, 192), { w: 100, h: 50 });
});

test('Registro dei progetti al lavoro: due richieste sullo stesso progetto contano due', () => {
  const r = new Registro();
  r.entra('a');
  r.entra('a');
  r.esce('a');
  assert.equal(r.has('a'), true, 'la seconda richiesta lavora ancora');
  r.esce('a');
  assert.equal(r.has('a'), false);
  r.esce('a');
  assert.equal(r.has('a'), false, 'un\'uscita in più non va sotto zero');
  r.entra('a');
  assert.equal(r.has('a'), true);
});

// Progetto finto per le prove del piano (stessa forma di progetto.json).
const PROGETTO = {
  id: 'x',
  materiali: [
    { codice: 'V01', tipo: 'video', durata: 11, parlato: [{ inizio: 1, fine: 2.5, testo: 'Benvenuti.' }], scene: [
      { codice: 'V01.1', inizio: 0, fine: 4, nitidezza: 100, luminosita: 120, movimento: 2 },
      { codice: 'V01.2', inizio: 4, fine: 7, nitidezza: 2, luminosita: 120, movimento: 2 },
      { codice: 'V01.3', inizio: 7, fine: 11, nitidezza: 90, luminosita: 120, movimento: 8 }] },
    { codice: 'V02', tipo: 'video', durata: 80, parlato: null, scene: Array.from({ length: 16 }, (_, i) => ({ codice: `V02.${i + 1}`, inizio: i * 5, fine: i * 5 + 5, nitidezza: 80, luminosita: 110, movimento: 3 })) },
    { codice: 'F01', tipo: 'foto', nitidezza: 300, luminosita: 120, doppione_di: null },
    { codice: 'F02', tipo: 'foto', nitidezza: 280, luminosita: 120, doppione_di: null },
    { codice: 'F03', tipo: 'foto', nitidezza: 290, luminosita: 120, doppione_di: 'F01' },
  ],
};

test('controllaPiano: codici veri, tempi dentro la clip, limiti di durata, mese, foto, ripetizioni', () => {
  const piano = { contenuti: [
    { tipo: 'reel', data: '2026-12-04', ora: '18:30', titolo: 'Ok', pezzi: [{ scena: 'V01.1', inizio: 0.5, fine: 3 }, { scena: 'v01.3' }, { scena: 'V09.1' }] },
    { tipo: 'reel', data: '2026-12-05', ora: '9.5', pezzi: [{ scena: 'V01.1', inizio: 1, fine: 2 }, { scena: 'V02.1', inizio: 0, fine: 15 }] },
    { tipo: 'storia_video', data: '2026-12-06', ora: '12:00', pezzi: [{ scena: 'V02.1', inizio: 0, fine: 30 }, { scena: 'V02.8', inizio: 35, fine: 65 }] },
    { tipo: 'reel', data: '2027-01-01', ora: '18:00', pezzi: [{ scena: 'V01.1' }] },
    { tipo: 'post', data: '2026-12-07', ora: '19:00', foto: ['F01', 'F02'], righe: [{ testo: 'Titolo' }, 'sotto'] },
    { tipo: 'carosello', data: '2026-12-08', ora: '19:00', foto: ['F02', 'F99'] },
    { tipo: 'carosello', data: '2026-12-09', ora: '19:00', foto: ['F02', 'F03', 'F01'] },
    { tipo: 'reel', data: '2026-12-10', ora: '18:00', pezzi: [{ scena: 'V01.2', inizio: 4, fine: 4.3 }] },
    { tipo: 'diretta', data: '2026-12-11', ora: '18:00' },
    { tipo: 'reel', data: '2026-12-31', ora: '18:00', pezzi: Array.from({ length: 16 }, (_, i) => ({ scena: `V02.${i + 1}` })), outro: 'Prenota' },
  ] };
  const r = controllaPiano(piano, PROGETTO, { mese: '2026-12', richiesta: { reel: 3, post: 3, storie: 1 } });
  const per = (n) => r.contenuti.find((c) => c.n === n);
  const problemi = (n) => r.problemi.filter((p) => p.n === n);
  // 1: la scena inesistente si toglie, il codice in minuscolo si accetta, il parlato accende i sottotitoli
  assert.deepEqual(per(1).pezzi.map((p) => [p.scena, p.inizio, p.fine]), [['V01.1', 0.5, 3], ['V01.3', 7, 11]]);
  assert.equal(per(1).sottotitoli, true);
  assert.ok(problemi(1).some((p) => p.codice === 'scena_inesistente'));
  // 2: ora «9.5» non valida → 18:30; pezzo oltre la scena accettato (tempi dentro la clip) con l'avviso
  assert.equal(per(2).ora, '18:30');
  assert.deepEqual(per(2).pezzi[1], { scena: 'V02.1', video: 'V02', inizio: 0, fine: 15 });
  assert.match(problemi(2).map((p) => p.messaggio).join(' '), /esce dalla sua scena/);
  // 3: storia oltre 59,9 s → accorciata
  assert.equal(per(3).durata, 59.9);
  // 4: fuori dal mese → tolto, blocca
  assert.equal(per(4), undefined);
  assert.ok(problemi(4).some((p) => p.codice === 'fuori_mese' && p.gravita === 'blocca'));
  // 5: post con due foto → tenuta la prima; righe: la prima è il titolo, le altre «sotto»
  assert.deepEqual(per(5).foto, ['F01']);
  assert.deepEqual(per(5).righe, [{ testo: 'Titolo', ruolo: 'titolo' }, { testo: 'sotto', ruolo: 'sotto' }]);
  // 6: carosello con una sola foto vera → tolto
  assert.equal(per(6), undefined);
  // 7: carosello con un doppione: tenuto, con l'avviso e la ripetizione di F01/F02
  assert.deepEqual(per(7).foto, ['F02', 'F03', 'F01']);
  assert.match(problemi(7).map((p) => p.messaggio).join(' '), /doppione di F01/);
  assert.ok(problemi(7).some((p) => p.codice === 'ripetizione'));
  // 8: pezzo da 0,3 s allungato a 0,8 ma il reel resta sotto i 5 s → tolto
  assert.equal(per(8), undefined);
  assert.match(problemi(8).map((p) => p.messaggio).join(' '), /dura 0,8 s, ne servono almeno 5,0/);
  // 9: tipo sconosciuto
  assert.ok(problemi(9).some((p) => p.codice === 'tipo_sconosciuto'));
  // 10: 80 s + 2,5 s di cartello finale → accorciato a 90 in tutto
  assert.equal(per(10).durata, 82.5);
  // ripetizione: V01.1 1-2 s è dentro 0,5-3 s del contenuto 1
  assert.ok(problemi(2).some((p) => p.codice === 'ripetizione'));
  assert.equal(r.bloccante, true);
  assert.deepEqual([r.conti.reel, r.conti.post, r.conti.storie], [3, 2, 1]);
  assert.ok(r.problemi.some((p) => p.codice === 'numeri_diversi' && /post/.test(p.messaggio)));
  // in ordine di data
  assert.deepEqual(r.contenuti.map((c) => c.data), [...r.contenuti.map((c) => c.data)].sort());
  // fine oltre la clip → fermata alla fine (11 s); inizio negativo → 0
  const tempi = controllaPiano({ contenuti: [{ tipo: 'reel', data: '2026-12-04', ora: '18:00', pezzi: [{ scena: 'V01.3', inizio: 7, fine: 20 }, { scena: 'V01.1', inizio: -3, fine: 2 }] }] }, PROGETTO, { mese: '2026-12' });
  assert.deepEqual(tempi.contenuti[0].pezzi.map((p) => [p.inizio, p.fine]), [[7, 11], [0, 2]]);
  // data già passata rispetto a «oggi» → tolta, blocca (si chiede la correzione)
  const passato = controllaPiano({ contenuti: [{ tipo: 'post', data: '2026-12-02', ora: '19:00', foto: ['F01'] }, { tipo: 'post', data: '2026-12-20', ora: '19:00', foto: ['F02'] }] }, PROGETTO, { mese: '2026-12', oggi: '2026-12-10' });
  assert.deepEqual(passato.contenuti.map((c) => c.data), ['2026-12-20']);
  assert.ok(passato.problemi.some((p) => p.codice === 'data_passata' && p.gravita === 'blocca'));
  assert.equal(passato.bloccante, true);
  // piano senza contenuti
  assert.equal(controllaPiano({}, PROGETTO).bloccante, true);
  assert.equal(controllaPiano({ contenuti: [] }, PROGETTO, { mese: '12-2026' }).problemi[0].codice, 'mese_non_valido');
});

test('srtSorgente: il parlato salvato di ogni video, sulla linea delle clip intere', () => {
  const srt = srtSorgente([{ durata: 6, parlato: [{ inizio: 0.5, fine: 2, testo: 'Uno.' }] }, { durata: 4, parlato: null }, { durata: 5, parlato: [{ inizio: 1, fine: 2, testo: 'Due.' }] }]);
  assert.deepEqual(leggiSrt(srt), [{ inizio: 0.5, fine: 2, testo: 'Uno.' }, { inizio: 11, fine: 12, testo: 'Due.' }]);
  assert.equal(srtSorgente([{ durata: 3, parlato: [] }]), '');
});

// ---------------------------------------------------------------- servizio vero
let s;
before(async () => {
  s = await avviaServer({
    WHISPER_BIN: path.join(RADICE, 'test', 'finto-whisper.mjs'),
    WHISPER_MODELLO: modelloFinto(),
    WHISPER_VAD: modelloFinto(),
    WHISPER_VAD_BIN: path.join(RADICE, 'test', 'finto-vad.mjs'),
  });
});
after(async () => s?.ferma());

test('montatore dall\'inizio alla fine: materiale → catalogo → piano → reel, storia, post, carosello', async () => {
  const tre = clipTreScene();
  const oriz = creaClip('mont-oriz-20.mp4', { w: 1920, h: 1080, durata: 20, audio: 'sine' });
  const muta = creaClip('mont-muta-6.mp4', { w: 1080, h: 1920, durata: 6, audio: 'nessuno' });
  const f1 = await creaImmagine('mont-f1.jpg', { seme: 3 });
  const f2 = await creaImmagine('mont-f2.jpg', { seme: 5, w: 2000, h: 3000 });
  const f3 = await creaImmagine('mont-f3.jpg', { seme: 3 });
  const logo = await creaLogo();

  const p = await json(s.base, '/progetto', { nome: 'Tropico · servizio novembre' });
  assert.equal(p.stato, 200, JSON.stringify(p.json));
  assert.match(p.json.progetto, /^[a-f0-9]{20}$/);
  const pid = p.json.progetto;
  const carica = (f, cartella) => chiama(s.base, `/progetto/${pid}/materiale`, { dati: { cartella, nome: path.basename(f), drive_id: `drv-${path.basename(f)}` }, file: { file: f } });

  const v1 = await carica(tre, 'video verticali');
  assert.equal(v1.stato, 200, JSON.stringify(v1.json));
  assert.equal(v1.json.materiale.codice, 'V01');
  assert.equal(v1.json.materiale.orientamento, 'verticale');
  // i tagli veri sono a 4 e a 7 s (scdet, 4 fotogrammi al secondo: tolleranza 0,25 s)
  const sc = v1.json.materiale.scene;
  assert.deepEqual(sc.map((x) => x.codice), ['V01.1', 'V01.2', 'V01.3']);
  assert.ok(Math.abs(sc[1].inizio - 4) <= 0.25 && Math.abs(sc[2].inizio - 7) <= 0.25, JSON.stringify(sc));
  assert.deepEqual(sc[1].qualita, ['sfocata'], 'il rosso pieno non ha dettagli: risulta sfocato rispetto al resto');
  // il whisper finto «sente» due frasi: finiscono nelle scene giuste
  assert.equal(v1.json.materiale.parlato, true);
  // (la seconda frase, 3,8-5,5 s, sta a cavallo del taglio a 4 s: finisce in tutte e due le scene)
  assert.equal(sc[0].parlato, 'Benvenuti da noi. Oggi pasta fresca.');
  assert.equal(sc[1].parlato, 'Oggi pasta fresca.');
  assert.equal(sc[2].parlato, undefined);

  const v2 = await carica(oriz, 'video verticali');
  assert.equal(v2.json.materiale.codice, 'V02');
  assert.equal(v2.json.materiale.scene.length, 5);
  assert.ok(v2.json.avvisi.some((a) => a.codice === 'cartella_diversa'), 'orizzontale nella cartella dei verticali: avviso');
  const v3 = await carica(muta, 'video verticali');
  assert.equal(v3.json.materiale.audio, false);
  assert.equal(v3.json.materiale.parlato, false);

  const a = await carica(f1, 'foto');
  const b = await carica(f2, 'foto');
  const c = await carica(f3, 'foto');
  assert.deepEqual([a.json.materiale.codice, b.json.materiale.codice, c.json.materiale.codice], ['F01', 'F02', 'F03']);
  assert.deepEqual(c.json.materiale.qualita, ['doppione di F01']);
  // lo stesso file due volte (Retry on Fail): non si duplica
  const di = await carica(f1, 'foto');
  assert.equal(di.json.gia_caricato, true);
  assert.equal(di.json.materiale.codice, 'F01');
  // un file che non è né foto né video
  const finto = path.join(TMP, 'non-sono-un-video.mov');
  fs.writeFileSync(finto, 'testo qualsiasi');
  const no = await carica(finto, 'video verticali');
  assert.equal(no.stato, 415);
  assert.equal(no.json.errore, 'formato_file_non_supportato');

  const stato = await json(s.base, `/progetto/${pid}`, undefined, 'GET');
  assert.equal(stato.stato, 200);
  assert.deepEqual([stato.json.video, stato.json.foto, stato.json.scene], [3, 3, 9]); // 3 + 5 + 1 (6 s senza tagli = una scena)
  assert.ok(!JSON.stringify(stato.json).includes('hash'), 'i dati interni non escono');

  // catalogo: provini 5×4 leggibili e testo con una riga per scena
  const cat = await chiama(s.base, `/progetto/${pid}/catalogo`, {});
  assert.equal(cat.stato, 200, JSON.stringify(cat.json));
  assert.equal(cat.json.provini.length, 1);
  assert.equal(cat.json.provini[0].codici.length, 12);
  const pr = await scarica(cat.json.provini[0].url);
  const mp = await sharp(pr.buf).metadata();
  assert.equal(mp.format, 'jpeg');
  assert.ok(Math.max(mp.width, mp.height) <= 1568 && pr.buf.length <= 3.5 * 1024 * 1024);
  assert.match(cat.json.testo, /^V01 · video verticale 1080×1920 · 11,0 s · qualcuno parla/m);
  assert.match(cat.json.testo, /V01\.2 {2}4,0–7,0 s \(3,0 s\) · fermo · sfocata/);
  assert.match(cat.json.testo, /V01\.1 .* dice: «Benvenuti da noi\.» 0,5–2,0 s; «Oggi pasta fresca\.» 3,8–5,5 s/, 'le frasi con i loro tempi');
  assert.match(cat.json.testo, /^F03 · foto orizzontale 3000×2000 · doppione di F01/m);

  // piano: un contenuto per tipo, più uno sbagliato
  const piano = { contenuti: [
    { tipo: 'reel', data: '2026-12-04', ora: '18:30', titolo: 'Tre colori', pezzi: [{ scena: 'V01.1', inizio: 0.5, fine: 3 }, { scena: 'V02.3' }, { scena: 'V01.3', inizio: 7.2, fine: 9.5 }], intro: 'Il venerdì', outro: 'Prenota ora' },
    { tipo: 'storia_video', data: '2026-12-05', ora: '12:00', titolo: 'Storia', pezzi: [{ scena: 'V03.1' }, { scena: 'V02.1', inizio: 1, fine: 3 }] },
    { tipo: 'post', data: '2026-12-06', ora: '19:00', titolo: 'Post', foto: ['F02'], righe: [{ testo: 'Menu di Natale', ruolo: 'titolo' }, { testo: 'dal 1 al 24 dicembre', ruolo: 'sotto' }] },
    { tipo: 'carosello', data: '2026-12-08', ora: '19:00', titolo: 'Carosello', foto: ['F02', 'F01'] },
    { tipo: 'storia_foto', data: '2026-12-09', ora: '11:00', titolo: 'Storia foto', foto: ['F01'] },
    { tipo: 'reel', data: '2027-01-02', ora: '18:30', pezzi: [{ scena: 'V01.1' }] },
  ] };
  const pc = await json(s.base, `/progetto/${pid}/piano`, { piano, mese: '2026-12' });
  assert.equal(pc.stato, 200, JSON.stringify(pc.json));
  assert.equal(pc.json.contenuti.length, 5);
  assert.equal(pc.json.bloccante, true, 'il reel di gennaio blocca (va tolto o rifatto)');
  const per = (t) => pc.json.contenuti.find((x) => x.tipo === t);

  // reel: 2,5 + 4 + 2,3 s di clip + 2,5 s di cartello finale = 11,3 s, 1080×1920
  const reel = await chiama(s.base, `/progetto/${pid}/monta`, { dati: { contenuto: per('reel'), marchio: MARCHIO }, file: { logo } });
  assert.equal(reel.stato, 200, JSON.stringify(reel.json));
  assert.deepEqual(reel.json.file.map((f) => f.tipo), ['video', 'copertina', 'fotogrammi']);
  assert.ok(Math.abs(reel.json.file[0].durata - 11.3) <= 0.15, `durata ${reel.json.file[0].durata}`);
  assert.equal(reel.json.contenuto.sottotitoli, true);
  assert.ok(!reel.json.avvisi.some((x) => x.codice === 'sottotitoli_fuori_montaggio'), JSON.stringify(reel.json.avvisi));
  assert.ok(reel.json.avvisi.some((x) => x.codice === 'sfondo_sfocato' && /Il video V02/.test(x.messaggio)), `gli avvisi parlano di V02, non di «clip 1»: ${JSON.stringify(reel.json.avvisi)}`);
  const vid = await scarica(reel.json.file[0].url);
  const pv = path.join(TMP, 'mont-reel.mp4');
  fs.writeFileSync(pv, vid.buf);
  const sv = sondaFile(pv).streams.find((x) => x.codec_type === 'video');
  assert.deepEqual([sv.width, sv.height], [1080, 1920]);

  // storia video da due pezzi (un video muto): 6 + 2 s
  const st = await chiama(s.base, `/progetto/${pid}/monta`, { dati: { contenuto: per('storia_video'), marchio: MARCHIO }, file: {} });
  assert.equal(st.stato, 200, JSON.stringify(st.json));
  assert.ok(Math.abs(st.json.file[0].durata - 8) <= 0.15, `durata ${st.json.file[0].durata}`);

  // post 1080×1350 con le scritte
  const po = await chiama(s.base, `/progetto/${pid}/monta`, { dati: { contenuto: per('post'), marchio: MARCHIO }, file: { logo } });
  assert.equal(po.stato, 200, JSON.stringify(po.json));
  const img = await scarica(po.json.file[0].url);
  assert.deepEqual([(await sharp(img.buf).metadata()).width, (await sharp(img.buf).metadata()).height], [1080, 1350]);

  // carosello: due immagini 4:5, nomi diversi
  const ca = await chiama(s.base, `/progetto/${pid}/monta`, { dati: { contenuto: per('carosello'), marchio: MARCHIO }, file: { logo } });
  assert.equal(ca.stato, 200, JSON.stringify(ca.json));
  assert.equal(ca.json.file.length, 2);
  assert.notEqual(ca.json.file[0].url, ca.json.file[1].url);
  for (const f of ca.json.file) {
    const m = await sharp((await scarica(f.url)).buf).metadata();
    assert.deepEqual([m.width, m.height], [1080, 1350]);
  }

  // storia foto 1080×1920
  const sf = await chiama(s.base, `/progetto/${pid}/monta`, { dati: { contenuto: per('storia_foto'), marchio: MARCHIO }, file: { logo } });
  assert.equal(sf.stato, 200, JSON.stringify(sf.json));
  const ms = await sharp((await scarica(sf.json.file[0].url)).buf).metadata();
  assert.deepEqual([ms.width, ms.height], [1080, 1920]);

  // contenuto non valido → 422 con il motivo
  const male = await chiama(s.base, `/progetto/${pid}/monta`, { dati: { contenuto: { tipo: 'reel', data: '2026-12-04', ora: '18:00', pezzi: [{ scena: 'V77.1' }] } }, file: {} });
  assert.equal(male.stato, 422);
  assert.equal(male.json.errore, 'contenuto_non_valido');
  assert.match(male.json.messaggio, /V77\.1/);

  // chiusura: dopo, il progetto non c'è più
  const ch = await json(s.base, `/progetto/${pid}/chiudi`, {});
  assert.equal(ch.stato, 200);
  const dopo = await json(s.base, `/progetto/${pid}`, undefined, 'GET');
  assert.equal(dopo.stato, 404);
  assert.equal(dopo.json.errore, 'progetto_non_trovato');
  assert.equal(fs.existsSync(path.join(s.datiDir, 'progetti', pid)), false);
});

test('whisper che si pianta: la clip entra senza parlato (avviso), non si perde', async () => {
  const rotto = path.join(TMP, 'whisper-rotto.mjs');
  fs.writeFileSync(rotto, '#!/usr/bin/env node\nprocess.stderr.write("segmentation fault finto\\n");\nprocess.exit(139);\n');
  fs.chmodSync(rotto, 0o755);
  const s2 = await avviaServer({ WHISPER_BIN: rotto, WHISPER_MODELLO: modelloFinto(), WHISPER_VAD: modelloFinto(), WHISPER_VAD_BIN: path.join(RADICE, 'test', 'finto-vad.mjs') });
  try {
    const p = await json(s2.base, '/progetto', {});
    const clip = creaClip('mont-voce-8.mp4', { w: 1080, h: 1920, durata: 8, audio: 'sine' });
    const r = await chiama(s2.base, `/progetto/${p.json.progetto}/materiale`, { dati: { drive_id: 'drv-voce' }, file: { file: clip } });
    assert.equal(r.stato, 200, JSON.stringify(r.json));
    assert.equal(r.json.materiale.codice, 'V01');
    assert.equal(r.json.materiale.parlato, false);
    assert.ok(r.json.avvisi.some((a) => a.codice === 'trascrizione_fallita'), JSON.stringify(r.json.avvisi));
    // «trascrivi: "no"» (anche come testo) non chiama whisper
    const r2 = await chiama(s2.base, `/progetto/${p.json.progetto}/materiale`, { dati: { drive_id: 'drv-voce-2', trascrivi: 'no' }, file: { file: creaClip('mont-voce-6.mp4', { w: 1080, h: 1920, durata: 6, audio: 'sine' }) } });
    assert.equal(r2.stato, 200);
    assert.ok(!r2.json.avvisi.some((a) => a.codice === 'trascrizione_fallita'));
  } finally {
    await s2.ferma();
  }
});

test('stesso file senza id di Drive (stesso nome e grandezza): non si duplica', async () => {
  const p = await json(s.base, '/progetto', {});
  const f = await creaImmagine('mont-f2.jpg', { seme: 5, w: 2000, h: 3000 });
  const a = await chiama(s.base, `/progetto/${p.json.progetto}/materiale`, { dati: { nome: 'scatto.jpg' }, file: { file: f } });
  const b = await chiama(s.base, `/progetto/${p.json.progetto}/materiale`, { dati: { nome: 'scatto.jpg' }, file: { file: f } });
  assert.equal(a.json.materiale.codice, 'F01');
  assert.equal(b.json.gia_caricato, true);
  assert.equal(b.json.materiale.codice, 'F01');
  const altro = await chiama(s.base, `/progetto/${p.json.progetto}/materiale`, { dati: { nome: 'altro.jpg' }, file: { file: f } });
  assert.equal(altro.json.materiale.codice, 'F02', 'nome diverso = file diverso');
});

test('chiudere un progetto mentre sta montando: 409, e il lavoro finisce bene', async () => {
  const p = await json(s.base, '/progetto', {});
  const pid = p.json.progetto;
  const v = await chiama(s.base, `/progetto/${pid}/materiale`, { dati: { drive_id: 'drv-oriz' }, file: { file: creaClip('mont-oriz-20.mp4', { w: 1920, h: 1080, durata: 20, audio: 'sine' }) } });
  assert.equal(v.stato, 200);
  const contenuto = { tipo: 'reel', data: '2026-12-04', ora: '18:00', pezzi: [{ scena: 'V01.1' }, { scena: 'V01.3' }, { scena: 'V01.5' }], outro: 'Prenota' };
  const lavoro = chiama(s.base, `/progetto/${pid}/monta`, { dati: { contenuto, marchio: MARCHIO }, file: {} });
  await new Promise((r) => setTimeout(r, 400));
  const ch = await json(s.base, `/progetto/${pid}/chiudi`, {});
  assert.equal(ch.stato, 409, JSON.stringify(ch.json));
  assert.equal(ch.json.errore, 'progetto_in_uso');
  const fatto = await lavoro;
  assert.equal(fatto.stato, 200, JSON.stringify(fatto.json));
  const dopo = await json(s.base, `/progetto/${pid}/chiudi`, {});
  assert.equal(dopo.stato, 200, 'finito il lavoro si chiude');
});

test('progetto inesistente, id strano, chiave mancante, piano senza «piano»', async () => {
  const f = await creaImmagine('mont-f1.jpg', { seme: 3 });
  const r = await chiama(s.base, '/progetto/0123456789abcdef0123/materiale', { dati: {}, file: { file: f } });
  assert.equal(r.stato, 404);
  assert.equal(r.json.errore, 'progetto_non_trovato');
  const strano = await json(s.base, '/progetto/..%2F..%2Fetc', undefined, 'GET');
  assert.equal(strano.stato, 404);
  const senza = await fetch(`${s.base}/progetto`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(senza.status, 401);
  const p = await json(s.base, '/progetto', {});
  const vuoto = await chiama(s.base, `/progetto/${p.json.progetto}/catalogo`, {});
  assert.equal(vuoto.stato, 422);
  assert.equal(vuoto.json.errore, 'progetto_vuoto');
  const np = await json(s.base, `/progetto/${p.json.progetto}/piano`, { mese: '2026-12' });
  assert.equal(np.stato, 400);
});

test('scadenza: un progetto fermo oltre PROGETTO_DURATA_ORE si cancella da solo', async () => {
  const s2 = await avviaServer({ PROGETTO_DURATA_ORE: String(2 / 3600), PULIZIA_OGNI_SEC: '1' });
  try {
    const p = await json(s2.base, '/progetto', { nome: 'scade' });
    const dir = path.join(s2.datiDir, 'progetti', p.json.progetto);
    assert.equal(fs.existsSync(dir), true);
    await new Promise((r) => setTimeout(r, 4500));
    assert.equal(fs.existsSync(dir), false, 'cancellato dalla pulizia');
    const g = await json(s2.base, `/progetto/${p.json.progetto}`, undefined, 'GET');
    assert.equal(g.stato, 404);
  } finally {
    await s2.ferma();
  }
});

test('limite del materiale: MAX_MATERIALE_MB vale per il materiale, i lavori normali restano a MAX_FILE_MB', async () => {
  const s3 = await avviaServer({ MAX_MATERIALE_MB: '0.05', MAX_FILE_MB: '300' });
  try {
    const grande = await creaImmagine('mont-grande.jpg', { seme: 9, w: 3000, h: 2000, rumore: true });
    const p = await json(s3.base, '/progetto', {});
    const r = await chiama(s3.base, `/progetto/${p.json.progetto}/materiale`, { dati: {}, file: { file: grande } });
    assert.equal(r.stato, 413, JSON.stringify(r.json));
    assert.equal(r.json.errore, 'file_troppo_grande');
    const ok = await chiama(s3.base, '/foto/prepara', { dati: {}, file: { foto: grande } });
    assert.equal(ok.stato, 200, JSON.stringify(ok.json));
  } finally {
    await s3.ferma();
  }
});
