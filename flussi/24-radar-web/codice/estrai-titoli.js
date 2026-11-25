// 24 · Estrai i titoli — da ogni pagina scaricata, i titoli e i testi dei link (niente pagine intere:
// «Chiedi all'AD» accetta al massimo 64 KB). Poi tiene solo i titoli NUOVI rispetto ai giri prima
// (memoria del flusso, per fonte). Una fonte che non si scarica è «non letta», mai «niente di nuovo».

const fonti = $('Le fonti di oggi').all().map((x) => x.json);
const pagine = $('Scarica le fonti').all();
const MAX_PER_FONTE = 15;
const decodifica = (t) => t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;|&#8217;/g, '’')
  .replace(/&agrave;/g, 'à').replace(/&egrave;/g, 'è').replace(/&eacute;/g, 'é').replace(/&igrave;/g, 'ì').replace(/&ograve;/g, 'ò').replace(/&ugrave;/g, 'ù')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&[a-z]+;/gi, ' ');
function titoli(html) {
  const pulito = String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<nav[\s\S]*?<\/nav>/gi, ' ').replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  const visti = new Set();
  const fuori = [];
  for (const m of pulito.matchAll(/<(h[1-4]|a)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = decodifica(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (t.length < 25 || t.length > 180) continue;
    if (/cookie|privacy|accedi|abbonati|newsletter|iscriviti|leggi tutto|continua a leggere/i.test(t)) continue;
    const k = t.toLowerCase();
    if (visti.has(k)) continue;
    visti.add(k); fuori.push(t);
  }
  return fuori;
}
const memoria = $getWorkflowStaticData('global');
memoria.visti = memoria.visti && typeof memoria.visti === 'object' ? memoria.visti : {};
const esito = fonti.map((f, i) => {
  const j = (pagine[i] && pagine[i].json) || {};
  const codice = Number(j.statusCode) || 0;
  if (j.error !== undefined || codice < 200 || codice >= 300) return { id: f.id, nome: f.nome, letta: false, motivo: j.error ? 'non raggiungibile' : `risposta ${codice || 'assente'}` };
  const tutti = titoli(typeof j.body === 'string' ? j.body : typeof j.data === 'string' ? j.data : '');
  if (!tutti.length) return { id: f.id, nome: f.nome, letta: false, motivo: 'nessun titolo trovato nella pagina' };
  const prima = new Set(memoria.visti[f.id] || []);
  const primoGiro = !memoria.visti[f.id];
  const nuovi = primoGiro ? [] : tutti.filter((t) => !prima.has(t.toLowerCase()));
  memoria.visti[f.id] = tutti.slice(0, 200).map((t) => t.toLowerCase());
  return { id: f.id, nome: f.nome, tipo: f.tipo, cosa_cercare: f.cosa_cercare, letta: true, primo_giro: primoGiro, titoli_trovati: tutti.length, nuovi: nuovi.slice(0, MAX_PER_FONTE) };
});
return [{ json: { quando: new Date().toISOString(), fonti: esito,
  lette: esito.filter((e) => e.letta).length, non_lette: esito.filter((e) => !e.letta).map((e) => `${e.nome}: ${e.motivo}`),
  nuovi_totali: esito.reduce((s, e) => s + (e.nuovi ? e.nuovi.length : 0), 0) } }];
