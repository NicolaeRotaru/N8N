// La risposta dell'AD col piano → il piano da far controllare all'officina.
const J = $('Config').first().json;
const G = $("Leggi cosa c'è").isExecuted ? $("Leggi cosa c'è").first().json : {};
const dopo = ' Il materiale resta nell\'officina per 14 giorni: rilancia il modulo più tardi (con «rifai» all\'inizio delle note).';
if (G.fermo) return [{ json: { ok: false, messaggio: '⚠️ <b>Montatore fermo</b> · ' + h(J.cliente.nome_locale) + '\nNiente piano: ' + h(G.fermo) + '. Senza vedere il materiale il piano sarebbe scritto alla cieca.' + dopo } }];
const r = $input.first().json || {};
const x = leggiClaude(r, (d) => Array.isArray(d.contenuti));
if (!x.ok || !Array.isArray(x.dati.contenuti)) {
  return [{ json: { ok: false, messaggio: '⚠️ <b>Montatore fermo</b> · ' + h(J.cliente.nome_locale) + '\nL\'AD non ha scritto il piano (' + h(x.motivo || 'risposta senza contenuti') + ').' + dopo } }];
}
const avvisi = [...new Set([...(Array.isArray(G.avvisi_ad) ? G.avvisi_ad : []), ...(Array.isArray(r.avvisi) ? r.avvisi : []).map((a) => accorcia(testo(a && (a.messaggio || a)), 200))])].filter(Boolean);
return [{ json: { ok: true, piano: { contenuti: x.dati.contenuti }, note: testo(x.dati.note_per_il_team), troncata: !!x.troncata, avvisi_ad: avvisi } }];
