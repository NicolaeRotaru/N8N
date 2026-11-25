// 99 · Avvisi errori — toglie la spiegazione dell'errore con Claude (API a pagamento).
// Decisione di Nicola del 24/11/2026: nessun flusso acceso chiama più l'API di Claude. L'avviso parte uguale:
// «Leggi spiegazione AI», con SPIEGA_ERRORI_AI = no, scrive nella colonna errore e su Telegram il testo di
// sempre (flusso, nodo, messaggio, consiglio del flusso).
//
// Cosa cambia nel 99 su n8n:
//   - via i nodi «Spiegazione AI accesa?», «Prepara spiegazione AI», «Spiega l'errore con Claude»;
//   - «Leggi errore» va dritto a «Leggi spiegazione AI»;
//   - SPIEGA_ERRORI_AI = no nel Config, e la nota «Come funziona» lo dice.
// Si può rilanciare: se i nodi non ci sono più, non cambia niente.
//
// Uso: N8N_API_KEY=… node flussi/99-avvisi-errori/togli-spiegazione-ai.mjs [--manda] [--salva copia.json]
//   senza --manda controlla soltanto e dice cosa cambierebbe; --salva scrive la copia del 99 di prima
//   (contiene ID e chat: tienila fuori dal repository).

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const NOME_99 = '99 · Avvisi errori';
const DA_TOGLIERE = ['Spiegazione AI accesa?', 'Prepara spiegazione AI', "Spiega l'errore con Claude"];

/** Restituisce il 99 senza la spiegazione con Claude (non tocca l'originale) e l'elenco delle modifiche. */
export function togli(originale) {
  const w = structuredClone(originale);
  const modifiche = [];
  const via = new Set(DA_TOGLIERE.filter((n) => w.nodes.some((x) => x.name === n)));
  if (via.size) {
    w.nodes = w.nodes.filter((n) => !via.has(n.name));
    for (const n of via) delete w.connections[n];
    for (const uscite of Object.values(w.connections)) {
      for (const tipo of Object.values(uscite)) {
        for (let i = 0; i < tipo.length; i++) tipo[i] = (tipo[i] || []).filter((c) => !via.has(c.node));
      }
    }
    modifiche.push(`tolti i nodi: ${[...via].join(', ')}`);
  }
  if (!w.nodes.some((n) => n.name === 'Leggi errore') || !w.nodes.some((n) => n.name === 'Leggi spiegazione AI')) {
    throw new Error('Nel 99 non trovo «Leggi errore» o «Leggi spiegazione AI»: il flusso è cambiato, non tocco niente.');
  }
  const dopo = w.connections['Leggi errore']?.main?.[0] || [];
  if (!dopo.some((c) => c.node === 'Leggi spiegazione AI')) {
    // Si aggiunge, non si sostituisce: le altre uscite di «Leggi errore» restano.
    w.connections['Leggi errore'] = w.connections['Leggi errore'] || { main: [[]] };
    w.connections['Leggi errore'].main[0] = [...(w.connections['Leggi errore'].main[0] || []), { node: 'Leggi spiegazione AI', type: 'main', index: 0 }];
    modifiche.push('«Leggi errore» va dritto a «Leggi spiegazione AI»');
  }
  for (const n of w.nodes) {
    const t = JSON.stringify(n.parameters || {});
    const citato = DA_TOGLIERE.find((d) => t.includes(`$('${d.replace(/'/g, "\\\\'")}')`) || t.includes(`$(\\"${d}\\")`));
    if (citato && !/^Nota/.test(n.name)) throw new Error(`«${n.name}» cita «${citato}», che si toglie: non tocco niente.`);
  }
  const cfg = w.nodes.find((n) => n.name === 'Config');
  const voce = cfg?.parameters?.assignments?.assignments?.find((a) => a.name === 'SPIEGA_ERRORI_AI');
  if (!voce) throw new Error('Nel Config del 99 manca SPIEGA_ERRORI_AI: non tocco niente.');
  if (voce.value !== 'no') { voce.value = 'no'; modifiche.push('SPIEGA_ERRORI_AI = no'); }
  const nota = w.nodes.find((n) => n.name === 'Nota · Come funziona');
  const vecchia = /\*\*Spiegazione con Claude\*\*[^\n]*\n/;
  if (nota && vecchia.test(nota.parameters.content || '')) {
    nota.parameters.content = nota.parameters.content.replace(vecchia,
      "**Spiegazione con Claude: tolta** (decisione di Nicola del 24/11/2026, nessun flusso chiama più l'API di Claude). Il messaggio è quello di sempre: flusso, nodo, errore e consiglio del flusso.\n");
    modifiche.push('nota «Come funziona» aggiornata');
  }
  const passi = w.nodes.find((n) => n.name === 'Nota · Passi');
  if (passi && /Spiegazione \(Claude\) → /.test(passi.parameters.content || '')) {
    passi.parameters.content = passi.parameters.content.replace('Spiegazione (Claude) → ', '');
    modifiche.push('nota «Passi» aggiornata');
  }
  return { flusso: w, modifiche };
}

async function principale(argv) {
  const api = await import('../n8n-api.mjs');
  const trovato = (await api.elencoFlussi()).find((w) => w.name === NOME_99);
  if (!trovato) throw new Error(`Non trovo «${NOME_99}» su n8n.`);
  const originale = await api.leggiFlusso(trovato.id);
  const i = argv.indexOf('--salva');
  if (i >= 0) writeFileSync(argv[i + 1], JSON.stringify(originale, null, 2));
  const { flusso, modifiche } = togli(originale);
  if (flusso.nodes.some((n) => JSON.stringify(n.parameters || {}).includes('api.anthropic.com'))) throw new Error('Nel 99 resta una chiamata a Claude: non mando niente.');
  if (!modifiche.length) { console.log('Il 99 è già senza spiegazione con Claude.'); return; }
  console.log(`Il 99 (${trovato.id}, ${trovato.active ? 'acceso' : 'spento'}) cambia così:\n- ${modifiche.join('\n- ')}`);
  if (!argv.includes('--manda')) { console.log('Solo controllo: rilancia con --manda per aggiornarlo su n8n.'); return; }
  const esito = await api.creaOAggiorna(flusso);
  console.log(`Aggiornato su n8n: id ${esito.id}, ${esito.attivo ? 'ACCESO' : 'spento'}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principale(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
