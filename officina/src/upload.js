// Riceve una richiesta multipart: il campo 'dati' (JSON) + i file, scritti su disco con i limiti del contratto.
import fs from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { errore, nonValido } from './errori.js';

function nomePulito(nome) {
  const base = path.basename(String(nome || 'file'));
  return base.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120) || 'file';
}

function estensione(nome) {
  const e = path.extname(nome).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(e) ? e : '';
}

export const MAX_FILE = 40;
export const MAX_CAMPI_TESTO = 40;

// spec = { foto: { min: 1, max: 1 }, logo: { min: 0, max: 1 } }
export async function riceviUpload(req, dirIn, spec, cfg) {
  const file = {};
  let dati = {};
  let totale = 0;
  const campiAmmessi = Object.keys(spec);
  // Campi di testo: fino a 40, compreso «dati». Quelli diversi da «dati» si ignorano: i workflow mandano
  // segnaposto vuoti (es. campo_vuoto_3) per i posti liberi, e un provino da 12 foto può averne 11.
  const parti = req.parts({
    limits: {
      fileSize: cfg.maxFileByte,
      files: MAX_FILE,
      fields: MAX_CAMPI_TESTO,
      fieldSize: 2 * 1024 * 1024,
      parts: MAX_FILE + MAX_CAMPI_TESTO,
    },
  });
  for await (const parte of parti) {
    if (parte.type === 'file') {
      const regola = spec[parte.fieldname];
      if (!regola) {
        parte.file.resume();
        throw nonValido('campo_sconosciuto', `Il file nel campo «${parte.fieldname}» non serve qui. Campi file accettati: ${campiAmmessi.join(', ')}.`);
      }
      const lista = (file[parte.fieldname] ??= []);
      if (lista.length >= regola.max) {
        parte.file.resume();
        throw nonValido('troppi_file', `Nel campo «${parte.fieldname}» si possono mandare al massimo ${regola.max} file.`);
      }
      const nome = nomePulito(parte.filename);
      const destinazione = path.join(dirIn, `${parte.fieldname}-${lista.length}${estensione(nome)}`);
      const contatore = new Transform({
        transform(pezzo, _enc, cb) {
          totale += pezzo.length;
          if (totale > cfg.maxTotaleByte) cb(errore(413, 'richiesta_troppo_grande', 'I file insieme superano il limite di 800 MB per richiesta.'));
          else cb(null, pezzo);
        },
      });
      await pipeline(parte.file, contatore, fs.createWriteStream(destinazione));
      if (parte.file.truncated) throw errore(413, 'file_troppo_grande', `Il file «${nome}» supera il limite di 300 MB.`);
      const { size } = await stat(destinazione);
      if (size === 0) throw nonValido('file_vuoto', `Il file «${nome}» è vuoto.`);
      lista.push({ percorso: destinazione, nome, byte: size, tipo: parte.mimetype });
    } else if (parte.fieldname === 'dati') {
      const testo = String(parte.value ?? '').trim();
      if (testo) {
        try {
          dati = JSON.parse(testo);
        } catch {
          throw nonValido('dati_non_validi', 'Il campo «dati» non è un JSON valido.');
        }
      }
      if (dati === null || typeof dati !== 'object' || Array.isArray(dati)) {
        throw nonValido('dati_non_validi', 'Il campo «dati» deve essere un oggetto JSON, per esempio {}.');
      }
    }
  }
  for (const [campo, regola] of Object.entries(spec)) {
    const n = file[campo]?.length ?? 0;
    if (n < regola.min) {
      throw nonValido('file_mancante', regola.min === 1
        ? `Manca il file nel campo «${campo}».`
        : `Nel campo «${campo}» servono almeno ${regola.min} file (ne sono arrivati ${n}).`);
    }
  }
  return { dati, file };
}
