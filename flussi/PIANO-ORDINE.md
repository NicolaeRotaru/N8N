# Il piano per mettere in ordine n8n

> Scritto il 2026-11-25 dalla sessione «ordine di n8n». Qui ci sono solo i nomi dei flussi: gli ID e i
> JSON stanno nella copia di sicurezza, che va in un repository **privato** (questo è pubblico).

## Il punto adesso

- **Su n8n ci sono 47 flussi**: 28 vivi e 19 archiviati (misurato il 25/11 verso le 13).
- **17 · Analisi del marketplace manda gli errori al 99** (fatto il 25/11): era spento e di nessun altra sessione.
- **Ogni flusso vivo ha l'etichetta della sua famiglia.** Più «da archiviare» sui tre che vanno tolti.
- **Il peso grosso è un blocco di codice copiato.** In 06, 07 e 16 · Montatore lo stesso blocco di aiuti
  sta in 144 nodi. `snellisci-aiuti.mjs` lo taglia: 2,6 milioni di caratteri diventano 1,2 (−53%).
- **Non si è ancora cancellato né sostituito niente.** Prima serve la copia in un repository privato.

## Le famiglie e i numeri nuovi

La regola: 0x social dei clienti, 1x clienti e materiali, 2x marketplace MyCity, 3x video, 9x sistema.
Un numero per flusso. MyCity e i negozi sono righe della scheda Clienti, non copie del flusso.

| Oggi | Domani | Cosa cambia |
|---|---|---|
| 00 · Attiva cliente | 10 · Attiva cliente | passa ai clienti: è l'ingresso di un cliente |
| 01 · Pubblica contenuti | 01 · Pubblica contenuti | assorbe il 01b |
| 01b · Pubblica sulla seconda coppia | — | la seconda coppia di profili diventa una riga |
| 02 · Gestione commenti | 02 · Gestione commenti | |
| 03 · Piano del mese (potenziato) | 03 · Piano del mese | via «(potenziato)»: il doppione è archiviato |
| 04 · Scrivi i testi (AI) | 04 · Scrivi i testi | |
| 05 · Nuovo contenuto (modulo) | 05 · Nuovo contenuto | |
| 06 Storie del giorno | 06 · Storie del giorno | |
| 15 · Approva le storie | 07 · Approva le storie | accanto alle storie, di cui è l'ultimo passo |
| 08 Post dalle foto | 08 · Post dalle foto | |
| 09 · Impara dai numeri | 09 · Impara dai numeri | |
| 10 · Revisore | 00 · Revisore | il posto lasciato dall'Attiva cliente |
| 12 · Nuovo cliente (automatico) | 11 · Nuovo cliente | il nome lo cercano 4 generatori |
| 13 · Foto pronte | 12 · Foto pronte | |
| 14 · Smista materiale | 13 · Smista materiale | |
| MyCity · 11 Foto prodotto | 14 · Foto prodotto | l'ultima copia: diventa riga, poi si archivia |
| Prepara foglio (una tantum) | — | si archivia |
| 20 · Iscrivi il cliente in MyCity | 20 · Iscrivi il cliente in MyCity | |
| 16 · Nuovo cliente da MyCity | 26 · Nuovo cliente da MyCity | lo genera `16-nuovo-cliente-da-mycity/genera.mjs` |
| 17 · Analisi del marketplace | 27 · Analisi del marketplace | la sessione D ci aggiunge la riga di salute di n8n |
| 18 · Analisi di un'attività | 28 · Analisi di un'attività | |
| 19 · Consegna la scheda scritta dall'AD | 29 · Consegna la scheda scritta dall'AD | |
| 19 · Bozze dei 3 abbonamenti | 15 · Bozze dei 3 abbonamenti | passa ai clienti: sono le proposte da mandare al cliente |
| 07 Reel dalle clip | 30 · Reel dalle clip | |
| 16 · Montatore | 31 · Montatore | |
| Chiedi all'AD | 90 · Chiedi all'AD | |
| 99 · Avvisi errori | 99 · Avvisi errori | |
| PROVA · padre di Chiedi all'AD | — | si archivia |

**I numeri già presi dalla sessione D** (25/11): 21 · Sentinella dei dati, 22 · Sito che risponde, 23 · Mani del
Pannello, 24 · Radar del web, 25 · Numeri del mattino e della sera, 98 · Salute di n8n. I pezzi riusabili
prendono 91-95; restano liberi 96 e 97.

