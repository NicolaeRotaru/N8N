#!/usr/bin/env node
// 16 · NUOVO CLIENTE DA MYCITY — il modulo 12 che parte da solo.
//
// 24/11/2026 — Nicola: «fai in modo che un nuovo cliente che si collega a MyCity si inserisce nel
// database dei clienti, e deve sfruttare il modulo 12».
//
// Il modulo 12 («12 · Nuovo cliente (automatico)») è un modulo da compilare nel browser: Nicola scrive
// nome e città, Claude cerca le fonti pubbliche, Nicola corregge tre pagine e nell'ultima sceglie
// Conferma. Quando un'attività si iscrive su MyCity nessuno compila niente. Questo programma prende il
// modulo 12 VERO da n8n e ne fa una copia, «16 · Nuovo cliente da MyCity», dove:
//
//   · al posto del modulo c'è un indirizzo (webhook) che riceve la nuova attività dal sito, protetto
//     da un segreto nell'intestazione x-mycity-segreto;
//   · le pagine 1-3 «si compilano da sole» con i valori che il 12 stesso ha proposto, come se Nicola
//     avesse premuto Avanti senza cambiare niente;
//   · la pagina 4 conferma da sola, tranne quando il 12 ha visto un possibile doppione: lì non scrive
//     e avvisa Nicola;
//   · se la ricerca di Claude si ferma, non scrive una scheda vuota: avvisa Nicola, come il 12;
//   · le schermate finali del modulo diventano avvisi su Telegram o semplici punti di arrivo.
//
// Tutto il resto — la ricerca, le regole sulle fonti, i controlli prima di scrivere, la riga sempre con
// attivo = no, la cartella su Drive, gli avvisi — è il codice del 12, copiato com'è. Quando il 12
// cambia, si rilancia questo programma e il 16 si riallinea.
//
// Uso:
//   N8N_API_KEY=… node flussi/16-nuovo-cliente-da-mycity/genera.mjs --credenziale <id> [--vero] [--manda]
//     --credenziale  l'id della credenziale «Header Auth» col segreto (nome x-mycity-segreto)
//     --analisi <id> il flusso 18 da chiamare alla fine (di serie lo cerca per nome su n8n)
//     --sito <https://…> e --credenziale-sito <id>: manda la scheda anche al sito (/api/agenzia/scheda-cliente)
//     --vero         il 16 scrive davvero nel foglio Clienti (di serie «prova»: cerca ma non scrive)
//     --manda        crea o aggiorna il flusso su n8n (resta come è: acceso o spento)
//     --file <path>  invece di scaricare il 12 da n8n, lo legge da un file esportato
//     --scrivi <path> salva il flusso generato in un file (fuori dal repository: contiene gli ID
//                     del foglio, della cartella e della chat Telegram)

import { aPagamento } from '../conta-api-claude.mjs';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const NOME_MODULO_12 = '12 · Nuovo cliente (automatico)';
export const NOME_16 = '16 · Nuovo cliente da MyCity';
export const PERCORSO_WEBHOOK = 'mycity-nuovo-cliente';
export const NOME_CREDENZIALE = 'MyCity - Segreto nuovo cliente';
const TRIGGER = 'Modulo nuovo cliente';
const WEBHOOK = 'Da MyCity';
const VALIDA = 'Richiesta valida?';
const SCARTATA = 'Avvisa: richiesta scartata';
const DOPO_LO_STOP = 'Nuovo cliente? (dopo lo stop)';
const PAGINE = { 'Pagina 1 · Chi è': 'pagina1', 'Pagina 2 · Come parliamo': 'pagina2', 'Pagina 3 · Menu e fatti': 'pagina3' };
const PAGINA_4 = 'Pagina 4 · Conferma o annulla';
const PREPARA_ANALISI = "Prepara l'analisi dell'attività";
const ANALIZZA = "Analizza l'attività (flusso 18)";
const SCHEDA_SITO = 'Prepara la scheda per il sito';
const MANDA_SITO = 'Manda la scheda al sito';
export const PERCORSO_SCHEDA_SITO = '/api/agenzia/scheda-cliente';
// Nodi che il 12 usa per iscrivere in MyCity un cliente nuovo: il 16 parte da chi su MyCity c'è già,
// quindi non li prende mai (lo iscriverebbe due volte).
export const SOLO_NEL_12 = ["Prepara l'iscrizione in MyCity", 'Iscrivi in MyCity'];
// Nel 16 la ricerca con Claude resta sempre spenta: nessuna API di IA a pagamento (Nicola, 24/11).
// Tornerà quando la ricerca la fa l'AD col piano Max («Chiedi all'AD»).
export const RICERCA_CON_CLAUDE = 'RICERCA_CON_CLAUDE';
// Va dentro un testo fra apici di un'espressione n8n: l'a capo si scrive \\n, mai un a capo vero.
const DA_MYCITY = '🛒 <b>Da MyCity, in automatico</b>\\n';
const FRASE_PAGINE = "Correggi nelle pagine del modulo che si aprono nel browser; nell'ultima pagina scegli Conferma o Annulla.";
const FRASE_AUTOMATICA = 'Nessuno deve compilare il modulo: la scheda si scrive da sola, con attivo = no. Per correggerla usa il modulo 12, «aggiorna cliente esistente».';

