// ===== Aiuti comuni del workflow 16 · Montatore (blocco uguale in tutti i nodi Code: si modifica qui e si rigenera) =====
const CARTELLA_MIME = 'application/vnd.google-apps.folder';
const ESTENSIONI_VIDEO = ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', 'mts', 'm2ts', '3gp', 'hevc', 'mpg', 'mpeg'];
const ESTENSIONI_FOTO = ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'avif'];
const ESTENSIONI_AUDIO = ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'oga', 'flac', 'opus'];
const MARCHIO_NEUTRO = { colori: { primario: '#222222', secondario: '#F5F5F5', testo: '#FFFFFF' }, font: 'Inter', font_testo: 'Inter' };
const TIPI_CALENDARIO = { reel: 'reel', storia_video: 'storia', post: 'post', carosello: 'carosello', storia_foto: 'storia' };
const NOMI_TIPO = { reel: 'reel', storia_video: 'storia video', post: 'post', carosello: 'carosello', storia_foto: 'storia foto' };

function testo(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function norm(v) { return testo(v).toLowerCase(); }
function senzaAccenti(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function chiaveNome(v) { return senzaAccenti(norm(v)).replace(/[^a-z0-9]+/g, ' ').trim(); }
function siNo(v, seVuoto) {
  const t = norm(v);
  if (!t) return !!seVuoto;
  return ['si', 'sì', 'yes', 'true', '1', 'x', 'vero', 'attivo', 'ok'].includes(t);
}
function intero(v, predefinito) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : predefinito; }
function numero(v, predefinito) {
  if (v === null || v === undefined || v === '') return predefinito;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : predefinito;
}
function slug(v, max) {
  const s = senzaAccenti(norm(v)).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max || 40).replace(/-+$/g, '');
  return s || 'senza-nome';
}
function due(n) { return String(n).padStart(2, '0'); }
function accorcia(s, n) { const t = String(s === null || s === undefined ? '' : s); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
// Testo sicuro per Telegram in modalità HTML.
function h(v) { return String(v === null || v === undefined ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// Il testo che arriva dal foglio o da Drive è un DATO: non deve poter aprire o chiudere i tag del prompt.
function dato(v) { return testo(v).replace(/</g, '‹').replace(/>/g, '›'); }
function virgola(n, cifre) { return Number(n).toFixed(cifre === undefined ? 1 : cifre).replace('.', ','); }

// Data e ora di Roma (anche col cambio dell'ora legale) senza librerie.
function partiRoma(d) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = {};
  for (const x of f.formatToParts(d || new Date())) p[x.type] = x.value;
  return { anno: Number(p.year), mese: Number(p.month), giorno: Number(p.day), data: p.year + '-' + p.month + '-' + p.day, ora: p.hour + ':' + p.minute };
}
function giorniNelMese(anno, mese) { return new Date(Date.UTC(anno, mese, 0)).getUTCDate(); }
function giornoSettimana(anno, mese, giorno) { return new Date(Date.UTC(anno, mese - 1, giorno)).getUTCDay(); }
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
function leggibileData(data, ora) {
  const m = testo(data).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return testo(data) + ' ' + testo(ora);
  const [a, me, g] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return GIORNI_BREVI[giornoSettimana(a, me, g)] + ' ' + g + '/' + me + (ora ? ' ore ' + ora : '');
}
// Il mese del piano: quello scritto, altrimenti il mese in corso fino al giorno «giornoLimite» compreso (servizio fatto a
// inizio mese per quel mese), poi il mese dopo (servizio fatto a fine mese per il mese che viene).
function meseDelPiano(v, giornoLimite) {
  const s = testo(v);
  const m = s.match(/^(\d{4})[-/.](\d{1,2})$/) || s.match(/^(\d{1,2})[-/.](\d{4})$/);
  let anno; let mese;
  if (m && m[1].length === 4) { anno = Number(m[1]); mese = Number(m[2]); } else if (m) { anno = Number(m[2]); mese = Number(m[1]); }
  if (!(mese >= 1 && mese <= 12)) {
    const oggi = partiRoma();
    if (oggi.giorno <= (Number(giornoLimite) || 0)) { anno = oggi.anno; mese = oggi.mese; } else {
      anno = oggi.mese === 12 ? oggi.anno + 1 : oggi.anno;
      mese = oggi.mese === 12 ? 1 : oggi.mese + 1;
    }
  }
  return { anno, mese, chiave: anno + '-' + due(mese), nome: MESI[mese - 1] + ' ' + anno, giorni: giorniNelMese(anno, mese) };
}
// Pasqua (calendario gregoriano) per Pasqua e Pasquetta.
function pasqua(anno) {
  const a = anno % 19; const b = Math.floor(anno / 100); const c = anno % 100; const d = Math.floor(b / 4); const e = b % 4;
  const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const hh = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - hh - k) % 7; const m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const mese = Math.floor((hh + l - 7 * m + 114) / 31); const giorno = ((hh + l - 7 * m + 114) % 31) + 1;
  return { mese, giorno };
}
function festivita(anno, mese) {
  const fisse = [[1, 1, 'Capodanno'], [1, 6, 'Epifania'], [2, 14, 'San Valentino'], [3, 8, 'Festa della donna'], [4, 25, 'Festa della Liberazione'], [5, 1, 'Festa dei lavoratori'],
    [6, 2, 'Festa della Repubblica'], [8, 15, 'Ferragosto'], [10, 31, 'Halloween'], [11, 1, 'Ognissanti'], [12, 8, 'Immacolata'], [12, 24, 'Vigilia di Natale'],
    [12, 25, 'Natale'], [12, 26, 'Santo Stefano'], [12, 31, 'San Silvestro']];
  const out = fisse.filter((x) => x[0] === mese).map((x) => ({ giorno: x[1], nome: x[2] }));
  const p = pasqua(anno);
  const pasquetta = new Date(Date.UTC(anno, p.mese - 1, p.giorno + 1));
  if (p.mese === mese) out.push({ giorno: p.giorno, nome: 'Pasqua' });
  if (pasquetta.getUTCMonth() + 1 === mese) out.push({ giorno: pasquetta.getUTCDate(), nome: 'Pasquetta' });
  // festa della mamma: seconda domenica di maggio; festa del papà: 19 marzo
  if (mese === 5) { let n = 0; for (let g = 1; g <= 31; g++) if (giornoSettimana(anno, 5, g) === 0 && ++n === 2) { out.push({ giorno: g, nome: 'Festa della mamma' }); break; } }
  if (mese === 3) out.push({ giorno: 19, nome: 'Festa del papà' });
  return out.sort((a, b) => a.giorno - b.giorno);
}

// Google Drive: id da un link o da un id nudo.
function idDrive(v) {
  const s = testo(v);
  const m = s.match(/\/d\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || s.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s;
  return '';
}
function linkDrive(id) { return 'https://drive.google.com/file/d/' + id + '/view'; }
function linkCartella(id) { return 'https://drive.google.com/drive/folders/' + id; }
function estensione(nome) { const m = testo(nome).toLowerCase().match(/\.([a-z0-9]{1,5})$/); return m ? m[1] : ''; }
function eCartella(f) { return !!f && f.mimeType === CARTELLA_MIME; }
function eVideo(f) { return !eCartella(f) && (/^video\//i.test(testo(f.mimeType)) || ESTENSIONI_VIDEO.includes(estensione(f.name))); }
function eFoto(f) { return !eCartella(f) && !/heic|heif/i.test(testo(f.mimeType) + estensione(f.name)) && (/^image\/(jpeg|png|webp|tiff|avif)/i.test(testo(f.mimeType)) || ESTENSIONI_FOTO.includes(estensione(f.name))); }
function eHeic(f) { return !eCartella(f) && (/heic|heif/i.test(testo(f.mimeType)) || ['heic', 'heif'].includes(estensione(f.name))); }
function eAudio(f) { return !eCartella(f) && (/^audio\//i.test(testo(f.mimeType)) || ESTENSIONI_AUDIO.includes(estensione(f.name))); }
function byteDi(f) { const n = Number(f && f.size); return Number.isFinite(n) ? n : 0; }
function perNome(a, b) { return testo(a.name || a.nome).localeCompare(testo(b.name || b.nome), 'it', { numeric: true, sensitivity: 'base' }); }

// Che cosa contiene una sottocartella del servizio, dal nome: «video verticali», «Video Orizzontali», «foto»…
function ruoloCartella(nome) {
  const k = chiaveNome(nome);
  if (/orizzontal|landscape|horizontal|16 ?9/.test(k)) return 'video orizzontali';
  if (/vertical|portrait|9 ?16|reel|storie/.test(k)) return 'video verticali';
  if (/^video|clip|girat/.test(k)) return 'video';
  if (/foto|photo|immagin|scatt|pic/.test(k)) return 'foto';
  if (/musica|music|audio|canzon/.test(k)) return 'musica';
  return '';
}

// Righe del foglio (API values) → oggetti con le intestazioni della prima riga.
function righeFoglio(risposta) {
  const valori = (risposta && Array.isArray(risposta.values)) ? risposta.values : [];
  if (!valori.length) return [];
  const testa = valori[0].map((x) => norm(x));
  return valori.slice(1).map((r) => {
    const o = {};
    testa.forEach((k, i) => { if (k) o[k] = r[i] === undefined ? '' : r[i]; });
    return o;
  });
}

function coloreValido(c) { return /^#[0-9a-fA-F]{6}$/.test(testo(c)); }
function logoDi(v) {
  const s = testo(v);
  if (!s) return { tipo: 'nessuno', id: '', url: '' };
  const daDrive = /^https?:\/\/(drive|docs)\.google\.com\//i.test(s) || /^[A-Za-z0-9_-]{20,}$/.test(s);
  if (daDrive && idDrive(s)) return { tipo: 'drive', id: idDrive(s), url: '' };
  if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return { tipo: 'url', id: '', url: s };
  return { tipo: 'nessuno', id: '', url: '' };
}
// Il JSON «marchio» della scheda Clienti → i campi dell'officina (colori, font, font_testo, peso_titolo, stile) + il logo.
function leggiMarchio(v) {
  const neutro = JSON.parse(JSON.stringify(MARCHIO_NEUTRO));
  let m = null;
  try { m = JSON.parse(testo(v)); } catch (e) { m = null; }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { marchio: neutro, logo: logoDi(''), valido: false };
  const col = m.colori && typeof m.colori === 'object' ? m.colori : {};
  const colori = {};
  for (const k of ['primario', 'secondario', 'testo']) colori[k] = coloreValido(col[k]) ? testo(col[k]) : neutro.colori[k];
  const out = { colori, font: testo(m.font) || neutro.font, font_testo: testo(m.font_testo) || testo(m.font) || neutro.font };
  const peso = intero(m.peso_titolo, 0);
  if (peso >= 100 && peso <= 900) out.peso_titolo = peso;
  if (m.stile_foto && typeof m.stile_foto === 'object') out.stile = m.stile_foto;
  return { marchio: out, logo: logoDi(m.logo), valido: true };
}

// La richiesta per Claude (stesso schema dei workflow 03, 07, 08: risposta obbligata in JSON).
function corpoClaude(CFG, opz) {
  const contenuto = (opz.immagini || []).map((b64) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }));
  contenuto.push({ type: 'text', text: opz.testo });
  return {
    model: testo(CFG.ANTHROPIC_MODEL) || 'claude-opus-5-5',
    max_tokens: opz.max_tokens || 8000,
    fallbacks: 'default',
    output_config: { effort: testo(opz.effort) || 'medium', format: { type: 'json_schema', schema: opz.schema } },
    system: opz.sistema,
    messages: [{ role: 'user', content: contenuto }],
  };
}
// Il lavoro per l'AD («90 · Chiedi all'AD») al posto della richiesta per l'API di Claude: Nicola, 24/11, nessun flusso
// chiama più l'API a pagamento. Il prompt di sistema diventa il compito. Il messaggio va dentro se è corto, altrimenti
// negli allegati (pezzi da 120.000 caratteri, sotto i 512 KB dell'allegato). Le immagini vanno come file dell'officina
// (il percorso /file/…): all'AD non arrivano in base64, e così non si salvano nemmeno nella tabella degli allegati.
const FLUSSO_AD = '31 · Montatore';
function lavoroAD(corpo, percorsi) {
  if (!corpo || typeof corpo !== 'object') return { flusso: FLUSSO_AD, compito: '-', dati: null, schema: null, non_mandare: "niente da chiedere all'AD" };
  const sistema = typeof corpo.system === 'string' ? corpo.system : Array.isArray(corpo.system) ? corpo.system.map((b) => testo(b && b.text)).join('\n\n') : '';
  const parti = (Array.isArray(corpo.messages) ? corpo.messages : []).flatMap((m) => (Array.isArray(m && m.content) ? m.content : [{ type: 'text', text: testo(m && m.content) }]));
  const messaggio = parti.filter((b) => b && b.type === 'text').map((b) => String(b.text || '')).join('\n\n');
  const immagini = parti.filter((b) => b && b.type === 'image').length;
  // i percorsi del montatore sono «<lavoro>/<file>» (vedi percorsoOfficina): agli allegati serve «/file/<lavoro>/<file>»
  const vie = (Array.isArray(percorsi) ? percorsi : []).map(testo).filter(Boolean).map((p) => (p.startsWith('/file/') ? p : '/file/' + p.replace(/^\/+/, '')));
  const schema = (corpo.output_config && corpo.output_config.format && corpo.output_config.format.schema) || null;
  const allegati = [];
  let dati;
  if (messaggio.length > 6000) {
    const pezzi = [];
    for (let i = 0; i < messaggio.length; i += 120000) pezzi.push(messaggio.slice(i, i + 120000));
    pezzi.forEach((p, i) => allegati.push({ nome: pezzi.length > 1 ? 'messaggio ' + (i + 1) : 'messaggio', tipo: 'testo', contenuto: p }));
    dati = { messaggio: pezzi.length > 1 ? 'Il messaggio è negli allegati «messaggio 1»…«messaggio ' + pezzi.length + '», da leggere in ordine.' : "Il messaggio è nell'allegato «messaggio»." };
  } else {
    dati = { messaggio };
  }
  vie.forEach((p, i) => allegati.push({ nome: 'immagine ' + (i + 1), tipo: 'officina', percorso: p }));
  const compito = [
    sistema,
    '---',
    'Il messaggio su cui lavorare è in «dati.messaggio» (o negli allegati che indica): fai quello che chiede, seguendo le regole qui sopra.',
    vie.length ? 'Le immagini del messaggio sono negli allegati «immagine 1»…«immagine ' + vie.length + '», nello stesso ordine: aprile e guardale prima di rispondere.' : '',
    schema ? "In «risultato» metti l'oggetto che rispetta lo schema." : '',
  ].filter(Boolean).join('\n\n');
  const lavoro = { flusso: FLUSSO_AD, compito, dati, schema, ...(allegati.length ? { allegati } : {}) };
  if (immagini > vie.length) lavoro.non_mandare = "immagini senza il percorso dell'officina: all'AD non arrivano";
  return lavoro;
}
// La risposta dell'AD nella forma che leggiClaude si aspetta dall'API di Claude (il resto del flusso non cambia).
function rispostaAD(r) {
  const x = r && typeof r === 'object' ? r : {};
  if (x.ok === true) {
    const text = typeof x.risultato === 'string' ? x.risultato : JSON.stringify(x.risultato ?? null);
    return { type: 'message', role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'end_turn', fatto_da: 'AD', avvisi: Array.isArray(x.avvisi) ? x.avvisi : [] };
  }
  const errore = x.errore || (x.error && (x.error.message || x.error)) || "l'AD non ha risposto";
  return { error: { type: 'ad', message: 'AD: ' + accorcia(testo(errore), 300) } };
}
// Il giudizio del controllo di un video (risposta dell'AD nella forma di Claude) → { esito, voto, punti, motivo }.
// «da rivedere» se lo dice l'AD o se il voto è 1-2 (un punto segnato da solo non basta: un'immagine un po' scura non è
// motivo per bocciare). Quando è da rivedere il motivo dice cosa non va, con le note dei punti. Se non risponde, il
// contenuto va avanti lo stesso: lo approvate voi.
function giudizioControllo(r) {
  const x = leggiClaude(r);
  if (!x.ok) return { esito: 'non_controllato', motivo: x.motivo };
  const d = x.dati;
  const voto = Math.max(1, Math.min(5, intero(d.voto, 3)));
  const punti = (Array.isArray(d.punti) ? d.punti : []).map((p) => ({ punto: testo(p.punto), ok: p.ok !== false, nota: accorcia(testo(p.nota), 160) }));
  const rivedere = d.esito === 'da_rivedere' || voto <= 2;
  const noteKo = punti.filter((p) => !p.ok && p.nota).map((p) => p.punto + ': ' + p.nota);
  const base = d.esito === 'da_rivedere' ? testo(d.motivo) : '';
  const motivo = rivedere ? [base, ...noteKo.filter((n) => !base.includes(n.replace(/^[a-z]+: /, '')))].filter(Boolean).join(' · ') || 'voto basso (' + voto + '/5)' : testo(d.motivo);
  return { esito: rivedere ? 'da_rivedere' : 'ok', voto, punti, motivo: accorcia(motivo, 400) };
}
// La risposta di Claude → { ok, dati } oppure { ok:false, motivo }.
function leggiClaude(r) {
  const corpo = r && r.body !== undefined && r.statusCode !== undefined ? r.body : r;
  if (!corpo || typeof corpo !== 'object') return { ok: false, motivo: 'nessuna risposta' };
  if (corpo.error) return { ok: false, motivo: 'errore: ' + accorcia(testo(corpo.error.message || corpo.error.type), 200) };
  const blocchi = Array.isArray(corpo.content) ? corpo.content : [];
  const t = blocchi.filter((b) => b && b.type === 'text').map((b) => b.text).join('');
  if (!t) return { ok: false, motivo: 'risposta vuota' + (corpo.stop_reason ? ' (' + corpo.stop_reason + ')' : '') };
  let dati;
  try { dati = JSON.parse(t); } catch (e) { return { ok: false, motivo: 'JSON non leggibile' + (corpo.stop_reason === 'max_tokens' ? ' (troncata: risposta troppo lunga)' : '') }; }
  if (!dati || typeof dati !== 'object' || Array.isArray(dati)) return { ok: false, motivo: 'JSON con forma sbagliata' };
  return { ok: true, dati, troncata: corpo.stop_reason === 'max_tokens' };
}
// Un indirizzo dell'officina (assoluto o relativo) → il percorso dopo /file/, da mettere dietro OFFICINA_URL.
function percorsoOfficina(url) { return String(url || '').replace(/^.*?(^|\/)file\//, ''); }
// Telegram con i pulsanti (sendAndWait) usa il Markdown semplice: si neutralizzano _ * ` [ (come nel workflow 15).
function md(v) { return String(v === null || v === undefined ? '' : v).replace(/\\/g, '/').replace(/([_*`[])/g, '\\$1'); }
// Una riga del Calendario per un contenuto montato (giro in modalità attivo, oppure «Approva» su Telegram).
// approvato = il team l'ha approvato su Telegram: una storia è pronta per il 01, reel e post vanno al 04 per la didascalia.
function rigaCalendario(J, x, progetto, opz) {
  const o = opz || {};
  const c = x.contenuto || {};
  const tipo = TIPI_CALENDARIO[c.tipo] || c.tipo;
  const video = (x.file || []).find((f) => f.tipo === 'video');
  const copertina = (x.file || []).find((f) => f.tipo === 'copertina');
  const immagini = (x.file || []).filter((f) => f.tipo === 'immagine');
  const media = video ? video.link : immagini.map((f) => f.link).join(' | ');
  const rivedere = !o.approvato && x.controllo && x.controllo.esito === 'da_rivedere';
  const stato = o.approvato ? (tipo === 'storia' ? 'approvato' : 'da_scrivere') : rivedere ? 'bozza' : tipo === 'storia' ? 'da_approvare' : 'da_scrivere';
  const usati = c.motore === 'regia' ? [...new Set((c.pezzi_usati || []).map((p) => p.scena).concat(c.foto_usate || []))] : c.tipo === 'reel' || c.tipo === 'storia_video' ? (c.pezzi || []).map((p) => p.scena) : (c.foto || []);
  const brief = ['Idea: ' + testo(c.idea), c.perche ? 'Perché funziona: ' + testo(c.perche) : '', c.didascalia ? 'Didascalia proposta dal montatore: ' + testo(c.didascalia) : '',
    'Montato dal montatore dal servizio «' + testo((J.servizio || {}).nome) + '» (' + usati.join(', ') + ').'].filter(Boolean).join('\n');
  const riga = {
    id: 'MO-' + slug((J.cliente || {}).cliente, 20) + '-' + testo(c.data).replace(/-/g, '') + '-' + testo(c.ora).replace(':', '') + '-' + testo(progetto).slice(0, 4) + x.n,
    cliente: (J.cliente || {}).cliente,
    tipo,
    piattaforme: 'ig+fb',
    data_ora: testo(c.data) + ' ' + testo(c.ora),
    brief,
    media,
    stato,
    note: 'montatore AI' + (o.approvato ? ' · approvato su Telegram' + (Number(o.versione) > 1 ? ' (versione ' + Number(o.versione) + ')' : '') : '') + (rivedere ? ' · da rivedere: ' + accorcia(testo(x.controllo.motivo), 200) : ''),
  };
  if (copertina) riga.copertina = copertina.link;
  return riga;
}
// Messaggi Telegram sotto i 3.800 caratteri, spezzati sulle righe.
function aPezzi(righe, max) {
  const lim = max || 3800;
  const out = [];
  let cur = '';
  for (const r of righe) {
    const riga = accorcia(r, lim);
    if (cur && cur.length + riga.length + 1 > lim) { out.push(cur); cur = ''; }
    cur = cur ? cur + '\n' + riga : riga;
  }
  if (cur) out.push(cur);
  return out;
}
// ===== fine aiuti comuni =====
