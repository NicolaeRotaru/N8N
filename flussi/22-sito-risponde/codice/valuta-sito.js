// 22 · Valuta il sito — risponde la pagina iniziale? E il controllo «pronto» del sito che dice?
//
// Tre stati: «su» (tutto bene), «degradato» (il sito risponde ma il controllo «pronto» dice che dei
// lavori automatici sono fermi: payout, email, notifiche…), «giù» (la pagina o il controllo non
// rispondono 2xx). L'avviso parte solo quando lo STATO cambia, o quando cambia l'elenco dei lavori
// fermi — non quando cambiano i minuti di fermo, che crescono a ogni giro.
//
// Contro i falsi allarmi: «giù» vale solo se lo è per CONFERME_GIU giri di fila (di serie 2, cioè
// 10 minuti). Il ritorno a «su» vale subito.

const cfg = $('Config').first().json;
const ADESSO = Date.now();
const VERO = String(cfg.MODALITA || '').trim().toLowerCase() === 'vero';
const CONFERME = Math.max(1, Number(cfg.CONFERME_GIU) || 2);

function guarda(nome) {
  if (!$(nome).isExecuted) return { ok: false, codice: null, motivo: 'non controllato' };
  const j = $(nome).first().json || {};
  if (j.error !== undefined) {
    const m = typeof j.error === 'object' && j.error ? (j.error.message || j.error.code || '') : String(j.error);
    return { ok: false, codice: 0, motivo: `non raggiungibile${m ? ' (' + String(m).slice(0, 80) + ')' : ''}` };
  }
  const codice = Number(j.statusCode) || 0;
  let corpo = j.body !== undefined ? j.body : j.data;
  if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch { /* la home è HTML */ } }
  return { ok: codice >= 200 && codice < 300, codice, corpo, motivo: codice ? `risposta ${codice}` : 'non raggiungibile' };
}
const home = guarda('Guarda la pagina iniziale');
const pronto = guarda('Guarda il controllo «pronto»');

// I lavori fermi, per nome, dal testo del controllo «pronto»: «release-payouts fermo da 170591min …».
let fermi = [];
let degradato = false;
if (pronto.ok && pronto.corpo && typeof pronto.corpo === 'object' && pronto.corpo.degraded === true) {
  degradato = true;
  const testo = String((pronto.corpo.cron && (pronto.corpo.cron.error || pronto.corpo.cron.stato)) || pronto.corpo.error || '');
  fermi = [...new Set([...testo.matchAll(/([a-z0-9][a-z0-9-]*) fermo da/gi)].map((m) => m[1]))].sort();
}

const giuAdesso = !home.ok || !pronto.ok;
const memoria = $getWorkflowStaticData('global');
memoria.giu_di_fila = giuAdesso ? (Number(memoria.giu_di_fila) || 0) + 1 : 0;
const stato = giuAdesso ? (memoria.giu_di_fila >= CONFERME ? 'giù' : (memoria.ultimo_stato || 'su')) : (degradato ? 'degradato' : 'su');
const firma = `${stato}${stato === 'degradato' ? ':' + fermi.join(',') : ''}`;
const primaVolta = memoria.ultima_firma === undefined;
const modalitaCambiata = memoria.modalita !== undefined && memoria.modalita !== (VERO ? 'vero' : 'prova');
const cambiato = primaVolta || modalitaCambiata || memoria.ultima_firma !== firma;
const statoPrima = memoria.ultimo_stato || null;

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ora = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ADESSO));
const ICONA = { su: '✅', degradato: '🟡', 'giù': '🔴' };
const righe = [`<b>🌐 Il sito</b> · ${esc(ora)}${VERO ? '' : ' · 🧪 prova'}`, ''];
if (stato === 'giù') righe.push(`${ICONA[stato]} <b>Il sito non risponde bene</b> da ${memoria.giu_di_fila} controlli di fila: pagina iniziale ${esc(home.motivo)}, controllo «pronto» ${esc(pronto.motivo)}.`, '→ Guarda Vercel e i log: chi apre il sito adesso non può comprare.');
else if (stato === 'degradato') righe.push(`${ICONA[stato]} Il sito risponde, ma si dice «degradato»: ${fermi.length ? `${fermi.length} lavori automatici fermi (${esc(fermi.join(', '))})` : 'senza dettaglio'}.`, '→ Quello che fanno quei lavori (payout, email, notifiche) non succede finché non ripartono.');
else righe.push(`${ICONA[stato]} Il sito risponde e il controllo «pronto» dice che va tutto bene.`);
if (statoPrima && statoPrima !== stato) righe.push('', `Prima era: ${ICONA[statoPrima] || ''} ${esc(statoPrima)}.`);

memoria.ultima_firma = firma;
memoria.ultimo_stato = stato;
memoria.modalita = VERO ? 'vero' : 'prova';
memoria.ultimo_controllo = new Date(ADESSO).toISOString();

return [{ json: {
  quando: new Date(ADESSO).toISOString(), modalita: VERO ? 'vero' : 'prova',
  stato, stato_prima: statoPrima, fermi, home: { codice: home.codice, motivo: home.motivo }, pronto: { codice: pronto.codice, motivo: pronto.motivo },
  giu_di_fila: memoria.giu_di_fila, cambiato, manda: cambiato && VERO, messaggio: righe.join('\n').slice(0, 3900),
} }];
