// Prove della regia (1.3.0, stile moodboard 1.4.0): sceneggiatura, regole contro i «bolli» (tagli fra le parole, salti coperti, niente lampi,
// volti in sincrono, voce sempre coperta), testi ASS dello stile SDG, render vero di un video da sceneggiatura.
// Materiale SINTETICO: toni al posto della voce (il whisper finto «sente» le frasi sui tratti con suono).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { avviaServer, chiama, scarica, creaClip, creaImmagine, creaLogo, sondaFile, ffmpeg, loudnessIntegrata, MATERIALE, TMP, RADICE, CHIAVE } from './aiuti.js';
import { leggiSceneggiatura, leggiIntervallo, leggiTempo } from '../src/sceneggiatura.js';
import { controllaRegia, agganciaAlleParole, riempiConCoperture, paroleDi, senzaPezziCorti, REGOLE, regoleDelloStile } from '../src/regia.js';
import { creaAssRegia, gruppiDiParole, coloreAss, leggiDifetti, grafoInquadratura, stileDa, famiglieAss, filtroColore, STILI, FORMATI } from '../src/regia-render.js';
import { nomeFamigliaLibass, caricaFont } from '../src/font.js';
import { leggiConfig } from '../src/config.js';
import { paroleConTempi } from '../src/trascrizione.js';

// ---------------------------------------------------------------- sceneggiatura
test('sceneggiatura: blocchi, chi parla, tempi facoltativi, coperture, impostazioni, note', () => {
  const s = leggiSceneggiatura(`# Il pane dei Rossi
FORMATO: 9:16
DURATA: 45 s
MUSICA: musica.mp3
// tono caldo

VOCE: voce.wav
Da trent'anni la famiglia Rossi impasta il pane.
COPERTURA: mani nell'impasto, il forno acceso

INTERVISTA: Mario Rossi, fornaio
«Ho cominciato a quattordici anni.»
[00:12-00:31]
INTERVISTA Giulia (figlia): intervista2.mov
Adesso facciamo il lievito madre.
SCRITTA: Dal 1994
IMMAGINI 5s: il negozio; la fila
VOCE: Oggi lo trovate anche a casa.
CHIUSURA: Ordina su MyCity
Ore 7:30 apertura`);
  assert.equal(s.titolo, 'Il pane dei Rossi');
  assert.deepEqual([s.formato, s.durata_max], ['verticale', 45]);
  assert.deepEqual(s.musica, { usa: true, file: 'musica.mp3' });
  assert.equal(s.chiusura, 'Ordina su MyCity');
  assert.deepEqual(s.note, ['tono caldo', 'Ore 7:30 apertura'], 'il testo dopo CHIUSURA non finisce nella voce di prima');
  assert.deepEqual(s.blocchi.map((b) => b.tipo), ['voce', 'intervista', 'intervista', 'scritta', 'immagini', 'voce']);
  assert.equal(s.blocchi[0].file, 'voce.wav');
  assert.deepEqual(s.blocchi[0].coperture, ["mani nell'impasto", 'il forno acceso']);
  assert.deepEqual([s.blocchi[1].chi, s.blocchi[1].ruolo, s.blocchi[1].testo], ['Mario Rossi', 'fornaio', 'Ho cominciato a quattordici anni.']);
  assert.deepEqual(s.blocchi[1].tempi, { inizio: 12, fine: 31 });
  assert.deepEqual([s.blocchi[2].chi, s.blocchi[2].ruolo, s.blocchi[2].file], ['Giulia', 'figlia', 'intervista2.mov']);
  assert.deepEqual([s.blocchi[4].durata, s.blocchi[4].coperture], [5, ['il negozio', 'la fila']]);
  assert.equal(s.blocchi[5].testo, 'Oggi lo trovate anche a casa.');
  assert.deepEqual(s.avvisi, []);
  // tempi
  assert.deepEqual(leggiIntervallo('da 1:02,5 a 1:10'), { inizio: 62.5, fine: 70 });
  assert.deepEqual(leggiIntervallo('[12-31]'), { inizio: 12, fine: 31 });
  assert.equal(leggiIntervallo('Ore 7:30 apertura'), null);
  assert.equal(leggiTempo('00:01:05'), 65);
  assert.equal(leggiTempo('1:75'), null);
  // vuota: avviso, la regia fa da sola
  assert.equal(leggiSceneggiatura('solo un appunto').blocchi.length, 0);
  assert.equal(leggiSceneggiatura('').avvisi.length, 1);
  // formato sconosciuto
  assert.match(leggiSceneggiatura('FORMATO: cinemascope\nVOCE: ciao').avvisi[0].messaggio, /cinemascope/);
  // parole chiave lunghe e scritte in altri modi; una parola sconosciuta in maiuscolo dà un avviso
  const altre = leggiSceneggiatura('INTERVISTA: Mario, fornaio\nCiao.\nVOCE FUORI CAMPO: voce.wav\nTesto.\nV.O.: Altra voce.\nIntervista (Giulia Rossi): Lievito madre.\nINTRVISTA: Luca');
  assert.deepEqual(altre.blocchi.map((b) => [b.tipo, b.chi || b.file || '', b.testo]), [['intervista', 'Mario', 'Ciao.'], ['voce', 'voce.wav', 'Testo.'], ['voce', '', 'Altra voce.'], ['intervista', 'Giulia Rossi', 'Lievito madre. INTRVISTA: Luca']]);
  assert.match(altre.avvisi[0].messaggio, /«INTRVISTA:» non è una parola che conosco/);
  // parole comuni nel testo normale non aprono blocchi («Parla del lievito:», «Montaggio:», «Finale:»)
  const comuni = leggiSceneggiatura('VOCE: voce.wav\nParla del lievito: «lo rinfresca ogni giorno».\nMontaggio: veloce, sul ritmo.\nFinale: sorpresa.');
  assert.equal(comuni.blocchi.length, 1);
  assert.equal(comuni.blocchi[0].testo, 'Parla del lievito: «lo rinfresca ogni giorno». Montaggio: veloce, sul ritmo. Finale: sorpresa.');
});

test('paroleConTempi: ogni parola finisce dove comincia la dopo, l\'ultima col segmento', () => {
  const p = paroleConTempi({ inizio: 1, fine: 3, parole: [{ testo: ' Ciao', t: 1.1 }, { testo: ' a', t: 1.6 }, { testo: ' tutti.', t: 2.0 }] });
  assert.deepEqual(p, [{ testo: 'Ciao', inizio: 1.1, fine: 1.6 }, { testo: 'a', inizio: 1.6, fine: 2 }, { testo: 'tutti.', inizio: 2, fine: 3 }]);
  assert.equal(paroleConTempi({ inizio: 0, fine: 1, parole: [{ testo: 'x', t: null }] }), null);
  // un tempo fuori dal segmento si stringe dentro
  assert.deepEqual(paroleConTempi({ inizio: 1, fine: 2, parole: [{ testo: 'a', t: 0.5 }, { testo: 'b', t: 2.5 }] }).map((x) => [x.inizio, x.fine]), [[1, 2], [2, 2]]);
});

