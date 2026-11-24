// Il giro vero (esecuzione separata, lanciata dal modulo): primo messaggio su Telegram.
const J = $('Config').first().json;
const nv = J.file.filter((x) => x.tipo === 'video').length;
const nf = J.file.length - nv;
const prova = norm(J.MODALITA) !== 'attivo';
const righe = [
  '🎬 <b>Montatore</b> · ' + h(J.cliente.nome_locale) + ' · «' + h(J.servizio.nome) + '»',
  'Comincio: carico e guardo ' + nv + ' video e ' + nf + ' foto. Piano di ' + h(J.mese.nome) + ': ' + J.richiesta.reel + ' reel, ' + J.richiesta.post + ' post e caroselli, ' + J.richiesta.storie + ' storie.',
  'Tempo stimato: circa ' + J.stima_minuti + ' minuti.',
];
if (J.musica) righe.push('Musica per i reel senza parlato: «' + h(J.musica.nome) + '».');
if (J.scartati && J.scartati.length) righe.push('Saltati: ' + h(accorcia(J.scartati.join('; '), 800)));
if (prova) righe.push('Modalità <b>prova</b>: metto i contenuti su Drive, nel Calendario non scrivo niente.');
return [{ json: { messaggio: righe.join('\n') } }];
