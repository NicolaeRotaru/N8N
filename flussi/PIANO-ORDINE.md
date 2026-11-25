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
| 01 e 01b | 50 nodi con lo stesso nome (Instagram e Facebook) | 96 · Pubblica su una coppia: vedi il disegno qui sotto |
| 06, 07, 08, 16 · Montatore | logo da Drive o dal sito, stessi nomi di nodo, parametri diversi | 92 · Logo del cliente (entra: cliente; esce: il file del logo) |
| 06, 07, 08, 11, 16 · Montatore | scarica il provino → Claude lo controlla → esito | 93 · Controllo del provino (entra: provino e regole; esce: ok o motivi) |
| 12, 13, 16 · Nuovo cliente | misura, riduci, tela, metti sulla tela | 94 · Foto sulla tela (entra: foto e misura; esce: foto pronta) |
| 05, 12, 16 · Nuovo cliente | scrivi la riga, rileggila, verifica | 95 · Scrivi la riga e rileggila |
| 01, 01b, 07 | carica su R2 | resta un nodo: è uno solo, un sotto-flusso costerebbe di più |

Il guadagno vero sta nella prima riga: gli altri pezzi tolgono pochi nodi ciascuno, ma tolgono le
differenze fra copie (oggi il logo si scarica in quattro modi diversi).

## Il disegno del pezzo «96 · Pubblica su una coppia» (da costruire)

> Deciso dalla regia il 25/11/2026: lo costruisce **una sessione nuova, col budget pieno, in un colpo solo**.
> È il codice che pubblica davvero ai clienti: lasciarlo a metà è peggio che non toccarlo. Misurato sui flussi
> del 25/11 verso le 17 (01: 100 nodi, 01b: 113).

**Perché.** Il 01 pubblica il contenuto sulla prima coppia di profili del cliente (Instagram + Pagina
Facebook). Il 01b ripubblica lo stesso contenuto sulla seconda coppia, quella della titolare: colonne
`ig_user_id_2`/`fb_page_id_2`, `stato_2`, `link_ig_2`… La parte che parla con Meta è la stessa, copiata: 50 nodi
con lo stesso nome nei due flussi, più 4 che il 01b ha in più. Ma il 01b ha anche cose che il 01 non ha: rilegge
la prenotazione prima di pubblicare, salva il link appena Meta lo dà, e manda ogni errore di Meta a un ramo
suo. **Il pezzo 96 parte dalla versione del 01b, che è la più robusta.**

### Cosa riceve (un elemento, dal flusso che chiama)

```
{
  contenuto: { tipo, didascalia, primo_commento, commento_ig, commento_fb, media_urls[], image_url,
               copertina_url, user_tags, pubblica_ig, pubblica_fb, ig_extra_post, ig_extra_carosello,
               ig_extra_reel, ig_extra_storia, fb_extra_post, percorso_fb },   // oggi: «Contenuto pronto»
  coppia:    { ig_user_id, fb_page_id },          // 01: le colonne normali; 01b: quelle _2
  regole:    { tag_persone, collaboratori, luogo },// 01b: TAG_SECONDA_COPPIA, COLLABORATORI_SECONDA_COPPIA
  riga:      { foglio, scheda, row_number, id,     // per rileggere la prenotazione e salvare i link
               colonne: { stato, esecuzione, link_ig, link_fb },   // 01: stato…; 01b: stato_2…
               prenotazione },                     // il valore di «esecuzione» scritto da chi chiama
  config:    { META_API_VERSIONE, IG_ATTESA_SECONDI, IG_MAX_TENTATIVI, … }   // oggi: $('Config')
}
```

Dentro il pezzo nessun nodo può più leggere `$('Config')`, `$('Contenuto pronto')` o `$('Prepara contenuto')`:
oggi i 54 nodi li leggono in 3 posti diversi. Tutto arriva dal nodo d'ingresso. È il lavoro più minuzioso.

