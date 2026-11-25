// Progetti del montatore: il materiale di un servizio fotografico/video caricato UNA volta e usato per tutto il mese.
// Un progetto vive in /dati/progetti/<id>/ e scade PROGETTO_DURATA_ORE dopo l'ultimo uso (di serie 72 ore).
//   progetto.json   l'elenco del materiale con le analisi (scene, qualità, parlato)
//   materiale/      i file originali (V01.mov, F01.jpg…)
//   miniature/      una miniatura per scena e per foto (480 px di lato lungo)
import fs from 'node:fs/promises';
import path from 'node:path';
import { nuovoId, RE_ID, scaduto } from './lavori.js';
import { errore } from './errori.js';

export function cartellaProgetti(datiDir) {
  return path.join(datiDir, 'progetti');
}

export async function salvaProgetto(dir, progetto) {
  // Scrittura atomica: chi legge nello stesso momento vede il file vecchio o quello nuovo, mai mezzo.
  const tmp = path.join(dir, `progetto.json.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(progetto));
  await fs.rename(tmp, path.join(dir, 'progetto.json'));
}

export async function creaProgetto(datiDir, { nome = '' } = {}) {
  const id = nuovoId();
  const dir = path.join(cartellaProgetti(datiDir), id);
  await fs.mkdir(path.join(dir, 'materiale'), { recursive: true });
  await fs.mkdir(path.join(dir, 'miniature'), { recursive: true });
  const progetto = { id, nome: String(nome || '').slice(0, 200), creato: new Date().toISOString(), materiali: [] };
  await salvaProgetto(dir, progetto);
  return { dir, progetto };
}

const NON_TROVATO = () => errore(404, 'progetto_non_trovato', 'Il progetto non c\'è: i progetti restano 72 ore dall\'ultimo uso e poi si cancellano, oppure l\'id è sbagliato. Ricomincia dal caricamento del materiale.');

// Apre un progetto e ne rinnova la scadenza (l'ultimo uso è adesso).
export async function apriProgetto(datiDir, id, durataMs) {
  if (typeof id !== 'string' || !RE_ID.test(id)) throw NON_TROVATO();
  const dir = path.join(cartellaProgetti(datiDir), id);
  let st;
  try {
    st = await fs.stat(dir);
  } catch {
    throw NON_TROVATO();
  }
  if (scaduto(st, durataMs)) {
    await fs.rm(dir, { recursive: true, force: true });
    throw NON_TROVATO();
  }
  let progetto;
  try {
    progetto = JSON.parse(await fs.readFile(path.join(dir, 'progetto.json'), 'utf8'));
  } catch {
    throw NON_TROVATO();
  }
  const ora = new Date();
  await fs.utimes(dir, ora, ora).catch(() => {});
  return { dir, progetto };
}

export async function chiudiProgetto(datiDir, id) {
  if (typeof id !== 'string' || !RE_ID.test(id)) throw NON_TROVATO();
  await fs.rm(path.join(cartellaProgetti(datiDir), id), { recursive: true, force: true });
}

// V01, V02… per i video; F01, F02… per le foto; A01, A02… per gli audio (voce fuori campo, musica). Sono i codici che Claude legge sui provini e usa nel piano.
export function prossimoCodice(progetto, tipo) {
  const lettera = tipo === 'video' ? 'V' : tipo === 'audio' ? 'A' : 'F';
  const n = progetto.materiali.filter((m) => m.tipo === tipo).length + 1;
  return `${lettera}${String(n).padStart(2, '0')}`;
}

export function byteProgetto(progetto) {
  return progetto.materiali.reduce((s, m) => s + (Number(m.byte) || 0), 0);
}

export function scadenza(durataMs, ora = Date.now()) {
  return new Date(ora + durataMs).toISOString();
}

// Progetti al lavoro: un contatore per progetto (due richieste insieme sullo stesso progetto contano due).
export class Registro {
  constructor() {
    this.conti = new Map();
  }

  entra(id) {
    this.conti.set(id, (this.conti.get(id) || 0) + 1);
  }

  esce(id) {
    const n = (this.conti.get(id) || 0) - 1;
    if (n > 0) this.conti.set(id, n);
    else this.conti.delete(id);
  }

  has(id) {
    return (this.conti.get(id) || 0) > 0;
  }
}

// Cancella i progetti fermi da più della loro durata (come i lavori, ma con la scadenza dei progetti).
export async function pulisciProgetti(datiDir, durataMs, attivi = new Set()) {
  const base = cartellaProgetti(datiDir);
  let voci = [];
  try {
    voci = await fs.readdir(base);
  } catch {
    return 0;
  }
  let cancellati = 0;
  const ora = Date.now();
  for (const voce of voci) {
    if (attivi.has(voce)) continue;
    const dir = path.join(base, voce);
    try {
      const st = await fs.stat(dir);
      if (scaduto(st, durataMs, ora)) {
        await fs.rm(dir, { recursive: true, force: true });
        cancellati += 1;
      }
    } catch {
      // già sparito
    }
  }
  return cancellati;
}
