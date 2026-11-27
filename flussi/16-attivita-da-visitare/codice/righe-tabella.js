// 16 · Righe per la tabella — una riga per ogni attività proposta, nella tabella «Attività da visitare».
// Così la settimana dopo non torna in fila, e lo stato (visitata, si, no, iscritta) lo scrive chi la visita.
// Solo in modalità vero e solo se la mappa è stata letta. La tabella non si svuota mai: si archivia.
const cfg = $('Config').first().json;
const f = $('Metti in fila').first().json;
const m = $('Componi i messaggi').first().json;
const VERO = String(cfg.MODALITA || '').trim().toLowerCase() === 'vero';
if (!VERO || !f.letta || !(f.fila || []).length) return [];
let ad = null;
try { ad = $('Chiedi all’AD i dossier').isExecuted ? ($('Chiedi all’AD i dossier').first().json || {}) : null; } catch { ad = null; }
const schede = {};
if (ad && ad.ok === true && ad.risultato && Array.isArray(ad.risultato.schede)) for (const s of ad.risultato.schede) if (s && s.osm) schede[String(s.osm)] = s;
const ora = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date());
return f.fila.map((a) => {
  const s = schede[a.osm];
  const dossier = s ? [s.attenzione && `Attenzione: ${s.attenzione}`, `Chi è: ${s.chi_e}`, s.cosa_vende && `Cosa vende: ${s.cosa_vende}`, `Cosa ci guadagna: ${s.cosa_ci_guadagna}`, `Come convincerlo: ${s.come_convincerlo}`, `Da proporre: ${s.cosa_proporre}`].filter(Boolean).join('\n') : '';
  return { json: { osm: a.osm, settimana: m.settimana, proposta_il: ora, nome: a.nome, tipo: a.tipo, segmento: a.segmento, indirizzo: a.indirizzo, telefono: a.telefono, sito: a.sito,
    distanza_m: a.distanza_m, punteggio: a.punteggio, perche: a.perche, offerta: a.offerta, mappa: a.mappa, dossier, stato: 'da_visitare', esito: '' } };
});
