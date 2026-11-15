// Prove sui pezzi interni: configurazione predefinita, SRT, spostamento sui tagli, ASS, adattamento 9:16, testi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { leggiConfig } from '../src/config.js';
import { leggiSrt, scriviSrt, spostaSuMontaggio, creaAss, coloreAss, tempoSrt } from '../src/srt.js';
import { modoAdattamento, grafoAdattamento } from '../src/video.js';
import { pulisciSegmenti, leggiZoneVad, zoneDaSilenzi, correggiTempi, gruppiParlato, paroleDaToken, presetDalModello, presetDtw } from '../src/trascrizione.js';
import { pulisciRighe, coloriValidi, blocco } from '../src/grafiche.js';
import { leggiPesoTitolo, fontPerSatori } from '../src/font.js';
import { normalizzaStile, puntoLogo, distanzaHamming } from '../src/immagini.js';

test('configurazione predefinita = contratto (porta 8080, 300 MB, 800 MB, 5 in attesa, 24 ore, 2 thread)', () => {
  const c = leggiConfig({ OFFICINA_CHIAVE: 'x'.repeat(20) });
  assert.equal(c.porta, 8080);
  assert.equal(c.maxFileByte, 300 * 1024 * 1024);
  assert.equal(c.maxTotaleByte, 800 * 1024 * 1024);
  assert.equal(c.maxAttesa, 5);
  assert.equal(c.durataFileMs, 24 * 3600 * 1000);
  assert.equal(c.threadFfmpeg, 2);
  assert.equal(c.threadWhisper, 2);
  assert.equal(c.datiDir, '/dati');
  assert.equal(c.fontRete, true);
});

test('SRT: lettura tollerante e scrittura', () => {
  const f = leggiSrt('﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nCiao\r\na tutti\r\n\r\n2\n00:00:03.2 --> 00:00:04,000\nSecondo\n\nspazzatura\n');
  assert.deepEqual(f, [{ inizio: 1, fine: 2.5, testo: 'Ciao\na tutti' }, { inizio: 3.2, fine: 4, testo: 'Secondo' }]);
  assert.equal(tempoSrt(3725.5), '01:02:05,500');
  assert.equal(scriviSrt(f), '1\n00:00:01,000 --> 00:00:02,500\nCiao\na tutti\n\n2\n00:00:03,200 --> 00:00:04,000\nSecondo\n');
});

test('sottotitoli spostati sui tagli: fuori taglio spariscono, a cavallo si accorciano, l\'ordine segue il montaggio', () => {
  const frasi = [
    { inizio: 1, fine: 2, testo: 'A1' }, // clip 0 locale 1-2
    { inizio: 7, fine: 8, testo: 'B1' }, // clip 1 locale 1-2
    { inizio: 3.5, fine: 4.5, testo: 'fuori' },
    { inizio: 5.5, fine: 6.8, testo: 'a cavallo' }, // fine clip 0 (5.5-6) + inizio clip 1 (0-0.8)
  ];
  const segmenti = [
    { clip: 1, inizio: 0.5, fine: 3, offset: 0 },
    { clip: 0, inizio: 0.5, fine: 2.5, offset: 2.5 },
  ];
  const r = spostaSuMontaggio(frasi, [6, 6], segmenti);
  assert.deepEqual(r.map((x) => [x.testo, +x.inizio.toFixed(3), +x.fine.toFixed(3)]), [
    ['a cavallo', 0, 0.3],
    ['B1', 0.5, 1.5],
    ['A1', 3, 4],
  ]);
});

test('ASS: risoluzione 1080×1920, margine basso 420, colori &HAABBGGRR, testo protetto dai comandi ASS', () => {
  assert.equal(coloreAss('#1F3B2D'), '&H002D3B1F');
  assert.equal(coloreAss('#FFF', 0.6), '&H99FFFFFF');
  const ass = creaAss([{ inizio: 1, fine: 2.5, testo: 'Riga {\\b1}uno\nriga due' }], { famiglia: 'Inter', colori: { primario: '#000000', testo: '#FFFFFF' } });
  assert.match(ass, /PlayResX: 1080\nPlayResY: 1920/);
  assert.match(ass, /Style: Default,Inter,58,.*,2,90,90,420,1/);
  assert.match(ass, /Dialogue: 0,0:00:01\.00,0:00:02\.50,Default,,0,0,0,,Riga \\\{⧵b1\\\}uno\\Nriga due/);
});

