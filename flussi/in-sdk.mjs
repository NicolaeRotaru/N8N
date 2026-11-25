// Da un flusso costruito dai nostri programmi (il JSON di n8n) al codice dell'SDK dei flussi di n8n.
//
// Perché esiste: i programmi `costruisci.mjs` caricano i flussi con l'API pubblica di n8n, che vuole
// N8N_API_KEY. Una sessione che ha il collegamento MCP a n8n (gli strumenti validate_workflow e
// create_workflow_from_code) non ha la chiave, ma accetta il codice dell'SDK: questo traduttore lo scrive
// dallo stesso flusso, così quello che sta su n8n resta quello che fa il programma, senza ricopiarlo a mano.
//
// Le credenziali passano con id e nome com'erano nel flusso: un segnaposto resta segnaposto.
//
// Uso: import { inSdk } from '../in-sdk.mjs'; const codice = inSdk(flusso);

const J = (v) => JSON.stringify(v);
const DI_PARTENZA = new Set(['n8n-nodes-base.webhook', 'n8n-nodes-base.executeWorkflowTrigger', 'n8n-nodes-base.scheduleTrigger',
  'n8n-nodes-base.manualTrigger', 'n8n-nodes-base.formTrigger']);
const IMPOSTAZIONI_DEL_NODO = ['executeOnce', 'onError', 'retryOnFail', 'maxTries', 'waitBetweenTries', 'alwaysOutputData', 'disabled', 'notes'];

export function inSdk(flusso) {
  const variabile = new Map(flusso.nodes.map((n, i) => [n.name, `nodo${i}`]));
  const righe = ["import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';", ''];
  for (const n of flusso.nodes) {
    const v = variabile.get(n.name);
    if (n.type === 'n8n-nodes-base.stickyNote') {
      const { content, ...resto } = n.parameters || {};
      righe.push(`const ${v} = sticky(${J(content || '')}, [], ${J({ name: n.name, position: n.position, ...resto })});`);
      continue;
    }
    const config = { name: n.name, parameters: n.parameters || {}, position: n.position };
    if (n.credentials) config.credentials = n.credentials;
    for (const k of IMPOSTAZIONI_DEL_NODO) if (n[k] !== undefined) config[k] = n[k];
    const fabbrica = DI_PARTENZA.has(n.type) ? 'trigger' : 'node';
    righe.push(`const ${v} = ${fabbrica}({ type: ${J(n.type)}, version: ${n.typeVersion}, config: ${J(config)} });`);
  }
  righe.push('', `export default workflow(${J(flusso.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))}, ${J(flusso.name)})`);
  for (const n of flusso.nodes) righe.push(`  .add(${variabile.get(n.name)})`);
  for (const [da, uscite] of Object.entries(flusso.connections || {})) {
    (uscite.main || []).forEach((ramo, indice) => {
      for (const verso of ramo || []) {
        const uscita = (uscite.main.length > 1 || indice > 0) ? `.output(${indice})` : '';
        righe.push(`  .add(${variabile.get(da)}${uscita}.to(${variabile.get(verso.node)}))`);
      }
    });
  }
  righe[righe.length - 1] += ';';
  return righe.join('\n') + '\n';
}
