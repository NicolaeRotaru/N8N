// (esecuzione «monta») I 6 fotogrammi del video finito → Claude dice se si può proporre al cliente.
const J = $('Config').first().json;
const c = J.contenuto;
const b64 = testo(($input.first().json || {}).base64);
const schema = { type: 'object', properties: { esito: { type: 'string', enum: ['ok', 'da_rivedere'] }, motivo: { type: 'string' } }, required: ['esito', 'motivo'], additionalProperties: false };
const scheda = '<scheda>\ntipo: ' + NOMI_TIPO[c.tipo] + '\ntitolo per il team: ' + dato(c.titolo) + '\nidea: ' + dato(c.idea) + '\ntitolo sopra il video: ' + (dato(c.intro) || 'nessuno') + '\ncartello finale: ' + (dato(c.outro) || 'nessuno') + '\n</scheda>';
return [{ json: { corpo: corpoClaude(J, { effort: J.EFFORT_CONTROLLO || 'medium', max_tokens: 1500, schema, sistema: PROMPT_CONTROLLO, immagini: b64 ? [b64] : [], testo: scheda }) } }];