// ---------------------------------------------------------------------------------------------
// Il codice dei nodi nuovi. Sono stringhe: n8n le esegue nei suoi nodi Code.
// ---------------------------------------------------------------------------------------------

/** Al posto del modulo: legge la richiesta di MyCity e la trasforma nei campi che il modulo darebbe. */
export const CODICE_RICHIESTA = String.raw`// 16 · Al posto del modulo del 12: la nuova attività arriva da MyCity (/api/seller/apply).
// Esce con gli stessi campi che darebbe il modulo «Nuovo cliente o aggiornamento», così il codice
// del 12 che viene dopo lavora com'è. Il segreto lo ha già controllato il webhook (Header Auth).
// Due freni sul credito di Claude: la stessa attività una volta sola in 7 giorni, e al massimo
// MAX_AL_GIORNO attività al giorno. Oltre si avvisa Nicola, una volta.
const MAX_AL_GIORNO = 10;
const GIORNI_DOPPIONE = 7;
const testo = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const unaRiga = (v) => testo(v).replace(/\s+/g, ' ');
const taglia = (v, n) => Array.from(unaRiga(v)).slice(0, n).join('');
const entrata = $input.first().json || {};
const corpo = entrata.body && typeof entrata.body === 'object' ? entrata.body : {};
const a = corpo.attivita && typeof corpo.attivita === 'object' ? corpo.attivita : {};
const nome = taglia(a.nome, 80);
const scarta = (motivo, avvisa) => [{ json: { scartata: true, avvisa, motivo, nome_locale: nome } }];
if (corpo.tipo !== 'nuovo-cliente' || corpo.origine !== 'mycity') return scarta('la richiesta non è un «nuovo-cliente» di MyCity', true);
const id = testo(a.id);
if (!/^[0-9A-Za-z-]{6,64}$/.test(id)) return scarta("manca l'identificativo dell'attività", true);
if (nome.length < 2) return scarta("manca il nome dell'attività", true);
// I venditori «di sistema» del sito (il negozio «MyCity», SDG Agenzia) non sono clienti dell'agenzia:
// SDG nel foglio Clienti sarebbe cliente di sé stessa.
if (id.toLowerCase().startsWith('11111111-1111-1111-1111-')) return scarta('è un venditore di sistema del sito, non un cliente', false);

const memoria = $getWorkflowStaticData('global');
const adesso = Date.now();
const visti = memoria.mycity_visti && typeof memoria.mycity_visti === 'object' ? memoria.mycity_visti : {};
for (const [k, t] of Object.entries(visti)) if (!(adesso - Number(t) < GIORNI_DOPPIONE * 86400000)) delete visti[k];
memoria.mycity_visti = visti;
if (visti[id]) return scarta('«' + nome + '» è già arrivata da MyCity negli ultimi ' + GIORNI_DOPPIONE + ' giorni', false);
const giorno = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
if (memoria.mycity_giorno !== giorno) { memoria.mycity_giorno = giorno; memoria.mycity_oggi = 0; memoria.mycity_avvisato = false; }
if ((Number(memoria.mycity_oggi) || 0) >= MAX_AL_GIORNO) {
  const primaVolta = !memoria.mycity_avvisato;
  memoria.mycity_avvisato = true;
  return scarta('oggi sono già arrivate ' + MAX_AL_GIORNO + ' attività da MyCity: oltre non cerco, per non consumare credito. Le altre di oggi le crei col modulo 12', primaVolta);
}
memoria.mycity_oggi = (Number(memoria.mycity_oggi) || 0) + 1;
visti[id] = adesso;

const tipo = taglia(a.tipo_descritto || a.tipo, 120);
const appunti = [
  'Arrivata da MyCity: si è iscritta come attività sul marketplace (codice MyCity ' + id + ').',
  tipo ? 'Tipo di attività dichiarato: ' + tipo + '.' : '',
  a.indirizzo ? "Indirizzo del negozio dichiarato: " + taglia(a.indirizzo, 200) + '.' : '',
  a.descrizione ? "Descrizione scritta dall'attività: " + taglia(a.descrizione, 500) : '',
  'Sono dati scritti dal titolare: valgono come indizio, da confermare con le fonti.',
].filter(Boolean).join('\n');
return [{ json: {
  scartata: false, modalita: 'nuovo cliente', nome_locale: nome, citta: taglia(a.citta, 80) || 'Piacenza',
  sito: '', testo_scheda_google: '', testo_pagina_facebook: '', appunti,
  id_mycity: id, submittedAt: new Date().toISOString(), formMode: 'mycity',
} }];`;

/** Al posto di una pagina del modulo: valgono i valori proposti, come un «Avanti» senza modifiche. */
export const codicePagina = (chiave) => String.raw`// 16 · Al posto della pagina del modulo: nessuno la compila. Valgono i valori che il 12 ha
// proposto, come se Nicola avesse premuto «Avanti» senza cambiare niente. I campi non sicuri restano
// in campi_da_confermare (lo decide il 12 in «Controlla il cliente»).
const grezzo = String($('Prepara le pagine').first().json.${chiave} || '[]');
// Il 12 raddoppia ogni $ per la pagina (perPagina): qui si torna al testo vero.
const campi = JSON.parse(grezzo.replace(/\$\$/g, '$'));
const invio = {};
for (const c of campi) {
  if (!c || !c.fieldName) continue;
  invio[c.fieldName] = c.fieldType === 'hiddenField' ? (c.fieldValue ?? '') : (c.defaultValue ?? '');
}
invio.submittedAt = new Date().toISOString();
invio.formMode = 'mycity';
return [{ json: invio }];`;

