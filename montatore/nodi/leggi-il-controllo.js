// (esecuzione «monta») Il giudizio di Claude: se non risponde, il contenuto va comunque avanti (lo approvate voi).
const x = leggiClaude($input.first().json);
if (!x.ok) return [{ json: { esito: 'non_controllato', motivo: x.motivo } }];
const d = x.dati;
const voto = Math.max(1, Math.min(5, intero(d.voto, 3)));
const punti = (Array.isArray(d.punti) ? d.punti : []).map((p) => ({ punto: testo(p.punto), ok: p.ok !== false, nota: accorcia(testo(p.nota), 160) }));
// un voto 1-2 o un punto bocciato valgono «da rivedere» anche se Claude avesse scritto «ok»
const rivedere = d.esito === 'da_rivedere' || voto <= 2 || punti.some((p) => !p.ok);
return [{ json: { esito: rivedere ? 'da_rivedere' : 'ok', voto, punti, motivo: accorcia(testo(d.motivo), 300) } }];
