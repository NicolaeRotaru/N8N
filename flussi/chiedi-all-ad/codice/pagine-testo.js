// ── Lettura delle pagine da n8n: dal codice HTML al testo (stesso testo in ogni nodo che lo usa) ──
// Inserito da N8N/flussi/chiedi-all-ad/leggi-pagine.mjs: le modifiche vanno fatte lì e nei file di codice/.
const LT = (() => {
  const testo = (v) => (v === null || v === undefined ? '' : String(v)).trim();
  const taglia = (v, n) => { const c = Array.from(testo(v)); return c.length > n ? c.slice(0, n - 1).join('') + '…' : c.join(''); };
  /** Chiave per i doppioni: senza schema, www, frammento e barra finale. */
  const chiave = (u) => testo(u).toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/#.*$/, '').replace(/\/+$/, '');
  const hostDi = (u) => { const m = testo(u).toLowerCase().match(/^[a-z]+:\/\/([^/?#:]+)/); return m ? m[1].replace(/^www\./, '') : ''; };
  // Entità HTML più comuni nei siti italiani; le numeriche si leggono tutte.
  const ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
    ndash: '–', mdash: '—', hellip: '…', middot: '·', deg: '°', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™', bull: '•',
    agrave: 'à', aacute: 'á', egrave: 'è', eacute: 'é', igrave: 'ì', iacute: 'í', ograve: 'ò', oacute: 'ó', ugrave: 'ù', uacute: 'ú',
    Agrave: 'À', Egrave: 'È', Eacute: 'É', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù', ccedil: 'ç', ntilde: 'ñ', iuml: 'ï', ouml: 'ö', uuml: 'ü' };
  const decodifica = (s) => String(s).replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (tutto, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : tutto;
    }
    return Object.prototype.hasOwnProperty.call(ENTITA, e) ? ENTITA[e] : tutto;
  });

  /** Da HTML a testo leggibile: titolo, descrizione, dati strutturati (indirizzo, telefono, orari) e il corpo. */
  function htmlInTesto(html) {
    let h = String(html ?? '');
    const titolo = decodifica((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || ['', ''])[1]).replace(/\s+/g, ' ').trim();
    const desc = decodifica((h.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || h.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i) || ['', ''])[1]).replace(/\s+/g, ' ').trim();
    const strutturati = [];
    for (const m of h.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      const j = m[1].replace(/\s+/g, ' ').trim();
      if (j) strutturati.push(taglia(j, 3000));
    }
    h = h.replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template|iframe|object|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|header|footer|li|ul|ol|h[1-6]|tr|table|address|blockquote|nav|main|aside|dd|dt|figcaption)\s*>/gi, '\n')
      .replace(/<(li)\b[^>]*>/gi, '\n')
      .replace(/<\/t[dh]\s*>/gi, ' | ')
      .replace(/<[^>]+>/g, ' ');
    const corpo = decodifica(h).replace(/[ \t\u00a0\u202f]+/g, ' ').split('\n').map((r) => r.trim()).filter(Boolean)
      .filter((r, i, a) => r !== a[i - 1]).join('\n');
    const parti = [titolo ? `Titolo della pagina: ${titolo}` : '', desc ? `Descrizione della pagina: ${desc}` : '',
      strutturati.length ? `Dati strutturati della pagina: ${strutturati.join(' ')}` : '', corpo];
    // < e > diventano ‹ ›, come fa il 12 con ogni dato (datoPulito): la citazione copiata dall'AD resta confrontabile.
    // Via anche gli spazi invisibili (Weebly li mette davanti alle parole): l'AD non li copia, e il confronto fallirebbe.
    return parti.filter(Boolean).join('\n').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/</g, '‹').replace(/>/g, '›');
  }

  /** Assoluto: un href relativo diventa un indirizzo intero, rispetto alla pagina da cui viene. */
  function assoluto(href, base) {
    const h = decodifica(testo(href));
    if (!h || /^(mailto|tel|javascript|data|whatsapp|sms):/i.test(h) || h.startsWith('#')) return '';
    if (/^https?:\/\//i.test(h)) return h;
    const b = testo(base).match(/^(https?:)\/\/([^/?#]+)([^?#]*)/i);
    if (!b) return '';
    if (h.startsWith('//')) return b[1] + h;
    if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return '';
    const origine = `${b[1]}//${b[2]}`;
    const cartella = (b[3] || '/').replace(/[^/]*$/, '') || '/';
    const percorso = h.startsWith('/') ? h : h.startsWith('?') ? (b[3] || '/') + h : cartella + h;
    const i = percorso.search(/[?#]/);
    const solo = i < 0 ? percorso : percorso.slice(0, i);
    const resto = i < 0 ? '' : percorso.slice(i).replace(/#.*$/, '');
    const pezzi = [];
    for (const p of solo.split('/').slice(1)) { if (p === '..') pezzi.pop(); else if (p !== '.') pezzi.push(p); }
    return `${origine}/${pezzi.join('/')}${resto}`;
  }

  /** I collegamenti della pagina verso lo stesso sito che portano a menu, contatti, orari, chi siamo, prenotazioni. */
  function sottopagine(html, base) {
    const out = [];
    const casa = hostDi(base);
    const utile = /men[uù]|carta|listino|piatti|contatt|orari|dove-siamo|dove|chi-siamo|chi_siamo|chisiamo|about|storia|prenot|booking|reserv|info/i;
    for (const m of String(html ?? '').matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const url = assoluto(m[1], base);
      if (!url || hostDi(url) !== casa) continue;
      const scritta = decodifica(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (!utile.test(url.replace(/^[a-z]+:\/\/[^/]+/i, '')) && !utile.test(scritta)) continue;
      out.push(url);
    }
    return out;
  }

  /** Le risposte del nodo HTTP accanto alle richieste: { url, ok, testo, html, motivo }. */
  function risposte(richieste, uscite) {
    const fuori = [];
    (uscite || []).forEach((it, i) => {
      const k = it && it.pairedItem && typeof it.pairedItem.item === 'number' ? it.pairedItem.item : i;
      const url = testo(richieste[k] && richieste[k].json && richieste[k].json.url);
      if (!url) return;
      const j = (it && it.json) || {};
      if (j.error) { fuori.push({ url, ok: false, motivo: taglia(typeof j.error === 'string' ? j.error : (j.error.message || 'errore di rete'), 120) }); return; }
      const codice = Number(j.statusCode) || 0;
      // I rinvii non li segue il nodo HTTP (potrebbero portare a un indirizzo interno): li riprende il giro dopo,
      // passando dallo stesso controllo degli altri indirizzi.
      if (codice >= 300 && codice < 400) {
        const dove = assoluto((j.headers || {}).location, url);
        fuori.push({ url, ok: false, rinvio: dove, motivo: dove ? `rinvia a ${taglia(dove, 120)}` : `rinvia altrove (${codice})` });
        return;
      }
      if (codice && (codice < 200 || codice >= 300)) { fuori.push({ url, ok: false, motivo: `la pagina risponde ${codice}` }); return; }
      const tipo = testo((j.headers || {})['content-type']).toLowerCase();
      const corpo = typeof j.data === 'string' ? j.data : typeof j.body === 'string' ? j.body : '';
      if (tipo && !/text\/html|application\/xhtml|text\/plain/.test(tipo)) { fuori.push({ url, ok: false, motivo: `non è una pagina di testo (${taglia(tipo, 40)})` }); return; }
      if (/^%PDF/.test(corpo)) { fuori.push({ url, ok: false, motivo: 'è un PDF' }); return; }
      const t = /text\/plain/.test(tipo) ? corpo.replace(/</g, '‹').replace(/>/g, '›') : htmlInTesto(corpo);
      if (testo(t).length < 20) { fuori.push({ url, ok: false, motivo: 'pagina vuota (forse scritta solo con JavaScript)' }); return; }
      fuori.push({ url, ok: true, testo: t, html: corpo });
    });
    return fuori;
  }

  return { testo, taglia, chiave, hostDi, htmlInTesto, assoluto, sottopagine, risposte };
})();