/** Al posto della pagina 4: conferma da sola, tranne sul possibile doppione. */
export const CODICE_PAGINA_4 = String.raw`// 16 · Al posto della pagina 4: si conferma da soli, perché la riga nasce sempre con attivo = no.
// Tranne un caso: se il 12 ha visto un possibile doppione nella scheda Clienti, non si scrive e si
// avvisa Nicola (nel modulo glielo avrebbe mostrato prima di salvare).
const proposta = $('Controlla la proposta').isExecuted ? $('Controlla la proposta').first().json : null;
const doppioni = proposta && Array.isArray(proposta.doppioni) ? proposta.doppioni.map((d) => String(d)) : [];
if (doppioni.length) {
  return [{ json: { pagina: 'decisione', decisione: 'Annulla', motivo_auto: 'possibile doppione: ' + doppioni.join('; '), formMode: 'mycity' } }];
}
return [{ json: { pagina: 'decisione', decisione: 'Conferma e salva', motivo_auto: '', formMode: 'mycity' } }];`;

/** Ultimo passo del 16: prepara quello che serve al flusso 18 per analizzare l'attività. */
export const CODICE_PREPARA_ANALISI = String.raw`// 16 · Ultimo passo, comunque sia andata la scheda Clienti: si passa l'attività al flusso 18
// («Analisi di un'attività»), con la lettura del web che il 12 ha appena fatto. Il 18 lavora per conto
// suo: se si guasta, la scheda Clienti resta com'è.
const f = $('Modulo nuovo cliente').first().json;
const fatto = (nome) => $(nome).isExecuted;
let esito = 'non scritta';
if (fatto('Avvisa: cliente creato')) esito = 'scritta, con attivo = no';
else if (fatto('Fine: annullato')) esito = 'non scritta: possibile doppione';
else if (fatto('Fine: da correggere')) esito = 'non scritta: dati da correggere';
else if (fatto('Avvisa: ricerca fermata')) esito = 'non scritta: la ricerca sul web si è fermata';
else if (fatto('Avvisa: non scritto')) esito = fatto('Ancora libera?') && $('Ancora libera?').first().json.prova ? 'non scritta: modalità prova' : 'non scritta';
const p = fatto('Controlla la proposta') ? $('Controlla la proposta').first().json : null;
const scheda = p && p.ok ? { analisi: p.analisi || {}, da_confermare: p.da_confermare || [], sito_ufficiale: p.sito_ufficiale || '' } : null;
return [{ json: { id: f.id_mycity, nome: f.nome_locale, origine: 'iscrizione su MyCity', esito_scheda: esito, scheda } }];`;

/** Dopo la scheda: la stessa scheda va al sito, che la conserva e la mostra al venditore da confermare. */
export const CODICE_SCHEDA_SITO = String.raw`// 16 · La scheda va anche al sito (formato concordato con la sessione «Servizi SDG», 24/11/2026):
// il sito la conserva per intero, la mostra al venditore nella dashboard e in vetrina mette solo quello
// che il titolare conferma. «confermato» qui vuol dire «trovato in una fonte», non «confermato dal titolare».
// Mai in modalità prova, mai senza una scheda, e i prezzi non escono mai (menu_con_prezzi resta qui).
const testo = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const cfg = $('Config').first().json;
const prova = testo(cfg.MODALITA).toLowerCase() !== 'vero';
const f = $('Modulo nuovo cliente').first().json;
const p = $('Controlla la proposta').isExecuted ? $('Controlla la proposta').first().json : null;
if (prova) return [{ json: { mandare: false, motivo: 'modalità prova' } }];
if (!p || !p.ok) return [{ json: { mandare: false, motivo: 'nessuna scheda: la ricerca non è arrivata in fondo' } }];
const STATI = { confermato: 'confermato', da_confermare: 'da_confermare', foto: 'foto', frammento: 'frammento', proposta: 'proposta',
  nessuna: 'nessuna', non_trovata: 'da_confermare', bloccata: 'nessuna' };
const MANDO = ['indirizzo', 'telefono', 'orari', 'link_prenotazione', 'link_menu', 'tono_di_voce', 'regole_risposte', 'hashtag_fissi', 'note_piano', 'menu_testo'];
const soloHttps = (u) => (/^https:\/\//i.test(testo(u)) && testo(u).length <= 500 ? testo(u) : null);
const campi = {};
for (const nome of MANDO) {
  const c = (p.campi || {})[nome];
  if (!c) continue;
  const valore = testo(c.valore);
  // Limiti del sito (lib/agenzia/scheda-cliente.ts, SchedaInArrivo): valore al massimo 4000 caratteri, fonte 500.
  campi[nome] = { valore: valore ? valore.slice(0, 4000) : null, stato: valore ? STATI[c.stato] || 'da_confermare' : 'nessuna', fonte: soloHttps(c.fonte) };
}
const sito = testo(p.sito_ufficiale);
campi.sito_ufficiale = { valore: /^https?:\/\//i.test(sito) ? sito : null, stato: sito ? 'da_confermare' : 'nessuna', fonte: soloHttps(sito) };
const a = p.analisi || {};
const lista = (x, quanti) => (Array.isArray(x) ? x.map((v) => testo(v).slice(0, 500)).filter(Boolean).slice(0, quanti) : []);
const chiave = testo(p.chiave_proposta).slice(0, 120);
return [{ json: { mandare: true, corpo: {
  tipo: 'scheda-cliente', origine: 'n8n-16', inviato_il: new Date().toISOString(),
  id_attivita: f.id_mycity,
  // Il sito vuole la chiave come testo o assente: null lo farebbe rispondere 400.
  ...(chiave ? { chiave_cliente: chiave } : {}),
  campi,
  analisi: { tipo_di_locale: testo(a.tipo_di_locale).slice(0, 500) || null, pubblico: testo(a.pubblico).slice(0, 500) || null,
    tono_consigliato: testo(a.tono_consigliato).slice(0, 500) || null,
    punti_di_forza: lista(a.punti_di_forza, 6), idee_contenuti: lista(a.idee_contenuti, 6), cosa_chiedere_al_titolare: lista(a.cosa_chiedere_al_titolare, 6),
    dubbi: lista(a.dubbi, 6) },
  da_confermare: lista(p.da_confermare, 20).map((v) => v.slice(0, 40)),
} } }];`;

