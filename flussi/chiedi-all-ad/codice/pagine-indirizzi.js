// ── Lettura delle pagine da n8n: gli indirizzi (stesso testo in ogni nodo che li usa) ──
// Inserito da N8N/flussi/chiedi-all-ad/leggi-pagine.mjs: le modifiche vanno fatte lì e nei file di codice/.
// Perché esiste: la routine dell'AD cerca sul web ma non apre le pagine, e il controllo delle citazioni del 12
// confronta ogni dato col testo delle pagine lette. Quel testo lo scarica n8n, che ha la rete libera.
// Niente URL né require: il codice gira nel nodo Code di n8n, si legge tutto con le espressioni regolari.
const LI = (() => {
  const testo = (v) => (v === null || v === undefined ? '' : String(v)).trim();
  const taglia = (v, n) => { if (!(n > 0)) return ''; const c = Array.from(testo(v)); return c.length > n ? c.slice(0, n - 1).join('') + '…' : c.join(''); };
  /** Chiave per i doppioni: senza schema, www, frammento e barra finale. */
  const chiave = (u) => testo(u).toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/#.*$/, '').replace(/\/+$/, '');
  // L'host vero: dopo l'ULTIMA @ prima del percorso, tolti tab e a capo, come lo legge il nodo HTTP (bar.it:@officina.internal → officina.internal).
  const hostDi = (u) => { const m = testo(u).replace(/[\t\n\r]/g, '').toLowerCase().match(/^[a-z]+:\/\/(?:[^/?#\\]*@)?([^/?#\\:@]+)/); return m ? m[1].replace(/^www\./, '') : ''; };
  // Meta: mai letti (Termini di Meta). Mappe e portali: mai letti in automatico. Le stesse regole del 12.
  const META = /(^|\.)(facebook\.com|facebook\.net|fb\.com|fb\.me|fb\.watch|instagram\.com|instagr\.am|cdninstagram\.com|fbcdn\.net|ig\.me|threads\.com|threads\.net|messenger\.com|whatsapp\.com|wa\.me)$/;
  const ePortale = (h, p) => /(^|\.)(tripadvisor|thefork|lafourchette|glovoapp|glovo)\.[a-z.]{2,}$/.test(h)
    || /^maps\.google\.[a-z.]{2,}$/.test(h) || /(^|\.)(goo\.gl|g\.page|maps\.app\.goo\.gl)$/.test(h)
    || (/(^|\.)google\.[a-z.]{2,}$/.test(h) && /^\/maps(\/|$)/.test(p));
  // Indirizzi interni: n8n sta su una rete con servizi suoi (l'officina, n8n stesso). Una pagina scritta apposta
  // potrebbe far scrivere all'AD «leggi http://officina.internal:8080/…»: quegli indirizzi non si aprono mai.
  const SUFFISSI_INTERNI = /\.(local|localdomain|localhost|internal|intranet|lan|home|corp|svc|test|invalid|example|arpa|onion)$/;
  // Anche i servizi DNS «jolly», che fanno puntare un nome pubblico a qualunque indirizzo (127.0.0.1.nip.io → 127.0.0.1).
  const DOMINI_VIETATI = /(^|\.)(sliplane\.app|sliplane\.io|anthropic\.com|claude\.ai|nip\.io|sslip\.io|xip\.io|traefik\.me|localtest\.me|lvh\.me|vcap\.me|lacolhost\.com|readme\.localtest\.me)$/;
  const TLD_NUDI = 'it|com|net|org|eu|info|biz|me|io|app|site|online|shop|store|wine|bar|pizza|restaurant|menu|co|uk|de|fr|ch|es|at|nl|be|sm|cafe|club|live|page|xyz|wiki|news';
  const RE_INDIRIZZI = new RegExp(`(https?:\\/\\/[^\\s<>"'«»()\\[\\]{}|\\\\^\`]+)|((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:${TLD_NUDI})(?:\\/[^\\s<>"'«»()\\[\\]{}|\\\\^\`]*)?)(?![a-z0-9-])`, 'gi');

  /** L'indirizzo si può aprire da n8n? { ok, url, chiave } oppure { ok: false, url, motivo }. */
  function indirizzoSicuro(grezzo) {
    let t = testo(grezzo).replace(/[)\].,;:!?»"'›>]+$/, '');
    if (!t) return { ok: false, url: '', motivo: 'vuoto' };
    if (t.length > 400) return { ok: false, url: t.slice(0, 200), motivo: 'indirizzo troppo lungo' };
    if (!/^[a-z][a-z0-9+.-]*:/i.test(t) && /^[a-z0-9.-]+\.[a-z]{2,}([/?#]|$)/i.test(t)) t = 'https://' + t;
    const m = t.match(/^(https?):\/\/([^/?#\s]+)([^\s#]*)/i);
    if (!m) return { ok: false, url: t, motivo: 'non è un indirizzo web' };
    const schema = m[1].toLowerCase();
    const autorita = m[2];
    if (autorita.includes('@')) return { ok: false, url: t, motivo: 'indirizzo con utente e password' };
    if (/[\[\]]/.test(autorita)) return { ok: false, url: t, motivo: 'indirizzo IP' };
    const hp = autorita.toLowerCase().match(/^([^:]+)(?::(\d*))?$/);
    if (!hp) return { ok: false, url: t, motivo: 'indirizzo non leggibile' };
    const host = hp[1].replace(/\.$/, '');
    const porta = hp[2];
    if (porta !== undefined && porta !== '' && !((schema === 'http' && porta === '80') || (schema === 'https' && porta === '443'))) {
      return { ok: false, url: t, motivo: 'porta non standard' };
    }
    const etichette = host.split('.');
    if (etichette.length < 2 || etichette.some((e) => !e)) return { ok: false, url: t, motivo: 'nome senza dominio (rete interna)' };
    if (etichette.every((e) => /^(0x[0-9a-f]+|\d+)$/.test(e))) return { ok: false, url: t, motivo: 'indirizzo IP' };
    if (!/^[a-z0-9.-]+$/.test(host)) return { ok: false, url: t, motivo: 'nome non leggibile' };
    if (!/\.([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(host)) return { ok: false, url: t, motivo: 'dominio non valido' };
    if (host === 'localhost' || SUFFISSI_INTERNI.test(host)) return { ok: false, url: t, motivo: 'rete interna' };
    if (DOMINI_VIETATI.test(host)) return { ok: false, url: t, motivo: 'servizio della macchina' };
    const percorso = m[3] || '';
    // Caratteri che un indirizzo web non ha mai (RFC 3986): li mette solo chi vuole gonfiare la richiesta o confondere il nodo HTTP.
    if (/[<>"{}|\\^`]/.test(percorso)) return { ok: false, url: t, motivo: 'caratteri non validi' };
    if (META.test(host)) return { ok: false, url: t, motivo: 'Facebook/Instagram: non si legge' };
    if (ePortale(host, (percorso.match(/^[^?]*/) || [''])[0].toLowerCase())) return { ok: false, url: t, motivo: 'mappe o portale: solo frammento' };
    // 26/11/2026 (revisore di sicurezza del sito): un dominio che IMITA Google, le mappe o Meta (maps.google.ab.cd,
    // google-maps.example.com, facebook.it-locale.com) non si apre: può puntare dove vuole, anche dentro il server.
    // Quelli veri sono già fermati sopra (Meta) o sotto (mappe e portali).
    // È un filtro di FORMA (i casi evidenti), non la difesa: la difesa è https col certificato verificato. Google vero: solo
    // (www.)google.<estensione vera>.
    if (!/^(www\.)?google\.(com|it|de|fr|es|ch|at|nl|be|co\.uk|com\.br|ca|pl|pt|ie|eu)$/.test(host) && /(^|[.-])(google|gmaps|goo-gl|maps|facebook|instagram|whatsapp)([.-]|$)/.test(host)) {
      return { ok: false, url: t, motivo: 'imita Google, le mappe o Meta: non si legge' };
    }
    if (/\.(jpe?g|png|gif|webp|svg|ico|css|js|mp4|mov|mp3|zip|docx?|xlsx?)(\?|$)/i.test(percorso)) return { ok: false, url: t, motivo: 'non è una pagina' };
    // 26/11/2026 (AD, decisione 🟡): si legge SOLO in https, anche il sito del titolare. Un indirizzo http si prova in https
    // (porta 443, certificato verificato: un nome che punta dentro il server non ha il certificato giusto). Se il sito non ha
    // https non si apre, e nei fatti diventa «sito non protetto».
    const url = `https://${host}${percorso || '/'}`;
    return { ok: true, url, chiave: chiave(url) };
  }

  /** Gli indirizzi scritti in un testo, anche senza https:// (mai le email). */
  function indirizziIn(t) {
    const s = String(t ?? '');
    const out = [];
    for (const m of s.matchAll(RE_INDIRIZZI)) {
      const prima = s[m.index - 1] || '';
      if (prima === '@' || (m[2] && /[\w.-]/.test(prima))) continue;
      out.push(m[0]);
    }
    return out;
  }

  return { testo, taglia, chiave, hostDi, indirizzoSicuro, indirizziIn };
})();
