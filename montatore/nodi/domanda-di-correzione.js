// Il controllo dell'officina ha tolto dei contenuti: si chiede a Claude di riscrivere il piano una volta sola.
const J = $('Config').first().json;
const domanda = $('Leggi cosa c\'è').first().json;
const piano = $('Leggi il piano').first().json.piano;
const ctl = $input.first().json || {};
const problemi = (ctl.problemi || []).filter((p) => p.gravita === 'blocca' || ['ripetizione', 'numeri_diversi', 'stesso_orario'].includes(p.codice)).map((p) => '- ' + dato(p.messaggio));
const corpo = JSON.parse(JSON.stringify(domanda.corpo));
corpo.messages = [{ role: 'user', content: [{ type: 'text', text: domanda.testo_utente
  + '\n\n<piano_precedente>\n' + JSON.stringify(piano) + '\n</piano_precedente>\n\n<problemi_trovati_dal_controllo>\n' + problemi.join('\n') + '\n</problemi_trovati_dal_controllo>\n\n'
  + 'Il controllo automatico ha trovato questi problemi nel piano precedente. Riscrivi il piano COMPLETO correggendoli: tieni i contenuti buoni, sistema o sostituisci quelli tolti, usa solo codici del catalogo e date del mese.' }] }];
return [{ json: { corpo } }];
