// (esecuzione «rivedi») Correggi: la nota scritta dal team → la domanda a Claude per riscrivere la regia.
const J = $('Config').first().json;
const E = J.esito || {};
const G = J.giro || {};
const c = E.contenuto || {};
const nome = h((G.cliente || {}).nome_locale) + ' · ' + h(c.titolo);
const r = $input.first().json || {};
const d = r.data && typeof r.data === 'object' ? r.data : {};
const nota = testo(d.text !== undefined ? d.text : Object.values(d).find((x) => typeof x === 'string'));
const v = Number(J.versione) || 1;
const max = Math.max(1, intero(J.MAX_RITOCCHI, 3));
// anche i ritocchi non riusciti contano: ognuno è una domanda a Claude
const falliti = Math.max(0, intero(J.ritocchi_falliti, 0));
const no = (messaggio) => [{ json: { ok: false, messaggio } }];
if (r.error) return no('⚠️ <b>Correzione non arrivata</b> · ' + nome + '\nTelegram non ha accettato la domanda. Il contenuto resta su Drive, non è nel Calendario.');
if (!nota) return no('⏳ <b>Nessuna correzione scritta</b> · ' + nome + '\nIl contenuto resta su Drive, non è nel Calendario.');
const conRegia = c.motore === 'regia' || (c.regia && Array.isArray(c.regia.battute) && c.regia.battute.length > 0);
if (!conRegia) return no('✏️ <b>Da sistemare a mano</b> · ' + nome + '\nLa vostra nota: «' + h(accorcia(nota, 500)) + '». Le foto non si rimontano da qui: il contenuto resta su Drive, non è nel Calendario.');
if (v - 1 + falliti >= max) return no('✋ <b>Già ritoccato ' + (v - 1 + falliti) + ' volte</b> · ' + nome + '\nLa vostra nota: «' + h(accorcia(nota, 500)) + '». Oltre ' + max + ' ritocchi lo sistemate a mano: il contenuto resta su Drive.');
const contenuto = { tipo: c.tipo, data: c.data, ora: c.ora, titolo: c.titolo, idea: c.idea, durata: c.durata, regia: c.regia };
const testoUtente = [
  '<contenuto>', JSON.stringify(contenuto), '</contenuto>', '',
  '<correzione>', nota, '</correzione>', '',
  '<avvisi>', (E.avvisi || []).join('\n') || 'nessuno', '</avvisi>', '',
  testo(G.contesto), '',
  'Riscrivi la regia di questo contenuto applicando la correzione.',
].join('\n');
const schema = {
  type: 'object',
  properties: { regia: SCHEMA_REGIA, data: { type: 'string' }, ora: { type: 'string' }, cosa_ho_cambiato: { type: 'string' }, non_posso: { type: 'string' } },
  required: ['regia', 'data', 'ora', 'cosa_ho_cambiato', 'non_posso'],
  additionalProperties: false,
};
return [{ json: { ok: true, nota, corpo: corpoClaude(J, { effort: J.EFFORT_RITOCCO || 'medium', max_tokens: 16000, schema, sistema: PROMPT_RITOCCO, testo: testoUtente }) } }];
