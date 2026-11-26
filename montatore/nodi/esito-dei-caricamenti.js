// Tutti i file sono passati dall'officina: quanti sono entrati, quali no, e il messaggio per Telegram.
const J = $('Config').first().json;
const esiti = $input.all().map((x) => x.json || {}).map((x, i) => (x.error && !x.file ? { ok: false, file: (J.file[i] || {}).nome || 'file ' + (i + 1), motivo: testo(x.error.message || x.error) } : x));
const ok = esiti.filter((x) => x.ok);
const ko = esiti.filter((x) => !x.ok);
const nv = ok.filter((x) => x.tipo === 'video');
const scene = nv.reduce((s, x) => s + (x.scene || 0), 0);
const minuti = nv.reduce((s, x) => s + (x.durata || 0), 0) / 60;
const parlano = nv.filter((x) => x.parlato).length;
const avvisi = ok.flatMap((x) => x.avvisi || []);
const righe = [];
if (!ok.length) {
  righe.push('⚠️ <b>Montatore fermo</b> · ' + h(J.cliente.nome_locale));
  righe.push('Nessun file è entrato nell\'officina.');
} else {
  righe.push('👀 <b>Ho guardato tutto</b> · ' + h(J.cliente.nome_locale));
  righe.push(nv.length + ' video (' + virgola(minuti) + ' minuti, ' + scene + ' momenti' + (parlano ? ', in ' + parlano + ' qualcuno parla' : '') + ') e ' + (ok.length - nv.length) + ' foto. Ora l\'AD guarda le miniature e scrive il piano.');
}
if (ko.length) righe.push('Non entrati (' + ko.length + '): ' + h(accorcia(ko.map((x) => x.file + ': ' + x.motivo).join('; '), 1200)));
if (avvisi.length) righe.push('Da sapere: ' + h(accorcia([...new Set(avvisi)].join(' '), 1500)));
return [{ json: { ok: ok.length > 0, caricati: ok.length, falliti: ko.length, messaggio: righe.join('\n') } }];
