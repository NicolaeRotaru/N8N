// Officina 1.4: rallenty, LUT per il girato in log, più formati dalla stessa regia, spazio su disco, conservazione dei
// progetti, reel del piano del mese montati con la regia di Scatti di G.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { avviaServer, chiama, scarica, sondaFile, ffmpeg, MATERIALE, TMP, CHIAVE } from './aiuti.js';
import { decidiRallenty, scalaMateriale, fpsDa, modoRallenty } from '../src/rallenty.js';
import { controllaCube, nomeLut, filtroLut } from '../src/lut.js';
import { controllaRegia, regoleDelloStile } from '../src/regia.js';
import { controllaPiano } from '../src/piano.js';
import { STILI, stileDa, filtroVoce, misuraRitardoVoce, VOCE_STUDIO, VOCE_STUDIO_SENZA_RITARDO, grafoInquadratura, modoInquadratura, FORMATI } from '../src/regia-render.js';
import { leggiConfig } from '../src/config.js';
import { provaFiltri } from '../src/autoprova.js';

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
  // un audio che si sente e nessuna trascrizione (whisper assente, piantato, o trascrizione spenta): non si rallenta
  assert.equal(decidiRallenty({ fps: 50, parlato: null, audio: true, volumeMax: -12 }), null, 'potrebbe essere un\'intervista: resta com\'è');
  assert.equal(decidiRallenty({ fps: 50, parlato: [], audio: true, volumeMax: -12 }).fattore, 2, 'trascritta e nessuno parla: si rallenta');
  assert.equal(decidiRallenty({ fps: 50, parlato: null, audio: true, volumeMax: -60 }).fattore, 2, 'audio quasi muto: si rallenta');
  assert.equal(decidiRallenty({ fps: 50, parlato: null, audio: true, volumeMax: -12, modo: 'si' }).fattore, 2);
  // il modo scritto come sì/no del modulo
  assert.deepEqual([false, 0, 'no', 'NO', true, 1, 'si', 'sì', 'boh', undefined].map(modoRallenty), ['no', 'no', 'no', 'no', 'si', 'si', 'si', 'si', 'auto', 'auto']);
  assert.equal(decidiRallenty({ fps: 50, parlato: null, modo: false }), null, 'false spegne il rallenty');
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
  // coperture scritte come oggetti con i campi vuoti dello schema: vale il primo campo pieno
  const oggetti = controllaRegia({ battute: [{ fonte: '', immagini: 6, coperture: [{ scena: '', foto: 'F01', codice: '' }, { scena: 'V02.1', foto: '', posizione: 'destra' }] }] }, P, { R });
  assert.equal(oggetti.bloccante, false, JSON.stringify(oggetti.problemi));
  assert.ok(oggetti.video.some((q) => q.fonte === 'F01') && oggetti.video.find((q) => q.fonte === 'V02').posizione === 'destra');
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
  // una storia sotto i 2 secondi si toglie
  const corta = controllaPiano({ contenuti: [{ ...reel('2026-12-04', ['V01.1'], 1), tipo: 'storia_video' }] }, P, { mese: '2026-12', R });
  assert.ok(corta.problemi.some((p) => p.codice === 'troppo_corto'), JSON.stringify(corta.problemi));
  // il ritmo conta: con lo stesso piano, quattro coperture su 9 secondi diventano 3 inquadrature (sdg) o 4 (virale)
  const quattro = { contenuti: [reel('2026-12-04', ['V01.1', 'V02.1', 'V03.1', 'V01.1'], 9)] };
  assert.equal(controllaPiano(quattro, P, { mese: '2026-12', R }).contenuti[0].pezzi_usati.length, 3);
  assert.equal(controllaPiano(quattro, P, { mese: '2026-12', R: regoleDelloStile(STILI.virale) }).contenuti[0].pezzi_usati.length, 4);
  // una regia senza niente di montabile si toglie con il motivo
  const rotta = { contenuti: [{ ...reel('2026-12-04', ['Z99.1']) }] };
  const r3 = controllaPiano(rotta, P, { mese: '2026-12', R });
  assert.ok(r3.problemi.some((p) => p.codice === 'regia_non_valida'), JSON.stringify(r3.problemi));
});

