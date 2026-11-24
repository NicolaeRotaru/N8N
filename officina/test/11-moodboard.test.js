// Officina 1.4: rallenty, LUT per il girato in log, più formati dalla stessa regia, spazio su disco, conservazione dei
// progetti, reel del piano del mese montati con la regia di Scatti di G.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { avviaServer, chiama, scarica, sondaFile, ffmpeg, MATERIALE, TMP, CHIAVE } from './aiuti.js';
import { decidiRallenty, scalaMateriale, fpsDa } from '../src/rallenty.js';
import { controllaCube, nomeLut, filtroLut } from '../src/lut.js';
import { controllaRegia, regoleDelloStile } from '../src/regia.js';
import { controllaPiano } from '../src/piano.js';
import { STILI } from '../src/regia-render.js';
import { leggiConfig } from '../src/config.js';

const H = { 'x-officina-chiave': CHIAVE, 'content-type': 'application/json' };
const R = regoleDelloStile(STILI.sdg);
fs.mkdirSync(MATERIALE, { recursive: true });

// ------------------------------------------------------------------ parti che calcolano (senza server)
test('rallenty: si rallenta solo il girato veloce senza parlato; mai più di 4 volte; «no» lo spegne, «si» lo forza', () => {
  assert.equal(fpsDa('60000/1001').toFixed(2), '59.94');
  assert.deepEqual(decidiRallenty({ fps: 50, parlato: null }), { fps_origine: 50, fps: 25, fattore: 2 });
  assert.equal(decidiRallenty({ fps: 59.94, parlato: [] }).fattore, 2.3976);
  assert.equal(decidiRallenty({ fps: 240, parlato: null }).fattore, 4, 'mai più lento di 4 volte');
  assert.equal(decidiRallenty({ fps: 30, parlato: null }), null, 'a 30 fotogrammi non si rallenta');
  assert.equal(decidiRallenty({ fps: 25, parlato: null }), null);
  const parla = [{ inizio: 0, fine: 3, testo: 'buongiorno a tutti voi', parole: [{}, {}, {}, {}] }];
  assert.equal(decidiRallenty({ fps: 50, parlato: parla }), null, 'un\'intervista girata a 50 resta a velocità normale');
  assert.equal(decidiRallenty({ fps: 50, parlato: parla, modo: 'si' }).fattore, 2);
  assert.equal(decidiRallenty({ fps: 100, parlato: null, modo: 'no' }), null);
  const m = scalaMateriale({ codice: 'V03', durata: 4.2, audio: true, parlato: [{ testo: 'x' }], scene: [{ codice: 'V03.1', inizio: 0, fine: 2.1, parlato: 'x' }, { codice: 'V03.2', inizio: 2.1, fine: 4.2 }] }, 2);
  assert.deepEqual([m.durata, m.audio, m.parlato, m.scene[1].inizio, m.scene[1].fine, 'parlato' in m.scene[0]], [8.4, false, null, 4.2, 8.4, false]);
});

test('LUT: nome ripulito, .cube controllato (3D, punti giusti), percorso sicuro nel filtro', () => {
  assert.equal(nomeLut('S-Log3 Sony A7IV.cube'), 's-log3-sony-a7iv');
  assert.equal(nomeLut('../../etc'), 'etc');
  assert.equal(nomeLut(''), null);
  const cubo = (n, righe = n ** 3) => `TITLE "x"\nLUT_3D_SIZE ${n}\n${Array.from({ length: righe }, () => '0.1 0.2 0.3').join('\n')}\n`;
  assert.deepEqual(controllaCube(cubo(2)), { ok: true, punti: 2 });
  assert.equal(controllaCube(cubo(3, 20)).ok, false, 'mancano punti');
  assert.equal(controllaCube('LUT_1D_SIZE 1024\n0 0 0').ok, false, 'una LUT 1D non va');
  assert.equal(controllaCube('ciao').ok, false);
  assert.equal(filtroLut('/dati/lut/slog3.cube'), 'lut3d=file=/dati/lut/slog3.cube:interp=tetrahedral,');
  assert.equal(filtroLut(null), '');
  assert.throws(() => filtroLut("/dati/lut/a'b:c.cube"));
});

