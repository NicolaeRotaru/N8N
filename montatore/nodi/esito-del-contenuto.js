// (esecuzione «monta») Il contenuto è su Drive: restituisco al giro i link e il giudizio.
const J = $('Config').first().json;
const E = $('Esito del montaggio').first().json;
const c = J.contenuto;
const base = { n: J.n, contenuto: c };
if (!E.ok) return [{ json: { ...base, ok: false, motivo: E.motivo } }];
const elenco = $('File da caricare').all().map((x) => x.json);
const caricati = $input.all().map((x, i) => ({ ...(elenco[i] || {}), id: testo(x.json && x.json.id), errore: x.json && x.json.error ? testo(x.json.error.message || x.json.error) : '' }));
const falliti = caricati.filter((x) => !x.id);
if (falliti.length) return [{ json: { ...base, ok: false, motivo: 'non sono riuscito a caricare su Drive ' + falliti.map((x) => x.nome_file).join(', ') + (falliti[0].errore ? ' (' + accorcia(falliti[0].errore, 200) + ')' : '') } }];
const controllo = $('Leggi il controllo').isExecuted ? $('Leggi il controllo').first().json : { esito: 'non_controllato', motivo: '' };
return [{ json: {
  ...base,
  ok: true,
  file: caricati.map((x) => ({ tipo: x.tipo, id: x.id, nome: x.nome_file, link: linkDrive(x.id) })),
  controllo,
  avvisi: E.avvisi,
} }];