### Cosa restituisce

```
{ ok, instagram: { fatto, link, media_id, avviso }, facebook: { fatto, link, post_id, avviso },
  errore: { fase: 'prima' | 'durante' | 'prenotazione persa', piattaforma, motivo } | null, prova }
```

`fase = 'prima'`: Meta ha detto di no prima di pubblicare, si può riprovare. `fase = 'durante'`: forse è uscito,
non si riprova da soli. **Il testo di Meta non va mai su Telegram**: va in `motivo`, e chi chiama decide cosa
mostrare. Il pezzo non manda messaggi e non segna errori nel Calendario: li fa chi chiama, con le sue colonne.

### I nodi da spostare (54, dal 01b)

- **Instagram (23):** Va su Instagram?, IG tipo di contenuto, IG contenitore foto, IG foto del carosello, IG
  contenitori carosello, IG unisci carosello, IG carosello completo?, IG contenitore carosello, IG contenitore
  reel, IG contenitore storia, IG conta tentativo, IG controlla stato, IG stato?, IG pubblica, IG leggi link, IG
  primo commento?, IG scrivi primo commento, Risultato Instagram, IG elaborazione fallita, IG altri tentativi?,
  IG aspetta, IG riprova, IG tempo scaduto.
- **Facebook (31):** Va su Facebook?, FB token pagina, FB tipo di contenuto, FB pubblica foto, FB foto del
  carosello, FB carica foto carosello, FB unisci foto, FB carosello completo?, FB pubblica post multi-foto, FB
  post id, FB leggi link post, FB primo commento?, FB scrivi primo commento, FB storia carica foto, FB storia
  pubblica foto, FB video avvio, FB video carica, FB video pubblica, FB conta tentativo video, FB controlla
  video, FB valuta stato video, FB stato video?, FB leggi link video, FB video fallito, FB altri tentativi
  video?, FB aspetta video, FB riprova video, FB video tempo scaduto, Risultato Facebook, FB cosa pubblicare,
  FB dopo la pubblicazione.
- **Si portano dentro, parametrizzati con `riga`:** Ricontrolla prima di Instagram, Ancora mia prima di
  Instagram?, Salva link Instagram provvisorio, Salva link Instagram, Ricontrolla prima di Facebook, Ancora mia
  prima di Facebook?, Link Facebook provvisorio, Salva link Facebook provvisorio, Salva link Facebook. Servono:
  senza salvare il link subito, un guasto dopo la pubblicazione porterebbe a pubblicare due volte.
- **Diventano l'uscita del pezzo:** Errore Meta prima di pubblicare, Errore Meta in pubblicazione, e i rami
  che oggi vanno a «Prepara errore» (IG elaborazione fallita, IG tempo scaduto, FB video fallito, FB video
  tempo scaduto).
- **Credenziale:** solo «Meta - System User» (httpHeaderAuth) e quella di Google Sheets per i salvataggi.

### Come diventano il 01 e il 01b

