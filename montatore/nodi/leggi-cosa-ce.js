// Le descrizioni di Claude entrano nel catalogo; poi la domanda per il piano del mese.
const J = $('Config').first().json;
const cat = $('Officina: catalogo').first().json;
const descr = {};
let falliti = 0;
let gruppi = 0;
for (const it of $input.all()) {
  gruppi++;
  const x = leggiClaude(it.json);
  if (!x.ok) { falliti++; continue; }
  for (const s of (x.dati.scene || [])) {
    const k = testo(s.codice).toUpperCase();
    if (k) descr[k] = { cosa: accorcia(dato(s.cosa_si_vede), 140), soggetto: testo(s.soggetto), valore: Math.max(1, Math.min(5, intero(s.valore, 3))), aggancio: !!s.aggancio, problemi: (s.problemi || []).map(dato).filter(Boolean).slice(0, 4) };
  }
}
const arricchito = testo(cat.testo).split('\n').map((r) => {
  const k = r.trim().split(/\s/)[0];
  const d = descr[k];
  if (!d) return r;
  return r + ' · vede: «' + d.cosa + '» · ' + d.soggetto + ' · valore ' + d.valore + '/5' + (d.aggancio ? ' · aggancio' : '') + (d.problemi.length ? ' · problemi: ' + d.problemi.join(', ') : '');
}).join('\n');
const mese = J.mese;
const oggi = partiRoma();
const fest = festivita(mese.anno, mese.mese);
const scheda = J.cliente.scheda || {};
const righeScheda = Object.keys(scheda).map((k) => k + ': ' + dato(scheda[k]));
const testoUtente = [
  '<cliente>', 'nome del locale: ' + dato(J.cliente.nome_locale), ...righeScheda, '</cliente>',
  '',
  '<mese>',
  mese.nome + ' (' + mese.chiave + '), ' + mese.giorni + ' giorni. Il giorno 1 è ' + GIORNI[giornoSettimana(mese.anno, mese.mese, 1)] + '. Oggi è ' + oggi.data + ': niente date già passate.',
  'Festività del mese: ' + (fest.length ? fest.map((f) => f.giorno + ' ' + f.nome).join('; ') : 'nessuna') + '.',
  '</mese>',
  '',
  '<richiesta>reel: ' + J.richiesta.reel + '; post e caroselli: ' + J.richiesta.post + ' (decidi tu quanti caroselli); storie (video o foto): ' + J.richiesta.storie + '</richiesta>',
  '',
  '<note>' + (dato(J.note) || 'nessuna nota') + '</note>',
  '',
  '<musica>' + (J.musica ? 'c\'è un file musicale con licenza: puoi mettere musica = true nei reel senza parlato' : 'nessun file musicale: musica = false sempre') + '</musica>',
  '',
  '<catalogo>',
  arricchito,
  '</catalogo>',
  '',
  'Scrivi il piano del mese con questo materiale.',
].join('\n');
const schemaPiano = {
  type: 'object',
  properties: {
    contenuti: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['reel', 'storia_video', 'post', 'carosello', 'storia_foto'] },
          data: { type: 'string' },
          ora: { type: 'string' },
          titolo: { type: 'string' },
          idea: { type: 'string' },
          perche: { type: 'string' },
          pezzi: { type: 'array', items: { type: 'object', properties: { scena: { type: 'string' }, inizio: { type: 'number' }, fine: { type: 'number' } }, required: ['scena', 'inizio', 'fine'], additionalProperties: false } },
          foto: { type: 'array', items: { type: 'string' } },
          intro: { type: 'string' },
          outro: { type: 'string' },
          righe: { type: 'array', items: { type: 'object', properties: { testo: { type: 'string' }, ruolo: { type: 'string', enum: ['titolo', 'sotto'] } }, required: ['testo', 'ruolo'], additionalProperties: false } },
          musica: { type: 'boolean' },
          didascalia: { type: 'string' },
        },
        required: ['tipo', 'data', 'ora', 'titolo', 'idea', 'perche', 'pezzi', 'foto', 'intro', 'outro', 'righe', 'musica', 'didascalia'],
        additionalProperties: false,
      },
    },
    note_per_il_team: { type: 'string' },
  },
  required: ['contenuti', 'note_per_il_team'],
  additionalProperties: false,
};
const corpo = corpoClaude(J, { effort: J.EFFORT_PIANO || 'high', max_tokens: 32000, schema: schemaPiano, sistema: PROMPT_PIANO, testo: testoUtente });
return [{ json: { corpo, testo_utente: testoUtente, descritte: Object.keys(descr).length, gruppi, gruppi_falliti: falliti } }];
