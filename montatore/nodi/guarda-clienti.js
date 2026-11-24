// (guardiano delle cartelle) Ogni 15 minuti: i clienti attivi con la cartella Drive, e da quando guardare.
// La prima volta segna solo l'ora di partenza: i servizi che c'erano già prima non si montano mai da soli.
const J = $('Config').first().json;
if (!siNo(J.AVVIO_DA_CARTELLA, true)) return [];
const S = $getWorkflowStaticData('global');
const ora = Date.now();
if (!S.guardiano_da) { S.guardiano_da = new Date(ora).toISOString(); return []; }
S.servizi = S.servizi || {};
for (const [k, v] of Object.entries(S.servizi)) if (ora - (Date.parse(v.visto) || 0) > 30 * 86400000) delete S.servizi[k];
const r = $input.first().json || {};
if (r.error || !Array.isArray(r.values)) return [];
const dopo = new Date(Math.max(Date.parse(S.guardiano_da) || ora, ora - 14 * 86400000)).toISOString();
return righeFoglio(r)
  .filter((x) => testo(x.cliente) && siNo(x.attivo, false) && idDrive(x.cartella_drive))
  .map((x) => ({ json: { cliente: testo(x.cliente), nome_locale: testo(x.nome_locale) || testo(x.cliente), cartella_cliente: idDrive(x.cartella_drive), dopo } }));
