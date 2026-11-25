// Chiedi all'AD — il sotto-flusso che fa fare all'AD (piano Max) il lavoro con l'IA, al posto dell'API di
// Claude a pagamento (decisione di Nicola del 24/11/2026: nessun flusso n8n chiama più l'API di Claude).
//
// Come funziona:
//   1. un altro flusso lo chiama («Esegui un flusso», modalità «una volta per tutti gli elementi») con uno o
//      più lavori { flusso, compito, dati, schema };
//   2. «Prepara il lavoro» li mette in UNA richiesta, guarda la memoria (stesso lavoro dell'ultima volta?
//      tetto di corse al giorno e all'ora?) e ci aggiunge l'indirizzo di ritorno ($execution.resumeUrl);
//   3. «Fai partire la routine» chiama POST /v1/claude_code/routines/<id>/fire con la chiave della routine
//      (credenziale n8n «Chiedi all'AD - chiave della routine»: la crea Nicola, mai nel repository);
//   4. «Aspetta la risposta» (nodo Wait) tiene fermo il flusso finché l'AD non manda la risposta
//      all'indirizzo di ritorno, al massimo ATTESA_MINUTI;
//   5. «Componi la risposta» restituisce un elemento per lavoro: { ok, flusso, risultato, avvisi, errore,
//      dalla_memoria, prova }.
//
// MODALITA = prova (di serie): la routine non parte e non si conta; il flusso aspetta PROVA_ATTESA_MINUTI e
// torna con ok = false, prova = true. Chi vuole provare il giro completo manda a mano un corpo
// { "ok": true, "risultato": … } all'indirizzo di ritorno mentre aspetta.
//
// Uso: N8N_API_KEY=… node flussi/chiedi-all-ad/costruisci.mjs [--vero|--prova] [--manda] [--routine trig_…] [--chiave <id credenziale>]
//   --manda    crea o aggiorna il flusso su n8n (non lo accende); senza, controlla soltanto
//   --vero     MODALITA = vero (la routine parte davvero); --prova la rimette in prova; senza nessuno dei
//              due si tiene la modalità del flusso già su n8n (di serie prova)
//   --routine  l'id della routine; con --manda, se manca, si tiene quello del flusso già su n8n
//   --chiave   l'id della credenziale con la chiave; con --manda, se manca, si tiene quella del flusso su
//              n8n, oppure si crea la credenziale vuota da riempire (senza la chiave vera)

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NOMI, trovaFlusso } from '../nomi.mjs';

export const NOME_CHIEDI = NOMI.chiediAllAd; // trovaFlusso trova anche il nome di prima, «Chiedi all'AD»
export const NOME_CHIAVE = "Chiedi all'AD - chiave della routine";
export const URL_ROUTINE = 'https://api.anthropic.com/v1/claude_code/routines/';
export const PARTI = 'Fai partire la routine';
export const ASPETTA = 'Aspetta la risposta';
export const TABELLA_ALLEGATI = "Allegati per l'AD";
export const URL_ALLEGATI = 'https://n8n-shdy.sliplane.app/webhook/allegati-ad';
/** Le colonne della tabella degli allegati che «Chiedi all'AD» scrive. */
const COLONNE = [['impronta', 'string'], ['corsa', 'string'], ['scade', 'number'], ['nome', 'string'], ['tipo', 'string'], ['mime', 'string'], ['contenuto', 'string']];
const QUI = dirname(fileURLToPath(import.meta.url));
const codice = (nome) => readFileSync(join(QUI, 'codice', nome), 'utf8');