// ---------------------------------------------------------------- regole della regia
const conParole = (frasi) => frasi.map(([i, f, t]) => {
  const pp = t.split(' ');
  const d = (f - i) / pp.length;
  return { inizio: i, fine: f, testo: t, parole: pp.map((p, k) => ({ testo: p, inizio: +(i + k * d).toFixed(3), fine: +(i + (k + 1) * d).toFixed(3) })) };
});
const PROGETTO = { materiali: [
  { codice: 'A01', tipo: 'audio', durata: 12, parlato: conParole([[0.5, 4.5, "Da trent'anni la famiglia Rossi impasta"], [5.2, 9.8, 'alle quattro di mattina ogni giorno']]) },
  { codice: 'V01', tipo: 'video', durata: 40, audio: true, orientamento: 'orizzontale', parlato: conParole([[1, 5, 'Ho cominciato a quattordici anni'], [6, 9, 'ehm cioè diciamo'], [10, 15, 'con mio padre nel vecchio forno'], [20, 26, 'e il segreto è il tempo']]), scene: [{ codice: 'V01.1', inizio: 0, fine: 40, nitidezza: 80, luminosita: 120, movimento: 3 }] },
  { codice: 'V02', tipo: 'video', durata: 20, audio: true, scene: [0, 1, 2, 3].map((k) => ({ codice: `V02.${k + 1}`, inizio: k * 5, fine: k * 5 + 5, nitidezza: 80, luminosita: 120, movimento: 5 })) },
  { codice: 'V03', tipo: 'video', durata: 9, audio: false, scene: [{ codice: 'V03.1', inizio: 0, fine: 4.5, nitidezza: 70, luminosita: 110, movimento: 2 }, { codice: 'V03.2', inizio: 4.5, fine: 9, nitidezza: 2, luminosita: 30, movimento: 2 }] },
  { codice: 'V04', tipo: 'video', durata: 10, audio: false, scene: [{ codice: 'V04.1', inizio: 0, fine: 10, nitidezza: 70, luminosita: 110, movimento: 2 }] },
  { codice: 'F01', tipo: 'foto', nitidezza: 300, luminosita: 120 },
  { codice: 'V05', tipo: 'video', durata: 20, audio: true, orientamento: 'verticale', parlato: conParole([[1, 6, 'Adesso facciamo anche il lievito madre'], [7, 12, 'e la gente torna ogni mattina']]), scene: [{ codice: 'V05.1', inizio: 0, fine: 20, nitidezza: 80, luminosita: 120, movimento: 3 }] },
  { codice: 'V06', tipo: 'video', durata: 1.5, audio: false, scene: [{ codice: 'V06.1', inizio: 0, fine: 1.5, nitidezza: 80, luminosita: 120, movimento: 3 }] },
  { codice: 'V07', tipo: 'video', durata: 2, audio: false, scene: [{ codice: 'V07.1', inizio: 0, fine: 2, nitidezza: 80, luminosita: 120, movimento: 3 }] },
] };
const PIANO = {
  titolo: 'Il pane dei Rossi',
  battute: [
    { fonte: 'A01', inizio: 0.3, fine: 10.1, coperture: [{ scena: 'V02.1' }, { scena: 'V02.2' }, 'F01'] },
    { fonte: 'V01', inizio: 0.9, fine: 5.05, nome: 'Mario Rossi', ruolo: 'fornaio' },
    { fonte: 'V01', inizio: 10.2, fine: 15.1, coperture: [{ scena: 'V03.1' }] },
    { fonte: 'V01', inizio: 19.8, fine: 26.3 },
    { immagini: 4, coperture: ['V02.4', 'V03.2'] },
  ],
  coperture_riserva: ['V02.3'],
  scritte: [{ testo: 'Dal 1994', battuta: 2 }],
  chiusura: 'Ordina su MyCity',
  musica: true,
};

function controllaInvarianti(tl, R = REGOLE) {
  // inquadrature senza buchi né sovrapposizioni, da 0 alla fine
  let t = 0;
  for (const q of tl.video) {
    assert.ok(Math.abs(q.da - t) < 0.002, `buco o sovrapposizione a ${t}: ${JSON.stringify(q)}`);
    assert.ok(q.a > q.da, JSON.stringify(q));
    t = q.a;
  }
  assert.ok(Math.abs(t - tl.durata) < 0.002, `il video finisce a ${t}, la timeline a ${tl.durata}`);
  // audio di seguito, stessa durata
  let ta = 0;
  for (const a of tl.audio) {
    assert.ok(Math.abs(a.da - ta) < 0.002);
    ta = a.a;
  }
  assert.ok(Math.abs(ta - tl.durata) < 0.002);
  // ogni volto è in sincrono con la sua voce: ogni pezzo di voce sotto il volto è dello stesso file, con lo stesso scarto
  for (const q of tl.video.filter((x) => x.tipo === 'volto')) {
    const sotto = tl.audio.filter((x) => x.da < q.a - 0.002 && x.a > q.da + 0.002);
    assert.ok(sotto.length, `volto senza la sua voce: ${JSON.stringify(q)}`);
    for (const a of sotto) {
      assert.equal(a.fonte, q.fonte, `sotto il volto c'è un'altra voce: ${JSON.stringify(q)}`);
      assert.ok(Math.abs((q.inizio - a.inizio) - (q.da - a.da)) < 0.002, `volto fuori sincrono: ${JSON.stringify(q)}`);
    }
  }
  // la voce fuori campo e le parti senza voce non mostrano mai un volto
  for (const a of tl.audio.filter((x) => !x.fonte || PROGETTO.materiali.find((m) => m.codice === x.fonte)?.tipo === 'audio')) {
    assert.ok(!tl.video.some((q) => q.tipo === 'volto' && q.da < a.a - 1e-6 && q.a > a.da + 1e-6), 'un volto sopra la voce fuori campo');
  }
  // niente lampi
  for (const q of tl.video) assert.ok(q.a - q.da >= R.minima - 1e-3, `lampo: ${JSON.stringify(q)}`);
}

test('controllaRegia: tagli fra le parole, salto coperto, niente lampi, volti in sincrono, voce coperta', () => {
  const tl = controllaRegia(PIANO, PROGETTO);
  assert.equal(tl.bloccante, false, JSON.stringify(tl.problemi));
  controllaInvarianti(tl);
  // 10.2 cade dentro «con» (10,0-10,71): il pezzo comincia prima della parola, non a metà; «ehm cioè diciamo» resta fuori
  assert.deepEqual(tl.audio.map((a) => [a.fonte, a.inizio, a.fine]), [['A01', 0.42, 9.95], ['V01', 0.92, 5.15], ['V01', 9.92, 15.15], ['V01', 19.92, 26.15], [null, 0, 4]]);
  assert.equal(tl.conti.tagli_coperti, 1);
  assert.equal(tl.conti.tagli_scoperti, 0);
  // il salto fra la battuta 2 e la 3 (V01 5,15 → 9,92) è sotto una copertura (V02.3 dalla riserva)
  const T = tl.audio[2].da;
  const sopra = tl.video.find((q) => q.da < T && q.a > T);
  assert.equal(sopra.tipo, 'copertura');
  assert.equal(sopra.etichetta, 'V02.3');
  // la prima volta che parla Mario: almeno 2 s di volto, col cartello del nome
  const primoVolto = tl.video.find((q) => q.tipo === 'volto');
  assert.ok(primoVolto.a - primoVolto.da >= REGOLE.voltoPrima);
  assert.deepEqual(tl.cartelli.map((k) => [k.testo, k.sotto]), [['Mario Rossi', 'fornaio']]);
  // un volto stretto fra due coperture sotto 1 s non c'è
  tl.video.forEach((q, i) => {
    if (q.tipo === 'volto' && tl.video[i - 1]?.tipo !== 'volto' && tl.video[i + 1] && tl.video[i + 1].tipo !== 'volto') assert.ok(q.a - q.da >= REGOLE.voltoMin - 1e-3);
  });
  // sottotitoli: le parole dell'audio usato, sulla timeline; niente «ehm»
  assert.ok(tl.parole.length > 20);
  assert.ok(!tl.parole.some((p) => p.testo === 'ehm'));
  assert.deepEqual(tl.scritte.map((x) => x.tipo), ['titolo', 'scritta', 'chiusura']);
  assert.ok(tl.problemi.some((p) => p.codice === 'difetto' && /V03\.2/.test(p.messaggio)), 'la copertura sfocata e buia si segnala');
});

test('controllaRegia: fonti e coperture inesistenti, audio senza coperture, durata massima, battuta troppo corta', () => {
  const tl = controllaRegia({ battute: [
    { fonte: 'A09', inizio: 0, fine: 3 },
    { fonte: 'V03', inizio: 0, fine: 3 },
    { fonte: 'A01', inizio: 0.4, fine: 4.6, coperture: ['V77.1', 'V04.1'] },
    { fonte: 'A01', inizio: 5, fine: 5.1 },
    { fonte: 'A01', inizio: 5.1, fine: 9.9 },
  ], coperture_riserva: ['V02.1'] }, PROGETTO, { sceneggiatura: { durata_max: 6 } });
  const cod = (c) => tl.problemi.filter((p) => p.codice === c).map((p) => p.n);
  assert.deepEqual(cod('fonte_inesistente'), [1]);
  assert.deepEqual(cod('fonte_senza_audio'), [2]);
  assert.deepEqual(cod('copertura_inesistente'), [3]);
  assert.deepEqual(cod('battuta_troppo_corta'), [4]);
  assert.deepEqual(cod('oltre_durata'), [5], 'oltre 6 s: tolta l\'ultima battuta intera');
  assert.equal(tl.bloccante, true);
  controllaInvarianti(tl);
  assert.ok(tl.video.every((q) => q.tipo !== 'volto'), 'sopra la voce fuori campo solo coperture');
  // senza nessuna battuta valida
  const vuota = controllaRegia({ battute: [{ fonte: 'X' }] }, PROGETTO);
  assert.equal(vuota.video.length, 0);
  assert.equal(vuota.bloccante, true);
});

