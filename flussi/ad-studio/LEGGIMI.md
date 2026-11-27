# ad-studio/ — i flussi con cui l'AD lavora i contenuti dei clienti

## In parole semplici
Quattro flussi n8n piccoli: tre spenti e uno acceso, quello dei tasti. Servono all'AD (la sessione Claude sul piano Max) per prendere il materiale di un
cliente da Drive, preparare post, storie e reel col motore dell'officina, e rimetterli nel giro normale dell'agenzia:
Drive, Calendario, approvazione su Telegram, pubblicazione col flusso 01.
Nessuno dei tre chiama un'API di IA: il lavoro creativo lo fa l'AD.

Esempio vero, 25/11/2026: con le 13 foto del fotografo di El Tropico Latino l'AD ha fatto 14 contenuti per dicembre.
Sono finiti nel Calendario in stato `da_approvare`, ognuno con la sua anteprima su Telegram e i tasti Approva / Rifiuta.

**I tasti dal 27/11/2026.** Nicola, verso le 03:00: «non mi piace che devo sempre aprire questa pagina per confermare».
Il vecchio tasto era un link: Telegram chiedeva «Apri link» e poi si apriva il browser, per ogni contenuto. Adesso il tasto
resta dentro Telegram. Tocchi «Approva» e la domanda diventa «Approvato: esce sab 28/11 alle 21:30», senza tasti.
In fondo a ogni consegna arriva l'elenco col tasto «Approva tutti».

## Cosa cambia per te
- Carica, Leggi e Proponi non sono accesi e non hanno un indirizzo pubblico: partono solo quando l'AD li avvia a mano.
- «AD · Tasti su Telegram» è acceso: riceve solo i tocchi sui tasti del bot. Conta solo quelli che vengono dalla tua chat.
- Una riga proposta dall'AD non esce mai da sola. Esce solo dopo il tuo «Approva», all'ora scritta nella riga.

## Cosa devi fare
Niente. Se un giorno non servono più, si archiviano da n8n.

## Cosa non ho verificato
- Senza risposta, una riga resta da approvare per sempre: non scade più dopo 96 ore. Chi non viene approvato prima della sua ora non esce.
- Un bot di Telegram ha un solo indirizzo per ricevere i tocchi. Se un giorno un altro flusso usa il Telegram Trigger sullo stesso bot, uno dei due smette di ricevere.
- Il trasporto dei file passa dentro il nodo «Prepara»: n8n tiene per 24 ore le versioni vecchie dei flussi, quindi per un
  giorno quei file restano anche nella cronologia del flusso.

---

## Dettagli tecnici

| Flusso | Generatore | Cosa fa |
|---|---|---|
| AD · Leggi materiale (anteprime) | `leggi-materiale.mjs` | `cartelle` → elenco dei file; `file` → miniatura Drive fino a 3200 px; `interi` → file intero; `url` → un indirizzo https, scaricato **senza** la credenziale Google. Tutto torna in base64 dentro l'esecuzione, e l'AD lo legge con l'API delle esecuzioni. |
| AD · Carica su Drive | `consegna.mjs carica` | `crea_cartella:{nome,dentro}` crea una cartella; `cartella:<id>` carica i file scritti nel nodo «Prepara» (prima riga `const FILE = [...]`). Dopo la corsa la riga torna al segnaposto. |
| AD · Calendario e Meta (a mano) | `calendario-a-mano.sdk.js` (SDK di n8n, caricato via MCP) | `leggi` → le righe di un cliente nel Calendario (anche solo alcuni `ids` e `campi`); `aggiorna` → scrive le colonne date, per `id` (aggiunge la riga se manca); `meta` → una chiamata all'API di Meta, con `pagina` usa il token della pagina. Nato il 26/11/2026 per anticipare a oggi i contenuti di dicembre del Tropico. Dalle 15:00 dello stesso giorno non cancella più niente (regola di Nicola: «non si elimina mai nulla, si archivia»): `DELETE` non è ammesso, per Facebook c'è «nascondi» (`POST <post-id>` con `is_hidden=true`), su Instagram si archivia a mano dall'app. |
| AD · Proponi nel Calendario | `consegna.mjs proponi --foglio … --chat …` | prima rilegge la riga con quell'`id` e si ferma senza toccare niente se è già uscita («riga già pubblicata: usa un id nuovo»: `pubblicato`, `in_pubblicazione`, `link_ig`, `link_fb` o `pubblicato_il` pieni, oppure lasciata a metà dal flusso 01), se compare due volte, o se è `approvato` ed esce entro 10 minuti (o ha l'ora scritta in un formato diverso da `AAAA-MM-GG HH:MM`, che il flusso 01 sa leggere ma il controllo no). Altrimenti scrive o aggiorna la riga (per `id`) sempre in `da_approvare`: una riga già `approvato` torna da approvare (Nicola, 27/11/2026) e la domanda su Telegram lo dice. Le note di prima restano, col vecchio testo di `errore` e la riga «riproposta dall'AD <ora> (era <stato>)». La scritta «SALTA CONTROLLO AI» della versione di prima resta nella storia come `SALTA-CONTROLLO-AI (valeva per la versione di prima)`, che il flusso 01 non legge: la versione nuova salta il controllo AI solo se la scritta la porta la proposta. Poi manda foto o video su Telegram e sotto la domanda coi tasti Approva / Rifiuta (`callback_data` `ok:<id>` / `no:<id>`). Non aspetta. Con `lotto` aggiunge alle note il segno `[lotto <lotto>]`. Con `{riepilogo:{lotto, nome}}` manda invece l'elenco del gruppo ancora da approvare col tasto «Approva tutti» (`tutti:<lotto>`). La colonna `brief` non si tocca. |
| AD · Tasti su Telegram (acceso) | `consegna.mjs tasti --foglio … --chat …` | Telegram Trigger solo su `callback_query`. Conta solo i tocchi della chat di Nicola. Rilegge il Calendario e passa la riga ad `approvato` o `bozza` solo se è ancora `da_approvare`: se il foglio è già cambiato, vince il foglio. Poi risponde al tocco e la domanda diventa la riga di stato, senza tasti. Scrive solo `stato` e `note`, per `id`. |

**Ingresso.** Carica, Leggi e Proponi partono da un nodo Webhook, ma non sono accesi: l'AD li avvia con lo strumento MCP
`execute_workflow` (modalità manual, ingresso webhook col corpo JSON) e legge l'esito con `GET /api/v1/executions/<id>?includeData=true`.

**Segreti.** Qui non c'è nessun ID di foglio, cartella o chat. Per `proponi`, SHEET_ID e TELEGRAM_CHAT_ID si leggono dal Config del flusso 04
al momento di costruirlo. Le credenziali sono quelle già in n8n: «Google Drive - Agenzia», «Google Sheets - Agenzia», «Telegram - Bot agenzia».

```bash
node leggi-materiale.mjs --json > /tmp/w.json     # poi POST/PUT su /api/v1/workflows
node consegna.mjs carica --json > /tmp/c.json
node consegna.mjs proponi --json --foglio <SHEET_ID> --chat <TELEGRAM_CHAT_ID> > /tmp/p.json
node consegna.mjs tasti --json --foglio <SHEET_ID> --chat <TELEGRAM_CHAT_ID> > /tmp/t.json   # poi si accende
```
