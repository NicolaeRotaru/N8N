#!/usr/bin/env node
// Finto whisper-cli per le prove: legge gli stessi argomenti del vero, scrive <of>.json nello stesso formato.
// Modo normale: due frasi vere e una "allucinazione" nota (che l'officina deve scartare).
// Modo FINTO_WHISPER_MODO=energia: imita il whisper vero sulle clip con pause lunghe. Una frase per ogni tratto
// con suono, con tempi a grana grossa (parte 1,5 s prima e finisce 2,3 s dopo il suono, come il vero senza VAD),
// più una frase inventata in mezzo a ogni silenzio lungo.
// Modo FINTO_WHISPER_MODO=unisce: imita il difetto del ricontrollo. Il whisper vero (whisper.cpp 1.9.1, senza VAD)
// a volte mette in UN segmento due frasi divise da 4-5 s di silenzio. Qui i tratti con meno di 6 s di silenzio fra
// loro finiscono in un segmento solo, con una frase diversa per tratto, e in coda una frase "sentita" nel silenzio.
// Con --vad imita il difetto di whisper.cpp 1.9.1 (provato a mano): una frase sola che copre tutto il silenzio
// in mezzo, e la frase ripetuta sparisce.
// Con -ojf scrive anche i token di ogni segmento. Il loro t_dtw (inizio allineato, in centesimi) c'è solo con
// -dtw E -nfa, come nel vero (con l'attenzione veloce whisper.cpp spegne l'allineamento): altrimenti vale -1.
import fs from 'node:fs';
import { trattiConSuono } from './suono-wav.mjs';

const a = process.argv.slice(2);
const val = (k) => a[a.indexOf(k) + 1];
const wav = val('-f');
const uscita = val('-of');
const buf = fs.readFileSync(wav);
const durata = (buf.length - 44) / (16000 * 2);
const conVad = a.includes('--vad');
const conToken = a.includes('-ojf');
const allineato = a.includes('-dtw') && a.includes('-nfa');
if (process.env.FINTO_WHISPER_REGISTRO) fs.appendFileSync(process.env.FINTO_WHISPER_REGISTRO, `${JSON.stringify(a)}\n`);

// Una frase lunga e una corta: la divisione "in proporzione" sbaglierebbe, quella con i tempi per parola no.
const FRASI_UNISCE = [' Ciao a tutti.', ' Oggi pasta fresca fatta a mano, con il ragù della casa e il pane appena sfornato.', ' Vi aspettiamo stasera.'];
const INVENTATA_UNISCE = ' Grazie a tutti.';

// frasi: [inizio, fine, testo, pezzi]; pezzi = [[testo, inizio vero, fine vera], ...] per i tempi allineati.
let frasi;
if (process.env.FINTO_WHISPER_MODO === 'energia') {
  const tratti = trattiConSuono(buf);
  frasi = tratti.map(([i, f]) => [Math.max(0, i - 1.5), Math.min(durata, f + 2.3), ' Benvenuti al bar della piazza.']);
  // Nei silenzi lunghi (oltre 6 s) il whisper vero a volte "sente" una frase che non c'è: la si imita.
  for (let k = 0; k + 1 < tratti.length; k++) {
    const mezzo = (tratti[k][1] + tratti[k + 1][0]) / 2;
    if (tratti[k + 1][0] - tratti[k][1] > 6) frasi.push([mezzo - 1, mezzo + 1, ' Grazie a tutti.']);
  }
  frasi.sort((x, y) => x[0] - y[0]);
  if (conVad && tratti.length) frasi = [[tratti[0][0], tratti[tratti.length - 1][1], ' Benvenuti al bar della piazza.']];
} else if (process.env.FINTO_WHISPER_MODO === 'unisce') {
  const tratti = trattiConSuono(buf);
  const gruppi = [];
  tratti.forEach((t, k) => {
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo && t[0] - ultimo[ultimo.length - 1][1] < 6) ultimo.push(t);
    else gruppi.push([t]);
    t.push(FRASI_UNISCE[k % FRASI_UNISCE.length]);
  });
  frasi = gruppi.map((g, n) => {
    const pezzi = g.map(([i, f, testo]) => [testo, i, f]);
    const fine = Math.min(durata, g[g.length - 1][1] + 2.3);
    // in coda all'ultimo segmento, parole "sentite" nel silenzio, fra 1,6 e 2,2 s dopo l'ultimo suono
    if (n === gruppi.length - 1) pezzi.push([INVENTATA_UNISCE, g[g.length - 1][1] + 1.6, Math.min(fine, g[g.length - 1][1] + 2.2)]);
    return [Math.max(0, g[0][0] - 1.5), fine, pezzi.map((p) => p[0]).join(''), pezzi];
  });
} else {
  frasi = [
    [0.5, 2.0, ' Benvenuti da noi.'],
    [2.2, 3.6, ' Sottotitoli a cura di QTSS'],
    [3.8, Math.min(durata, 5.5), ' Oggi pasta fresca.'],
  ].filter(([i]) => i < durata);
  if (conVad) frasi = [[0.5, Math.min(durata, 5.5), ' Benvenuti da noi. Oggi pasta fresca.']];
}

const ms = (s) => Math.round(s * 1000);
const cs = (s) => Math.round(s * 100);

// Token come quelli del vero: [_BEG_], una parola per token con lo spazio davanti, la punteggiatura a parte
// (con un tempo allineato sbagliato, come capita nel vero), [_TT_…] in fondo. offsets = tempi a grana grossa
// spalmati su tutto il segmento (come il vero senza allineamento).
function token(inizio, fine, testo, pezzi) {
  const pz = pezzi || [[testo, inizio, fine]];
  const elenco = [];
  for (const [t, i, f] of pz) {
    const parole = t.trim().split(/\s+/);
    parole.forEach((p, k) => {
      const tVero = i + ((f - i) * k) / parole.length;
      const m = p.match(/^(.*?)([.,!?]*)$/);
      elenco.push({ text: ` ${m[1]}`, t: tVero });
      if (m[2]) elenco.push({ text: m[2], t: f + 3 });
    });
  }
  const passo = (fine - inizio) / Math.max(1, elenco.length);
  return [
    { text: '[_BEG_]', offsets: { from: ms(inizio), to: ms(inizio) }, id: 50365, p: 0.9, t_dtw: -1 },
    ...elenco.map((e, k) => ({
      text: e.text,
      offsets: { from: ms(inizio + passo * k), to: ms(inizio + passo * (k + 1)) },
      id: 1000 + k,
      p: 0.9,
      t_dtw: allineato ? cs(e.t) : -1,
    })),
    { text: `[_TT_${cs(fine - inizio)}]`, offsets: { from: ms(fine), to: ms(fine) }, id: 50400, p: 0.1, t_dtw: -1 },
  ];
}

const json = {
  result: { language: val('-l') },
  transcription: frasi.map(([i, f, t, pezzi]) => ({ offsets: { from: ms(i), to: ms(f) }, text: t, ...(conToken ? { tokens: token(i, f, t, pezzi) } : {}) })),
};
fs.writeFileSync(`${uscita}.json`, JSON.stringify(json));