test('regia con lo schema di Claude: campi vuoti, coperture come codici con la posizione, battute di sole immagini', () => {
  const P = { materiali: [
    { codice: 'V01', tipo: 'video', durata: 30, audio: true, orientamento: 'orizzontale', scene: [{ codice: 'V01.1', inizio: 0, fine: 30 }], parlato: [{ inizio: 1, fine: 9, testo: 'x', parole: Array.from({ length: 20 }, (_, k) => ({ testo: `p${k}`, inizio: 1 + k * 0.4, fine: 1.34 + k * 0.4 })) }] },
    ...[2, 3, 4].map((k) => ({ codice: `V0${k}`, tipo: 'video', durata: 10, audio: false, orientamento: 'orizzontale', scene: [{ codice: `V0${k}.1`, inizio: 0, fine: 10 }] })),
    { codice: 'F01', tipo: 'foto', larghezza: 3000, altezza: 2000 },
  ] };
  const piano = {
    battute: [
      { fonte: '', inizio: 0, fine: 0, immagini: 6, nome: '', ruolo: '', posizione_volto: '', coperture: ['V02.1 sinistra', 'F01'] },
      { fonte: 'V01', inizio: 1, fine: 9, immagini: 0, nome: 'Mario', ruolo: 'titolare', posizione_volto: 'destra', coperture: ['V03.1'] },
    ],
    coperture_riserva: ['V04.1'],
    titolo: '',
    scritte: [],
    chiusura: 'Vieni a trovarci',
    musica: true,
  };
  const tl = controllaRegia(piano, P, { R });
  assert.equal(tl.bloccante, false, JSON.stringify(tl.problemi));
  const v02 = tl.video.find((q) => q.fonte === 'V02');
  assert.equal(v02.posizione, 'sinistra', 'la posizione scritta dopo il codice arriva al ritaglio');
  assert.ok(tl.video.some((q) => q.fonte === 'F01'), 'la foto data come stringa si usa');
  assert.equal(tl.video.find((q) => q.tipo === 'volto').posizione, 'destra');
  assert.deepEqual(tl.cartelli.map((k) => k.testo), ['Mario']);
  assert.equal(tl.scritte.filter((s) => s.tipo === 'titolo').length, 0, 'titolo vuoto = niente titolo');
});

test('piano del mese con la regia: il reel si controlla con la regia, le ripetizioni si vedono fra contenuti, troppo lungo si toglie', () => {
  const P = { materiali: [
    ...[1, 2, 3].map((k) => ({ codice: `V0${k}`, tipo: 'video', durata: 12, audio: false, orientamento: 'verticale', scene: [{ codice: `V0${k}.1`, inizio: 0, fine: 12, nitidezza: 80, luminosita: 120, movimento: 3 }] })),
    { codice: 'F01', tipo: 'foto', larghezza: 2000, altezza: 3000 },
  ] };
  const vuota = { battute: [], coperture_riserva: [], titolo: '', scritte: [], chiusura: '', musica: false };
  const reel = (data, coperture, secondi = 12) => ({ tipo: 'reel', data, ora: '18:30', titolo: 'Il bancone', idea: 'x', perche: 'y', pezzi: [], foto: [], intro: '', outro: '', righe: [], musica: true, didascalia: 'Ciao', regia: { ...vuota, battute: [{ fonte: '', inizio: 0, fine: 0, immagini: secondi, nome: '', ruolo: '', posizione_volto: '', coperture }], musica: true } });
  const piano = { contenuti: [
    reel('2026-12-04', ['V01.1', 'V02.1']),
    reel('2026-12-08', ['V02.1', 'V03.1']),
    reel('2026-12-10', ['V03.1', 'V01.1', 'V02.1'], 30),
    { tipo: 'post', data: '2026-12-06', ora: '12:00', titolo: 'Foto', idea: 'x', perche: 'y', pezzi: [], foto: ['F01'], intro: '', outro: '', righe: [], musica: false, didascalia: 'Ciao', regia: vuota },
  ] };
  const r = controllaPiano(piano, P, { mese: '2026-12', R });
  assert.equal(r.contenuti.length, 4, JSON.stringify(r.problemi));
  const primo = r.contenuti.find((c) => c.data === '2026-12-04');
  assert.equal(primo.motore, 'regia');
  assert.equal(primo.durata, 12);
  assert.ok(primo.pezzi_usati.length >= 2 && primo.pezzi.length === 0);
  assert.ok(r.problemi.some((p) => p.codice === 'ripetizione' && p.n === 2), `V02 usato nel contenuto 1 e nel 2: ${JSON.stringify(r.problemi)}`);
  const post = r.contenuti.find((c) => c.tipo === 'post');
  assert.ok(post && !post.motore && post.foto[0] === 'F01', 'il post resta un post (la regia vuota non conta)');
  // una storia video oltre i 59,9 secondi si toglie
  const lunga = { contenuti: [{ ...reel('2026-12-04', ['V01.1', 'V02.1', 'V03.1'], 30), tipo: 'storia_video', regia: { ...vuota, battute: [1, 2, 3].map((k) => ({ fonte: '', inizio: 0, fine: 0, immagini: 25, nome: '', ruolo: '', posizione_volto: '', coperture: [`V0${k}.1`] })) } }] };
  const r2 = controllaPiano(lunga, P, { mese: '2026-12', R });
  assert.equal(r2.contenuti.length, 0);
  assert.ok(r2.problemi.some((p) => p.codice === 'troppo_lungo'), JSON.stringify(r2.problemi));
  // una regia senza niente di montabile si toglie con il motivo
  const rotta = { contenuti: [{ ...reel('2026-12-04', ['Z99.1']) }] };
  const r3 = controllaPiano(rotta, P, { mese: '2026-12', R });
  assert.ok(r3.problemi.some((p) => p.codice === 'regia_non_valida'), JSON.stringify(r3.problemi));
});