// Testo HTML sicuro per Telegram dentro un'espressione n8n.
// Fra parentesi: un'espressione con || dentro accanto a ?? senza parentesi non si legge (errore di sintassi).
const escExpr = (expr) => `String((${expr}) ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')`;

// ---------------------------------------------------------------------------------------------
// La trasformazione
// ---------------------------------------------------------------------------------------------

const eForm = (n) => n.type === 'n8n-nodes-base.form' || n.type === 'n8n-nodes-base.formTrigger';

function nodoCodice(vecchio, nome, codice) {
  return { id: vecchio ? vecchio.id : randomUUID(), name: nome, type: 'n8n-nodes-base.code', typeVersion: 2,
    position: vecchio ? vecchio.position : [0, 0], parameters: { jsCode: codice } };
}
const nodoFermo = (vecchio) => ({ id: vecchio.id, name: vecchio.name, type: 'n8n-nodes-base.noOp', typeVersion: 1,
  position: vecchio.position, parameters: {} });

function nodoTelegram(modello, vecchio, nome, testoExpr, chatId) {
  return { id: vecchio ? vecchio.id : randomUUID(), name: nome, type: 'n8n-nodes-base.telegram',
    typeVersion: modello.typeVersion, position: vecchio ? vecchio.position : [0, 0], onError: 'continueRegularOutput',
    parameters: { resource: 'message', operation: 'sendMessage', chatId, text: `={{ ${testoExpr} }}`,
      additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true } },
    credentials: modello.credentials };
}

/**
 * Prende il modulo 12 (il JSON di n8n) e restituisce il 16. Non tocca l'oggetto ricevuto.
 * opzioni: { credenziale: {id, name}, modalita: 'prova'|'vero', webhookId? }
 */
