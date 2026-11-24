// Esegue il codice di un nodo Code di n8n fuori da n8n, per le prove.
// Imita solo quello che i nostri nodi usano: $('Nodo').first()/last()/all()/isExecuted, $input,
// $getWorkflowStaticData. Un nodo «non eseguito» si comporta come in n8n: isExecuted false, e
// first() lancia.

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export async function eseguiCodice(codice, { input = [{ json: {} }], nodi = {}, statico = {} } = {}) {
  const $ = (nome) => {
    const voci = nodi[nome];
    if (voci === undefined) {
      return { isExecuted: false, first() { throw new Error(`nodo non eseguito: ${nome}`); }, last() { throw new Error(`nodo non eseguito: ${nome}`); }, all: () => [] };
    }
    return { isExecuted: true, first: () => voci[0], last: () => voci[voci.length - 1], all: () => voci };
  };
  const $input = { first: () => input[0], last: () => input[input.length - 1], all: () => input };
  const fn = new AsyncFunction('$', '$input', '$getWorkflowStaticData', codice);
  return fn($, $input, () => statico);
}
