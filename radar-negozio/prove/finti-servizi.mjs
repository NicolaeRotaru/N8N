// Servizi finti per provare il workflow in un n8n vero, senza internet e senza chiavi:
// Telegram (webhook, getFile, sendMessage), Claude (/v1/messages), Google Places, Google PageSpeed e un sito.
// Ogni scenario decide cosa rispondono. Tutte le richieste ricevute restano in `registro`, per i controlli.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
export const FOTO = readFileSync(join(QUI, 'materiale', 'negozio.jpg'));
export const HEIC = readFileSync(join(QUI, 'materiale', 'foto.heic'));
export const TOKEN = '123456:FINTO';

const GIORNO = 86400000;
const PAGINA_AURORA = `<!doctype html><html lang="it"><head>
<meta charset="utf-8"><title>Pasticceria Aurora &amp; Caffè - Torino</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta content="Dolci artigianali dal 1987 in via Po a Torino." name="description">
<link rel="stylesheet" href="/wp-content/themes/aurora/style.css">
<script src="https://cdn.iubenda.com/cs/iubenda_cs.js"></script>
</head><body>
<a href="tel:+390118123456">Chiamaci</a>
<a href="https://www.instagram.com/pasticceria.aurora/">Instagram</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">Condividi</a>
<a href="/privacy-policy">Privacy</a>
<footer>© 2019 Pasticceria Aurora snc – P.IVA 01234567890</footer>
</body></html>`;

export function luogo(extra = {}) {
  return {
    id: 'ChIJaurora',
    displayName: { text: 'Pasticceria Aurora', languageCode: 'it' },
    formattedAddress: 'Via Po, 12, 10123 Torino TO, Italia',
    googleMapsUri: 'https://maps.google.com/?cid=123',
    primaryTypeDisplayName: { text: 'Pasticceria', languageCode: 'it' },
    businessStatus: 'OPERATIONAL',
    rating: 4.6,
    userRatingCount: 212,
    websiteUri: 'http://127.0.0.1:9999/sito/aurora',
    nationalPhoneNumber: '011 812 3456',
    internationalPhoneNumber: '+39 011 812 3456',
    regularOpeningHours: { weekdayDescriptions: ['lunedì: Chiuso', 'martedì: 07:30–19:30'] },
    photos: Array.from({ length: 10 }, (_, i) => ({ name: 'places/x/photos/' + i })),
    reviews: [
      { rating: 5, relativePublishTimeDescription: '10 giorni fa', publishTime: new Date(Date.now() - 10 * GIORNO).toISOString(), text: { text: 'Bignè <ottimi> & caffè buono' } },
      { rating: 4, relativePublishTimeDescription: '3 mesi fa', publishTime: new Date(Date.now() - 95 * GIORNO).toISOString(), text: { text: 'Bene' } },
    ],
    ...extra,
  };
}

export function lettura(extra = {}) {
  return {
    leggibile: true, motivo: '', nome_attivita: 'Pasticceria Aurora', tipo_attivita: 'pasticceria', citta: 'Torino',
    indirizzo: 'Via Po 12', telefono: '011 812 3456', sito: '', profili_social: ['@pasticceria.aurora'],
    segni_online: ['QR code', 'adesivo TripAdvisor'], insegna: 'curata', vetrina: 'Vetrina ordinata, luce fredda.',
    osservazioni: ['orari non esposti'], ricerca_google: 'Pasticceria Aurora Via Po 12 Torino', ...extra,
  };
}

export function scheda(extra = {}) {
  return {
    sintesi: 'Su Google va forte, il sito è lento e fermo al 2019. Instagram c\'è ma pubblica poco.',
    google: { titolo: '4,6★ con 212 recensioni', punti_forti: ['212 recensioni, quasi tutte da 5 stelle'], problemi: ['nessuna risposta alle recensioni (da verificare)'] },
    sito: { titolo: 'lento da telefono: 38/100', punti_forti: ['ha la P.IVA e il telefono cliccabile'], problemi: ['si carica in 6,1 s', 'copyright fermo al 2019'] },
    social: {
      voto: 4,
      titolo: 'Instagram con circa 1.200 follower, ultimo post a settembre',
      profili: [
        { piattaforma: 'Instagram', indirizzo: 'https://www.instagram.com/pasticceria.aurora/', seguito: 'circa 1.200 follower', ultimo_post: 'settembre 2026', sicurezza: 'media' },
        { piattaforma: 'TikTok', indirizzo: '', seguito: 'non trovato', ultimo_post: 'non trovato', sicurezza: 'alta' },
      ],
      problemi: ['pubblica una volta al mese'],
    },
    altre_piattaforme: ['TripAdvisor: 4,5 su 80 recensioni'],
    dalla_foto: 'Insegna curata, ma gli orari non sono esposti.',
    proposte: [
      { servizio: 'Web & Digital', cosa: 'Sito nuovo, veloce da telefono, con ordini delle torte', perche: 'più ordini dai clienti che cercano su Google' },
      { servizio: 'Social & Advertising', cosa: 'Instagram due volte a settimana', perche: 'farsi vedere nel quartiere' },
    ],
    rompighiaccio: 'Ho visto che avete 212 recensioni da 4,6: complimenti! Il sito però da telefono ci mette 6 secondi.',
    da_verificare: ['chi gestisce Instagram', 'se la scheda Google è rivendicata'],
    ...extra,
  };
}

