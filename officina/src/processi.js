// Lancia programmi esterni (ffmpeg, ffprobe, whisper) senza shell, con timeout e annullamento.
import { spawn } from 'node:child_process';

export const processiAttivi = new Set();

export function esegui(comando, argomenti, { cwd, timeoutMs = 20 * 60 * 1000, segnale, maxStdout = 16 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    if (segnale?.aborted) {
      const e = new Error('annullato');
      e.annullato = true;
      reject(e);
      return;
    }
    const figlio = spawn(comando, argomenti, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    processiAttivi.add(figlio);
    const pezzi = [];
    let byteOut = 0;
    let stderr = '';
    let scaduto = false;
    figlio.stdout.on('data', (d) => {
      byteOut += d.length;
      if (byteOut <= maxStdout) pezzi.push(d);
    });
    figlio.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    const timer = setTimeout(() => {
      scaduto = true;
      figlio.kill('SIGKILL');
    }, timeoutMs);
    const annulla = () => figlio.kill('SIGKILL');
    segnale?.addEventListener('abort', annulla, { once: true });
    const fine = () => {
      clearTimeout(timer);
      segnale?.removeEventListener('abort', annulla);
      processiAttivi.delete(figlio);
    };
    figlio.on('error', (e) => {
      fine();
      reject(e);
    });
    figlio.on('close', (codice, sigla) => {
      fine();
      if (codice === 0) {
        resolve({ stdout: Buffer.concat(pezzi), stderr });
        return;
      }
      const e = new Error(`${comando} è uscito con ${codice ?? sigla}${scaduto ? ' (tempo scaduto)' : ''}`);
      e.stderr = stderr;
      e.scaduto = scaduto;
      if (segnale?.aborted) e.annullato = true;
      reject(e);
    });
  });
}
