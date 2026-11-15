#!/usr/bin/env node
// Finto whisper-vad-speech-segments per le prove: stessi argomenti e stessa stampa del vero
// («Speech segment 0: start = 298.00, end = 502.00», centesimi di secondo), zone calcolate dall'energia.
import fs from 'node:fs';
import { trattiConSuono } from './suono-wav.mjs';

const a = process.argv.slice(2);
const wav = a[a.indexOf('-f') + 1];
if (process.env.FINTO_VAD_REGISTRO) fs.appendFileSync(process.env.FINTO_VAD_REGISTRO, `${JSON.stringify(a)}\n`);
const tratti = trattiConSuono(fs.readFileSync(wav));
process.stderr.write(`read_audio_data: reading audio data from '${wav}' ...\n`);
let out = `\nDetected ${tratti.length} speech segments:\n`;
tratti.forEach(([i, f], n) => {
  out += `Speech segment ${n}: start = ${(i * 100).toFixed(2)}, end = ${(f * 100).toFixed(2)}\n`;
});
process.stdout.write(`${out}\n`);