export function costruisci({ routine, chiave, vero = false, webhookId, errori, tabellaId } = {}) {
  // La tabella degli allegati per id quando lo si conosce (con --manda), altrimenti per nome (vedi allegati.mjs).
  const tabella = () => (tabellaId ? { __rl: true, mode: 'id', value: tabellaId, cachedResultName: TABELLA_ALLEGATI } : { __rl: true, mode: 'name', value: TABELLA_ALLEGATI });
  const pos = (i, riga = 0) => [i * 240, riga * 200];
  const nodi = [];
  const collega = {};
  const vai = (da, ...verso) => { collega[da] = { main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) }; };
  const se = (expr) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
    conditions: [{ id: randomUUID(), leftValue: expr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and' }, looseTypeValidation: true, options: {} });

  nodi.push(
    { id: randomUUID(), name: 'Da un altro flusso', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1, position: pos(0),
      parameters: { inputSource: 'passthrough' } },
    { id: randomUUID(), name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: pos(1), executeOnce: true,
      parameters: { mode: 'manual', includeOtherFields: false, options: {}, assignments: { assignments: [
        ['MODALITA', vero ? 'vero' : 'prova'],
        ['ROUTINE_ID', routine || 'DA_IMPOSTARE'],
        ['TETTO_GIORNO', 40],
        // La routine accetta 30 partenze all'ora: se ne usano al massimo 25, il resto è riserva.
        ['TETTO_ORA', 25],
        ['ATTESA_MINUTI', 15],
        ['PROVA_ATTESA_MINUTI', 2],
        // Dove l'AD scarica gli allegati (flusso «Allegati per l'AD»): il gettone va dopo «?g=».
        ['ALLEGATI_URL', URL_ALLEGATI],
        // Oltre questi MB di allegati vivi il lavoro non parte (il tetto di n8n è comune a tutte le tabelle).
        ['ALLEGATI_SOGLIA_MB', 40],
      ].map(([name, value]) => ({ id: randomUUID(), name, value, type: typeof value === 'number' ? 'number' : 'string' })) } } },
    // Gli allegati: controllati, un gettone casuale da 256 bit per ognuno, e la sua impronta SHA-256.
    { id: randomUUID(), name: 'Allegati del lavoro', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(2, 1),
      parameters: { jsCode: codice('allegati-lavoro.js') } },
    { id: randomUUID(), name: 'Gettoni', type: 'n8n-nodes-base.crypto', typeVersion: 1, position: pos(3, 1),
      parameters: { action: 'generate', encodingType: 'hex', stringLength: 64, dataPropertyName: 'gettone' } },
    { id: randomUUID(), name: 'Impronte', type: 'n8n-nodes-base.crypto', typeVersion: 1, position: pos(4, 1),
      parameters: { action: 'hash', type: 'SHA256', value: '={{ $json.gettone }}', dataPropertyName: 'impronta', encoding: 'hex' } },
    { id: randomUUID(), name: 'Prepara il lavoro', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(2),
      parameters: { jsCode: codice('prepara-lavoro.js') } },
    // Prima di far partire la routine gli allegati sono nella tabella; dopo la risposta (o se non parte) si cancellano.
    { id: randomUUID(), name: 'Salva gli allegati?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(3, -1),
      parameters: se('={{ Array.isArray($json.righe) && $json.righe.length > 0 }}') },
    { id: randomUUID(), name: 'Righe degli allegati', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(3, -3),
      parameters: { jsCode: "// Una riga della tabella per allegato.\nreturn ($('Prepara il lavoro').first().json.righe || []).map((r) => ({ json: r }));" } },
    // Se la tabella non accetta le righe (manca, è piena) la routine non parte: «Allegati non salvati» restituisce il
    // posto contato da «Prepara il lavoro» e la corsa finisce con l'errore, dopo aver cancellato le righe già scritte.
    { id: randomUUID(), name: 'Salva gli allegati', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos(4, -3), onError: 'continueErrorOutput',
      parameters: { resource: 'row', operation: 'insert', dataTableId: tabella(),
        columns: { mappingMode: 'defineBelow', value: Object.fromEntries(COLONNE.map(([c]) => [c, `={{ $json.${c} }}`])),
          schema: COLONNE.map(([c, tipo]) => ({ id: c, displayName: c, required: false, defaultMatch: false, display: true, type: tipo, canBeUsedToMatch: true })) },
        options: {} } },
    { id: randomUUID(), name: 'Allegati non salvati', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(5, -4),
      parameters: { jsCode: codice('allegati-non-salvati.js') } },
    { id: randomUUID(), name: 'Rimetti il lavoro', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(5, -3),
      parameters: { jsCode: "// Dopo il salvataggio si riprende il lavoro preparato, ma solo se TUTTE le righe sono entrate: se ne manca\n// qualcuna la routine non parte, e ci pensa «Allegati non salvati».\nconst prep = $('Prepara il lavoro').first();\nconst attese = (prep.json.righe || []).length;\nreturn $input.all().length >= attese ? [prep] : [];" } },
    { id: randomUUID(), name: 'Cancella gli allegati?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(7, 1),
      parameters: se("={{ Array.isArray($('Prepara il lavoro').first().json.righe) && $('Prepara il lavoro').first().json.righe.length > 0 }}") },
    { id: randomUUID(), name: 'Cancella gli allegati', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos(7, 3),
      executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput',
      parameters: { resource: 'row', operation: 'deleteRows', dataTableId: tabella(), matchType: 'allConditions',
        filters: { conditions: [{ keyName: 'corsa', condition: 'eq', keyValue: '={{ String($execution.id) }}' }] }, options: {} } },
    { id: randomUUID(), name: 'Rimetti la risposta', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(8, 3),
      parameters: { jsCode: `// Dopo la cancellazione si riprende quello che era arrivato: la risposta dell'AD, l'esito della partenza,\n// oppure l'errore del salvataggio.\nif ($('${ASPETTA}').isExecuted) return $('${ASPETTA}').all();\nif ($('${PARTI}').isExecuted) return $('${PARTI}').all();\nreturn $('Allegati non salvati').all();` } },
    { id: randomUUID(), name: 'Deve aspettare?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(3),
      parameters: se("={{ ['parti', 'prova'].includes($json.azione) }}") },
    { id: randomUUID(), name: 'Parte davvero?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(4, -1),
      parameters: se("={{ $json.azione === 'parti' }}") },
    { id: randomUUID(), name: PARTI, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(5, -2),
      onError: 'continueRegularOutput',
      parameters: { method: 'POST', url: `=${URL_ROUTINE}{{ $('Config').first().json.ROUTINE_ID }}/fire`,
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendHeaders: true, headerParameters: { parameters: [
          { name: 'anthropic-beta', value: 'experimental-cc-routine-2026-04-01' },
          { name: 'anthropic-version', value: '2023-06-01' },
        ] },
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.corpo) }}',
        options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 30000 } },
      credentials: { httpHeaderAuth: chiave ? { id: chiave, name: NOME_CHIAVE } : { id: 'DA_IMPOSTARE', name: NOME_CHIAVE } } },
    { id: randomUUID(), name: 'Partita?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(6, -2),
      parameters: se('={{ Number($json.statusCode) >= 200 && Number($json.statusCode) < 300 }}') },
    { id: randomUUID(), name: ASPETTA, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: pos(7, -1), webhookId: webhookId || randomUUID(),
      parameters: { resume: 'webhook', httpMethod: 'POST', limitWaitTime: true, limitType: 'afterTimeInterval',
        resumeAmount: "={{ $('Prepara il lavoro').first().json.azione === 'prova' ? $('Config').first().json.PROVA_ATTESA_MINUTI : $('Config').first().json.ATTESA_MINUTI }}",
        resumeUnit: 'minutes', options: {} } },
    { id: randomUUID(), name: 'Componi la risposta', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(8),
      parameters: { jsCode: codice('componi-risposta.js') } },
  );
  vai('Da un altro flusso', 'Config');
  // Config gira una volta; gli allegati e «Prepara il lavoro» leggono tutti i lavori dal trigger, non da Config.
  vai('Config', 'Allegati del lavoro');
  vai('Allegati del lavoro', 'Gettoni');
  vai('Gettoni', 'Impronte');
  vai('Impronte', 'Prepara il lavoro');
  vai('Deve aspettare?', 'Salva gli allegati?', 'Componi la risposta');
  vai('Salva gli allegati?', 'Righe degli allegati', 'Parte davvero?');
  vai('Righe degli allegati', 'Salva gli allegati');
  vai('Salva gli allegati', 'Rimetti il lavoro', 'Allegati non salvati');
  vai('Allegati non salvati', 'Cancella gli allegati');
  vai('Rimetti il lavoro', 'Parte davvero?');
  vai('Prepara il lavoro', 'Deve aspettare?');
  vai('Parte davvero?', PARTI, ASPETTA);
  vai(PARTI, 'Partita?');
  vai('Partita?', ASPETTA, 'Cancella gli allegati?');
  vai(ASPETTA, 'Cancella gli allegati?');
  vai('Cancella gli allegati?', 'Cancella gli allegati', 'Componi la risposta');
  vai('Cancella gli allegati', 'Rimetti la risposta');
  vai('Rimetti la risposta', 'Componi la risposta');

  nodi.push({ id: randomUUID(), name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -760],
    parameters: { width: 820, height: 460, content: [
      "## Chiedi all'AD",
      '',
      "**Cosa fa.** Fa fare il lavoro con l'IA all'AD col piano Max, attraverso la routine «Chiedi all'AD», al posto dell'API di Claude a pagamento (Nicola, 24/11/2026). Lo chiamano gli altri flussi con «Esegui un flusso», una volta per tutti gli elementi.",
      '',
      '**Riceve** uno o più lavori `{ flusso, compito, dati, schema }`. Più lavori = una corsa sola. **Restituisce** un elemento per lavoro: `{ ok, flusso, risultato, avvisi, errore, dalla_memoria, prova }`.',
      '',
      '**Regole.** Al massimo TETTO_GIORNO corse al giorno e TETTO_ORA in un\'ora (la routine ne accetta 30). Se compito e dati sono uguali all\'ultima volta, ridà la risposta di allora senza far partire la routine. Aspetta al massimo ATTESA_MINUTI.',
      '',
      '**MODALITA = prova**: la routine non parte; il flusso aspetta PROVA_ATTESA_MINUTI e torna con `prova = true`.',
      '',
      "**La chiave** sta nella credenziale «Chiedi all'AD - chiave della routine» (Header Auth: nome `Authorization`, valore `Bearer <chiave>`). La chiave si crea dalla pagina web della routine, e si incolla solo lì.",
      '',
      '**Generato** da `N8N/flussi/chiedi-all-ad/costruisci.mjs`: le modifiche vanno fatte lì.',
    ].join('\n') } });

  return {
    name: NOME_CHIEDI, nodes: nodi, connections: collega,
    // Le corse non si salvano, né riuscite (regia, 25/11) né fallite (collaudo degli allegati, 25/11): nei dati del
    // trigger arrivano cataloghi e foto dei clienti, che resterebbero nello storico di n8n per 14 giorni. Quando una
    // corsa si rompe, l'avviso parte lo stesso dal «99 · Avvisi errori» (senza i dati).
    settings: { executionOrder: 'v1', timezone: 'Europe/Rome', saveManualExecutions: true, saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none', callerPolicy: 'workflowsFromSameOwner', ...(errori ? { errorWorkflow: errori } : {}) },
  };
}