test('adattamento 9:16: verticali riempiono (ritaglio ≤ 20%), orizzontali e quasi quadrate vanno su sfondo; HDR riconosciuto', () => {
  assert.equal(modoAdattamento({ larghezza: 1080, altezza: 1920 }), 'riempi');
  assert.equal(modoAdattamento({ larghezza: 1080, altezza: 1620 }), 'riempi'); // 2:3 tiene l'84%
  assert.equal(modoAdattamento({ larghezza: 1080, altezza: 1440 }), 'sfondo'); // 3:4 tiene il 75%
  assert.equal(modoAdattamento({ larghezza: 1920, altezza: 1080 }), 'sfondo');
  const g = grafoAdattamento({ larghezza: 1920, altezza: 1080, trasferimento: 'arib-std-b67' }, { sfondo: 'colore', colore: '#abc' });
  assert.equal(g.hdr, true);
  assert.match(g.grafo, /tonemap/);
  assert.match(g.grafo, /pad=1080:1920:.*color=0xAABBCC/);
  assert.doesNotMatch(grafoAdattamento({ larghezza: 1920, altezza: 1080 }).grafo, /pad=/);
});

test('trascrizione: allucinazioni note e frasi vuote scartate, tempi tenuti dentro la clip', () => {
  const r = pulisciSegmenti([
    { offsets: { from: 0, to: 1500 }, text: ' Ciao a tutti.' },
    { offsets: { from: 1500, to: 3000 }, text: ' Sottotitoli creati dalla comunità Amara.org' },
    { offsets: { from: 3000, to: 4000 }, text: ' [Musica]' },
    { offsets: { from: 4000, to: 9000 }, text: ' Ultima frase' },
    { offsets: { from: 5000, to: 5000 }, text: ' zero' },
  ], 6);
  assert.deepEqual(r, [{ inizio: 0, fine: 1.5, testo: 'Ciao a tutti.' }, { inizio: 4, fine: 6, testo: 'Ultima frase' }]);
});

test('righe di testo: ruoli, limiti, emoji tolte senza toccare il resto; colori validati', () => {
  const avvisi = [];
  assert.deepEqual(pulisciRighe(['Titolo  con   spazi', { testo: 'Sotto ✨ testo' }], avvisi), [
    { testo: 'Titolo con spazi', ruolo: 'titolo' },
    { testo: 'Sotto testo', ruolo: 'sotto' },
  ]);
  assert.equal(avvisi[0].codice, 'emoji_tolte');
  assert.deepEqual(pulisciRighe([{ testo: 'Caffè © 2026 ™' }], []), [{ testo: 'Caffè © 2026 ™', ruolo: 'titolo' }]);
  assert.throws(() => pulisciRighe([{ testo: 'x', ruolo: 'grande' }], []), (e) => e.codice === 'righe_non_valide');
  assert.throws(() => pulisciRighe(Array(7).fill('x'), []), (e) => e.codice === 'righe_non_valide');
  const a2 = [];
  assert.deepEqual(coloriValidi({ primario: '#abc', testo: 'rosso' }, a2), { primario: '#abc', secondario: '#F2F2F2', testo: '#FFFFFF' });
  assert.equal(a2[0].codice, 'colore_non_valido');
});

test('stile: valori neutri, limiti e calore anche in scala -100..100; logo nel 9:16 fuori dalle aree sicure', () => {
  assert.deepEqual(normalizzaStile(undefined, []), { luminosita: 1, contrasto: 1, saturazione: 1, calore: 0 });
  const av = [];
  assert.deepEqual(normalizzaStile({ luminosita: 3, calore: 50 }, av), { luminosita: 1.5, contrasto: 1, saturazione: 1, calore: 0.5 });
  assert.equal(av[0].codice, 'stile_limitato');
  const alto = puntoLogo('alto-destra', 1080, 1920, 200, 100);
  const basso = puntoLogo('basso-sinistra', 1080, 1920, 200, 100);
  assert.ok(alto.top >= 250);
  assert.ok(basso.top + 100 <= 1920 - 340);
  assert.equal(distanzaHamming([1, 0, 1, 1], [1, 1, 1, 0]), 2);
});

