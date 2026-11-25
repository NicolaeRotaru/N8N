# ad-studio/ — i flussi con cui l'AD lavora i contenuti dei clienti

## In parole semplici
Tre flussi n8n piccoli e spenti. Servono all'AD (la sessione Claude sul piano Max) per prendere il materiale di un
cliente da Drive, preparare post, storie e reel col motore dell'officina, e rimetterli nel giro normale dell'agenzia:
Drive, Calendario, approvazione su Telegram, pubblicazione col flusso 01.
Nessuno dei tre chiama un'API di IA: il lavoro creativo lo fa l'AD.

Esempio vero, 25/11/2026: con le 13 foto del fotografo di El Tropico Latino l'AD ha fatto 14 contenuti per dicembre.
Sono finiti nel Calendario in stato `da_approvare`, ognuno con la sua anteprima su Telegram e i tasti Approva / Rifiuta.

## Cosa cambia per te
- Nessun flusso è acceso e nessuno ha un indirizzo pubblico: partono solo quando l'AD li avvia a mano.
- Una riga proposta dall'AD non esce mai da sola. Esce solo dopo il tuo «Approva», all'ora scritta nella riga.

## Cosa devi fare
Niente. Se un giorno non servono più, si archiviano da n8n.

## Cosa non ho verificato
- Il caso «nessuna risposta in 96 ore» non l'ho visto succedere: è scritto nel codice, non provato.
- Il trasporto dei file passa dentro il nodo «Prepara»: n8n tiene per 24 ore le versioni vecchie dei flussi, quindi per un
  giorno quei file restano anche nella cronologia del flusso.

---

## Dettagli tecnici

| Flusso | Generatore | Cosa fa |
|---|---|---|
| AD · Leggi materiale (anteprime) | `leggi-materiale.mjs` | `cartelle` → elenco dei file; `file` → miniatura Drive fino a 3200 px; `interi` → file intero; `url` → un indirizzo https, scaricato **senza** la credenziale Google. Tutto torna in base64 dentro l'esecuzione, e l'AD lo legge con l'API delle esecuzioni. |
| AD · Carica su Drive | `consegna.mjs carica` | `crea_cartella:{nome,dentro}` crea una cartella; `cartella:<id>` carica i file scritti nel nodo «Prepara» (prima riga `const FILE = [...]`). Dopo la corsa la riga torna al segnaposto. |
| AD · Proponi nel Calendario | `consegna.mjs proponi --foglio … --chat …` | scrive o aggiorna la riga (per `id`) sempre in `da_approvare`, manda foto o video su Telegram, aspetta Approva / Rifiuta per 96 ore, rilegge la riga e la passa ad `approvato` o `bozza` solo se è ancora `da_approvare`. La colonna `brief` non si tocca. |

**Ingresso.** Tutti e tre partono da un nodo Webhook, ma non sono accesi: l'AD li avvia con lo strumento MCP
`execute_workflow` (modalità manual, ingresso webhook col corpo JSON) e legge l'esito con `GET /api/v1/executions/<id>?includeData=true`.

**Segreti.** Qui non c'è nessun ID di foglio, cartella o chat. Per `proponi`, SHEET_ID e TELEGRAM_CHAT_ID si leggono dal Config del flusso 04
al momento di costruirlo. Le credenziali sono quelle già in n8n: «Google Drive - Agenzia», «Google Sheets - Agenzia», «Telegram - Bot agenzia».

```bash
node leggi-materiale.mjs --json > /tmp/w.json     # poi POST/PUT su /api/v1/workflows
node consegna.mjs carica --json > /tmp/c.json
node consegna.mjs proponi --json --foglio <SHEET_ID> --chat <TELEGRAM_CHAT_ID> > /tmp/p.json
```
