// (esecuzione «monta») Il giudizio di Claude: se non risponde, il contenuto va comunque avanti (lo approvate voi).
const x = leggiClaude($input.first().json);
if (!x.ok) return [{ json: { esito: 'non_controllato', motivo: x.motivo } }];
const d = x.dati;
const voto = Math.max(1, Math.min(5, intero(d.voto, 3)));
const punti = (Array.isArray(d.punti) ? d.punti : []).map((p) => ({ punto: testo(p.punto), ok: p.ok !== false, nota: accorcia(testo(p.nota), 160) }));
// «da rivedere» se lo dice Claude o se il voto è 1-2 (un punto segnato da solo non basta: il prompt dice che un'immagine
// un po' scura non è motivo per bocciare). Quando è da rivedere il motivo dice cosa non va, con le note dei punti.
const rivedere = d.esito === 'da_rivedere' || voto <= 2;
const noteKo = punti.filter((p) => !p.ok && p.nota).map((p) => p.punto + ': ' + p.nota);
const base = d.esito === 'da_rivedere' ? testo(d.motivo) : '';
const motivo = rivedere ? [base, ...noteKo.filter((n) => !base.includes(n.replace(/^[a-z]+: /, '')))].filter(Boolean).join(' · ') || 'voto basso (' + voto + '/5)' : testo(d.motivo);
return [{ json: { esito: rivedere ? 'da_rivedere' : 'ok', voto, punti, motivo: accorcia(motivo, 400) } }];