/** I problemi del flusso costruito (vuoto = a posto). */
export function controlla(w) {
  const problemi = [];
  const nomi = new Set(w.nodes.map((n) => n.name));
  if (nomi.size !== w.nodes.length) problemi.push('due nodi con lo stesso nome');
  for (const n of w.nodes) {
    const s = JSON.stringify(n.parameters || {});
    for (const m of s.matchAll(/\$\(\\"(.+?)\\"\)|\$\('([^']+)'\)/g)) {
      const citato = m[1] ?? m[2];
      if (!nomi.has(citato)) problemi.push(`«${n.name}» cita «${citato}», che non esiste`);
    }
    if (s.includes('api.anthropic.com') && !s.includes(URL_ROUTINE)) problemi.push(`«${n.name}» chiama l'API di Claude a pagamento`);
    for (const c of Object.values(n.credentials || {})) if (c.id === 'DA_IMPOSTARE') problemi.push(`«${n.name}» non ha la credenziale`);
  }
  for (const [da, uscite] of Object.entries(w.connections)) {
    if (!nomi.has(da)) problemi.push(`collegamento da un nodo che non esiste: «${da}»`);
    for (const ramo of uscite.main || []) for (const v of ramo || []) if (!nomi.has(v.node)) problemi.push(`collegamento verso «${v.node}», che non esiste`);
  }
  const cfg = Object.fromEntries(w.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments.map((a) => [a.name, a.value]));
  if (!['prova', 'vero'].includes(cfg.MODALITA)) problemi.push('MODALITA deve essere prova o vero');
  if (cfg.MODALITA === 'vero' && !/^trig_[A-Za-z0-9]+$/.test(String(cfg.ROUTINE_ID))) problemi.push('manca l\'id della routine');
  if (!(cfg.TETTO_ORA > 0 && cfg.TETTO_ORA < 30)) problemi.push('TETTO_ORA deve stare sotto le 30 partenze all\'ora della routine');
  if (!(cfg.TETTO_GIORNO > 0 && cfg.TETTO_GIORNO <= 40)) problemi.push('TETTO_GIORNO al massimo 40');
  const aspetta = w.nodes.find((n) => n.name === ASPETTA);
  if (!aspetta || aspetta.parameters.resume !== 'webhook' || aspetta.parameters.limitWaitTime !== true) problemi.push("l'attesa deve avere un tempo massimo");
  if (w.connections[PARTI]?.main?.[0]?.[0]?.node !== 'Partita?') problemi.push('dopo la partenza manca il controllo «Partita?»');
  // Gli allegati: salvati prima della partenza, cancellati dopo la risposta o se la routine non parte.
  const dopo = (da, i = 0) => (w.connections[da]?.main?.[i] || []).map((c) => c.node);
  if (!dopo('Salva gli allegati?').includes('Righe degli allegati') || !dopo('Rimetti il lavoro').includes('Parte davvero?')) problemi.push('gli allegati non si salvano prima della partenza');
  if (!dopo(ASPETTA).includes('Cancella gli allegati?') || !dopo('Partita?', 1).includes('Cancella gli allegati?')) problemi.push('gli allegati non si cancellano dopo la risposta');
  if (!dopo('Salva gli allegati', 1).includes('Allegati non salvati') || !dopo('Allegati non salvati').includes('Cancella gli allegati')) problemi.push('se il salvataggio fallisce, il posto non torna e le righe restano');
  if (w.settings?.saveDataSuccessExecution !== 'none') problemi.push('le corse riuscite non devono salvarsi: con gli allegati terrebbero le foto dei clienti');
  if (w.settings?.saveDataErrorExecution !== 'none') problemi.push('le corse fallite non devono salvarsi: con gli allegati terrebbero le foto dei clienti');
  if (!/^https:\/\/[^/?#]+\/webhook\/[a-z0-9-]+$/.test(String(cfg.ALLEGATI_URL))) problemi.push('ALLEGATI_URL deve essere l\'indirizzo fisso del webhook degli allegati');
  return problemi;
}

async function principale(argv) {
  const valore = (nome) => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : undefined; };
  // MODALITA: --vero o --prova la cambiano; senza, si tiene quella del flusso già su n8n (di serie prova).
  const scelta = argv.includes('--vero') ? true : argv.includes('--prova') ? false : undefined;
  let pezzi = { routine: valore('--routine'), chiave: valore('--chiave'), vero: scelta ?? false };
  let api = null;
  if (argv.includes('--manda')) {
    api = await import('../n8n-api.mjs');
    const tutti = await api.elencoFlussi();
    const gia = trovaFlusso(tutti, NOME_CHIEDI);
    const vecchio = gia ? await api.leggiFlusso(gia.id) : null;
    const nodo = (nome) => vecchio?.nodes?.find((n) => n.name === nome);
    const vecchiaRoutine = nodo('Config')?.parameters?.assignments?.assignments?.find((a) => a.name === 'ROUTINE_ID')?.value;
    let chiave = pezzi.chiave || nodo(PARTI)?.credentials?.httpHeaderAuth?.id;
    if (!chiave || chiave === 'DA_IMPOSTARE') {
      // La credenziale si crea vuota: la chiave vera la incolla Nicola in n8n, mai qui.
      const creata = await api.creaCredenziale(NOME_CHIAVE, 'httpHeaderAuth', { name: 'Authorization', value: 'Bearer INCOLLA-QUI-LA-CHIAVE-DELLA-ROUTINE' });
      chiave = creata.id;
      console.log(`Creata la credenziale «${NOME_CHIAVE}» (id ${chiave}): ci va incollata la chiave della routine.`);
    }
    const vecchiaModalita = nodo('Config')?.parameters?.assignments?.assignments?.find((a) => a.name === 'MODALITA')?.value;
    pezzi = { ...pezzi, vero: scelta ?? vecchiaModalita === 'vero', chiave, routine: pezzi.routine || (vecchiaRoutine !== 'DA_IMPOSTARE' ? vecchiaRoutine : undefined),
      webhookId: nodo(ASPETTA)?.webhookId,
      // Se il sotto-flusso si guasta, l'avviso parte dal 99 come per gli altri flussi.
      errori: trovaFlusso(tutti, NOMI.avvisiErrori)?.id,
      // La tabella degli allegati per id (nome esatto): senza, i nodi la cercano per nome.
      tabellaId: (await api.elencoTabelle()).find((t) => t.name === TABELLA_ALLEGATI)?.id };
  }
  const w = costruisci(pezzi);
  if (valore('--scrivi')) writeFileSync(valore('--scrivi'), JSON.stringify(w, null, 2));
  const problemi = controlla(w).filter((p) => argv.includes('--manda') || !/credenziale/.test(p));
  if (problemi.length) { console.error('«Chiedi all\'AD» non va bene:\n- ' + problemi.join('\n- ')); process.exit(1); }
  console.log(`«Chiedi all'AD» costruito: ${w.nodes.length} nodi, MODALITA = ${pezzi.vero ? 'vero' : 'prova'}, controlli a posto.`);
  if (api) {
    const esito = await api.creaOAggiorna(w);
    console.log(`${esito.creato ? 'Creato' : 'Aggiornato'} su n8n: id ${esito.id}, ${esito.attivo ? 'ACCESO' : 'spento'}.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principale(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
