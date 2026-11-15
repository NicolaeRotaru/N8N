// Errori dell'officina: sempre { errore: codice, messaggio: frase in italiano semplice }.
export class ErroreOfficina extends Error {
  constructor(stato, codice, messaggio) {
    super(messaggio);
    this.stato = stato;
    this.codice = codice;
    this.messaggio = messaggio;
  }
}

export const errore = (stato, codice, messaggio) => new ErroreOfficina(stato, codice, messaggio);

export const nonValido = (codice, messaggio) => new ErroreOfficina(400, codice, messaggio);

// Traduce gli errori interni (Fastify, multipart, sharp, ffmpeg) nel formato del contratto.
export function traduciErrore(e) {
  if (e instanceof ErroreOfficina) return e;
  switch (e?.code) {
    case 'FST_REQ_FILE_TOO_LARGE':
      return errore(413, 'file_troppo_grande', 'Un file supera il limite di 300 MB.');
    case 'FST_FILES_LIMIT':
    case 'FST_PARTS_LIMIT':
      return errore(400, 'troppi_file', 'La richiesta contiene troppi file.');
    case 'FST_FIELDS_LIMIT':
      return errore(400, 'troppi_campi', 'La richiesta contiene troppi campi di testo: al massimo 40, compreso «dati».');
    case 'FST_INVALID_MULTIPART_CONTENT_TYPE':
    case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
      return errore(415, 'serve_multipart', 'La richiesta deve essere multipart/form-data con il campo «dati» e i file.');
    case 'FST_ERR_CTP_EMPTY_JSON_BODY':
    case 'FST_ERR_CTP_INVALID_CONTENT_LENGTH':
      return errore(400, 'richiesta_non_valida', 'La richiesta non è leggibile.');
    default:
      break;
  }
  if (e?.statusCode === 413) return errore(413, 'richiesta_troppo_grande', 'La richiesta è troppo grande.');
  if (e?.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
    return errore(e.statusCode, 'richiesta_non_valida', 'La richiesta non è valida.');
  }
  if (e?.name === 'AbortError' || e?.annullato) return errore(499, 'annullato', 'Il lavoro è stato annullato perché la richiesta si è chiusa.');
  return errore(500, 'errore_interno', "Qualcosa è andato storto nell'officina. Riprova; se succede ancora, guarda i log del servizio.");
}