test('controllaRegia: salto senza coperture disponibili → avviso «taglio_scoperto»; tempi stimati senza whisper allineato', () => {
  const P2 = JSON.parse(JSON.stringify(PROGETTO));
  for (const f of P2.materiali.find((m) => m.codice === 'V01').parlato) delete f.parole;
  const tl = controllaRegia({ battute: [{ fonte: 'V01', inizio: 1, fine: 5 }, { fonte: 'V01', inizio: 10, fine: 15 }] }, P2);
  assert.equal(tl.conti.tagli_scoperti, 1);
  assert.ok(tl.problemi.some((p) => p.codice === 'taglio_scoperto'));
  assert.ok(tl.problemi.some((p) => p.codice === 'tempi_stimati'));
  controllaInvarianti(tl);
});

test('agganciaAlleParole e riempiConCoperture', () => {
  const pp = paroleDi(PROGETTO.materiali[1]);
  // dentro «con» (10-10,71) → si prende la parola intera, col margine che non entra in «diciamo» (fine 9)
  assert.deepEqual(agganciaAlleParole(pp, 10.3, 14.8, 40), { inizio: 9.92, fine: 15.15, agganciato: true, prima: 'con', ultima: 'forno', stimato: false });
  assert.equal(agganciaAlleParole(pp, 16, 19, 40).agganciato, false, 'nel silenzio non c\'è niente da agganciare');
  const c = (ci, cf, max = 20) => ({ fonte: 'V02', tipo: 'copertura', ci, cf, max, etichetta: 'x' });
  // 6 s con tre coperture da 5 s: 2 s l'una
  assert.deepEqual(riempiConCoperture([c(0, 5), c(5, 10), c(10, 15)], 6).pezzi.map((p) => +p.durata.toFixed(2)), [2, 2, 2]);
  // 10 s con una copertura da 3 s: si allunga dentro la clip fino a 10
  const lunga = riempiConCoperture([c(0, 3, 12)], 10);
  assert.deepEqual([+lunga.pezzi[0].durata.toFixed(2), lunga.manca], [10, 0]);
  // 10 s con una copertura in una clip da 4 s: ne mancano 6
  assert.equal(riempiConCoperture([c(0, 3, 4)], 10).manca, 6);
  // 2 s con cinque coperture: se ne tengono due da 1 s (niente lampi)
  assert.deepEqual(riempiConCoperture([c(0, 5), c(5, 10), c(10, 15), c(15, 20), c(0, 2)], 2).pezzi.map((p) => +p.durata.toFixed(2)), [1, 1]);
});

test('controllaRegia: coperture molto più corte della voce → si ripetono dentro le clip, mai oltre; il volto dopo resta in sincrono', () => {
  // il caso del collaudo: 9,5 s di voce con due clip da 1,5 e 2 s, poi 32 s di intervista
  const tl = controllaRegia({ battute: [{ fonte: 'A01', inizio: 0.4, fine: 9.9, coperture: ['V06.1', 'V07.1'] }, { fonte: 'V01', inizio: 1, fine: 33 }] }, PROGETTO);
  assert.equal(tl.bloccante, false, JSON.stringify(tl.problemi));
  controllaInvarianti(tl);
  for (const q of tl.video.filter((x) => x.tipo === 'copertura')) {
    const m = PROGETTO.materiali.find((x) => x.codice === q.fonte);
    assert.ok(q.fine <= m.durata + 1e-6, `${q.etichetta} oltre la fine della clip: ${q.fine} > ${m.durata}`);
    assert.ok(Math.abs((q.fine - q.inizio) - (q.a - q.da)) < 0.002, 'pezzo lungo quanto il suo posto');
  }
  assert.ok(tl.problemi.some((p) => p.codice === 'coperture_corte'));
});

test('controllaRegia: voce senza coperture valide e senza riserva → bloccata, mai il volto di prima sopra un\'altra voce', () => {
  const tl = controllaRegia({ battute: [{ fonte: 'V01', inizio: 1, fine: 5 }, { fonte: 'A01', inizio: 0.4, fine: 4.6, coperture: ['V09.2'] }, { fonte: 'V05', inizio: 6, fine: 12 }] }, PROGETTO);
  assert.ok(tl.problemi.some((p) => p.codice === 'voce_scoperta' && p.n === 2 && p.gravita === 'blocca'));
  controllaInvarianti(tl);
  assert.deepEqual(tl.audio.map((a) => a.fonte), ['V01', 'V05']);
  // prima battuta senza coperture: niente buco iniziale
  const t2 = controllaRegia({ battute: [{ fonte: 'A01', inizio: 0.4, fine: 4.6 }, { fonte: 'V05', inizio: 1, fine: 6 }] }, PROGETTO);
  controllaInvarianti(t2);
  assert.equal(t2.video[0].da, 0);
});

test('controllaRegia: volto che torna dopo coperture corte, volto dopo un salto coperto, due persone che si alternano: sempre in sincrono', () => {
  const tl = controllaRegia({ battute: [
    { fonte: 'V01', inizio: 1, fine: 5, nome: 'Mario Rossi' },
    { fonte: 'V05', inizio: 1, fine: 6.1, nome: 'Giulia', coperture: ['V06.1'] },
    { fonte: 'V01', inizio: 10, fine: 15 },
    { fonte: 'V01', inizio: 20, fine: 26, coperture: ['V07.1'] },
  ], coperture_riserva: ['V04.1'] }, PROGETTO);
  assert.equal(tl.bloccante, false, JSON.stringify(tl.problemi));
  controllaInvarianti(tl);
  // Giulia: volto, copertura da 1,5 s, poi di nuovo volto in sincrono
  const giulia = tl.video.filter((q) => q.fonte === 'V05');
  assert.ok(giulia.length >= 2, JSON.stringify(tl.video));
  assert.deepEqual(tl.cartelli.map((k) => k.testo), ['Mario Rossi', 'Giulia']);
  // il salto fra la battuta 3 e la 4 (V01 15 → 20) è coperto e dopo c'è ancora il volto
  assert.equal(tl.conti.tagli_coperti, 1);
  const T = tl.audio[3].da;
  assert.ok(tl.video.some((q) => q.tipo === 'volto' && q.fonte === 'V01' && q.da > T + 0.1), 'dopo il salto si torna sul volto');
});

test('controllaRegia: la stessa frase in due battute si segnala; scritte mai una sopra l\'altra; testi lunghi accorciati', () => {
  const tl = controllaRegia({ titolo: 'Il pane dei Rossi', battute: [
    { fonte: 'V01', inizio: 1, fine: 15, scritta: 'Dal 1994' },
    { fonte: 'V01', inizio: 10, fine: 26 },
  ], scritte: [{ testo: 'Dal 1994 nel cuore di Piacenza, con il forno a legna di una volta', battuta: 1 }], coperture_riserva: ['V04.1'] }, PROGETTO);
  assert.ok(tl.problemi.some((p) => p.codice === 'parole_ripetute'));
  const sc = tl.scritte.filter((x) => x.tipo !== 'chiusura');
  for (let i = 1; i < sc.length; i++) assert.ok(sc[i].da >= sc[i - 1].a - 1e-6, `scritte sovrapposte: ${JSON.stringify(sc)}`);
  assert.ok(sc.every((x) => x.testo.length <= 48));
  assert.ok(tl.problemi.some((p) => p.codice === 'testo_lungo'));
});

