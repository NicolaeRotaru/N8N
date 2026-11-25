// 23 · Controlla la richiesta — un'azione approvata nel Pannello arriva qui. Prima di toccare il mondo:
//
//  1. la forma: titolo, canale e testo ci devono essere;
//  2. la firma: un'azione 🔴 passa SOLO se firmata_da = «nicola» (l'ha approvata Nicola nel Pannello).
//     Il Pannello lo controlla già (pannello/src/lib/mani-n8n.ts); qui si ricontrolla, perché questo
//     indirizzo è raggiungibile da fuori e il segreto da solo non dice CHI ha deciso. Un livello che
//     non si legge vale rosso;
//  3. una volta sola: la stessa azione_id non si esegue due volte (memoria del flusso);
//  4. il canale: oggi n8n sa eseguire solo «telegram» (un messaggio a Nicola). Gli altri canali
//     restano in coda, con il motivo, finché non vengono collegati qui;
//  5. la MODALITA: in «prova» niente parte, la risposta è «simulata».
//
// Esce: { esegui: 'telegram' | null, risposta: { stato, dettaglio }, messaggio }.

const cfg = $('Config').first().json;
const VERO = String(cfg.MODALITA || '').trim().toLowerCase() === 'vero';
const corpo = ($('Ricevi la richiesta').first().json || {}).body || {};
const testo = (v, max) => String(v ?? '').trim().slice(0, max);
const a = {
  id: testo(corpo.azione_id, 120), titolo: testo(corpo.titolo, 300), canale: testo(corpo.canale, 60).toLowerCase(),
  destinatario: testo(corpo.destinatario, 200), testo: testo(corpo.testo, 3500),
  livello: ['verde', 'giallo', 'rosso'].includes(corpo.livello) ? corpo.livello : 'rosso',
  firmata_da: corpo.firmata_da === 'nicola' ? 'nicola' : 'auto',
};
const coda = (dettaglio) => [{ json: { esegui: null, azione: a, risposta: { stato: 'coda', dettaglio } } }];

if (!a.titolo || !a.canale || !a.testo) return coda('azione incompleta (servono titolo, canale e testo)');
if (a.livello === 'rosso' && a.firmata_da !== 'nicola') return coda('azione 🔴 senza la firma di Nicola: non parte da sola');

const memoria = $getWorkflowStaticData('global');
memoria.eseguite = memoria.eseguite && typeof memoria.eseguite === 'object' ? memoria.eseguite : {};
if (a.id && memoria.eseguite[a.id]) return coda(`azione già eseguita il ${memoria.eseguite[a.id]}: non la ripeto`);

const CANALI = { telegram: 'telegram', 'telegram-nicola': 'telegram', avviso: 'telegram' };
const via = CANALI[a.canale] || null;
if (!via) return coda(`il canale «${a.canale}» non è ancora collegato in n8n`);
// Telegram qui scrive SOLO a Nicola: un'azione per qualcun altro non si può fare, e non va detta
// «fatta» (difetto trovato dal collaudo del 25/11).
if (a.destinatario && !/^(nicola|me|io)$/i.test(a.destinatario)) return coda(`Telegram qui scrive solo a Nicola: «${a.destinatario}» non è raggiungibile da n8n`);

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const PALLINO = { verde: '🟢', giallo: '🟡', rosso: '🔴' };
const messaggio = `${PALLINO[a.livello]} <b>${esc(a.titolo)}</b>\n<i>Azione approvata nel Pannello${a.firmata_da === 'nicola' ? ' da Nicola' : " dall'autopilota"}</i>\n\n${esc(a.testo)}`.slice(0, 3900);

if (!VERO) return [{ json: { esegui: null, azione: a, risposta: { stato: 'simulata', dettaglio: `prova: avrei mandato su ${via} «${a.titolo}»` } } }];

// Il segno «eseguita» si scrive PRIMA di mandare: se il messaggio poi fallisce, la risposta lo dice
// e l'azione resta in coda nel Pannello — meglio un messaggio perso e detto che uno mandato due volte.
if (a.id) memoria.eseguite[a.id] = new Date().toISOString();
const chiavi = Object.keys(memoria.eseguite);
if (chiavi.length > 500) for (const k of chiavi.slice(0, chiavi.length - 500)) delete memoria.eseguite[k];
return [{ json: { esegui: via, azione: a, messaggio, risposta: null } }];
