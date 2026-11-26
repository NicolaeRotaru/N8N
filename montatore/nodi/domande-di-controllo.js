// (giro) Il controllo dei video finiti sulla moodboard, tutti insieme in UNA corsa dell'AD a fine giro (non uno alla
// volta: la routine accetta poche corse al giorno, per tutti i flussi insieme). Solo i reel, al massimo MAX_CONTROLLI:
// sono i contenuti che contano di più, e così la richiesta sta nei 64 KB della routine. Gli altri restano «non
// controllato» (li guardate voi su Telegram). L'AD guarda il provino dei fotogrammi, preso dall'officina.
const J = $('Config').first().json;
const MAX_CONTROLLI = 12;
const esiti = $input.all().map((x) => x.json || {});
const PUNTI = ['immagini', 'luce', 'testi', 'racconto', 'decoro'];
const schema = {
  type: 'object',
  properties: {
    punti: { type: 'array', items: { type: 'object', properties: { punto: { type: 'string', enum: PUNTI }, ok: { type: 'boolean' }, nota: { type: 'string' } }, required: ['punto', 'ok', 'nota'], additionalProperties: false } },
    voto: { type: 'integer' },
    esito: { type: 'string', enum: ['ok', 'da_rivedere'] },
    motivo: { type: 'string' },
  },
  required: ['punti', 'voto', 'esito', 'motivo'],
  additionalProperties: false,
};
const daControllare = siNo(J.USA_CONTROLLO, true)
  ? esiti.map((e, indice) => ({ e, indice })).filter(({ e }) => e.ok && testo(e.fotogrammi) && e.contenuto && e.contenuto.tipo === 'reel').slice(0, MAX_CONTROLLI)
  : [];
if (!daControllare.length) return [{ json: { nessuno: true } }];
return daControllare.map(({ e, indice }) => {
  const c = e.contenuto;
  const r = c.regia || {};
  const scheda = '<scheda>\ntipo: ' + NOMI_TIPO[c.tipo] + '\ntitolo per il team: ' + dato(c.titolo) + '\nidea: ' + dato(c.idea)
    + '\ntitolo sopra il video: ' + (dato(c.intro || r.titolo) || 'nessuno') + '\ncartello finale: ' + (dato(c.outro || r.chiusura) || 'nessuno')
    + (Number(c.durata) > 0 ? '\ndurata: ' + virgola(Number(c.durata)) + ' s' : '') + '\n</scheda>';
  return { json: { indice, percorsi: [testo(e.fotogrammi)],
    corpo: corpoClaude(J, { effort: J.EFFORT_CONTROLLO || 'medium', max_tokens: 1500, schema, sistema: PROMPT_CONTROLLO, immagini: [''], testo: scheda }) } };
});