function rispostaClaude(contenuto, stop = 'end_turn', usage = {}) {
  return {
    id: 'msg_finto', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: contenuto, stop_reason: stop,
    stop_details: null, usage: { input_tokens: 2000, output_tokens: 400, ...usage },
  };
}
const testoJson = (o) => [{ type: 'text', text: JSON.stringify(o) }];

const BLOCCHI_RICERCA = [
  { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'Pasticceria Aurora Torino instagram' } },
  {
    type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1',
    content: [{ type: 'web_search_result', url: 'https://www.instagram.com/pasticceria.aurora/', title: 'Pasticceria Aurora (@pasticceria.aurora)', encrypted_content: 'x', page_age: null }],
  },
];
const TESTO_RICERCA = [
  { type: 'text', text: 'Instagram | https://www.instagram.com/pasticceria.aurora/ | circa 1.200 follower | settembre 2026 | media | ', citations: [{ type: 'web_search_result_location', url: 'https://www.instagram.com/pasticceria.aurora/', title: 'Pasticceria Aurora (@pasticceria.aurora)', cited_text: '1.200 follower', encrypted_index: 'x' }] },
  { type: 'text', text: 'instagram.com\nTikTok | non trovato\nALTRO: nessuno' },
];

// ------------------------------------------------------------------ scenari
export const SCENARI = {
  felice: {
    lettura: lettura(),
    places: { places: [luogo({ id: 'p0', displayName: { text: 'Caffè Aurora' }, nationalPhoneNumber: '011 000 0000', rating: 4.1 }), luogo(), luogo({ id: 'p2', displayName: { text: 'Aurora Viaggi' } })] },
    pagespeed: { lighthouseResult: { finalDisplayedUrl: 'https://www.pasticceriaaurora.it/', categories: { performance: { score: 0.38 }, seo: { score: 0.82 }, accessibility: { score: 0.7 }, 'best-practices': { score: 0.9 } }, audits: { 'largest-contentful-paint': { displayValue: '6,1 s' }, viewport: { score: 1 } } }, loadingExperience: {} },
    ricercaInPausa: true,
    scheda: scheda(),
  },
  nessuno: {
    lettura: lettura({ nome_attivita: 'Ferramenta Bianchi', tipo_attivita: 'ferramenta', citta: '', indirizzo: '', telefono: '', profili_social: [], segni_online: [], ricerca_google: 'Ferramenta Bianchi' }),
    places: {},
    ricercaErrore: 500,
    scheda: scheda({
      sintesi: 'Online non esiste: niente scheda Google, niente sito, niente social.',
      social: { voto: 0, titolo: 'nessun profilo trovato', profili: [], problemi: ['nessun profilo'] },
      proposte: [{ servizio: 'Web & Digital', cosa: 'Aprire la scheda Google <subito> & bene', perche: 'chi cerca «ferramenta» in zona lo trova' }],
    }),
  },
  sitoGiu: {
    lettura: lettura(),
    places: { places: [luogo({ websiteUri: 'http://127.0.0.1:9/' })] },
    pagespeedErrore: { status: 500, corpo: { error: { code: 500, message: 'Lighthouse returned error: FAILED_DOCUMENT_REQUEST' } } },
    scheda: scheda(),
  },
  facebook: {
    lettura: lettura(),
    places: { places: [luogo({ websiteUri: 'https://www.facebook.com/pasticceriaaurora' })] },
    scheda: scheda(),
  },
  rifiuto: {
    lettura: lettura(),
    places: { places: [luogo()] },
    pagespeed: { lighthouseResult: { finalDisplayedUrl: 'http://127.0.0.1:9999/sito/aurora', categories: { performance: { score: 0.95 }, seo: { score: 0.95 } }, audits: {} } },
    schedaRifiuto: true,
  },
  lungo: {
    lettura: lettura(),
    places: { places: [luogo()] },
    pagespeed: { lighthouseResult: { categories: { performance: { score: 0.5 } }, audits: {} } },
    scheda: scheda({
      sintesi: 'Molto lungo & <strano> '.repeat(120),
      google: { titolo: 'x'.repeat(900), punti_forti: Array(9).fill('punto forte lunghissimo '.repeat(30)), problemi: Array(9).fill('problema <b>finto</b> '.repeat(30)) },
      social: { voto: 15, titolo: 't'.repeat(500), profili: Array(10).fill({ piattaforma: 'Instagram', indirizzo: 'javascript:alert(1)', seguito: 's'.repeat(300), ultimo_post: 'u'.repeat(300), sicurezza: 'bassa' }), problemi: [] },
      altre_piattaforme: Array(20).fill('piattaforma '.repeat(40)),
      proposte: Array(6).fill({ servizio: 'Brand & Strategia', cosa: 'c'.repeat(800), perche: 'p'.repeat(800) }),
      rompighiaccio: 'r'.repeat(2000),
      da_verificare: Array(20).fill('verifica '.repeat(50)),
    }),
  },
  illeggibile: {
    lettura: lettura({ leggibile: false, motivo: 'foto mossa', nome_attivita: '', ricerca_google: '' }),
  },
};

