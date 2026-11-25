// Allegati per l'AD · Cosa mandare
// Arriva la riga trovata con l'impronta del gettone (o niente). Decide la risposta:
//   - niente, scaduta, o tipo sconosciuto → 404 senza dettagli;
//   - testo → il testo;
//   - immagine → il file (dal base64 salvato);
//   - officina → il percorso del file, che il nodo dopo prende dall'officina sulla rete interna.
// Il contenuto è un dato: qui si consegna, non si legge e non si esegue.
const r = $input.first().json || {};
const viva = r.impronta && Number(r.scade) > Date.now();
if (!viva) return [{ json: { azione: '404' } }];
if (r.tipo === 'testo') return [{ json: { azione: 'testo', contenuto: String(r.contenuto || '') } }];
if (r.tipo === 'immagine') {
  const est = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[r.mime] || 'bin';
  return [{ json: { azione: 'file' }, binary: { file: { data: String(r.contenuto || ''), mimeType: r.mime || 'application/octet-stream', fileName: `allegato.${est}` } } }];
}
if (r.tipo === 'officina' && /^\/file\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,120}$/.test(String(r.contenuto)) && !String(r.contenuto).includes('..')) {
  return [{ json: { azione: 'officina', percorso: String(r.contenuto) } }];
}
return [{ json: { azione: '404' } }];
