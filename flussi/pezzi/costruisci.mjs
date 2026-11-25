// I pezzi riusabili (9x): sotto-flussi piccoli che più flussi chiamano con «Esegui un flusso», al posto
// di copiare gli stessi nodi in ognuno. Il piano è in ../PIANO-ORDINE.md.
//
//   92 · Logo del cliente   entra { drive_id | url, campo }        esce { ha_logo, origine, errore } + il file
//   94 · Foto sulla tela    entra il file in «data» + { larghezza, altezza, tela_w, tela_h, colore,
//                           qualita, nome_file }                   esce la foto JPEG in «data» + { tela_w, tela_h }
//
// Tutti e due leggono e basta: non scrivono su fogli, Drive o Telegram, quindi non hanno MODALITA.
// Nascono SPENTI (un sotto-flusso non va acceso: lo fa partire chi lo chiama). Se si guastano, l'avviso
// parte dal 99 · Avvisi errori. Chi li chiama li cerca per id.
//
// Uso: N8N_API_KEY=… node flussi/pezzi/costruisci.mjs [--manda] [--scrivi <cartella>]
//   senza --manda controlla soltanto. La credenziale di Google Drive si prende da n8n (dal flusso
//   «11 · Nuovo cliente»): nel repository non c'è.

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NOMI, trovaFlusso } from '../nomi.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
export const codice = (nome) => readFileSync(join(QUI, 'codice', nome), 'utf8');
export const NOME_92 = '92 · Logo del cliente';
export const NOME_94 = '94 · Foto sulla tela';
const SEGNAPOSTO_DRIVE = { id: 'SEGNAPOSTO_GOOGLE_DRIVE', name: 'Google Drive - Agenzia' };

function telaio(nome, descrizione, errori) {
  const nodi = [];
  const collega = {};
  const pos = (i, riga = 0) => [i * 260, riga * 220];
  const vai = (da, ...verso) => { collega[da] = { main: verso.map((v) => (v ? [].concat(v).map((n) => ({ node: n, type: 'main', index: 0 })) : [])) }; };
  const nodo = (n) => { nodi.push({ id: randomUUID(), ...n }); return n.name; };
  nodo({ name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [-40, -300],
    parameters: { content: descrizione, width: 760, height: 240, color: 7 } });
  nodo({ name: 'Da un altro flusso', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1, position: pos(0),
    parameters: { inputSource: 'passthrough' } });
  const fine = () => ({ name: nome, nodes: nodi, connections: collega,
    settings: { executionOrder: 'v1', callerPolicy: 'workflowsFromSameOwner', availableInMCP: true, ...(errori ? { errorWorkflow: errori } : {}) } });
  return { nodo, vai, pos, fine };
}

export function costruisci92({ drive = SEGNAPOSTO_DRIVE, errori } = {}) {
  const { nodo, vai, pos, fine } = telaio(NOME_92, [
    '## 92 · Logo del cliente',
    'Scarica il logo di un cliente, da **Google Drive** (id o link) o da un **indirizzo https**.',
    '**Entra:** `{ drive_id, url, campo }` (`campo` = dove mettere il file, di serie `logo`).',
    '**Esce:** `{ ha_logo, origine, errore }` e, se `ha_logo`, il file nel campo scelto.',
    'Se il logo non si scarica non si ferma: esce con `ha_logo = false` e il motivo, così chi chiama va avanti senza.',
    'Si costruisce da programma: `N8N/flussi/pezzi/costruisci.mjs`. Non si corregge a mano.',
  ].join('\n'), errori);
  nodo({ name: 'Da dove arriva il logo', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(1),
    parameters: { jsCode: codice('logo-origine.js') } });
  const regola = (chiave) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: randomUUID(), leftValue: '={{ $json.origine }}', rightValue: chiave, operator: { type: 'string', operation: 'equals' } }],
    combinator: 'and' }, renameOutput: true, outputKey: chiave });
  nodo({ name: 'Drive o internet?', type: 'n8n-nodes-base.switch', typeVersion: 3.2, position: pos(2),
    parameters: { rules: { values: [regola('drive'), regola('url')] }, options: { fallbackOutput: 'extra', renameFallbackOutput: 'nessuno' } } });
  nodo({ name: 'Scarica da Drive', type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position: pos(3, -1), onError: 'continueRegularOutput',
    credentials: { googleDriveOAuth2Api: drive },
    parameters: { authentication: 'oAuth2', resource: 'file', operation: 'download',
      fileId: { __rl: true, value: '={{ $json.drive_id }}', mode: 'id' }, options: { binaryPropertyName: 'data' } } });
  nodo({ name: 'Scarica da internet', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(3, 1), onError: 'continueRegularOutput',
    parameters: { url: '={{ $json.url }}', options: { timeout: 60000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } } } });
  nodo({ name: 'Esito', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(4),
    parameters: { jsCode: codice('logo-esito.js') } });
  vai('Da un altro flusso', 'Da dove arriva il logo');
  vai('Da dove arriva il logo', 'Drive o internet?');
  vai('Drive o internet?', 'Scarica da Drive', 'Scarica da internet', 'Esito');
  vai('Scarica da Drive', 'Esito');
  vai('Scarica da internet', 'Esito');
  return fine();
}

