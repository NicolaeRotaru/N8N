// 98 · Un elemento per flusso acceso — dall'elenco di tutti i flussi, quelli accesi, uno per riga,
// così i due nodi dopo chiedono per ciascuno l'ultimo giro buono e i giri falliti.

const j = $('Leggi i flussi').first().json || {};
const codice = Number(j.statusCode) || 0;
let corpo = j.body;
if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch { corpo = null; } }
const tutti = codice >= 200 && codice < 300 && corpo && Array.isArray(corpo.data) ? corpo.data : null;
if (!tutti) {
  // Senza elenco non si chiede niente: «Componi la salute» dirà che n8n non si è letto.
  return [{ json: { _niente: true, motivo: j.error ? String(j.error.message || j.error).slice(0, 120) : `risposta ${codice || 'assente'}` } }];
}
const accesi = tutti.filter((w) => w.active === true).sort((a, b) => String(a.name).localeCompare(String(b.name), 'it', { numeric: true }));
if (!accesi.length) return [{ json: { _niente: true, totali: tutti.length, motivo: 'nessun flusso acceso' } }];
return accesi.map((w) => ({ json: {
  id: w.id, nome: w.name, totali: tutti.length,
  salva_buoni: (w.settings && w.settings.saveDataSuccessExecution) !== 'none',
} }));