// ------------------------------------------------------------------ server
export function avvia(porta = 9999) {
  const stato = { scenario: SCENARI.felice, webhook: null, segreto: null, messaggi: [], registro: [], file: {} };

  function leggiCorpo(req) {
    return new Promise((ok) => {
      const parti = [];
      req.on('data', (c) => parti.push(c));
      req.on('end', () => ok(Buffer.concat(parti)));
    });
  }
  function json(res, codice, oggetto) {
    res.writeHead(codice, { 'content-type': 'application/json' });
    res.end(JSON.stringify(oggetto));
  }

  function claude(corpo, res) {
    const sc = stato.scenario;
    const primo = corpo.messages && corpo.messages[0];
    const contenuto = primo && Array.isArray(primo.content) ? primo.content : [];
    if (contenuto.some((b) => b.type === 'image')) return json(res, 200, rispostaClaude(testoJson(sc.lettura)));
    if (Array.isArray(corpo.tools) && corpo.tools.length) {
      if (sc.ricercaErrore) return json(res, sc.ricercaErrore, { type: 'error', error: { type: 'api_error', message: 'Errore interno finto' } });
      const seguito = corpo.messages.length > 1;
      if (sc.ricercaInPausa && !seguito) return json(res, 200, rispostaClaude(BLOCCHI_RICERCA, 'pause_turn', { server_tool_use: { web_search_requests: 1 } }));
      return json(res, 200, rispostaClaude(TESTO_RICERCA, 'end_turn', { server_tool_use: { web_search_requests: seguito ? 2 : 3 } }));
    }
    if (sc.schedaRifiuto) {
      return json(res, 200, { ...rispostaClaude([], 'refusal'), stop_details: { type: 'refusal', category: 'cyber', explanation: 'finto' } });
    }
    return json(res, 200, rispostaClaude(testoJson(sc.scheda), 'end_turn', { input_tokens: 9000, output_tokens: 1500 }));
  }

  const server = createServer(async (req, res) => {
    const corpoGrezzo = await leggiCorpo(req);
    const url = new URL(req.url, 'http://127.0.0.1');
    let corpo = null;
    try {
      corpo = corpoGrezzo.length ? JSON.parse(corpoGrezzo.toString('utf8')) : null;
    } catch (e) {
      corpo = corpoGrezzo.toString('utf8');
    }
    const voce = { metodo: req.method, percorso: url.pathname, query: Object.fromEntries(url.searchParams), intestazioni: req.headers, corpo };
    stato.registro.push(voce);
    const p = url.pathname;
    const tg = '/telegram/bot' + TOKEN + '/';

    if (p.startsWith(tg)) {
      const metodo = p.slice(tg.length);
      const dati = Object.assign({}, voce.query, typeof corpo === 'object' && corpo ? corpo : {});
      if (metodo === 'getWebhookInfo') return json(res, 200, { ok: true, result: { url: stato.webhook || '' } });
      if (metodo === 'setWebhook') {
        stato.webhook = dati.url;
        stato.segreto = dati.secret_token;
        return json(res, 200, { ok: true, result: true });
      }
      if (metodo === 'deleteWebhook') return json(res, 200, { ok: true, result: true });
      if (metodo === 'getFile') return json(res, 200, { ok: true, result: { file_id: dati.file_id, file_path: 'photos/' + dati.file_id } });
      if (metodo === 'sendMessage') {
        stato.messaggi.push({ chat_id: String(dati.chat_id), text: dati.text, parse_mode: dati.parse_mode, anteprima_spenta: dati.disable_web_page_preview, tutto: dati });
        return json(res, 200, { ok: true, result: { message_id: stato.messaggi.length, chat: { id: Number(dati.chat_id) }, text: dati.text } });
      }
      return json(res, 404, { ok: false, description: 'metodo finto mancante: ' + metodo });
    }
    if (p.startsWith('/telegram/file/bot' + TOKEN + '/photos/')) {
      const id = p.split('/').pop();
      const dati = stato.file[id];
      if (!dati) return json(res, 404, { ok: false });
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      return res.end(dati);
    }
    if (p === '/anthropic/v1/messages') return claude(corpo, res);
    if (p === '/places/v1/places:searchText') return json(res, 200, stato.scenario.places || {});
    if (p === '/pagespeed/v5/runPagespeed') {
      const e = stato.scenario.pagespeedErrore;
      if (e) return json(res, e.status, e.corpo);
      return json(res, 200, stato.scenario.pagespeed || { lighthouseResult: { categories: {}, audits: {} } });
    }
    if (p === '/sito/aurora') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(PAGINA_AURORA);
    }
    json(res, 404, { errore: 'percorso finto mancante', percorso: p });
  });

  return new Promise((ok) => server.listen(porta, '127.0.0.1', () => ok({ server, stato })));
}
