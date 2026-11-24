// Prepara la ricerca dei social (e delle altre piattaforme) con la ricerca web di Claude.
const d = $input.first().json;
const cfg = $('Config').first().json;
const g = d.google || {};
const l = d.lettura || {};
const s = d.sito || {};

const SISTEMA = `Sei un ricercatore dell'agenzia di marketing SDG. Devi scoprire come si presenta online un'attività locale, partendo dai dati già raccolti. Usa la ricerca web.

Cerca, in quest'ordine:
1. Instagram, Facebook e TikTok dell'attività: indirizzo del profilo, numero di follower o di «mi piace», e quando ha pubblicato l'ultima volta (anche approssimativo, se lo dicono i risultati).
2. Il sito ufficiale, solo se non lo conosciamo già.
3. Le altre piattaforme che contano per questo tipo di attività, solo quelle pertinenti: per esempio TripAdvisor, TheFork, Glovo, Deliveroo, Just Eat, Booking, Treatwell, Fresha, Uala, Amazon, Etsy.

Regole:
- Controlla che il profilo sia proprio di questa attività: stessa città, indirizzo, telefono o nome molto simile. Se ci sono omonimi e non sei sicuro, dillo.
- Non inventare numeri. Riporta solo quello che leggi nei risultati, con la pagina da cui viene. Se un dato non c'è, scrivi «non trovato».
- Instagram e Facebook spesso non si aprono senza accesso: va bene usare i numeri che compaiono nei risultati di ricerca, dicendo che sono approssimativi.
- Bastano poche ricerche mirate: fermati quando hai trovato i profili o quando è chiaro che non ci sono.

Rispondi in italiano, in modo asciutto, con una riga per piattaforma in questo formato:
PIATTAFORMA | indirizzo del profilo | follower o mi piace | ultimo post | sicurezza (alta, media o bassa) | fonte
Scrivi anche le piattaforme cercate e non trovate (es. «TikTok | non trovato»).
Alla fine una riga «ALTRO:» con fatti utili trovati per strada (premi, articoli, valutazioni su altri siti), se ci sono.`;

const noti = {
  nome: g.nome || l.nome_attivita,
  tipo_attivita: l.tipo_attivita || g.categoria || '',
  indirizzo: g.indirizzo || [l.indirizzo, d.ricerca && d.ricerca.citta].filter(Boolean).join(', '),
  telefono: g.telefono || l.telefono || '',
  sito: s.tipo === 'proprio' ? s.url : '',
  link_al_posto_del_sito: s.tipo === 'social' ? s.url : '',
  social_visti_sulla_foto: l.profili_social || [],
  adesivi_e_loghi_sulla_vetrina: l.segni_online || [],
  social_collegati_dal_sito: (s.pagina && s.pagina.social) || {},
};

const citta = (d.ricerca && d.ricerca.citta) || '';
const ricercaWeb = { type: 'web_search_20260209', name: 'web_search', max_uses: 5 };
ricercaWeb.user_location = citta
  ? { type: 'approximate', country: 'IT', city: citta, timezone: 'Europe/Rome' }
  : { type: 'approximate', country: 'IT', timezone: 'Europe/Rome' };

const richiesta = {
  model: cfg.CLAUDE_MODELLO || 'claude-opus-5-5',
  max_tokens: 16000,
  fallbacks: 'default',
  output_config: { effort: cfg.CLAUDE_EFFORT || 'medium' },
  system: SISTEMA,
  tools: [ricercaWeb, { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 }],
  messages: [
    {
      role: 'user',
      content: 'Dati già raccolti sull\'attività (JSON):\n' + JSON.stringify(noti, null, 2),
    },
  ],
};

return [{ json: Object.assign({}, d, { richiesta_ricerca: richiesta }) }];
