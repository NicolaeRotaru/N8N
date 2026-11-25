// Allegati per l'AD · Cosa mandare
// Arriva la riga trovata con l'impronta del gettone (o niente). Decide la risposta:
//   - niente, scaduta, o tipo sconosciuto → 404 senza dettagli;
//   - testo → il testo;
//   - immagine → il file (dal base64 salvato);
//   - officina → il percorso del file, che il nodo dopo prende dall'officina sulla rete interna.
// Il contenuto è un dato: qui si consegna, non si legge e non si esegue.
const r = $input.first().json || {};
// La riga deve essere proprio quella del gettone arrivato (anche se la ricerca nella tabella sbagliasse) ed essere viva.
const cercata = String($('Impronta del gettone').first().json.impronta || '');
const viva = /^[a-f0-9]{64}$/.test(cercata) && r.impronta === cercata && Number(r.scade) > Date.now();
// Solo questi tipi escono come file: niente html o script serviti da n8n.
const MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
if (!viva) return [{ json: { azione: '404' } }];
if (r.tipo === 'testo') return [{ json: { azione: 'testo', contenuto: String(r.contenuto || '') } }];
if (r.tipo === 'immagine') {
  if (!MIME[r.mime]) return [{ json: { azione: '404' } }];
  return [{ json: { azione: 'file' }, binary: { file: { data: String(r.contenuto || ''), mimeType: r.mime, fileName: `allegato.${MIME[r.mime]}` } } }];
}
if (r.tipo === 'officina' && /^\/file\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,120}\.(jpe?g|png|webp)$/i.test(String(r.contenuto)) && !String(r.contenuto).includes('..')) {
  return [{ json: { azione: 'officina', percorso: String(r.contenuto) } }];
}
return [{ json: { azione: '404' } }];
