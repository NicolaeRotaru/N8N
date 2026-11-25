// Ritocca l'anteprima · quando la ricerca l'ha fatta l'AD, l'anteprima su Telegram lo dice e porta i suoi avvisi.
// «Controlla la proposta» conta ricerche e costo dalla risposta dell'API di prima: con l'AD segnava sempre
// «Ricerche web: 0 · costo stimato 0,00 $», anche quando l'AD aveva cercato. E gli avvisi dell'AD si perdevano.
// Cambia solo il testo dell'anteprima: il resto di «Controlla la proposta» passa com'è.
// Inserito da N8N/flussi/chiedi-all-ad/leggi-pagine.mjs: le modifiche vanno fatte lì.
const testo = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const eseguito = (nome) => { try { return $(nome).isExecuted; } catch (e) { return false; } };
// Telegram tiene 4096 caratteri; il flusso 26 dopo allunga ancora l'ultima riga e mette un'intestazione.
const MASSIMO = 3850;
return $input.all().map((item, indice) => {
  const j = item.json || {};
  let m = typeof j.messaggio_anteprima === 'string' ? j.messaggio_anteprima : '';
  if (!m || !eseguito("Dall'AD: la ricerca")) return { json: j, pairedItem: { item: indice } };
  const risposta = (eseguito('Metti le pagine nella risposta') ? $('Metti le pagine nella risposta') : $("Dall'AD: la ricerca")).first().json || {};
  const corpo = risposta.body || {};
  const lette = (corpo.pagine_da_n8n && Array.isArray(corpo.pagine_da_n8n.lette)) ? corpo.pagine_da_n8n.lette : [];
  m = m.replace(/^Ricerche web: \d+ · pagine lette: (\d+) · costo stimato [\d.,]+ \$$/m, (_, n) => `Ricerca sul web: fatta dall'AD · pagine lette da n8n: ${n}`);
  const avvisi = [];
  const prendi = (b) => { for (const a of (b && Array.isArray(b.avvisi) ? b.avvisi : [])) { const t = testo(a).replace(/\s+/g, ' '); if (t && !avvisi.includes(t)) avvisi.push(t); } };
  prendi(corpo);
  if (eseguito("Dall'AD: la scheda")) prendi(($("Dall'AD: la scheda").first().json || {}).body);
  // Se n8n ha letto le pagine, gli avvisi dell'AD sulla rete chiusa non servono più.
  const utili = avvisi.filter((a) => /^n8n:/.test(a) || !(lette.length && /\brete\b|permess|non si apr/i.test(a)))
    .map((a) => (/^n8n:/.test(a) ? a : `L'AD: ${a}`));
  if (utili.length) {
    const righe = m.split('\n');
    const ultima = righe.pop();
    let piano = utili.join(' · ');
    let riga = `ℹ️ ${esc(piano)}`;
    const spazio = MASSIMO - Array.from(m).length - 1;
    while (piano && Array.from(riga).length > spazio) {
      piano = Array.from(piano).slice(0, Math.max(0, Array.from(piano).length - 40)).join('').trim();
      riga = piano ? `ℹ️ ${esc(piano)}…` : '';
    }
    if (riga && spazio > 20) m = [...righe, riga, ultima].join('\n');
  }
  return { json: { ...j, messaggio_anteprima: m }, pairedItem: { item: indice } };
});