test('conservazione: i progetti restano 14 giorni di serie; serve spazio libero per caricare', () => {
  const c = leggiConfig({});
  assert.equal(c.progettoDurataMs, 336 * 3600 * 1000);
  assert.equal(c.minDiscoLiberoByte, 3000 * 1024 * 1024);
  assert.equal(c.rallenty, 'auto');
  assert.equal(c.fpsRallenty, 25);
  assert.equal(leggiConfig({ RALLENTY: 'boh' }).rallenty, 'auto');
});

// ------------------------------------------------------------------ con il server vero
let s;
let pieno;
before(async () => {
  s = await avviaServer();
  pieno = await avviaServer({ MIN_DISCO_LIBERO_MB: '999999999' });
});
after(async () => {
  await s?.ferma();
  await pieno?.ferma();
});

const progettoNuovo = async (base, nome) => (await (await fetch(`${base}/progetto`, { method: 'POST', headers: H, body: JSON.stringify({ nome }) })).json()).progetto;
const carica = async (base, pid, f, dati = {}) => chiama(base, `/progetto/${pid}/materiale`, { dati: { nome: path.basename(f), drive_id: `${f}:${JSON.stringify(dati)}`, ...dati }, file: { file: f } });
const clip = (nome, args) => {
  const p = path.join(MATERIALE, nome);
  if (!fs.existsSync(p)) ffmpeg([...args, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', p]);
  return p;
};
const pacchetti = (p) => Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', p]).toString().trim());

test('disco quasi pieno: il materiale non entra (507) e il messaggio dice cosa fare', async () => {
  const f = clip('mb-30.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=4']);
  const pid = await progettoNuovo(pieno.base, 'pieno');
  const r = await carica(pieno.base, pid, f);
  assert.equal(r.stato, 507, JSON.stringify(r.json));
  assert.equal(r.json.errore, 'disco_pieno');
  assert.match(r.json.messaggio, /MB liberi/);
});

test('rallenty vero: una clip a 50 fotogrammi senza voce entra rallentata (doppia durata, 25 fotogrammi); con «rallenta: no» resta com\'è', async () => {
  const f50 = clip('mb-50.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=50:duration=4', '-r', '50']);
  const pid = await progettoNuovo(s.base, 'rallenty');
  const r = await carica(s.base, pid, f50);
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  assert.equal(r.json.materiale.codice, 'V01');
  assert.ok(Math.abs(r.json.materiale.durata - 8) < 0.15, `durata ${r.json.materiale.durata}`);
  assert.ok(r.json.avvisi.some((a) => a.codice === 'rallenty'), JSON.stringify(r.json.avvisi));
  const stato = await (await fetch(`${s.base}/progetto/${pid}`, { headers: H })).json();
  const m = stato.materiali.find((x) => x.codice === 'V01');
  assert.ok(m.scene.at(-1).fine > 7.5, 'le scene sono nel tempo della clip rallentata');
  const no = await carica(s.base, pid, f50, { rallenta: 'no' });
  assert.equal(no.stato, 200, JSON.stringify(no.json));
  assert.ok(Math.abs(no.json.materiale.durata - 4) < 0.1, `con «no» la durata resta 4: ${no.json.materiale.durata}`);
  // il file rallentato si monta: una regia di 7 secondi di sole immagini sulla clip da 8
  const piano = { battute: [{ immagini: 7, coperture: ['V01.1'] }] };
  const mt = await chiama(s.base, `/progetto/${pid}/regia/monta`, { dati: { piano, stile: 'sdg' }, file: {} });
  assert.equal(mt.stato, 200, JSON.stringify(mt.json));
  const pv = path.join(TMP, 'mb-rallenty.mp4');
  fs.writeFileSync(pv, (await scarica(mt.json.file[0].url)).buf);
  assert.equal(pacchetti(pv), 175, '7 s × 25 fotogrammi');
});