test('zone di parlato: uscita del VAD in centesimi di secondo, silenzi di FFmpeg, tempi di whisper stretti e mai allargati', () => {
  // stampa vera di whisper-vad-speech-segments 1.9.1 sulla clip del collaudo
  const vad = 'Detected 4 speech segments:\nSpeech segment 0: start = 298.00, end = 502.00\nSpeech segment 1: start = 528.00, end = 784.00\nSpeech segment 2: start = 2499.00, end = 2701.00\nSpeech segment 3: start = 2730.00, end = 2976.00\n';
  const zone = leggiZoneVad(vad);
  assert.deepEqual(zone, [{ inizio: 2.98, fine: 5.02 }, { inizio: 5.28, fine: 7.84 }, { inizio: 24.99, fine: 27.01 }, { inizio: 27.3, fine: 29.76 }]);
  assert.equal(leggiZoneVad('error: failed to read audio'), null);
  assert.equal(leggiZoneVad('Detected 2 speech segments:\nSpeech segment 0: start = 10.00, end = 20.00\n'), null, 'uscita incompleta → ripiego');
  assert.deepEqual(leggiZoneVad('Detected 0 speech segments:\n'), []);
  const silenzi = '[silencedetect] silence_start: 0\n[silencedetect] silence_end: 3.01519 | silence_duration: 3.0\n[silencedetect] silence_start: 7.72912\n[silencedetect] silence_end: 25.0152 | x\n[silencedetect] silence_start: 29.7291\n';
  assert.deepEqual(zoneDaSilenzi(silenzi, 40), [{ inizio: 3.015, fine: 7.729 }, { inizio: 25.015, fine: 29.729 }]);
  assert.deepEqual(zoneDaSilenzi('', 6), [{ inizio: 0, fine: 6 }]);
  // tempi del whisper vero senza VAD sulla stessa clip: 0-10 s e 24-32 s
  const whisper = [{ inizio: 0, fine: 10, testo: 'a' }, { inizio: 15, fine: 17, testo: 'inventata' }, { inizio: 24, fine: 32, testo: 'b' }];
  assert.deepEqual(correggiTempi(whisper, zone), [{ inizio: 2.88, fine: 8.09, testo: 'a' }, { inizio: 24.89, fine: 30.01, testo: 'b' }]);
  assert.deepEqual(correggiTempi(whisper, null), whisper, 'zone sconosciute: restano i tempi di whisper');
  assert.deepEqual(correggiTempi(whisper, []), [], 'nessun parlato: nessun sottotitolo');
  // mai allargati: whisper dice 3,5-4,0 dentro una zona 3-8 → resta 3,5-4,0; un pezzetto corto dura almeno 0,3 s
  assert.deepEqual(correggiTempi([{ inizio: 3.5, fine: 4, testo: 'x' }], [{ inizio: 3, fine: 8 }]), [{ inizio: 3.5, fine: 4, testo: 'x' }]);
  assert.deepEqual(correggiTempi([{ inizio: 1, fine: 5, testo: 'sì' }], [{ inizio: 4.9, fine: 4.95 }, { inizio: 4.8, fine: 4.98 }]), [{ inizio: 4.7, fine: 5, testo: 'sì' }]);
  // due frasi di whisper che si accavallano: la prima finisce dove parte la seconda
  assert.deepEqual(correggiTempi([{ inizio: 0, fine: 6, testo: 'a' }, { inizio: 5, fine: 9, testo: 'b' }], [{ inizio: 1, fine: 8.5 }]), [{ inizio: 0.9, fine: 5, testo: 'a' }, { inizio: 5, fine: 8.75, testo: 'b' }]);
});

// Uscita vera di whisper.cpp 1.9.1 (-ojf -nfa -dtw small) sulla clip del ricontrollo con la pausa di 4,5 s:
// UN segmento 25-36 s con due frasi; t_dtw = inizio allineato di ogni token, in centesimi di secondo.
const ZONE_RIC = [{ inizio: 1.09, fine: 3.49 }, { inizio: 5.99, fine: 8.8 }, { inizio: 26.15, fine: 29.57 }, { inizio: 34.08, fine: 36.48 }];
const TOKEN_RIC = [['[_BEG_]', -1], [' Vi', 2614], [' asp', 2636], ['ett', 2656], ['iamo', 2680], [' in', 2704], [' via', 2722], [' da', 2742], [' rib', 2758], ['ald', 2788], ['i', 2806], [',', 2824], [' a', 2832], [' due', 2850], [' pass', 2882], ['i', 2898], [' dal', 2912], [' du', 2928], ['omo', 2954], ['.', 3180], [' St', 3412], ['as', 3424], ['era', 3446], [' music', 3478], ['a', 3506], [' dal', 3520], [' vivo', 3542], [' inter', 3580], ['ca', 3598], ['zza', 3598], ['.', 3598], ['[_TT_550]', -1]];
const TESTO_RIC = ' Vi aspettiamo in via da ribaldi, a due passi dal duomo. Stasera musica dal vivo intercazza.';
const segmentoRic = (token) => [{ offsets: { from: 25000, to: 36000 }, text: token.filter(([x]) => !x.startsWith('[_')).map(([x]) => x).join(''), tokens: token.map(([text, t]) => ({ text, t_dtw: t })) }];

