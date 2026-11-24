// (esecuzione «rivedi») Approvato: la riga del Calendario (solo in modalità attivo) e il messaggio di conferma.
const J = $('Config').first().json;
const E = J.esito || {};
const G = J.giro || {};
const c = E.contenuto || {};
const attivo = norm(J.MODALITA) === 'attivo';
const riga = rigaCalendario({ cliente: G.cliente, servizio: G.servizio }, E, J.progetto, { approvato: true, versione: J.versione });
const storia = riga.tipo === 'storia';
const dove = attivo
  ? (storia ? 'Nel Calendario come «approvato»: il 01 la pubblica ' + leggibileData(c.data, c.ora) + '.' : 'Nel Calendario come «da scrivere»: il 04 prepara la didascalia e te la chiede.')
  : 'Modalità prova: nel Calendario non ho scritto niente.';
return [{ json: { scrivi: attivo, riga, messaggio: '✅ <b>Approvato</b> · ' + h((G.cliente || {}).nome_locale) + ' · ' + h(c.titolo) + '\n' + dove } }];
