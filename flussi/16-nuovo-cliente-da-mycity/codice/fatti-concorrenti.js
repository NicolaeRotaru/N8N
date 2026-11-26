// 26 · Fatti · Siti dei concorrenti — parte 12 (Nicola, 26/11/2026 14:35: «l'analisi dei concorrenti è importantissima»).
// I 3-5 concorrenti più vicini trovati da OpenStreetMap (stesso tipo di attività, lei esclusa). Il loro sito si legge
// SOLO se OpenStreetMap lo indica (tag website / contact:website), e solo se passa lo stesso controllo del lettore di
// pagine del 12 (mai Meta, mappe, portali, indirizzi interni). Una pagina per concorrente (il tetto è 2). Mai Google.
// Esce un elemento per sito da scaricare; se non ce n'è nessuno, un elemento solo con salta = true.
// Inserito da N8N/flussi/16-nuovo-cliente-da-mycity/fatti.mjs.
__INDIRIZZI__
const piano = $('Fatti · Prepara').first().json.fatti_piano;
const pos = $('Fatti · Posizione').first().json.fatti_posizione;
const testo = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const eseguito = (nome) => { try { return $(nome).isExecuted; } catch (e) { return false; } };
const MAX_CONCORRENTI = 5;
const salta = (motivo) => [{ json: { salta: true, motivo, concorrenti: [] } }];
if (!pos.buona || !piano.tipo_osm) return salta(!pos.buona ? 'senza posizione' : 'tipo di attività non riconosciuto');
const r = eseguito('Fatti · OSM: intorno') ? $('Fatti · OSM: intorno').first().json || {} : null;
const b = r && (typeof r.body === 'string' ? (() => { try { return JSON.parse(r.body); } catch (e) { return null; } })() : r.body);
if (!b || !Array.isArray(b.elements)) return salta('OpenStreetMap non ha risposto');
const metri = (a, o, c, d) => { const R = 6371000; const q = (x) => (x * Math.PI) / 180; const dl = q(c - a); const dn = q(d - o);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(q(a)) * Math.cos(q(c)) * Math.sin(dn / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(h))); };
const norma = (s) => testo(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const io = norma(piano.nome);
const valori = new RegExp(`^(${piano.tipo_osm.valori})$`);
const concorrenti = b.elements.map((e) => {
  const t = e.tags || {};
  const la = Number(e.lat ?? (e.center && e.center.lat)); const lo = Number(e.lon ?? (e.center && e.center.lon));
  return { e, t, d: Number.isFinite(la) && Number.isFinite(lo) ? metri(pos.posizione.lat, pos.posizione.lon, la, lo) : null };
}).filter((x) => x.d !== null && x.d <= piano.raggio_m && valori.test(testo(x.t[piano.tipo_osm.chiave])) && testo(x.t.name))
  .filter((x) => { const n = norma(x.t.name); return !(io && n && x.d <= 60 && (n === io || n.includes(io) || io.includes(n))); })
  .sort((a, z) => a.d - z.d).slice(0, MAX_CONCORRENTI)
  .map((x) => {
    const grezzo = testo(x.t.website || x.t['contact:website'] || x.t.url);
    const sicuro = grezzo ? LI.indirizzoSicuro(grezzo) : null;
    const ig = testo(x.t['contact:instagram'] || x.t.instagram).replace(/^@/, '');
    const profilo = (ig.match(/instagram\.com\/([A-Za-z0-9._]{2,30})/) || [null, /^[A-Za-z0-9._]{2,30}$/.test(ig) ? ig : null])[1];
    return { nome: Array.from(testo(x.t.name)).slice(0, 80).join(''), distanza_m: x.d, fonte: `https://www.openstreetmap.org/${x.e.type}/${x.e.id}`,
      sito: sicuro && sicuro.ok ? sicuro.url : null, sito_motivo: !grezzo ? 'OpenStreetMap non indica un sito' : sicuro && !sicuro.ok ? `non si legge: ${sicuro.motivo}` : null,
      profilo_osm: profilo || null };
  });
if (!concorrenti.length) return salta('nessun concorrente con un nome nel raggio');
const daLeggere = concorrenti.filter((c) => c.sito);
if (!daLeggere.length) return [{ json: { salta: true, motivo: 'nessun concorrente ha un sito indicato su OpenStreetMap', concorrenti } }];
return daLeggere.map((c) => ({ json: { salta: false, url: c.sito, nome: c.nome, concorrenti } }));