test('sottotitoli divisi sui silenzi: due frasi in un segmento di whisper → due sottotitoli, ognuno solo sul suo parlato', () => {
  // tratti di parlato: silenzi sotto 0,8 s uniti
  assert.deepEqual(gruppiParlato([{ inizio: 5.28, fine: 7.84 }, { inizio: 2.98, fine: 5.02 }, { inizio: 24.99, fine: 27.01 }]).map((g) => [g.inizio, g.fine, g.zone.length]), [[2.98, 7.84, 2], [24.99, 27.01, 1]]);
  assert.deepEqual(gruppiParlato([{ inizio: 1, fine: 2 }, { inizio: 2.8, fine: 3 }]).length, 2, 'un silenzio di 0,8 s divide');
  // parole dai token: punteggiatura attaccata alla parola prima, quella che apre alla parola dopo, token speciali fuori
  assert.deepEqual(paroleDaToken([{ text: '[_BEG_]', t_dtw: -1 }, { text: ' «', t_dtw: 90 }, { text: 'Ciao', t_dtw: 100 }, { text: '»', t_dtw: 900 }, { text: ' a', t_dtw: 130 }, { text: ' tutti', t_dtw: 150 }, { text: '.', t_dtw: 990 }]), [{ testo: ' «Ciao»', t: 1 }, { testo: ' a', t: 1.3 }, { testo: ' tutti.', t: 1.5 }]);
  const seg = pulisciSegmenti(segmentoRic(TOKEN_RIC), 40);
  assert.equal(seg[0].testo, TESTO_RIC.trim());
  assert.equal(seg[0].parole.length, 16);
  const atteso = [{ inizio: 26.05, fine: 29.82, testo: 'Vi aspettiamo in via da ribaldi, a due passi dal duomo.' }, { inizio: 33.98, fine: 36, testo: 'Stasera musica dal vivo intercazza.' }];
  assert.deepEqual(correggiTempi(seg, ZONE_RIC), atteso);
  // senza tempi per parola (t_dtw = -1): divisione in proporzione al parlato, sulla fine della frase
  const senza = pulisciSegmenti(segmentoRic(TOKEN_RIC.map(([x]) => [x, -1])), 40);
  assert.deepEqual(correggiTempi(senza, ZONE_RIC), atteso);
  // e anche senza token (vecchio -oj)
  assert.deepEqual(correggiTempi([{ inizio: 25, fine: 36, testo: TESTO_RIC.trim() }], ZONE_RIC), atteso);
  // una parola sentita nel silenzio (32 s, a oltre 1 s da ogni tratto) non si mostra
  const conInventata = [...TOKEN_RIC.slice(0, 20), [' Grazie', 3200], ...TOKEN_RIC.slice(20)];
  assert.deepEqual(correggiTempi(pulisciSegmenti(segmentoRic(conInventata), 40), ZONE_RIC), atteso);
  // un tempo allineato sbagliato su una parola sola («due» a 35 s) non la sposta nell'altra frase
  const sbagliato = TOKEN_RIC.map(([x, t]) => [x, x === ' due' ? 3500 : t]);
  assert.deepEqual(correggiTempi(pulisciSegmenti(segmentoRic(sbagliato), 40), ZONE_RIC), atteso);
  // i tempi non si allargano mai: il pezzo resta dentro il segmento di whisper (fine a 29 s, non 29,82)
  const corto = [{ ...segmentoRic(TOKEN_RIC)[0], offsets: { from: 25000, to: 29000 }, text: TESTO_RIC.slice(0, 56), tokens: segmentoRic(TOKEN_RIC)[0].tokens.slice(0, 20) }];
  assert.deepEqual(correggiTempi(pulisciSegmenti(corto, 40), ZONE_RIC), [{ inizio: 26.05, fine: 29, testo: 'Vi aspettiamo in via da ribaldi, a due passi dal duomo.' }]);
});

