// Le prove del contatore dei nodi verso l'API di Claude a pagamento. Flussi finti, costruiti qui.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conta, aPagamento, chiamati } from '../conta-api-claude.mjs';
import { costruisci } from '../chiedi-all-ad/costruisci.mjs';

const http = (name, url, extra = {}) => ({ name, type: 'n8n-nodes-base.httpRequest', parameters: { method: 'POST', url }, ...extra });
const chiama = (name, id) => ({ name, type: 'n8n-nodes-base.executeWorkflow', parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: id } } });

test('riconosce le chiamate a pagamento e lascia stare la partenza della routine', () => {
  assert.equal(aPagamento(http('a', 'https://api.anthropic.com/v1/messages')), true);
  assert.equal(aPagamento(http('b', '=https://api.anthropic.com/v1/claude_code/routines/{{ $json.id }}/fire')), false);
  assert.equal(aPagamento(http('c', 'https://api.example.com/v1/messages')), false);
  assert.equal(aPagamento({ name: 'd', type: '@n8n/n8n-nodes-langchain.lmChatAnthropic', parameters: {} }), true);
  assert.equal(aPagamento({ name: 'e', type: 'n8n-nodes-base.code', parameters: { jsCode: "fetch('https://api.anthropic.com/v1/messages')" } }), true, 'anche dentro un nodo di codice');
});

test('conta nei flussi accesi e in quelli che chiamano, anche spenti; non nei flussi spenti da soli', () => {
  const flussi = [
    { id: '1', name: 'acceso', active: true, nodes: [chiama('sotto', '2'), http('ok', 'https://example.com')], settings: { errorWorkflow: '3' } },
    { id: '2', name: 'sotto-flusso spento', active: false, nodes: [http('paga', 'https://api.anthropic.com/v1/messages')] },
    { id: '3', name: 'errori', active: false, nodes: [http('spiega', 'https://api.anthropic.com/v1/messages')] },
    { id: '4', name: 'spento da solo', active: false, nodes: [http('paga', 'https://api.anthropic.com/v1/messages')] },
    { id: '5', name: 'acceso ma disattivato', active: true, nodes: [http('paga', 'https://api.anthropic.com/v1/messages', { disabled: true })] },
  ];
  const r = conta(flussi);
  assert.equal(r.totale, 2);
  assert.deepEqual(r.nodi.map((n) => n.flusso).sort(), ['errori', 'sotto-flusso spento']);
  assert.equal(r.disattivati.length, 1);
  assert.ok(!r.raggiunti.includes('spento da solo'));
});

test('segue le catene e non gira in tondo', () => {
  const flussi = [
    { id: 'a', name: 'A', active: true, nodes: [chiama('b', 'b')] },
    { id: 'b', name: 'B', active: false, nodes: [chiama('a', 'a'), chiama('c', 'c')] },
    { id: 'c', name: 'C', active: false, nodes: [http('paga', 'https://api.anthropic.com/v1/messages')] },
  ];
  assert.equal(conta(flussi).totale, 1);
  assert.deepEqual(chiamati({ nodes: [chiama('x', '=expr')] }), [], 'un id calcolato non si può seguire');
});

test('«Chiedi all\'AD» acceso non conta', () => {
  const w = { id: 'z', active: true, ...costruisci({ routine: 'trig_a', chiave: 'c', vero: true }) };
  assert.equal(conta([w]).totale, 0);
});