test('identità dal Config, voce da studio, volto verticale nel formato orizzontale', async () => {
  const id = stileDa('sdg', null, { fondo: '#1E1C1A', testo: '#FAF7F2', accento: '#C9A227', font_titoli: 'Playfair Display', font_testo: 'rotto<script>' });
  assert.deepEqual(id.colori, { fondo: '#1E1C1A', testo: '#FAF7F2', accento: '#C9A227' });
  assert.deepEqual([id.font_titoli, id.font_testo], ['Playfair Display', 'Poppins'], 'un nome di font non valido si ignora');
  assert.equal(stileDa('sdg', { colori: { primario: '#D94F3D' } }, { accento: '#C9A227' }).colori.accento, '#D94F3D', 'il colore del cliente vince sull\'oro di Scatti di G');
  assert.equal(stileDa('sdg', null, { fondo: 'nero' }).colori.fondo, '#2C2A27');
  assert.equal(stileDa('virale', null, { accento: '#C9A227', font_titoli: 'Playfair Display' }).colori.accento, '#D2FF3A', 'l\'identità di Scatti di G non tocca lo stile virale');
  assert.equal(stileDa('pulito', null, { fondo: '#1E1C1A' }).colori.fondo, '#111111');
  assert.match(await filtroVoce(stileDa('sdg'), { ffmpeg: 'ffmpeg' }), new RegExp(`^${VOCE_STUDIO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},atrim=start_sample=\\d+,asetpts=PTS-STARTPTS,apad=pad_len=\\d+,$`));
  assert.equal(await filtroVoce(stileDa('virale'), { ffmpeg: 'ffmpeg' }), '');
  // se la misura del ritardo non riesce (FFmpeg diverso, filtro che manca) la catena resta, senza il filtro che ritarda
  assert.equal(await misuraRitardoVoce({ ffmpeg: '/non/esiste/ffmpeg' }), null);
  assert.doesNotMatch(VOCE_STUDIO_SENZA_RITARDO, /afftdn/);
  const vert = { larghezza: 1080, altezza: 1920, trasferimento: '' };
  const oriz = { larghezza: 1920, altezza: 1080, trasferimento: '' };
  const sdg = stileDa('sdg');
  assert.equal(modoInquadratura({ tipo: 'volto' }, vert, FORMATI.orizzontale, sdg), 'intera', 'un volto verticale in 16:9 esce intero, non tagliato sotto gli occhi');
  assert.equal(modoInquadratura({ tipo: 'volto' }, oriz, FORMATI.verticale, sdg), 'riempi');
  assert.equal(modoInquadratura({ tipo: 'copertura' }, oriz, FORMATI.verticale, sdg), 'riempi');
  assert.equal(modoInquadratura({ tipo: 'copertura', posizione: 'intera' }, oriz, FORMATI.verticale, sdg), 'intera');
  assert.equal(modoInquadratura({ tipo: 'copertura' }, vert, FORMATI.orizzontale, sdg), 'intera', 'anche una copertura verticale in 16:9 esce intera');
  assert.match(grafoInquadratura(vert, FORMATI.orizzontale, { modo: 'riempi' }), /crop=1920:1080:max\(0\\,min\(iw-ow\\,iw\/2-ow\/2\)\):\(ih-oh\)\*0\.3,/, 'una copertura verticale in 16:9 si ritaglia dal terzo alto');
  assert.match(grafoInquadratura(oriz, FORMATI.verticale, { modo: 'riempi' }), /\(ih-oh\)\/2/);
});

