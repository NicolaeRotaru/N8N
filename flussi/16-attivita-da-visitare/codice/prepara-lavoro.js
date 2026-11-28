// 16 · Prepara il lavoro — il compito per «Chiedi all'AD»: il dossier delle attività della settimana
// (registro-fatti: negozi.ingresso — «chi è, cosa vende e a quanto, cosa ci guadagna LUI visto dal suo punto
// di vista, come convincerlo»). In prova, o se la mappa non è stata letta, o senza attività, l'AD non si accende.
const cfg = $('Config').first().json;
const f = $('Metti in fila').first().json;
const VERO = String(cfg.MODALITA || '').trim().toLowerCase() === 'vero';
const lavoro = {
  flusso: '16 · Attività da visitare',
  compito: 'Sei l’AD di MyCity, il marketplace delle attività di Piacenza (vetrina online, consegna locale, servizi per farsi trovare). ' +
    'Nei dati ci sono le attività che un agente andrà a visitare di persona questa settimana, prese dalla mappa libera (OpenStreetMap), con quello che la mappa dice di loro, e il listino. ' +
    'Per ognuna cerca sul web (nome e indirizzo: elenchi come PagineGialle e Virgilio, sito, social, recensioni), SEMPRE con WebSearch in modalità «extended», mai «standard»: la standard non vede i piccoli negozi italiani (prova del 28/11: niente su 6 negozi su 7). ' +
    'Poi prepara il dossier per chi la visita: ' +
    'chi_e (chi è, da quanto c’è, che fama ha: una o due frasi), cosa_vende (cosa vende e, se si trova, a che prezzi), ' +
    'cosa_ci_guadagna (cosa ci guadagna LUI, dal suo punto di vista, in incassi, clienti nuovi o tempo risparmiato: mai «digitalizzazione» o «tecnologia»), ' +
    'come_convincerlo (l’obiezione più probabile e come rispondere), cosa_proporre (le voci del listino che gli servono davvero, col motivo concreto: per esempio «nessun sito: chi lo cerca su Google trova solo l’indirizzo»), ' +
    'attenzione (se la mappa è vecchia: chiuso, trasferito, con un altro nome o un altro tipo di attività, è una catena, è già cliente; se un elenco dice «chiuso definitivamente» o «cessata attività», scrivilo qui per primo; altrimenti stringa vuota). ' +
    'Regole: non inventare niente; se non trovi un dato scrivi «non trovato». Il primo contatto è sempre di persona o al telefono: non suggerire mai messaggi WhatsApp o email a freddo. ' +
    'Non dire mai «zero commissioni»: MyCity trattiene il 10% sugli ordini che passano dal sito. Italiano semplice, frasi brevi, ogni campo al massimo 300 caratteri. Rispondi con una scheda per ogni attività, con lo stesso osm.',
  dati: {
    centro: cfg.CENTRO_NOME,
    listino: cfg.LISTINO,
    attivita: (f.fila || []).map((a) => ({ osm: a.osm, nome: a.nome, tipo: a.tipo, indirizzo: a.indirizzo, telefono: a.telefono, sito: a.sito, social: a.social, distanza_m: a.distanza_m, dalla_mappa: a.perche })),
  },
  schema: { type: 'object', properties: { schede: { type: 'array', items: { type: 'object',
    properties: { osm: { type: 'string' }, chi_e: { type: 'string', maxLength: 500 }, cosa_vende: { type: 'string', maxLength: 500 }, cosa_ci_guadagna: { type: 'string', maxLength: 500 }, come_convincerlo: { type: 'string', maxLength: 500 }, cosa_proporre: { type: 'string', maxLength: 500 }, attenzione: { type: 'string', maxLength: 500 } },
    required: ['osm', 'chi_e', 'cosa_ci_guadagna', 'come_convincerlo', 'cosa_proporre'] } } }, required: ['schede'] },
};
if (!VERO) lavoro.non_mandare = 'modalità prova del flusso 16';
else if (!f.letta) lavoro.non_mandare = 'la mappa non è stata letta';
else if (!(f.fila || []).length) lavoro.non_mandare = 'nessuna attività nuova da visitare';
// Il tetto di «Chiedi all'AD» è 64 KB, in byte (scorciatoie-note #39): si misura in byte, con margine.
const byte = (s) => (typeof Buffer !== 'undefined' ? Buffer.byteLength(s, 'utf8') : unescape(encodeURIComponent(s)).length);
const taglia = (l) => { while (byte(JSON.stringify(l)) > 50000 && l.dati.attivita.length > 1) l.dati.attivita.pop(); return l; };
// Un giro ogni DOSSIER_PER_GIRO attività (di serie 10): con 30 in una sola richiesta l'AD non cercava sul web e i dossier
// tornavano vuoti (esecuzione 4585 del 28/11/2026). Il nodo «Chiedi all'AD i dossier» fa una chiamata per giro.
// In prova o senza attività resta un lavoro solo, come prima: lo legge «Chiedi all'AD», che non si accende.
const PER_GIRO = Math.max(1, Math.min(30, Math.floor(Number(cfg.DOSSIER_PER_GIRO)) || 10));
const tutte = lavoro.dati.attivita;
if (lavoro.non_mandare || tutte.length <= PER_GIRO) return [{ json: taglia(lavoro) }];
const giri = [];
for (let k = 0; k < tutte.length; k += PER_GIRO) giri.push(tutte.slice(k, k + PER_GIRO));
return giri.map((pezzo, i) => ({ json: taglia({ ...lavoro, giro: `${i + 1} di ${giri.length}`, dati: { ...lavoro.dati, attivita: pezzo } }) }));
