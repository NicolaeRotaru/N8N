// Il progetto nell'officina è pronto: un'esecuzione per file (così n8n tiene in memoria un file solo alla volta).
const J = $('Config').first().json;
const p = $input.first().json || {};
if (p.error || !/^[a-f0-9]{20}$/.test(testo(p.progetto))) {
  return [{ json: { fermo: true, messaggio: '⚠️ <b>Montatore fermo</b> · ' + h(J.cliente.nome_locale) + '\nL\'officina non ha creato il progetto: ' + h(accorcia(testo(p.error && (p.error.message || p.error)) || 'risposta senza id', 300)) + '\nControlla che l\'officina sia alla versione 1.4.0 o successiva (GET /salute), poi riprova dal modulo con «rifai» all\'inizio delle note.' } }];
}
return J.file.map((f, i) => ({ json: { lavoro: 'carica', progetto: p.progetto, n: i + 1, di: J.file.length, file: f, trascrivi: siNo(J.TRASCRIVI, true), lingua: testo(J.LINGUA) || 'it' } }));