test('voce da studio: toglie il ronzio sotto 80 Hz, non ritarda la voce, non cambia la durata', async () => {
  // il filtro vero che usa il montaggio, con il ritardo misurato sull'FFmpeg di questa macchina
  const voce = await filtroVoce(stileDa('sdg'), { ffmpeg: 'ffmpeg' });
  const dir = path.join(TMP, 'voce-studio');
  fs.mkdirSync(dir, { recursive: true });
  const ingresso = path.join(dir, 'ingresso.wav');
  // un colpo secco a 1 s (per misurare il ritardo), una «voce» a 220 Hz e un ronzio a 40 Hz sotto
  ffmpeg(['-y', '-f', 'lavfi', '-i', "aevalsrc='if(between(t,1,1.002),0.9,0)+0.25*sin(2*PI*220*t)*between(t,1.5,3.5)+0.2*sin(2*PI*40*t)':s=48000:d=4", '-ac', '2', ingresso]);
  // il ritardo si misura su un colpo da solo (con il ronzio sotto, il passa-alto cambia la forma del colpo)
  const colpo = path.join(dir, 'colpo.wav');
  ffmpeg(['-y', '-f', 'lavfi', '-i', "aevalsrc='if(between(t,1,1.002),0.9,0)+0.3*sin(2*PI*1000*t)*between(t,0.5,3)':s=48000:d=4", '-ac', '2', colpo]);
  const campioni = (filtro) => {
    const b = execFileSync('ffmpeg', ['-v', 'error', '-i', colpo, '-af', `aformat=sample_rates=48000,${filtro}aformat=sample_fmts=s16:channel_layouts=mono`, '-f', 's16le', '-'], { maxBuffer: 1 << 26 });
    return new Int16Array(b.buffer, b.byteOffset, b.length / 2);
  };
  const prima = campioni('');
  const dopo = campioni(voce);
  assert.equal(dopo.length, prima.length, 'stessa durata');
  const picco = (x) => { let m = 47000; for (let i = 47000; i < 50000; i++) if (Math.abs(x[i]) > Math.abs(x[m])) m = i; return m; };
  assert.ok(Math.abs(picco(dopo) - picco(prima)) <= 48, `la voce si sposta di ${(picco(dopo) - picco(prima)) / 48} ms (massimo 1)`);
  const ronzioPrima = Number(/mean_volume: (-?[\d.]+) dB/.exec(execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${ingresso}" -af "bandpass=f=40:width_type=h:w=12,volumedetect" -f null - 2>&1`]).toString())[1]);
  const ronzioDopo = Number(/mean_volume: (-?[\d.]+) dB/.exec(execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${ingresso}" -af "aformat=sample_rates=48000,${voce}bandpass=f=40:width_type=h:w=12,volumedetect" -f null - 2>&1`]).toString())[1]);
  assert.ok(ronzioPrima - ronzioDopo >= 12, `il ronzio a 40 Hz scende solo di ${(ronzioPrima - ronzioDopo).toFixed(1)} dB`);
});

test('il caso del millesimo: 4,931 s da coprire con 4,93 s di clip non lascia un volto da 1 ms', () => {
  const P = { materiali: [
    { codice: 'V01', tipo: 'video', durata: 60, audio: true, parlato: null, scene: [{ codice: 'V01.1', inizio: 0, fine: 60 }] },
    { codice: 'V02', tipo: 'video', durata: 4.93, audio: false, scene: [{ codice: 'V02.1', inizio: 0, fine: 4.93 }] },
  ] };
  const tl = controllaRegia({ battute: [{ fonte: 'V01', inizio: 5, fine: 12.931, coperture: ['V02.1'] }] }, P, { R });
  assert.equal(tl.bloccante, false, JSON.stringify(tl.problemi));
  assert.ok(tl.video.every((q) => q.a - q.da > 0.03), JSON.stringify(tl.video));
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

test('prova dei filtri: sull\'FFmpeg del server girano tutti; se ne manca uno o il grafo si rompe, /salute lo dice', async () => {
  const dati = fs.mkdtempSync(path.join(TMP, 'autoprova-'));
  const FF = 'ffmpeg'; // il programma vero (nelle prove «ffmpeg» importato è una funzione)
  const vera = await provaFiltri({ ffmpeg: FF, datiDir: dati });
  assert.equal(vera.ok, true, JSON.stringify(vera));
  assert.deepEqual(vera.mancanti, []);
  assert.match(String(vera.ffmpeg), /^\d/);
  assert.ok(vera.ritardo_voce >= 0, 'il ritardo della voce si misura');
  // un FFmpeg finto davanti a quello vero: nasconde un filtro, oppure rompe il grafo come farebbe un'opzione sconosciuta
  const finto = (nome, corpo) => {
    const f = path.join(dati, nome);
    fs.writeFileSync(f, `#!/bin/sh\n${corpo}\n`, { mode: 0o755 });
    return f;
  };
  const senzaDeesser = finto('senza-deesser', `if [ "$2" = "-filters" ]; then "${FF}" "$@" | grep -v ' deesser '; exit 0; fi\nexec "${FF}" "$@"`);
  const manca = await provaFiltri({ ffmpeg: senzaDeesser, datiDir: dati });
  assert.equal(manca.ok, false);
  assert.deepEqual(manca.mancanti, ['deesser']);
  assert.match(manca.errore, /mancano: deesser/);
  const grafoRotto = finto('grafo-rotto', `for a in "$@"; do if [ "$a" = "-filter_complex" ]; then echo "Option 'tn' not found" >&2; exit 1; fi; done\nexec "${FF}" "$@"`);
  const rotto = await provaFiltri({ ffmpeg: grafoRotto, datiDir: dati });
  assert.equal(rotto.ok, false);
  assert.match(rotto.errore, /non girano: .*Option 'tn' not found/);
  const voceMuta = finto('voce-muta', `for a in "$@"; do if [ "$a" = "s16le" ]; then exit 1; fi; done\nexec "${FF}" "$@"`);
  const muta = await provaFiltri({ ffmpeg: voceMuta, datiDir: dati });
  assert.equal(muta.ok, false);
  assert.equal(muta.ritardo_voce, null);
  assert.match(muta.errore, /voce da studio/);
  const assente = await provaFiltri({ ffmpeg: path.join(dati, 'non-esiste'), datiDir: dati });
  assert.equal(assente.ok, false);
  assert.match(assente.errore, /FFmpeg non risponde/);
  // /salute con la chiave porta l'esito; senza chiave resta {ok:true}
  const conChiave = await (await fetch(`${s.base}/salute`, { headers: { 'x-officina-chiave': CHIAVE } })).json();
  assert.equal(conChiave.filtri.ok, true, JSON.stringify(conChiave.filtri));
  assert.deepEqual(conChiave.filtri.mancanti, []);
  assert.deepEqual(await (await fetch(`${s.base}/salute`)).json(), { ok: true });
  const sbagliato = await avviaServer({ FFMPEG_BIN: grafoRotto });
  try {
    const f = (await (await fetch(`${sbagliato.base}/salute`, { headers: { 'x-officina-chiave': CHIAVE } })).json()).filtri;
    assert.equal(f.ok, false);
    assert.match(f.errore, /non girano/);
  } finally {
    await sbagliato.ferma();
  }
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
  const falso = await carica(s.base, pid, f50, { rallenta: false });
  assert.ok(Math.abs(falso.json.materiale.durata - 4) < 0.1, `con false (sì/no del modulo) la durata resta 4: ${falso.json.materiale.durata}`);
  // la clip rallentata per sbaglio, ricaricata con lo STESSO id di Drive e «rallenta: no», rientra a velocità normale
  const stessoId = (dati) => chiama(s.base, `/progetto/${pid}/materiale`, { dati: { nome: 'mb-50.mp4', drive_id: 'drive-stesso-50', ...dati }, file: { file: f50 } });
  const prima = await stessoId({});
  assert.ok(prima.json.materiale.durata > 7.5, 'la prima volta si rallenta');
  const rientra = await stessoId({ rallenta: 'no' });
  assert.notEqual(rientra.json.gia_caricato, true, 'con «rallenta: no» non è un doppione');
  assert.ok(Math.abs(rientra.json.materiale.durata - 4) < 0.1);
  assert.equal((await stessoId({ rallenta: 'no' })).json.gia_caricato, true, 'il Retry di n8n resta un doppione');
  // il file rallentato si monta: una regia di 7 secondi di sole immagini sulla clip da 8, e si MUOVE per tutti i 7
  // secondi (se il rallenty allungasse solo la durata scritta, dopo 4 s l'immagine resterebbe ferma)
  const piano = { battute: [{ immagini: 7, coperture: ['V01.1'] }] };
  const mt = await chiama(s.base, `/progetto/${pid}/regia/monta`, { dati: { piano, stile: 'sdg' }, file: {} });
  assert.equal(mt.stato, 200, JSON.stringify(mt.json));
  assert.deepEqual(mt.json.controllo.fermi, [], `immagine ferma nel rallenty: ${JSON.stringify(mt.json.controllo)}`);
  // un'intervista a 50 fotogrammi con la voce, senza trascrizione (qui whisper non c'è): resta a velocità normale
  const voce50 = clip('mb-voce-50.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=50:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=4', '-map', '0:v', '-map', '1:a', '-r', '50', '-c:a', 'aac']);
  const iv = await carica(s.base, pid, voce50);
  assert.equal(iv.stato, 200, JSON.stringify(iv.json));
  assert.ok(Math.abs(iv.json.materiale.durata - 4) < 0.1, `l'intervista non va rallentata: ${iv.json.materiale.durata}`);
  assert.ok(iv.json.avvisi.some((a) => a.codice === 'rallenty_incerto'), JSON.stringify(iv.json.avvisi));
  // il rimedio che l'avviso propone funziona: ricaricata con «rallenta: si» (stesso id di Drive) entra rallentata
  const si = await chiama(s.base, `/progetto/${pid}/materiale`, { dati: { nome: path.basename(voce50), drive_id: `${voce50}:{}`, rallenta: 'si' }, file: { file: voce50 } });
  assert.notEqual(si.json.gia_caricato, true, JSON.stringify(si.json));
  assert.ok(si.json.materiale.durata > 7.5, `con «si» si rallenta: ${si.json.materiale.durata}`);
  // la clip rallentata ricaricata senza id di Drive (stessi byte dell'originale) è la stessa
  const doppia = await chiama(s.base, `/progetto/${pid}/materiale`, { dati: { nome: path.basename(f50) }, file: { file: f50 } });
  const ancora = await chiama(s.base, `/progetto/${pid}/materiale`, { dati: { nome: path.basename(f50) }, file: { file: f50 } });
  assert.equal(doppia.stato, 200);
  assert.equal(ancora.json.gia_caricato, true, 'riconosciuta dai byte dell\'originale, non da quelli del file rallentato');
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
  // la LUT data al caricamento del materiale vale da sola, senza dirla al montaggio
  const conLut = await carica(s.base, pid, bianca, { lut: 'Inverti Prova' });
  assert.equal(conLut.json.materiale.codice, 'V02');
  const pianoV02 = { battute: [{ immagini: 4, coperture: ['V02.1'] }] };
  const mt2 = await chiama(s.base, `/progetto/${pid}/regia/monta`, { dati: { piano: pianoV02, stile: 'pulito' }, file: {} });
  assert.equal(mt2.stato, 200, JSON.stringify(mt2.json));
  const pv2 = path.join(TMP, 'mb-lut2.mp4');
  fs.writeFileSync(pv2, (await scarica(mt2.json.file[0].url)).buf);
  const fg2 = path.join(TMP, 'mb-lut2.png');
  ffmpeg(['-ss', '2', '-i', pv2, '-frames:v', '1', '-y', fg2]);
  const { data: d2 } = await sharp(fg2).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.ok(d2[(1500 * 1080 + 540) * 3] < 50, 'la LUT del materiale è stata applicata');
  // anche il montaggio del piano (/monta) vuole una LUT che esiste
  const vuota = { battute: [], coperture_riserva: [], titolo: '', scritte: [], chiusura: '', musica: false };
  const cont = { tipo: 'reel', data: '2026-12-04', ora: '18:30', titolo: 'x', idea: '', perche: '', pezzi: [], foto: [], intro: '', outro: '', righe: [], musica: false, didascalia: '', regia: { ...vuota, battute: [{ fonte: '', inizio: 0, fine: 0, immagini: 6, nome: '', ruolo: '', posizione_volto: '', coperture: ['V01.1'] }] } };
  const lm = await chiama(s.base, `/progetto/${pid}/monta`, { dati: { contenuto: cont, lut: 'non-esiste' }, file: {} });
  assert.equal(lm.stato, 422);
  assert.equal(lm.json.errore, 'lut_mancante');
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
  // una copertura VERTICALE nel 16:9 esce intera, con i lati sfocati (non ritagliata a un terzo dell'altezza)
  const vert = clip('mb-vert.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=8']);
  assert.equal((await carica(s.base, pid, vert)).stato, 200);
  const mv = await chiama(s.base, `/progetto/${pid}/regia/monta`, { dati: { piano: { battute: [{ immagini: 4, coperture: ['V02.1'] }] }, stile: 'sdg', formato: 'orizzontale' }, file: {} });
  assert.equal(mv.stato, 200, JSON.stringify(mv.json));
  const pvv = path.join(TMP, 'mb-vert-16-9.mp4');
  fs.writeFileSync(pvv, (await scarica(mv.json.file[0].url)).buf);
  const fgv = path.join(TMP, 'mb-vert-16-9.png');
  ffmpeg(['-ss', '2', '-i', pvv, '-frames:v', '1', '-y', fgv]);
  const { data: dv, info: iv } = await sharp(fgv).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  const salti = (x0, x1) => { let t = 0; for (let y = 100; y < 980; y += 4) for (let x = x0; x < x1; x++) t += Math.abs(dv[y * iv.width + x + 1] - dv[y * iv.width + x]); return t / ((x1 - x0) * 220); };
  assert.ok(salti(40, 400) < salti(800, 1100) / 3, `i lati non sono sfocati (${salti(40, 400).toFixed(2)} contro ${salti(800, 1100).toFixed(2)} al centro)`);
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
  // il ritmo dello stile arriva anche alla rotta /piano: quattro coperture su 9 s → 3 inquadrature (sdg), 4 (virale)
  const quattro = { ...contenuto, regia: { ...contenuto.regia, battute: [{ ...contenuto.regia.battute[0], coperture: ['V01.1', 'V02.1', 'V01.1 destra', 'V02.1'] }] } };
  const conta = async (stile) => (await (await fetch(`${s.base}/progetto/${pid}/piano`, { method: 'POST', headers: H, body: JSON.stringify({ piano: { contenuti: [quattro] }, mese: '2026-12', stile }) })).json()).contenuti[0].pezzi_usati.length;
  assert.deepEqual([await conta('sdg'), await conta('virale')], [3, 4]);
  // /monta: l'identità di Scatti di G dal Config (accento blu) e la LUT arrivano al montaggio
  const conChiusura = { ...ctl.contenuti[0], regia: { ...ctl.contenuti[0].regia, chiusura: 'Prenota' } };
  const mt = await chiama(s.base, `/progetto/${pid}/monta`, { dati: { contenuto: conChiusura, marchio: { colori: { primario: '#222222' }, font: 'Inter' }, marchio_valido: false, stile: 'sdg', identita: { accento: '#3FA7D6' }, lut: 'inverti-prova' }, file: {} });
  assert.equal(mt.stato, 200, JSON.stringify(mt.json));
  assert.deepEqual(mt.json.file.map((f) => f.tipo), ['video', 'copertina', 'fotogrammi']);
  assert.ok(mt.json.avvisi.some((a) => a.codice === 'musica_mancante'), 'senza file musicale lo dice');
  const pv = path.join(TMP, 'mb-montatore.mp4');
  fs.writeFileSync(pv, (await scarica(mt.json.file[0].url)).buf);
  const sv = sondaFile(pv).streams.find((x) => x.codec_type === 'video');
  assert.deepEqual([sv.width, sv.height, sv.avg_frame_rate, pacchetti(pv)], [1080, 1920, '25/1', 225]);
  // alla fine: il filo della chiusura è blu (l'accento dell'identità), e la clip bianca è diventata nera (la LUT)
  const fgf = path.join(TMP, 'mb-montatore-fine.png');
  ffmpeg(['-ss', '8.5', '-i', pv, '-frames:v', '1', '-y', fgf]);
  const { data: df, info: inf } = await sharp(fgf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let blu = 0;
  for (let y = 1100; y < 1320; y++) for (let x = 400; x < 680; x++) { const i = (y * inf.width + x) * 3; if (Math.abs(df[i] - 0x3f) < 40 && Math.abs(df[i + 1] - 0xa7) < 40 && df[i + 2] > 170) blu++; }
  assert.ok(blu > 200, `il filo della chiusura non è blu: ${blu} pixel`);
  const fgm = path.join(TMP, 'mb-montatore-lut.png');
  ffmpeg(['-ss', '7', '-i', pv, '-frames:v', '1', '-y', fgm]);
  const { data: dm, info: inm } = await sharp(fgm).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.ok(dm[(900 * inm.width + 540) * 3] < 60, `la clip bianca dovrebbe essere nera con la LUT: ${dm[(900 * inm.width + 540) * 3]}`);
});
