// COPIA FERMA di flussi/chiedi-all-ad/codice/prepara-lavoro.js com'era prima degli allegati (main 61c13e7, 25/11/2026).
// Serve solo alla prova «senza allegati identico a prima»: il codice nuovo deve dare le stesse uscite. Non si modifica.
// Chiedi all'AD · Prepara il lavoro
// Riceve dal flusso che chiama uno o più lavori { flusso, compito, dati, schema, non_mandare? } e ne fa UNA sola
// richiesta per la routine «Chiedi all'AD»: tanti lavori, una corsa sola.
// Qui si decide anche se la routine parte davvero:
//   - «memoria»: compito e dati uguali all'ultima volta per quel flusso → si ridà la risposta di allora;
//   - «tetto»: più di TETTO_GIORNO corse oggi, o TETTO_ORA nell'ultima ora (la routine ne accetta 30) → errore;
//   - «prova»: MODALITA = prova → la routine non parte, il flusso aspetta poco e torna senza risultato;
//   - «parti»: MODALITA = vero → la corsa si conta e la routine parte.
// La memoria del flusso tiene: il giorno, le corse di oggi, le partenze dell'ultima ora, l'ultima risposta
// buona di ogni flusso.
const cfg = $('Config').first().json;
// I lavori si leggono dal trigger: Config gira una volta sola e passa un elemento solo.
const voci = $('Da un altro flusso').all().map((i) => (i && i.json) || {});
const testo = (v) => { if (v == null) return ''; if (typeof v === 'string') return v.trim(); try { return JSON.stringify(v).trim(); } catch (e) { return ''; } };
const numero = (v, base) => (v === '' || v == null || !Number.isFinite(Number(v)) ? base : Number(v));
const ora = Date.now();
const giorno = new Date(ora).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const MAX_TESTO = 65536 - 512; // il limite della routine, con un margine
const tettoGiorno = Math.max(0, numero(cfg.TETTO_GIORNO, 40));
const tettoOra = Math.max(0, Math.min(29, numero(cfg.TETTO_ORA, 25)));
const vero = testo(cfg.MODALITA).toLowerCase() === 'vero';

// Un'impronta corta e stabile della richiesta (FNV-1a a 53 bit): serve solo a riconoscere «uguale a prima».
const impronta = (s) => {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x0100019d) >>> 0;
  }
  return (h2 & 0x1fffff).toString(16).padStart(6, '0') + h1.toString(16).padStart(8, '0');
};

const esci = (extra) => [{ json: { n_lavori: voci.length, ...extra } }];

const flusso = testo(voci[0] && voci[0].flusso) || 'flusso senza nome';
const lavori = voci.map((v, indice) => ({ indice, compito: testo(v.compito), dati: v.dati ?? null, schema: v.schema ?? null }));
if (!voci.length) return esci({ azione: 'errore', flusso, errore: 'nessun lavoro ricevuto' });
if (new Set(voci.map((v) => testo(v.flusso) || 'flusso senza nome')).size > 1) return esci({ azione: 'errore', flusso, errore: 'lavori di flussi diversi nella stessa corsa' });
// Il flusso che chiama può dire che un lavoro non va mandato (per esempio: servono foto che non possono
// arrivare all'AD). Allora non parte niente e non si conta niente.
const fermo = voci.find((v) => testo(v.non_mandare));
if (fermo) return esci({ azione: 'errore', flusso, errore: testo(fermo.non_mandare).slice(0, 300) });
const senzaCompito = lavori.filter((l) => !l.compito).map((l) => l.indice);
if (senzaCompito.length) return esci({ azione: 'errore', flusso, errore: `lavoro senza compito (numero ${senzaCompito.join(', ')})` });

let richiesta;
if (lavori.length === 1) {
  richiesta = { flusso, compito: lavori[0].compito, dati: lavori[0].dati, schema: lavori[0].schema };
} else {
  richiesta = {
    flusso,
    compito: [
      `In «dati.lavori» ci sono ${lavori.length} lavori. Falli uno per uno, ognuno col suo «compito», i suoi «dati» e il suo «schema», come se fosse l'unico.`,
      'In «risultato» metti { "risultati": [ { "indice": <l\'indice del lavoro>, "risultato": <la risposta a quel lavoro, che rispetta il suo schema> } ] }, un elemento per ogni lavoro.',
    ].join('\n'),
    dati: { lavori },
    schema: {
      type: 'object',
      properties: { risultati: { type: 'array', items: { type: 'object', properties: { indice: { type: 'integer' }, risultato: {} }, required: ['indice', 'risultato'] } } },
      required: ['risultati'],
    },
  };
}
let chiave;
try { chiave = impronta(JSON.stringify(richiesta)); } catch (e) { return esci({ azione: 'errore', flusso, errore: `dati non trasformabili in testo: ${String(e.message).slice(0, 100)}` }); }

const memoria = $getWorkflowStaticData('global');
if (memoria.giorno !== giorno) { memoria.giorno = giorno; memoria.corse_oggi = 0; }
memoria.partenze = (Array.isArray(memoria.partenze) ? memoria.partenze : []).filter((t) => ora - t < 3600000);
memoria.ultimo = memoria.ultimo && typeof memoria.ultimo === 'object' ? memoria.ultimo : {};

const precedente = memoria.ultimo[flusso];
if (precedente && precedente.chiave === chiave) {
  return esci({ azione: 'memoria', flusso, chiave, risposta: precedente.risposta, quando: precedente.quando });
}

const daMandare = JSON.stringify({ ...richiesta, rispondi_a: $execution.resumeUrl });
// Si misura in caratteri e in byte: non sappiamo come conta la routine, si tiene il più severo.
const byte = typeof Buffer !== 'undefined' ? Buffer.byteLength(daMandare, 'utf8') : unescape(encodeURIComponent(daMandare)).length;
if (Math.max(daMandare.length, byte) > MAX_TESTO) {
  return esci({ azione: 'errore', flusso, chiave, errore: `richiesta troppo grande per la routine (${byte} byte, il massimo è ${MAX_TESTO})` });
}

// In prova l'indirizzo di ritorno si mostra: chi prova può rispondere a mano al posto dell'AD.
if (!vero) return esci({ azione: 'prova', flusso, chiave, caratteri: daMandare.length, rispondi_a: $execution.resumeUrl });

if ((memoria.corse_oggi || 0) >= tettoGiorno) {
  return esci({ azione: 'errore', flusso, chiave, errore: `tetto di ${tettoGiorno} corse al giorno raggiunto: riprova domani` });
}
if (memoria.partenze.length >= tettoOra) {
  return esci({ azione: 'errore', flusso, chiave, errore: `tetto di ${tettoOra} corse in un'ora raggiunto: riprova più tardi` });
}
memoria.corse_oggi = (memoria.corse_oggi || 0) + 1;
memoria.partenze.push(ora);
return esci({ azione: 'parti', flusso, chiave, corpo: { text: daMandare }, caratteri: daMandare.length, corse_oggi: memoria.corse_oggi });
