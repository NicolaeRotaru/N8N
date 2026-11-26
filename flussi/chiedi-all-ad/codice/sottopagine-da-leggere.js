// Sottopagine da leggere · dalle pagine appena scaricate, i collegamenti dello stesso sito verso menu, contatti,
// orari, chi siamo e prenotazioni. In tutto (pagine + sottopagine) al massimo MAX_LETTURE del Config.
// Esce con un elemento per sottopagina ({ leggi: true, url }), oppure uno solo con leggi: false.
// Inserito da N8N/flussi/chiedi-all-ad/leggi-pagine.mjs: le modifiche vanno fatte lì.
__INDIRIZZI__
__TESTO__
const LP = { ...LT, ...LI };
const cfg = $('Config').first().json;
const MAX = Math.min(10, Math.max(1, Number(cfg.MAX_LETTURE) || 10));
const richieste = $('Pagine da leggere').all();
const lette = LP.risposte(richieste, $input.all());
// Un rinvio non è una pagina letta: il suo posto passa all'indirizzo nuovo (con 10 indirizzi, il rinvio di eatbu si perdeva).
const posto = MAX - richieste.length + lette.filter((p) => p.rinvio).length;
const visti = new Set(richieste.map((x) => LP.chiave(x.json.url)));
const nuove = [];
// Prima i rinvii (http → https, senza www → con www): sono la pagina stessa, a un altro indirizzo.
// Un rinvio si confronta con l'indirizzo intero (http → https ha la stessa chiave, ma è un'altra richiesta).
const intero = (u) => LP.testo(u).toLowerCase().replace(/#.*$/, '').replace(/\/+$/, '');
const richiesti = new Set(richieste.map((x) => intero(x.json.url)));
for (const p of lette) {
  if (!p.rinvio || nuove.length >= posto) continue;
  const v = LP.indirizzoSicuro(p.rinvio);
  if (!v.ok || richiesti.has(intero(v.url)) || nuove.some((u) => intero(u) === intero(v.url))) continue;
  visti.add(v.chiave);
  nuove.push(v.url);
}
for (const p of lette) {
  if (!p.ok || nuove.length >= posto) continue;
  for (const u of LP.sottopagine(p.html, p.url)) {
    const v = LP.indirizzoSicuro(u);
    if (!v.ok || visti.has(v.chiave) || nuove.length >= posto) continue;
    visti.add(v.chiave);
    nuove.push(v.url);
  }
}
if (!nuove.length) return [{ json: { leggi: false, motivo: posto > 0 ? 'nessuna sottopagina utile' : 'già lette tutte le pagine possibili' } }];
return nuove.map((url) => ({ json: { leggi: true, url, giro: 2 } }));