- **01** (resta acceso finché non si fa lo scambio): sceglie la riga, la prenota, prepara il contenuto, fa il
  controllo AI (che resta solo nel 01, passando da «Chiedi all'AD»), poi chiama il 96 con la coppia normale e
  le colonne `stato`, `esecuzione`, `link_ig`, `link_fb`. Con quello che torna scrive la chiusura o l'errore.
- **01b**: stessa scelta di oggi (righe pubblicate col cliente che ha la seconda coppia), stessa prenotazione
  `stato_2`/`esecuzione_2`, poi chiama il 96 con la coppia `_2`, le regole della seconda coppia e le colonne
  `_2`. Niente controllo AI.
- Quando tutti e due funzionano, si valuta se tenerli separati (sono due «scelte» diverse, entrambe corte) o
  farne uno solo che legge le coppie come righe. La regola del piano dice righe, non copie: col 96 la copia
  pesante sparisce comunque.

### Le prove

1. **Prove del codice** (`node --test`): ogni nodo Code del 96 eseguito con `esegui-codice.mjs`, coi casi foto,
   carosello (anche incompleto), reel, storia foto, storia video, e gli errori di Meta.
2. **Prove coi pin su n8n** (`test_workflow` del server MCP: i nodi HTTP e quelli con credenziali sono
   simulati). Per ogni tipo di contenuto: Meta risponde bene; Meta dice di no al contenitore; l'elaborazione
   resta IN_PROGRESS fino al tetto; la pubblicazione fallisce; la prenotazione non è più nostra. Si controlla
   l'uscita del 96 e che i salvataggi sul foglio puntino alle colonne giuste (prima coppia e seconda coppia).
3. **Confronto col vecchio**: gli stessi casi coi pin sul 01 e sul 01b di oggi, e le stesse scritture sul
   foglio, colonna per colonna.

### Lo scambio

Il 96 e i nuovi 01 e 01b nascono **spenti**. Il 01 acceso non si tocca finché la versione nuova non ha fatto
**una corsa vera guardata da qualcuno**, su un cliente di prova o su MyCity. Lo scambio (spegnere il vecchio,
accendere il nuovo) si fa solo **dopo aver chiesto alla regia**. Il vecchio non si cancella: si archivia, così
si torna indietro in un minuto.

## L'ordine dei passi

1. **Repository privato** (Nicola). Poi `node flussi/copia-di-sicurezza.mjs <cartella nel repository privato>`
   e `--verifica`. La prova della copia è già girata il 25/11: 47 flussi, 12 credenziali, 0 problemi.
2. Archiviare i tre flussi in più: fatto il 25/11 (il «PROVA · padre» l'ha cancellato la sessione B).
3. Cancellare i 19 archiviati: irreversibile, quindi con la conferma di Nicola in una riga.
4. Snellire 06, 07 e 16 · Montatore. 06 e 07 caricati spenti il 25/11; prima di riaccenderli un giro vero guardato.
   Il 16 · Montatore è della sessione «Montatore video autonomo AI»: lo snellisce e lo chiama 31 lei, sulla sua
   versione, quando ha finito il collegamento a «Chiedi all'AD» (in `nomi.mjs` c'è già `NOMI.montatore`).
5. I pezzi 91-95, uno per volta: prima il pezzo spento con le sue prove, poi un flusso che lo usa in prova,
   **Fatti il 25/11, spenti:** 92 · Logo del cliente e 94 · Foto sulla tela (`pezzi/costruisci.mjs`). Il 92 è provato su
   n8n coi download simulati (ramo «nessun logo» e ramo Drive con errore); il download vero e il 94 non ancora.
   Il 93 (controllo del provino) aspetta la sessione B: il controllo passa da «Chiedi all'AD». Il 91 aspetta lo stesso.
   poi vero.
6. La numerazione nuova: **fatta il 25/11 per tutti i flussi vivi, tranne «16 · Montatore»** (diventerà
   31 · Montatore, che fa la sua sessione). I nomi che i programmi cercano stanno in `nomi.mjs`:
   `trovaFlusso` trova anche il nome di prima. Per rinominare un flusso con dati salvati dentro (staticData),
   si usa l'operazione «setWorkflowMetadata» del server MCP di n8n: cambia solo il nome. Controllato: staticData,
   nodi, acceso/spento ed etichette restano identici.
7. Tutti gli errori al 99: fatto il 25/11 per tutti i flussi vivi.

## Da sapere

- **08 Post dalle foto ha una credenziale finta** («Placid - API», segnaposto) nei due nodi Placid. In n8n
  non esiste una credenziale Placid vera, quindi non si può sistemare. Quei nodi partono solo col motore
  grafico «pro»; oggi è «gratis», quindi dormono. Anche 06 ha segnaposto per Placid e Creatomate, e 02 ne
  ha cinque (Meta, Google Sheets, Anthropic, Telegram).
