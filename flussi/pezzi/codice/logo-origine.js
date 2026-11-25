// 92 · Logo del cliente — da dove arriva il logo.
// Entra: { drive_id | logo_drive_id, url | logo_url, campo }. drive_id può essere anche un link di Drive.
const d = $input.first().json || {};
const testo = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const idDaLink = (voce) => {
  const t = testo(voce);
  const m = t.match(/\/d\/([A-Za-z0-9_-]{10,})/) || t.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(t) ? t : '';
};
const drive = idDaLink(d.drive_id || d.logo_drive_id);
const url = testo(d.url || d.logo_url);
const campo = /^[A-Za-z_][\w]*$/.test(testo(d.campo)) ? testo(d.campo) : 'logo';
let origine = 'nessuno';
if (drive) origine = 'drive';
else if (/^https:\/\/\S+$/i.test(url)) origine = 'url';
return [{ json: { origine, drive_id: drive, url: origine === 'url' ? url : '', campo, url_scartato: !drive && url && origine !== 'url' ? url : '' } }];
