// Raccoglie il risultato della ricerca dei social (con l'eventuale seguito) e le fonti consultate.
// @comune claude

const d = $('Prepara ricerca social').first().json;
const prima = $('Claude: cerca social').first().json;
const seguito = $('Claude: continua ricerca').isExecuted ? $('Claude: continua ricerca').first().json : null;

const risposte = [prima, seguito].filter(Boolean);
let testo = '';
const fonti = [];
let costo = 0;
let ricerche = 0;
let errore = '';

function aggiungiFonte(url, titolo) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return;
  if (fonti.some((f) => f.url === url)) return;
  if (fonti.length < 15) fonti.push({ url, titolo: String(titolo || '').slice(0, 100) });
}

for (const r of risposte) {
  costo += costoClaude(r);
  const e = erroreClaude(r);
  if (e) {
    errore = e;
    continue;
  }
  if (r.usage && r.usage.server_tool_use) ricerche += r.usage.server_tool_use.web_search_requests || 0;
  testo += testoClaude(r);
  for (const b of r.content) {
    if (b.type === 'text' && Array.isArray(b.citations)) for (const c of b.citations) aggiungiFonte(c.url, c.title);
  }
  for (const b of r.content) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const x of b.content) aggiungiFonte(x.url, x.title);
  }
}

const ultima = risposte[risposte.length - 1];
const completa = !errore && ultima && ultima.stop_reason !== 'pause_turn';

const o = Object.assign({}, d);
delete o.richiesta_ricerca;
o.ricerca_social = {
  testo: testo.trim().slice(0, 6000),
  fonti,
  ricerche_web: ricerche,
  completa: !!completa,
  errore: testo ? '' : errore || (completa ? '' : 'ricerca interrotta prima della fine'),
};
o.costo_usd = (d.costo_usd || 0) + costo;
return [{ json: o }];