export function trasforma(modulo12, opzioni = {}) {
  const w = structuredClone(modulo12);
  const per = Object.fromEntries(w.nodes.map((n) => [n.name, n]));
  const manca = [TRIGGER, 'Config', 'Prepara le pagine', PAGINA_4, DOPO_LO_STOP, 'Anteprima su Telegram', ...Object.keys(PAGINE)]
    .filter((n) => !per[n]);
  if (manca.length) throw new Error(`Il modulo 12 non ha più questi nodi: ${manca.join(', ')}. Il generatore va aggiornato.`);
  const telegram = w.nodes.find((n) => n.type === 'n8n-nodes-base.telegram');
  if (!telegram) throw new Error('Il modulo 12 non ha nodi Telegram: non so con che credenziale avvisare.');
  const modalita = opzioni.modalita === 'vero' ? 'vero' : 'prova';

  // Config: stessa del 12, con la modalità scelta qui.
  const config = per.Config;
  const assegnazioni = config.parameters?.assignments?.assignments || [];
  const voce = assegnazioni.find((a) => a.name === 'MODALITA');
  if (!voce) throw new Error('Nel Config del 12 non trovo MODALITA.');
  voce.value = modalita;
  const ricerca = assegnazioni.find((a) => a.name === RICERCA_CON_CLAUDE);
  if (!ricerca) throw new Error(`Nel Config del 12 non trovo ${RICERCA_CON_CLAUDE}: senza, il 16 chiamerebbe l'API di Claude a pagamento.`);
  // Finché il 12 chiama l'API di Claude a pagamento, il 16 tiene la ricerca spenta. Quando il 12 la fa fare
  // all'AD col piano Max («Chiedi all'AD»: nessun nodo a pagamento), il 16 tiene la scelta del 12.
  if (w.nodes.some((n) => aPagamento(n))) ricerca.value = 'no';

  // Via i nodi che servono solo al 12, con i collegamenti che entrano ed escono.
  const via = new Set(SOLO_NEL_12);
  w.nodes = w.nodes.filter((n) => !via.has(n.name));
  for (const nome of SOLO_NEL_12) delete w.connections[nome];
  for (const uscite of Object.values(w.connections)) {
    for (const [tipo, rami] of Object.entries(uscite)) {
      uscite[tipo] = (rami || []).map((ramo) => (ramo || []).filter((v) => !via.has(v.node)));
    }
  }
  const chat = assegnazioni.find((a) => a.name === 'TELEGRAM_CHAT_ID');
  if (!chat || !String(chat.value || '').trim()) throw new Error('Nel Config del 12 non trovo TELEGRAM_CHAT_ID.');
  const chatId = String(chat.value);

  const nuovi = [];
  w.nodes = w.nodes.map((n) => {
    if (n.name === TRIGGER) return nodoCodice(n, TRIGGER, CODICE_RICHIESTA);
    if (PAGINE[n.name]) return nodoCodice(n, n.name, codicePagina(PAGINE[n.name]));
    if (n.name === PAGINA_4) return nodoCodice(n, n.name, CODICE_PAGINA_4);
    if (n.name === 'Fine: da correggere') {
      return nodoTelegram(telegram, n, n.name, `'${DA_MYCITY}⚠️ <b>Scheda non scritta</b> · ' + ${escExpr("$('Modulo nuovo cliente').first().json.nome_locale")} + '\\n' + ${escExpr("($('Controlla il cliente').first().json.errori || []).join('\\n')")} + '\\nCrea il cliente a mano col modulo 12.'`, chatId);
    }
    if (n.name === 'Fine: annullato') {
      return nodoTelegram(telegram, n, n.name, `'${DA_MYCITY}👯 <b>Scheda non scritta</b> · ' + ${escExpr("$('Modulo nuovo cliente').first().json.nome_locale")} + '\\nMotivo: ' + ${escExpr(`$('${PAGINA_4}').first().json.motivo_auto`)} + '\\nControlla nella scheda Clienti; se è davvero un cliente nuovo, crealo col modulo 12.'`, chatId);
    }
    if (n.name === DOPO_LO_STOP) return nodoFermo(n);
    if (eForm(n)) return nodoFermo(n);
    if (n.type === 'n8n-nodes-base.telegram') {
      const t = String(n.parameters.text || '');
      const m = t.match(/^=\{\{\s*([\s\S]*?)\s*\}\}$/);
      if (m) {
        let expr = m[1];
        // Nel 12 il nome e gli appunti li scrive Nicola; qui li ha scritti l'attività iscrivendosi su MyCity.
        if (n.name === 'Anteprima su Telegram') {
          expr = `${expr}.replace(${JSON.stringify(FRASE_PAGINE)}, ${JSON.stringify(FRASE_AUTOMATICA)})`
            + `.replace(/scritto da Nicola/g, ${JSON.stringify("scritto dall'attività su MyCity")})`
            + `.replace(/appunti di Nicola/g, ${JSON.stringify("dati scritti dall'attività su MyCity")})`;
        }
        if (n.name === 'Avvisa: ricerca fermata') expr = `${expr} + '\\nNon ho scritto niente: crea il cliente a mano col modulo 12.'`;
        n.parameters.text = `={{ '${DA_MYCITY}' + ${expr} }}`;
      }
    }
    return n;
  });

  // Ingresso: webhook protetto → «Modulo nuovo cliente» (codice) → Richiesta valida? → Config.
  const [x, y] = per[TRIGGER].position;
  const webhook = {
    id: randomUUID(), name: WEBHOOK, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [x - 440, y],
    webhookId: opzioni.webhookId || randomUUID(),
    parameters: { httpMethod: 'POST', path: PERCORSO_WEBHOOK, authentication: 'headerAuth', responseMode: 'onReceived', options: {} },
    credentials: { httpHeaderAuth: opzioni.credenziale || { id: 'DA_IMPOSTARE', name: NOME_CREDENZIALE } },
  };
  const valida = {
    id: randomUUID(), name: VALIDA, type: 'n8n-nodes-base.if', typeVersion: 2.3, position: [x + 220, y],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
      conditions: [{ id: randomUUID(), leftValue: '={{ $json.scartata }}', rightValue: '', operator: { type: 'boolean', operation: 'false', singleValue: true } }],
      combinator: 'and' }, looseTypeValidation: true, options: {} },
  };
  const daAvvisare = {
    id: randomUUID(), name: 'Da avvisare?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: [x + 440, y + 220],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
      conditions: [{ id: randomUUID(), leftValue: '={{ $json.avvisa }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and' }, looseTypeValidation: true, options: {} },
  };
  const scartata = nodoTelegram(telegram, null, SCARTATA,
    `'${DA_MYCITY}⛔ <b>Attività non lavorata</b> · ' + ${escExpr('$json.nome_locale')} + '\\nMotivo: ' + ${escExpr('$json.motivo')}`, chatId);
  scartata.position = [x + 660, y + 220];
  const nota = {
    id: randomUUID(), name: 'Nota · Da MyCity', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [x - 480, y - 420],
    parameters: { width: 620, height: 360, content: [
      '## 16 · Nuovo cliente da MyCity',
      '',
      '**Generato dal modulo 12** con `N8N/flussi/16-nuovo-cliente-da-mycity/genera.mjs`: non correggerlo a mano, rilancia il programma.',
      '',
      `Quando un'attività si iscrive su MyCity, il sito chiama questo webhook (\`/webhook/${PERCORSO_WEBHOOK}\`) col segreto \`x-mycity-segreto\`. Le pagine del modulo si compilano da sole coi valori proposti dal 12; la riga nasce con **attivo = no**. Doppione possibile o ricerca fermata = niente scritto, avviso su Telegram.`,
      '',
      `**MODALITA** nel Config: «${modalita}» al momento della generazione.`,
      '',
      `**${RICERCA_CON_CLAUDE} = ${ricerca.value}**: ${w.nodes.some((n) => aPagamento(n)) ? "spenta perché il 12 chiama ancora l'API di Claude a pagamento" : "la ricerca la fa l'AD col piano Max («Chiedi all'AD»), come nel 12"}. Senza ricerca la riga non si scrive (avviso su Telegram), l'analisi del 18 e la scheda al sito partono lo stesso.`,
    ].join('\n') },
  };
  w.nodes.push(webhook, valida, daAvvisare, scartata, nota);
  nuovi.push(webhook.name, valida.name, daAvvisare.name, scartata.name);

  const c = w.connections;
  const dopoTrigger = c[TRIGGER];
  c[WEBHOOK] = { main: [[{ node: TRIGGER, type: 'main', index: 0 }]] };
  c[TRIGGER] = { main: [[{ node: VALIDA, type: 'main', index: 0 }]] };
  c[VALIDA] = { main: [dopoTrigger.main[0], [{ node: daAvvisare.name, type: 'main', index: 0 }]] };
  c[daAvvisare.name] = { main: [[{ node: SCARTATA, type: 'main', index: 0 }], []] };
  // Dopo lo stop della ricerca il 12 apre la parte 1 vuota da compilare a mano: qui ci si ferma.
  delete c[DOPO_LO_STOP];

  // Ultimo passo: l'analisi dell'attività (flusso 18). Si collega a ogni punto d'arrivo del 16
  // (un nodo raggiungibile dal Config che non porta da nessuna parte): una corsa ne tocca uno solo.
  if (opzioni.analisi) {
    const raggiunti = new Set();
    const coda = ['Config'];
    while (coda.length) {
      const nodoCorrente = coda.shift();
      if (raggiunti.has(nodoCorrente)) continue;
      raggiunti.add(nodoCorrente);
      for (const ramo of c[nodoCorrente]?.main || []) for (const v of ramo || []) coda.push(v.node);
    }
    const arrivi = [...raggiunti].filter((nome) => {
      const n = w.nodes.find((x) => x.name === nome);
      return n && n.type !== 'n8n-nodes-base.stickyNote' && !(c[nome]?.main || []).some((ramo) => (ramo || []).length);
    });
    const prepara = nodoCodice(null, PREPARA_ANALISI, CODICE_PREPARA_ANALISI);
    const maxX = Math.max(...w.nodes.map((n) => n.position[0]));
    prepara.position = [maxX + 300, y];
    const chiama = {
      id: randomUUID(), name: ANALIZZA, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.3, position: [maxX + 520, y],
      onError: 'continueRegularOutput',
      parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: opzioni.analisi },
        workflowInputs: { mappingMode: 'defineBelow', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true },
        mode: 'once', options: { waitForSubWorkflow: false } },
    };
    w.nodes.push(prepara, chiama);
    for (const nome of arrivi) c[nome] = { main: [[{ node: PREPARA_ANALISI, type: 'main', index: 0 }]] };
    c[PREPARA_ANALISI] = { main: [[{ node: ANALIZZA, type: 'main', index: 0 }]] };
  }

  // La scheda al sito (solo con --sito e --credenziale-sito): accanto all'analisi, dallo stesso ultimo passo.
  if (opzioni.analisi && opzioni.sito) {
    const base = String(opzioni.sito).replace(/\/+$/, '');
    if (!/^https:\/\//i.test(base)) throw new Error("L'indirizzo del sito deve cominciare con https://");
    assegnazioni.push({ id: randomUUID(), name: 'MYCITY_SITO', value: base, type: 'string' });
    const prepara = w.nodes.find((n) => n.name === PREPARA_ANALISI);
    const [px, py] = prepara.position;
    const schedaCodice = nodoCodice(null, SCHEDA_SITO, CODICE_SCHEDA_SITO);
    schedaCodice.position = [px + 220, py + 220];
    const siManda = {
      id: randomUUID(), name: 'Si manda la scheda?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: [px + 440, py + 220],
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
        conditions: [{ id: randomUUID(), leftValue: '={{ $json.mandare }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and' }, looseTypeValidation: true, options: {} },
    };
    const manda = {
      id: randomUUID(), name: MANDA_SITO, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [px + 660, py + 220],
      onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 5000,
      parameters: { method: 'POST', url: `={{ $('Config').first().json.MYCITY_SITO }}${PERCORSO_SCHEDA_SITO}`,
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.corpo) }}',
        options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 15000 } },
      credentials: { httpHeaderAuth: opzioni.credenzialeSito || { id: 'DA_IMPOSTARE', name: 'MyCity - Segreto scheda cliente' } },
    };
    const arrivata = {
      id: randomUUID(), name: 'Il sito ha preso la scheda?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: [px + 880, py + 220],
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
        conditions: [{ id: randomUUID(), leftValue: '={{ Number($json.statusCode) >= 200 && Number($json.statusCode) < 300 }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and' }, looseTypeValidation: true, options: {} },
    };
    const avvisa = nodoTelegram(telegram, null, 'Avvisa: scheda non arrivata al sito',
      `'${DA_MYCITY}⚠️ <b>La scheda non è arrivata al sito</b> · ' + ${escExpr("$('Modulo nuovo cliente').first().json.nome_locale")} + '\\nRisposta: ' + ${escExpr("$json.statusCode || ($json.error && $json.error.message) || 'nessuna'")} + '\\nLa riga nella scheda Clienti c\\'è; il venditore non la vede ancora nella sua dashboard.'`, chatId);
    avvisa.position = [px + 1100, py + 320];
    w.nodes.push(schedaCodice, siManda, manda, arrivata, avvisa);
    c[PREPARA_ANALISI] = { main: [[{ node: ANALIZZA, type: 'main', index: 0 }, { node: SCHEDA_SITO, type: 'main', index: 0 }]] };
    c[SCHEDA_SITO] = { main: [[{ node: siManda.name, type: 'main', index: 0 }]] };
    c[siManda.name] = { main: [[{ node: MANDA_SITO, type: 'main', index: 0 }], []] };
    c[MANDA_SITO] = { main: [[{ node: arrivata.name, type: 'main', index: 0 }]] };
    c[arrivata.name] = { main: [[], [{ node: avvisa.name, type: 'main', index: 0 }]] };
  }

  w.name = NOME_16;
  w.settings = { ...(w.settings || {}), saveManualExecutions: false };
  delete w.id; delete w.active; delete w.versionId; delete w.triggerCount; delete w.shared; delete w.tags;
  delete w.createdAt; delete w.updatedAt; delete w.staticData; delete w.pinData; delete w.meta; delete w.isArchived;
  return w;
}

