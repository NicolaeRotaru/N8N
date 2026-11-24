// La risposta di Claude col piano → il piano da far controllare all'officina.
const J = $('Config').first().json;
const x = leggiClaude($input.first().json);
if (!x.ok || !Array.isArray(x.dati.contenuti)) {
  return [{ json: { ok: false, messaggio: '⚠️ <b>Montatore fermo</b> · ' + h(J.cliente.nome_locale) + '\nClaude non ha scritto il piano (' + h(x.motivo || 'risposta senza contenuti') + '). Il materiale resta nell\'officina per 72 ore: rilancia il modulo più tardi.' } }];
}
return [{ json: { ok: true, piano: { contenuti: x.dati.contenuti }, note: testo(x.dati.note_per_il_team), troncata: !!x.troncata } }];
