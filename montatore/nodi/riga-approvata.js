// (esecuzione «rivedi») Approvato: la riga del Calendario (solo in modalità attivo) e il messaggio di conferma.
const J = $('Config').first().json;
const E = J.esito || {};
const G = J.giro || {};
const c = E.contenuto || {};
const attivo = norm(J.MODALITA) === 'attivo';
const riga = rigaCalendario({ cliente: G.cliente, servizio: G.servizio }, E, J.progetto, { approvato: true, versione: J.versione });
const storia = riga.tipo === 'storia';
// la scheda può aspettare giorni: se intanto la data è passata, la riga va in «bozza» (il 01 non la pubblica in ritardo)
const ora = partiRoma();
const passata = testo(c.data) + ' ' + testo(c.ora) < ora.data + ' ' + ora.ora;
if (passata) {
  riga.stato = 'bozza';
  riga.note += ' · data passata: scegliere giorno e ora nuovi';
  return [{ json: { scrivi: attivo, riga, messaggio: '✅ <b>Approvato, ma la data è passata</b> · ' + h((G.cliente || {}).nome_locale) + ' · ' + h(c.titolo) + '\nDoveva uscire ' + leggibileData(c.data, c.ora) + '. ' + (attivo ? 'Nel Calendario va in «bozza»: scegliete giorno e ora nuovi e rimettete lo stato.' : 'Modalità prova: nel Calendario non ho scritto niente.') } }];
}
const dove = attivo
  ? (storia ? 'Nel Calendario come «approvato»: il 01 la pubblica ' + leggibileData(c.data, c.ora) + '.' : 'Nel Calendario come «da scrivere»: il 04 prepara la didascalia e te la chiede.')
  : 'Modalità prova: nel Calendario non ho scritto niente.';
return [{ json: { scrivi: attivo, riga, messaggio: '✅ <b>Approvato</b> · ' + h((G.cliente || {}).nome_locale) + ' · ' + h(c.titolo) + '\n' + dove } }];