// ---------------------------------------------------------------------------------------------
// I controlli: si fanno prima di mandare, e nelle prove.
// ---------------------------------------------------------------------------------------------

/** Restituisce l'elenco dei problemi del 16 generato (vuoto = a posto). */
export function controlla(w) {
  const problemi = [];
  const nomi = new Set(w.nodes.map((n) => n.name));
  if (nomi.size !== w.nodes.length) problemi.push('due nodi con lo stesso nome');
  for (const n of w.nodes) if (eForm(n)) problemi.push(`resta un nodo del modulo: «${n.name}»`);
  // Ogni $('Nodo') citato nel codice o nelle espressioni deve esistere.
  for (const n of w.nodes) {
    const s = JSON.stringify(n.parameters || {});
    // Nel JSON le virgolette doppie sono scappate (\"), gli apici no: $("Verifica l'aggiornamento") e $('Config').
    for (const m of s.matchAll(/\$\(\\"(.+?)\\"\)|\$\('([^']+)'\)/g)) {
      const citato = m[1] ?? m[2];
      if (!nomi.has(citato)) problemi.push(`«${n.name}» cita «${citato}», che non esiste`);
    }
  }
  for (const [da, uscite] of Object.entries(w.connections)) {
    if (!nomi.has(da)) problemi.push(`collegamento da un nodo che non esiste: «${da}»`);
    for (const ramo of uscite.main || []) for (const v of ramo || []) if (!nomi.has(v.node)) problemi.push(`collegamento verso un nodo che non esiste: «${v.node}»`);
  }
  const webhook = w.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
  if (!webhook) problemi.push('manca il webhook');
  else {
    if (webhook.parameters.authentication !== 'headerAuth') problemi.push('il webhook non chiede il segreto');
    if (!webhook.credentials?.httpHeaderAuth?.id || webhook.credentials.httpHeaderAuth.id === 'DA_IMPOSTARE') problemi.push('il webhook non ha la credenziale del segreto');
    if (webhook.parameters.responseMode !== 'onReceived') problemi.push('il webhook deve rispondere subito (il sito aspetta 5 secondi)');
  }
  // Dal webhook si deve arrivare alla scrittura del cliente.
  const raggiunti = new Set();
  const coda = webhook ? [webhook.name] : [];
  while (coda.length) {
    const n = coda.shift();
    if (raggiunti.has(n)) continue;
    raggiunti.add(n);
    for (const ramo of w.connections[n]?.main || []) for (const v of ramo || []) coda.push(v.node);
  }
  for (const tappa of ['Config', 'Cerca il locale con Claude', 'Controlla il cliente', 'Ancora libera?', 'Scrivi il cliente', 'Avvisa: cliente creato']) {
    if (nomi.has(tappa) && !raggiunti.has(tappa)) problemi.push(`dal webhook non si arriva a «${tappa}»`);
  }
  // Dopo lo stop della ricerca si può andare solo all'analisi dell'attività, mai verso le pagine.
  const dopoLoStop = (w.connections[DOPO_LO_STOP]?.main || []).flat().filter(Boolean).map((v) => v.node);
  if (dopoLoStop.some((nome) => nome !== PREPARA_ANALISI)) problemi.push('dopo lo stop della ricerca il 16 andrebbe avanti a scrivere una scheda vuota');
  const analisi = w.nodes.find((n) => n.name === ANALIZZA);
  if (analisi) {
    if (analisi.parameters?.options?.waitForSubWorkflow !== false) problemi.push("l'analisi deve partire senza far aspettare il 16");
    if (!analisi.parameters?.workflowId?.value) problemi.push("la chiamata dell'analisi non dice quale flusso");
    for (const arrivo of ['Avvisa: cliente creato', 'Fine: annullato', 'Fine: da correggere', 'Avvisa: non scritto', 'Avvisa: ricerca fermata']) {
      if (!nomi.has(arrivo)) continue;
      const giu = new Set();
      const coda = [arrivo];
      while (coda.length) { const x = coda.shift(); if (giu.has(x)) continue; giu.add(x); for (const ramo of w.connections[x]?.main || []) for (const v of ramo || []) coda.push(v.node); }
      if (!giu.has(ANALIZZA)) problemi.push(`dopo «${arrivo}» l'analisi dell'attività non parte`);
    }
  }
  const manda = w.nodes.find((n) => n.name === MANDA_SITO);
  if (manda) {
    if (!manda.credentials?.httpHeaderAuth?.id || manda.credentials.httpHeaderAuth.id === 'DA_IMPOSTARE') problemi.push('la scheda al sito non ha la credenziale del segreto');
    const scheda = w.nodes.find((n) => n.name === SCHEDA_SITO);
    if (!scheda || /MANDO = \[[^\]]*menu_con_prezzi/.test(scheda.parameters.jsCode || '')) problemi.push('i prezzi non devono andare al sito');
  }
  const cfg = w.nodes.find((n) => n.name === 'Config');
  const mod = cfg?.parameters?.assignments?.assignments?.find((a) => a.name === 'MODALITA')?.value;
  if (!['prova', 'vero'].includes(mod)) problemi.push(`MODALITA nel Config è «${mod}»`);
  const ric = cfg?.parameters?.assignments?.assignments?.find((a) => a.name === RICERCA_CON_CLAUDE)?.value;
  if (ric !== 'no' && w.nodes.some((n) => aPagamento(n))) problemi.push(`${RICERCA_CON_CLAUDE} nel Config è «${ric}»: il 16 chiamerebbe l'API di Claude a pagamento`);
  for (const nome of SOLO_NEL_12) {
    if (nomi.has(nome)) problemi.push(`c'è «${nome}»: il 16 iscriverebbe di nuovo in MyCity chi si è appena iscritto`);
  }
  return problemi;
}

