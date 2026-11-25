// 92 · Logo del cliente — com'è andata. Esce: { ha_logo, origine, errore } e, se c'è, il file nel campo scelto.
const p = $('Da dove arriva il logo').first().json;
const voce = $input.first() || {};
const file = voce.binary && voce.binary.data;
const err = voce.json && voce.json.error;
const errore = err ? String(err.message || err.description || (typeof err === 'string' ? err : JSON.stringify(err))).slice(0, 300) : '';
if (p.origine !== 'nessuno' && file && !errore) {
  if (file.mimeType && !/^image\//i.test(file.mimeType)) {
    return [{ json: { ha_logo: false, origine: p.origine, errore: `il file del logo non è un'immagine (${file.mimeType})` } }];
  }
  return [{ json: { ha_logo: true, origine: p.origine, errore: '' }, binary: { [p.campo]: file } }];
}
let motivo;
if (p.origine === 'nessuno') motivo = p.url_scartato ? `indirizzo del logo non valido, serve https: ${p.url_scartato}` : 'nella scheda non c\'è un logo';
else motivo = `logo non scaricato da ${p.origine === 'drive' ? 'Drive' : 'internet'}: ${errore || 'file vuoto'}`;
return [{ json: { ha_logo: false, origine: p.origine, errore: motivo } }];