**Prima di rinominare.** Dentro n8n i flussi si chiamano per ID, quindi il nome si può cambiare. Fuori, i
generatori cercano per nome esatto: `16-…/genera.mjs` (12, 16, 18), `17-…`, `18-…` e `19-…/costruisci.mjs`
(12, 19), e `chiedi-all-ad/costruisci.mjs` della sessione B cerca «99 · Avvisi errori» (resta uguale) e il nome
di «Chiedi all'AD». Si rinomina insieme al generatore e alle sue prove (`node --test flussi/test/*.test.mjs`),
avvisando la sessione padrona del flusso.

## I pezzi che si ripetono

Misurato col confronto dei nodi (stesso tipo, stessi parametri):

| Dove | Quanto si ripete | Cosa diventa |
|---|---|---|
| 06, 07, 16 · Montatore | un blocco di aiuti in 144 nodi Code, 1,7 milioni di caratteri | `snellisci-aiuti.mjs`: ogni nodo tiene solo gli aiuti suoi |
| 12 e 16 · Nuovo cliente da MyCity | 51 nodi identici: il 16 è una copia generata del 12 | 91 · Prepara la scheda cliente, chiamato da tutti e due |
| 01 e 01b | 26 nodi identici | il 01 legge le coppie di profili dalle righe; il 01b si archivia |
| 06, 07, 08, 16 · Montatore | logo da Drive o dal sito, stessi nomi di nodo, parametri diversi | 92 · Logo del cliente (entra: cliente; esce: il file del logo) |
| 06, 07, 08, 11, 16 · Montatore | scarica il provino → Claude lo controlla → esito | 93 · Controllo del provino (entra: provino e regole; esce: ok o motivi) |
| 12, 13, 16 · Nuovo cliente | misura, riduci, tela, metti sulla tela | 94 · Foto sulla tela (entra: foto e misura; esce: foto pronta) |
| 05, 12, 16 · Nuovo cliente | scrivi la riga, rileggila, verifica | 95 · Scrivi la riga e rileggila |
| 01, 01b, 07 | carica su R2 | resta un nodo: è uno solo, un sotto-flusso costerebbe di più |

Il guadagno vero sta nella prima riga: gli altri pezzi tolgono pochi nodi ciascuno, ma tolgono le
differenze fra copie (oggi il logo si scarica in quattro modi diversi).

## L'ordine dei passi

1. **Repository privato** (Nicola). Poi `node flussi/copia-di-sicurezza.mjs <cartella nel repository privato>`
   e `--verifica`. La prova della copia è già girata il 25/11: 47 flussi, 12 credenziali, 0 problemi.
2. Archiviare i tre flussi in più: fatto il 25/11 (il «PROVA · padre» l'ha cancellato la sessione B).
3. Cancellare i 19 archiviati: irreversibile, quindi con la conferma di Nicola in una riga.
4. Snellire 06, 07 e 16 · Montatore. 06 e 07 caricati spenti il 25/11; prima di riaccenderli un giro vero guardato.
   Il 16 · Montatore aspetta: il 25/11 qualcuno ci stava lavorando.
5. I pezzi 91-95, uno per volta: prima il pezzo spento con le sue prove, poi un flusso che lo usa in prova,
   poi vero.
6. La numerazione nuova, flusso per flusso, insieme ai generatori. **Fatti il 25/11** i nove che nessun programma
   cerca per nome: 00, 03, 04, 05, 06, 07, 08, 10, 30. I nomi cercati dai programmi stanno in `nomi.mjs`, che trova
   anche il nome vecchio. **Dopo l'unione di questa PR** si rinominano 11, 15, 26, 27, 28, 29 e 90, e poi 12 e 13
   (che oggi pesterebbero il numero del 12 e del 13 vecchi) e 31 · Montatore, quando nessuno ci lavora.
7. Tutti gli errori al 99: fatto il 25/11 per tutti i flussi vivi.

## Da sapere

- **08 Post dalle foto ha una credenziale finta** («Placid - API», segnaposto) nei due nodi Placid. In n8n
  non esiste una credenziale Placid vera, quindi non si può sistemare. Quei nodi partono solo col motore
  grafico «pro»; oggi è «gratis», quindi dormono. Anche 06 ha segnaposto per Placid e Creatomate, e 02 ne
  ha cinque (Meta, Google Sheets, Anthropic, Telegram).
