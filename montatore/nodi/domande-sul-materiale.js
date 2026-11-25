// Le domande a Claude «che cosa c'è nel materiale»: i provini a gruppi (al massimo PROVINI_PER_DOMANDA immagini
// e ~20 MB per richiesta), ognuno con le righe del catalogo dei suoi codici.
const J = $('Config').first().json;
const cat = $('Officina: catalogo').first().json;
const lista = $('Provini da scaricare').all().map((x) => x.json);
const immagini = $input.all().map((x) => testo(x.json && x.json.base64));
const perDomanda = Math.max(1, Math.min(10, intero(J.PROVINI_PER_DOMANDA, 6)));
const righeCatalogo = testo(cat.testo).split('\n');
// righe del catalogo per un insieme di codici: le righe delle scene/foto + la riga del loro video
function righePer(codici) {
  const voluti = new Set(codici);
  const video = new Set(codici.filter((k) => k.includes('.')).map((k) => k.split('.')[0]));
  return righeCatalogo.filter((r) => {
    const k = r.trim().split(/\s/)[0];
    return voluti.has(k) || video.has(k);
  }).join('\n');
}
const scheda = J.cliente.scheda || {};
const contesto = '<cliente>\nLocale: ' + dato(J.cliente.nome_locale) + (scheda.tipo_locale || scheda.categoria ? ' (' + dato(scheda.tipo_locale || scheda.categoria) + ')' : '')
  + (scheda.descrizione ? '\nDescrizione: ' + dato(scheda.descrizione) : '') + (scheda.menu_testo ? '\nMenu (per riconoscere i piatti): ' + dato(accorcia(scheda.menu_testo, 2500)) : '') + '\n</cliente>';
const schema = {
  type: 'object',
  properties: {
    scene: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          codice: { type: 'string' },
          cosa_si_vede: { type: 'string' },
          soggetto: { type: 'string', enum: ['piatto', 'drink', 'preparazione', 'prodotto', 'persone', 'staff', 'ambiente_interno', 'esterno', 'dettaglio', 'evento', 'altro'] },
          // la grammatica della moodboard: largo (dove siamo) → medio (chi e cosa) → dettaglio (il gesto)
          inquadratura: { type: 'string', enum: ['largo', 'medio', 'dettaglio', 'volto'] },
          valore: { type: 'integer' },
          aggancio: { type: 'boolean' },
          problemi: { type: 'array', items: { type: 'string' } },
        },
        required: ['codice', 'cosa_si_vede', 'soggetto', 'inquadratura', 'valore', 'aggancio', 'problemi'],
        additionalProperties: false,
      },
    },
  },
  required: ['scene'],
  additionalProperties: false,
};
const gruppi = [];
let cur = null;
lista.forEach((p, i) => {
  const b64 = immagini[i];
  if (!b64) return;
  if (!cur || cur.immagini.length >= perDomanda || cur.byte + b64.length > 20 * 1024 * 1024) { cur = { immagini: [], codici: [], byte: 0 }; gruppi.push(cur); }
  cur.immagini.push(b64);
  cur.codici.push(...(p.codici || []));
  cur.byte += b64.length;
});
if (!gruppi.length) return [{ json: { vuoto: true } }];
return gruppi.map((g, i) => ({ json: {
  gruppo: i + 1,
  codici: g.codici,
  corpo: corpoClaude(J, {
    effort: J.EFFORT_CAPIRE,
    max_tokens: Math.min(32000, 1500 + g.codici.length * 160),
    schema,
    sistema: PROMPT_CAPIRE,
    immagini: g.immagini,
    testo: contesto + '\n\n<catalogo>\n' + righePer(g.codici) + '\n</catalogo>\n\nCodici da descrivere in questi provini (una voce per ognuno): ' + g.codici.join(', '),
  }),
} }));
