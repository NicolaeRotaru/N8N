// (esecuzione «monta») Un elemento per file da portare su Drive, con il nome leggibile.
const J = $('Config').first().json;
const E = $('Esito del montaggio').first().json;
if (!E.ok) return [{ json: { salta: true } }];
const c = J.contenuto;
const pulito = (s) => testo(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'contenuto';
// una versione ritoccata da una correzione su Telegram porta « · v2», « · v3»: la prima resta su Drive
const versione = Number(J.versione) > 1 ? ' · v' + Number(J.versione) : '';
const base = c.data + ' ' + testo(c.ora).replace(':', '') + ' · ' + NOMI_TIPO[c.tipo] + ' · ' + pulito(c.titolo) + versione;
const immagini = E.file.filter((f) => f.tipo === 'immagine');
return E.file.map((f) => {
  let nome;
  if (f.tipo === 'video') nome = base + '.mp4';
  else if (f.tipo === 'copertina') nome = base + ' (copertina).jpg';
  else nome = base + (immagini.length > 1 ? ' ' + (immagini.indexOf(f) + 1) : '') + '.jpg';
  return { json: { tipo: f.tipo, percorso: f.percorso, nome_file: nome } };
});
