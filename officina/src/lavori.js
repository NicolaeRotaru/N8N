// Cartelle dei lavori su /dati e pulizia automatica dei file più vecchi di 24 ore.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const RE_ID = /^[a-f0-9]{20}$/;
export const RE_NOME_FILE = /^[a-z0-9][a-z0-9._-]{0,80}$/i;

export const nuovoId = () => crypto.randomBytes(10).toString('hex');

export function cartellaLavori(datiDir) {
  return path.join(datiDir, 'lavori');
}

export async function creaLavoro(datiDir) {
  const id = nuovoId();
  const dir = path.join(cartellaLavori(datiDir), id);
  const dirIn = path.join(dir, 'in');
  const dirTmp = path.join(dir, 'tmp');
  const dirOut = path.join(dir, 'out');
  await fs.mkdir(dirIn, { recursive: true });
  await fs.mkdir(dirTmp, { recursive: true });
  await fs.mkdir(dirOut, { recursive: true });
  return { id, dir, dirIn, dirTmp, dirOut };
}

// Dopo la fine del lavoro: si tengono solo i file prodotti, la scadenza parte da adesso.
export async function chiudiLavoro(lavoro) {
  await fs.rm(lavoro.dirIn, { recursive: true, force: true });
  await fs.rm(lavoro.dirTmp, { recursive: true, force: true });
  const ora = new Date();
  await fs.utimes(lavoro.dir, ora, ora);
}

export async function eliminaLavoro(lavoro) {
  await fs.rm(lavoro.dir, { recursive: true, force: true });
}

export function scaduto(statDir, durataMs, ora = Date.now()) {
  return ora - statDir.mtimeMs > durataMs;
}

// Percorso del file prodotto, oppure null se non esiste o è scaduto (in quel caso lo cancella).
export async function trovaFile(datiDir, id, nome, durataMs) {
  if (!RE_ID.test(id) || !RE_NOME_FILE.test(nome) || nome.includes('..')) return null;
  const dir = path.join(cartellaLavori(datiDir), id);
  let st;
  try {
    st = await fs.stat(dir);
  } catch {
    return null;
  }
  if (scaduto(st, durataMs)) {
    await fs.rm(dir, { recursive: true, force: true });
    return null;
  }
  const percorso = path.join(dir, 'out', nome);
  try {
    const sf = await fs.stat(percorso);
    return sf.isFile() ? { percorso, byte: sf.size } : null;
  } catch {
    return null;
  }
}

// Cancella le cartelle dei lavori più vecchie della durata (mtime della cartella del lavoro).
export async function pulisci(datiDir, durataMs, lavoriAttivi = new Set()) {
  const base = cartellaLavori(datiDir);
  let voci = [];
  try {
    voci = await fs.readdir(base);
  } catch {
    return 0;
  }
  let cancellati = 0;
  const ora = Date.now();
  for (const voce of voci) {
    if (lavoriAttivi.has(voce)) continue;
    const dir = path.join(base, voce);
    try {
      const st = await fs.stat(dir);
      if (scaduto(st, durataMs, ora)) {
        await fs.rm(dir, { recursive: true, force: true });
        cancellati += 1;
      }
    } catch {
      // già sparita
    }
  }
  return cancellati;
}