export function costruisci94({ errori } = {}) {
  const { nodo, vai, pos, fine } = telaio(NOME_94, [
    '## 94 · Foto sulla tela',
    'Riduce una foto (solo se è più grande), la mette al centro di una tela di colore pieno e la salva in JPEG.',
    '**Entra:** il file nel campo `data` e `{ larghezza, altezza, tela_w, tela_h, colore, qualita, nome_file }`.',
    'Senza `tela_w`/`tela_h` la tela è grande quanto la foto: serve a togliere la trasparenza.',
    '**Esce:** la foto pronta in `data` e `{ tela_w, tela_h, nome_file }`.',
    'Si costruisce da programma: `N8N/flussi/pezzi/costruisci.mjs`. Non si corregge a mano.',
  ].join('\n'), errori);
  const dalPiano = (k) => `={{ $('Piano della tela').first().json.${k} }}`;
  nodo({ name: 'Riduci la foto', type: 'n8n-nodes-base.editImage', typeVersion: 1, position: pos(1),
    parameters: { operation: 'resize', dataPropertyName: 'data',
      width: "={{ Number($('Da un altro flusso').first().json.larghezza) || 1568 }}",
      height: "={{ Number($('Da un altro flusso').first().json.altezza) || 1568 }}",
      resizeOption: 'onlyIfLarger', options: { format: 'png' } } });
  nodo({ name: 'Misura la foto', type: 'n8n-nodes-base.editImage', typeVersion: 1, position: pos(2),
    parameters: { operation: 'information', dataPropertyName: 'data' } });
  nodo({ name: 'Piano della tela', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(3),
    parameters: { jsCode: codice('tela-piano.js') } });
  nodo({ name: 'Prepara la tela', type: 'n8n-nodes-base.editImage', typeVersion: 1, position: pos(4),
    parameters: { operation: 'create', width: dalPiano('tela_w'), height: dalPiano('tela_h'), backgroundColor: dalPiano('colore'),
      options: { destinationKey: 'tela' } } });
  nodo({ name: 'Metti sulla tela', type: 'n8n-nodes-base.editImage', typeVersion: 1, position: pos(5),
    parameters: { operation: 'multiStep', dataPropertyName: 'tela',
      operations: { operations: [{ operation: 'composite', dataPropertyNameComposite: 'data', operator: 'Over',
        positionX: dalPiano('x'), positionY: dalPiano('y') }] },
      options: { format: 'jpeg', quality: dalPiano('qualita'), fileName: dalPiano('nome_file'), destinationKey: 'data' } } });
  nodo({ name: 'Foto pronta', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(6),
    parameters: { jsCode: codice('tela-esito.js') } });
  vai('Da un altro flusso', 'Riduci la foto');
  vai('Riduci la foto', 'Misura la foto');
  vai('Misura la foto', 'Piano della tela');
  vai('Piano della tela', 'Prepara la tela');
  vai('Prepara la tela', 'Metti sulla tela');
  vai('Metti sulla tela', 'Foto pronta');
  return fine();
}

/** Controlli prima di mandare: collegamenti verso nodi che ci sono, codice che si compila, niente segnaposto. */
export function controlla(w, { conCredenziali = false } = {}) {
  const problemi = [];
  const nomi = new Set(w.nodes.map((n) => n.name));
  if (nomi.size !== w.nodes.length) problemi.push('due nodi con lo stesso nome');
  for (const [da, u] of Object.entries(w.connections)) {
    if (!nomi.has(da)) problemi.push(`collegamento da un nodo che non c'è: ${da}`);
    for (const ramo of u.main) for (const c of ramo) if (!nomi.has(c.node)) problemi.push(`collegamento verso un nodo che non c'è: ${c.node}`);
  }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  for (const n of w.nodes) {
    if (n.parameters?.jsCode) { try { new AsyncFunction('$', '$input', n.parameters.jsCode); } catch (e) { problemi.push(`${n.name}: il codice non si compila (${e.message})`); } }
    if (conCredenziali && JSON.stringify(n.credentials || {}).includes('SEGNAPOSTO')) problemi.push(`${n.name}: credenziale segnaposto`);
  }
  if (!w.settings.errorWorkflow && conCredenziali) problemi.push('manca il 99 · Avvisi errori');
  return problemi;
}

async function principale(argv) {
  const valore = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const manda = argv.includes('--manda');
  let pezzi = {};
  let api = null;
  if (manda) {
    api = await import('../n8n-api.mjs');
    const tutti = await api.elencoFlussi();
    const m11 = trovaFlusso(tutti, NOMI.nuovoCliente);
    const drive = m11?.nodes?.find((n) => n.credentials?.googleDriveOAuth2Api)?.credentials?.googleDriveOAuth2Api;
    if (!drive) throw new Error(`Non trovo la credenziale di Google Drive in «${NOMI.nuovoCliente}».`);
    pezzi = { drive: { id: drive.id, name: drive.name }, errori: trovaFlusso(tutti, NOMI.avvisiErrori)?.id };
  }
  const flussi = [costruisci92(pezzi), costruisci94(pezzi)];
  let ok = true;
  for (const w of flussi) {
    const problemi = controlla(w, { conCredenziali: manda });
    if (valore('--scrivi')) { mkdirSync(valore('--scrivi'), { recursive: true }); writeFileSync(join(valore('--scrivi'), `${w.name.slice(0, 2)}.json`), JSON.stringify(w, null, 2)); }
    if (problemi.length) { ok = false; console.error(`«${w.name}» non va bene:\n- ${problemi.join('\n- ')}`); continue; }
    console.log(`«${w.name}»: ${w.nodes.length} nodi, controlli a posto.`);
    if (api) {
      const esito = await api.creaOAggiorna(w);
      console.log(`  ${esito.creato ? 'Creato' : 'Aggiornato'} su n8n: id ${esito.id}, ${esito.attivo ? 'ACCESO' : 'spento'}.`);
    }
  }
  if (!ok) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principale(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
