// Chiedi all'AD · Allegati del lavoro
// Un lavoro può portare `allegati`: materiale troppo grande per i 64 KB della routine (un catalogo lungo) o che non ci
// può stare dentro (le immagini). L'AD non li riceve nel messaggio: li scarica con GET da un indirizzo di n8n, con un
// gettone casuale per allegato che scade (flusso «Allegati per l'AD»).
// Qui si controllano e si mettono in fila, un elemento per allegato: dopo, «Gettoni» dà a ognuno un gettone casuale e
// «Impronte» la sua impronta SHA-256 (nella tabella si salva l'impronta, mai il gettone).
// Tre tipi:
//   { nome, tipo: 'testo', contenuto }                        → si salva il testo;
//   { nome, tipo: 'immagine', base64, mime }                  → si salva l'immagine (jpeg, png, webp);
//   { nome, tipo: 'officina', percorso: '/file/<id>/<nome>' } → si salva solo il riferimento: il file lo prende n8n
//                                                                dall'officina quando l'AD lo chiede. Solo immagini
//                                                                (.jpg, .jpeg, .png, .webp): niente video in memoria.
// Un lavoro senza allegati passa com'era: qui esce un elemento solo, «nessuno».
// Sopra i tetti il lavoro non parte, e il motivo lo dice: niente si tronca in silenzio.
const voci = $('Da un altro flusso').all().map((i) => (i && i.json) || {});
const MAX_TESTO = 512 * 1024; // byte di un allegato di testo
const MAX_IMMAGINE = 1536 * 1024; // byte di un'immagine (dopo averla decodificata)
const MAX_CORSA = 8 * 1024 * 1024; // byte SALVATI in tutto per una corsa (per le immagini conta il base64, non il file)
const MAX_ALLEGATI = 40;
const MIME = ['image/jpeg', 'image/png', 'image/webp'];
const byteDi = (s) => (typeof Buffer !== 'undefined' ? Buffer.byteLength(s, 'utf8') : unescape(encodeURIComponent(s)).length);
const ferma = (motivo) => [{ json: { errore: motivo } }];
// I primi byte dicono che cosa è davvero il file: un'immagine dichiarata png deve cominciare come un png.
const FIRME = { 'image/jpeg': [[0xff, 0xd8, 0xff]], 'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]], 'image/webp': [[0x52, 0x49, 0x46, 0x46]] };
const primiByte = (b64) => {
  const pezzo = b64.slice(0, 24);
  if (typeof Buffer !== 'undefined') return [...Buffer.from(pezzo, 'base64')];
  return [...atob(pezzo)].map((c) => c.charCodeAt(0));
};
const eDelTipo = (b64, mime) => {
  const b = primiByte(b64);
  const ok = (FIRME[mime] || []).some((f) => f.every((x, i) => b[i] === x));
  return ok && (mime !== 'image/webp' || String.fromCharCode(...b.slice(8, 12)) === 'WEBP');
};

const fila = [];
let totale = 0;
for (let i = 0; i < voci.length; i++) {
  const lista = voci[i].allegati;
  if (lista === undefined || lista === null) continue;
  if (!Array.isArray(lista)) return ferma(`gli allegati del lavoro ${i} non sono una lista`);
  for (let j = 0; j < lista.length; j++) {
    const a = lista[j] || {};
    const dove = `allegato ${j} del lavoro ${i}`;
    const nome = String(a.nome || '').trim().slice(0, 120);
    if (!nome) return ferma(`${dove}: manca il nome`);
    const tipo = String(a.tipo || '').trim();
    let riga;
    if (tipo === 'testo') {
      const contenuto = typeof a.contenuto === 'string' ? a.contenuto : '';
      if (!contenuto) return ferma(`${dove} («${nome}»): il testo è vuoto`);
      const byte = byteDi(contenuto);
      if (byte > MAX_TESTO) return ferma(`${dove} («${nome}»): ${byte} byte, il massimo per un testo è ${MAX_TESTO}`);
      riga = { tipo, mime: 'text/plain; charset=utf-8', contenuto, byte, salvati: byte };
    } else if (tipo === 'immagine') {
      const base64 = typeof a.base64 === 'string' ? a.base64.replace(/\s+/g, '') : '';
      const mime = String(a.mime || 'image/jpeg').toLowerCase();
      if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return ferma(`${dove} («${nome}»): l'immagine non è in base64`);
      if (!MIME.includes(mime)) return ferma(`${dove} («${nome}»): tipo d'immagine ${mime} non ammesso (${MIME.join(', ')})`);
      const byte = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
      if (byte > MAX_IMMAGINE) return ferma(`${dove} («${nome}»): ${byte} byte, il massimo per un'immagine è ${MAX_IMMAGINE}`);
      if (!eDelTipo(base64, mime)) return ferma(`${dove} («${nome}»): il contenuto non è un'immagine ${mime}`);
      // nella tabella va il base64: è quello che occupa spazio
      riga = { tipo, mime, contenuto: base64, byte, salvati: base64.length };
    } else if (tipo === 'officina') {
      const percorso = String(a.percorso || '');
      // Solo i file dei lavori dell'officina: niente altre rotte, niente «..», niente indirizzi interi.
      if (!/^\/file\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,120}$/.test(percorso) || percorso.includes('..')) {
        return ferma(`${dove} («${nome}»): il percorso dell'officina deve essere /file/<lavoro>/<nome del file>`);
      }
      const est = (percorso.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
      const mimeOff = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[est];
      if (!mimeOff) return ferma(`${dove} («${nome}»): dall'officina passano solo immagini .jpg, .jpeg, .png o .webp`);
      // nella tabella va solo il riferimento (1 KB nel conto); il file lo prende n8n quando l'AD lo chiede
      riga = { tipo, mime: mimeOff, contenuto: percorso, byte: 0, salvati: 1024 };
    } else {
      return ferma(`${dove} («${nome}»): tipo «${tipo}» sconosciuto (testo, immagine, officina)`);
    }
    totale += riga.salvati;
    fila.push({ json: { lavoro: i, n: j, nome, ...riga } });
  }
}
if (fila.length > MAX_ALLEGATI) return ferma(`${fila.length} allegati in una corsa: il massimo è ${MAX_ALLEGATI}`);
if (totale > MAX_CORSA) return ferma(`gli allegati di questa corsa occupano ${totale} byte nella tabella: il massimo è ${MAX_CORSA}`);
return fila.length ? fila : [{ json: { nessuno: true } }];
