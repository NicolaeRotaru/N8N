// (esecuzione «monta») Il giudizio di Claude: se non risponde, il contenuto va comunque avanti (lo approvate voi).
const x = leggiClaude($input.first().json);
if (!x.ok) return [{ json: { esito: 'non_controllato', motivo: x.motivo } }];
return [{ json: { esito: x.dati.esito === 'da_rivedere' ? 'da_rivedere' : 'ok', motivo: accorcia(testo(x.dati.motivo), 300) } }];
