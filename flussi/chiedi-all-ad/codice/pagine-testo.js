// ── Lettura delle pagine da n8n: dal codice HTML al testo (stesso testo in ogni nodo che lo usa) ──
// Inserito da N8N/flussi/chiedi-all-ad/leggi-pagine.mjs: le modifiche vanno fatte lì e nei file di codice/.
const LT = (() => {
  const testo = (v) => (v === null || v === undefined ? '' : String(v)).trim();
  const taglia = (v, n) => { if (!(n > 0)) return ''; const c = Array.from(testo(v)); return c.length > n ? c.slice(0, n - 1).join('') + '…' : c.join(''); };
  /** Chiave per i doppioni: senza schema, www, frammento e barra finale. */
  const chiave = (u) => testo(u).toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/#.*$/, '').replace(/\/+$/, '');
  // L'host vero: dopo l'ULTIMA @ prima del percorso, tolti tab e a capo, come lo legge il nodo HTTP (bar.it:@officina.internal → officina.internal).
  const hostDi = (u) => { const m = testo(u).replace(/[\t\n\r]/g, '').toLowerCase().match(/^[a-z]+:\/\/(?:[^/?#\\]*@)?([^/?#\\:@]+)/); return m ? m[1].replace(/^www\./, '') : ''; };
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

  // Tutto in un tempo che cresce come la pagina, mai col suo quadrato: una pagina scritta apposta (mille «<!--» senza
  // chiusura) con le espressioni regolari pigre teneva fermo il nodo per minuti. Si scorre con indexOf, e la pagina
  // si legge al massimo per il primo milione di caratteri.
  const MASSIMO_HTML = 1000000;
  /** Toglie i pezzi da «apre» a «chiude» (senza maiuscole/minuscole). Senza chiusura, si taglia fino in fondo. */
  function togli(h, apre, chiude, alPosto = ' ') {
    const basso = h.toLowerCase();
    let fuori = '';
    let da = 0;
    for (;;) {
      let i = basso.indexOf(apre, da);
      // «<script» deve essere il tag, non «<scripts»: dopo il nome viene uno spazio, «>» o «/».
      while (i >= 0 && /^[a-z]$/.test(apre.slice(-1)) && /[a-z0-9-]/.test(basso[i + apre.length] || '')) i = basso.indexOf(apre, i + 1);
      if (i < 0) { fuori += h.slice(da); break; }
      fuori += h.slice(da, i) + alPosto;
      const fine = basso.indexOf(chiude, i + apre.length);
      if (fine < 0) {
        // Un commento senza chiusura (anche la scritta «<!--» dentro uno script) non cancella il resto della pagina:
        // si toglie solo l'apertura, e le altre aperture che seguono, senza più cercare chiusure.
        if (chiude === '-->') fuori += h.slice(i + apre.length).split(apre).join(alPosto);
        break;
      }
      const chiusa = basso.indexOf('>', fine);
      da = chiusa < 0 ? h.length : chiusa + 1;
      if (chiude === '-->') da = fine + 3;
    }
    return fuori;
  }
  /** Toglie i tag rimasti: «<…>» diventa uno spazio; un «<» senza «>» dopo resta com'è. */
  function senzaTag(h) {
    let fuori = '';
    let da = 0;
    for (;;) {
      const i = h.indexOf('<', da);
      if (i < 0) { fuori += h.slice(da); break; }
      const f = h.indexOf('>', i + 1);
      if (f < 0) { fuori += h.slice(da); break; }
      fuori += h.slice(da, i) + ' ';
      da = f + 1;
    }
    return fuori;
  }
  /** Il contenuto dei blocchi <script type="application/ld+json">: indirizzo, telefono e orari scritti per Google. */
  function datiStrutturati(h) {
    const basso = h.toLowerCase();
    const out = [];
    let da = 0;
    while (out.length < 5) {
      const i = basso.indexOf('<script', da);
      if (i < 0) break;
      const f = basso.indexOf('>', i);
      if (f < 0) break;
      const chiude = basso.indexOf('</script', f);
      if (chiude < 0) break;
      if (basso.slice(i, f).includes('application/ld+json')) {
        const j = h.slice(f + 1, chiude).replace(/\s+/g, ' ').trim();
        if (j) out.push(taglia(j, 3000));
      }
      da = chiude + 8;
    }
    return out;
  }

  /** Da HTML a testo leggibile: titolo, descrizione, dati strutturati (indirizzo, telefono, orari) e il corpo. */
  function htmlInTesto(html) {
    let h = String(html ?? '').slice(0, MASSIMO_HTML);
    // Titolo e descrizione stanno in cima: si cercano nei primi 200.000 caratteri, con una sola espressione per tipo.
    const cima = h.slice(0, 200000);
    const titolo = decodifica((cima.match(/<title[^>]{0,200}>([^<]{0,500})/i) || ['', ''])[1]).replace(/\s+/g, ' ').trim();
    const desc = decodifica((cima.match(/<meta[^>]{0,300}name=["']description["'][^>]{0,300}?content=["']([^"']{0,2000})/i)
      || cima.match(/<meta[^>]{0,300}content=["']([^"']{0,2000})["'][^>]{0,300}name=["']description["']/i) || ['', ''])[1]).replace(/\s+/g, ' ').trim();
    const strutturati = datiStrutturati(h);
    h = togli(h, '<!--', '-->');
    for (const tag of ['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'object']) h = togli(h, `<${tag}`, `</${tag}`);
    h = h.replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|header|footer|li|ul|ol|h[1-6]|tr|table|address|blockquote|nav|main|aside|dd|dt|figcaption)\s*>/gi, '\n')
      .replace(/<li(?=[\s>\/])/gi, '\n<li')
      .replace(/<\/t[dh]\s*>/gi, ' ');
    h = senzaTag(h);
    const corpo = decodifica(h).replace(/[ \t\u00a0\u202f]+/g, ' ').split('\n').map((r) => r.trim()).filter(Boolean)
      .filter((r, i, a) => r !== a[i - 1]).join('\n');
    const parti = [titolo ? `Titolo della pagina: ${titolo}` : '', desc ? `Descrizione della pagina: ${desc}` : '',
      strutturati.length ? `Dati strutturati della pagina: ${strutturati.join(' ')}` : '', corpo];
    // < e > diventano ‹ ›, come fa il 12 con ogni dato (datoPulito): la citazione copiata dall'AD resta confrontabile.
    // Via anche gli spazi invisibili (Weebly li mette davanti alle parole): l'AD non li copia, e il confronto fallirebbe.
    return parti.filter(Boolean).join('\n').replace(/[\u200b-\u200d\u2060\ufeff]/g, '').replace(/</g, '‹').replace(/>/g, '›');
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

  /** I collegamenti della pagina verso lo stesso sito che portano a menu, contatti, orari, chi siamo, prenotazioni.
   *  Si scorre con indexOf (mai un'espressione pigra su tutta la pagina), al massimo 2.000 collegamenti. */
  function sottopagine(html, base) {
    const out = [];
    const casa = hostDi(base);
    const utile = /men[uù]|carta|listino|piatti|contatt|orari|dove-siamo|dove|chi-siamo|chi_siamo|chisiamo|about|storia|prenot|booking|reserv|info/i;
    const h = String(html ?? '').slice(0, MASSIMO_HTML);
    const basso = h.toLowerCase();
    let da = 0;
    for (let n = 0; n < 2000; n++) {
      let i = basso.indexOf('<a', da);
      while (i >= 0 && !/[\s>]/.test(basso[i + 2] || '')) i = basso.indexOf('<a', i + 2);
      if (i < 0) break;
      const f = basso.indexOf('>', i);
      if (f < 0) break;
      da = f + 1;
      const href = (h.slice(i, f + 1).match(/href=["']([^"'#][^"']*)["']/i) || [])[1];
      if (!href) continue;
      const url = assoluto(href, base);
      if (!url || hostDi(url) !== casa) continue;
      // La chiusura si cerca solo nei 500 caratteri dopo: cercarla fino in fondo, per 2.000 collegamenti, era quadratico.
      const k = basso.slice(f + 1, f + 502).indexOf('</a');
      const dentro = h.slice(f + 1, k < 0 ? f + 201 : f + 1 + k);
      const scritta = decodifica(senzaTag(dentro)).replace(/\s+/g, ' ').trim();
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
      const corpo = (typeof j.data === 'string' ? j.data : typeof j.body === 'string' ? j.body : '').slice(0, MASSIMO_HTML);
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
