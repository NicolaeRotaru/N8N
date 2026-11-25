// (esecuzione «monta») I 6 fotogrammi del video finito → Claude dice se si può proporre al cliente.
const J = $('Config').first().json;
const c = J.contenuto;
const b64 = testo(($input.first().json || {}).base64);
// il giudizio è sulla moodboard di Scatti di G, punto per punto, con un voto (lo legge il team sulla scheda di Telegram)
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
const r = c.regia || {};
const scheda = '<scheda>\ntipo: ' + NOMI_TIPO[c.tipo] + '\ntitolo per il team: ' + dato(c.titolo) + '\nidea: ' + dato(c.idea)
  + '\ntitolo sopra il video: ' + (dato(c.intro || r.titolo) || 'nessuno') + '\ncartello finale: ' + (dato(c.outro || r.chiusura) || 'nessuno')
  + (Number(c.durata) > 0 ? '\ndurata: ' + virgola(Number(c.durata)) + ' s' : '') + '\n</scheda>';
return [{ json: { corpo: corpoClaude(J, { effort: J.EFFORT_CONTROLLO || 'medium', max_tokens: 1500, schema, sistema: PROMPT_CONTROLLO, immagini: b64 ? [b64] : [], testo: scheda }) } }];
