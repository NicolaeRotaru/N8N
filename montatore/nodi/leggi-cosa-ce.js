// Le descrizioni dell'AD entrano nel catalogo; poi la domanda per il piano del mese.
const J = $('Config').first().json;
const cat = $('Officina: catalogo').first().json;
const descr = {};
let falliti = 0;
let gruppi = 0;
const motivi = [];
// gli avvisi dell'AD (es. «un allegato non si apre») arrivano al team nel riepilogo finale
const avvisiAD = [];
for (const it of $input.all()) {
  gruppi++;
  for (const a of (it.json && Array.isArray(it.json.avvisi) ? it.json.avvisi : [])) avvisiAD.push(accorcia(testo(a && (a.messaggio || a)), 200));
  const x = leggiClaude(it.json, (d) => Array.isArray(d.scene));
  if (!x.ok) { falliti++; motivi.push(x.motivo); continue; }
  for (const s of (x.dati.scene || [])) {
    const k = testo(s.codice).toUpperCase();
    if (k) descr[k] = { cosa: accorcia(dato(s.cosa_si_vede), 140), soggetto: testo(s.soggetto), inquadratura: ['largo', 'medio', 'dettaglio', 'volto'].includes(testo(s.inquadratura)) ? testo(s.inquadratura) : '', valore: Math.max(1, Math.min(5, intero(s.valore, 3))), aggancio: !!s.aggancio, problemi: (s.problemi || []).map(dato).filter(Boolean).slice(0, 4) };
  }
}
const arricchito = testo(cat.testo).split('\n').map((r) => {
  const k = r.trim().split(/\s/)[0];
  const d = descr[k];
  if (!d) return r;
  return r + ' · vede: «' + d.cosa + '» · ' + d.soggetto + (d.inquadratura ? ' · ' + d.inquadratura : '') + ' · valore ' + d.valore + '/5' + (d.aggancio ? ' · aggancio' : '') + (d.problemi.length ? ' · problemi: ' + d.problemi.join(', ') : '');
}).join('\n');
const mese = J.mese;
const oggi = partiRoma();
// Le idee del workflow 03 (piano pensato prima del servizio, righe «PI-…» in stato «idea» nel Calendario) per questo
// cliente e questo mese: entrano nel piano come traccia. Restano com'erano nel foglio: il montatore non le tocca.
const cal = $('Leggi il Calendario').isExecuted ? $('Leggi il Calendario').first().json : {};
const idee = (cal && Array.isArray(cal.values) ? righeFoglio(cal) : [])
  // il mese dalla cella data_ora, scritta dal 03 («2026-12-04 18:30») o formattata dal foglio («04/12/2026 18:30»): se
  // l'idea è stata spostata a mano, conta la data nuova. Solo se la cella non si legge, la data di quando il 03 l'ha
  // creata, scritta nell'id (PI-<cliente>-AAAAMMGG-hhmm).
  .filter((r) => {
    const d = testo(r.data_ora).trim();
    const iso = d.match(/^(\d{4})-(\d{1,2})-\d{1,2}\b/);
    const it = d.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})\b/);
    const id = testo(r.id).match(/-(\d{4})(\d{2})\d{2}-\d{4}$/);
    const due = (n) => String(Number(n)).padStart(2, '0');
    const meseRiga = iso ? iso[1] + '-' + due(iso[2]) : it ? it[2] + '-' + due(it[1]) : id ? id[1] + '-' + id[2] : '';
    return testo(r.id).startsWith('PI-') && norm(r.stato) === 'idea' && testo(r.cliente) === testo(J.cliente.cliente) && meseRiga === mese.chiave;
  })
  .slice(0, 80);
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
  '<idee_del_piano>' + (idee.length ? '\n' + idee.map((r) => '- ' + testo(r.data_ora) + ' · ' + testo(r.tipo) + ' · ' + dato(accorcia(testo(r.brief), 300))).join('\n') + '\n' : 'nessuna') + '</idee_del_piano>',
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
          // reel e storia_video: la regia di Scatti di G (per gli altri tipi battute vuote)
          regia: SCHEMA_REGIA,
          foto: { type: 'array', items: { type: 'string' } },
          intro: { type: 'string' },
          outro: { type: 'string' },
          righe: { type: 'array', items: { type: 'object', properties: { testo: { type: 'string' }, ruolo: { type: 'string', enum: ['titolo', 'sotto'] } }, required: ['testo', 'ruolo'], additionalProperties: false } },
          musica: { type: 'boolean' },
          didascalia: { type: 'string' },
        },
        required: ['tipo', 'data', 'ora', 'titolo', 'idea', 'perche', 'pezzi', 'regia', 'foto', 'intro', 'outro', 'righe', 'musica', 'didascalia'],
        additionalProperties: false,
      },
    },
    note_per_il_team: { type: 'string' },
  },
  required: ['contenuti', 'note_per_il_team'],
  additionalProperties: false,
};
// Quante scene l'AD ha descritto davvero, fra quelle che gli abbiamo chiesto. Se NESSUNA, il piano non si chiede: sarebbe
// scritto senza aver visto il materiale. Succede quando la corsa fallisce, ma anche quando l'AD risponde «ok» senza aver
// potuto aprire i provini (le sue istruzioni gli dicono di lavorare senza e di scriverlo negli avvisi). Niente corsa
// sprecata: «Leggi il piano» ferma il giro e dice perché. Sotto il 60% delle scene, un avviso nel riepilogo.
const domande = $('Domande sul materiale').isExecuted ? $('Domande sul materiale').all().map((x) => x.json || {}) : [];
// le scene chieste: i codici delle domande (se il nodo non c'è, quelli delle scene e delle foto nel catalogo)
const daCatalogo = () => testo(cat.testo).split('\n').map((r) => r.trim().split(/\s/)[0].toUpperCase()).filter((k) => /^(V\d+\.\d+|F\d+)$/.test(k));
const chieste = new Set(domande.length ? domande.flatMap((d) => (Array.isArray(d.codici) ? d.codici : []).map((k) => testo(k).toUpperCase())) : daCatalogo());
const viste = chieste.size ? Object.keys(descr).filter((k) => chieste.has(k)).length : Object.keys(descr).length;
const fermati = (motivo) => [{ json: { corpo: null, testo_utente: testoUtente, descritte: 0, gruppi, gruppi_falliti: falliti, avvisi_ad: [...new Set(avvisiAD)], fermo: motivo } }];
if (domande.length && domande[0].vuoto) return fermati("nessun provino ha un percorso dell'officina che l'AD possa aprire (è un problema dei file, non dell'AD: segnalatelo, «rifai» da solo non basta)");
if (gruppi > 0 && viste === 0) {
  if (falliti === gruppi) return fermati("l'AD non ha potuto guardare il materiale (" + gruppi + (gruppi === 1 ? ' domanda senza risposta: ' : ' domande su ' + gruppi + ' senza risposta: ') + accorcia(testo(motivi[0]), 200) + ')');
  return fermati("l'AD ha risposto ma non ha descritto nessuna scena" + (chieste.size ? ' su ' + chieste.size : '') + (avvisiAD.length ? ' («' + accorcia(avvisiAD[0], 160) + '»)' : ': forse non ha potuto aprire i provini'));
}
const avvisi = [...new Set(avvisiAD)];
if (chieste.size && viste < chieste.size * 0.6) avvisi.unshift("L'AD ha descritto " + viste + ' scene su ' + chieste.size + ': il piano è scritto senza vedere le altre' + (falliti ? ' (' + accorcia(testo(motivi[0]), 160) + ')' : '') + '.');
else if (falliti) avvisi.unshift("L'AD ha guardato " + (gruppi - falliti) + ' gruppi di provini su ' + gruppi + ': il piano è scritto senza vedere le scene degli altri (' + accorcia(testo(motivi[0]), 160) + ').');
const corpo = corpoClaude(J, { effort: J.EFFORT_PIANO || 'high', max_tokens: 32000, schema: schemaPiano, sistema: PROMPT_PIANO, testo: testoUtente });
return [{ json: { corpo, testo_utente: testoUtente, descritte: viste, gruppi, gruppi_falliti: falliti, avvisi_ad: avvisi, idee_03: idee.map((r) => testo(r.id)) } }];