test('testi ASS: parole del sottotitolo nell\'ordine giusto, cartello in alto anche in quadrato, scritte che vanno a capo', () => {
  const tl = { durata: 4, parole: [{ testo: 'Da', da: 0, a: 0.4, battuta: 1 }, { testo: "trent'anni", da: 0.4, a: 1, battuta: 1 }, { testo: 'pane', da: 1, a: 1.5, battuta: 1 }], cartelli: [{ testo: 'Mario', sotto: 'fornaio', da: 0.3, a: 3 }], scritte: [{ tipo: 'scritta', testo: 'Dal 1994 nel cuore di Piacenza', da: 1, a: 3 }] };
  const ass = creaAssRegia(tl, stileDa('virale'), FORMATI.quadrato, { titoli: 'Bricolage Grotesque ExtraBold', testo: 'Inter' });
  const eventi = ass.split('\n').filter((r) => r.startsWith('Dialogue: 0,'));
  assert.equal(eventi.length, 3);
  // seconda parola detta: «DA» normale, «TRENT'ANNI» in lime, «PANE» normale, in quest'ordine
  assert.match(eventi[1], /,,\{\\fscx100\\fscy100\}DA \{\\c&H003AFFD2\\fscx108\\fscy108\}TRENT'ANNI\{\\fscx100\\fscy100\\c&H00EAF0F3\} PANE$/);
  assert.match(ass, /,Nome,,0,0,0,,\{\\an7\\pos\(96,60\)/, 'in quadrato il cartello sta in alto, lontano dai sottotitoli');
  assert.match(ass, /,Scritta,,0,0,0,,\{\\an5\\q0\\pos\(540,475\)/, 'la scritta va a capo da sola (\\q0) e sta al centro');
});

test('famiglieAss: il render usa il nome libass dei font inclusi (Bricolage Grotesque ExtraBold, Inter)', async () => {
  const cfg = { ...leggiConfig({}), fontRete: false };
  const f = famiglieAss(await caricaFont('Bricolage Grotesque', cfg, 800), await caricaFont('Inter', cfg));
  assert.deepEqual(f, { titoli: 'Bricolage Grotesque ExtraBold', testo: 'Inter' });
});

// Generatore pseudo-casuale con seme (le prove danno sempre lo stesso risultato).
function casuale(seme) {
  let x = seme >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pianiCasuali(seme, N, R = REGOLE, fps = 30, lunghe = false) {
  const rnd = casuale(seme);
  const r2 = (n) => Math.round(n * 100) / 100;
  const conteggi = { piani: 0, sotto: 0, zero: 0, conti: 0, incoerenti: 0, evitabili: 0 };
  for (let it = 0; it < N; it++) {
    // clip da telefono da 1,5 a 8 s (durate a 2 decimali come le scrive l'analisi), una voce, un'intervista, un'altra voce
    const clip = Array.from({ length: 6 }, (_, k) => { const d = r2(lunghe ? 4 + rnd() * 12 : 1.5 + rnd() * 6.5); return { codice: `V${10 + k}`, tipo: 'video', durata: d, audio: false, scene: [{ codice: `V${10 + k}.1`, inizio: 0, fine: d, nitidezza: 80, luminosita: 120, movimento: 3 }] }; });
    const audio = (codice, L, tipo = 'audio') => {
      const n = Math.max(3, Math.round(L * 2.5));
      return { codice, tipo, durata: 60, audio: true, orientamento: 'verticale', scene: [{ codice: `${codice}.1`, inizio: 0, fine: 60, nitidezza: 80, luminosita: 120, movimento: 3 }], parlato: [{ inizio: 1, fine: 1 + L, testo: 'x', parole: Array.from({ length: n }, (_, k) => ({ testo: `p${k}`, inizio: +(1 + (k * L) / n).toFixed(3), fine: +(1 + ((k + 0.85) * L) / n).toFixed(3) })) }] };
    };
    const L1 = 2 + rnd() * 12;
    const L2 = 3 + rnd() * 16;
    const L3 = 2 + rnd() * 10;
    const progetto = { materiali: [audio('A01', L1), audio('V01', L2, 'video'), audio('A02', L3), ...clip] };
    const scegli = (n) => Array.from({ length: n }, () => `V${10 + Math.floor(rnd() * 6)}.1`).filter((c, i, a) => a.indexOf(c) === i);
    const piano = { battute: [
      { fonte: 'A01', inizio: 1, fine: 1 + L1, coperture: scegli(1 + Math.floor(rnd() * 3)) },
      { fonte: 'V01', inizio: 1, fine: 1 + L2, nome: 'Mario', coperture: rnd() < 0.5 ? scegli(1 + Math.floor(rnd() * 2)) : [] },
      { fonte: 'A02', inizio: 1, fine: 1 + L3, coperture: scegli(1 + Math.floor(rnd() * 3)) },
    ], ...(rnd() < 0.5 ? { coperture_riserva: scegli(2) } : {}) };
    const tl = controllaRegia(piano, progetto, { R });
    conteggi.piani++;
    if (tl.problemi.some((p) => p.codice === 'timeline_incoerente')) conteggi.incoerenti++;
    let fotogrammi = 0;
    for (const q of tl.video) {
      const f = Math.round(q.a * fps) - Math.round(q.da * fps);
      if (q.a - q.da < R.minima - 1e-3) conteggi.sotto++;
      if (f <= 0) conteggi.zero++;
      fotogrammi += Math.max(0, f);
    }
    if (fotogrammi !== Math.round(tl.durata * fps)) conteggi.conti++;
    // stessa scena due volte di fila, ricominciata da capo, quando la battuta (con la riserva) aveva un'alternativa
    for (let i = 1; i < tl.video.length; i++) {
      const a = tl.video[i - 1];
      const b = tl.video[i];
      if (a.tipo !== 'copertura' || b.etichetta !== a.etichetta || Math.abs(a.fine - b.inizio) < 0.01) continue;
      const k = tl.audio.findIndex((x) => b.da >= x.da - 1e-6 && b.da < x.a);
      const battuta = piano.battute[k];
      const scelte = new Set([...(battuta?.coperture || []), ...(piano.coperture_riserva || [])]);
      // evitabile = c'era un'altra scena E il materiale bastava senza ripetere; con materiale corto la ripetizione è
      // obbligata, e allora deve esserci l'avviso «coperture_corte»
      const materiale = [...scelte].reduce((t, c) => t + (progetto.materiali.find((m) => `${m.codice}.1` === c)?.durata || 0), 0);
      const bastava = materiale >= (tl.audio[k]?.a - tl.audio[k]?.da) - 1e-6;
      if (scelte.size >= 2 && bastava) conteggi.evitabili++;
      if (!bastava && !tl.problemi.some((p) => p.codice === 'coperture_corte' || p.codice === 'ripetizione')) conteggi.senzaAvviso = (conteggi.senzaAvviso || 0) + 1;
    }
  }
  return conteggi;
}

test('regia su 3000 piani casuali di lavoro normale: niente lampi, niente pezzi da 0 fotogrammi, fotogrammi esatti, niente stessa scena di fila evitabile', () => {
  assert.deepEqual(pianiCasuali(20261124, 3000), { piani: 3000, sotto: 0, zero: 0, conti: 0, incoerenti: 0, evitabili: 0 });
});

test('ritmo di Scatti di G (moodboard) su 3000 piani casuali a 25 fotogrammi: stesse garanzie, inquadrature mai sotto 1 secondo', () => {
  const R = regoleDelloStile(STILI.sdg);
  assert.equal(R.minima, 1);
  assert.equal(R.coperturaMin, 2.5);
  // girato da telefono (clip corte) e girato da camera (clip lunghe)
  assert.deepEqual(pianiCasuali(20261125, 3000, R, 25), { piani: 3000, sotto: 0, zero: 0, conti: 0, incoerenti: 0, evitabili: 0 });
  assert.deepEqual(pianiCasuali(20261126, 3000, R, 25, true), { piani: 3000, sotto: 0, zero: 0, conti: 0, incoerenti: 0, evitabili: 0 });
});

test('ritmo di Scatti di G: con clip lunghe le inquadrature durano 2,5-6 secondi, più lente dello stile virale', () => {
  const R = regoleDelloStile(STILI.sdg);
  const progetto = { materiali: [
    { codice: 'A01', tipo: 'audio', durata: 30, audio: true, scene: [{ codice: 'A01.1', inizio: 0, fine: 30 }], parlato: [{ inizio: 0.5, fine: 20.5, testo: 'x', parole: Array.from({ length: 50 }, (_, k) => ({ testo: `p${k}`, inizio: 0.5 + k * 0.4, fine: 0.5 + k * 0.4 + 0.34 })) }] },
    ...[1, 2, 3, 4, 5, 6].map((k) => ({ codice: `V0${k}`, tipo: 'video', durata: 12, audio: false, scene: [{ codice: `V0${k}.1`, inizio: 0, fine: 12, nitidezza: 80, luminosita: 120, movimento: 3 }] })),
  ] };
  const piano = { battute: [{ fonte: 'A01', inizio: 0.5, fine: 20.5, coperture: ['V01.1', 'V02.1', 'V03.1', 'V04.1', 'V05.1', 'V06.1'] }] };
  const lento = controllaRegia(piano, progetto, { R });
  const veloce = controllaRegia(piano, progetto);
  assert.equal(lento.bloccante, false, JSON.stringify(lento.problemi));
  controllaInvarianti(lento, R);
  for (const q of lento.video) assert.ok(q.a - q.da >= 2.5 - 1e-3 && q.a - q.da <= 6 + 1e-3, `inquadratura fuori ritmo: ${JSON.stringify(q)}`);
  assert.ok(lento.video.length < veloce.video.length || lento.video.length <= 6, `${lento.video.length} tagli lenti contro ${veloce.video.length} veloci`);
});

test('regoleDelloStile e stileDa: solo numeri buoni; dal marchio arrivano accento e font dei titoli, il resto resta di Scatti di G', () => {
  const R = regoleDelloStile({ ritmo: { minima: 0.1, coperturaMin: 'tanto', coperturaMax: 0.5, voltoPrima: -3, nonEsiste: 9 } });
  assert.equal(R.minima, 0.4, 'minima mai sotto 0,4 s');
  assert.equal(R.coperturaMin, REGOLE.coperturaMin, 'un valore non numerico si ignora');
  assert.equal(R.coperturaMax, R.coperturaMin, 'il massimo mai sotto il minimo');
  assert.equal(R.voltoPrima, REGOLE.voltoPrima);
  assert.equal(R.nonEsiste, undefined);
  assert.deepEqual(regoleDelloStile(STILI.virale), REGOLE, 'lo stile virale ha le regole di prima');
  const sdg = stileDa('sdg');
  assert.deepEqual(sdg.colori, { fondo: '#2C2A27', testo: '#F4F1EC', accento: '#E0A95C' });
  assert.deepEqual([sdg.font_titoli, sdg.peso_titoli, sdg.font_testo, sdg.fps, sdg.grana, sdg.sottotitoli.modo, sdg.sottotitoli.maiuscolo], ['Poppins', 600, 'Poppins', 25, 0, 'frase', false]);
  const cliente = stileDa('sdg', { colori: { primario: '#D94F3D', testo: '#000000' }, font: 'Playfair Display', peso_titolo: 700 });
  assert.equal(cliente.colori.accento, '#D94F3D', 'il colore primario del cliente prende il posto dell\'oro');
  assert.equal(stileDa('sdg', { colori: { primario: '#8A1C1C' } }).colori.accento, '#E0A95C', 'un rosso scuro non si vedrebbe sul fondo: resta l\'oro');
  assert.equal(cliente.colori.testo, '#F4F1EC', 'il testo resta avorio');
  assert.deepEqual([cliente.font_titoli, cliente.peso_titoli, cliente.font_testo], ['Playfair Display', 700, 'Poppins']);
  assert.equal(stileDa('sdg', { colori: { accento: 'rosso' } }).colori.accento, '#E0A95C', 'un colore non valido si ignora');
  assert.equal(stileDa('niente').font_titoli, 'Poppins', 'uno stile sconosciuto diventa sdg');
  assert.equal(STILI.sdg.colori.accento, '#E0A95C', 'lo stile base non si sporca');
  // colore: nero morbido senza grana per sdg; contrasto, saturazione e grana per virale
  assert.equal(filtroColore(stileDa('sdg')), "curves=master='0/0.045 0.10/0.115 0.50/0.50 0.90/0.885 1/0.95',eq=contrast=1:saturation=0.96");
  assert.equal(filtroColore(stileDa('virale')), 'eq=contrast=1.06:saturation=1.06,noise=c0s=7:allf=t');
  assert.equal(filtroColore(stileDa('pulito')), 'null');
});

test('testi ASS Scatti di G: frase intera in avorio, niente parola evidenziata, cartello con il filo d\'oro, chiusura con il filo', async () => {
  const tl = controllaRegia(PIANO, PROGETTO, { R: regoleDelloStile(STILI.sdg) });
  const cfg = { ...leggiConfig({}), fontRete: false };
  const fam = famiglieAss(await caricaFont('Poppins', cfg, 600), await caricaFont('Poppins', cfg, 500), 600, 500);
  assert.deepEqual(fam, { titoli: 'Poppins SemiBold', testo: 'Poppins Medium' });
  const ass = creaAssRegia(tl, stileDa('sdg'), FORMATI.verticale, fam);
  assert.match(ass, /^Style: Sotto,Poppins Medium,74,&H00ECF1F4,/m, 'sottotitoli in Poppins, avorio');
  assert.ok(!/\\c&H005CA9E0/.test(ass.split('[Events]')[1].split('\n').filter((r) => r.includes(',Sotto,')).join('\n')), 'nessuna parola cambia colore');
  const sotto = ass.split('\n').filter((r) => r.startsWith('Dialogue: 0,'));
  assert.ok(sotto.length >= 1 && sotto.length < tl.parole.length, 'un evento per frase, non per parola');
  assert.ok(sotto.every((r) => /\\blur3\\fad\(\d+,\d+\)/.test(r)), 'entrano e escono piano, con l\'alone morbido');
  assert.ok(!/TRENT'ANNI/.test(ass), 'niente maiuscolo');
  // le frasi non si sovrappongono e seguono le parole
  const tempo = (t) => { const [h, m, x] = t.split(':'); return +h * 3600 + +m * 60 + +x; };
  const fasce = sotto.map((r) => r.split(',').slice(1, 3).map(tempo));
  for (let i = 1; i < fasce.length; i++) assert.ok(fasce[i][0] >= fasce[i - 1][1] - 0.011, `frasi sovrapposte: ${JSON.stringify(fasce)}`);
  assert.match(ass, /^Style: Filo,.*,&H005CA9E0,/m, 'il filo è nel colore d\'accento (oro)');
  assert.match(ass, /Dialogue: 2,[^,]+,[^,]+,Filo,,0,0,0,,\{\\an7\\pos\(72,326\)\\fad\(240,240\)\\p1\}m 0 0 l 5 0 l 5 138 l 0 138\{\\p0\}/);
  assert.match(ass, /,Nome,,0,0,0,,\{\\an7\\pos\(98,320\)\\blur2\\fad\(240,240\)\}Mario Rossi/);
  assert.match(ass, /,Ruolo,,0,0,0,,\{\\an7\\pos\(98,402\)\\blur2\\fad\(240,240\)\}fornaio/);
  assert.match(ass, /,Chiusura,.*Ordina su MyCity/);
  assert.match(ass, /Dialogue: 1,[^,]+,[^,]+,Filo,,0,0,0,,\{\\an8\\pos\(540,\d+\)\\fad\(320,320\)\\p1\}m 0 0 l 120 0/);
  assert.match(ass, /^Style: Nome,Poppins SemiBold,64,&H00ECF1F4,/m, 'il nome è avorio, non su un riquadro colorato');
  // in orizzontale i sottotitoli restano leggibili (0,8 della dimensione verticale)
  assert.match(creaAssRegia(tl, stileDa('sdg'), FORMATI.orizzontale, fam), /^Style: Sotto,Poppins Medium,59,/m);
  assert.equal(stileDa('sdg').coperture, 'riempi', 'coperture a tutto schermo, niente bande sfocate');
});

test('i due casi esatti del secondo collaudo: avanzo di 1 centesimo e lampo da 1 fotogramma', () => {
  const P = JSON.parse(JSON.stringify(PROGETTO));
  P.materiali.push({ codice: 'V10', tipo: 'video', durata: 4.53, audio: false, scene: [{ codice: 'V10.1', inizio: 0, fine: 4.53, nitidezza: 80, luminosita: 120, movimento: 3 }] });
  P.materiali.push({ codice: 'V08', tipo: 'video', durata: 5, audio: false, scene: [{ codice: 'V08.1', inizio: 0, fine: 5, nitidezza: 80, luminosita: 120, movimento: 3 }] });
  for (const piano of [
    { battute: [{ fonte: 'A01', inizio: 0.4, fine: 9.9, coperture: ['V10.1', 'V08.1'] }, { fonte: 'V01', inizio: 1, fine: 5 }] },
    { battute: [{ fonte: 'A01', inizio: 0.4, fine: 9.9, coperture: ['V03.2', 'V08.1'] }, { fonte: 'V01', inizio: 1, fine: 5 }] },
  ]) {
    const tl = controllaRegia(piano, P);
    assert.equal(tl.bloccante, false, JSON.stringify(tl.problemi));
    for (const q of tl.video) assert.ok(q.a - q.da >= REGOLE.minima - 1e-3, `inquadratura corta: ${JSON.stringify(q)}`);
    const fotogrammi = tl.video.reduce((t, q) => t + Math.round(q.a * 30) - Math.round(q.da * 30), 0);
    assert.equal(fotogrammi, Math.round(tl.durata * 30));
  }
  // senzaPezziCorti: l'avanzo da 0,01 s va al vicino che ha spazio; se nessuno ha spazio, cresce prendendo dal vicino
  const durate = { V10: 4.53, V08: 5 };
  const a = senzaPezziCorti([{ fonte: 'V10', tipo: 'copertura', inizio: 0, fine: 4.53, durata: 4.53 }, { fonte: 'V08', tipo: 'copertura', inizio: 0, fine: 5, durata: 5 }, { fonte: 'V10', tipo: 'copertura', inizio: 0, fine: 0.01, durata: 0.01 }], (c) => durate[c]);
  assert.deepEqual(a.map((p) => [p.fonte, p.inizio, p.fine]), [['V10', 0, 4.53], ['V08', 0, 4.41], ['V10', 0, 0.6]]);
  assert.ok(Math.abs(a.reduce((t, p) => t + p.durata, 0) - 9.54) < 1e-9, 'la durata totale non cambia');
});

test('i casi del terzo collaudo: due battute attaccate della stessa intervista, salto con copertura corta, millesimo scoperto', () => {
  // due battute attaccate dello stesso file, senza coperture: un volto solo, in sincrono, niente falso allarme
  for (const piano of [
    { battute: [{ fonte: 'V01', inizio: 1, fine: 3.4 }, { fonte: 'V01', inizio: 3.4, fine: 5 }] },
    { battute: [{ fonte: 'A01', inizio: 0.4, fine: 4.6, coperture: ['V02.1'] }, { fonte: 'V01', inizio: 1, fine: 3.4 }, { fonte: 'V01', inizio: 3.4, fine: 5, scritta: 'Dal 1994' }] },
  ]) {
    const tl = controllaRegia(piano, PROGETTO);
    assert.equal(tl.bloccante, false, JSON.stringify(tl.problemi));
    controllaInvarianti(tl);
  }
  // battute attaccate a meno di 5 centesimi: diventano esattamente attaccate (niente millesimi di voce ripetuti)
  const vicine = controllaRegia({ battute: [{ fonte: 'V01', inizio: 1, fine: 3.38 }, { fonte: 'V01', inizio: 3.41, fine: 5 }] }, PROGETTO);
  assert.equal(vicine.audio[0].fine, vicine.audio[1].inizio);
  controllaInvarianti(vicine);
  // salto coperto con una copertura più corta della finestra: niente buchi, niente volti sotto la minima ai lati
  const P = JSON.parse(JSON.stringify(PROGETTO));
  P.materiali.push({ codice: 'V09', tipo: 'video', durata: 1.71, audio: false, scene: [{ codice: 'V09.1', inizio: 0, fine: 1.71, nitidezza: 80, luminosita: 120, movimento: 3 }] });
  const salto = controllaRegia({ battute: [{ fonte: 'V01', inizio: 1, fine: 2.2 }, { fonte: 'V01', inizio: 10, fine: 15 }], coperture_riserva: ['V09.1'] }, P);
  assert.equal(salto.bloccante, false, JSON.stringify(salto.problemi));
  controllaInvarianti(salto);
  assert.equal(salto.conti.tagli_coperti, 1);
});

// ---------------------------------------------------------------- testi dello stile
test('testi ASS virale: font del marchio con il nome giusto per libass, parola detta in lime, maiuscolo, cartello, scritte', () => {
  const tl = controllaRegia(PIANO, PROGETTO);
  const stile = stileDa('virale');
  const ass = creaAssRegia(tl, stile, FORMATI.verticale, { titoli: 'Bricolage Grotesque ExtraBold', testo: 'Inter' });
  assert.match(ass, /^Style: Sotto,Bricolage Grotesque ExtraBold,86,&H00EAF0F3/m);
  assert.match(ass, /\\c&H003AFFD2&?.*TRENT'ANNI|\\c&H003AFFD2\\fscx\d+\\fscy\d+\}DA/);
  assert.match(ass, /Dialogue: 2,[^,]+,[^,]+,Nome,,0,0,0,,\{\\an7\\pos\(72,320\)\\fad\(160,160\)\}MARIO ROSSI/);
  assert.match(ass, /,Ruolo,.*FORNAIO/);
  assert.match(ass, /,Scritta,.*IL PANE DEI ROSSI/);
  assert.match(ass, /,Chiusura,.*ORDINA SU MYCITY/);
  // un evento per parola: ogni parola dei sottotitoli è evidenziata una volta
  assert.equal((ass.match(/Dialogue: 0,/g) || []).length, tl.parole.length);
  // nessun sottotitolo dentro i 340 px in basso (MarginV) e niente parentesi graffe dal testo
  assert.match(ass, /,2,60,60,500,1$/m);
  assert.equal(coloreAss('#D2FF3A'), '&H003AFFD2');
  assert.equal(coloreAss('#0B0B0D', 0.2), '&H330D0B0B');
  // gruppi: al massimo 3 parole, nuovo gruppo dopo il punto
  const g = gruppiDiParole([{ testo: 'Uno', da: 0, a: 0.3, battuta: 1 }, { testo: 'due.', da: 0.3, a: 0.6, battuta: 1 }, { testo: 'Tre', da: 0.6, a: 0.9, battuta: 1 }, { testo: 'quattro', da: 0.9, a: 1.2, battuta: 1 }, { testo: 'cinque', da: 1.2, a: 1.5, battuta: 1 }, { testo: 'sei', da: 1.5, a: 1.8, battuta: 1 }]);
  assert.deepEqual(g.map((x) => x.parole.map((p) => p.testo).join(' ')), ['Uno due.', 'Tre quattro cinque', 'sei']);
  // il font incluso: libass lo trova come «Bricolage Grotesque ExtraBold»
  assert.equal(nomeFamigliaLibass(fs.readFileSync(path.join(RADICE, 'font', 'BricolageGrotesque-800.ttf'))), 'Bricolage Grotesque ExtraBold');
});

test('inquadrature: volto ritagliato dove sta il soggetto, coperture orizzontali intere con lo sfondo sfocato', () => {
  const oriz = { larghezza: 1920, altezza: 1080, trasferimento: '' };
  assert.match(grafoInquadratura(oriz, FORMATI.verticale, { modo: 'riempi', posizione: 'sinistra' }), /crop=1080:1920:max\(0\\,min\(iw-ow\\,iw\/3-ow\/2\)\)/);
  assert.match(grafoInquadratura(oriz, FORMATI.verticale, { modo: 'auto' }), /boxblur/);
  assert.match(grafoInquadratura({ larghezza: 1080, altezza: 1920, trasferimento: '' }, FORMATI.verticale, { modo: 'auto' }), /crop=1080:1920/);
  assert.match(grafoInquadratura({ ...oriz, trasferimento: 'arib-std-b67' }, FORMATI.verticale, { modo: 'riempi' }), /tonemap/);
  assert.deepEqual(leggiDifetti('[blackdetect @ 0x1] black_start:3.2 black_end:3.6 black_duration:0.4\n[freezedetect @ 0x2] lavfi.freezedetect.freeze_start: 10.1\n[freezedetect @ 0x2] lavfi.freezedetect.freeze_end: 13.5'), { neri: [{ da: 3.2, a: 3.6 }], fermi: [{ da: 10.1, a: 13.5 }] });
});

// ---------------------------------------------------------------- render vero
function modelloFinto() {
  const p = path.join(MATERIALE, 'modello-finto.bin');
  if (!fs.existsSync(p)) fs.writeFileSync(p, Buffer.alloc(2 * 1024 * 1024, 1));
  return p;
}

let s;
before(async () => {
  s = await avviaServer({ WHISPER_BIN: path.join(RADICE, 'test', 'finto-whisper.mjs'), WHISPER_MODELLO: modelloFinto(), WHISPER_VAD: modelloFinto(), WHISPER_VAD_BIN: path.join(RADICE, 'test', 'finto-vad.mjs'), WHISPER_DTW: 'small', FINTO_WHISPER_MODO: 'energia' });
});
after(async () => s?.ferma());

const H = { 'x-officina-chiave': CHIAVE, 'content-type': 'application/json' };

test('regia vera: voce + intervista + coperture + foto → MP4 virale 1080×1920, durata giusta, -14 LUFS, niente neri, sottotitoli bruciati', async () => {
  const voce = path.join(MATERIALE, 'regia-voce.wav');
  if (!fs.existsSync(voce)) ffmpeg(['-f', 'lavfi', '-i', "aevalsrc='0.4*sin(2*PI*220*t)*(between(t,0.5,3.5)+between(t,4.3,7.8)+between(t,8.6,11.0))':s=48000:d=12", '-ac', '2', voce]);
  const intv = path.join(MATERIALE, 'regia-intervista.mp4');
  if (!fs.existsSync(intv)) ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=24', '-f', 'lavfi', '-i', "aevalsrc='0.4*sin(2*PI*330*t)*(between(t,1,5)+between(t,6,9)+between(t,10,15)+between(t,17,22))':s=48000:d=24", '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', intv]);
  const cop1 = path.join(MATERIALE, 'regia-cop1.mp4');
  if (!fs.existsSync(cop1)) ffmpeg(['-f', 'lavfi', '-i', 'mandelbrot=size=1080x1920:rate=30', '-t', '16', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', cop1]);
  const cop2 = creaClip('regia-cop2.mp4', { w: 1920, h: 1080, durata: 10, audio: 'nessuno' });
  const foto = await creaImmagine('regia-foto.jpg', { seme: 7, w: 2400, h: 3000 });
  const musica = path.join(MATERIALE, 'regia-musica.wav');
  if (!fs.existsSync(musica)) ffmpeg(['-f', 'lavfi', '-i', "aevalsrc='0.3*sin(2*PI*523*t)*(0.5+0.5*sin(2*PI*2*t))':s=48000:d=8", '-ac', '2', musica]);

  const p = await (await fetch(`${s.base}/progetto`, { method: 'POST', headers: H, body: JSON.stringify({ nome: 'regia' }) })).json();
  const codici = [];
  for (const f of [voce, intv, cop1, cop2, foto]) {
    const r = await chiama(s.base, `/progetto/${p.progetto}/materiale`, { dati: { nome: path.basename(f), drive_id: f }, file: { file: f } });
    assert.equal(r.stato, 200, JSON.stringify(r.json));
    codici.push(`${r.json.materiale.codice}:${r.json.materiale.tipo}`);
  }
  assert.deepEqual(codici, ['A01:audio', 'V01:video', 'V02:video', 'V03:video', 'F01:foto'], 'l\'audio della voce entra come A01');
  const stato = await (await fetch(`${s.base}/progetto/${p.progetto}`, { headers: H })).json();
  const a01 = stato.materiali.find((m) => m.codice === 'A01');
  assert.equal(a01.parlato, true);
  assert.equal(a01.frasi.length, 3, 'tre tratti di voce = tre frasi');
  assert.equal(stato.audio, 1);

  const sc = await (await fetch(`${s.base}/sceneggiatura/leggi`, { method: 'POST', headers: H, body: JSON.stringify({ testo: '# Il bar\nMUSICA: si\nVOCE: regia-voce.wav\nBenvenuti.\nINTERVISTA: Mario Rossi, barista\nBenvenuti.\nCHIUSURA: Vieni a trovarci' }) })).json();
  assert.deepEqual(sc.blocchi.map((b) => b.tipo), ['voce', 'intervista']);
  const piano = {
    titolo: 'Il bar della piazza',
    battute: [
      { fonte: 'A01', inizio: 0, fine: 7.9, coperture: [{ scena: 'V02.1' }, 'F01', { scena: 'V03.1', posizione: 'intera' }] },
      { fonte: 'V01', inizio: 0.5, fine: 5.4, nome: 'Mario Rossi', ruolo: 'barista' },
      { fonte: 'V01', inizio: 9.8, fine: 15.3, coperture: [{ scena: 'V02.2' }] },
      { immagini: 3, coperture: ['V02.3'] },
    ],
    coperture_riserva: ['V02.4'],
    chiusura: 'Vieni a trovarci',
    musica: true,
  };
  const ctl = await (await fetch(`${s.base}/progetto/${p.progetto}/regia/controlla`, { method: 'POST', headers: H, body: JSON.stringify({ piano, sceneggiatura: sc, stile: 'virale' }) })).json();
  assert.equal(ctl.bloccante, false, JSON.stringify(ctl.problemi));
  assert.equal(ctl.conti.tagli_coperti, 1);
  const logo = await creaLogo();
  const r = await chiama(s.base, `/progetto/${p.progetto}/regia/monta`, { dati: { piano, sceneggiatura: sc, stile: 'virale' }, file: { logo, musica } });
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.file.map((f) => f.tipo), ['video', 'copertina', 'fotogrammi']);
  assert.ok(Math.abs(r.json.file[0].durata - ctl.durata) <= 0.1, `durata ${r.json.file[0].durata} invece di ${ctl.durata}`);
  assert.deepEqual(r.json.controllo, { neri: [], fermi: [] }, 'niente neri e niente immagini ferme');
  const v = await scarica(r.json.file[0].url);
  const pv = path.join(TMP, 'regia-vera.mp4');
  fs.writeFileSync(pv, v.buf);
  const info = sondaFile(pv);
  const sv = info.streams.find((x) => x.codec_type === 'video');
  const sa = info.streams.find((x) => x.codec_type === 'audio');
  assert.deepEqual([sv.codec_name, sv.width, sv.height, sv.avg_frame_rate, sv.pix_fmt], ['h264', 1080, 1920, '30/1', 'yuv420p']);
  assert.deepEqual([sa.codec_name, sa.sample_rate, sa.channels], ['aac', '48000', 2]);
  // fotogrammi esatti: la timeline a 30 fps, senza deriva
  const pacchetti = Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', pv]).toString().trim());
  assert.equal(pacchetti, Math.round(ctl.durata * 30), 'fotogrammi del video = durata della timeline × 30');
  const lufs = loudnessIntegrata(pv);
  assert.ok(lufs !== null && Math.abs(lufs - -14) <= 1.5, `volume ${lufs} LUFS`);
  // sottotitoli bruciati: mentre la voce dice la prima frase, nella fascia dei sottotitoli c'è il verde lime della parola detta
  const parola = ctl.parole[1];
  const fg = path.join(TMP, 'regia-fg.png');
  ffmpeg(['-ss', String((parola.da + parola.a) / 2), '-i', pv, '-frames:v', '1', fg]);
  const { data, info: im } = await sharp(fg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let lime = 0;
  for (let y = 1920 - 600; y < 1920 - 340; y++) {
    for (let x = 0; x < im.width; x++) {
      const i = (y * im.width + x) * 3;
      if (Math.abs(data[i] - 0xd2) < 40 && data[i + 1] > 215 && data[i + 2] < 110) lime++;
    }
  }
  assert.ok(lime > 300, `pochi pixel lime nella fascia dei sottotitoli: ${lime}`);
  // e niente testo nei 340 px in basso (area dell'interfaccia di Instagram)
  let limeBasso = 0;
  for (let y = 1920 - 340; y < 1920; y++) {
    for (let x = 0; x < im.width; x++) {
      const i = (y * im.width + x) * 3;
      if (Math.abs(data[i] - 0xd2) < 30 && data[i + 1] > 230 && data[i + 2] < 90) limeBasso++;
    }
  }
  assert.ok(limeBasso < 50, `testo lime nell'area vietata in basso: ${limeBasso}`);
  // un piano senza battute valide non si monta
  const no = await chiama(s.base, `/progetto/${p.progetto}/regia/monta`, { dati: { piano: { battute: [{ fonte: 'Z9' }] } }, file: {} });
  assert.equal(no.stato, 422);
  assert.equal(no.json.errore, 'regia_non_valida');
});

test('regia vera: coperture cortissime e un\'immagine ferma con la grana dello stile virale → fotogrammi esatti, immagine ferma trovata', async () => {
  const voce = path.join(MATERIALE, 'regia-voce.wav');
  const intv = path.join(MATERIALE, 'regia-intervista.mp4');
  const ferma = creaClip('regia-ferma.mp4', { w: 1080, h: 1920, durata: 6, audio: 'nessuno', video: 'grigio' });
  const corta = creaClip('regia-corta.mp4', { w: 1080, h: 1920, durata: 1.5, audio: 'nessuno' });
  const p = await (await fetch(`${s.base}/progetto`, { method: 'POST', headers: H, body: JSON.stringify({ nome: 'regia 2' }) })).json();
  for (const f of [voce, intv, ferma, corta]) {
    const r = await chiama(s.base, `/progetto/${p.progetto}/materiale`, { dati: { nome: path.basename(f), drive_id: f }, file: { file: f } });
    assert.equal(r.stato, 200, JSON.stringify(r.json));
  }
  // A01 = voce, V01 = intervista, V02 = grigio fermo da 6 s, V03 = clip da 1,5 s
  const piano = { battute: [
    { fonte: 'A01', inizio: 0, fine: 3.6, coperture: ['V02.1'] },
    { fonte: 'A01', inizio: 4, fine: 11.2, coperture: ['V03.1'] },
    { fonte: 'V01', inizio: 0.5, fine: 9.3 },
  ] };
  const ctl = await (await fetch(`${s.base}/progetto/${p.progetto}/regia/controlla`, { method: 'POST', headers: H, body: JSON.stringify({ piano, stile: 'virale' }) })).json();
  assert.equal(ctl.bloccante, false, JSON.stringify(ctl.problemi));
  assert.ok(ctl.video.filter((q) => q.fonte === 'V03').length >= 3, 'la clip da 1,5 s si ripete invece di allungarsi');
  const r = await chiama(s.base, `/progetto/${p.progetto}/regia/monta`, { dati: { piano, stile: 'virale' }, file: {} });
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  assert.ok(r.json.controllo.fermi.length >= 1, `l'immagine grigia ferma per 3,6 s non è stata trovata: ${JSON.stringify(r.json.controllo)}`);
  assert.ok(r.json.avvisi.some((a) => a.codice === 'immagine_ferma'));
  const v = await scarica(r.json.file[0].url);
  const pv = path.join(TMP, 'regia-corte.mp4');
  fs.writeFileSync(pv, v.buf);
  const pacchetti = Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', pv]).toString().trim());
  assert.equal(pacchetti, Math.round(ctl.durata * 30));
});

test('regia vera in stile Scatti di G (moodboard): 25 fotogrammi, sottotitoli avorio a frase, filo d\'oro sul cartello, nero morbido', async () => {
  const voce = path.join(MATERIALE, 'regia-voce.wav');
  if (!fs.existsSync(voce)) ffmpeg(['-f', 'lavfi', '-i', "aevalsrc='0.4*sin(2*PI*220*t)*(between(t,0.5,3.5)+between(t,4.3,7.8)+between(t,8.6,11.0))':s=48000:d=12", '-ac', '2', voce]);
  const intv = path.join(MATERIALE, 'regia-intervista.mp4');
  if (!fs.existsSync(intv)) ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=24', '-f', 'lavfi', '-i', "aevalsrc='0.4*sin(2*PI*330*t)*(between(t,1,5)+between(t,6,9)+between(t,10,15)+between(t,17,22))':s=48000:d=24", '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', intv]);
  // copertura con il nero pieno: un riquadro che si muove su fondo nero (per vedere se il nero diventa morbido)
  const nero = path.join(MATERIALE, 'regia-nero.mp4');
  if (!fs.existsSync(nero)) ffmpeg(['-f', 'lavfi', '-i', 'color=c=black:s=1080x1920:r=30:d=16[b];testsrc2=s=320x320:r=30:d=16[t];[b][t]overlay=x=\'mod(t*150,760)\':y=700', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', nero]);
  const p = await (await fetch(`${s.base}/progetto`, { method: 'POST', headers: H, body: JSON.stringify({ nome: 'regia sdg' }) })).json();
  for (const f of [voce, intv, nero]) {
    const r = await chiama(s.base, `/progetto/${p.progetto}/materiale`, { dati: { nome: path.basename(f), drive_id: f }, file: { file: f } });
    assert.equal(r.stato, 200, JSON.stringify(r.json));
  }
  const piano = {
    battute: [
      { fonte: 'A01', inizio: 0, fine: 7.9, coperture: [{ scena: 'V02.1' }, { scena: 'V02.3' }] },
      { fonte: 'V01', inizio: 0.5, fine: 5.4, nome: 'Mario Rossi', ruolo: 'barista' },
    ],
    chiusura: 'Vieni a trovarci',
  };
  const ctl = await (await fetch(`${s.base}/progetto/${p.progetto}/regia/controlla`, { method: 'POST', headers: H, body: JSON.stringify({ piano, stile: 'sdg' }) })).json();
  assert.equal(ctl.bloccante, false, JSON.stringify(ctl.problemi));
  for (const q of ctl.video) assert.ok(q.a - q.da >= 1 - 1e-3, `inquadratura sotto 1 s con il ritmo SDG: ${JSON.stringify(q)}`);
  const r = await chiama(s.base, `/progetto/${p.progetto}/regia/monta`, { dati: { piano, stile: 'sdg' }, file: {} });
  assert.equal(r.stato, 200, JSON.stringify(r.json));
  const pv = path.join(TMP, 'regia-sdg.mp4');
  fs.writeFileSync(pv, (await scarica(r.json.file[0].url)).buf);
  const sv = sondaFile(pv).streams.find((x) => x.codec_type === 'video');
  assert.deepEqual([sv.codec_name, sv.width, sv.height, sv.avg_frame_rate], ['h264', 1080, 1920, '25/1']);
  const pacchetti = Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', pv]).toString().trim());
  assert.equal(pacchetti, Math.round(ctl.durata * 25), 'fotogrammi = durata × 25');
  const fotogramma = async (t) => {
    const fg = path.join(TMP, `regia-sdg-${t}.png`);
    ffmpeg(['-ss', String(t), '-i', pv, '-frames:v', '1', fg]);
    return sharp(fg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  };
  // durante la voce: frase in avorio nella fascia dei sottotitoli, niente verde lime da nessuna parte
  const { data, info: im } = await fotogramma((ctl.parole[0].da + ctl.parole[0].a) / 2);
  let avorio = 0;
  let lime = 0;
  let neroPieno = 0;
  for (let y = 0; y < im.height; y++) {
    for (let x = 0; x < im.width; x++) {
      const i = (y * im.width + x) * 3;
      const [rr, gg, bb] = [data[i], data[i + 1], data[i + 2]];
      if (y > 1920 - 560 && y < 1920 - 340 && rr > 225 && gg > 222 && bb > 212 && rr - bb < 25) avorio++;
      if (y > 1920 - 560 && y < 1920 - 340 && Math.abs(rr - 0xd2) < 40 && gg > 215 && bb < 110) lime++;
      if (Math.max(rr, gg, bb) < 6) neroPieno++;
    }
  }
  assert.ok(avorio > 300, `pochi pixel avorio nella fascia dei sottotitoli: ${avorio}`);
  // i testi vanno DOPO la curva del colore: l'avorio resta pieno (con la curva sopra scenderebbe sotto 236)
  let avorioPieno = 0;
  for (let y = 1920 - 560; y < 1920 - 340; y++) for (let x = 0; x < im.width; x++) { const i = (y * im.width + x) * 3; if (data[i] >= 240 && data[i + 1] >= 237 && data[i + 2] >= 230) avorioPieno++; }
  assert.ok(avorioPieno > 80, `l'avorio dei sottotitoli non è pieno (${avorioPieno} pixel): i testi passano sotto la curva?`);
  assert.ok(lime < 30, `c'è del verde lime nei sottotitoli: ${lime}`);
  // la copertura è quasi tutta nero pieno: con la curva SDG il nero diventa grigio-nero, mai 0
  assert.ok(neroPieno < 2000, `troppi pixel nero pieno (${neroPieno}): il nero morbido non è stato applicato`);
  const angolo = (y, x) => data[(y * im.width + x) * 3];
  assert.ok(angolo(1000, 1000) >= 8 && angolo(1000, 1000) <= 20, `il nero della copertura vale ${angolo(1000, 1000)}: atteso grigio-nero (8-20)`);
  // sul cartello: il filo d'oro a sinistra del nome
  const cartello = ctl.cartelli[0];
  const { data: d2, info: i2 } = await fotogramma(cartello.da + 1);
  let oro = 0;
  for (let y = 335; y < 435; y++) {
    for (let x = 73; x < 76; x++) {
      const i = (y * i2.width + x) * 3;
      if (Math.abs(d2[i] - 0xe0) < 30 && Math.abs(d2[i + 1] - 0xa9) < 30 && Math.abs(d2[i + 2] - 0x5c) < 40) oro++;
    }
  }
  assert.ok(oro > 240, `il filo d'oro del cartello non si vede: ${oro} pixel su 300`);
});