test('LUT vera: si carica una volta, la regia la applica alle clip giuste; una LUT che non c\'è ferma il montaggio con il motivo', async () => {
  // LUT che inverte i colori (2×2×2): il bianco diventa nero, così l'effetto si misura senza dubbi
  const righe = [];
  for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) righe.push(`${1 - r} ${1 - g} ${1 - b}`);
  const fileLut = path.join(MATERIALE, 'inverti.cube');
  fs.writeFileSync(fileLut, `TITLE "inverti"\nLUT_3D_SIZE 2\n${righe.join('\n')}\n`);
  const up = await chiama(s.base, '/lut', { dati: { nome: 'Inverti Prova' }, file: { file: fileLut } });
  assert.equal(up.stato, 200, JSON.stringify(up.json));
  assert.equal(up.json.lut, 'inverti-prova');
  const el = await (await fetch(`${s.base}/lut`, { headers: H })).json();
  assert.ok(el.elenco.includes('inverti-prova'));
  const finta = path.join(MATERIALE, 'finta.cube');
  fs.writeFileSync(finta, 'non sono una lut');
  const male = await chiama(s.base, '/lut', { dati: { nome: 'finta' }, file: { file: finta } });
  assert.equal(male.stato, 415);

  const bianca = clip('mb-bianca.mp4', ['-f', 'lavfi', '-i', 'color=c=white:s=1080x1920:r=30:d=6[b];testsrc2=s=200x200:r=30:d=6[t];[b][t]overlay=x=\'mod(t*100,800)\':y=200']);
  const pid = await progettoNuovo(s.base, 'lut');
  const r = await carica(s.base, pid, bianca);
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  const piano = { battute: [{ immagini: 4, coperture: ['V01.1'] }] };
  const luce = async (dati) => {
    const mt = await chiama(s.base, `/progetto/${pid}/regia/monta`, { dati: { piano, stile: 'pulito', ...dati }, file: {} });
    assert.equal(mt.stato, 200, JSON.stringify(mt.json));
    const pv = path.join(TMP, 'mb-lut.mp4');
    fs.writeFileSync(pv, (await scarica(mt.json.file[0].url)).buf);
    const fg = path.join(TMP, 'mb-lut.png');
    ffmpeg(['-ss', '2', '-i', pv, '-frames:v', '1', '-y', fg]);
    const { data } = await sharp(fg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return data[(1500 * 1080 + 540) * 3];
  };
  const senza = await luce({});
  const con = await luce({ lut: 'inverti-prova' });
  assert.ok(senza > 200, `senza LUT il bianco resta bianco: ${senza}`);
  assert.ok(con < 50, `con la LUT il bianco diventa nero: ${con}`);
  assert.ok((await luce({ lut: 'inverti-prova', lut_materiali: { V01: 'no' } })) > 200, '«no» per una clip toglie la LUT a quella clip');
  const manca = await chiama(s.base, `/progetto/${pid}/regia/monta`, { dati: { piano, lut: 'non-esiste' }, file: {} });
  assert.equal(manca.stato, 422);
  assert.equal(manca.json.errore, 'lut_mancante');
});

