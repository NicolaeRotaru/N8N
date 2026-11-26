// Le domande all'AD «che cosa c'è nel materiale»: i provini a gruppi (al massimo PROVINI_PER_DOMANDA immagini per
// domanda), ognuno con le righe del catalogo dei suoi codici. I provini non si scaricano: all'AD arriva il loro
// percorso nell'officina (lo scarica lui dall'indirizzo degli allegati). Tutte le domande vanno in una corsa sola.
const J = $('Config').first().json;
const cat = $('Officina: catalogo').first().json;
// un provino senza percorso, o con un percorso che gli allegati dell'AD non accettano (/file/<lavoro>/<file>), si salta
// con i suoi codici: altrimenti fermerebbe la corsa di tutti gli altri
const VIA_OFFICINA = /^\/file\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,120}$/;
const viaAD = (p) => { const t = testo(p); const v = t.startsWith('/file/') ? t : '/file/' + t.replace(/^\/+/, ''); return VIA_OFFICINA.test(v) && !v.includes('..'); };
const lista = $('Provini da scaricare').all().map((x) => x.json).filter((p) => testo(p.percorso) && viaAD(p.percorso));
// fra 6 e 10: con meno immagini per domanda le domande diventano tante, e la corsa supera i 64 KB della routine
const perDomanda = Math.max(6, Math.min(10, intero(J.PROVINI_PER_DOMANDA, 10)));
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
lista.forEach((p) => {
  if (!cur || cur.percorsi.length >= perDomanda) { cur = { percorsi: [], codici: [] }; gruppi.push(cur); }
  cur.percorsi.push(testo(p.percorso));
  cur.codici.push(...(p.codici || []));
});
if (!gruppi.length) return [{ json: { vuoto: true } }];
return gruppi.map((g, i) => ({ json: {
  gruppo: i + 1,
  codici: g.codici,
  percorsi: g.percorsi,
  corpo: corpoClaude(J, {
    effort: J.EFFORT_CAPIRE,
    max_tokens: Math.min(32000, 1500 + g.codici.length * 160),
    schema,
    sistema: PROMPT_CAPIRE,
    // un segnaposto per immagine: le immagini vere arrivano all'AD come allegati, dai percorsi qui sopra
    immagini: g.percorsi.map(() => ''),
    testo: contesto + '\n\n<catalogo>\n' + righePer(g.codici) + '\n</catalogo>\n\nCodici da descrivere in questi provini (una voce per ognuno): ' + g.codici.join(', '),
  }),
} }));
