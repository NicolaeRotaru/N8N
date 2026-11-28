// 16 · Righe per la tabella — una riga per ogni attività proposta, nella tabella «Attività da visitare».
// Così la settimana dopo non torna in fila, e lo stato (visitata, si, no, iscritta) lo scrive chi la visita.
// Solo in modalità vero e solo se la mappa è stata letta. La tabella non si svuota mai: si archivia.
const cfg = $('Config').first().json;
const f = $('Metti in fila').first().json;
const m = $('Componi i messaggi').first().json;
const VERO = String(cfg.MODALITA || '').trim().toLowerCase() === 'vero';
if (!VERO || !f.letta || !(f.fila || []).length) return [];
// Una risposta dell'AD per ogni giro di 10: si leggono tutte (un giro fallito lascia vuoto solo il suo dossier).
// I giri dell'AD sono tre nodi in fila. Si legge la risposta di un giro solo se quel giro aveva un lavoro vero:
// un giro in più (meno di 21 attività) torna con «non_mandare» e non è un giro fallito.
const NODI_AD = ['Chiedi all’AD i dossier', 'Chiedi all’AD · giro 2', 'Chiedi all’AD · giro 3'];
let nLavori = 1;
try { nLavori = Math.max(1, $('Prepara il lavoro').all().length); } catch { nLavori = 1; }
const leggiNodo = (n) => { try { return $(n).isExecuted ? $(n).all().map((x) => x.json || {}) : []; } catch { return []; } };
const risposte = NODI_AD.slice(0, nLavori).flatMap(leggiNodo);
const schede = {};
// L'AD a volte scrive solo il numero («15» invece di «node/15»). Vale solo se nella fila un solo elemento ha quel numero:
// un punto e un edificio della mappa possono avere lo stesso numero (collaudo del 28/11, n.6).
const soloNumero = {};
const contaNumeri = {};
for (const a of f.fila || []) { const n = String(a.osm).split('/').pop(); contaNumeri[n] = (contaNumeri[n] || 0) + 1; }
const numeroUnico = (a) => { const n = String(a.osm).split('/').pop(); return contaNumeri[n] === 1 ? soloNumero[n] : undefined; };
for (const ad of risposte) if (ad.ok === true && ad.risultato && Array.isArray(ad.risultato.schede)) for (const s of ad.risultato.schede) if (s && s.osm) { schede[String(s.osm)] = s; if (!String(s.osm).includes('/')) soloNumero[String(s.osm)] = s; }
const ora = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date());
return f.fila.map((a) => {
  const s = schede[a.osm] || numeroUnico(a);
  const dossier = s ? [s.attenzione && `Attenzione: ${s.attenzione}`, `Chi è: ${s.chi_e}`, s.cosa_vende && `Cosa vende: ${s.cosa_vende}`, `Cosa ci guadagna: ${s.cosa_ci_guadagna}`, `Come convincerlo: ${s.come_convincerlo}`, `Da proporre: ${s.cosa_proporre}`, s.fonte && `Fonte: ${s.fonte}`].filter(Boolean).join('\n') : '';
  return { json: { osm: a.osm, settimana: m.settimana, proposta_il: ora, nome: a.nome, tipo: a.tipo, segmento: a.segmento, indirizzo: a.indirizzo, telefono: a.telefono, sito: a.sito,
    distanza_m: a.distanza_m, punteggio: a.punteggio, perche: a.perche, offerta: a.offerta, mappa: a.mappa, dossier, stato: 'da_visitare', esito: '' } };
});