test('due formati dalla stessa regia: verticale 1080×1920 e orizzontale 1920×1080, stessi fotogrammi', async () => {
  const oriz = clip('mb-oriz.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=10']);
  const pid = await progettoNuovo(s.base, 'formati');
  assert.equal((await carica(s.base, pid, oriz)).stato, 200);
  const piano = { battute: [{ immagini: 6, coperture: ['V01.1'] }], chiusura: 'Ci vediamo' };
  const mt = await chiama(s.base, `/progetto/${pid}/regia/monta`, { dati: { piano, stile: 'sdg', formati: ['verticale', 'orizzontale'] }, file: {} });
  assert.equal(mt.stato, 200, JSON.stringify(mt.json));
  assert.deepEqual(mt.json.formati.map((f) => f.formato), ['verticale', 'orizzontale']);
  const misure = [];
  for (const f of mt.json.formati) {
    const v = f.file.find((x) => x.tipo === 'video');
    assert.match(v.url, new RegExp(`${f.formato}-video\\.mp4$`));
    const pv = path.join(TMP, `mb-${f.formato}.mp4`);
    fs.writeFileSync(pv, (await scarica(v.url)).buf);
    const sv = sondaFile(pv).streams.find((x) => x.codec_type === 'video');
    misure.push([sv.width, sv.height, pacchetti(pv)]);
  }
  assert.deepEqual(misure, [[1080, 1920, 150], [1920, 1080, 150]]);
  const no = await chiama(s.base, `/progetto/${pid}/regia/monta`, { dati: { piano, formati: ['verticale', 'cinema'] }, file: {} });
  assert.equal(no.stato, 400);
});

test('montatore: un reel del piano con la regia passa da /piano e da /monta ed esce nello stile di Scatti di G', async () => {
  const pid = await progettoNuovo(s.base, 'piano regia');
  for (const n of ['mb-oriz.mp4', 'mb-bianca.mp4']) assert.equal((await carica(s.base, pid, path.join(MATERIALE, n))).stato, 200);
  const vuota = { battute: [], coperture_riserva: [], titolo: '', scritte: [], chiusura: '', musica: false };
  const contenuto = { tipo: 'reel', data: '2026-12-04', ora: '18:30', titolo: 'Prova', idea: 'x', perche: 'y', pezzi: [], foto: [], intro: '', outro: '', righe: [], musica: true, didascalia: 'Ciao',
    regia: { ...vuota, battute: [{ fonte: '', inizio: 0, fine: 0, immagini: 9, nome: '', ruolo: '', posizione_volto: '', coperture: ['V01.1 sinistra', 'V02.1'] }], titolo: 'Il bancone', musica: true } };
  const ctl = await (await fetch(`${s.base}/progetto/${pid}/piano`, { method: 'POST', headers: H, body: JSON.stringify({ piano: { contenuti: [contenuto] }, mese: '2026-12', stile: 'sdg' }) })).json();
  assert.equal(ctl.contenuti.length, 1, JSON.stringify(ctl.problemi));
  assert.equal(ctl.contenuti[0].motore, 'regia');
  const mt = await chiama(s.base, `/progetto/${pid}/monta`, { dati: { contenuto: ctl.contenuti[0], marchio: { colori: { primario: '#222222' }, font: 'Inter' }, marchio_valido: false, stile: 'sdg' }, file: {} });
  assert.equal(mt.stato, 200, JSON.stringify(mt.json));
  assert.deepEqual(mt.json.file.map((f) => f.tipo), ['video', 'copertina', 'fotogrammi']);
  assert.ok(mt.json.avvisi.some((a) => a.codice === 'musica_mancante'), 'senza file musicale lo dice');
  const pv = path.join(TMP, 'mb-montatore.mp4');
  fs.writeFileSync(pv, (await scarica(mt.json.file[0].url)).buf);
  const sv = sondaFile(pv).streams.find((x) => x.codec_type === 'video');
  assert.deepEqual([sv.width, sv.height, sv.avg_frame_rate, pacchetti(pv)], [1080, 1920, '25/1', 225]);
});
