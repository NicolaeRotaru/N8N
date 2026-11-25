// Le prove dei pezzi riusabili 92 · Logo del cliente e 94 · Foto sulla tela.
// Si lancia con: node --test flussi/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCodice } from './esegui-codice.mjs';
import { codice, costruisci92, costruisci94, controlla, NOME_92, NOME_94 } from '../pezzi/costruisci.mjs';

const origine = async (json) => (await eseguiCodice(codice('logo-origine.js'), { input: [{ json }] }))[0].json;
const esito = async (piano, voce) => (await eseguiCodice(codice('logo-esito.js'), { input: [voce], nodi: { 'Da dove arriva il logo': [{ json: piano }] } }))[0];
const immagine = { data: 'aGVsbG8=', mimeType: 'image/png', fileName: 'logo.png' };

test('92: un id di Drive, un link di Drive o un indirizzo https', async () => {
  assert.equal((await origine({ drive_id: '1AbCdEfGhIjKlMn' })).origine, 'drive');
  const link = await origine({ drive_id: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing' });
  assert.deepEqual([link.origine, link.drive_id], ['drive', '1AbCdEfGhIjKlMnOp']);
  const sito = await origine({ url: 'https://esempio.it/logo.png' });
  assert.deepEqual([sito.origine, sito.url], ['url', 'https://esempio.it/logo.png']);
  assert.equal((await origine({ logo_drive_id: '1AbCdEfGhIjKlMn', logo_url: 'https://x.it/l.png' })).origine, 'drive', 'Drive vince sull indirizzo');
});

test('92: niente logo, o un indirizzo non https, porta a «nessuno» col motivo', async () => {
  assert.equal((await origine({})).origine, 'nessuno');
  const http = await origine({ url: 'http://esempio.it/logo.png' });
  assert.deepEqual([http.origine, http.url_scartato], ['nessuno', 'http://esempio.it/logo.png']);
  assert.equal((await origine({ campo: 'logo; drop' })).campo, 'logo', 'un campo strano torna «logo»');
  assert.equal((await origine({ campo: 'marchio' })).campo, 'marchio');
});

test('92: il logo scaricato esce nel campo scelto', async () => {
  const r = await esito({ origine: 'url', campo: 'logo' }, { json: {}, binary: { data: immagine } });
  assert.deepEqual(r.json, { ha_logo: true, origine: 'url', errore: '' });
  assert.deepEqual(r.binary, { logo: immagine });
});

test('92: un errore di download, un file non immagine o niente logo non fermano chi chiama', async () => {
  const errore = await esito({ origine: 'drive', campo: 'logo' }, { json: { error: { message: 'File not found' } } });
  assert.equal(errore.json.ha_logo, false);
  assert.match(errore.json.errore, /Drive: File not found/);
  const html = await esito({ origine: 'url', campo: 'logo' }, { json: {}, binary: { data: { ...immagine, mimeType: 'text/html' } } });
  assert.equal(html.json.ha_logo, false);
  assert.match(html.json.errore, /non è un'immagine/);
  assert.equal(html.binary, undefined);
  const niente = await esito({ origine: 'nessuno', campo: 'logo', url_scartato: '' }, { json: {} });
  assert.match(niente.json.errore, /non c'è un logo/);
});

const piano = async (dati, misura) => (await eseguiCodice(codice('tela-piano.js'), { input: [{ json: misura, binary: { data: immagine } }], nodi: { 'Da un altro flusso': [{ json: dati }] } }))[0];

test('94: senza tela la tela è grande quanto la foto, sfondo bianco', async () => {
  const r = await piano({}, { size: { width: 1200, height: 800 } });
  assert.deepEqual(r.json, { tela_w: 1200, tela_h: 800, x: 0, y: 0, colore: '#ffffff', qualita: 85, nome_file: 'foto.jpg' });
  assert.deepEqual(r.binary, { data: immagine }, 'la foto passa avanti');
});

test('94: con la tela la foto va al centro', async () => {
  const r = await piano({ tela_w: 1080, tela_h: 1350, colore: '#F5EFE6', qualita: 90, nome_file: 'pane.jpg' }, { size: { width: 1080, height: 720 } });
  assert.deepEqual(r.json, { tela_w: 1080, tela_h: 1350, x: 0, y: 315, colore: '#F5EFE6', qualita: 90, nome_file: 'pane.jpg' });
});

test('94: una tela più piccola della foto si allarga, un colore strano torna bianco', async () => {
  const r = await piano({ tela_w: 500, tela_h: 500, colore: 'red', qualita: 500 }, { size: { width: 800, height: 600 } });
  assert.deepEqual([r.json.tela_w, r.json.tela_h, r.json.x, r.json.y, r.json.colore, r.json.qualita], [800, 600, 0, 0, '#ffffff', 100]);
});

test('94: esce solo la foto pronta', async () => {
  const [r] = await eseguiCodice(codice('tela-esito.js'), { input: [{ json: {}, binary: { data: immagine, tela: immagine } }],
    nodi: { 'Piano della tela': [{ json: { tela_w: 10, tela_h: 20, nome_file: 'a.jpg' } }] } });
  assert.deepEqual(r, { json: { tela_w: 10, tela_h: 20, nome_file: 'a.jpg' }, binary: { data: immagine } });
});

test('i due pezzi sono fatti bene e senza segnaposto quando si mandano', () => {
  const w92 = costruisci92({ drive: { id: 'X', name: 'Google Drive - Agenzia' }, errori: 'E' });
  const w94 = costruisci94({ errori: 'E' });
  assert.equal(w92.name, NOME_92);
  assert.equal(w94.name, NOME_94);
  assert.deepEqual(controlla(w92, { conCredenziali: true }), []);
  assert.deepEqual(controlla(w94, { conCredenziali: true }), []);
  assert.match(controlla(costruisci92(), { conCredenziali: true }).join(), /segnaposto/);
  assert.equal(w92.connections['Drive o internet?'].main.length, 3, 'drive, internet e nessuno');
  assert.equal(w92.nodes.find((n) => n.name === 'Scarica da Drive').onError, 'continueRegularOutput');
});