// ---------------------------------------------------------------------------------------------
// Da riga di comando
// ---------------------------------------------------------------------------------------------

async function principale(argv) {
  const valore = (nome) => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : undefined; };
  const api = await import('../n8n-api.mjs');
  let modulo12;
  if (valore('--file')) modulo12 = JSON.parse(readFileSync(valore('--file'), 'utf8'));
  else {
    const trovato = (await api.elencoFlussi()).find((w) => w.name === NOME_MODULO_12);
    if (!trovato) throw new Error(`Su n8n non trovo «${NOME_MODULO_12}».`);
    modulo12 = await api.leggiFlusso(trovato.id);
  }
  const idCredenziale = valore('--credenziale');
  // Se il 16 esiste già, si tiene lo stesso webhookId: l'indirizzo non cambia.
  let webhookId;
  try {
    const gia = (await api.elencoFlussi()).find((w) => w.name === NOME_16);
    webhookId = gia?.nodes?.find((n) => n.name === WEBHOOK)?.webhookId;
  } catch { /* senza API: un id nuovo */ }
  let idAnalisi = valore('--analisi');
  if (!idAnalisi && !valore('--file')) {
    idAnalisi = (await api.elencoFlussi()).find((x) => x.name === "18 · Analisi di un'attività")?.id;
  }
  const w = trasforma(modulo12, {
    modalita: argv.includes('--vero') ? 'vero' : 'prova',
    credenziale: idCredenziale ? { id: idCredenziale, name: NOME_CREDENZIALE } : undefined,
    webhookId,
    analisi: idAnalisi,
    sito: valore('--sito'),
    credenzialeSito: valore('--credenziale-sito') ? { id: valore('--credenziale-sito'), name: 'MyCity - Segreto scheda cliente' } : undefined,
  });
  const problemi = controlla(w);
  if (valore('--scrivi')) writeFileSync(valore('--scrivi'), JSON.stringify(w, null, 2));
  if (problemi.length) {
    console.error('Il 16 generato non va bene:\n- ' + problemi.join('\n- '));
    process.exit(1);
  }
  console.log(`16 generato: ${w.nodes.length} nodi, MODALITA ${argv.includes('--vero') ? 'vero' : 'prova'}, controlli a posto.`);
  if (argv.includes('--manda')) {
    const esito = await api.creaOAggiorna(w);
    console.log(`${esito.creato ? 'Creato' : 'Aggiornato'} su n8n: id ${esito.id}, ${esito.attivo ? 'ACCESO' : 'spento'}.`);
    console.log(`Indirizzo per MyCity (quando è acceso): ${api.N8N_URL}/webhook/${PERCORSO_WEBHOOK}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principale(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