test('tempi per parola: il nome della rete per -dtw si legge dall\'intestazione del modello, poi dal nome (anche dietro un collegamento)', () => {
  assert.equal(leggiConfig({}).whisperDtw, '');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'officina-dtw-'));
  const modello = (nome, h) => {
    const buf = Buffer.alloc(48);
    buf.writeUInt32LE(0x67676d6c, 0);
    h.forEach((v, i) => buf.writeInt32LE(v, 4 + i * 4));
    fs.writeFileSync(path.join(dir, nome), buf);
    return path.join(dir, nome);
  };
  try {
    assert.equal(presetDalModello(modello('a.bin', [51865, 1500, 768, 12, 12, 448, 768, 12, 12, 80, 1])), 'small');
    assert.equal(presetDalModello(modello('b.bin', [51864, 1500, 512, 8, 6, 448, 512, 8, 6, 80, 1])), 'base.en');
    assert.equal(presetDalModello(modello('c.bin', [51866, 1500, 1280, 20, 32, 448, 1280, 20, 4, 128, 1])), 'large.v3.turbo');
    assert.equal(presetDalModello(modello('d.bin', [51866, 1500, 1280, 20, 32, 448, 1280, 20, 32, 128, 1])), 'large.v3');
    // large v1 e v2 hanno la stessa intestazione: decide il nome del file
    assert.equal(presetDalModello(modello('ggml-large-v2.bin', [51865, 1500, 1280, 20, 32, 448, 1280, 20, 32, 80, 1])), 'large.v2');
    assert.equal(presetDalModello(modello('e.bin', [51865, 1500, 1280, 20, 32, 448, 1280, 20, 32, 80, 1])), null);
    // come nell'immagine Docker: modello.bin → ggml-small-q5_1.bin
    fs.writeFileSync(path.join(dir, 'ggml-small-q5_1.bin'), 'non ggml');
    fs.symlinkSync('ggml-small-q5_1.bin', path.join(dir, 'modello.bin'));
    assert.equal(presetDalModello(path.join(dir, 'modello.bin')), 'small');
    fs.writeFileSync(path.join(dir, 'modello-finto.bin'), Buffer.alloc(100, 1));
    assert.equal(presetDalModello(path.join(dir, 'modello-finto.bin')), null);
    assert.equal(presetDalModello(path.join(dir, 'non-esiste.bin')), null);
    assert.equal(presetDtw({ whisperDtw: 'no', whisperModello: path.join(dir, 'a.bin') }), null);
    assert.equal(presetDtw({ whisperDtw: 'SMALL', whisperModello: path.join(dir, 'modello-finto.bin') }), 'small');
    assert.equal(presetDtw({ whisperDtw: 'boh', whisperModello: path.join(dir, 'a.bin') }), null);
    assert.equal(presetDtw({ whisperDtw: '', whisperModello: path.join(dir, 'b.bin') }), 'base.en');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('font del marchio: titoli con «Marchio» al peso scelto, righe sotto con «MarchioTesto»; peso validato', () => {
  const el = blocco([{ testo: 'Noche Latina', ruolo: 'titolo' }, { testo: 'Venerdì', ruolo: 'sotto' }], { larghezza: 900, scala: 1, base: { titolo: 80, sotto: 40 }, colore: '#fff', pesoTitolo: 800 });
  const [t, sotto] = el.props.children.map((c) => c.props.style);
  assert.deepEqual([t.fontFamily, t.fontWeight, sotto.fontFamily, sotto.fontWeight], ['Marchio', 800, 'MarchioTesto', 400]);
  const avvisi = [];
  assert.equal(leggiPesoTitolo(undefined, avvisi), 700);
  assert.equal(leggiPesoTitolo(800, avvisi), 800);
  assert.equal(leggiPesoTitolo('900', avvisi), 900);
  assert.equal(avvisi.length, 0);
  assert.equal(leggiPesoTitolo(850, avvisi), 700);
  assert.equal(avvisi[0].codice, 'peso_non_valido');
  const f = (n) => ({ pesi: { 400: { dati: Buffer.from(`${n}4`) }, 700: { dati: Buffer.from(`${n}7`) } } });
  const titolo = f('t');
  titolo.pesi[800] = { dati: Buffer.from('t8') };
  const lista = fontPerSatori({ titolo, testo: f('x'), pesoTitolo: 800 });
  assert.deepEqual(lista.map((x) => `${x.name}:${x.weight}:${x.data}`), ['Marchio:400:t4', 'Marchio:700:t7', 'Marchio:800:t8', 'MarchioTesto:400:x4', 'MarchioTesto:700:x7']);
});
