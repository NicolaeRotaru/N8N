// La cartella d'uscita dentro la cartella del servizio: «Pronti (montatore)» oppure «Pronti (montatore) - prova».
const J = $('Config').first().json;
const r = $input.first().json || {};
const nome = testo(J.NOME_CARTELLA_PRONTI || 'Pronti (montatore)') + (norm(J.MODALITA) === 'attivo' ? '' : ' - prova');
// la cartella del segno, se c'è (due cartelle con lo stesso nome non confondono il giro); altrimenti per nome
const mia = testo(J.pronti && J.pronti.id);
const c = Array.isArray(r.files) ? (r.files.find((f) => mia && f.id === mia) || r.files.find((f) => testo(f.name) === nome)) : null;
return [{ json: { nome, id: c ? c.id : '', crea: !c, dentro: J.servizio.id } }];
