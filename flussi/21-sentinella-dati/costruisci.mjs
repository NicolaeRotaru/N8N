#!/usr/bin/env node
// 21 · SENTINELLA DEI DATI — gli occhi a costo zero dell'AD, ogni 15 minuti, in n8n.
//
// 25/11/2026 — Il server dell'AD è spento per sempre (Nicola, 24/11): da allora nessuno guardava i
// payout fermi, i carrelli, le consegne in ritardo. Questo flusso fa il lavoro di
// ad-mycity/cervello/sentinella-dati.mjs (gruppo «azioni»), senza IA e senza token:
//   1. legge il database di MyCity SOLO IN LETTURA (ordini, negozi, carrelli, recensioni);
//   2. valuta le sentinelle con le soglie dell'AD;
//   3. se qualcosa è CAMBIATO rispetto al giro prima — una sentinella si accende, cambia numero o
//      rientra — e la MODALITA è «vero», avvisa Nicola su Telegram. Altrimenti sta zitto.
//
// MODALITA «prova» (di serie): calcola e ricorda, ma non manda niente. Si passa a «vero» nel Config
// o costruendo con --vero.
//
// Uso: N8N_API_KEY=… node flussi/21-sentinella-dati/costruisci.mjs [--manda] [--vero] [--marketplace <id>] [--scrivi <path>]

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nodoConfig, letturaSupabase, condizione, nodoTelegram, impostazioni, controllaBase, principaleComune } from '../comune.mjs';

export const NOME_21 = '21 · Sentinella dei dati';
const QUI = dirname(fileURLToPath(import.meta.url));

// Solo le colonne che servono: niente nomi, telefoni o indirizzi dei clienti.
export const LETTURE_21 = [
  ['Leggi gli ordini', 'orders?select=id,user_id,seller_id,payment_status,payment_method,delivery_status,delivery_slot,created_at,delivered_at,canceled_at,payout_at&order=created_at.desc&limit=10000'],
  ['Leggi i negozi', 'profiles?select=id,role,approval_status,approved_at,created_at,store_name&role=eq.seller&limit=10000'],
  // abandoned_carts NON ha la colonna id: chiederla rende la lettura un 400 (il guasto del cervello).
  ['Leggi i carrelli', 'abandoned_carts?select=recovered,recovery_email_sent_at,last_activity&limit=10000'],
  ['Leggi le recensioni dei prodotti', 'reviews?select=rating,created_at&limit=10000'],
  ['Leggi le recensioni dei negozi', 'store_reviews?select=rating,created_at&limit=10000'],
];

export function costruisci({ telegram, chatId, marketplace, errorWorkflow, vero = false } = {}) {
  const pos = (i, riga = 0) => [i * 220, riga * 200];
  const nodi = [];
  const collega = {};
  const vai = (da, ...verso) => { collega[da] = { main: verso.map((v) => (v ? [{ node: v, type: 'main', index: 0 }] : [])) }; };

  nodi.push(
    { id: randomUUID(), name: 'Ogni 15 minuti', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(0, -1),
      parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } } },
    { id: randomUUID(), name: 'Avvia a mano', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0, 1), parameters: {} },
    nodoConfig([
      ['MODALITA', vero ? 'vero' : 'prova'],
      ['SUPABASE_URL', 'https://clmpyfvpvfjgeviworth.supabase.co'],
      ['TELEGRAM_CHAT_ID', chatId || 'DA_IMPOSTARE'],
      // Negozi in attesa concordata con Nicola (non sono churn): «id:AAAA-MM-GG», separati da virgola.
      // Fonte: ad-mycity registro-fatti.json, voce negozi.attesa-concordata. Uguale al 17.
      ['NEGOZI_IN_ATTESA', 'c0b240c0-2a86-4218-9d0f-5154f08ff929:2026-11-30'],
      ['ORE_PAYOUT', 24], ['ORE_CARRELLO', 4], ['ORE_ORDINE_FERMO', 2], ['GIORNI_NEGOZIO_FERMO', 14],
      ['CALO_SOGLIA', 0.7], ['CALO_MEDIA_MINIMA', 3], ['GIORNI_MARKETPLACE_FERMO', '3,7,14,30'],
    ], pos(1)),
  );
  vai('Ogni 15 minuti', 'Config');
  vai('Avvia a mano', 'Config');

  let prima = 'Config';
  let i = 2;
  for (const [nome, percorso] of LETTURE_21) {
    nodi.push(letturaSupabase(nome, percorso, pos(i++), marketplace));
    vai(prima, nome); prima = nome;
  }
  nodi.push({ id: randomUUID(), name: 'Valuta le sentinelle', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(i++),
    parameters: { jsCode: readFileSync(join(QUI, 'codice', 'valuta-sentinelle.js'), 'utf8') } });
  vai(prima, 'Valuta le sentinelle');
  nodi.push({ id: randomUUID(), name: 'Avviso da mandare?', type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos(i++),
    parameters: condizione("={{ $('Valuta le sentinelle').first().json.manda === true }}") });
  vai('Valuta le sentinelle', 'Avviso da mandare?');
  nodi.push(nodoTelegram('Avvisa Nicola', "={{ $('Valuta le sentinelle').first().json.messaggio }}", pos(i++, -1), telegram));
  vai('Avviso da mandare?', 'Avvisa Nicola');
  nodi.push({ id: randomUUID(), name: 'Nota · Leggimi', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -620],
    parameters: { width: 760, height: 360, content: [
      '## 21 · Sentinella dei dati',
      '',
      "**Cosa fa.** Ogni 15 minuti legge il database di MyCity (solo lettura) e guarda payout fermi, consegne oltre lo slot, carrelli da recuperare, recensioni basse, negozi fermi, calo ordini, marketplace fermo. Le soglie sono quelle dell'AD (cervello/sentinella-dati.mjs).",
      '',
      "**Quando scrive.** Solo se qualcosa è cambiato dal giro prima, e solo con MODALITA = vero. In «prova» calcola e ricorda ma non manda niente.",
      '',
      '**Regole.** Nessuna IA, nessuna scrittura sul database. Una tabella che non si legge è «non misurato», mai zero.',
      '',
      '**Generato** da `N8N/flussi/21-sentinella-dati/costruisci.mjs`: le modifiche vanno fatte lì.',
    ].join('\n') } });

  return { name: NOME_21, nodes: nodi, connections: collega, settings: impostazioni(errorWorkflow) };
}

export const controlla = (w) => controllaBase(w);

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principaleComune(process.argv.slice(2), { nome: '21', costruisci, controlla, conMarketplace: true, famiglia: '2x marketplace' })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
